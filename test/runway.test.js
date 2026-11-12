import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { loadConfig } from "../lib/project.js";
import { assembleRunwayPrompt, SECTIONS } from "../lib/prompt.js";
import { makeRunway, resolveRunwayInput, runwayCost, runwayImageDigest, runwayInput, runwayKling } from "../lib/runway.js";
import { genSeconds, validate } from "../lib/validate.js";

const config = loadConfig();
const aryan = { name: "aryan", frontal: { name: "face.jpg" }, references: [{ name: "sheet.jpg" }] };
const shot = {
  id: "FIXTURE",
  model: "Kling 4.0",
  duration: 28,
  start_frame: { name: "start.png" },
  end_frame: { name: "end.png" },
  prompt: {
    ...Object.fromEntries(SECTIONS.map(([name]) => [name, "Use the approved direction."])),
    characters: "@aryan sits beside the bed.",
    dialogue: "Aryan listens.",
    timing: "0–2 s: Aryan answers.",
  },
  characters: [aryan],
};

test("Kling 4.0 on Runway preserves the reviewed body while resolving the four media slots", async () => {
  assert.deepEqual(validate([shot], config, () => runwayKling), []);
  assert.match(validate([shot], config).join("\n"), /15 s/);
  assert.match(validate([{ ...shot, duration: 29 }], config, () => runwayKling).join("\n"), /30 s/);
  const crowded = { ...shot, characters: [{ ...aryan, references: Array(8).fill({ name: "sheet.jpg" }) }] };
  assert.match(validate([crowded], config, () => runwayKling).join("\n"), /10 images total/);

  const prompt = assembleRunwayPrompt(shot, config, [aryan]);
  assert.match(prompt, /Aryan sits beside the bed/);
  assert.match(prompt, /reference image 1.*Aryan's face close-up/);
  assert.match(prompt, /reference image 2.*Aryan's character sheet/);
  assert.match(prompt, /DIALOGUE AND TIMING\n/);
  assert.equal(prompt.split(config.keep_still_standard).length, 2);

  const reviewed = runwayInput({ prompt, seconds: genSeconds(shot, config) }, {
    start: "<upload 1>", end: "<upload 2>",
    elements: [{ frontal_image_url: "<upload 3>", reference_image_urls: ["<upload 4>"] }],
  });
  const media = ["start", "end", "face", "sheet"].map((path, i) => ({
    slot: `<upload ${i + 1}>`, path, sha256: `reviewed-${path}`,
  }));
  assert.deepEqual(await resolveRunwayInput(reviewed, media, async (path, digest) => {
    assert.equal(digest, `reviewed-${path}`);
    return `runway://${path}`;
  }), {
    model: "kling_4", duration: 30, ratio: "auto_1080p", promptText: prompt,
    promptImage: [{ position: "first", uri: "runway://start" }, { position: "last", uri: "runway://end" }],
    references: [{ uri: "runway://face" }, { uri: "runway://sheet" }],
  });
  assert.equal(runwayCost(30, Date.parse("2026-11-30T23:59:59Z")), 5.64);
  assert.equal(runwayCost(30, Date.parse("2026-12-01T00:00:00Z")), 7.05);
});

test("Runway uploads share a local file and keep API authentication off the storage request", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "physics-runway-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const path = join(dir, "frame.png");
  await writeFile(path, Buffer.alloc(512));
  const fetch = t.mock.method(globalThis, "fetch", async (url, options) => {
    const pathname = new URL(url).pathname;
    if (pathname === "/v1/organization") return Response.json({ creditBalance: 1000 });
    if (pathname === "/v1/uploads") {
      assert.equal(options.headers["X-Runway-Version"], "2024-11-06");
      assert.deepEqual(JSON.parse(options.body), { filename: "frame.png", type: "ephemeral" });
      return Response.json({ uploadUrl: "https://storage.example/upload", fields: { policy: "test" }, runwayUri: "runway://frame" });
    }
    assert.equal(url, "https://storage.example/upload");
    assert.equal(options.headers, undefined);
    assert.equal(options.body.get("policy"), "test");
    assert.equal(options.body.get("file").size, 512);
    return new Response(null, { status: 204 });
  });
  const client = makeRunway("test-key");
  assert.equal((await client.organization()).creditBalance, 1000);
  const approvedDigest = runwayImageDigest(Buffer.alloc(512));
  assert.deepEqual(await Promise.all([client.upload(path, approvedDigest), client.upload(path, approvedDigest)]), ["runway://frame", "runway://frame"]);
  await writeFile(path, Buffer.alloc(512, 1));
  await assert.rejects(makeRunway("test-key").upload(path, approvedDigest), /changed after preview/);
  assert.equal(fetch.mock.callCount(), 3);
});
