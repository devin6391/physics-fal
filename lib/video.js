// The picture side of the animatic and the assembled scene, with ffmpeg: one segment per cut (a still with
// an optional push, or a stretch of a clip), then the segments joined with cuts and dissolves, a fade, an
// optional grade and labels, and the scene's sound under it.
import { existsSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";

export const FFMPEG = process.env.FFMPEG_PATH || "ffmpeg";
export const FFPROBE = process.env.FFPROBE_PATH || "ffprobe";

export function lengthOf(path) {
  return Number(execFileSync(FFPROBE, ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path]).toString());
}

export const clock = (t) => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, "0")}`;

// Reads the cuts of a plan (a list of { at, … }), sorted, each given `until` (the next cut, or the end).
export function timeline(list, end, fail) {
  const cuts = list.map((p, i) => ({ ...p, at: Number(p.at), i }));
  cuts.sort((a, b) => a.at - b.at);
  if (cuts[0].at !== 0) fail("The first cut must be at 0.");
  cuts.forEach((c, k) => { c.until = k + 1 < cuts.length ? cuts[k + 1].at : end; });
  return cuts;
}

const framesAt = (t, fps) => Math.round(t * fps);

// One cut as a silent video segment of exactly its frames, fitted to the frame (cropped to fill).
// A still is held, with a push from zoom[0] to zoom[1] toward focus [x, y] (0–1) if asked. A clip is
// played from `from` seconds in; if it runs out before the cut ends, its last frame is held.
// `extra` is how long the segment runs on under the next cut's dissolve.
export function segment({ input, still, from = 0, cut, extra = 0, W, H, FPS, out }) {
  const moving = framesAt(cut.until, FPS) - framesAt(cut.at, FPS);
  const n = moving + framesAt(extra, FPS);
  let vf, args;
  if (still) {
    const [z0, z1] = cut.zoom ?? [1, 1];
    const [fx, fy] = cut.focus ?? [0.5, 0.5];
    const u = `min(1,on/${Math.max(1, moving - 1)})`;
    const e = `(${u})*(${u})*(3-2*(${u}))`;
    const z = `${z0}+(${z1 - z0})*${e}`;
    vf = [
      `scale=${W * 2}:${H * 2}:force_original_aspect_ratio=increase`,
      `crop=${W * 2}:${H * 2}`,
      `zoompan=z='${z}':x='max(0,min(iw-iw/zoom,${fx}*iw-iw/zoom/2))':y='max(0,min(ih-ih/zoom,${fy}*ih-ih/zoom/2))':d=${n}:s=${W}x${H}:fps=${FPS}`,
      "format=yuv420p",
    ].join(",");
    args = ["-i", input];
  } else {
    vf = [
      `scale=${W}:${H}:force_original_aspect_ratio=increase`,
      `crop=${W}:${H}`,
      `fps=${FPS}`,
      `tpad=stop_mode=clone:stop_duration=${(n / FPS + 1).toFixed(3)}`,
      "format=yuv420p",
    ].join(",");
    args = ["-ss", String(from), "-i", input];
  }
  execFileSync(FFMPEG, ["-y", "-v", "error", ...args, "-an", "-vf", vf, "-frames:v", String(n), "-c:v", "libx264", "-preset", "veryfast", "-crf", "16", out]);
}

const FONTS = ["/System/Library/Fonts/Menlo.ttc", "/System/Library/Fonts/Supplemental/Arial.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf", "C:/Windows/Fonts/consola.ttf"];

// Joins the segments (one per cut, in order) and writes the finished video with its sound.
// post: { fade: {color, from, to}, grade: path to a .cube LUT, labels: (cut) => text or null }
export function join({ segments, cuts, FPS, end, audio, out, fade, grade, label }) {
  const inputs = segments.flatMap((p) => ["-i", p]);
  // Every stream gets the same timebase and frame rate, which xfade needs.
  const graph = segments.map((_, k) => `[${k}:v]setpts=PTS-STARTPTS,fps=${FPS},settb=AVTB[i${k}]`);
  let last = "[i0]";
  for (let k = 1; k < cuts.length; k++) {
    const o = `[s${k}]`;
    if (cuts[k].dissolve) graph.push(`${last}[i${k}]xfade=transition=fade:duration=${cuts[k].dissolve}:offset=${(framesAt(cuts[k].at, FPS) / FPS).toFixed(4)},settb=AVTB${o}`);
    else graph.push(`${last}[i${k}]concat=n=2:v=1:a=0,settb=AVTB${o}`);
    last = o;
  }
  const post = [];
  if (grade) post.push(`lut3d=file='${grade.replace(/'/g, "\\'")}'`);
  if (fade) post.push(`fade=t=out:st=${fade.from}:d=${fade.to - fade.from}:color=${String(fade.color ?? "black").replace("#", "0x")}`);
  let note = null;
  if (label) {
    const font = FONTS.find(existsSync);
    const hasDrawtext = spawnSync(FFMPEG, ["-hide_banner", "-filters"], { encoding: "utf8" }).stdout.includes("drawtext");
    if (font && hasDrawtext) {
      post.push(`drawbox=x=0:y=ih-34:w=iw:h=34:color=black:t=fill`);
      const esc = (s) => String(s).replace(/\\/g, "\\\\").replace(/:/g, "\\:").replace(/'/g, "’").replace(/%/g, "\\%");
      post.push(`drawtext=fontfile='${font}':text='%{pts\\:hms}':x=14:y=h-27:fontsize=19:fontcolor=0xEBEBEB`);
      for (const c of cuts) post.push(`drawtext=fontfile='${font}':text='${esc(label(c))}':x=170:y=h-27:fontsize=19:fontcolor=0xEBEBEB:enable='between(t,${c.at},${c.until - 0.001})'`);
    } else note = "(No labels: this ffmpeg has no drawtext, or no font was found.)";
  }
  graph.push(post.length ? `${last}${post.join(",")}[v]` : `${last}null[v]`);
  const res = spawnSync(FFMPEG, ["-y", "-v", "error", ...inputs, "-i", audio, "-filter_complex", graph.join(";"), "-map", "[v]", "-map", `${segments.length}:a`,
    "-t", String(end), "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", out], { encoding: "utf8" });
  if (res.status !== 0) throw new Error(`ffmpeg failed:\n${res.stderr.slice(-1500)}`);
  return note;
}
