import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

export const RUNWAY_API = "https://api.dev.runwayml.com/v1";
export const RUNWAY_API_VERSION = "2024-11-06";
export const RUNWAY_GENERATION_PATH = "/image_to_video";
export const RUNWAY_UPLOAD_PATH = "/uploads";
export const runwayKling = {
  provider: "runway",
  request: "runway-kling-v4",
  endpoint: "kling_4",
  resolution: "1080p",
  max_seconds: 30,
};

// Runway's 1080p rate with frames and still references. Revert to list price
// automatically when the published November discount ends.
export function runwayCost(seconds, now = Date.now()) {
  const rate = now < Date.parse("2026-12-01T00:00:00Z") ? 18.8 : 23.5;
  return Math.ceil(seconds * rate - 1e-9) / 100;
}

export function runwayInput(run, { start, end, elements }) {
  const input = {
    model: runwayKling.endpoint,
    promptText: run.prompt,
    duration: run.seconds,
    ratio: `auto_${runwayKling.resolution}`,
    promptImage: end ? [{ uri: start, position: "first" }, { uri: end, position: "last" }] : start,
  };
  if (elements.length) {
    input.references = elements.flatMap(({ frontal_image_url, reference_image_urls }) =>
      [frontal_image_url, ...reference_image_urls].map((uri) => ({ uri })),
    );
  }
  return input;
}

export function runwayImageDigest(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

// Replace only the media URIs in the reviewed body. The prompt and all other
// values are carried over directly from the request shown at approval.
export async function resolveRunwayInput(input, media, upload) {
  const uris = new Map(await Promise.all(media.map(async ({ slot, path, sha256 }) => [
    slot, await upload(path, sha256),
  ])));
  const resolveImage = (image) => ({ ...image, uri: uris.get(image.uri) });
  return {
    ...input,
    promptImage: typeof input.promptImage === "string"
      ? uris.get(input.promptImage) : input.promptImage.map(resolveImage),
    ...(input.references ? { references: input.references.map(resolveImage) } : {}),
  };
}

export function makeRunway(key) {
  const headers = { Authorization: `Bearer ${key}`, "X-Runway-Version": RUNWAY_API_VERSION };
  async function request(path, input) {
    const res = await fetch(RUNWAY_API + path, {
      headers: input ? { ...headers, "Content-Type": "application/json" } : headers,
      method: input ? "POST" : "GET",
      body: input ? JSON.stringify(input) : undefined,
      signal: AbortSignal.timeout(60000),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(`Runway ${path}: HTTP ${res.status}${data?.error ? ` — ${data.error}` : ""}`);
    if (!data) throw new Error(`Runway ${path} returned no JSON`);
    return data;
  }

  const uploads = new Map();
  async function uploadFile(path, approvedDigest) {
    const filename = basename(path);
    const bytes = await readFile(path);
    if (approvedDigest && runwayImageDigest(bytes) !== approvedDigest) {
      throw new Error(`Runway input ${filename} changed after preview. Start a new review and approval.`);
    }
    const { uploadUrl, fields, runwayUri } = await request(RUNWAY_UPLOAD_PATH, { filename, type: "ephemeral" });
    const form = new FormData();
    for (const [name, value] of Object.entries(fields)) form.append(name, value);
    const type = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp" }[filename.split(".").at(-1)];
    form.append("file", new Blob([bytes], { type }), filename);
    const res = await fetch(uploadUrl, { method: "POST", body: form, signal: AbortSignal.timeout(120000) });
    if (!res.ok) throw new Error(`Runway upload failed for ${filename}: HTTP ${res.status}`);
    return runwayUri;
  }

  return {
    organization: () => request("/organization"),
    upload(path, approvedDigest) {
      const cacheKey = JSON.stringify([path, approvedDigest]);
      if (!uploads.has(cacheKey)) {
        uploads.set(cacheKey, uploadFile(path, approvedDigest).catch((err) => {
          uploads.delete(cacheKey);
          throw err;
        }));
      }
      return uploads.get(cacheKey);
    },
    submit: (input) => request(RUNWAY_GENERATION_PATH, input),
    async waitForVideo(id) {
      const deadline = Date.now() + 45 * 60 * 1000;
      while (Date.now() < deadline) {
        await delay(5000);
        const task = await request(`/tasks/${encodeURIComponent(id)}`);
        if (task.status === "SUCCEEDED") {
          if (!task.output?.[0]) throw new Error("Runway returned no video");
          return task.output[0];
        }
        if (task.status === "FAILED" || task.status === "CANCELED") {
          throw new Error([`Runway task ${task.status.toLowerCase()}`, task.failureCode, task.failure].filter(Boolean).join(" — "));
        }
      }
      throw new Error(`Runway task ${id} is still pending after 45 minutes. Check Runway Dev before submitting again.`);
    },
  };
}
