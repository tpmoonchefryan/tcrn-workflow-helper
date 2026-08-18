import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const helperRoot = fileURLToPath(new URL("../", import.meta.url));
const skillRoot = join(helperRoot, "skill", "tcrn-workflow-helper");

// The settings surface this payload declares it teaches. It used to be re-derived
// by reading `../tcrn-workflow/packages/core/src/settings.ts` — this repository
// reaching into a sibling's tree, which the platform forbids outright, and which
// CI cannot do anyway: it checks out this repository alone, so the read was ENOENT
// and helper CI had been red on it for three consecutive pushes while every local
// run was green. A check that answers differently depending on which machine runs
// it is not reporting a property of the thing it judges.
//
// So the comparison is split by who can legitimately see what. Here, where only
// this repository is in scope, the roster is *declared* and the payload is held to
// it. Whether that declaration still matches the engine's own catalog is a
// cross-repository question, and it is answered at the platform layer, which sees
// both trees by design: `platform-doctor`'s `helperSettingsCoverage` leg reads the
// engine through its `settings-catalog` read face and compares. Neither half is
// dropped; each is asked where it can be answered the same way every time.
const DECLARED_SETTING_KEYS = Object.freeze([
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
const settingPattern = new RegExp(`\\b(?:${DECLARED_SETTING_KEYS.map((key) => key.replaceAll(".", "\\.")).join("|")})\\b`, "gu");

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
  const docs = (await Promise.all(files.map((file) => readFile(file, "utf8")))).join("\n");
  const referenced = [...new Set([...docs.matchAll(settingPattern)].map((match) => match[0]))].sort();

  // Both directions: a declared key the payload never teaches is a gap, and a key
  // the payload teaches without declaring cannot be matched at all — the pattern is
  // built from the roster, so the second is caught by the platform leg instead.
  assert.deepEqual(referenced, [...DECLARED_SETTING_KEYS].sort());
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
