import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pageId, referenceFolder, resolveReferences, saveReferences } from "../lib/gemini-refs.js";

const id = "11111111-1111-1111-1111-111111111111";
const file = (name, key = "upload-a", query = "first") => ({ name, url: `https://example.com/${key}/${name}?signature=${query}` });
const ref = (label, filename) => ({ label, page: id, field: "Storyboard", file: filename });
function api(plan, files) {
  return {
    shotPageById: async () => ({ id, url: "https://app.notion.com/p/" + id }),
    pagePlan: async () => plan,
    filesOn: async () => files,
  };
}

test("resolves explicit upload order, not Notion attachment order", async () => {
  const bundle = await resolveReferences(api({ end: [ref("second", "b.png"), ref("first", "a.png")] }, [file("a.png"), file("b.png")]), "CO-01", "end");
  assert.deepEqual(bundle.refs.map((r) => r.file.name), ["b.png", "a.png"]);
  assert.match(bundle.refs[0].filename, /^01-second-/);
  assert.match(bundle.refs[1].filename, /^02-first-/);
});

test("fails closed for absent plans, missing files and ambiguous attachments", async () => {
  await assert.rejects(resolveReferences(api(null, []), "CO-01", "end"), /Gemini references/);
  await assert.rejects(resolveReferences(api({ start: [ref("one", "a.png")] }, []), "CO-01", "end"), /no end list/);
  await assert.rejects(resolveReferences(api({ end: [ref("one", "missing.png")] }, [file("a.png")]), "CO-01", "end"), /not found/);
  await assert.rejects(resolveReferences(api({ end: [{ label: "one", page: id, field: "Storyboard" }] }, [file("a.png"), file("b.png")]), "CO-01", "end"), /ambiguous/);
  await assert.rejects(resolveReferences(api({ end: [ref("one", "a.png")] }, [file("a.png"), file("a.png", "other")]), "CO-01", "end"), /ambiguous/);
});

test("rejects non-image references and invalid page links", async () => {
  await assert.rejects(resolveReferences(api({ end: [ref("one", "a.mp4")] }, [file("a.mp4")]), "CO-01", "end"), /reference must be/);
  assert.equal(pageId("https://app.notion.com/p/Room-" + id.replaceAll("-", "") + "?x=1"), id.replaceAll("-", ""));
  assert.throws(() => pageId("https://example.com/" + id), /Notion URL/);
  assert.throws(() => pageId("not-an-id"), /Invalid/);
});

test("expired signatures keep the same name; a replacement upload gets a new one", async () => {
  const plan = { end: [ref("one", "a.png")] };
  const get = async (key, signature) => (await resolveReferences(api(plan, [file("a.png", key, signature)]), "CO-01", "end")).refs[0].filename;
  assert.equal(await get("old", "expired"), await get("old", "fresh"));
  assert.notEqual(await get("old", "fresh"), await get("replacement", "fresh"));
});

test("output labels cannot escape the reference folder", async () => {
  const bundle = await resolveReferences(api({ end: [ref("../../outside", "a.png")] }, [file("a.png")]), "../../CO-01", "end");
  assert.equal(bundle.refs[0].filename.includes("/"), false);
  assert.match(referenceFolder("../../CO-01", "end"), /out\/refs\/CO-01\/end$/);
});

test("downloads once, skips existing files, and preserves replaced inputs", async () => {
  const dir = mkdtempSync(join(tmpdir(), "physics-refs-"));
  try {
    const cache = join(dir, "cache.png");
    writeFileSync(cache, "first-image");
    let downloads = 0;
    const downloadImage = async () => { downloads++; return { path: cache }; };
    const plan = { end: [ref("one", "a.png")] };
    const first = await resolveReferences(api(plan, [file("a.png")]), "CO-01", "end");
    const options = { folder: join(dir, "out"), downloadImage };
    const [saved] = await saveReferences(first, options);
    assert.equal(saved.fresh, true);
    assert.equal((await saveReferences(first, options))[0].fresh, false);
    assert.equal(downloads, 1);
    writeFileSync(cache, "replacement-image");
    const next = await resolveReferences(api(plan, [file("a.png", "replacement")]), "CO-01", "end");
    const [replacement] = await saveReferences(next, options);
    assert.notEqual(replacement.path, saved.path);
    assert.equal(readFileSync(saved.path, "utf8"), "first-image");
    assert.equal(readFileSync(replacement.path, "utf8"), "replacement-image");
    writeFileSync(replacement.path, "");
    await assert.rejects(saveReferences(next, options), /not a non-empty file/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
