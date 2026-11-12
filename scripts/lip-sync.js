#!/usr/bin/env node
// Align an existing performance to the scene audio. Each anchor pairs a moment
// in the radio-cut audio with the matching moment in the source picture.
import { constants, copyFileSync, mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { ROOT } from "../lib/project.js";
import { capture, inspectVideo, verifyRepairVideo } from "../lib/repair-video.js";
import { FFMPEG } from "../lib/video.js";

const usage = `Usage: npm run lip-sync -- --shot SHOT --clip VIDEO --anchor AUDIO:PICTURE [--anchor AUDIO:PICTURE ...]

Times are in clip seconds. AUDIO is the desired position on the radio-cut audio.
PICTURE is where that action occurs in the source picture. Matching times can
pin gestures or mark the points where the shot returns to its original pace.
Use --dry-run to show the anchors and affected interval without rendering.`;

function timeMap(values, { fps, count }) {
  const duration = count / fps;
  const anchors = values.map((value) => {
    if (!/^\d+(?:\.\d+)?:\d+(?:\.\d+)?$/.test(value)) throw new Error(`Use AUDIO:PICTURE seconds for the anchor ${value}.`);
    const [audio, picture] = value.split(":").map(Number);
    if (audio > duration || picture > duration) throw new Error(`Anchor ${value} falls outside the ${duration.toFixed(3)}s clip.`);
    return { audio, picture };
  });
  if (anchors[0].audio !== 0 || anchors[0].picture !== 0) anchors.unshift({ audio: 0, picture: 0 });
  if (anchors.at(-1).audio !== duration || anchors.at(-1).picture !== duration) anchors.push({ audio: duration, picture: duration });
  if (anchors.slice(1).some((a, i) => a.audio <= anchors[i].audio || a.picture <= anchors[i].picture)) {
    throw new Error("Both the audio and picture times must increase from one anchor to the next.");
  }
  const moved = anchors.map((a, i) => Math.abs(a.audio - a.picture) > 1e-8 ? i : -1).filter((i) => i >= 0);
  if (!moved.length) throw new Error("At least one anchor must move the picture to a different audio time.");
  return {
    anchors, moved,
    start: Math.ceil(anchors[moved[0] - 1].audio * fps - 1e-9),
    end: Math.min(count, Math.ceil(anchors[moved.at(-1) + 1].audio * fps - 1e-9)),
  };
}

function mappedFrame(anchors, fps) {
  const points = anchors.map(({ picture, audio }) => ({ x: picture * fps, y: audio * fps }));
  const slopes = points.slice(1).map((point, i) => (point.y - points[i].y) / (point.x - points[i].x));
  // Harmonic tangents keep the remap monotone and ease the changes in speed.
  const tangents = points.map((_, i) => {
    if (i === 0) return slopes[0];
    if (i === points.length - 1) return slopes.at(-1);
    return 2 * slopes[i - 1] * slopes[i] / (slopes[i - 1] + slopes[i]);
  });
  let expr = "N";
  for (let i = points.length - 2; i >= 0; i--) {
    const { x, y } = points[i];
    const dx = points[i + 1].x - x;
    const dy = points[i + 1].y - y;
    const a = tangents[i] * dx;
    const b = tangents[i + 1] * dx;
    const segment = `st(0,(N-${x})/${dx});${y}+ld(0)*(${a}+ld(0)*(${3 * dy - 2 * a - b}+ld(0)*(${a + b - 2 * dy})))`;
    expr = `if(lt(N,${points[i + 1].x}),${segment},${expr})`;
  }
  return expr;
}

function render(clip, output, video, mapping) {
  const { fps, count, picture } = video;
  const { anchors, start, end } = mapping;
  const rate = picture.avg_frame_rate;
  const [rateNum, rateDen = "1"] = rate.split("/");
  const graph = [];
  const head = start > 0;
  const tail = end < count;
  if (head || tail) graph.push(`[0:v:0]split=${1 + Number(head) + Number(tail)}[input]${head ? "[head]" : ""}${tail ? "[tail]" : ""}`);
  // Give the motion filter a few frames of lookahead. The trim below takes
  // exactly the remapped interval and the original frames supply both joins.
  graph.push(`${head || tail ? "[input]" : "[0:v:0]"}trim=end_frame=${Math.min(count, end + 4)},`
    + `tpad=stop_mode=clone:stop=4,settb=AVTB,setpts='round((${mappedFrame(anchors, fps)})/${fps}/TB)',`
    + `minterpolate=fps=${rate}:mi_mode=mci:mc_mode=aobmc:vsbmc=1,trim=start_frame=${start}:end_frame=${end},setpts=PTS-STARTPTS[retimed]`);
  if (head) graph.push(`[head]trim=end_frame=${start},setpts=PTS-STARTPTS[before]`);
  if (tail) graph.push(`[tail]trim=start_frame=${end},setpts=PTS-STARTPTS[after]`);
  const parts = [head && "[before]", "[retimed]", tail && "[after]"].filter(Boolean);
  graph.push(`${parts.join("")}${parts.length > 1 ? `concat=n=${parts.length}:v=1:a=0,` : ""}`
    + `settb=expr=${rateDen}/${rateNum},setpts=N[picture]`);
  capture(FFMPEG, ["-v", "error", "-xerror", "-n", "-copyts", "-i", clip, "-filter_complex", graph.join(";"),
    "-map", "[picture]", "-map", "0:a", "-fps_mode", "passthrough", "-c:v", "libx264", "-crf", "0", "-preset", "fast",
    "-pix_fmt", "yuv420p", "-c:a", "copy", "-movflags", "+faststart", output]);
}

function comparison(clip, review, output, { fps, count, picture }, { anchors, moved }) {
  const start = Math.max(0, Math.floor((anchors[moved[0]].audio - 1) * fps));
  const end = Math.min(count, Math.ceil((anchors[moved.at(-1)].audio + 1) * fps));
  const width = Math.min(640, picture.width);
  const graph = ["a", "b"].map((label, i) =>
    `[${i}:v]trim=start_frame=${start}:end_frame=${end},setpts=PTS-STARTPTS,scale=${width}:-2[${label}]`);
  graph.push("[a][b]hstack[picture]", `[0:a:0]atrim=start=${start / fps}:end=${end / fps},asetpts=PTS-STARTPTS[radio]`);
  capture(FFMPEG, ["-v", "error", "-n", "-i", clip, "-i", review, "-filter_complex", graph.join(";"),
    "-map", "[picture]", "-map", "[radio]", "-c:v", "libx264", "-crf", "17", "-preset", "fast",
    "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", output]);
}

function main() {
  const { values: options } = parseArgs({ options: {
    shot: { type: "string" }, clip: { type: "string" }, anchor: { type: "string", multiple: true },
    "dry-run": { type: "boolean" }, help: { type: "boolean", short: "h" },
  } });
  if (options.help) return console.log(usage);
  if (!options.shot || !options.clip || !options.anchor?.length) throw new Error(usage);
  if (!/^[A-Za-z0-9_-]+$/.test(options.shot)) throw new Error("Use a shot ID with letters, numbers, underscores or hyphens.");
  const clip = realpathSync(resolve(options.clip));
  const video = inspectVideo(clip);
  if (!video.audio.length) throw new Error("Supply a shot preview that already contains its radio-cut audio.");
  const mapping = timeMap(options.anchor, video);
  console.log(`${options.shot}: picture frames ${mapping.start}–${mapping.end - 1} will be retimed at ${video.picture.avg_frame_rate} fps.`);
  mapping.anchors.forEach(({ picture, audio }) => console.log(`  picture ${picture.toFixed(3)}s → audio ${audio.toFixed(3)}s`));
  if (options["dry-run"]) return;

  const work = mkdtempSync(join(tmpdir(), "physics-lip-sync-"));
  try {
    const review = join(work, "review.mp4");
    const compare = join(work, "comparison.mp4");
    render(clip, review, video, mapping);
    verifyRepairVideo(clip, review, video);
    comparison(clip, review, compare, video, mapping);
    const parent = join(ROOT, "out", "lip-sync", options.shot);
    mkdirSync(parent, { recursive: true });
    const destination = mkdtempSync(join(parent, "review-"));
    try {
      copyFileSync(review, join(destination, "review.mp4"), constants.COPYFILE_EXCL);
      copyFileSync(compare, join(destination, "comparison.mp4"), constants.COPYFILE_EXCL);
    } catch (error) {
      rmSync(destination, { recursive: true, force: true });
      throw error;
    }
    console.log(`Full shot: ${join(destination, "review.mp4")}`);
    console.log(`Comparison (original left): ${join(destination, "comparison.mp4")}`);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

try {
  main();
} catch (error) {
  console.error(`Lip sync: ${error.message}`);
  process.exitCode = 1;
}
