#!/usr/bin/env node
// Generates Kling clips from Notion: Kling 4.0 on Runway Dev and Kling 3.0 on fal.
//
//   node scripts/generate.js CO-02a                     one shot (several: CO-02a CO-02b or CO-02a,CO-02b)
//   node scripts/generate.js --section "Cold open"      every supported shot in a section whose prompt is written
//   node scripts/generate.js CO-02a --takes 2           two takes of each shot
//   node scripts/generate.js CO-02a --print             show the exact prompt as read from Notion, spend nothing
//   node scripts/generate.js CO-02a --dry-run           check Notion and the local images, show the cost, spend nothing
//   node scripts/generate.js CO-02a --provider fal --yes  run the exact preapproved fal request
//   node scripts/generate.js --runway-check             check the API key and credit balance without generating
//
// Every run reads the prompt, duration, frames and characters straight from the shot's row in Notion.
// The images are uploaded from their local copies, which npm run pull downloads beforehand.
// Clips land in out/<section>/<shot>-take<N>.mp4 (an earlier take is never overwritten),
// each with a .json beside it recording exactly what was sent. Every run is appended to log.csv.
import "dotenv/config";
import { mkdirSync, existsSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { basename } from "node:path";
import { once } from "node:events";
import { createInterface } from "node:readline/promises";
import { parseArgs } from "node:util";
import { fal } from "@fal-ai/client";
import { loadConfig, fromRoot } from "../lib/project.js";
import { SECTIONS, assemblePrompt, assembleRunwayPrompt, toFalElements } from "../lib/prompt.js";
import { validate, genSeconds } from "../lib/validate.js";
import { makeNotion, localCopy, slug, generatableShots } from "../lib/notion.js";
import { makeUploader } from "../lib/uploads.js";
import {
  makeRunway, resolveRunwayInput, runwayCost, runwayImageDigest, runwayInput, runwayKling,
  RUNWAY_API, RUNWAY_API_VERSION, RUNWAY_GENERATION_PATH, RUNWAY_UPLOAD_PATH,
} from "../lib/runway.js";

const { values: opts, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    section: { type: "string" },
    takes: { type: "string", default: "1" },
    print: { type: "boolean", default: false },
    "dry-run": { type: "boolean", default: false },
    yes: { type: "boolean", default: false },
    provider: { type: "string" },
    "runway-check": { type: "boolean", default: false },
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
const runwayKey = process.env.RUNWAYML_API_SECRET;
const missingRunwayKey = "RUNWAYML_API_SECRET is not set. Add the Runway Dev API key to .env. See README.md → Runway Dev setup.";
if (opts["runway-check"]) {
  if (process.argv.length !== 3) fail("Use --runway-check on its own.");
  if (!runwayKey) fail(missingRunwayKey);
  try {
    const org = await makeRunway(runwayKey).organization();
    console.log(`Runway Dev connected. API balance: ${org.creditBalance} credits.`);
  } catch (err) {
    fail(err.message);
  }
  process.exit(0);
}
if (!!opts.section === !!ids.length) fail('Usage: node scripts/generate.js CO-02a [CO-02b ...] | --section "Cold open" [--provider runway|fal] [--takes N] [--print] [--dry-run] [--yes]');
if (opts.provider && !["runway", "fal"].includes(opts.provider)) fail("--provider must be runway or fal.");

const config = loadConfig();
const modelFor = (shot) => shot.model === "Kling 4.0" && opts.provider !== "fal" ? runwayKling : config.models[shot.model];
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
  shots = generatableShots(shots, config);
  const unwritten = shots.filter((s) => SECTIONS.every(([key]) => !s.prompt[key]));
  if (unwritten.length) console.log(`Prompt not written in Notion yet, skipped: ${unwritten.map((s) => s.id).join(", ")}`);
  shots = shots.filter((s) => !unwritten.includes(s));
}
if (!shots.length) fail("No shots to run.");
if (opts.provider === "runway") {
  const unsupported = shots.filter((shot) => shot.model !== "Kling 4.0");
  if (unsupported.length) fail(`The Runway route requires Kling 4.0 in Notion. Check: ${unsupported.map((shot) => shot.id).join(", ")}.`);
}

// Build every request first, so all checks happen before any money is spent.
const audio = config.audio ?? false;
const pricedAt = Date.now();
const jobs = shots.map((shot) => {
  const model = modelFor(shot);
  const provider = model?.provider ?? "fal";
  const v3 = model?.request === "kling-v3";
  const { text, names } = toFalElements(assemblePrompt(shot, config));
  const characters = names.map((name) => shot.characters.find((character) => character.name === name));
  const seconds = genSeconds(shot, config);
  return {
    shot,
    model,
    provider,
    prompt: provider === "runway" ? assembleRunwayPrompt(shot, config, characters) : text,
    names,
    characters,
    negative: v3 ? config.negative_prompt : null,
    audioLabel: v3 ? (audio ? "on" : "off") : "native",
    seconds,
    cost: provider === "runway" ? runwayCost(seconds, pricedAt) : seconds * (model?.usd_per_second ?? 0),
    outDir: `out/${slug(shot.section) || "unsorted"}`,
  };
});

const problems = validate(shots, config, modelFor);
const providerLabel = (provider) => provider === "runway" ? "Runway Dev" : "fal";

function prepareRunwayReview(job, withLocalFiles = false) {
  const media = [];
  const image = (file, role, path) => {
    if (!file) return `<missing ${role}>`;
    const slot = `<upload ${media.length + 1}>`;
    const entry = { slot, role, notion_file: file.name };
    if (withLocalFiles) {
      const bytes = readFileSync(fromRoot(path));
      Object.assign(entry, {
        path: fromRoot(path),
        bytes: bytes.length,
        sha256: runwayImageDigest(bytes),
        upload_body: { filename: basename(path), type: "ephemeral" },
      });
    }
    media.push(entry);
    return slot;
  };
  const { shot } = job;
  const body = runwayInput(job, {
    start: image(shot.start_frame, "first frame", job.startPath),
    end: shot.end_frame ? image(shot.end_frame, "last frame", job.endPath) : null,
    elements: job.characters.map((c, i) => c && ({
      frontal_image_url: image(c.frontal, `${c.name} face close-up`, job.elementPaths?.[i]?.frontal),
      reference_image_urls: c.references.map((ref, k) =>
        image(ref, `${c.name} character sheet`, job.elementPaths?.[i]?.references[k])),
    })).filter(Boolean),
  });
  return { body, media };
}

function showRunwayReview(job, { body, media }) {
  console.log(`\n===== Runway request for ${job.shot.id} · ${takes} take(s) =====`);
  console.log(`Notion: ${job.shot.notion.url}`);
  console.log(`Scene length ${job.shot.duration} s · generated ${job.seconds} s · ${job.model.resolution} · native audio · estimated ${Math.round(job.cost * 100)} API credits ($${job.cost.toFixed(2)}) per take`);
  console.log(`POST ${RUNWAY_API}${RUNWAY_GENERATION_PATH}\nX-Runway-Version: ${RUNWAY_API_VERSION}\nContent-Type: application/json\nAuthorization: Bearer [redacted]`);
  console.log(JSON.stringify(body, null, 2));
  console.log(`\nMedia slots resolve to Runway URIs after POST ${RUNWAY_API}${RUNWAY_UPLOAD_PATH} and a multipart upload to the returned URL.`);
  console.log(JSON.stringify(media, null, 2));
  console.log(`Polling: GET ${RUNWAY_API}/tasks/{task_id}, then download the output video URL.`);
  console.log(`\nFull prompt\n${body.promptText}`);
}

if (opts.print) {
  for (const j of jobs) {
    if (j.provider === "runway") {
      showRunwayReview(j, prepareRunwayReview(j));
      continue;
    }
    console.log(`\n===== ${j.shot.id} · ${j.shot.model ?? "no Model"} on ${providerLabel(j.provider)} · ${j.shot.duration} s in the scene, generated ${j.seconds} s · audio ${j.audioLabel} · ${j.shot.notion.url} =====`);
    console.log(`Start frame: ${j.shot.start_frame?.name ?? "(empty)"}${j.shot.end_frame ? `   End frame: ${j.shot.end_frame.name}` : ""}`);
    j.names.forEach((n, i) => console.log(`@Element${i + 1} = ${n}`));
    console.log(`\n${j.prompt}`);
    if (j.negative) console.log(`\nNEGATIVE PROMPT\n${j.negative}`);
  }
  if (problems.length) fail(`\nNot ready to generate yet:\n  ${problems.join("\n  ")}`);
  process.exit(0);
}
if (problems.length) fail(`Fix these in Notion first:\n  ${problems.join("\n  ")}`);

// Images are uploaded from their local copies only; this script never downloads from Notion.
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
  console.log(`  ${j.shot.id.padEnd(8)} ${j.shot.model.padEnd(10)} ${providerLabel(j.provider)}  ${String(j.seconds).padStart(2)} s  $${(j.cost * takes).toFixed(2)}${els}`);
}
console.log(`Total: about $${total.toFixed(2)}`);
if (opts["dry-run"]) process.exit(0);

const providers = [...new Set(jobs.map((job) => job.provider))];
const hasRunway = providers.includes("runway");
if (hasRunway && opts.yes) fail("Runway requires a live y/n decision after its request preview. Remove --yes.");
if (hasRunway && !process.stdin.isTTY) fail("Runway requires an interactive terminal for approval. Run without piped input, or start the command in an interactive agent session.");
if (providers.includes("fal") && !process.env.FAL_KEY) fail("FAL_KEY is not set. See README.md → Setup.");
if (hasRunway && !runwayKey) fail(missingRunwayKey);
if (hasRunway) {
  for (const j of jobs.filter((job) => job.provider === "runway")) {
    j.runwayReview = prepareRunwayReview(j, true);
    showRunwayReview(j, j.runwayReview);
  }
}
if (!opts.yes) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  let answer;
  try {
    answer = await Promise.race([
      rl.question(`\nProceed with the displayed request(s) for about $${total.toFixed(2)} on ${providers.map(providerLabel).join(" and ")}? (y/n, default n) `),
      once(rl, "close").then(() => ""),
    ]);
  } finally {
    rl.close();
  }
  const choices = hasRunway ? ["y", "yes"] : ["y"];
  if (!choices.includes(answer.trim().toLowerCase())) {
    if (!hasRunway) fail("Cancelled. Nothing was spent.");
    console.log("Cancelled. Nothing was spent.");
    process.exit(0);
  }
}
if (jobs.some((job) => job.provider === "runway" && runwayCost(job.seconds) !== job.cost)) {
  fail("The Runway price estimate changed during review. Run the command again to review the new price.");
}

const runway = providers.includes("runway") ? makeRunway(runwayKey) : null;
let uploadToFal;
if (providers.includes("fal")) {
  fal.config({ credentials: process.env.FAL_KEY });
  uploadToFal = makeUploader(config);
}

// Reserve a sidecar atomically before uploading, including across concurrent commands.
const runs = [];
for (const job of jobs) {
  mkdirSync(fromRoot(job.outDir), { recursive: true });
  for (let take = 1, reserved = 0; reserved < takes; take++) {
    const file = `${job.shot.id}-take${take}.mp4`;
    const sidecar = fromRoot(`${job.outDir}/${job.shot.id}-take${take}.json`);
    if (existsSync(fromRoot(`${job.outDir}/${file}`))) continue;
    const run = { ...job, take, file, sidecar, created: new Date().toISOString() };
    try {
      writeFileSync(sidecar, JSON.stringify(takeRecord(run, "reserved"), null, 2), { flag: "wx" });
    } catch (err) {
      if (err.code === "EEXIST") continue;
      throw err;
    }
    runs.push(run);
    reserved++;
  }
}

let failures = 0;
const logPath = fromRoot("log.csv");
if (!existsSync(logPath)) appendFileSync(logPath, "time,scene,shot,model,take,file,duration_s,audio,usd,wait_s,request_id,result\n");

// The request body for each kind of model, matching its schema on fal.
function buildFalInput(run, urls) {
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
    let videoUrl;
    if (run.provider === "runway") {
      const { body, media } = run.runwayReview;
      const input = await resolveRunwayInput(body, media, runway.upload);
      if (runwayCost(run.seconds) !== run.cost) throw new Error("The Runway price estimate changed before submission. Review the new price.");
      console.log(`→ ${label}: submitting to ${shot.model} on Runway Dev`);
      const { id } = await runway.submit(input);
      if (!id) throw new Error("Runway did not return a task ID. Check Runway Dev before submitting again.");
      requestId = id;
      console.log(`  ${label}: Runway task ${requestId}`);
      saveRecord(run, "submitted", { request_id: requestId });
      videoUrl = await runway.waitForVideo(requestId);
    } else {
      const urls = {
        start: await uploadToFal(run.startPath),
        end: run.endPath ? await uploadToFal(run.endPath) : null,
        elements: await Promise.all(
          run.elementPaths.map(async (el) => ({
            frontal_image_url: await uploadToFal(el.frontal),
            reference_image_urls: await Promise.all(el.references.map(uploadToFal)),
          })),
        ),
      };
      console.log(`→ ${label}: submitting to ${shot.model} on fal`);
      const result = await fal.subscribe(run.model.endpoint, {
        input: buildFalInput(run, urls),
        logs: false,
        onEnqueue: (id) => (requestId = id),
        onQueueUpdate: (u) => {
          if (u.status === "IN_QUEUE" && u.queue_position != null) console.log(`  ${label}: in queue, position ${u.queue_position}`);
        },
      });
      requestId = result.requestId ?? requestId;
      videoUrl = result.data?.video?.url;
    }

    if (!videoUrl) throw new Error(`${providerLabel(run.provider)} returned no video`);
    const res = await fetch(videoUrl, { signal: AbortSignal.timeout(120000) });
    if (!res.ok) throw new Error(`video download failed: HTTP ${res.status}`);
    writeFileSync(fromRoot(`${run.outDir}/${run.file}`), Buffer.from(await res.arrayBuffer()), { flag: "wx" });
    saveRecord(run, "ok", { request_id: requestId, video_url: videoUrl });
    const wait = Math.round((Date.now() - started) / 1000);
    log(run, run.file, wait, requestId, "ok");
    console.log(`✓ ${label}: ${run.outDir}/${run.file}  (estimated $${run.cost.toFixed(2)}, ${wait} s)`);
  } catch (err) {
    const wait = Math.round((Date.now() - started) / 1000);
    const msg = err?.body?.detail ? JSON.stringify(err.body.detail) : err?.message ?? String(err);
    failures++;
    log(run, "", wait, requestId, `failed: ${msg}`);
    saveRecord(run, "failed", { request_id: requestId, error: msg });
    console.error(`✗ ${label}: ${msg}${requestId ? ` (request ${requestId})` : ""}`);
  }
}

function takeRecord(run, status, details = {}) {
  const { shot } = run;
  return {
    shot: shot.id,
    take: run.take,
    notion_page: shot.notion.url,
    notion_last_edited: shot.notion.last_edited,
    model: shot.model,
    provider: run.provider,
    endpoint: run.model.endpoint,
    duration: run.seconds,
    scene_length: shot.duration,
    audio: run.audioLabel,
    resolution: run.model.resolution ?? null,
    start_frame: shot.start_frame.name,
    end_frame: shot.end_frame?.name ?? null,
    elements: run.characters.map((c, i) => ({
      ...(run.provider === "fal" ? { element: `@Element${i + 1}` } : {}),
      name: c.name,
      notion_page: c.notion,
      frontal: c.frontal.name,
      references: c.references.map((r) => r.name),
    })),
    prompt: run.prompt,
    negative_prompt: run.negative,
    usd: run.cost,
    ...(run.runwayReview ? { runway_request: run.runwayReview } : {}),
    status,
    created: run.created,
    ...details,
  };
}

function saveRecord(run, status, details) {
  writeFileSync(run.sidecar, JSON.stringify(takeRecord(run, status, details), null, 2));
}

function log(run, file, wait, requestId, result) {
  const cells = [new Date().toISOString(), slug(run.shot.section), run.shot.id, run.shot.model, run.take, file, run.seconds, run.audioLabel,
    result === "ok" ? run.cost.toFixed(2) : "", wait, requestId, result];
  appendFileSync(logPath, cells.map((c) => `"${String(c).replaceAll('"', '""')}"`).join(",") + "\n");
}

// Run with at most `parallel` clips at once.
const queue = [...runs];
const workers = Array.from({ length: Math.min(config.parallel ?? 4, queue.length) }, async () => {
  while (queue.length) await runOne(queue.shift());
});
await Promise.all(workers);

if (failures) {
  console.error(`\n${failures} of ${runs.length} clip(s) failed. See log.csv and check provider activity for any submitted tasks before retrying.`);
  process.exitCode = 1;
}
