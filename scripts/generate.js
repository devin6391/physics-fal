#!/usr/bin/env node
// Generates a scene's Kling 3.0 clips on fal.ai.
//
//   node scripts/generate.js shots/cold_open.yaml                 every shot in the scene
//   node scripts/generate.js shots/cold_open.yaml --only CO-02a   just these shots (comma-separated)
//   node scripts/generate.js shots/cold_open.yaml --takes 2       two takes of each shot
//   node scripts/generate.js shots/cold_open.yaml --print         show the exact prompts, spend nothing
//   node scripts/generate.js shots/cold_open.yaml --dry-run       check files and show the cost, spend nothing
//   node scripts/generate.js shots/cold_open.yaml --yes           skip the "spend $X?" question
//
// Clips land in out/<scene>/<shot>-take<N>.mp4 (an earlier take is never overwritten),
// each with a .json beside it recording exactly what was sent. Every run is appended to log.csv.
import "dotenv/config";
import { mkdirSync, existsSync, writeFileSync, appendFileSync, readdirSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { parseArgs } from "node:util";
import { fal } from "@fal-ai/client";
import { loadConfig, loadElements, loadScene, fromRoot } from "../lib/project.js";
import { assemblePrompt, toFalElements } from "../lib/prompt.js";
import { validate, missingElementFiles } from "../lib/validate.js";
import { makeUploader } from "../lib/uploads.js";

const { values: opts, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    only: { type: "string" },
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

if (positionals.length !== 1) fail("Usage: node scripts/generate.js shots/<scene>.yaml [--only ID,ID] [--takes N] [--print] [--dry-run] [--yes]");

const config = loadConfig();
const elements = loadElements();
const scene = loadScene(positionals[0]);
const takes = Number(opts.takes);
if (!Number.isInteger(takes) || takes < 1 || takes > 4) fail("--takes must be 1 to 4");

let shots = scene.shots;
if (opts.only) {
  const wanted = opts.only.split(",").map((s) => s.trim()).filter(Boolean);
  const unknown = wanted.filter((id) => !shots.some((s) => s.id === id));
  if (unknown.length) fail(`Not in ${positionals[0]}: ${unknown.join(", ")}`);
  shots = shots.filter((s) => wanted.includes(s.id));
}
if (!shots.length) fail("No shots to run.");

// Build every request first, so all checks happen before any money is spent.
const jobs = shots.map((shot) => {
  const audio = shot.audio ?? config.audio ?? false;
  const { text, names } = toFalElements(assemblePrompt(shot, config));
  return {
    shot,
    audio,
    prompt: text,
    names,
    negative: shot.negative_prompt ?? config.negative_prompt,
    cost: Number(shot.duration) * (audio ? config.price_per_second.audio_on : config.price_per_second.audio_off),
  };
});

const problems = [
  ...validate(shots, elements, config),
  ...missingElementFiles([...new Set(jobs.flatMap((j) => j.names))].filter((n) => elements[n]), elements),
];
if (problems.length) fail(`Fix these first:\n  ${problems.join("\n  ")}`);

if (opts.print) {
  for (const j of jobs) {
    console.log(`\n===== ${j.shot.id} · ${j.shot.duration} s · audio ${j.audio ? "on" : "off"} =====`);
    j.names.forEach((n, i) => console.log(`@Element${i + 1} = ${n}`));
    console.log(`\n${j.prompt}\n\nNEGATIVE PROMPT\n${j.negative}`);
  }
  process.exit(0);
}

const total = jobs.reduce((sum, j) => sum + j.cost, 0) * takes;
console.log(`Scene ${scene.scene}: ${jobs.length} shot(s) × ${takes} take(s)`);
for (const j of jobs) {
  const els = j.names.length ? `  elements: ${j.names.join(", ")}` : "";
  console.log(`  ${j.shot.id.padEnd(8)} ${String(j.shot.duration).padStart(2)} s  $${(j.cost * takes).toFixed(2)}${els}`);
}
console.log(`Total: about $${total.toFixed(2)}`);
if (opts["dry-run"]) process.exit(0);

if (!process.env.FAL_KEY) fail("FAL_KEY is not set. Copy .env.example to .env and paste your key there.");
if (!opts.yes) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(`Spend about $${total.toFixed(2)} on fal? (y/N) `);
  rl.close();
  if (answer.trim().toLowerCase() !== "y") fail("Cancelled. Nothing was spent.");
}

fal.config({ credentials: process.env.FAL_KEY });
const upload = makeUploader(config);
const outDir = fromRoot(`out/${scene.scene}`);
mkdirSync(outDir, { recursive: true });

// Reserve take numbers up front so parallel takes of one shot never collide.
const existing = new Set(existsSync(outDir) ? readdirSync(outDir) : []);
const runs = [];
for (const job of jobs) {
  let n = 1;
  for (let t = 0; t < takes; t++) {
    while (existing.has(`${job.shot.id}-take${n}.mp4`)) n++;
    existing.add(`${job.shot.id}-take${n}.mp4`);
    runs.push({ ...job, take: n });
  }
}

let failures = 0;
const logPath = fromRoot("log.csv");
if (!existsSync(logPath)) appendFileSync(logPath, "time,scene,shot,take,file,duration_s,audio,usd,wait_s,request_id,result\n");

async function runOne(run) {
  const { shot } = run;
  const label = `${shot.id} take ${run.take}`;
  const started = Date.now();
  let requestId = "";
  try {
    const input = {
      prompt: run.prompt,
      start_image_url: await upload(shot.start_frame),
      duration: String(shot.duration),
      generate_audio: run.audio,
      negative_prompt: run.negative,
    };
    if (shot.end_frame) input.end_image_url = await upload(shot.end_frame);
    if (run.names.length) {
      input.elements = await Promise.all(
        run.names.map(async (name) => ({
          frontal_image_url: await upload(elements[name].frontal),
          reference_image_urls: await Promise.all(elements[name].references.map(upload)),
        })),
      );
    }

    console.log(`→ ${label}: submitted`);
    const result = await fal.subscribe(config.model, {
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
    writeFileSync(`${outDir}/${file}`, Buffer.from(await res.arrayBuffer()));

    // What was sent, with local file names instead of upload URLs, for the trials record.
    writeFileSync(
      `${outDir}/${shot.id}-take${run.take}.json`,
      JSON.stringify(
        {
          shot: shot.id,
          take: run.take,
          model: config.model,
          request_id: requestId,
          duration: shot.duration,
          audio: run.audio,
          start_frame: shot.start_frame,
          end_frame: shot.end_frame ?? null,
          elements: run.names.map((n, i) => ({ element: `@Element${i + 1}`, name: n, ...elements[n] })),
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
    console.log(`✓ ${label}: out/${scene.scene}/${file}  ($${run.cost.toFixed(2)}, ${wait} s)`);
  } catch (err) {
    const wait = Math.round((Date.now() - started) / 1000);
    const msg = err?.body?.detail ? JSON.stringify(err.body.detail) : err?.message ?? String(err);
    failures++;
    log(run, "", wait, requestId, `failed: ${msg}`);
    console.error(`✗ ${label}: ${msg}`);
  }
}

function log(run, file, wait, requestId, result) {
  const cells = [new Date().toISOString(), scene.scene, run.shot.id, run.take, file, run.shot.duration, run.audio ? "on" : "off",
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
