import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const helperRoot = fileURLToPath(new URL("../", import.meta.url));
const skillRoot = join(helperRoot, "skill", "tcrn-workflow-helper");
const catalogSource = join(helperRoot, "..", "tcrn-workflow", "packages", "core", "src", "settings.ts");
const settingPattern = /\b(?:backup\.cadence|backup\.destination|driver\.capabilityProfile|engine\.requiredVersion|execution\.claudeCodeSubagentPlan|execution\.codexSubagentPlan|execution\.independenceFloor|execution\.maxConcurrentSubagents|execution\.maxDispatchDepth|execution\.personalessDispatch|execution\.subagentPolicy|workspace\.generatedArtifactsPath)\b/gu;

async function markdownFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await markdownFiles(path));
    else if (entry.name.endsWith(".md")) files.push(path);
  }
  return files;
}

const [docs, catalog] = await Promise.all([
  Promise.all((await markdownFiles(skillRoot)).map((file) => readFile(file, "utf8"))).then((values) => values.join("\n")),
  readFile(catalogSource, "utf8"),
]);
const catalogKeys = [...catalog.matchAll(/key: "([a-z][A-Za-z0-9.]*)"/gu)].map((match) => match[1]).sort();
const referencedSettings = [...new Set([...docs.matchAll(settingPattern)].map((match) => match[0]))].sort();
if (process.argv.includes("--inject-unknown")) referencedSettings.push("backup.retention");
const unknown = referencedSettings.filter((key) => !catalogKeys.includes(key));
const requiredMarkers = [
  /## Chapter 1 — AGENTS\.md/u,
  /## Chapter 2 — Route every question through four layers/u,
  /## Chapter 3 — Templates have two layers; hooks have two zones/u,
  /Credentials 引用/u,
  /TCRN-managed zone/u,
  /user-owned zone/u,
];
const missingMarkers = requiredMarkers.filter((marker) => !marker.test(docs)).map((marker) => marker.source);
const ok = unknown.length === 0 && missingMarkers.length === 0;
process.stdout.write(`${JSON.stringify({
  ok,
  reasonCode: ok ? "HELPER_TEACHING_CONTRACT_GREEN" : "HELPER_TEACHING_CONTRACT_RED",
  catalogKeys,
  referencedSettings,
  unknown,
  missingMarkers,
}, null, 2)}\n`);
if (!ok) process.exitCode = 1;
