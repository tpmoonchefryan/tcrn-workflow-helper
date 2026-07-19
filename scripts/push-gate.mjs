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
