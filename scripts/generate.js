#!/usr/bin/env node
// Generates Kling clips on fal.ai from the shots in Notion, the source of truth. Each shot's Model in
// Notion picks the fal model (config.yaml → models): Kling 3.0 or Kling 4.0.
//
//   node scripts/generate.js CO-02a                     one shot (several: CO-02a CO-02b or CO-02a,CO-02b)
//   node scripts/generate.js --section "Cold open"      every shot in a section made on fal whose prompt is written
//   node scripts/generate.js CO-02a --takes 2           two takes of each shot
//   node scripts/generate.js CO-02a --print             show the exact prompt as read from Notion, spend nothing
//   node scripts/generate.js CO-02a --dry-run           check Notion and the local images, show the cost, spend nothing
//   node scripts/generate.js CO-02a --yes               skip the "spend $X?" question
//
// Every run reads the prompt, duration, frames and characters straight from the shot's row in Notion.
// The images are uploaded to fal from their local copies, which npm run pull downloads beforehand.
// Clips land in out/<section>/<shot>-take<N>.mp4 (an earlier take is never overwritten),
// each with a .json beside it recording exactly what was sent. Every run is appended to log.csv.
import "dotenv/config";
import { mkdirSync, existsSync, writeFileSync, appendFileSync, readdirSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { parseArgs } from "node:util";
import { fal } from "@fal-ai/client";
import { loadConfig, fromRoot } from "../lib/project.js";
import { SECTIONS, assemblePrompt, toFalElements } from "../lib/prompt.js";
import { validate, genSeconds } from "../lib/validate.js";
import { makeNotion, localCopy, slug, onFal } from "../lib/notion.js";
import { makeUploader } from "../lib/uploads.js";

const { values: opts, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    section: { type: "string" },
    takes: { type: "string", default: "1" },
    print: { type: "boolean", default: false },
    "dry-run": { type: "boolean", default: false },
    yes: { type: "boolean", default: false },
  },
});

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

function notionError(err) {
  const hint = err?.code === "object_not_found" || err?.code === "unauthorized"
    ? " (check NOTION_TOKEN, and that the Shots and Asset Library databases are shared with the integration: ••• → Connections)"
    : "";
  return `Notion: ${err?.message ?? err}${hint}`;
}

const ids = positionals.flatMap((p) => p.split(",")).map((s) => s.trim()).filter(Boolean);
if (!!opts.section === !!ids.length) fail('Usage: node scripts/generate.js CO-02a [CO-02b ...] | --section "Cold open"  [--takes N] [--print] [--dry-run] [--yes]');

const config = loadConfig();
const takes = Number(opts.takes);
if (!Number.isInteger(takes) || takes < 1 || takes > 4) fail("--takes must be 1 to 4");

let shots;
try {
  const notion = makeNotion(config);
  shots = opts.section ? await notion.shotsInSection(opts.section) : await notion.shotsByIds(ids);
} catch (err) {
  fail(notionError(err));
}

// In a section, rows made elsewhere or whose prompt hasn't been written in Notion yet are skipped, not errors.
if (opts.section) {
  shots = onFal(shots, config);
  const unwritten = shots.filter((s) => SECTIONS.every(([key]) => !s.prompt[key]));
  if (unwritten.length) console.log(`Prompt not written in Notion yet, skipped: ${unwritten.map((s) => s.id).join(", ")}`);
  shots = shots.filter((s) => !unwritten.includes(s));
}
if (!shots.length) fail("No shots to run.");

// Build every request first, so all checks happen before any money is spent.
const audio = config.audio ?? false;
const jobs = shots.map((shot) => {
  const model = config.models[shot.model];
  const v3 = model?.request === "kling-v3";
  const { text, names } = toFalElements(assemblePrompt(shot, config));
  return {
    shot,
    model,
    prompt: text,
    names,
    characters: names.map((n) => shot.characters.find((c) => c.name === n)),
    // Kling 4.0 on fal has no negative prompt or audio setting.
    negative: v3 ? config.negative_prompt : null,
    audioLabel: v3 ? (audio ? "on" : "off") : "no setting",
    seconds: genSeconds(shot, config),
    cost: genSeconds(shot, config) * (model?.usd_per_second ?? 0),
    outDir: `out/${slug(shot.section) || "unsorted"}`,
  };
});

const problems = validate(shots, config);

if (opts.print) {
  for (const j of jobs) {
    console.log(`\n===== ${j.shot.id} · ${j.shot.model ?? "no Model"} · ${j.shot.duration} s in the scene, generated ${j.seconds} s · audio ${j.audioLabel} · ${j.shot.notion.url} =====`);
    console.log(`Start frame: ${j.shot.start_frame?.name ?? "(empty)"}${j.shot.end_frame ? `   End frame: ${j.shot.end_frame.name}` : ""}`);
    j.names.forEach((n, i) => console.log(`@Element${i + 1} = ${n}`));
    console.log(`\n${j.prompt}`);
    if (j.negative) console.log(`\nNEGATIVE PROMPT\n${j.negative}`);
  }
  if (problems.length) fail(`\nNot ready to generate yet:\n  ${problems.join("\n  ")}`);
  process.exit(0);
}
if (problems.length) fail(`Fix these in Notion first:\n  ${problems.join("\n  ")}`);

// Images are uploaded to fal from their local copies only; this script never downloads from Notion.
// A copy is missing when it was never pulled, or when the file was replaced in Notion since.
const missing = [];
for (const j of jobs) {
  const local = (file, what) => {
    const path = localCopy(file);
    if (!path) missing.push(`${j.shot.id} ${what}: ${file.name}`);
    return path;
  };
  j.startPath = local(j.shot.start_frame, "start frame");
  if (j.shot.end_frame) j.endPath = local(j.shot.end_frame, "end frame");
  j.elementPaths = j.characters.map((c) => ({
    frontal: local(c.frontal, `${c.name} face close-up`),
    references: c.references.map((r) => local(r, `${c.name} sheet`)),
  }));
}
if (missing.length) {
  const args = opts.section ? `--section "${opts.section}"` : ids.join(" ");
  fail(`These images aren't on this Mac yet:\n  ${missing.join("\n  ")}\nPull them from Notion, then run this again:\n  npm run pull -- ${args}`);
}

const total = jobs.reduce((sum, j) => sum + j.cost, 0) * takes;
console.log(`${opts.section ? `Section ${opts.section}: ` : ""}${jobs.length} shot(s) × ${takes} take(s)`);
for (const j of jobs) {
  const els = j.names.length ? `  elements: ${j.names.join(", ")}` : "";
  console.log(`  ${j.shot.id.padEnd(8)} ${j.shot.model.padEnd(10)} ${String(j.seconds).padStart(2)} s  $${(j.cost * takes).toFixed(2)}${els}`);
}
console.log(`Total: about $${total.toFixed(2)}`);
if (opts["dry-run"]) process.exit(0);

if (!process.env.FAL_KEY) fail("FAL_KEY is not set. See README.md → Setup.");
if (!opts.yes) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(`Spend about $${total.toFixed(2)} on fal? (y/N) `);
  rl.close();
  if (answer.trim().toLowerCase() !== "y") fail("Cancelled. Nothing was spent.");
}

fal.config({ credentials: process.env.FAL_KEY });
const upload = makeUploader(config);

// Reserve take numbers up front so parallel takes of one shot never collide.
const existing = new Map();
const runs = [];
for (const job of jobs) {
  mkdirSync(fromRoot(job.outDir), { recursive: true });
  if (!existing.has(job.outDir)) existing.set(job.outDir, new Set(readdirSync(fromRoot(job.outDir))));
  const taken = existing.get(job.outDir);
  let n = 1;
  for (let t = 0; t < takes; t++) {
    while (taken.has(`${job.shot.id}-take${n}.mp4`)) n++;
    taken.add(`${job.shot.id}-take${n}.mp4`);
    runs.push({ ...job, take: n });
  }
}

let failures = 0;
const logPath = fromRoot("log.csv");
if (!existsSync(logPath)) appendFileSync(logPath, "time,scene,shot,model,take,file,duration_s,audio,usd,wait_s,request_id,result\n");

// The request body for each kind of model, matching its schema on fal.
function buildInput(run, urls) {
  if (run.model.request === "kling-v4") {
    const input = { prompt: run.prompt, start_image_url: urls.start, duration: run.seconds };
    if (urls.end) input.end_image_url = urls.end;
    if (run.model.resolution) input.resolution = run.model.resolution;
    return input;
  }
  const input = {
    prompt: run.prompt,
    start_image_url: urls.start,
    duration: String(run.seconds),
    generate_audio: audio,
    negative_prompt: run.negative,
  };
  if (urls.end) input.end_image_url = urls.end;
  if (urls.elements.length) input.elements = urls.elements;
  return input;
}

async function runOne(run) {
  const { shot } = run;
  const label = `${shot.id} take ${run.take}`;
  const started = Date.now();
  let requestId = "";
  try {
    const input = buildInput(run, {
      start: await upload(run.startPath),
      end: run.endPath ? await upload(run.endPath) : null,
      elements: await Promise.all(
        run.elementPaths.map(async (el) => ({
          frontal_image_url: await upload(el.frontal),
          reference_image_urls: await Promise.all(el.references.map(upload)),
        })),
      ),
    });

    console.log(`→ ${label}: submitted to ${shot.model}`);
    const result = await fal.subscribe(run.model.endpoint, {
      input,
      logs: false,
      onEnqueue: (id) => (requestId = id),
      onQueueUpdate: (u) => {
        if (u.status === "IN_QUEUE" && u.queue_position != null) console.log(`  ${label}: in queue, position ${u.queue_position}`);
      },
    });
    requestId = result.requestId ?? requestId;

    const videoUrl = result.data?.video?.url;
    if (!videoUrl) throw new Error("fal returned no video");
    const res = await fetch(videoUrl);
    if (!res.ok) throw new Error(`video download failed: HTTP ${res.status}`);
    const file = `${shot.id}-take${run.take}.mp4`;
    writeFileSync(fromRoot(`${run.outDir}/${file}`), Buffer.from(await res.arrayBuffer()));

    // What was sent, with Notion file names instead of upload URLs, for the trials record.
    writeFileSync(
      fromRoot(`${run.outDir}/${shot.id}-take${run.take}.json`),
      JSON.stringify(
        {
          shot: shot.id,
          take: run.take,
          notion_page: shot.notion.url,
          notion_last_edited: shot.notion.last_edited,
          model: shot.model,
          endpoint: run.model.endpoint,
          request_id: requestId,
          duration: run.seconds,
          scene_length: shot.duration,
          audio: run.audioLabel,
          resolution: run.model.resolution ?? null,
          start_frame: shot.start_frame.name,
          end_frame: shot.end_frame?.name ?? null,
          elements: run.characters.map((c, i) => ({
            element: `@Element${i + 1}`,
            name: c.name,
            notion_page: c.notion,
            frontal: c.frontal.name,
            references: c.references.map((r) => r.name),
          })),
          prompt: run.prompt,
          negative_prompt: run.negative,
          video_url: videoUrl,
          usd: run.cost,
          created: new Date().toISOString(),
        },
        null,
        2,
      ),
    );
    const wait = Math.round((Date.now() - started) / 1000);
    log(run, file, wait, requestId, "ok");
    console.log(`✓ ${label}: ${run.outDir}/${file}  ($${run.cost.toFixed(2)}, ${wait} s)`);
  } catch (err) {
    const wait = Math.round((Date.now() - started) / 1000);
    const msg = err?.body?.detail ? JSON.stringify(err.body.detail) : err?.message ?? String(err);
    failures++;
    log(run, "", wait, requestId, `failed: ${msg}`);
    console.error(`✗ ${label}: ${msg}`);
  }
}

function log(run, file, wait, requestId, result) {
  const cells = [new Date().toISOString(), slug(run.shot.section), run.shot.id, run.shot.model, run.take, file, run.seconds, run.audioLabel,
    result === "ok" ? run.cost.toFixed(2) : "0", wait, requestId, result];
  appendFileSync(logPath, cells.map((c) => `"${String(c).replaceAll('"', '""')}"`).join(",") + "\n");
}

// Run with at most `parallel` clips on fal at once.
const queue = [...runs];
const workers = Array.from({ length: Math.min(config.parallel ?? 4, queue.length) }, async () => {
  while (queue.length) await runOne(queue.shift());
});
await Promise.all(workers);

if (failures) {
  console.error(`\n${failures} of ${runs.length} clip(s) failed; see log.csv. Failed requests are not charged.`);
  process.exitCode = 1;
}
