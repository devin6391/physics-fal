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

export function assembleRunwayPrompt(shot, config, characters) {
  const display = (name) => name.replaceAll("_", " ").replace(/\b\w/g, (initial) => initial.toUpperCase());
  const references = characters.filter(Boolean).flatMap((character) => [
    `${display(character.name)}'s face close-up`,
    ...character.references.map(() => `${display(character.name)}'s character sheet`),
  ]);
  const p = shot.prompt;
  const sections = [
    ["CHARACTERS", p.characters],
    ["REFERENCES", references.map((description, i) =>
      `Use reference image ${i + 1} in the separate reference list for ${description}.`,
    ).join("\n")],
    ["CAMERA", p.camera],
    ["DIALOGUE AND TIMING", [...new Set([p.action, p.dialogue, p.timing])].filter(Boolean).join("\n\n")],
    ["ENVIRONMENT", [...new Set([p.setting, p.environment])].filter(Boolean).join("\n\n")],
    ["KEEP STILL", [p.keep_still, config.keep_still_standard].filter(Boolean).join("\n")],
  ];
  return sections.filter(([, body]) => body)
    .map(([heading, body]) => `${heading}\n${body.replace(NAME, (_, name) => display(name))}`).join("\n\n");
}
