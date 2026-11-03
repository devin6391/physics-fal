// Checks a scene before anything is uploaded or paid for.
import { existsSync } from "node:fs";
import { fromRoot } from "./project.js";
import { SECTIONS, namesIn, assemblePrompt } from "./prompt.js";

export function validate(shots, elements, config) {
  const problems = [];
  const seen = new Set();

  for (const shot of shots) {
    const id = shot.id ?? "(shot without id)";
    if (!shot.id) problems.push(`${id}: missing "id"`);
    if (seen.has(id)) problems.push(`${id}: listed twice`);
    seen.add(id);

    const d = Number(shot.duration);
    if (!Number.isInteger(d) || d < 3 || d > 15) problems.push(`${id}: duration must be a whole number from 3 to 15`);

    if (!shot.start_frame) problems.push(`${id}: missing "start_frame"`);
    else if (!existsSync(fromRoot(shot.start_frame))) problems.push(`${id}: start frame not found: ${shot.start_frame}`);
    if (shot.end_frame && !existsSync(fromRoot(shot.end_frame))) problems.push(`${id}: end frame not found: ${shot.end_frame}`);

    for (const [key, heading] of SECTIONS) {
      if (!String(shot.prompt?.[key] ?? "").trim()) problems.push(`${id}: prompt section "${key}" (${heading}) is empty`);
    }

    for (const name of namesIn(assemblePrompt(shot, config))) {
      if (!elements[name]) problems.push(`${id}: @${name} is not in elements.yaml`);
    }
  }

  for (const [name, el] of Object.entries(elements)) {
    const refs = el.references ?? [];
    if (!el.frontal) problems.push(`element ${name}: missing "frontal"`);
    if (refs.length < 1 || refs.length > 3) problems.push(`element ${name}: needs 1 to 3 "references"`);
  }

  return problems;
}

// Element images only matter for the elements a run actually uses.
export function missingElementFiles(names, elements) {
  const missing = [];
  for (const name of names) {
    const el = elements[name];
    for (const p of [el.frontal, ...(el.references ?? [])]) {
      if (p && !existsSync(fromRoot(p))) missing.push(`element ${name}: file not found: ${p}`);
    }
  }
  return missing;
}
