// SPDX-License-Identifier: Apache-2.0

// The Skill's trust contract restates the pinned release identity in prose, and
// prose that restates a machine value drifts from it. It already did: a candidate
// shipped three ids in trust-contract.md naming a commit the release had moved
// past, while bootstrap/trusted-bootstrap.mjs and artifacts/candidate-manifest.json
// both carried the right ones — the disagreement sat inside one candidate and
// nothing looked at it.
//
// scripts/verify-release.mjs already binds the candidate manifest to IDENTITY this
// way, and RELEASING.md says to derive that block from the bootstrap rather than
// retype it, "so the two cannot drift". This is the same rule for the third copy.
// The bootstrap is the authority here; the prose is what is checked against it.

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { IDENTITY } from "../bootstrap/trusted-bootstrap.mjs";

const contractPath = fileURLToPath(new URL("../skill/tcrn-workflow-helper/references/trust-contract.md", import.meta.url));

test("the trust contract's prose identity matches the bootstrap it restates", async () => {
  const prose = await readFile(contractPath, "utf8");
  const field = (label, pattern) => {
    const match = prose.match(pattern);
    assert.ok(match, `trust-contract.md states no ${label}`);
    return match[1];
  };

  assert.equal(field("repository", /repository\s*\n?`([^`]+)`/u), IDENTITY.repository);
  assert.equal(field("version", /version `([^`]+)`/u), IDENTITY.version);
  assert.equal(field("commit", /commit `([0-9a-f]{40})`/u), IDENTITY.commit);
  assert.equal(field("tree", /tree\s*\n?`([0-9a-f]{40})`/u), IDENTITY.tree);
  assert.equal(field("tag object", /tag object\s*\n?`([0-9a-f]{40})`/u), IDENTITY.tagObject);

  // A superseded id left elsewhere in the document is the same defect wearing a
  // different sentence, so no 40-hex string in this file may be a stale identity.
  const identityDigests = new Set([IDENTITY.commit, IDENTITY.tree, IDENTITY.tagObject]);
  const looksLikeGitObject = [...prose.matchAll(/`([0-9a-f]{40})`/gu)].map((match) => match[1]);
  for (const digest of looksLikeGitObject) {
    assert.ok(identityDigests.has(digest), `trust-contract.md names a git object that is not the pinned identity: ${digest}`);
  }
});
