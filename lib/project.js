// Loads the project files: config.yaml, elements.yaml and a scene's shots file.
import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export function fromRoot(p) {
  return isAbsolute(p) ? p : resolve(ROOT, p);
}

function readYaml(path) {
  const full = fromRoot(path);
  if (!existsSync(full)) throw new Error(`File not found: ${path}`);
  return YAML.parse(readFileSync(full, "utf8")) ?? {};
}

export function loadConfig() {
  return readYaml("config.yaml");
}

export function loadElements() {
  return readYaml("elements.yaml");
}

export function loadScene(shotsFile) {
  const scene = readYaml(shotsFile);
  if (!scene.scene) throw new Error(`${shotsFile}: missing "scene:" name`);
  if (!Array.isArray(scene.shots)) throw new Error(`${shotsFile}: missing "shots:" list`);
  return scene;
}
