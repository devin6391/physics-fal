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
//   node scripts/upload.js --shot CO-01 end-frame out/frames/scene-01/CO-01-end-frame.jpg
//   node scripts/upload.js --shot CO-01 --field "End frame" out/frames/scene-01/CO-01-end-frame.jpg
//   node scripts/upload.js --scene 1 --field "Master still" out/frames/scene-01/master.jpg
//   node scripts/upload.js --page <Notion URL or ID> --field "Storyboard" panel.png
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
import { basename, extname, join, relative } from "node:path";
import { parseArgs } from "node:util";
import { loadConfig, fromRoot, IMAGE_EXTS } from "../lib/project.js";
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
const FRAMES = { "start-frame": { field: "start_frame" }, "end-frame": { field: "end_frame" } };
const USAGE = `Usage: node scripts/upload.js --scene 1 <${Object.keys(STAGES).join("|")}> [files…] [--dry-run] [--force]\n       node scripts/upload.js --shot CO-01 <start-frame|end-frame> <image> [--dry-run]\n       node scripts/upload.js <--shot CO-01|--scene 1|--page URL-or-ID> --field "Field name" <images…> [--dry-run]`;
const RECORD = fromRoot(".cache/notion-uploads.json");

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

const { values: opts, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    scene: { type: "string" },
    shot: { type: "string" },
    page: { type: "string" },
    field: { type: "string" },
    "dry-run": { type: "boolean", default: false },
    force: { type: "boolean", default: false },
  },
});
const sceneNo = Number(opts.scene);
const isShot = opts.shot !== undefined;
const custom = opts.field !== undefined;
const [stageName, ...stageFiles] = positionals;
const given = custom ? positionals : stageFiles;
const stage = custom ? null : (isShot ? FRAMES : STAGES)[stageName?.toLowerCase().replace(/_/g, "-")];
const targets = [opts.shot, opts.scene, opts.page].filter(v => v !== undefined);
if (targets.length !== 1 || targets.some(v => !v.trim()) || (opts.scene !== undefined && (!Number.isInteger(sceneNo) || sceneNo < 1))
  || (custom ? (!opts.field.trim() || !given.length || opts.force)
    : (!stage || opts.page !== undefined || (isShot && (given.length !== 1 || opts.force))))) fail(USAGE);

const config = loadConfig();
const fields = isShot ? config.notion.fields : config.notion.scene_fields;
const field = custom ? opts.field : fields?.[stage.field];
if (!field) fail(`config.yaml → notion.${isShot ? "fields" : "scene_fields"} has no ${stage.field}`);
const imagesOnly = custom || isShot;

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
if (!imagesOnly) paths = paths.filter((p) => !basename(p).startsWith(".") && !p.toLowerCase().endsWith(".json"));
paths.sort(byName);
if (!paths.length) fail("No files to upload.");
if (imagesOnly) {
  const stems = new Set();
  for (const p of paths) {
    if (!statSync(p).isFile() || statSync(p).size === 0 || !IMAGE_EXTS.includes(extname(p).toLowerCase())) {
      fail("Image uploads require non-empty PNG, JPG, JPEG or WebP files.");
    }
    const stem = basename(p, extname(p)).toLowerCase();
    if (stems.has(stem)) fail(`Duplicate image name: ${basename(p)}. Use distinct names for each image.`);
    stems.add(stem);
  }
}

const notion = makeNotion(config);
const scene = opts.scene !== undefined ? await notion.sceneByNumber(sceneNo) : null;
const target = opts.page !== undefined ? await notion.productionPage(opts.page)
  : isShot ? { ...await notion.shotPageById(opts.shot), kind: "shot" } : { ...scene.notion, kind: "scene" };
const pageId = target.id;
const inNotion = await notion.fieldFiles(pageId, field);
const record = existsSync(RECORD) ? JSON.parse(readFileSync(RECORD, "utf8")) : {};
const key = (name) => `${pageId}|${field}|${name}`;
const hashOf = (p) => createHash("sha256").update(readFileSync(p)).digest("hex");

console.log(`${opts.page !== undefined ? target.url : isShot ? opts.shot : `Scene ${sceneNo}, ${scene.title}`} → ${field}`);
// A frame field is a single selection for the generator. Never append a second candidate or
// replace an existing frame silently, even if the filename is the same.
const isFrame = target.kind === "shot" && [config.notion.fields.start_frame, config.notion.fields.end_frame].includes(field);
if (isFrame && paths.length !== 1) fail("A shot frame field takes exactly one image.");
if (isFrame && inNotion.length) {
  const name = basename(paths[0]);
  if (inNotion.length === 1 && inNotion[0] === name && record[key(name)] === hashOf(paths[0])) {
    console.log(`  ${name}: already in Notion, unchanged\nNothing to upload.`);
    process.exit(0);
  }
  fail(`${field} already contains: ${inNotion.join(", ")}. Nothing was replaced. Review the existing frame in Notion before choosing a replacement.`);
}
// Custom image uploads append; they never replace a matching name, including another extension.
if (custom) {
  for (const p of paths) {
    const name = basename(p);
    const matches = inNotion.filter(n => basename(n, extname(n)).toLowerCase() === basename(name, extname(name)).toLowerCase());
    if (matches.length && !(matches.length === 1 && matches[0] === name && record[key(name)] === hashOf(p))) {
      fail(`${field} already contains ${matches.join(", ")}. Nothing was replaced. Give the new image a distinct filename to keep both.`);
    }
  }
}
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
  console.log(`Uploaded ${todo.length} file(s). ${field} now holds ${after.length}: ${target.url}`);
} catch (err) {
  const msg = err?.message ?? String(err);
  if (/restricted|permission|insufficient/i.test(msg)) fail(`Notion refused: ${msg}\nThe integration needs Update content and Insert content, and access to the ${target.kind === "shot" ? "Shots" : "Scenes"} database (README.md → Notion setup).`);
  if (/size|too large|limit/i.test(msg)) fail(`Notion refused a file as too large: ${msg}\nA free Notion workspace takes files up to 5 MB; paid plans take far larger ones.`);
  fail(`Upload failed: ${msg}`);
}
