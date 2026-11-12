// Reads shots and character images from Notion, the source of truth, with the Notion SDK.
// The Notion field names live in config.yaml (notion:), so a renamed field is a one-line change there.
import { mkdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { extname } from "node:path";
import { Client, LogLevel, collectPaginatedAPI } from "@notionhq/client";
import { fromRoot, resolveImage, IMAGE_EXTS } from "./project.js";
import { SECTIONS } from "./prompt.js";
import { pageId as parsePageId } from "./notion-id.js";

const CACHE_DIR = ".cache/notion";
const TYPE_EXTS = { "image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp" };
const CONTENT_TYPES = {
  ".mp3": "audio/mpeg", ".wav": "audio/wav", ".m4a": "audio/mp4", ".aac": "audio/aac",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp",
  ".mp4": "video/mp4", ".mov": "video/quicktime", ".webm": "video/webm", ".pdf": "application/pdf",
};
// The file type Notion is told about, from the file's extension.
export function contentType(name) {
  return CONTENT_TYPES[extname(name).toLowerCase()] ?? "application/octet-stream";
}

// "Auto driver" → auto_driver, the way characters are named in prompts (@auto_driver).
export function slug(text) {
  return String(text ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

// Splits a section's shots into those made by the generator (their Model is in config.models) and the rest,
// and says which were left out, so a renamed or new Model in Notion never drops shots silently.
export function generatableShots(shots, config) {
  const other = shots.filter((s) => !config.models[s.model]);
  if (other.length) console.log(`Model not supported by the generator, skipped: ${other.map((s) => `${s.id} (${s.model ?? "empty"})`).join(", ")}`);
  return shots.filter((s) => config.models[s.model]);
}

export function makeNotion(config) {
  if (!process.env.NOTION_TOKEN) throw new Error("NOTION_TOKEN is not set. See README.md → Notion setup.");
  const nc = config.notion;
  const f = nc.fields;
  const af = nc.asset_fields;
  // NOTION_BASE_URL is only for pointing the project at a test server; leave it unset.
  const client = new Client({ auth: process.env.NOTION_TOKEN, logLevel: LogLevel.ERROR, baseUrl: process.env.NOTION_BASE_URL || undefined });

  function prop(page, field) {
    const p = page.properties?.[field];
    if (!p) throw new Error(`Notion has no "${field}" field (check config.yaml → notion)`);
    return p;
  }

  // A page lists at most 25 pieces of rich text per field; longer text is fetched in full.
  async function text(page, field) {
    const p = prop(page, field);
    let items = p[p.type] ?? [];
    if (items.length >= 25) {
      const all = await collectPaginatedAPI(client.pages.properties.retrieve, { page_id: page.id, property_id: p.id });
      items = all.map((r) => r[r.type]);
    }
    return items.map((t) => t.plain_text).join("");
  }

  function files(page, field) {
    const p = prop(page, field);
    if (p.type !== "files") throw new Error(`"${field}" is not a files field`);
    return p.files.map((x) => ({ name: x.name, url: x.type === "file" ? x.file.url : x.external.url }));
  }

  const select = (page, field) => prop(page, field).select?.name ?? null;

  const assets = new Map();
  function asset(id) {
    if (!assets.has(id)) assets.set(id, client.pages.retrieve({ page_id: id }));
    return assets.get(id);
  }

  async function toShot(page) {
    const prompt = {};
    for (const [key] of SECTIONS) prompt[key] = (await text(page, f.prompt[key])).trim();

    // Places and items have no Kling element: the room comes from the start frame.
    const characters = [];
    for (const rel of prop(page, f.elements).relation ?? []) {
      const a = await asset(rel.id);
      if (select(a, af.class) !== nc.character_class) continue;
      characters.push({
        name: slug(await text(a, af.name)),
        notion: a.url,
        frontal: files(a, af.face)[0] ?? null,
        references: files(a, af.sheet).slice(0, 1),
      });
    }

    return {
      id: (await text(page, f.shot)).trim(),
      section: select(page, f.section),
      model: select(page, f.model),
      duration: prop(page, f.duration).number,
      start_frame: files(page, f.start_frame)[0] ?? null,
      end_frame: files(page, f.end_frame)[0] ?? null,
      prompt,
      characters,
      notion: { url: page.url, last_edited: page.last_edited_time },
    };
  }

  async function shotsByIds(ids) {
    const shots = [];
    for (const id of ids) {
      const r = await client.dataSources.query({
        data_source_id: nc.shots_data_source,
        filter: { property: f.shot, title: { equals: id } },
      });
      if (!r.results.length) throw new Error(`no shot called ${id} in the Shots database`);
      if (r.results.length > 1) throw new Error(`${r.results.length} shots are called ${id} in the Shots database; rename the extra ones`);
      shots.push(await toShot(r.results[0]));
    }
    return shots;
  }

  // Frame-reference downloads also work before a shot has its clip fields filled.
  async function shotPageById(id) {
    const r = await client.dataSources.query({
      data_source_id: nc.shots_data_source,
      filter: { property: f.shot, title: { equals: id } },
    });
    if (!r.results.length) throw new Error(`no shot called ${id} in the Shots database`);
    if (r.results.length > 1) throw new Error(`more than one shot is called ${id}; fix the duplicate rows`);
    return { id: r.results[0].id, url: r.results[0].url };
  }

  // A direct upload target must be a row in this project's configured Shots or Scenes database.
  async function productionPage(idOrUrl) {
    const page = await client.pages.retrieve({ page_id: parsePageId(idOrUrl) });
    const source = page.parent?.data_source_id?.replaceAll("-", "");
    const kind = source === nc.shots_data_source?.replaceAll("-", "") ? "shot"
      : source === nc.scenes_data_source?.replaceAll("-", "") ? "scene" : null;
    if (!source || !kind || page.in_trash || page.archived) throw new Error("Upload target must be an active row in this project's Shots or Scenes database");
    return { id: page.id, url: page.url, kind };
  }

  // Every shot in a section, in Notion's Order. The scripts select the supported models.
  async function shotsInSection(section) {
    const pages = await collectPaginatedAPI(client.dataSources.query, {
      data_source_id: nc.shots_data_source,
      filter: { property: f.section, select: { equals: section } },
      sorts: [{ property: f.order, direction: "ascending" }],
    });
    const shots = [];
    for (const page of pages) shots.push(await toShot(page));
    return shots;
  }

  // A scene's row in the Scenes database, by its Scene No: what scripts/voice.js reads and writes.
  const sf = nc.scene_fields ?? {};
  async function sceneByNumber(no) {
    if (!nc.scenes_data_source) throw new Error("config.yaml has no notion.scenes_data_source");
    const r = await client.dataSources.query({
      data_source_id: nc.scenes_data_source,
      filter: { property: sf.scene_no, number: { equals: no } },
    });
    if (!r.results.length) throw new Error(`no scene ${no} in the Scenes database`);
    if (r.results.length > 1) throw new Error(`${r.results.length} scenes have Scene No ${no}; fix the extra ones`);
    const page = r.results[0];
    return {
      no,
      title: (await text(page, sf.scene)).trim(),
      sound_script: (await text(page, sf.sound_script)).trim(),
      voice_files: files(page, sf.voice_files).map((x) => x.name),
      sfx_files: sf.sfx_files ? files(page, sf.sfx_files).map((x) => x.name) : [],
      notion: { id: page.id, url: page.url, last_edited: page.last_edited_time },
    };
  }

  // Sends one file to Notion and returns its upload id. Files over 20 MB go in 10 MB parts.
  const PART = 10 * 1024 * 1024;
  async function uploadBytes(name, buf, type) {
    if (buf.length <= 2 * PART) {
      const up = await client.fileUploads.create({ mode: "single_part", filename: name, content_type: type });
      if (up.status && up.status !== "pending") throw new Error(`Notion did not accept the upload of ${name}`);
      await client.fileUploads.send({ file_upload_id: up.id, file: { filename: name, data: new Blob([buf], { type }) } });
      return up.id;
    }
    const parts = Math.ceil(buf.length / PART);
    const up = await client.fileUploads.create({ mode: "multi_part", number_of_parts: parts, filename: name, content_type: type });
    for (let i = 0; i < parts; i++) {
      const data = new Blob([buf.subarray(i * PART, (i + 1) * PART)], { type });
      await client.fileUploads.send({ file_upload_id: up.id, part_number: String(i + 1), file: { filename: name, data } });
    }
    await client.fileUploads.complete({ file_upload_id: up.id });
    return up.id;
  }

  // The files in a files field on a page, as { name, url } (the url is signed and short-lived).
  async function filesOn(pageId, field) {
    return files(await client.pages.retrieve({ page_id: pageId }), field);
  }

  async function frameSource(pageId, frame) {
    const page = await client.pages.retrieve({ page_id: pageId });
    const field = frame === "start" ? "Start frame prompt" : "End frame prompt";
    const prompt = await text(page, field);
    const scenes = prop(page, "Scene").relation;
    if (scenes?.length !== 1) throw new Error("The shot must link to one scene in its Scene field.");
    const scene = await client.pages.retrieve({ page_id: scenes[0].id });
    const sceneNo = prop(scene, nc.scene_fields.scene_no).number;
    if (!Number.isInteger(sceneNo) || sceneNo < 1) throw new Error("The linked scene needs a positive Scene No.");
    return { prompt, field, sceneNo };
  }

  // The YAML plan written on a page under a heading ("Radio cut plan", "Animatic plan"): the first code
  // block after that heading, parsed. Returns null if the page has no such heading.
  async function pagePlan(pageId, heading) {
    const blocks = await collectPaginatedAPI(client.blocks.children.list, { block_id: pageId });
    const plain = (b) => (b[b.type]?.rich_text ?? []).map((t) => t.plain_text).join("").trim();
    const at = blocks.findIndex((b) => /^heading_[123]$/.test(b.type) && plain(b).toLowerCase() === heading.toLowerCase());
    if (at < 0) return null;
    for (const b of blocks.slice(at + 1)) {
      if (/^heading_[123]$/.test(b.type)) break;
      if (b.type === "code") {
        const YAML = (await import("yaml")).default;
        return YAML.parse(plain(b));
      }
    }
    throw new Error(`"${heading}" on the page has no code block under it`);
  }

  // The names of the files in a files field on a page, in Notion's order.
  async function fieldFiles(pageId, field) {
    return files(await client.pages.retrieve({ page_id: pageId }), field).map((x) => x.name);
  }

  // Uploads local files to a files field on a page and adds them to what is already there. A file with the
  // same name (ignoring the extension) as one already attached replaces it; every other file is kept.
  // The field ends up sorted by file name, numbers in order (S01-sb-2 before S01-sb-10, 13a before 13b).
  async function attachFiles(pageId, field, paths) {
    const { readFileSync } = await import("node:fs");
    const { basename } = await import("node:path");
    const stem = (n) => n.replace(/\.[^.]+$/, "").toLowerCase();
    const byName = (a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
    const uploads = [];
    for (const path of paths) {
      const name = basename(path);
      const id = await uploadBytes(name, readFileSync(path), contentType(name));
      uploads.push({ type: "file_upload", file_upload: { id }, name });
    }
    const replaced = new Set(uploads.map((u) => stem(u.name)));
    const page = await client.pages.retrieve({ page_id: pageId });
    const kept = prop(page, field).files.filter((x) => !replaced.has(stem(x.name)));
    const write = (list) => client.pages.update({ page_id: pageId, properties: { [field]: { files: [...list, ...uploads].sort(byName) } } });
    try {
      // Files already in Notion are passed back as they are.
      await write(kept.map((x) => (x.type === "external" ? { name: x.name, type: "external", external: x.external } : { name: x.name, type: "file", file: { url: x.file.url } })));
    } catch (err) {
      if (err?.code !== "validation_error") throw err;
      // If Notion won't take them back as they are, they are downloaded and uploaded again, so none is lost.
      const again = [];
      for (const x of kept) {
        if (x.type === "external") { again.push({ name: x.name, type: "external", external: x.external }); continue; }
        const res = await fetch(x.file.url);
        if (!res.ok) throw new Error(`could not re-read "${x.name}" from Notion to keep it (HTTP ${res.status}); nothing was changed`);
        const id = await uploadBytes(x.name, Buffer.from(await res.arrayBuffer()), res.headers.get("content-type") ?? contentType(x.name));
        again.push({ type: "file_upload", file_upload: { id }, name: x.name });
      }
      await write(again);
    }
    // Check what Notion now holds.
    const after = await fieldFiles(pageId, field);
    const want = [...kept.map((x) => x.name), ...uploads.map((u) => u.name)];
    const missing = want.filter((n) => !after.includes(n));
    if (missing.length) throw new Error(`after the upload, ${field} is missing: ${missing.join(", ")}`);
    return after;
  }

  // A shot's pictures, for the edit: its start frame, generated clip and final shot, and its Type.
  async function shotMedia(id) {
    const r = await client.dataSources.query({ data_source_id: nc.shots_data_source, filter: { property: f.shot, title: { equals: id } } });
    if (!r.results.length) throw new Error(`no shot called ${id} in the Shots database`);
    if (r.results.length > 1) throw new Error(`${r.results.length} shots are called ${id} in the Shots database; rename the extra ones`);
    const page = r.results[0];
    const opt = (field) => (field && page.properties?.[field] ? files(page, field) : []);
    return {
      id,
      type: f.type && page.properties?.[f.type] ? select(page, f.type) : null,
      duration: prop(page, f.duration).number,
      start_frame: opt(f.start_frame)[0] ?? null,
      generated_clip: opt(f.generated_clip).at(-1) ?? null,
      final_shot: opt(f.final_shot).at(-1) ?? null,
      notion: { url: page.url },
    };
  }

  // The files of an Asset Library row, by its name (a motif: "Motif A"). Audio rows keep their file in
  // the Reference Image field, like every other asset.
  async function assetFiles(name) {
    if (!nc.assets_data_source) throw new Error("config.yaml has no notion.assets_data_source");
    const r = await client.dataSources.query({ data_source_id: nc.assets_data_source, filter: { property: af.name, title: { equals: name } } });
    if (!r.results.length) throw new Error(`no row called "${name}" in the Asset Library`);
    if (r.results.length > 1) throw new Error(`${r.results.length} rows are called "${name}" in the Asset Library`);
    return files(r.results[0], af.sheet);
  }

  return { shotsByIds, shotPageById, productionPage, shotsInSection, sceneByNumber, attachFiles, fieldFiles, filesOn, frameSource, pagePlan, shotMedia, assetFiles };
}

// Notion images are kept in .cache/notion/ (npm run pull). Notion's signed links change on every read
// and expire within the hour, so a file is keyed by the upload id inside the link, which only changes
// when the file is replaced in Notion. A replaced file therefore needs pulling again.
function stemOf(file) {
  const url = new URL(file.url);
  const parts = url.pathname.split("/").filter(Boolean);
  const key = url.hostname.endsWith("amazonaws.com") && parts.length >= 3
    ? parts[parts.length - 2]
    : createHash("sha256").update(file.url).digest("hex").slice(0, 32);
  return `${CACHE_DIR}/${key}`;
}

// The local copy of a Notion file, or null if it hasn't been pulled. Never downloads.
export function localCopy(file) {
  return resolveImage(`${stemOf(file)}.png`);
}

// Downloads a Notion file unless it's already here; returns its local path and whether it was new.
export async function download(file) {
  const url = new URL(file.url);
  const stem = stemOf(file);
  const cached = localCopy(file);
  if (cached) return { path: cached, fresh: false };

  const res = await fetch(file.url);
  if (!res.ok) throw new Error(`downloading "${file.name}" failed: HTTP ${res.status}`);
  const type = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  // S3 often serves Notion uploads as application/octet-stream, so fall back to the file name.
  let ext = extname(url.pathname).toLowerCase() || extname(file.name).toLowerCase();
  if (type.startsWith("image/")) {
    if (!IMAGE_EXTS.includes(ext)) ext = TYPE_EXTS[type] ?? "";
  } else if (type && type !== "application/octet-stream") {
    throw new Error(`"${file.name}" is not an image (${type})`);
  }
  if (!IMAGE_EXTS.includes(ext)) throw new Error(`"${file.name}" is not a png, jpg or webp image`);

  const buf = Buffer.from(await res.arrayBuffer());
  const dest = stem + (ext === ".jpeg" ? ".jpg" : ext);
  mkdirSync(fromRoot(CACHE_DIR), { recursive: true });
  writeFileSync(fromRoot(dest), buf);
  return { path: dest, fresh: true };
}

// Downloads any Notion file (audio, video, image) into .cache/scene-files/ unless it's already there, and
// returns its local path. Like download(), a file is keyed by the upload id inside its link, so a file
// replaced in Notion is fetched again and an unchanged one never is.
export async function downloadFile(file) {
  const key = stemOf(file).split("/").pop();
  const dir = fromRoot(".cache/scene-files");
  const dest = `${dir}/${key}${extname(file.name).toLowerCase()}`;
  const { existsSync } = await import("node:fs");
  if (existsSync(dest)) return dest;
  const res = await fetch(file.url);
  if (!res.ok) throw new Error(`downloading "${file.name}" from Notion failed: HTTP ${res.status}`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
  return dest;
}

// Every image a shot can send to a video provider, labelled for messages: start and end frames, then each
// character's face close-up and sheet. Characters are listed whether or not the prompt names them.
export function imagesOf(shot) {
  const images = [];
  if (shot.start_frame) images.push({ what: "start frame", file: shot.start_frame });
  if (shot.end_frame) images.push({ what: "end frame", file: shot.end_frame });
  for (const c of shot.characters) {
    if (c.frontal) images.push({ what: `${c.name} face close-up`, file: c.frontal });
    for (const r of c.references) images.push({ what: `${c.name} sheet`, file: r });
  }
  return images;
}
