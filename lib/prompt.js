// Builds the prompt text sent to Kling from a shot's eight sections,
// and turns @names into fal's @Element1, @Element2 ...

export const SECTIONS = [
  ["characters", "CHARACTERS"],
  ["setting", "SETTING AND LOOK"],
  ["camera", "CAMERA"],
  ["action", "ACTION"],
  ["dialogue", "DIALOGUE"],
  ["timing", "TIMING"],
  ["environment", "ENVIRONMENT"],
  ["keep_still", "KEEP STILL"],
];

const NAME = /@([a-z][a-z0-9_]*)\b/g;

// The @names a text mentions, in order of first mention.
export function namesIn(text) {
  return [...new Set([...text.matchAll(NAME)].map((m) => m[1]))];
}

// The full prompt with section headings and the standard KEEP STILL block appended.
export function assemblePrompt(shot, config) {
  return SECTIONS.map(([key, heading]) => {
    let body = String(shot.prompt?.[key] ?? "").trim();
    if (key === "keep_still") {
      body = [body, String(config.keep_still_standard ?? "").trim()].filter(Boolean).join("\n");
    }
    return `${heading}\n${body}`;
  }).join("\n\n");
}

// Replaces @aryan etc. with @Element1 ... and returns the names in element order.
export function toFalElements(prompt) {
  const names = namesIn(prompt);
  const text = prompt.replace(NAME, (_, name) => `@Element${names.indexOf(name) + 1}`);
  return { text, names };
}
