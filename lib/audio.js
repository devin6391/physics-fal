// Cuts one generated request (a speaker's lines separated by [long pause]) into one file per line, with ffmpeg.
// The pauses are found with ffmpeg's silencedetect; the longest gaps between speech are the cuts.
import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";

const FFMPEG = process.env.FFMPEG_PATH || "ffmpeg";

export function checkFfmpeg() {
  const r = spawnSync(FFMPEG, ["-version"], { encoding: "utf8" });
  if (r.error || r.status !== 0) throw new Error("ffmpeg is not installed. On the Mac: brew install ffmpeg");
}

function ffmpeg(args) {
  const r = spawnSync(FFMPEG, ["-hide_banner", ...args], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (r.error) throw r.error;
  return r;
}

// The quiet stretches in a file: [{ start, end }], and its duration.
function silences(file, noiseDb, minSeconds) {
  const r = ffmpeg(["-i", file, "-af", `silencedetect=noise=${noiseDb}dB:d=${minSeconds}`, "-f", "null", "-"]);
  const out = r.stderr;
  const d = out.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  const duration = d ? Number(d[1]) * 3600 + Number(d[2]) * 60 + Number(d[3]) : null;
  const gaps = [];
  let start = null;
  for (const m of out.matchAll(/silence_(start|end):\s*(-?\d+(?:\.\d+)?)/g)) {
    if (m[1] === "start") start = Math.max(0, Number(m[2]));
    else if (start != null) gaps.push({ start, end: Number(m[2]) }), (start = null);
  }
  if (start != null && duration != null) gaps.push({ start, end: duration });
  return { gaps, duration };
}

// Where each line is in the file: [{ start, end }] for `count` lines, or null if the pauses can't be found.
export function findLines(file, count, opts = {}) {
  const tries = [
    [opts.silence_db ?? -40, opts.min_silence ?? 0.35],
    [-35, 0.3],
    [-45, 0.25],
  ];
  for (const [db, min] of tries) {
    const { gaps, duration } = silences(file, db, min);
    if (!duration) throw new Error(`could not read ${file}`);
    // Only gaps between speech count: not the silence at the very start or end of the file.
    const inner = gaps.filter((g) => g.start > 0.05 && g.end < duration - 0.05);
    const edgeStart = gaps.find((g) => g.start <= 0.05)?.end ?? 0;
    const edgeEnd = gaps.find((g) => g.end >= duration - 0.05)?.start ?? duration;
    if (inner.length < count - 1) continue;
    const cuts = [...inner].sort((a, b) => (b.end - b.start) - (a.end - a.start)).slice(0, count - 1).sort((a, b) => a.start - b.start);
    const spans = [];
    let from = edgeStart;
    for (const c of cuts) spans.push({ start: from, end: c.start, gapAfter: c.end - c.start }), (from = c.end);
    spans.push({ start: from, end: edgeEnd, gapAfter: duration - edgeEnd });
    if (spans.every((s) => s.end - s.start > 0.15)) return { spans, duration };
  }
  return null;
}

// Writes each line as its own mp3, with a little room before and after, and short fades.
export function cutLines(file, spans, names, outDir, opts = {}) {
  mkdirSync(outDir, { recursive: true });
  const lead = opts.lead ?? 0.05, tail = opts.tail ?? 0.2;
  const prevGap = [0, ...spans.map((s) => s.gapAfter)];
  return spans.map((s, i) => {
    const start = Math.max(0, s.start - Math.min(lead, prevGap[i] / 2));
    const end = s.end + Math.min(tail, s.gapAfter / 2);
    const length = end - start;
    const path = `${outDir}/${names[i]}.mp3`;
    const r = ffmpeg(["-y", "-v", "error", "-ss", start.toFixed(3), "-t", length.toFixed(3), "-i", file,
      "-af", `afade=t=in:d=0.02,afade=t=out:st=${Math.max(0, length - 0.08).toFixed(3)}:d=0.08`,
      "-c:a", "libmp3lame", "-q:a", "2", path]);
    if (r.status !== 0) throw new Error(`cutting ${names[i]} failed: ${r.stderr}`);
    return { name: names[i], path, start, length };
  });
}
