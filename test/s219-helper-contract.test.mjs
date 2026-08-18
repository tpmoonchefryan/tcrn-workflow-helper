import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const helperRoot = fileURLToPath(new URL("../", import.meta.url));
const skillRoot = join(helperRoot, "skill", "tcrn-workflow-helper");
const catalogSource = join(helperRoot, "..", "tcrn-workflow", "packages", "core", "src", "settings.ts");
const settingPattern = /\b(?:backup\.cadence|backup\.destination|conference\.positionBudgetBytes|design\.authority|driver\.capabilityProfile|engine\.requiredVersion|execution\.claudeCodeSubagentPlan|execution\.codexSubagentPlan|execution\.independenceFloor|execution\.maxConcurrentSubagents|execution\.maxDispatchDepth|execution\.personalessDispatch|execution\.subagentPolicy|workspace\.generatedArtifactsPath)\b/gu;

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

test("S219 helper teaching contract is catalog-backed and has three chapters", async () => {
  const files = await markdownFiles(skillRoot);
  const [docs, catalog] = await Promise.all([
    Promise.all(files.map((file) => readFile(file, "utf8"))).then((values) => values.join("\n")),
    readFile(catalogSource, "utf8"),
  ]);
  const registered = [...catalog.matchAll(/key: "([a-z][A-Za-z0-9.]*)"/gu)].map((match) => match[1]);
  const referenced = [...new Set([...docs.matchAll(settingPattern)].map((match) => match[0]))].sort();

  assert.deepEqual(registered.sort(), [
    "backup.cadence",
    "backup.destination",
    "conference.positionBudgetBytes",
    "design.authority",
    "driver.capabilityProfile",
    "engine.requiredVersion",
    "execution.claudeCodeSubagentPlan",
    "execution.codexSubagentPlan",
    "execution.independenceFloor",
    "execution.maxConcurrentSubagents",
    "execution.maxDispatchDepth",
    "execution.personalessDispatch",
    "execution.subagentPolicy",
    "workspace.generatedArtifactsPath",
  ]);
  assert.deepEqual(referenced, registered.sort());
  assert.doesNotMatch(docs, /`backup\.retention`/u);
  assert.match(docs, /AGENTS\.md/u);
  assert.match(docs, /settings-catalog/u);
  assert.match(docs, /settings-set/u);
  assert.match(docs, /model-plan-set/u);
  assert.match(docs, /persona-preset-override/u);
  assert.match(docs, /Credentials 引用/u);
  assert.match(docs, /TCRN-managed zone/u);
  assert.match(docs, /user-owned zone/u);

  const contract = await readFile(join(skillRoot, "references", "operating-contract-v1.md"), "utf8");
  for (const chapter of ["Chapter 1", "Chapter 2", "Chapter 3"]) assert.match(contract, new RegExp(`## ${chapter}`, "u"));
});
