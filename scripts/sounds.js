#!/usr/bin/env node
// Makes every sound a scene needs apart from the voices (event sounds, movement, beds) on ElevenLabs Sound
// Effects, from the SOUNDS section of the scene's Sound script in Notion. One generation per sound; you listen
// and approve, then the sounds are uploaded to the scene's Scene SFX audio field. Motifs are made once and
// locked in the Asset Library, so they are listed but never generated here.
//
//   node scripts/sounds.js --scene 1 --print       every sound, its prompt and length, as read from Notion (free)
//   node scripts/sounds.js --scene 1 --dry-run     the credits it would use (free)
//   node scripts/sounds.js --scene 1               generate, wait for your OK, upload
//   node scripts/sounds.js --scene 1 --from-takes  skip generating: use the latest takes already in out/
//   node scripts/sounds.js --scene 1 --redo door-bang   make one again even though it is in Notion
//   node scripts/sounds.js --scene 1 --from-takes --approved --yes
//                                                  Vineet has listened and approved: upload without asking
//
// A sound already in the scene's Scene SFX audio is skipped. Takes land in out/sound/scene-01/<file>-take<N>.mp3
// (never overwritten), with a .json of what was sent.
import dotenv from "dotenv";
import { mkdirSync, existsSync, writeFileSync, appendFileSync, readdirSync, copyFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { parseArgs } from "node:util";
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import { loadConfig, fromRoot } from "../lib/project.js";
import { makeNotion } from "../lib/notion.js";
import { parseSounds } from "../lib/voice.js";

dotenv.config({ path: fromRoot(".env"), quiet: true });

const { values: opts } = parseArgs({
  options: {
    scene: { type: "string" },
    print: { type: "boolean", default: false },
    "dry-run": { type: "boolean", default: false },
    "from-takes": { type: "boolean", default: false },
    redo: { type: "string", multiple: true, default: [] },
    yes: { type: "boolean", default: false },
    approved: { type: "boolean", default: false },
  },
});

function fail(msg) {
  console.error(msg);
  process.exit(1);
}
const rl = createInterface({ input: process.stdin, output: process.stdout });
const ask = async (q) => (await rl.question(q)).trim();
function done(code = 0) {
  rl.close();
  process.exit(code);
}
let eleven;
function elevenLabs() {
  if (!process.env.ELEVENLABS_API_KEY) fail("ELEVENLABS_API_KEY is not set in .env");
  eleven ??= new ElevenLabsClient({ apiKey: process.env.ELEVENLABS_API_KEY, baseUrl: process.env.ELEVENLABS_BASE_URL || undefined });
  return eleven;
}

const config = loadConfig();
const sc = config.sound ?? {};
const sceneNo = Number(opts.scene);
if (!Number.isInteger(sceneNo) || sceneNo < 1) fail("Usage: node scripts/sounds.js --scene 1 [--print] [--dry-run] [--from-takes] [--redo <sound>] [--approved] [--yes]");

let notion, scene;
try {
  notion = makeNotion(config);
  scene = await notion.sceneByNumber(sceneNo);
} catch (err) {
  fail(`Notion: ${err?.message ?? err}`);
}
const sounds = parseSounds(scene.sound_script, sceneNo);
if (!sounds.length) fail(`Scene ${sceneNo} (${scene.title}) has no SOUNDS section in its Sound script: ${scene.notion.url}`);

const have = new Set(scene.sfx_files.map((n) => n.replace(/\.[^.]+$/, "").toLowerCase()));
const redo = new Set(opts.redo.flatMap((r) => r.split(",")).map((r) => r.trim().toLowerCase()).filter(Boolean));
const problems = [];
for (const s of sounds) {
  s.skip = s.kind === "motif" ? "motif: made once, from the Asset Library"
    : have.has(s.file.toLowerCase()) && !redo.has(s.name) ? "already in Notion" : null;
  if (!s.skip && !s.prompt) problems.push(`${s.name}: no prompt`);
  if (!s.skip && s.seconds != null && (s.seconds < 0.5 || s.seconds > 30)) problems.push(`${s.name}: ${s.seconds} s is outside ElevenLabs' 0.5–30 s`);
}

console.log(`Scene ${sceneNo}: ${scene.title}\n${scene.notion.url}\n`);
for (const s of sounds) {
  console.log(`• ${s.file}: ${s.kind}${s.seconds ? `, ${s.seconds} s` : ""}${s.loop ? ", loop" : ""}${s.skip ? ` · ${s.skip}` : ""}`);
  if (opts.print && s.prompt) console.log(`    ${s.prompt}${s.note ? `\n    (${s.note})` : ""}`);
}
if (problems.length) {
  console.error(`\nNot ready yet:\n  ${problems.join("\n  ")}`);
  done(1);
}
const todo = sounds.filter((s) => !s.skip);
if (!todo.length) {
  console.log("\nEvery sound is already in Notion. Use --redo <sound> to make one again.");
  done();
}
if (opts.print) done();

const outDir = `out/sound/scene-${String(sceneNo).padStart(2, "0")}`;
const ext = String(sc.output_format ?? "mp3_44100_128").split("_")[0];
const takesOf = (s) => (existsSync(fromRoot(outDir)) ? readdirSync(fromRoot(outDir)) : [])
  .map((f) => f.match(new RegExp(`^${s.file}-take(\\d+)\\.${ext}$`))?.[1]).filter(Boolean).map(Number).sort((a, b) => a - b);

// ElevenLabs charges per second of sound when the length is set; a sound without one is counted as 10 s.
const creditsOf = (list) => Math.round(list.reduce((t, s) => t + (s.seconds ?? 10), 0) * (sc.credits_per_second ?? 40));
async function spendOk(list, what) {
  const credits = creditsOf(list);
  let left = null;
  try {
    const s = await elevenLabs().user.subscription.get();
    left = s.characterLimit - s.characterCount;
  } catch {
    // The estimate is still right; only the balance is unknown.
  }
  console.log(`\n${what} on ${sc.model}: about ${credits} credits${left == null ? "" : ` of the ${left} left this month`}`);
  if (left != null && credits > left) fail("That's more than the credits left on the ElevenLabs plan.");
  if (opts["dry-run"]) done();
  if (opts.yes) return true;
  if (!process.stdin.isTTY) fail("Not run from a terminal, so nothing can be confirmed: run it yourself, or add --yes for a run Vineet approved.");
  return (await ask(`Use about ${credits} ElevenLabs credits? (y/N) `)).toLowerCase() === "y";
}

const logPath = fromRoot("voice-log.csv");
if (!existsSync(logPath)) appendFileSync(logPath, "time,scene,shot,line,speaker,take,file,characters,request_id,result\n");
function log(s, take, file, credits, requestId, result) {
  const cells = [new Date().toISOString(), `scene ${sceneNo}`, "", s.name, "sound", take, file, credits, requestId, result];
  appendFileSync(logPath, cells.map((c) => `"${String(c).replaceAll('"', '""')}"`).join(",") + "\n");
}

async function generate(s) {
  mkdirSync(fromRoot(outDir), { recursive: true });
  const take = (takesOf(s).at(-1) ?? 0) + 1;
  const file = `${outDir}/${s.file}-take${take}.${ext}`;
  let requestId = "";
  try {
    const { data, rawResponse } = await elevenLabs().textToSoundEffects
      .convert({
        text: s.prompt,
        modelId: sc.model,
        outputFormat: sc.output_format,
        promptInfluence: sc.prompt_influence ?? 0.3,
        loop: s.loop,
        ...(s.seconds != null && { durationSeconds: s.seconds }),
      })
      .withRawResponse();
    requestId = rawResponse.headers.get("request-id") ?? "";
    const credits = rawResponse.headers.get("character-cost") ?? "";
    writeFileSync(fromRoot(file), Buffer.from(await new Response(data).arrayBuffer()));
    writeFileSync(fromRoot(file.replace(/\.\w+$/, ".json")), JSON.stringify({
      scene: sceneNo, sound: s.name, kind: s.kind, take, notion_page: scene.notion.url, notion_last_edited: scene.notion.last_edited,
      model: sc.model, prompt: s.prompt, duration_seconds: s.seconds, loop: s.loop, prompt_influence: sc.prompt_influence ?? 0.3,
      note: s.note, credits: credits === "" ? null : Number(credits), request_id: requestId, created: new Date().toISOString(),
    }, null, 2));
    log(s, take, file, credits, requestId, "ok");
    s.take = take;
    s.path = file;
    console.log(`✓ ${s.name}: ${file}`);
  } catch (err) {
    const msg = err?.body ? JSON.stringify(err.body) : err?.message ?? String(err);
    log(s, take, "", 0, requestId, `failed: ${msg}`);
    console.error(`✗ ${s.name}: ${msg}`);
    if ([401, 402].includes(err?.statusCode)) fail("\nStopped: an ElevenLabs account problem, not a problem with the sounds. See voice-log.csv.");
  }
}

if (opts["from-takes"]) {
  for (const s of todo) {
    const take = takesOf(s).at(-1);
    if (!take) fail(`No take of ${s.file} in ${outDir} yet; run without --from-takes to make one.`);
    s.take = take;
    s.path = `${outDir}/${s.file}-take${take}.${ext}`;
  }
} else {
  if (!(await spendOk(todo, `${todo.length} sound(s), one take each`))) fail("Cancelled. Nothing was spent.");
  for (const s of todo) await generate(s);
}

let pending = todo.filter((s) => s.path);
const listFiles = () => pending.forEach((s) => console.log(`  ${s.name.padEnd(20)} ${fromRoot(s.path)}`));
if (!opts.approved && !process.stdin.isTTY) {
  console.log("\nListen to each file:");
  listFiles();
  console.log(`\nOnce Vineet has approved them: node scripts/sounds.js --scene ${sceneNo} --from-takes --approved --yes`);
  done();
}
while (!opts.approved) {
  console.log("\nListen to each file:");
  listFiles();
  const answer = (await ask("\nAll good? y = yes · or the ones to make again, e.g. door-bang, screams · n = stop: ")).toLowerCase();
  if (answer === "y" || answer === "yes") break;
  if (!answer || answer === "n" || answer === "no") {
    console.log(`Stopped. The takes stay in ${outDir}; run again with --from-takes to carry on from them.`);
    done();
  }
  const names = answer.split(",").map((a) => a.trim()).filter(Boolean);
  const again = pending.filter((s) => names.includes(s.name) || names.includes(s.file.toLowerCase()));
  if (!again.length) {
    console.log(`None of those matched: ${pending.map((s) => s.name).join(", ")}`);
    continue;
  }
  if (!(await spendOk(again, `Again: ${again.map((s) => s.name).join(", ")}`))) continue;
  for (const s of again) await generate(s);
}

// The approved take of each sound is uploaded under the sound's own name (S01-sfx-door-bang.mp3).
const upDir = fromRoot(`${outDir}/approved`);
mkdirSync(upDir, { recursive: true });
const paths = pending.map((s) => {
  const p = `${upDir}/${s.file}.${ext}`;
  copyFileSync(fromRoot(s.path), p);
  return p;
});
const go = opts.yes || (await ask(`\nUpload ${paths.length} sound(s) to scene ${sceneNo}'s Scene SFX audio in Notion? (y/N) `)).toLowerCase() === "y";
if (!go) {
  console.log("Not uploaded. Run again with --from-takes to upload them later.");
  done();
}
try {
  const now = await notion.attachFiles(scene.notion.id, config.notion.scene_fields.sfx_files, paths);
  console.log(`\n✓ Uploaded. Scene SFX audio on scene ${sceneNo} now holds ${now.length} file(s): ${scene.notion.url}`);
} catch (err) {
  const hint = ["restricted_resource", "unauthorized"].includes(err?.code)
    ? "\nThe Notion integration can't write yet: give \"physics-fal\" the Insert content and Update content capabilities (notion.so/profile/integrations)."
    : "";
  fail(`\n✗ Upload failed: ${err?.message ?? err}${hint}\nThe sounds are in ${outDir}; nothing in Notion was removed.`);
}
done();
