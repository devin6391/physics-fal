// An explicit ordered reference list in Notion, never inferred from a prompt.
import { createHash } from "node:crypto";
import { constants, copyFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import { extname, join } from "node:path";
import { download } from "./notion.js";
import { fromRoot, IMAGE_EXTS } from "./project.js";
import { pageId } from "./notion-id.js";
export { pageId } from "./notion-id.js";

function safeName(value) {
  const safe = String(value).normalize("NFKC").replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 70);
  if (!safe) throw new Error("Reference labels and shot IDs need letters or numbers");
  return safe;
}

// Resolve every reference before writing any files; ambiguous or missing files stop the run.
export async function resolveReferences(notion, shot, frame) {
  if (!["start", "end"].includes(frame)) throw new Error("--frame must be start or end");
  const page = await notion.shotPageById(shot);
  const plan = await notion.pagePlan(page.id, "Gemini references");
  if (!plan) throw new Error(`${shot}: add a YAML block under "Gemini references" on the shot page (README → Gemini reference images)`);
  if (!Array.isArray(plan[frame]) || !plan[frame].length) throw new Error(`${shot}: Gemini references has no ${frame} list`);
  const requests = plan[frame].map((ref, i) => {
    if (!ref || typeof ref !== "object" || Array.isArray(ref)) throw new Error(`Reference ${i + 1} must be an object`);
    for (const key of ["label", "page", "field"]) {
      if (typeof ref[key] !== "string" || !ref[key].trim()) throw new Error(`Reference ${i + 1} needs ${key}`);
    }
    if (ref.file !== undefined && (typeof ref.file !== "string" || !ref.file)) throw new Error(`Reference ${i + 1}: file must be an exact attachment name`);
    return { ...ref, page: pageId(ref.page), label: safeName(ref.label) };
  });
  const sources = new Map();
  const refs = [];
  for (const [i, ref] of requests.entries()) {
    const key = `${ref.page}:${ref.field}`;
    if (!sources.has(key)) sources.set(key, await notion.filesOn(ref.page, ref.field));
    const all = sources.get(key);
    const matches = ref.file ? all.filter((f) => f.name === ref.file) : all;
    if (matches.length !== 1) {
      const reason = matches.length ? "ambiguous; specify the exact file name" : "not found";
      throw new Error(`${shot} reference ${i + 1}: ${ref.field}${ref.file ? ` / ${ref.file}` : ""} ${reason}. Available: ${all.map((f) => f.name).join(", ") || "none"}`);
    }
    const file = matches[0];
    const ext = extname(file.name).toLowerCase();
    if (!IMAGE_EXTS.includes(ext)) throw new Error(`${file.name}: reference must be png, jpg, jpeg or webp`);
    const url = new URL(file.url);
    // Signed query strings expire; the upload's path changes when its file is replaced.
    const identity = createHash("sha256").update(url.origin + url.pathname).digest("hex").slice(0, 16);
    refs.push({ number: i + 1, label: ref.label, file, filename: `${String(i + 1).padStart(2, "0")}-${ref.label}-${identity}${ext}` });
  }
  return { shot, frame, page: page.url, refs };
}

export function referenceFolder(shot, frame) {
  if (!["start", "end"].includes(frame)) throw new Error("--frame must be start or end");
  return fromRoot(join("out", "refs", safeName(shot), frame));
}

export async function saveReferences(bundle, { folder = referenceFolder(bundle.shot, bundle.frame), downloadImage = download, report = () => {} } = {}) {
  mkdirSync(folder, { recursive: true });
  const results = [];
  for (const ref of bundle.refs) {
    const dest = join(folder, ref.filename);
    if (existsSync(dest)) {
      if (!statSync(dest).isFile() || statSync(dest).size === 0) throw new Error(`${dest}: existing path is not a non-empty file; move it aside and retry`);
      const result = { path: dest, fresh: false };
      results.push(result); report(ref, result); continue;
    }
    const cached = await downloadImage(ref.file);
    // Exclusive copy: never replace a file, including when another run creates it first.
    copyFileSync(fromRoot(cached.path), dest, constants.COPYFILE_EXCL);
    const result = { path: dest, fresh: true };
    results.push(result); report(ref, result);
  }
  return results;
}
