// Uploads local images to fal's storage once and remembers the URLs in .cache/uploads.json,
// keyed by the file's content, so a changed file is uploaded again and an unchanged one never is.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { basename, extname } from "node:path";
import { fal } from "@fal-ai/client";
import { fromRoot, resolveImage } from "./project.js";

const CACHE = fromRoot(".cache/uploads.json");
const TYPES = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" };
const DAY = 24 * 60 * 60 * 1000;
const EXPIRY_DAYS = { "1d": 1, "7d": 7, "30d": 30, "1y": 365 };

function readCache() {
  return existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, "utf8")) : {};
}

function writeCache(cache) {
  mkdirSync(fromRoot(".cache"), { recursive: true });
  writeFileSync(CACHE, JSON.stringify(cache, null, 2));
}

export function makeUploader(config) {
  const cache = readCache();
  const pending = new Map();
  const expiresIn = config.upload_expiry ?? "30d";
  // Reuse a stored URL until 3 days before fal deletes the file.
  const keepDays = (EXPIRY_DAYS[expiresIn] ?? 30) - 3;

  return async function upload(declaredPath) {
    const relPath = resolveImage(declaredPath);
    if (!relPath) throw new Error(`image not found: ${declaredPath}`);
    const buf = readFileSync(fromRoot(relPath));
    const hash = createHash("sha256").update(buf).digest("hex");
    const hit = cache[hash];
    if (hit && Date.now() - hit.uploadedAt < keepDays * DAY) return hit.url;
    if (pending.has(hash)) return pending.get(hash);

    const job = (async () => {
      const type = TYPES[extname(relPath).toLowerCase()] ?? "application/octet-stream";
      const file = new File([buf], basename(relPath), { type });
      const url = await fal.storage.upload(file, { lifecycle: { expiresIn } });
      cache[hash] = { url, file: relPath, uploadedAt: Date.now() };
      writeCache(cache);
      return url;
    })();
    pending.set(hash, job);
    return job;
  };
}
