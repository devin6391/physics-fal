// Shared probing and lossless timing/audio checks for local shot repairs.
import { execFileSync } from "node:child_process";
import { FFMPEG, FFPROBE } from "./video.js";

export function capture(command, args) {
  return execFileSync(command, args, { maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "inherit"] });
}

export const probe = (file, ...args) => JSON.parse(capture(FFPROBE, ["-v", "error", ...args, "-of", "json", file]));

function ratio(value) {
  const [n, d = 1] = String(value).split("/").map(Number);
  return n / d;
}

export function inspectVideo(file) {
  const { streams } = probe(file, "-show_streams");
  const videos = streams.filter((stream) => stream.codec_type === "video");
  const audio = streams.filter((stream) => stream.codec_type === "audio");
  if (videos.length !== 1) throw new Error("Supply a clip with one video stream.");
  const [picture] = videos;
  const { width, height, pix_fmt: format, sample_aspect_ratio: sar = "1:1", field_order: fields = "unknown" } = picture;
  if (format !== "yuv420p" || width % 2 || height % 2 || !["1:1", "N/A"].includes(sar)
      || !["progressive", "unknown"].includes(fields) || ["smpte2084", "arib-std-b67"].includes(picture.color_transfer)
      || picture.side_data_list?.some((side) => side.rotation)) {
    throw new Error("Supply an upright, progressive 8-bit SDR yuv420p clip with square pixels.");
  }
  const fps = ratio(picture.avg_frame_rate);
  const clock = ratio(picture.time_base);
  const { frames } = probe(file, "-select_streams", "v:0", "-show_frames", "-show_entries", "frame=best_effort_timestamp");
  if (!Number.isFinite(fps) || fps <= 0 || !Number.isFinite(clock) || clock <= 0
      || !frames?.length || frames.some((frame) => frame.best_effort_timestamp === undefined)) {
    throw new Error("Could not establish the clip’s picture timing.");
  }
  // Raw frames have no timestamps. Reject variable-rate or offset picture
  // rather than silently changing its relationship to audio.
  if (frames.some((frame, index) => Math.abs(Number(frame.best_effort_timestamp) * clock - index / fps) > clock + 1e-9)) {
    throw new Error("Supply a constant-frame-rate clip with video starting at time zero.");
  }
  return { picture, audio, fps, count: frames.length };
}

const audioHash = (file) => capture(FFMPEG, ["-v", "error", "-i", file, "-map", "0:a", "-c", "copy", "-f", "streamhash", "-"]);

export function verifyRepairVideo(clip, review, original) {
  const rendered = inspectVideo(review);
  if (rendered.count !== original.count || rendered.fps !== original.fps
      || ["width", "height"].some((key) => rendered.picture[key] !== original.picture[key])) {
    throw new Error("Review output did not preserve the source picture timing or dimensions.");
  }
  if (original.audio.length !== rendered.audio.length || original.audio.some((stream, i) =>
    Math.abs(Number(stream.start_time ?? 0) - Number(rendered.audio[i].start_time ?? 0)) > .001)
      || (original.audio.length && !audioHash(clip).equals(audioHash(review)))) {
    throw new Error("Review output did not preserve the source audio.");
  }
}

