#!/usr/bin/env node
// Downloads the images shots need from Notion into .cache/notion/, so generate.js can upload them to fal.
//
//   node scripts/pull.js CO-02a                     one shot's images (several: CO-02a CO-02b or CO-02a,CO-02b)
//   node scripts/pull.js --section "Cold open"      every shot in a section made on fal (Model in config.yaml)
//
// For each shot: its start frame, end frame (if any), and each linked character's face close-up and sheet.
// Images already here are skipped. A problem reported here means the image isn't usable in Notion.
import "dotenv/config";
import { parseArgs } from "node:util";
import { loadConfig } from "../lib/project.js";
import { makeNotion, download, imagesOf, onFal } from "../lib/notion.js";

const { values: opts, positionals } = parseArgs({
  allowPositionals: true,
  options: { section: { type: "string" } },
});

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

const ids = positionals.flatMap((p) => p.split(",")).map((s) => s.trim()).filter(Boolean);
if (!!opts.section === !!ids.length) fail('Usage: node scripts/pull.js CO-02a [CO-02b ...] | --section "Cold open"');

const config = loadConfig();
const fields = config.notion.fields;
let shots;
try {
  const notion = makeNotion(config);
  shots = opts.section ? onFal(await notion.shotsInSection(opts.section), config) : await notion.shotsByIds(ids);
} catch (err) {
  const hint = err?.code === "object_not_found" || err?.code === "unauthorized"
    ? " (check NOTION_TOKEN, and that the Shots and Asset Library databases are shared with the integration: ••• → Connections)"
    : "";
  fail(`Notion: ${err?.message ?? err}${hint}`);
}
if (!shots.length) fail("No shots found.");

let fresh = 0, already = 0, problems = 0;
const seen = new Map();   // one download per file, even when several shots share it (a character, a reused frame)

for (const shot of shots) {
  console.log(shot.id);
  if (!shot.start_frame) {
    problems++;
    console.log(`  ✗ start frame: "${fields.start_frame}" is empty in Notion`);
  }
  for (const c of shot.characters) {
    if (!c.frontal) { problems++; console.log(`  ✗ ${c.name} face close-up: "${config.notion.asset_fields.face}" is empty in the Asset Library`); }
    if (!c.references.length) { problems++; console.log(`  ✗ ${c.name} sheet: "${config.notion.asset_fields.sheet}" is empty in the Asset Library`); }
  }
  for (const { what, file } of imagesOf(shot)) {
    try {
      const key = file.url.split("?")[0];
      if (!seen.has(key)) seen.set(key, download(file));
      const { path, fresh: isNew } = await seen.get(key);
      if (isNew) { fresh++; seen.set(key, Promise.resolve({ path, fresh: false })); } else already++;
      console.log(`  ${isNew ? "✓" : "="} ${what}: ${file.name} → ${path}`);
    } catch (err) {
      problems++;
      console.log(`  ✗ ${what}: ${err.message}`);
    }
  }
}

console.log(`\n${fresh} downloaded, ${already} already here, ${problems} problem(s).`);
if (problems) {
  console.log("Problems above mean the image isn't usable in Notion: add or replace it there, then pull again.");
  process.exitCode = 1;
}
