#!/usr/bin/env node
// Builds a scene's animatic: its storyboard panels cut onto its radio cut, each panel held for its beat,
// with the pushes and dissolves the scene's Animatic plan asks for, rendered with ffmpeg. The plan is a YAML
// code block under the heading "Animatic plan" on the scene's row page in Notion (the Scenes database); the
// panels are the files in the row's Storyboard field and the sound is the file in its Scene radio cut.
//
//   node scripts/animatic.js --scene 1            build out/animatic/scene-01/S01-animatic.mp4
//   node scripts/animatic.js --scene 1 --print    the cuts as read from the plan (no video)
//   node scripts/animatic.js --scene 1 --local    use the panels and radio cut in out/ instead of Notion's
//                                                 (to check before uploading them)
//   node scripts/animatic.js --scene 1 --plan p.yaml   use a local plan instead of Notion's
//
// Then watch, and upload with: node scripts/upload.js --scene 1 animatic
// The format of the plan is described in README.md → The animatic plan.
import dotenv from "dotenv";
import { readFileSync, readdirSync, mkdirSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";
import YAML from "yaml";
import { loadConfig, fromRoot } from "../lib/project.js";
import { makeNotion, downloadFile } from "../lib/notion.js";
import { checkFfmpeg } from "../lib/audio.js";
import { segment, join as joinSegments, lengthOf, clock, timeline } from "../lib/video.js";

dotenv.config({ path: fromRoot(".env"), quiet: true });

const { values: opts } = parseArgs({
  options: {
    scene: { type: "string" },
    print: { type: "boolean", default: false },
    local: { type: "boolean", default: false },
    plan: { type: "string" },
  },
});
function fail(msg) {
  console.error(msg);
  process.exit(1);
}
const sceneNo = Number(opts.scene);
if (!Number.isInteger(sceneNo) || sceneNo < 1) fail("Usage: node scripts/animatic.js --scene 1 [--print] [--local] [--plan file.yaml]");
const NN = String(sceneNo).padStart(2, "0");

const config = loadConfig();
const sf = config.notion.scene_fields;
const notion = makeNotion(config);
const scene = await notion.sceneByNumber(sceneNo);
const plan = opts.plan ? YAML.parse(readFileSync(opts.plan, "utf8")) : await notion.pagePlan(scene.notion.id, "Animatic plan");
if (!plan) fail(`Scene ${sceneNo} has no "Animatic plan" heading on its row page in Notion.`);
if (!Array.isArray(plan.panels) || !plan.panels.length) fail("The plan has no panels.");

const [W, H] = String(plan.size ?? "1280x720").split("x").map(Number);
const FPS = plan.fps ?? 24;
const stem = (n) => n.replace(/\.[^.]+$/, "").toLowerCase();

// ---------- Files: from Notion (default) or from out/ (--local)
checkFfmpeg();
async function fileFrom(field, folder, name, exts) {
  if (opts.local) {
    const dir = fromRoot(`${folder}/scene-${NN}`);
    const hit = existsSync(dir) && readdirSync(dir).find((n) => (name ? stem(n) === stem(name) : exts.some((e) => n.toLowerCase().endsWith(e))));
    if (!hit) fail(`${name ?? exts.join("/")} is not in ${folder}/scene-${NN}/`);
    return join(dir, hit);
  }
  const list = await notion.filesOn(scene.notion.id, field);
  const f = list.find((x) => (name ? stem(x.name) === stem(name) : exts.some((e) => x.name.toLowerCase().endsWith(e))));
  if (!f) fail(`${name ?? "an " + exts.join("/") + " file"} is not in the scene's ${field} in Notion.`);
  return downloadFile(f);
}
const audio = await fileFrom(sf.radio_cut, "out/radio", null, [".mp3", ".wav", ".m4a"]);
const radioLength = lengthOf(audio);
const end = plan.end === undefined || plan.end === "radio" ? radioLength : Number(plan.end);

const cuts = timeline(plan.panels, end, fail);

if (opts.print) {
  console.log(`Scene ${sceneNo}, ${scene.title}: animatic ${clock(end)}, ${W}x${H} at ${FPS} fps`);
  for (const c of cuts) {
    const extra = [c.zoom ? `push ${c.zoom[0]}→${c.zoom[1]}` : "", c.dissolve ? `dissolve ${c.dissolve} s` : ""].filter(Boolean).join(", ");
    console.log(`  ${clock(c.at)}–${clock(c.until)}  beat ${String(c.beat ?? "").padEnd(14)} ${c.panel}${extra ? `  (${extra})` : ""}`);
  }
  if (plan.fade) console.log(`  ${clock(plan.fade.from)}–${clock(plan.fade.to)}  fade to ${plan.fade.color}`);
  process.exit(0);
}

// ---------- One video segment per cut: the panel fitted to the frame, with its push if any
const work = join(tmpdir(), `animatic-${process.pid}`);
mkdirSync(work, { recursive: true });
const segments = [];
for (const [k, c] of cuts.entries()) {
  const out = join(work, `${k}.mp4`);
  segment({ input: await fileFrom(sf.storyboard, "out/storyboard", c.panel), still: true, cut: c, extra: cuts[k + 1]?.dissolve ?? 0, W, H, FPS, out });
  segments.push(out);
}

// ---------- Join the segments (cuts and dissolves), add the fade, the labels and the sound
const dir = fromRoot(`out/animatic/scene-${NN}`);
mkdirSync(dir, { recursive: true });
const out = `${dir}/S${NN}-animatic.mp4`;
let note;
try {
  note = joinSegments({ segments, cuts, FPS, end, audio, out, fade: plan.fade, label: plan.label === false ? null : (c) => `beat ${c.beat ?? ""}   panel ${c.panel}` });
} catch (err) {
  rmSync(work, { recursive: true, force: true });
  fail(err.message);
}
if (note) console.log(note);
rmSync(work, { recursive: true, force: true });
console.log(`Animatic: out/animatic/scene-${NN}/S${NN}-animatic.mp4 (${clock(end)}).`);
console.log(`Watch it, then upload: node scripts/upload.js --scene ${sceneNo} animatic`);
