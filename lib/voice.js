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

// Dialogue lines holds one line per row, written for ElevenLabs:
//
//   2. Aryan (Calm 50%): [slightly out of breath, warm] मैं ठीक हूँ। [softly] कैसी हो तुम? → CO-03-aryan-1.mp3 (note)
//
// In the brackets: the voice by name (optional; else config.yaml's) and a mood with its stability.
// Before → is what is spoken, audio tags and all; after it, the file name and a note for the edit.
function parseDialogueLines(text, speakers) {
  const names = speakers.map(escape).join("|");
  const re = new RegExp(`^\\s*(?:\\d+[.)]\\s*)?(${names})\\s*(?:\\(([^)]*)\\))?\\s*:\\s*(.*)$`, "iu");
  const lines = [];
  for (const row of text.split("\n")) {
    const m = row.match(re);
    if (!m) continue;
    const speaker = speakers.find((s) => s.toLowerCase() === m[1].toLowerCase());
    let voiceName = null, mood = null, stability = null;
    for (const part of (m[2] ?? "").split(",").map((p) => p.trim()).filter(Boolean)) {
      const s = part.match(/^(.*?)\s*(\d+(?:\.\d+)?)\s*%$/);
      if (s) [mood, stability] = [s[1] || null, Number(s[2]) / 100];
      else voiceName = part;
    }
    const [spoken, after = ""] = m[3].split("→");
    const out = after.trim().match(/^(\S+?)(?:\.\w+)?(?:\s+\((.*)\))?$/);
    if (!spoken.trim()) continue;
    lines.push({ speaker, voiceName, mood, stability, file: out?.[1] ?? null, note: out?.[2] ?? null, text: spoken.trim(), spoken: spoken.trim() });
  }
  return lines;
}

// [{ speaker, text, spoken, … }] in order. `spoken` is what is sent. From Screenplay audio, a line's
// direction ("softly") becomes an Eleven v4 audio tag in front.
export function parseLines(text, speakers, field) {
  if (field === "Dialogue lines") return parseDialogueLines(text, speakers);
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
