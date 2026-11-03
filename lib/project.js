// Loads config.yaml and resolves project paths. The shots themselves come from Notion (lib/notion.js).
import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve, isAbsolute, extname } from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const IMAGE_EXTS = [".png", ".jpg", ".jpeg", ".webp"];

export function fromRoot(p) {
  return isAbsolute(p) ? p : resolve(ROOT, p);
}

// Image paths are matched by name, whatever the extension: looking for x.png also finds x.jpg.
// Returns the path (relative, as given) of the file that exists, or null.
export function resolveImage(p) {
  if (existsSync(fromRoot(p))) return p;
  const stem = p.slice(0, p.length - extname(p).length);
  for (const ext of IMAGE_EXTS) {
    if (existsSync(fromRoot(stem + ext))) return stem + ext;
  }
  return null;
}

function readYaml(path) {
  const full = fromRoot(path);
  if (!existsSync(full)) throw new Error(`File not found: ${path}`);
  return YAML.parse(readFileSync(full, "utf8")) ?? {};
}

export function loadConfig() {
  return readYaml("config.yaml");
}
