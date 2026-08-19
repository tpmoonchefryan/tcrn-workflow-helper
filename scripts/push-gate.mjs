// SPDX-License-Identifier: Apache-2.0
//
// G-4 push gate. Run this before pushing to GitHub; a push is authorized only by
// a PUSH_GATE_VERIFIED receipt on stdout and exit 0.
//
// The checks are not a general quality sweep -- each one is a defect that actually
// reached a tag in this program:
//
//   * The rc.6 re-pin advanced IDENTITY.version and left the provenance document
//     declaring the previous release. validateProvenance compares them, so 22 of 72
//     tests were red at a tagged commit. It survived because artifact validation
//     (`pnpm verify`) was run in place of the suite -- and artifact validation says
//     nothing about whether provenance agrees with IDENTITY. Checks 3 and 4.
//
//   * Editing the bootstrap changes the one digest a user checks by hand, and it is
//     published in six documents. A stale value in any one of them tells a reader to
//     stop installing. Check 2.
//
//   * Every EXPECTED_ constant pins bytes that live in another file, and nothing
//     re-derived them after an edit. Checks 5 and 6.
//
// Warnings are failures here. There is no --force.

import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];

function fail(reasonCode, detail) {
  failures.push({ reasonCode, detail });
}

async function text(relativePath) {
  return readFile(resolve(root, relativePath), "utf8");
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function run(command, argv) {
  const result = spawnSync(command, argv, { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (result.error) return { ok: false, output: String(result.error.message) };
  return { ok: result.status === 0, output: `${result.stdout ?? ""}${result.stderr ?? ""}` };
}

// 1. A dirty tree means the bytes that pass the gate are not the bytes that get pushed.
const status = run("git", ["status", "--porcelain=v1", "--untracked-files=all"]);
if (!status.ok) fail("PUSH_GATE_GIT_UNAVAILABLE", status.output.trim().slice(0, 200));
else if (status.output.trim() !== "") fail("PUSH_GATE_TREE_DIRTY", status.output.trim().split("\n").slice(0, 5).join(" | "));

const bootstrapBytes = await readFile(resolve(root, "bootstrap/trusted-bootstrap.mjs"));
const bootstrapDigest = sha256(bootstrapBytes);
const bootstrapText = bootstrapBytes.toString("utf8");

// 2. The out-of-band anchor. This is the only value a user can check independently, so
//    every document that publishes it must publish the current one and no stale one.
const anchorDocuments = ["README.md", "README.zh-CN.md", "README.ja.md", "README.ko.md", "README.fr.md", "SECURITY.md"];
const punctuation = /[\p{P}\p{S}]/u;
const whitespace = /\s/u;
for (const document of anchorDocuments) {
  const body = await text(document);
  const published = [...body.matchAll(/\b([a-f0-9]{64})\b/gu)].map((match) => match[1]);
  if (!published.includes(bootstrapDigest)) fail("PUSH_GATE_ANCHOR_MISSING", document);
  // A superseded anchor beside the current one is worse than a missing one: a reader
  // comparing against the wrong line is told the download was tampered with.
  const foreign = published.filter((digest) => digest !== bootstrapDigest && /trusted-bootstrap|shasum/u.test(body.slice(Math.max(0, body.indexOf(digest) - 400), body.indexOf(digest))));
  if (foreign.length > 0) fail("PUSH_GATE_ANCHOR_STALE", `${document}: ${foreign[0]}`);

  // These six are the only documents this repository publishes, and until now the gate
  // read them for one 64-character digest and nothing else. A closing `**` must be
  // right-flanking: not preceded by whitespace, and -- when preceded by punctuation --
  // followed by whitespace or punctuation. CJK prose trips that constantly, because
  // `**一句话。**下一句` puts an ideographic full stop before the delimiter and a letter
  // after it; the span never closes and the reader gets four asterisks. Six such spans
  // were published here. Latin text rarely trips it, so the English original never
  // showed the fault.
  // Code is not prose. A document explaining this very rule writes `**一句话。**下一句`
  // inside backticks, and a checker that reads through code spans pairs that example's
  // delimiters with the real ones around it and reports a defect in correct text. Found
  // by running this check over the handoff that documents it. Fenced blocks are dropped
  // wholesale and inline spans are blanked in place, so line numbers survive.
  let fenced = false;
  body.split("\n").forEach((line, index) => {
    if (/^\s*(?:```|~~~)/u.test(line)) { fenced = !fenced; return; }
    if (fenced) return;
    const prose = line.replace(/`[^`]*`/gu, (span) => " ".repeat(span.length));
    for (const match of prose.matchAll(/\*\*([^*]+)\*\*/gu)) {
      const closeAt = match.index + match[0].length - 2;
      const before = prose[closeAt - 1];
      const after = prose[closeAt + 2];
      if (before === undefined || whitespace.test(before) || !punctuation.test(before)) continue;
      if (after === undefined || whitespace.test(after) || punctuation.test(after)) continue;
      fail("PUSH_GATE_EMPHASIS_UNCLOSED", `${document}:${index + 1}: ${match[0].slice(0, 40)}`);
    }
  });
}

function pinned(name) {
  const match = new RegExp(`${name} = '([a-f0-9]{64})'`, "u").exec(bootstrapText);
  return match === null ? null : match[1];
}

const identityVersion = /version: '(v[^']+)'/u.exec(bootstrapText)?.[1] ?? null;
if (identityVersion === null) fail("PUSH_GATE_IDENTITY_UNREADABLE", "version");

// 2b. The Skill payload states the pinned identity, and nothing checked that it agreed
//     with the identity actually compiled in. It did not: the trust contract published
//     rc.5's version, commit, tree AND tag object while IDENTITY had moved to rc.6, so the
//     one document whose job is to tell an operator what to compare against was telling
//     them to compare against the wrong release. Four wrong fields, not a stale version
//     string -- a reader following it computes four mismatches and concludes the download
//     was tampered with.
//
//     The rule is deliberately not "no old version may appear under skill/". reason-codes
//     says two families were "new in 0.1.0-rc.5", which is a true statement about when
//     those codes appeared and would become false if rewritten. Banning the string would
//     have forced a correct sentence to be replaced by an incorrect one. So this checks
//     the two places that assert the CURRENT pin, and derives every expected value from
//     IDENTITY rather than from a list that would drift on its own.
const identityField = (name) => new RegExp(`${name}:\\s*'([^']+)'`, "u").exec(bootstrapText)?.[1] ?? null;
const identity = {
  version: identityVersion,
  commit: identityField("commit"),
  tree: identityField("tree"),
  tagObject: identityField("tagObject"),
};

const skillManifest = await text("skill/tcrn-workflow-helper/SKILL.md");
const supports = /Supports TCRN Workflow `([^`]+)`/u.exec(skillManifest)?.[1] ?? null;
if (supports === null) fail("PUSH_GATE_SKILL_SUPPORT_UNSTATED", "SKILL.md does not state the supported release");
else if (supports !== identity.version) fail("PUSH_GATE_SKILL_SUPPORT_STALE", `SKILL.md says ${supports}, IDENTITY says ${String(identity.version)}`);

// 2c. The five READMEs carry a "Status, honestly" line asserting two facts that must both
//     be current: the helper's own version, and the Workflow release it pins. Both are
//     prose the anchor loop never read, and both went stale at candidate.22 -- the re-pin
//     advanced the gated SKILL.md support line to v0.3.1 but left this line reading
//     candidate.21 / v0.1.0, because nothing derived it from a source of truth. A reader
//     who trusts "supporting exactly" is told the wrong release is pinned. Same rule as
//     2b: check the line that asserts the CURRENT facts, derive the expected values (the
//     helper version from package.json, the Workflow pin from IDENTITY), and never ban a
//     version string globally -- reason-codes' true "new in 0.1.0-rc.5" must stay true, so
//     the check is scoped to this one line, located by the helper-version-shaped token it
//     alone carries (so a stale number reads as stale, not as a missing line).
const helperVersion = JSON.parse(await text("package.json")).version ?? null;
if (typeof helperVersion !== "string") fail("PUSH_GATE_HELPER_VERSION_UNREADABLE", "package.json version");
const statusDocuments = ["README.md", "README.zh-CN.md", "README.ja.md", "README.ko.md", "README.fr.md"];
for (const document of statusDocuments) {
  // 1.0.0: this locator used to require a leading 0, which wrote "the helper version is
  // pre-1.0" into the gate as an invariant. It held only until the first release past it,
  // and that release made every status line unfindable -- the check reporting MISSING for
  // a line that was present and merely stale. A gate that cannot survive the release it
  // guards is worse than none. Which value is CORRECT still comes from package.json and
  // IDENTITY; only the locator widened.
  const statusLine = (await text(document)).split("\n").find((line) => /`\d+\.\d+\.\d+[^`]*`/u.test(line) && /`v\d+\.\d+[^`]*`/u.test(line));
  if (statusLine === undefined) { fail("PUSH_GATE_STATUS_LINE_MISSING", document); continue; }
  const statedVersion = /`(\d+\.\d+\.\d+[^`]*)`/u.exec(statusLine)?.[1] ?? null;
  if (typeof helperVersion === "string" && statedVersion !== helperVersion) fail("PUSH_GATE_STATUS_VERSION_STALE", `${document}: says ${String(statedVersion)}, package.json ${String(helperVersion)}`);
  const statedSupport = /`(v\d+\.\d+[^`]*)`/u.exec(statusLine)?.[1] ?? null;
  if (statedSupport !== identity.version) fail("PUSH_GATE_STATUS_SUPPORT_STALE", `${document}: supports ${String(statedSupport)}, IDENTITY ${String(identity.version)}`);
}

const trustContract = await text("skill/tcrn-workflow-helper/references/trust-contract.md");
for (const [field, value] of Object.entries(identity)) {
  if (value === null) fail("PUSH_GATE_IDENTITY_UNREADABLE", field);
  else if (!trustContract.includes(value)) fail("PUSH_GATE_TRUST_CONTRACT_IDENTITY_MISSING", `${field}: ${value}`);
}
// A git object id in the trust contract that is not one of the pinned three is the shape
// the defect actually took: the old commit, tree and tag object sat there looking
// authoritative. Any object id in this document must be one the bootstrap pins.
const pinnedObjectIds = new Set([identity.commit, identity.tree, identity.tagObject].filter((value) => value !== null));
for (const match of trustContract.matchAll(/\b[a-f0-9]{40}\b/gu)) {
  if (!pinnedObjectIds.has(match[0])) fail("PUSH_GATE_TRUST_CONTRACT_FOREIGN_OBJECT_ID", match[0]);
}

// 3. The defect this gate exists for. IDENTITY names the release; the provenance
//    document describes the build of that release. validateProvenance compares them at
//    runtime, so a disagreement is not cosmetic -- it fails every lifecycle test.
const provenance = JSON.parse(await text("manifests/complete-skill-archive.provenance.json"));
const external = provenance.predicate?.buildDefinition?.externalParameters ?? {};
if (identityVersion !== null && external.tag !== identityVersion) {
  fail("PUSH_GATE_PROVENANCE_TAG_MISMATCH", `provenance ${String(external.tag)} != IDENTITY ${identityVersion}`);
}
if (identityVersion !== null && external.version !== identityVersion.replace(/^v/u, "")) {
  fail("PUSH_GATE_PROVENANCE_VERSION_MISMATCH", `provenance ${String(external.version)} != IDENTITY ${identityVersion}`);
}

// 4-6. Every pinned digest re-derived from the bytes it claims to pin.
const provenanceDigest = sha256(await readFile(resolve(root, "manifests/complete-skill-archive.provenance.json")));
if (pinned("EXPECTED_PROVENANCE_SHA256") !== provenanceDigest) {
  fail("PUSH_GATE_PROVENANCE_DIGEST_STALE", `pinned ${String(pinned("EXPECTED_PROVENANCE_SHA256"))} != actual ${provenanceDigest}`);
}
const archiveDigest = sha256(await readFile(resolve(root, "artifacts/skill-archive.json")));
if (pinned("EXPECTED_ARCHIVE_SHA256") !== archiveDigest) {
  fail("PUSH_GATE_ARCHIVE_DIGEST_STALE", `pinned ${String(pinned("EXPECTED_ARCHIVE_SHA256"))} != actual ${archiveDigest}`);
}
const candidate = JSON.parse(await text("artifacts/candidate-manifest.json"));
if (identityVersion !== null && candidate.workflow?.version !== identityVersion) {
  fail("PUSH_GATE_CANDIDATE_IDENTITY_STALE", `manifest ${String(candidate.workflow?.version)} != IDENTITY ${identityVersion}`);
}

// 7-10. The suites. Zero tolerance: a non-zero exit is a failure, and so is a warning.
//
// Order matters. `npm test` rewrites artifacts/ as a side effect, so the tree must be
// judged clean BEFORE the suites run -- check 1 above already did that. Afterwards the
// tree is expected to differ only in artifacts/, and a difference anywhere else means a
// suite mutated tracked source, which is itself disqualifying.
for (const [reasonCode, command, argv] of [
  ["PUSH_GATE_LINT_FAILED", "npm", ["run", "--silent", "lint"]],
  ["PUSH_GATE_TYPECHECK_FAILED", "npm", ["run", "--silent", "typecheck"]],
  ["PUSH_GATE_RELEASE_UNVERIFIED", "npm", ["run", "--silent", "verify"]],
  ["PUSH_GATE_TESTS_FAILED", "npm", ["test", "--silent"]],
]) {
  const result = run(command, argv);
  if (!result.ok) fail(reasonCode, result.output.trim().split("\n").slice(-3).join(" | ").slice(0, 300));
  else if (/\bwarning\b|\bWARN\b/u.test(result.output)) fail(reasonCode, `warning emitted: ${result.output.match(/.*\b(?:warning|WARN)\b.*/u)?.[0]?.slice(0, 200) ?? ""}`);
}

// A suite that rewrote anything outside artifacts/ has changed the bytes being pushed
// after they were judged, which defeats the point of judging them.
const post = run("git", ["status", "--porcelain=v1", "--untracked-files=all"]);
const strayed = post.output.split("\n").map((line) => line.slice(3).trim()).filter((path) => path !== "" && !path.startsWith("artifacts/"));
if (strayed.length > 0) fail("PUSH_GATE_SUITE_MUTATED_SOURCE", strayed.slice(0, 5).join(" | "));
// Restore the test side effects so the caller is left with the tree the gate approved.
if (post.output.trim() !== "") run("git", ["checkout", "--", "artifacts/"]);

if (failures.length > 0) {
  process.stdout.write(`${JSON.stringify({ ok: false, reasonCode: "PUSH_GATE_BLOCKED", failures }, null, 2)}\n`);
  process.exit(1);
}
process.stdout.write(`${JSON.stringify({ ok: true, reasonCode: "PUSH_GATE_VERIFIED", anchor: bootstrapDigest, identity: identityVersion })}\n`);
