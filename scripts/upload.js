#!/usr/bin/env node
// Uploads a scene's files to its row in the Scenes database in Notion: the radio cut, the storyboard panels,
// the animatic, the assembled scene and the mix. Each has its own field on the row and its own folder in out/.
//
//   node scripts/upload.js --scene 1 storyboard            every file in out/storyboard/scene-01/
//   node scripts/upload.js --scene 1 animatic              every file in out/animatic/scene-01/
//   node scripts/upload.js --scene 1 radio-cut             every file in out/radio/scene-01/
//   node scripts/upload.js --scene 1 storyboard out/storyboard/scene-01/S01-sb-05.png
//                                                          only the files named
//   node scripts/upload.js --scene 1 storyboard --dry-run  what it would upload, without uploading
//   node scripts/upload.js --scene 1 storyboard --force    upload again even where Notion already has the file
//
// What goes where:
//   radio-cut   out/radio/scene-NN/       → Scene radio cut
//   storyboard  out/storyboard/scene-NN/  → Storyboard
//   animatic    out/animatic/scene-NN/    → Animatic
//   assembled   out/assembled/scene-NN/   → Assembled scene
//   mix         out/mix/scene-NN/         → Scene mix
//   sfx         out/sound/scene-NN/approved/ → Scene SFX audio (sounds.js does this after you approve)
//   voice       no folder: name the files → Voice files (voice.js does this after you approve)
//
// Only new or changed files are uploaded. A file is skipped when Notion has it and it is unchanged since this
// script last uploaded it; a changed file replaces the one of the same name. A file that is in Notion but was
// put there another way (by hand, say) is skipped too, unless --force. JSON files are never uploaded.
// The field stays sorted by file name, and nothing already in Notion is removed.
import dotenv from "dotenv";
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { basename, join, relative } from "node:path";
import { parseArgs } from "node:util";
import { loadConfig, fromRoot } from "../lib/project.js";
import { makeNotion } from "../lib/notion.js";

dotenv.config({ path: fromRoot(".env"), quiet: true });

const STAGES = {
  "radio-cut": { field: "radio_cut", folder: "out/radio" },
  storyboard: { field: "storyboard", folder: "out/storyboard" },
  animatic: { field: "animatic", folder: "out/animatic" },
  assembled: { field: "assembled", folder: "out/assembled" },
  mix: { field: "mix", folder: "out/mix" },
  sfx: { field: "sfx_files", folder: "out/sound", sub: "approved" },
  voice: { field: "voice_files" },
};
const USAGE = `Usage: node scripts/upload.js --scene 1 <${Object.keys(STAGES).join("|")}> [files…] [--dry-run] [--force]`;
const RECORD = fromRoot(".cache/notion-uploads.json");

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

const { values: opts, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    scene: { type: "string" },
    "dry-run": { type: "boolean", default: false },
    force: { type: "boolean", default: false },
  },
});
const sceneNo = Number(opts.scene);
const [stageName, ...given] = positionals;
const stage = STAGES[stageName?.toLowerCase().replace(/_/g, "-")];
if (!Number.isInteger(sceneNo) || sceneNo < 1 || !stage) fail(USAGE);

const config = loadConfig();
const field = config.notion.scene_fields?.[stage.field];
if (!field) fail(`config.yaml → notion.scene_fields has no ${stage.field}`);

// The files to upload: the ones named, or every file in the stage's folder for this scene.
const byName = (a, b) => basename(a).localeCompare(basename(b), undefined, { numeric: true, sensitivity: "base" });
let paths;
if (given.length) {
  paths = given.map((p) => (existsSync(p) ? p : fail(`no such file: ${p}`)));
} else {
  if (!stage.folder) fail(`Name the files to upload to ${field}: ${USAGE}`);
  const dir = fromRoot(join(stage.folder, `scene-${String(sceneNo).padStart(2, "0")}`, stage.sub ?? ""));
  if (!existsSync(dir)) fail(`${relative(fromRoot("."), dir)}/ does not exist`);
  paths = readdirSync(dir).map((n) => join(dir, n)).filter((p) => statSync(p).isFile());
}
paths = paths.filter((p) => !basename(p).startsWith(".") && !p.toLowerCase().endsWith(".json")).sort(byName);
if (!paths.length) fail("No files to upload.");

const notion = makeNotion(config);
const scene = await notion.sceneByNumber(sceneNo);
const pageId = scene.notion.id;
const inNotion = await notion.fieldFiles(pageId, field);
const record = existsSync(RECORD) ? JSON.parse(readFileSync(RECORD, "utf8")) : {};
const key = (name) => `${pageId}|${field}|${name}`;
const hashOf = (p) => createHash("sha256").update(readFileSync(p)).digest("hex");

console.log(`Scene ${sceneNo}, ${scene.title} → ${field}`);
const todo = [];
for (const p of paths) {
  const name = basename(p);
  const hash = hashOf(p);
  const there = inNotion.includes(name);
  const mb = (statSync(p).size / 1e6).toFixed(1);
  if (there && !opts.force) {
    if (record[key(name)] === hash) { console.log(`  ${name}: already in Notion, unchanged`); continue; }
    if (!record[key(name)]) { console.log(`  ${name}: already in Notion (put there another way); --force to replace it`); continue; }
  }
  console.log(`  ${name}: ${there ? "replace" : "upload"} (${mb} MB)`);
  todo.push({ path: p, name, hash });
}
if (!todo.length) { console.log("Nothing to upload."); process.exit(0); }
if (opts["dry-run"]) { console.log(`Dry run: ${todo.length} file(s) would be uploaded.`); process.exit(0); }

try {
  const after = await notion.attachFiles(pageId, field, todo.map((t) => t.path));
  for (const t of todo) record[key(t.name)] = t.hash;
  mkdirSync(fromRoot(".cache"), { recursive: true });
  writeFileSync(RECORD, JSON.stringify(record, null, 2));
  console.log(`Uploaded ${todo.length} file(s). ${field} now holds ${after.length}: ${scene.notion.url}`);
} catch (err) {
  const msg = err?.message ?? String(err);
  if (/restricted|permission|insufficient/i.test(msg)) fail(`Notion refused: ${msg}\nThe integration needs Update content and Insert content, and access to the Scenes database (README.md → Notion setup).`);
  if (/size|too large|limit/i.test(msg)) fail(`Notion refused a file as too large: ${msg}\nA free Notion workspace takes files up to 5 MB; paid plans take far larger ones.`);
  fail(`Upload failed: ${msg}`);
}
