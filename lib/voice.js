// Picks the spoken lines out of a shot's audio notes in Notion, for scripts/voice.js.
//
//   Priya (softly): "डर तो तुम्हें भी लगा था।" Aryan: "हाँ।" Narrator: पहली बार उसने माना।
//
// becomes three lines: Priya "[softly] डर तो तुम्हें भी लगा था।", Aryan "हाँ।", Narrator "पहली बार उसने माना।".
// Only the speakers in config.yaml (voice.speakers) are labels; "SFX:" ends a line and is not spoken.

const QUOTES = { '"': '"', "“": "”", "'": "'" };

function escape(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// The text a shot's voices are made from: Dialogue lines when it's filled in, else Screenplay audio.
export function scriptOf(shot) {
  if (shot.dialogue_lines) return { field: "Dialogue lines", text: shot.dialogue_lines };
  return { field: "Screenplay audio", text: shot.screenplay_audio ?? "" };
}

// [{ speaker, direction, text, spoken }] in order. `spoken` is what is sent: the line, with its
// direction ("softly") as an Eleven v4 audio tag in front.
export function parseLines(text, speakers) {
  const labels = [...speakers, "SFX"].map(escape).join("|");
  const re = new RegExp(`(?<![\\p{L}\\p{M}])(${labels})\\s*(?:\\(([^)]*)\\))?\\s*:`, "giu");
  const marks = [...text.matchAll(re)];
  const lines = [];
  marks.forEach((m, i) => {
    const speaker = speakers.find((s) => s.toLowerCase() === m[1].toLowerCase());
    if (!speaker) return;
    let body = text.slice(m.index + m[0].length, marks[i + 1]?.index ?? text.length).trim();
    // A quoted line is just what's inside the quotes; anything after it is a note, not speech.
    const close = QUOTES[body[0]];
    if (close) {
      const end = body.indexOf(close, 1);
      body = body.slice(1, end === -1 ? undefined : end);
    }
    body = body.trim();
    if (!body) return;
    const direction = m[2]?.trim() || null;
    lines.push({ speaker, direction, text: body, spoken: direction ? `[${direction}] ${body}` : body });
  });
  return lines;
}
