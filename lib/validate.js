// Checks shots read from Notion before anything is downloaded, uploaded or paid for.
import { SECTIONS, namesIn, assemblePrompt } from "./prompt.js";

// How long a shot's clip is generated: its length in the scene (Duration in Notion, cut from the radio cut)
// plus a handle at each end, since a clip is weakest in its first and last moments and the edit uses the
// middle; rounded up to whole seconds, at least 3.
export function genSeconds(shot, config) {
  const cut = Number(shot.duration);
  const handles = config.clip_handles ?? 1;
  return Math.max(3, Math.ceil(cut + 2 * handles - 1e-9));
}

export function validate(shots, config) {
  const problems = [];
  const seen = new Set();
  const fields = config.notion.fields;

  for (const shot of shots) {
    const id = shot.id || "(shot without a name)";
    if (seen.has(id)) problems.push(`${id}: listed twice`);
    seen.add(id);

    const model = config.models[shot.model];
    if (!model) problems.push(`${id}: Model in Notion is "${shot.model ?? "empty"}"; this project generates with ${Object.keys(config.models).join(" or ")}`);

    const d = Number(shot.duration);
    const max = model?.max_seconds ?? 15;
    if (!(d > 0)) problems.push(`${id}: "${fields.duration}" is empty in Notion (the shot's length in the scene, in seconds)`);
    else if (genSeconds(shot, config) > max) problems.push(`${id}: ${d} s plus the handles is more than ${shot.model}'s ${max} s; split the shot in Notion`);

    if (!shot.start_frame) problems.push(`${id}: "${fields.start_frame}" is empty in Notion`);

    for (const [key] of SECTIONS) {
      if (!shot.prompt[key]) problems.push(`${id}: "${fields.prompt[key]}" is empty in Notion`);
    }

    const characters = new Map(shot.characters.map((c) => [c.name, c]));
    for (const name of namesIn(assemblePrompt(shot, config))) {
      // Kling 4.0 on fal takes no character images, so a named character can't be sent.
      if (model?.request === "kling-v4") {
        problems.push(`${id}: @${name}: ${shot.model} can't take character images; describe the person in words (they must already be in the start frame), or set Model to Kling 3.0`);
        continue;
      }
      const c = characters.get(name);
      if (!c) {
        problems.push(`${id}: @${name} is not a character in this shot's "${fields.elements}" in Notion`);
        continue;
      }
      if (!c.frontal) problems.push(`${id}: ${name}'s "${config.notion.asset_fields.face}" is empty in the Asset Library`);
      if (!c.references.length) problems.push(`${id}: ${name}'s "${config.notion.asset_fields.sheet}" is empty in the Asset Library`);
    }
  }

  return problems;
}
