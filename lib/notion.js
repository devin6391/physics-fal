// Reads shots and character images from Notion, the source of truth, with the Notion SDK.
// The Notion field names live in config.yaml (notion:), so a renamed field is a one-line change there.
import { mkdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { extname } from "node:path";
import { Client, LogLevel, collectPaginatedAPI } from "@notionhq/client";
import { fromRoot, resolveImage, IMAGE_EXTS } from "./project.js";
import { SECTIONS } from "./prompt.js";

const CACHE_DIR = ".cache/notion";
const TYPE_EXTS = { "image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp" };

// "Auto driver" → auto_driver, the way characters are named in prompts (@auto_driver).
export function slug(text) {
  return String(text ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

// Splits a section's shots into those made on fal (their Model is in config.models) and the rest,
// and says which were left out, so a renamed or new Model in Notion never drops shots silently.
export function onFal(shots, config) {
  const other = shots.filter((s) => !config.models[s.model]);
  if (other.length) console.log(`Not made on fal (Model), skipped: ${other.map((s) => `${s.id} (${s.model ?? "empty"})`).join(", ")}`);
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

  // Every shot in a section, in Notion's Order. The scripts pick out the ones made on fal (config.models).
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

  return { shotsByIds, shotsInSection };
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

// Every image a shot sends to fal, labelled for messages: start and end frames, then each
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
