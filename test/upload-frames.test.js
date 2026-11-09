import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ROOT } from "../lib/project.js";

const run = promisify(execFile);
const pageId = "11111111-1111-1111-1111-111111111111";

async function fixture(t, files = [], { source = "84f0353c-eb31-4810-8c44-87bd41c3b24a", fieldType = "files" } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "physics-frame-upload-"));
  const image = join(dir, "frame.jpg");
  writeFileSync(image, "test-image");
  const attachments = files.map(name => ({ name, type: "file", file: { url: "https://example.com/" + name } }));
  const page = {
    id: pageId, url: "https://notion.so/" + pageId,
    parent: { type: "data_source_id", data_source_id: source },
    properties: {
      Scene: { type: "title", title: [{ plain_text: "Test scene" }] },
      "Sound script": { type: "rich_text", rich_text: [] },
      "Voice files": { type: "files", files: [] },
      "Scene SFX audio": { type: "files", files: [] },
      "End frame": { type: "files", files: attachments },
      "Master still": { type: fieldType, [fieldType]: fieldType === "files" ? attachments : [] },
      Storyboard: { type: "files", files: attachments },
    },
  };
  const requests = [];
  const server = createServer(async (req, res) => {
    let body = "";
    for await (const chunk of req) body += chunk;
    requests.push({ method: req.method, url: req.url, body });
    res.setHeader("Content-Type", "application/json");
    if (req.method === "POST" && req.url.endsWith("/query")) {
      res.end(JSON.stringify({ object: "list", results: [page], has_more: false, next_cursor: null }));
    } else if (req.method === "GET" && req.url.replaceAll("-", "").endsWith("/pages/" + pageId.replaceAll("-", ""))) {
      res.end(JSON.stringify(page));
    } else {
      res.statusCode = 500;
      res.end(JSON.stringify({ message: "Unexpected write during test" }));
    }
  });
  t.after(async () => {
    if (server.listening) await new Promise(resolve => server.close(resolve));
    rmSync(dir, { recursive: true, force: true });
  });
  await new Promise((resolve, reject) => server.once("error", reject).listen(0, "127.0.0.1", resolve));
  const invoke = (...args) => run(process.execPath, ["scripts/upload.js", ...args], {
    cwd: ROOT,
    env: { ...process.env, NOTION_TOKEN: "test-token", NOTION_BASE_URL: `http://127.0.0.1:${server.address().port}` },
  });
  return { image, requests, invoke, dir };
}

test("frame dry run resolves the shot and correct field without uploading", async t => {
  const f = await fixture(t);
  const { stdout } = await f.invoke("--shot", "CO-01", "end-frame", f.image, "--dry-run");
  assert.match(stdout, /CO-01 → End frame/);
  assert.match(stdout, /Dry run: 1 file/);
  assert.equal(f.requests.length, 2);
  assert.match(f.requests[0].url, /data_sources/);
  assert.equal(JSON.parse(f.requests[0].body).filter.title.equals, "CO-01");
  assert.equal(f.requests[1].method, "GET");
});

test("an occupied frame field blocks replacement and leaves attachments intact", async t => {
  const f = await fixture(t, ["approved-frame.jpg"]);
  await assert.rejects(f.invoke("--shot", "CO-01", "end-frame", f.image), err => {
    assert.match(err.stderr, /End frame already contains: approved-frame.jpg/);
    assert.match(err.stderr, /Nothing was replaced/);
    return true;
  });
  assert.equal(f.requests.length, 2);
});

test("conflicting targets and force on frame uploads stop before contacting Notion", async t => {
  const f = await fixture(t);
  await assert.rejects(f.invoke("--shot", "CO-01", "--scene", "1", "end-frame", f.image));
  await assert.rejects(f.invoke("--shot", "CO-01", "end-frame", f.image, "--force"));
  assert.equal(f.requests.length, 0);
});

test("custom scene image field accepts multiple images and resolves the scene number", async t => {
  const f = await fixture(t, [], { source: "f03b3f2a-b9f4-432a-9b8f-9ce47e41d4d9" });
  const second = join(f.dir, "another.png");
  writeFileSync(second, "second-image");
  const { stdout } = await f.invoke("--scene", "1", "--field", "Master still", f.image, second, "--dry-run");
  assert.match(stdout, /Scene 1, Test scene → Master still/);
  assert.match(stdout, /Dry run: 2 file/);
  assert.equal(JSON.parse(f.requests[0].body).filter.number.equals, 1);
  assert.equal(f.requests.length, 2);
});

test("direct page URL works only for rows in the configured production databases", async t => {
  const f = await fixture(t);
  const { stdout } = await f.invoke("--page", "https://app.notion.com/p/CO-01-" + pageId.replaceAll("-", ""), "--field", "End frame", f.image, "--dry-run");
  assert.match(stdout, /Dry run: 1 file/);
  assert.equal(f.requests.length, 2);
  assert.equal(f.requests.every(r => r.method === "GET"), true);
  const outside = await fixture(t, [], { source: "outside-project" });
  await assert.rejects(outside.invoke("--page", pageId, "--field", "Master still", outside.image), err => {
    assert.match(err.stderr, /active row in this project's Shots or Scenes/);
    return true;
  });
  assert.equal(outside.requests.length, 1);
});

test("custom mode validates Files fields and protects existing filename stems", async t => {
  const textField = await fixture(t, [], { fieldType: "rich_text" });
  await assert.rejects(textField.invoke("--shot", "CO-01", "--field", "Master still", textField.image), err => {
    assert.match(err.stderr, /not a files field/);
    return true;
  });
  const collision = await fixture(t, ["frame.png"]);
  await assert.rejects(collision.invoke("--shot", "CO-01", "--field", "Master still", collision.image), err => {
    assert.match(err.stderr, /already contains frame.png/);
    assert.match(err.stderr, /Nothing was replaced/);
    return true;
  });
  assert.equal(collision.requests.length, 2);
});

test("custom field cannot bypass the single-frame safeguard", async t => {
  const f = await fixture(t, ["approved-frame.jpg"]);
  await assert.rejects(f.invoke("--shot", "CO-01", "--field", "End frame", f.image), err => {
    assert.match(err.stderr, /End frame already contains: approved-frame.jpg/);
    return true;
  });
  const invalid = join(f.dir, "audio.mp3");
  writeFileSync(invalid, "audio");
  await assert.rejects(f.invoke("--scene", "1", "--field", "Storyboard", invalid));
  assert.equal(f.requests.length, 2);
});

test("existing scene stage syntax still resolves its configured files field", async t => {
  const f = await fixture(t, [], { source: "f03b3f2a-b9f4-432a-9b8f-9ce47e41d4d9" });
  const { stdout } = await f.invoke("--scene", "1", "storyboard", f.image, "--dry-run");
  assert.match(stdout, /Scene 1, Test scene → Storyboard/);
  assert.match(stdout, /Dry run: 1 file/);
});
