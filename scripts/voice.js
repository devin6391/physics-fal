#!/usr/bin/env node
// Makes a scene's dialogue on ElevenLabs, from the scene's Sound script in Notion (Scenes database).
// One request per speaker per Stability (a speaker's lines in a scene are generated together, separated by
// [long pause], so the voice stays the same), then: you listen and approve, it cuts each request into one file
// per line, and uploads the line files to the scene's Voice files field in Notion.
//
//   node scripts/voice.js --scene 1 --print       what it read from Notion and what it would send (free)
//   node scripts/voice.js --scene 1 --dry-run     check the voices and filters, show the characters (free)
//   node scripts/voice.js --scene 1               generate, wait for your OK, cut, upload
//   node scripts/voice.js --scene 1 --from-takes  skip generating: use the latest takes already in out/
//   node scripts/voice.js --scene 1 --redo priya  generate Priya again even though her lines are in Notion
//   node scripts/voice.js --scene 1 --from-takes --approved --yes
//                                                 Vineet has listened and approved the latest takes: cut and upload
//                                                 without asking (for running from Claude Code, which can't answer)
//   node scripts/voice.js --voices                list the voices on the ElevenLabs account
//
// A speaker whose line files are all in the scene's Voice files already is skipped. Requests land in
// out/voice/scene-01/<request>-take<N>.mp3 (never overwritten), their lines in out/voice/scene-01/<request>-take<N>/.
import dotenv from "dotenv";
import { mkdirSync, existsSync, writeFileSync, appendFileSync, readdirSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { parseArgs } from "node:util";
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import { loadConfig, fromRoot } from "../lib/project.js";
import { makeNotion } from "../lib/notion.js";
import { parseSoundScript, toRequests, kebab } from "../lib/voice.js";
import { checkFfmpeg, findLines, cutLines } from "../lib/audio.js";

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
    voices: { type: "boolean", default: false },
  },
});

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

let eleven;
function elevenLabs() {
  if (!process.env.ELEVENLABS_API_KEY) fail("ELEVENLABS_API_KEY is not set in .env");
  // ELEVENLABS_BASE_URL is only for pointing the project at a test server; leave it unset.
  eleven ??= new ElevenLabsClient({ apiKey: process.env.ELEVENLABS_API_KEY, baseUrl: process.env.ELEVENLABS_BASE_URL || undefined });
  return eleven;
}

const rl = createInterface({ input: process.stdin, output: process.stdout });
async function ask(q) {
  return (await rl.question(q)).trim();
}
function done(code = 0) {
  rl.close();
  process.exit(code);
}

const config = loadConfig();
const vc = config.voice ?? {};
const speakers = Object.fromEntries(Object.entries(vc.speakers ?? {}).map(([k, v]) => [k.toLowerCase(), v]));

if (opts.voices) {
  const { voices } = await elevenLabs().voices.search({ pageSize: 100 });
  for (const v of voices) {
    const l = v.labels ?? {};
    console.log(`${v.voiceId}  ${v.name}  (${[l.language, l.gender, l.age, l.accent].filter(Boolean).join(", ")})`);
  }
  done();
}

const sceneNo = Number(opts.scene);
if (!Number.isInteger(sceneNo) || sceneNo < 1) fail("Usage: node scripts/voice.js --scene 1 [--print] [--dry-run] [--from-takes] [--redo <speaker>] | --voices");

// 1. The scene's Sound script and what is already in its Voice files.
let notion, scene;
try {
  notion = makeNotion(config);
  scene = await notion.sceneByNumber(sceneNo);
} catch (err) {
  fail(`Notion: ${err?.message ?? err}`);
}
const lines = parseSoundScript(scene.sound_script);
if (!lines.length) fail(`Scene ${sceneNo} (${scene.title}) has no voice lines in its Sound script: ${scene.notion.url}`);
const requests = toRequests(lines, sceneNo);
const have = new Set(scene.voice_files.map((n) => n.replace(/\.[^.]+$/, "").toLowerCase()));
const redo = new Set(opts.redo.flatMap((r) => r.split(",")).map(kebab).filter(Boolean));

const problems = [];
for (const r of requests) {
  r.voiceId = speakers[r.voiceName.toLowerCase()] ?? null;
  if (!r.voiceId) problems.push(`${r.voiceName} has no voice id in config.yaml → voice.speakers`);
  if (r.stability == null) problems.push(`${r.voiceName}: no Stability in the Sound script (e.g. "Calm 50%")`);
  r.text = r.lines.map((l) => l.spoken).join(`\n${vc.pause ?? "[long pause]"}\n`);
  const inNotion = r.lines.filter((l) => have.has(l.file.toLowerCase())).length;
  r.done = inNotion === r.lines.length && !redo.has(kebab(r.voiceName)) && !redo.has(kebab(r.lines[0].section));
  r.partly = inNotion > 0 && !r.done;
}

const outDir = `out/voice/scene-${String(sceneNo).padStart(2, "0")}`;
const ext = String(vc.output_format ?? "mp3_44100_128").split("_")[0];
const takesOf = (r) => (existsSync(fromRoot(outDir)) ? readdirSync(fromRoot(outDir)) : [])
  .map((f) => f.match(new RegExp(`^${r.name}-take(\\d+)\\.${ext}$`))?.[1]).filter(Boolean).map(Number).sort((a, b) => a - b);

// The audio filter named in the Sound script ("Filter → Phone"), matched by name in ElevenLabs' catalog.
const todo = requests.filter((r) => !r.done);
if (todo.some((r) => r.filter) && !opts.print) {
  try {
    const { filterPresets } = await elevenLabs().audioEffects.getCatalog();
    for (const r of todo.filter((r) => r.filter)) {
      const hit = filterPresets.find((f) => f.name.toLowerCase() === r.filter.toLowerCase() || f.filterPresetId === r.filter.toLowerCase());
      if (hit) r.filterId = hit.filterPresetId;
      else problems.push(`ElevenLabs has no audio filter called "${r.filter}" (it has ${filterPresets.map((f) => f.name).join(", ")})`);
    }
  } catch (err) {
    problems.push(`could not read ElevenLabs' audio effects: ${err?.message ?? err}`);
  }
}

console.log(`Scene ${sceneNo}: ${scene.title}\n${scene.notion.url}\n`);
for (const r of requests) {
  const state = r.done ? "already in Notion, skipped" : r.partly ? "partly in Notion: all its lines are made again together" : `${r.text.length} characters`;
  console.log(`• ${r.name}: ${r.voiceName}, Stability ${Math.round((r.stability ?? 0) * 100)}%${r.filter ? `, filter ${r.filter}` : ""}, ${r.lines.length} line(s) · ${state}`);
  if (opts.print) {
    for (const l of r.lines) console.log(`    ${l.file}  (beat ${l.beat ?? "?"})  ${l.spoken}`);
    console.log();
  }
}
const uniq = [...new Set(problems)];
if (uniq.length) {
  console.error(`\nNot ready yet:\n  ${uniq.join("\n  ")}`);
  done(1);
}
if (!todo.length) {
  console.log("\nEvery speaker's lines are already in Notion. Use --redo <speaker> to make one again.");
  done();
}
if (opts.print) done();

checkFfmpeg();

// 2. Generate one take of each request (or reuse the latest take with --from-takes).
const chars = todo.reduce((s, r) => s + r.text.length, 0);
async function spendOk(characters, what) {
  let left = null;
  try {
    const s = await elevenLabs().user.subscription.get();
    left = s.characterLimit - s.characterCount;
  } catch {
    // The total is still right; only the balance is unknown.
  }
  console.log(`\n${what} on ${vc.model}: about ${characters} characters${left == null ? "" : ` of the ${left} left this month`}`);
  if (left != null && characters > left) fail("That's more than the characters left on the ElevenLabs plan.");
  if (opts["dry-run"]) done();
  if (opts.yes) return true;
  if (!process.stdin.isTTY) fail("Not run from a terminal, so nothing can be confirmed: run it yourself, or add --yes for a run Vineet approved.");
  return (await ask(`Use about ${characters} ElevenLabs characters? (y/N) `)).toLowerCase() === "y";
}

const logPath = fromRoot("voice-log.csv");
if (!existsSync(logPath)) appendFileSync(logPath, "time,scene,shot,line,speaker,take,file,characters,request_id,result\n");
function log(r, take, file, characters, requestId, result) {
  const cells = [new Date().toISOString(), `scene ${sceneNo}`, "", "all", r.voiceName, take, file, characters, requestId, result];
  appendFileSync(logPath, cells.map((c) => `"${String(c).replaceAll('"', '""')}"`).join(",") + "\n");
}

async function generate(r) {
  mkdirSync(fromRoot(outDir), { recursive: true });
  const take = (takesOf(r).at(-1) ?? 0) + 1;
  const file = `${outDir}/${r.name}-take${take}.${ext}`;
  let requestId = "";
  try {
    const { data, rawResponse } = await elevenLabs().textToSpeech
      .convert(r.voiceId, {
        text: r.text,
        modelId: vc.model,
        outputFormat: vc.output_format,
        voiceSettings: { stability: r.stability, similarityBoost: vc.similarity_boost },
        ...(r.filterId && { audioEffects: { filterPresetId: r.filterId } }),
      })
      .withRawResponse();
    requestId = rawResponse.headers.get("request-id") ?? "";
    const characters = rawResponse.headers.get("x-character-count") ?? r.text.length;
    writeFileSync(fromRoot(file), Buffer.from(await new Response(data).arrayBuffer()));
    writeFileSync(fromRoot(file.replace(/\.\w+$/, ".json")), JSON.stringify({
      scene: sceneNo, request: r.name, take, notion_page: scene.notion.url, notion_last_edited: scene.notion.last_edited,
      voice: r.voiceName, voice_id: r.voiceId, model: vc.model,
      voice_settings: { stability: r.stability, similarity_boost: vc.similarity_boost },
      audio_effects: r.filterId ? { filter_preset_id: r.filterId } : null,
      lines: r.lines.map((l) => ({ file: l.file, beat: l.beat, text: l.spoken })),
      text: r.text, characters: Number(characters), request_id: requestId, created: new Date().toISOString(),
    }, null, 2));
    log(r, take, file, characters, requestId, "ok");
    r.take = take;
    r.file = file;
    console.log(`✓ ${r.voiceName}: ${file}`);
    return true;
  } catch (err) {
    const msg = err?.body ? JSON.stringify(err.body) : err?.message ?? String(err);
    log(r, take, "", 0, requestId, `failed: ${msg}`);
    console.error(`✗ ${r.voiceName}: ${msg}`);
    if ([401, 402].includes(err?.statusCode)) fail("\nStopped: an ElevenLabs account problem, not a problem with the lines. See voice-log.csv.");
    return false;
  }
}

if (opts["from-takes"]) {
  for (const r of todo) {
    const take = takesOf(r).at(-1);
    if (!take) fail(`No take of ${r.name} in ${outDir} yet; run without --from-takes to make one.`);
    r.take = take;
    r.file = `${outDir}/${r.name}-take${take}.${ext}`;
    console.log(`Using ${r.file}`);
  }
} else {
  if (!(await spendOk(chars, `${todo.length} request(s), one take each`))) fail("Cancelled. Nothing was spent.");
  for (const r of todo) await generate(r);
}

// 3. Wait for Vineet to listen. He approves all, or names the ones to make again.
let pending = todo.filter((r) => r.file);
if (!opts.approved && !process.stdin.isTTY) {
  console.log("\nListen to each file:");
  pending.forEach((r) => console.log(`  ${r.voiceName.padEnd(14)} ${fromRoot(r.file)}`));
  console.log("\nOnce Vineet has approved them: node scripts/voice.js --scene " + sceneNo + " --from-takes --approved --yes");
  done();
}
while (!opts.approved) {
  console.log("\nListen to each file:");
  pending.forEach((r) => console.log(`  ${r.voiceName.padEnd(14)} ${fromRoot(r.file)}`));
  const answer = (await ask("\nAll good? y = yes · or the ones to make again, e.g. priya, hostel boy c · n = stop: ")).toLowerCase();
  if (answer === "y" || answer === "yes") break;
  if (!answer || answer === "n" || answer === "no") {
    console.log(`Stopped. The takes stay in ${outDir}; run again with --from-takes to carry on from them.`);
    done();
  }
  const names = answer.split(",").map(kebab).filter(Boolean);
  const again = pending.filter((r) => names.includes(kebab(r.voiceName)) || names.includes(kebab(r.name)));
  if (!again.length) {
    console.log(`None of those matched: ${pending.map((r) => r.voiceName).join(", ")}`);
    continue;
  }
  if (!(await spendOk(again.reduce((s, r) => s + r.text.length, 0), `Again: ${again.map((r) => r.voiceName).join(", ")}`))) continue;
  for (const r of again) await generate(r);
}

// 4. Cut each approved request into one file per line.
const cut = [];
for (const r of pending) {
  const found = findLines(fromRoot(r.file), r.lines.length, vc.split);
  if (!found) {
    console.error(`✗ ${r.voiceName}: could not find ${r.lines.length - 1} pauses in ${r.file}. Make it again, or cut it by hand.`);
    continue;
  }
  const dir = fromRoot(`${outDir}/${r.name}-take${r.take}`);
  const files = cutLines(fromRoot(r.file), found.spans, r.lines.map((l) => l.file), dir, vc.split);
  console.log(`\n✂ ${r.voiceName}: ${files.length} line files in ${dir}`);
  files.forEach((f, i) => console.log(`    ${f.name}  ${f.length.toFixed(2)} s  ${r.lines[i].spoken.slice(0, 60)}`));
  cut.push(...files);
}
if (!cut.length) done(1);

// 5. Upload the line files to the scene's Voice files in Notion.
const go = opts.yes || (await ask(`\nUpload ${cut.length} line file(s) to scene ${sceneNo}'s Voice files in Notion? (y/N) `)).toLowerCase() === "y";
if (!go) {
  console.log("Not uploaded. The line files are in out/; run again with --from-takes to upload them later.");
  done();
}
try {
  const now = await notion.attachFiles(scene.notion.id, config.notion.scene_fields.voice_files, cut.map((f) => f.path));
  console.log(`\n✓ Uploaded. Voice files on scene ${sceneNo} now holds ${now.length} file(s): ${scene.notion.url}`);
} catch (err) {
  const hint = ["restricted_resource", "unauthorized"].includes(err?.code)
    ? "\nThe Notion integration can't write yet: give \"physics-fal\" the Insert content and Update content capabilities (notion.so/profile/integrations)."
    : "";
  fail(`\n✗ Upload failed: ${err?.message ?? err}${hint}\nThe line files are in ${outDir}; nothing in Notion was removed.`);
}
done();
