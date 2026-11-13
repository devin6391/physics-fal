#!/usr/bin/env node
// Assembles a scene: each shot's approved clip (or held still) on its time, cut and dissolved as the scene's
// Edit plan says, with one grade over the whole scene and the current radio cut as its sound. The
// clips' own sound is never used. The plan is a YAML code block under the heading "Edit plan" on the scene's
// row page in Notion (the Scenes database); the pictures come from each shot's row in the Shots database.
//
//   node scripts/assemble.js --scene 1                 build out/assembled/scene-01/S01-assembled.mp4
//   node scripts/assemble.js --scene 1 --print         every cut, with the picture it will use (no video)
//   node scripts/assemble.js --scene 1 --plan p.yaml   use a local plan instead of Notion's
//   node scripts/assemble.js --scene 1 --frame CO-07   save the frame where CO-07 is cut, to start the next
//                                                      shot from (out/frames/CO-07-cut.png)
//
// Then watch, and upload with: node scripts/upload.js --scene 1 assembled
// The format of the plan is described in README.md → The edit plan.
import dotenv from "dotenv";
import { readFileSync, mkdirSync, existsSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, relative, isAbsolute, extname } from "node:path";
import { parseArgs } from "node:util";
import YAML from "yaml";
import { loadConfig, fromRoot } from "../lib/project.js";
import { makeNotion, downloadFile } from "../lib/notion.js";
import { checkFfmpeg } from "../lib/audio.js";
import { FFMPEG, segment, join as joinSegments, lengthOf, clock, timeline } from "../lib/video.js";

dotenv.config({ path: fromRoot(".env"), quiet: true });

const { values: opts } = parseArgs({
  options: {
    scene: { type: "string" },
    print: { type: "boolean", default: false },
    plan: { type: "string" },
    frame: { type: "string" },
    review: { type: "boolean", default: false },
    heading: { type: "string", default: "Edit plan" },
  },
});
function fail(msg) {
  console.error(msg);
  process.exit(1);
}
const sceneNo = Number(opts.scene);
if (!Number.isInteger(sceneNo) || sceneNo < 1) fail("Usage: node scripts/assemble.js --scene 1 [--print] [--plan file.yaml] [--frame CO-07]");
const NN = String(sceneNo).padStart(2, "0");

const config = loadConfig();
const sf = config.notion.scene_fields;
const notion = makeNotion(config);
const scene = await notion.sceneByNumber(sceneNo);
const plan = opts.plan ? YAML.parse(readFileSync(opts.plan, "utf8")) : await notion.pagePlan(scene.notion.id, opts.heading);
if (!plan) fail(`Scene ${sceneNo} has no "${opts.heading}" heading on its row page in Notion.`);
if (!Array.isArray(plan.shots) || !plan.shots.length) fail("The plan has no shots.");
if (plan.review && !opts.review) fail("This is a review-only edit plan; use --review. It does not select or approve its candidate clips.");
if (plan.shots.some((c) => c.candidate) && !opts.review) fail("Candidate clips require --review.");

const [W, H] = String(plan.size ?? "1280x720").split("x").map(Number);
const FPS = plan.fps ?? 24;
const HANDLE = config.clip_handles ?? 0;
const stem = (n) => n.replace(/\.[^.]+$/, "").toLowerCase();

// ---------- The sound: the scene's current radio cut
checkFfmpeg();
const soundField = sf.radio_cut;
const sounds = (await notion.filesOn(scene.notion.id, soundField)).filter((x) => /\.(wav|mp3|m4a|aac|flac)$/i.test(x.name));
if (sounds.length !== 1) fail(`Select exactly one current radio cut in the scene's ${soundField} field in Notion (found ${sounds.length}).`);
const audio = await downloadFile(sounds[0]);
const end = plan.end === undefined || plan.end === "audio" ? lengthOf(audio) : Number(plan.end);
const cuts = timeline(plan.shots, end, fail);

// ---------- The picture for each cut. A shot uses its Final shot (already trimmed), else its Generated clip
// (from its handle in), else its Start frame held as a still. "still: true" holds the Start frame even when a
// clip exists. A cut with only "panel" (or a shot with nothing yet and a panel named) holds the storyboard panel.
const panels = await notion.filesOn(scene.notion.id, sf.storyboard);
const media = new Map();
for (const c of cuts) {
  if (c.shot && !media.has(c.shot)) media.set(c.shot, await notion.shotMedia(c.shot));
  const m = c.shot ? media.get(c.shot) : null;
  const panel = c.panel ? panels.find((x) => stem(x.name) === stem(c.panel)) : null;
  if (c.panel && !panel) fail(`panel ${c.panel} is not in the scene's ${sf.storyboard} in Notion.`);
  if (c.candidate) {
    const local = fromRoot(c.candidate);
    const rel = relative(fromRoot("out"), local);
    if (rel.startsWith("..") || isAbsolute(rel) || !/\.(mp4|mov|webm)$/i.test(extname(local)) || !existsSync(local)) fail(`Invalid review candidate: ${c.candidate}. Use an existing video under out/.`);
    c.src = { local, still: false, from: c.from ?? 0, what: "review candidate" };
  }
  else if (m && !c.still && m.final_shot) c.src = { file: m.final_shot, still: false, from: c.from ?? 0, what: "final shot" };
  else if (m && !c.still && m.generated_clip) c.src = { file: m.generated_clip, still: false, from: c.from ?? HANDLE, what: "generated clip" };
  else if (m && m.start_frame) c.src = { file: m.start_frame, still: true, what: "start frame, held" };
  else if (panel) c.src = { file: panel, still: true, what: "storyboard panel, held" };
  else fail(`${c.shot ?? `the cut at ${c.at}`}: no Final shot, Generated clip or Start frame in Notion${c.shot ? ', and no "panel" to hold its place' : ""}.`);
}

if (opts.print) {
  console.log(`Scene ${sceneNo}, ${scene.title}: assembled scene ${clock(end)}, ${W}x${H} at ${FPS} fps, sound: ${soundField}`);
  for (const c of cuts) {
    const extra = [c.src.still && c.zoom ? `push ${c.zoom[0]}→${c.zoom[1]}` : "", !c.src.still ? `from ${c.src.from} s` : "", c.dissolve ? `dissolve ${c.dissolve} s` : ""].filter(Boolean).join(", ");
    console.log(`  ${clock(c.at)}–${clock(c.until)}  ${String(c.shot ?? c.panel).padEnd(10)} ${c.src.what}: ${c.src.local ?? c.src.file.name}${extra ? `  (${extra})` : ""}`);
  }
  if (plan.grade) console.log(`  grade: ${plan.grade}`);
  if (plan.fade) console.log(`  ${clock(plan.fade.from)}–${clock(plan.fade.to)}  fade to ${plan.fade.color}`);
  process.exit(0);
}

// ---------- --frame: the frame where a shot is cut, as a still to start the next shot from
if (opts.frame) {
  const c = [...cuts].reverse().find((x) => x.shot === opts.frame);
  if (!c) fail(`${opts.frame} is not in the scene's Edit plan.`);
  if (c.src.still) fail(`${opts.frame} is a held still in the edit; its start frame is the picture to reuse.`);
  const frameCount = Math.round(c.until * FPS) - Math.round(c.at * FPS);
  if (frameCount < 1) fail(`${opts.frame} has no frames in the edit.`);
  const lastFrame = frameCount - 1;
  const t = c.src.from + lastFrame / FPS;
  const dir = fromRoot("out/frames");
  mkdirSync(dir, { recursive: true });
  const out = `${dir}/${opts.frame}-cut.png`;
  // Count frames from the cut's in-point, as the render does, to avoid rounding a seek past the last frame.
  const filter = `fps=${FPS},tpad=stop_mode=clone:stop_duration=${(frameCount / FPS + 1).toFixed(3)},select=eq(n\\,${lastFrame})`;
  execFileSync(FFMPEG, ["-y", "-v", "error", "-ss", String(c.src.from), "-i", c.src.local ?? await downloadFile(c.src.file), "-vf", filter, "-frames:v", "1", out]);
  console.log(`The frame where ${opts.frame} is cut (${t.toFixed(2)} s into its ${c.src.what}): out/frames/${opts.frame}-cut.png`);
  console.log("Attach it to the next shot's Start frame in Notion.");
  process.exit(0);
}

// ---------- One segment per cut, then join, grade, fade and lay the sound under it
let grade = null;
if (plan.grade) {
  grade = fromRoot(plan.grade);
  if (!existsSync(grade)) fail(`The grade ${plan.grade} is not in the project.`);
}
const work = join(tmpdir(), `assemble-${process.pid}`);
mkdirSync(work, { recursive: true });
const segments = [];
const warnings = [];
try {
  for (const [k, c] of cuts.entries()) {
    const out = join(work, `${k}.mp4`);
    const input = c.src.local ?? await downloadFile(c.src.file);
    const extra = cuts[k + 1]?.dissolve ?? 0;
    if (!c.src.still) {
      const room = lengthOf(input) - c.src.from;
      if (room < c.until - c.at + extra - 0.01) warnings.push(`${c.shot}: its ${c.src.what} has ${room.toFixed(2)} s from ${c.src.from} s, the cut needs ${(c.until - c.at + extra).toFixed(2)} s; its last frame is held`);
    }
    segment({ input, still: c.src.still, from: c.src.from, cut: c, extra, W, H, FPS, out });
    segments.push(out);
  }
  const dir = fromRoot(`out/assembled/scene-${NN}`);
  mkdirSync(dir, { recursive: true });
  const name = opts.review ? `S${NN}-review-${new Date().toISOString().replace(/[:.]/g, "-")}.mp4` : `S${NN}-assembled.mp4`;
  const out = `${dir}/${name}`;
  const label = plan.label ? (c) => `${c.shot ?? c.panel}   ${c.src.what}` : null;
  const note = joinSegments({ segments, cuts, FPS, end, audio, out, fade: plan.fade, grade, label });
  if (note) console.log(note);
  if (opts.review) console.log(`Review cut (not selected): out/assembled/scene-${NN}/${name}`);
} catch (err) {
  rmSync(work, { recursive: true, force: true });
  fail(err.message);
}
rmSync(work, { recursive: true, force: true });
for (const w of warnings) console.log(`! ${w}`);
if (!opts.review) {
  console.log(`Assembled scene: out/assembled/scene-${NN}/S${NN}-assembled.mp4 (${clock(end)}).`);
  console.log(`Watch it, then upload: node scripts/upload.js --scene ${sceneNo} assembled`);
}
