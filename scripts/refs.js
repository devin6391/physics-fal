#!/usr/bin/env node
// Download the ordered images for a Gemini start/end-frame prompt, using only Notion's SDK.
//   npm run refs -- CO-01 --frame end
//   npm run refs -- CO-01 --frame end --print
import dotenv from "dotenv";
import { parseArgs } from "node:util";
import { fromRoot, loadConfig } from "../lib/project.js";
import { makeNotion } from "../lib/notion.js";
import { referenceFolder, resolveReferences, saveReferences } from "../lib/gemini-refs.js";

dotenv.config({ path: fromRoot(".env"), quiet: true });
try {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: { frame: { type: "string" }, print: { type: "boolean", default: false } },
  });
  if (positionals.length !== 1 || !["start", "end"].includes(values.frame)) {
    throw new Error("Usage: npm run refs -- SHOT --frame start|end [--print]");
  }
  const shot = positionals[0];
  const bundle = await resolveReferences(makeNotion(loadConfig()), shot, values.frame);
  const folder = referenceFolder(shot, values.frame);
  console.log(`${shot} · ${values.frame} frame · upload in this order:`);
  if (values.print) {
    for (const ref of bundle.refs) console.log(`  ${ref.number}. ${ref.file.name} → ${ref.filename}`);
    console.log(`\nDestination: ${folder}\nPrint only; no files downloaded.`);
  } else {
    const results = await saveReferences(bundle, { folder, report: (ref, result) => {
      console.log(`  ${result.fresh ? "✓" : "="} ${ref.number}. ${ref.file.name} → ${ref.filename}`);
    } });
    console.log(`\n${results.filter((r) => r.fresh).length} copied, ${results.filter((r) => !r.fresh).length} already here.\nFolder: ${folder}`);
    console.log("Use the current numbered files listed above. Older files are preserved if a Notion image changes.");
  }
} catch (err) {
  console.error(err?.code === "unauthorized" || err?.code === "object_not_found"
    ? "Notion access failed: check NOTION_TOKEN and the integration's access to the referenced pages."
    : err.message);
  process.exitCode = 1;
}
