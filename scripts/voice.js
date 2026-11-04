#!/usr/bin/env node
// Makes the film's dialogue on ElevenLabs from the shots in Notion: one audio file per spoken line,
// in the voice config.yaml gives that speaker (voice.speakers). Sound is mixed in CapCut.
//
//   node scripts/voice.js 10-06                       one shot's lines (several: 10-06 10-07)
//   node scripts/voice.js --section 10                every shot in a section that has lines
//   node scripts/voice.js 10-06 --takes 2             two takes of each line
//   node scripts/voice.js 10-06 --print               show each line and its voice as read from Notion, spend nothing
//   node scripts/voice.js 10-06 --dry-run             check the voices, show the characters it would use, spend nothing
//   node scripts/voice.js 10-06 --yes                 skip the "use N characters?" question
//   node scripts/voice.js --voices                    list the voices on the ElevenLabs account
//
// Lines come from the shot's Dialogue lines field, or from Screenplay audio when that is empty
// ("Priya (softly): "…" Narrator: …"; SFX is skipped). Files land in out/voice/<section>/<shot>-<line>-<speaker>-take<N>.mp3
// (an earlier take is never overwritten), each with a .json beside it. Every run is appended to voice-log.csv.
import dotenv from "dotenv";
import { mkdirSync, existsSync, writeFileSync, appendFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { parseArgs } from "node:util";
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import { loadConfig, fromRoot } from "../lib/project.js";
import { makeNotion, slug } from "../lib/notion.js";
import { scriptOf, parseLines } from "../lib/voice.js";

dotenv.config({ path: fromRoot(".env"), quiet: true });

const { values: opts, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    section: { type: "string" },
    takes: { type: "string", default: "1" },
    print: { type: "boolean", default: false },
    "dry-run": { type: "boolean", default: false },
    yes: { type: "boolean", default: false },
    voices: { type: "boolean", default: false },
  },
});

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

function elevenLabs() {
  if (!process.env.ELEVENLABS_API_KEY) fail("ELEVENLABS_API_KEY is not set. Run: npx -y @elevenlabs/cli@latest onboard init");
  return new ElevenLabsClient();
}

const config = loadConfig();
const vc = config.voice ?? {};
const speakers = vc.speakers ?? {};

if (opts.voices) {
  const { voices } = await elevenLabs().voices.search({ pageSize: 100 });
  for (const v of voices) {
    const l = v.labels ?? {};
    console.log(`${v.voiceId}  ${v.name}  (${[l.language, l.gender, l.age, l.accent].filter(Boolean).join(", ")})`);
  }
  process.exit(0);
}

const ids = positionals.flatMap((p) => p.split(",")).map((s) => s.trim()).filter(Boolean);
if (!!opts.section === !!ids.length) fail('Usage: node scripts/voice.js 10-06 [10-07 ...] | --section 10  [--takes N] [--print] [--dry-run] [--yes] | --voices');
const takes = Number(opts.takes);
if (!Number.isInteger(takes) || takes < 1 || takes > 4) fail("--takes must be 1 to 4");

let shots;
try {
  const notion = makeNotion(config);
  shots = opts.section ? await notion.shotsInSection(opts.section) : await notion.shotsByIds(ids);
} catch (err) {
  fail(`Notion: ${err?.message ?? err}`);
}

const jobs = [];
const silent = [];
for (const shot of shots) {
  const script = scriptOf(shot);
  const lines = parseLines(script.text, Object.keys(speakers));
  if (!lines.length) silent.push(shot.id);
  lines.forEach((line, i) => jobs.push({ shot, field: script.field, n: i + 1, ...line, voiceId: speakers[line.speaker] ?? null }));
}
if (silent.length) console.log(`No spoken lines in Notion, skipped: ${silent.join(", ")}`);
if (!jobs.length) fail("No lines to voice.");

const problems = [...new Set(jobs.filter((j) => !j.voiceId).map((j) => `${j.speaker} has no voice yet (config.yaml → voice.speakers)`))];

if (opts.print) {
  let last;
  for (const j of jobs) {
    if (j.shot !== last) console.log(`\n===== ${j.shot.id} · from ${j.field} · ${j.shot.notion.url} =====`);
    last = j.shot;
    console.log(`${String(j.n).padStart(2)}. ${j.speaker.padEnd(9)} ${j.spoken}`);
  }
  if (problems.length) fail(`\nNot ready yet:\n  ${problems.join("\n  ")}`);
  process.exit(0);
}
if (problems.length) fail(`Not ready yet:\n  ${problems.join("\n  ")}`);

// ElevenLabs bills by characters of text sent.
const chars = jobs.reduce((sum, j) => sum + j.spoken.length, 0) * takes;
const client = elevenLabs();
let left = null;
try {
  const s = await client.user.subscription.get();
  left = s.characterLimit - s.characterCount;
} catch {
  // The total below is still right; only the remaining balance is unknown.
}
console.log(`${jobs.length} line(s) × ${takes} take(s) on ${vc.model}: about ${chars} characters${left == null ? "" : ` of the ${left} left this month`}`);
if (left != null && chars > left) fail("That's more than the characters left on the ElevenLabs plan.");
if (opts["dry-run"]) process.exit(0);

if (!opts.yes) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(`Use about ${chars} ElevenLabs characters? (y/N) `);
  rl.close();
  if (answer.trim().toLowerCase() !== "y") fail("Cancelled. Nothing was spent.");
}

const logPath = fromRoot("voice-log.csv");
if (!existsSync(logPath)) appendFileSync(logPath, "time,scene,shot,line,speaker,take,file,characters,request_id,result\n");
function log(j, take, file, characters, requestId, result) {
  const cells = [new Date().toISOString(), slug(j.shot.section), j.shot.id, j.n, j.speaker, take, file, characters, requestId, result];
  appendFileSync(logPath, cells.map((c) => `"${String(c).replaceAll('"', '""')}"`).join(",") + "\n");
}

const ext = String(vc.output_format).split("_")[0];
let failures = 0;
for (const j of jobs) {
  const outDir = `out/voice/${slug(j.shot.section) || "unsorted"}`;
  mkdirSync(fromRoot(outDir), { recursive: true });
  const stem = `${j.shot.id}-${String(j.n).padStart(2, "0")}-${slug(j.speaker)}`;
  for (let t = 0, take = 1; t < takes; t++, take++) {
    while (existsSync(fromRoot(`${outDir}/${stem}-take${take}.${ext}`))) take++;
    const file = `${stem}-take${take}.${ext}`;
    const label = `${j.shot.id} line ${j.n} (${j.speaker}) take ${take}`;
    let requestId = "";
    try {
      const { data, rawResponse } = await client.textToSpeech
        .convert(j.voiceId, {
          text: j.spoken,
          modelId: vc.model,
          outputFormat: vc.output_format,
          voiceSettings: { stability: vc.stability, similarityBoost: vc.similarity_boost },
        })
        .withRawResponse();
      requestId = rawResponse.headers.get("request-id") ?? "";
      const characters = rawResponse.headers.get("x-character-count") ?? j.spoken.length;
      writeFileSync(fromRoot(`${outDir}/${file}`), Buffer.from(await new Response(data).arrayBuffer()));
      writeFileSync(
        fromRoot(`${outDir}/${stem}-take${take}.json`),
        JSON.stringify(
          {
            shot: j.shot.id,
            line: j.n,
            take,
            notion_page: j.shot.notion.url,
            notion_last_edited: j.shot.notion.last_edited,
            from_field: j.field,
            speaker: j.speaker,
            voice_id: j.voiceId,
            model: vc.model,
            voice_settings: { stability: vc.stability, similarity_boost: vc.similarity_boost },
            text: j.spoken,
            characters: Number(characters),
            request_id: requestId,
            created: new Date().toISOString(),
          },
          null,
          2,
        ),
      );
      log(j, take, file, characters, requestId, "ok");
      console.log(`✓ ${label}: ${outDir}/${file}`);
    } catch (err) {
      failures++;
      const msg = err?.body ? JSON.stringify(err.body) : err?.message ?? String(err);
      log(j, take, "", 0, requestId, `failed: ${msg}`);
      console.error(`✗ ${label}: ${msg}`);
    }
  }
}

if (failures) {
  console.error(`\n${failures} line(s) failed; see voice-log.csv.`);
  process.exitCode = 1;
}
