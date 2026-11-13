#!/usr/bin/env node
// Builds a scene's radio cut: every voice line and sound of the scene laid on
// one timeline by a plan, mixed and levelled with ffmpeg. The plan is a YAML code block under the heading
// "Radio cut plan" on the scene's row page in Notion (the Scenes database); the voices and
// sounds are the files in the row's Voice files and Scene SFX audio, and a motif comes from its Asset
// Library row. Nothing is generated and nothing is spent.
//
//   node scripts/radio.js --scene 1            build out/radio/scene-01/S01-radio-cut.mp3 and its cue list
//   node scripts/radio.js --scene 1 --print    the plan as read from Notion, with every cue's time (no audio)
//   node scripts/radio.js --scene 1 --plan p.yaml   use a local plan instead of Notion's (to try a change)
//
// Then listen, and upload with: node scripts/upload.js --scene 1 radio-cut
// The format of the plans is described in README.md → The radio cut plan.
import dotenv from "dotenv";
import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";
import YAML from "yaml";
import { loadConfig, fromRoot } from "../lib/project.js";
import { makeNotion, downloadFile } from "../lib/notion.js";
import { checkFfmpeg } from "../lib/audio.js";

dotenv.config({ path: fromRoot(".env"), quiet: true });

const SR = 44100;
const FFMPEG = process.env.FFMPEG_PATH || "ffmpeg";
const { values: opts } = parseArgs({
  options: {
    scene: { type: "string" },
    print: { type: "boolean", default: false },
    plan: { type: "string" },
  },
});
function fail(msg) {
  console.error(msg);
  process.exit(1);
}
const sceneNo = Number(opts.scene);
if (!Number.isInteger(sceneNo) || sceneNo < 1) fail("Usage: node scripts/radio.js --scene 1 [--print] [--plan file.yaml]");
const NN = String(sceneNo).padStart(2, "0");

const config = loadConfig();
const sf = config.notion.scene_fields;
const notion = makeNotion(config);
const scene = await notion.sceneByNumber(sceneNo);
const plan = opts.plan ? YAML.parse(readFileSync(opts.plan, "utf8")) : await notion.pagePlan(scene.notion.id, "Radio cut plan");
if (!plan) fail(`Scene ${sceneNo} has no "Radio cut plan" heading on its row page in Notion.`);

// A cue's id: its own, or its file's name without the scene and "sfx-" ("S01-sfx-door-bang" → door-bang).
const idOf = (c, i) => c.id ?? (c.file ? c.file.replace(/^S\d+-(sfx-)?/i, "") : c.asset ? String(c.asset).toLowerCase().replace(/\s+/g, "-") : `mark-${i + 1}`);

if (!Array.isArray(plan.cues) || !plan.cues.length) fail("The plan has no cues.");

// ---------- Times: a cue starts at a number of seconds, or relative to another cue ("priya-9.start + 2.7").
const cues = plan.cues.map((c, i) => {
  const tpl = c.use ? plan.templates?.[c.use] : {};
  if (c.use && !tpl) fail(`cue ${i + 1}: no template "${c.use}"`);
  const cue = { ...tpl, ...c };
  cue.id = idOf(cue, i);
  return cue;
});
const byId = new Map(cues.map((c) => [c.id, c]));
const durations = new Map(); // cue id → seconds, filled once the audio is read
function timeOf(expr, where) {
  if (typeof expr === "number") return expr;
  const m = String(expr).match(/^\s*([\w-]+)\.(start|end)\s*(?:([+-])\s*([\d.]+))?\s*$/);
  if (!m) {
    const n = Number(expr);
    if (Number.isFinite(n)) return n;
    fail(`${where}: can't read the time "${expr}" (write seconds, or <cue>.start/.end ± seconds)`);
  }
  const ref = byId.get(m[1]);
  if (!ref) fail(`${where}: no cue "${m[1]}"`);
  let t = startOf(ref);
  if (m[2] === "end") {
    if (!durations.has(ref.id)) fail(`${where}: "${m[1]}" has no file, so it has no end`);
    t += durations.get(ref.id);
  }
  const d = m[4] ? Number(m[4]) : 0;
  return m[3] === "-" ? t - d : t + d;
}
const starting = new Set();
function startOf(cue) {
  if (cue._t !== undefined) return cue._t;
  if (starting.has(cue.id)) fail(`cue "${cue.id}": its time refers back to itself`);
  starting.add(cue.id);
  cue._t = timeOf(cue.at, `cue "${cue.id}"`);
  return cue._t;
}

// ---------- Audio helpers
const db = (x) => 10 ** (x / 20);
function decode(path, filter, loopSeconds) {
  const args = ["-v", "error"];
  if (loopSeconds) args.push("-stream_loop", "-1");
  args.push("-i", path);
  if (loopSeconds) args.push("-t", String(loopSeconds));
  if (filter) args.push("-af", filter);
  args.push("-ac", "2", "-ar", String(SR), "-f", "f32le", "-");
  const buf = execFileSync(FFMPEG, args, { maxBuffer: 1 << 30 });
  return new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4).slice();
}
function peak(x) {
  let p = 0;
  for (let i = 0; i < x.length; i++) p = Math.max(p, Math.abs(x[i]));
  return p;
}
// The loudness of the parts that sound (frames within 30 dB of the loudest), so pauses don't count.
function rmsActive(x) {
  const h = Math.round(SR * 0.05);
  const frames = [];
  for (let s = 0; s + h <= x.length / 2; s += h) {
    let sum = 0;
    for (let i = s; i < s + h; i++) { const m = (Math.abs(x[2 * i]) + Math.abs(x[2 * i + 1])) / 2; sum += m * m; }
    frames.push(Math.sqrt(sum / h));
  }
  if (!frames.length) return 0;
  const thr = Math.max(...frames) * db(-30);
  const act = frames.filter((f) => f > thr);
  return Math.sqrt(act.reduce((a, f) => a + f * f, 0) / act.length);
}
function points(spec) {
  return String(spec).trim().split(/\s+/).map((p) => { const [t, g] = p.split(":").map(Number); return [t, g]; });
}
function applyGain(x, spec) {
  const pts = points(spec);
  const n = x.length / 2;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    let g;
    if (t <= pts[0][0]) g = pts[0][1];
    else if (t >= pts[pts.length - 1][0]) g = pts[pts.length - 1][1];
    else {
      let k = 0;
      while (pts[k + 1][0] < t) k++;
      const [t0, g0] = pts[k], [t1, g1] = pts[k + 1];
      const a = g0 <= -90 ? 0 : db(g0), b = g1 <= -90 ? 0 : db(g1);
      x[2 * i] *= a + (b - a) * ((t - t0) / (t1 - t0));
      x[2 * i + 1] *= a + (b - a) * ((t - t0) / (t1 - t0));
      continue;
    }
    const a = g <= -90 ? 0 : db(g);
    x[2 * i] *= a; x[2 * i + 1] *= a;
  }
}
function fades(x, fin, fout) {
  const n = x.length / 2;
  const kin = Math.min(n, Math.round(fin * SR)), kout = Math.min(n, Math.round(fout * SR));
  for (let i = 0; i < kin; i++) { x[2 * i] *= i / kin; x[2 * i + 1] *= i / kin; }
  for (let i = 0; i < kout; i++) { const a = 1 - i / kout; const j = n - 1 - (kout - 1 - i); x[2 * j] *= a; x[2 * j + 1] *= a; }
}

// ---------- Files: the voices and sounds on the scene's row, a motif from its Asset Library row
checkFfmpeg();
const onRow = [...(await notion.filesOn(scene.notion.id, sf.voice_files)), ...(await notion.filesOn(scene.notion.id, sf.sfx_files))];
const stem = (n) => n.replace(/\.[^.]+$/, "").toLowerCase();
const AUDIO = /\.(mp3|wav|m4a|aac|flac|ogg)$/i;
async function localFile(cue) {
  if (cue.asset) {
    const list = (await notion.assetFiles(cue.asset)).filter((x) => AUDIO.test(x.name));
    const f = cue.file ? list.find((x) => stem(x.name) === stem(cue.file)) : list[0];
    if (!f) fail(`"${cue.asset}" in the Asset Library has no ${cue.file ? `file "${cue.file}"` : "audio file"} in its ${config.notion.asset_fields.sheet}.`);
    return downloadFile(f);
  }
  const f = onRow.find((x) => stem(x.name) === stem(cue.file));
  if (!f) fail(`"${cue.file}" is not in the scene's ${sf.voice_files} or ${sf.sfx_files} in Notion.`);
  return downloadFile(f);
}

// ---------- Read every cue's audio, in an order where each cue's reference is known first
const audio = new Map();
const warnings = [];
for (const cue of cues) {
  if (!cue.file && !cue.asset) continue;
  const presets = plan.filters ?? {};
  const filter = cue.filter ? presets[cue.filter] ?? cue.filter : null;
  let x = decode(await localFile(cue), filter, cue.loop);
  if (cue.trim) x = x.slice(Math.round(cue.trim[0] * SR) * 2, Math.round(cue.trim[1] * SR) * 2);
  if (cue.level) {
    const [mode, target] = String(cue.level).split(/\s+/);
    const ref = mode === "peak" ? peak(x) : rmsActive(x);
    if (peak(x) < db(-60)) warnings.push(`"${cue.file}" is silent (below -60 dB), so it is left out`);
    else x = x.map((v) => v * (db(Number(target)) / ref));
    if (peak(x) < db(-60)) x = new Float32Array(0);
  }
  if (cue.gain !== undefined) applyGain(x, typeof cue.gain === "number" ? `0:${cue.gain}` : cue.gain);
  const [fin, fout] = cue.fade ?? plan.fade ?? [0.005, 0.05];
  fades(x, fin, fout);
  audio.set(cue.id, x);
  durations.set(cue.id, x.length / 2 / SR || 0);
}
for (const cue of cues) startOf(cue);
const length = timeOf(plan.length, "length");

// ---------- Print
const clock = (t) => `${Math.floor(t / 60)}:${(t % 60).toFixed(2).padStart(5, "0")}`;
const list = cues.map((c) => ({ t: +c._t.toFixed(2), end: +(c._t + (durations.get(c.id) ?? 0)).toFixed(2), lane: c.lane ?? "", what: c.what ?? c.mark ?? c.id }))
  .sort((a, b) => a.t - b.t);
if (opts.print) {
  console.log(`Scene ${sceneNo}, ${scene.title}: radio cut ${clock(length)}`);
  for (const c of list) console.log(`  ${clock(c.t)}–${clock(c.end)}  ${c.lane.padEnd(18)} ${c.what}`);
  for (const w of warnings) console.log(`  ! ${w}`);
  process.exit(0);
}

// ---------- Mix, master and write
const mix = new Float32Array(Math.round(length * SR) * 2);
for (const cue of cues) {
  const x = audio.get(cue.id);
  if (!x || !x.length) continue;
  const s = Math.round(cue._t * SR) * 2;
  for (let i = 0; i < x.length && s + i < mix.length; i++) if (s + i >= 0) mix[s + i] += x[i];
}
fades(mix, 0, plan.fade_out ?? 0);
const pk = peak(mix);
if (pk > 0.89) for (let i = 0; i < mix.length; i++) mix[i] *= 0.89 / pk;

const folder = `out/radio/scene-${NN}`;
const name = `S${NN}-radio-cut`;
const dir = fromRoot(folder);
mkdirSync(dir, { recursive: true });
const work = join(tmpdir(), `radio-${process.pid}`);
mkdirSync(work, { recursive: true });
const raw = join(work, "raw.wav");
execFileSync(FFMPEG, ["-y", "-v", "error", "-f", "f32le", "-ac", "2", "-ar", String(SR), "-i", "-", raw], { input: Buffer.from(mix.buffer) });
const report = spawnSync(FFMPEG, ["-hide_banner", "-nostats", "-i", raw, "-af", "ebur128", "-f", "null", "-"], { encoding: "utf8" }).stderr ?? "";
const measured = [...report.matchAll(/I:\s+(-?[\d.]+) LUFS/g)].pop();
const target = plan.loudness ?? -16;
const gain = measured ? target - Number(measured[1]) : 0;
const out = `${dir}/${name}.mp3`;
execFileSync(FFMPEG, ["-y", "-v", "error", "-i", raw, "-af", `volume=${gain.toFixed(2)}dB,alimiter=limit=0.84:attack=5:release=50:level=false`,
  "-ar", String(SR), "-c:a", "libmp3lame", "-b:a", "192k", out]);
rmSync(work, { recursive: true, force: true });
writeFileSync(`${dir}/${name}-cues.json`, JSON.stringify({ scene: sceneNo, length: +length.toFixed(2), cues: list }, null, 1));
console.log(`Radio cut: ${folder}/${name}.mp3 (${clock(length)}), cue list beside it.`);
for (const w of warnings) console.log(`! ${w}`);
console.log(`Listen, then upload: node scripts/upload.js --scene ${sceneNo} radio-cut`);
