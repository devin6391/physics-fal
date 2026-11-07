// Reads a scene's Sound script (the "Sound script" field of its row in the Scenes database) into the
// voice requests that make the scene's dialogue: one request per voice, per Stability, per audio effect.
//
//   ARYAN (Calm 50%; all nine lines in one request, separated by [long pause])
//   1. [a little out of breath] मैं ठीक हूँ। [sincere, blush] कैसी हो तुम? (beat 6; screenplay "…")
//
//   PRIYA (Calm 50%; …; every line with ElevenLabs audio effect Filter → Phone)
//   1. [warm] कैसे हो आर्यन? (beat 5; …)
//
//   HOSTEL BOYS (off-screen)
//   1. Hostel boy 1 (Hostel boy A, Breaking 25%): [shouting, panicked, running] सज्जन गिर गया! (beat 14)
//
// A heading in capitals starts a speaker's lines and gives their Stability and audio effect. A line can also
// name its own voice and Stability before a colon, as the hostel boys do. The note in brackets that starts
// with "beat" ends the spoken text; everything before it, audio tags and all, is sent to ElevenLabs.

const LEVEL = /(?:\b(calm|charged|breaking)\s+)?(\d{1,3})\s*%/i;
const FILTER = /filter\s*→\s*([a-z][a-z ]*[a-z])/i;

// "HOSTEL BOY A" → "Hostel boy A"; "ARYAN" → "Aryan".
function sentenceCase(s) {
  const lower = s.trim().toLowerCase();
  return (lower[0].toUpperCase() + lower.slice(1)).replace(/ ([a-z])$/, (_, c) => ` ${c.toUpperCase()}`);
}

// "Hostel boy A" → "hostel-boy-a", for file names.
export function kebab(s) {
  return String(s).trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function levelOf(text) {
  const m = text?.match(LEVEL);
  return m ? { level: m[1] ? sentenceCase(m[1]) : null, stability: Number(m[2]) / 100 } : null;
}

// Every spoken line in the Sound script, in order:
// { section, n, speaker, voiceName, stability, level, filter, spoken, beat, note }
export function parseSoundScript(text) {
  const lines = [];
  let section = null, heading = 0;
  for (const raw of String(text ?? "").split(/\r?\n/)) {
    const row = raw.trim();
    if (!row) continue;
    // A heading: a name in capitals, optionally followed by its settings in brackets.
    const head = row.match(/^([A-Z][A-Z '-]*[A-Z])(?:\s*\((.*)\))?\s*:?\s*$/);
    if (head) {
      // The SOUNDS section (lib/voice.js → parseSounds) ends the voice lines.
      if (head[1].trim() === "SOUNDS") break;
      const settings = head[2] ?? "";
      const level = levelOf(settings);
      section = {
        id: ++heading,
        name: sentenceCase(head[1]),
        stability: level?.stability ?? null,
        level: level?.level ?? null,
        filter: settings.match(FILTER)?.[1].trim() ?? null,
      };
      continue;
    }
    const item = row.match(/^(\d+)[.)]\s+(.*)$/);
    if (!item || !section) continue;
    let body = item[2];
    let speaker = section.name, voiceName = section.name;
    let { stability, level, filter } = section;
    // "Hostel boy 1 (Hostel boy A, Breaking 25%): …" names its own voice and Stability.
    const own = body.match(/^([A-Za-z][A-Za-z0-9 '-]*?)\s*\(([^)]*)\)\s*:\s*(.*)$/);
    if (own) {
      speaker = own[1].trim();
      const parts = own[2].split(",").map((p) => p.trim()).filter(Boolean);
      const lv = parts.map(levelOf).find(Boolean);
      const name = parts.find((p) => !levelOf(p) && !/off-screen/i.test(p));
      voiceName = name ?? speaker;
      if (lv) ({ stability, level } = lv);
      body = own[3];
    }
    // The note starts at the last "(beat …" and runs to the end of the line.
    const at = body.lastIndexOf("(beat");
    const spoken = (at === -1 ? body : body.slice(0, at)).trim();
    const note = at === -1 ? null : body.slice(at + 1, body.endsWith(")") ? -1 : undefined).trim();
    if (!spoken) continue;
    lines.push({
      section: section.name, heading: section.id, n: Number(item[1]), speaker, voiceName, stability, level, filter, spoken,
      beat: Number(note?.match(/beat\s+(\d+)/i)?.[1]) || null, note,
    });
  }
  return lines;
}

// Groups the lines into requests: one per heading, voice, Stability and audio effect, in script order. A speaker
// written under two headings (to split their lines at a sharp emotional turn) gets two requests. Each line gets
// its file name: S01-aryan-3 is Aryan's third line in scene 1; the hostel boys are numbered per voice.
export function toRequests(lines, sceneNo) {
  const scene = `S${String(sceneNo).padStart(2, "0")}`;
  const counts = new Map();
  const requests = new Map();
  for (const line of lines) {
    const who = kebab(line.voiceName);
    const k = (counts.get(who) ?? 0) + 1;
    counts.set(who, k);
    line.file = `${scene}-${who}-${k}`;
    const key = `${line.heading}|${line.voiceName}|${line.stability}|${line.filter ?? ""}`;
    if (!requests.has(key)) requests.set(key, { voiceName: line.voiceName, stability: line.stability, level: line.level, filter: line.filter, lines: [] });
    requests.get(key).lines.push(line);
  }
  const list = [...requests.values()];
  // A voice with more than one request gets a part number in the request's name.
  for (const r of list) {
    const same = list.filter((o) => o.voiceName === r.voiceName);
    r.name = `${scene}-${kebab(r.voiceName)}${same.length > 1 ? `-part${same.indexOf(r) + 1}` : ""}-all`;
  }
  return list;
}

// The SOUNDS section of a Sound script: every sound the scene needs apart from the voices, one ElevenLabs
// Sound Effects generation each.
//
//   SOUNDS (ElevenLabs Sound Effects, one generation each; …)
//   2. door-bang (event, 1.5 s): A wooden hostel room door flung open hard, … (beat 2)
//   18. room-night (bed, 30 s, loop): A small hostel room at night: … (beats 2–18)
//   19. motif-a (motif): Motif A, the water drop. (beat 18)
//
// In the brackets: the kind (event, movement, bed or motif), the length in seconds, and "loop" for a seamless
// loop. Before "(beat" is the prompt sent to ElevenLabs. Motifs are made once and locked in the Asset Library,
// so they are listed here but never generated per scene.
export function parseSounds(text, sceneNo) {
  const scene = `S${String(sceneNo).padStart(2, "0")}`;
  const rows = String(text ?? "").split(/\r?\n/).map((r) => r.trim());
  const start = rows.findIndex((r) => /^SOUNDS\b/.test(r));
  if (start === -1) return [];
  const sounds = [];
  for (const row of rows.slice(start + 1)) {
    const m = row.match(/^(\d+)[.)]\s+([a-z0-9][a-z0-9-]*)\s*\(([^)]*)\)\s*:?\s*(.*)$/i);
    if (!m) continue;
    const settings = m[3].toLowerCase();
    const kind = ["event", "movement", "bed", "motif"].find((k) => settings.includes(k)) ?? "event";
    const seconds = Number(settings.match(/(\d+(?:\.\d+)?)\s*s\b/)?.[1]) || null;
    const at = m[4].lastIndexOf("(beat");
    const prompt = (at === -1 ? m[4] : m[4].slice(0, at)).trim();
    const note = at === -1 ? null : m[4].slice(at + 1, m[4].endsWith(")") ? -1 : undefined).trim();
    sounds.push({
      n: Number(m[1]), name: m[2].toLowerCase(), kind, seconds, loop: /\bloop\b/.test(settings),
      prompt, note, file: `${scene}-sfx-${m[2].toLowerCase()}`,
    });
  }
  return sounds;
}
