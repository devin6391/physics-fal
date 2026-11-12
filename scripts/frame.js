#!/usr/bin/env node
import dotenv from "dotenv";
import { createHash } from "node:crypto";
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { fromRoot, loadConfig } from "../lib/project.js";
import { download, makeNotion } from "../lib/notion.js";
import { resolveReferences } from "../lib/gemini-refs.js";

dotenv.config({ path: fromRoot(".env"), quiet: true });

const location = "global";
const apiVersion = "v1";
const config = {
  responseModalities: ["TEXT", "IMAGE"],
  candidateCount: 1,
  imageConfig: { aspectRatio: "16:9", imageSize: "1K" },
};
// Google Cloud Model Garden standard global USD rates for 1K image requests.
const models = new Map([
  ["flash", {
    model: "gemini-3.1-flash-image",
    imageRates: { inputTokens: 1120, outputTokens: 1120, inputUsdPerMillion: 0.50, outputUsdPerMillion: 60 },
  }],
  ["pro", {
    model: "gemini-3-pro-image",
    imageRates: { inputTokens: 560, outputTokens: 1120, inputUsdPerMillion: 2, outputUsdPerMillion: 120 },
  }],
]);
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

function promptText(value) {
  const text = value.replace(/\r\n?/g, "\n").trim();
  // Existing frame fields can include human upload directions ahead of the model prompt.
  const marker = /^GEMINI PROMPT\s*:?[^\S\n]*\n|^Download the ordered inputs with:[^\n]*\n[ \t]*\n/im.exec(text);
  if (marker) return text.slice(marker.index + marker[0].length).trim();
  if (/^UPLOAD\b/im.test(text)) {
    throw new Error("Separate the upload instructions from the image prompt with a GEMINI PROMPT line.");
  }
  return text;
}

function imageMime(bytes) {
  if (bytes.subarray(0, 8).toString("hex") === "89504e470d0a1a0a") return "image/png";
  if (bytes.subarray(0, 3).toString("hex") === "ffd8ff") return "image/jpeg";
  if (bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  throw new Error("Expected a PNG, JPEG or WebP image.");
}

async function run() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      frame: { type: "string" },
      model: { type: "string", default: "flash" },
      print: { type: "boolean" },
      "dry-run": { type: "boolean" },
      yes: { type: "boolean" },
      request: { type: "string" },
    },
  });
  const [shot] = positionals;
  const frame = values.frame;
  const modeCount = [values.print, values["dry-run"], values.yes].filter(Boolean).length;
  if (positionals.length !== 1 || !/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(shot)
    || !["start", "end"].includes(frame) || modeCount > 1 || (values.request !== undefined) !== Boolean(values.yes)
    || (values.yes && !/^[a-f0-9]{64}$/.test(values.request))) {
    throw new Error("Usage: npm run frame -- SHOT --frame start|end [--model flash|pro] [--print | --dry-run | --yes --request ID]");
  }
  const selected = models.get(values.model);
  if (!selected) throw new Error("Choose --model flash or --model pro.");
  const { model, imageRates } = selected;
  const notion = makeNotion(loadConfig());
  const bundle = await resolveReferences(notion, shot, frame);
  const source = await notion.frameSource(bundle.pageId, frame);
  const prompt = promptText(source.prompt);
  if (!prompt) throw new Error(`${shot}: ${source.field} is empty.`);

  const project = process.env.GOOGLE_CLOUD_PROJECT?.trim();
  const folder = fromRoot(join("out", "frames", `scene-${String(source.sceneNo).padStart(2, "0")}`));
  const estimate = (bundle.refs.length * imageRates.inputTokens * imageRates.inputUsdPerMillion
    + imageRates.outputTokens * imageRates.outputUsdPerMillion) / 1e6;
  console.log(`${shot} · ${frame} frame · ${bundle.page}`);
  console.log(`Vertex AI · ${model} · ${location} · 16:9 · 1K · one candidate`);
  console.log(`Cloud project: ${project || "(set GOOGLE_CLOUD_PROJECT in .env)"}`);
  console.log(`Image estimate: $${estimate.toFixed(5)} USD before credits, plus prompt/response text and any thinking tokens.`);
  console.log(`Output folder: ${folder}`);
  console.log("Reference order:");
  for (const ref of bundle.refs) console.log(`  ${ref.number}. ${ref.file.name} (${ref.label})`);
  console.log(`\nExact image prompt\n\n${prompt}\n`);
  if (!values["dry-run"] && !values.yes) {
    console.log("Print only. Use --dry-run to verify the actual reference bytes.");
    return;
  }

  const images = [];
  for (const ref of bundle.refs) {
    const { path } = await download(ref.file);
    const bytes = readFileSync(fromRoot(path));
    const digest = sha256(bytes);
    console.log(`Image ${ref.number} SHA-256: ${digest}`);
    images.push({ name: ref.filename, digest, mimeType: imageMime(bytes), data: bytes.toString("base64") });
  }

  const requestId = sha256(JSON.stringify({
    shot: bundle.pageId, frame, project, location, model, apiVersion, config, prompt, imageRates,
    images: images.map(({ name, digest, mimeType }) => ({ name, digest, mimeType })),
  }));
  if (values["dry-run"]) {
    console.log("Dry run complete. No Google API call.");
    if (project) {
      console.log(`For this approved request, run:\nnpm run frame -- ${shot} --frame ${frame} --model ${values.model} --yes --request ${requestId}`);
    } else {
      console.log("Set GOOGLE_CLOUD_PROJECT and repeat the dry run to get the exact run command.");
    }
    return;
  }
  if (!project) throw new Error("Set GOOGLE_CLOUD_PROJECT in .env and repeat the dry run.");
  if (values.request !== requestId) throw new Error("Request differs from the dry run. Review the new dry run before generating.");

  const { GoogleGenAI } = await import("@google/genai");
  const ai = new GoogleGenAI({
    vertexai: true,
    project,
    location,
    httpOptions: { apiVersion, retryOptions: { attempts: 1 } },
  });
  mkdirSync(folder, { recursive: true });
  const attempt = mkdtempSync(join(folder, `${shot}-${frame}-`));
  const log = join(attempt, "log.csv");
  const record = (status, detail = "") => {
    const cells = [new Date().toISOString(), model, project, requestId, estimate.toFixed(5), status, detail];
    appendFileSync(log, cells.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(",") + "\n");
  };
  writeFileSync(log, "time,model,project,request_id,estimated_image_usd,status,detail\n", { flag: "wx" });
  record("submitted");
  try {
    let response;
    try {
      response = await ai.models.generateContent({
        model,
        contents: [{ role: "user", parts: [
          ...images.map(({ mimeType, data }) => ({ inlineData: { mimeType, data } })),
          { text: prompt },
        ] }],
        config,
      });
    } catch (error) {
      // Avoid printing provider payloads, which may include request data or credentials.
      const status = Number(error.status ?? error.code);
      const detail = Number.isInteger(status) && status >= 400 && status <= 599 ? ` (HTTP ${status})` : "";
      throw new Error(`Vertex AI request failed${detail}. Check local ADC login, project access, billing and Vertex AI quota before retrying.`);
    }
    const parts = response.candidates?.flatMap((candidate) => candidate.content?.parts ?? []) ?? [];
    const outputs = parts.filter((part) => !part.thought && part.inlineData?.mimeType?.startsWith("image/") && part.inlineData.data);
    if (!outputs.length) {
      const reason = response.promptFeedback?.blockReason ?? response.candidates?.[0]?.finishReason;
      throw new Error(`Vertex AI returned no image${reason ? ` (${reason})` : ""}.`);
    }
    for (const [index, output] of outputs.entries()) {
      const bytes = Buffer.from(output.inlineData.data, "base64");
      const extension = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" }[imageMime(bytes)];
      const filename = `${shot}-${frame}${outputs.length === 1 ? "" : `-${index + 1}`}.${extension}`;
      const path = join(attempt, filename);
      writeFileSync(path, bytes, { flag: "wx" });
      console.log(`Saved candidate: ${path}`);
      console.log(`After review and selection: node scripts/upload.js --shot ${shot} ${frame}-frame "${path}"`);
    }
    record("ok", `${outputs.length} image(s)`);
  } catch (error) {
    record("failed", error.message);
    throw error;
  }
}

run().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
