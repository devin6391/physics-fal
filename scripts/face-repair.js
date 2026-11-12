#!/usr/bin/env node
// Render a local, reversible review of one flagged face-continuity interval.
import { spawn } from "node:child_process";
import { once } from "node:events";
import { constants, copyFileSync, mkdirSync, mkdtempSync, readdirSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { extname, join, resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import { parseArgs } from "node:util";
import { preparePortrait, repairFace, trackedStrength, usableFace } from "../lib/face-repair.js";
import { ROOT } from "../lib/project.js";
import { FFMPEG } from "../lib/video.js";
import { capture, inspectVideo, probe, verifyRepairVideo } from "../lib/repair-video.js";

const usage = `Usage: npm run face-repair -- --shot SHOT --clip VIDEO --reference IMAGE --from SECONDS --to SECONDS

  --region x,y,width,height   Select a face by its center in source pixels
  --protect-side left|right   Reduce the blend near a hand or phone on that screen side
  --strength NUMBER          Detail blend above 0 through 1 (default 0.8)`;

function frameRange(options, { picture, fps, count }) {
  const from = Number(options.from), to = Number(options.to);
  if (!options.from?.trim() || !options.to?.trim() || !Number.isFinite(from) || !Number.isFinite(to) || from < 0 || to <= from) {
    throw new Error("Use a positive clip time range with --from and --to.");
  }
  if (to > (count + .5) / fps) throw new Error(`The clip ends at ${(count / fps).toFixed(3)} seconds.`);
  const start = Math.ceil(from * fps - 1e-9);
  const end = Math.min(count, Math.ceil(to * fps - 1e-9));
  if (end - start < 3) throw new Error("Select at least three frames for the tracked repair.");
  let region;
  if (options.region !== undefined) {
    if (!/^\d+,\d+,\d+,\d+$/.test(options.region)) throw new Error("Use --region x,y,width,height in source pixels.");
    region = options.region.split(",").map(Number);
    const [x, y, width, height] = region;
    if (!width || !height || x + width > picture.width || y + height > picture.height) {
      throw new Error("The face selection region must fit inside the clip.");
    }
  }
  return { start, end, region };
}

function insideRegion({ center: [cx, cy] }, region) {
  if (!region) return true;
  const [x, y, w, h] = region;
  return x <= cx && cx < x + w && y <= cy && cy < y + h;
}

function faceSamples(work, portrait, frames, region) {
  const tracker = join(work, "landmarks");
  capture("xcrun", ["clang", "-Wno-deprecated-declarations", "-fobjc-arc", "-framework", "Foundation",
    "-framework", "Vision", "-framework", "ImageIO", "-framework", "CoreGraphics",
    join(ROOT, "lib", "face_repair_landmarks.m"), "-o", tracker]);
  const reference = JSON.parse(capture(tracker, [portrait]).toString());
  if (reference.length !== 1 || !usableFace(reference[0])) throw new Error("Use an approved close-up with one clearly visible face.");
  const tracked = new Map();
  let ambiguous = 0;
  // Batches keep file paths within the OS argument limit.
  for (let offset = 0; offset < frames.length; offset += 80) {
    const batch = frames.slice(offset, offset + 80);
    const rows = capture(tracker, batch.map(({ path }) => path)).toString().trim().split("\n");
    if (rows.length !== batch.length) throw new Error("The landmark tool did not report every selected frame.");
    rows.forEach((row, i) => {
      const candidates = JSON.parse(row).filter((face) => insideRegion(face, region));
      if (candidates.length > 1) ambiguous++;
      else if (candidates.length === 1 && usableFace(candidates[0])) tracked.set(batch[i].index, candidates[0]);
    });
  }
  return { reference: reference[0], tracked, ambiguous };
}

function childFinished(child, label) {
  return once(child, "close").then(([code, signal]) => {
    if (code !== 0) throw new Error(`${label} failed (${signal ?? code}).`);
  });
}

async function encode(clip, output, { picture, count }, portrait, tracked, strength, protectSide) {
  const { width, height } = picture;
  const frameBytes = width * height * 3 / 2;
  const fields = { range: "color_range", color_primaries: "color_primaries", color_trc: "color_transfer", colorspace: "color_space" };
  const tags = Object.entries(fields).filter(([, key]) => ![undefined, "unknown", "unspecified"].includes(picture[key]))
    .map(([field, key]) => `${field}=${picture[key]}`);
  const reader = spawn(FFMPEG, ["-v", "error", "-xerror", "-i", clip, "-map", "0:v:0", "-fps_mode", "passthrough",
    "-pix_fmt", "yuv420p", "-f", "rawvideo", "-"], { stdio: ["ignore", "pipe", "inherit"] });
  const writer = spawn(FFMPEG, ["-v", "error", "-n", "-copyts", "-f", "rawvideo", "-pixel_format", "yuv420p",
    "-video_size", `${width}x${height}`, "-framerate", picture.avg_frame_rate, "-i", "pipe:0", "-i", clip,
    "-map", "0:v:0", "-map", "1:a?", "-fps_mode", "passthrough", ...(tags.length ? ["-vf", `setparams=${tags.join(":")}`] : []),
    "-c:v", "libx264", "-crf", "0", "-preset", "fast", "-pix_fmt", "yuv420p", "-c:a", "copy",
    "-movflags", "+faststart", output], { stdio: ["pipe", "ignore", "inherit"] });
  const changed = [];
  async function* processFrames(chunks) {
    let index = 0, filled = 0;
    let frame = Buffer.allocUnsafe(frameBytes);
    for await (const chunk of chunks) {
      for (let offset = 0; offset < chunk.length;) {
        const length = Math.min(frameBytes - filled, chunk.length - offset);
        chunk.copy(frame, filled, offset, offset + length);
        filled += length;
        offset += length;
        if (filled < frameBytes) continue;
        const face = tracked.get(index);
        if (face && repairFace(frame, width, height, face, portrait,
          trackedStrength(tracked, index, strength, face.yaw), protectSide)) changed.push(index);
        yield frame;
        frame = Buffer.allocUnsafe(frameBytes);
        filled = 0;
        index++;
      }
    }
    if (filled || index !== count) throw new Error(`Decoded ${index} complete frames. Expected ${count}.`);
  }
  try {
    await Promise.all([childFinished(reader, "Video decode"), childFinished(writer, "Video encode"),
      pipeline(reader.stdout, processFrames, writer.stdin)]);
  } catch (error) {
    reader.kill();
    writer.kill();
    throw error;
  }
  return changed;
}

function compare(clip, review, output, { start, end }, width) {
  const graph = ["a", "b"].map((label, i) =>
    `[${i}:v]trim=start_frame=${start}:end_frame=${end},setpts=PTS-STARTPTS,scale=${width}:-2[${label}]`);
  graph.push("[a][b]hstack[picture]");
  capture(FFMPEG, ["-v", "error", "-n", "-i", clip, "-i", review, "-filter_complex", graph.join(";"),
    "-map", "[picture]", "-an", "-c:v", "libx264", "-crf", "17", "-preset", "fast", "-pix_fmt", "yuv420p",
    "-movflags", "+faststart", output]);
}

async function main() {
  const { values: options } = parseArgs({ options: {
    shot: { type: "string" }, clip: { type: "string" }, reference: { type: "string" }, from: { type: "string" },
    to: { type: "string" }, region: { type: "string" }, "protect-side": { type: "string" },
    strength: { type: "string", default: ".8" }, help: { type: "boolean", short: "h" },
  } });
  if (options.help) return console.log(usage);
  if (!options.shot || !options.clip || !options.reference || options.from === undefined || options.to === undefined) throw new Error(usage);
  if (process.platform !== "darwin") throw new Error("This command uses Apple Vision and runs on macOS.");
  if (!/^[A-Za-z0-9_-]+$/.test(options.shot)) throw new Error("Use a shot ID with letters, numbers, underscores or hyphens.");
  const strength = Number(options.strength);
  if (!(strength > 0 && strength <= 1)) throw new Error("Use a strength above 0 through 1.");
  if (options["protect-side"] !== undefined && !["left", "right"].includes(options["protect-side"])) {
    throw new Error("Use left or right for --protect-side.");
  }
  const clip = realpathSync(resolve(options.clip));
  const reference = realpathSync(resolve(options.reference));
  if (![".png", ".jpg", ".jpeg", ".webp"].includes(extname(reference).toLowerCase())) {
    throw new Error("Use a PNG, JPEG or WebP image from the approved Face close-up field.");
  }
  const original = inspectVideo(clip);
  const range = frameRange(options, original);
  const { start, end, region } = range;
  const work = mkdtempSync(join(tmpdir(), "physics-face-repair-"));
  try {
    const portraitFile = join(work, "portrait.png");
    capture(FFMPEG, ["-v", "error", "-i", reference, "-frames:v", "1", "-pix_fmt", "rgb24", portraitFile]);
    capture(FFMPEG, ["-v", "error", "-i", clip, "-map", "0:v:0", "-vf", `trim=start_frame=${start}:end_frame=${end}`,
      "-fps_mode", "passthrough", "-start_number", String(start), "-pix_fmt", "rgb24", join(work, "frame-%08d.png")]);
    const frames = readdirSync(work).filter((name) => /^frame-\d+\.png$/.test(name)).sort()
      .map((name) => ({ path: join(work, name), index: Number(name.slice(6, -4)) }));
    if (frames.length !== end - start || frames.some(({ index }, i) => index !== start + i)) {
      throw new Error("The extracted tracking range does not match the requested frames.");
    }
    const samples = faceSamples(work, portraitFile, frames, region);
    console.log(`${options.shot}: one usable face tracked in ${samples.tracked.size}/${frames.length} selected frames. Ambiguous frames skipped: ${samples.ambiguous}.`);
    if (!samples.tracked.size) throw new Error("No usable face tracked. Try a visible interval or use --region for a multi-person shot.");
    const { width, height } = probe(portraitFile, "-show_streams").streams[0];
    const rgb = capture(FFMPEG, ["-v", "error", "-i", portraitFile, "-frames:v", "1", "-pix_fmt", "rgb24", "-f", "rawvideo", "-"]);
    const portrait = preparePortrait(rgb, width, height, samples.reference, original.picture.color_range === "pc");
    const review = join(work, "review.mp4");
    const changed = await encode(clip, review, original, portrait, samples.tracked, strength, options["protect-side"]);
    if (!changed.length) throw new Error("No visible repair was applied. Select a longer range with a clearer face.");
    verifyRepairVideo(clip, review, original);
    const comparison = join(work, "comparison.mp4");
    compare(clip, review, comparison, range, Math.min(640, original.picture.width));
    const parent = join(ROOT, "out", "face-repair", options.shot);
    mkdirSync(parent, { recursive: true });
    const destination = mkdtempSync(join(parent, "review-"));
    try {
      copyFileSync(review, join(destination, "review.mp4"), constants.COPYFILE_EXCL);
      copyFileSync(comparison, join(destination, "comparison.mp4"), constants.COPYFILE_EXCL);
    } catch (error) {
      rmSync(destination, { recursive: true, force: true });
      throw error;
    }
    const time = (frame) => (frame / original.fps).toFixed(3);
    console.log(`Repaired ${changed.length} frames, first at ${time(changed[0])}s and last at ${time(changed.at(-1))}s.`);
    console.log(`Full shot: ${join(destination, "review.mp4")}`);
    console.log(`Comparison (original left): ${join(destination, "comparison.mp4")}`);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(`Face repair: ${error.message}`);
  process.exitCode = 1;
});
