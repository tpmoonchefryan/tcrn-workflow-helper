# Trusted Bootstrap Contract

`bootstrap/trusted-bootstrap.mjs` is the trust boundary. Its inputs are bounded
regular single-link files containing fatal-UTF-8 canonical JSON: object keys are
recursively sorted, arrays retain their mandated order, and every document ends
in one newline. Strings must be well-formed Unicode; unsafe integers and
non-canonical scalar encodings fail closed.

## Required identity

The accepted Workflow release is repository
`https://github.com/tpmoonchefryan/tcrn-workflow.git`, version `v0.1.0-rc.4`,
commit `e70b8eb6f9a85374c51fc6846172313734ec82e3`, tree
`ba334160ff88d461534c735d20e300ed1f8afd83`, and tag object
`86207d61bec98b451513eaf9bd391fb98d474179`.

## Host matrix

This candidate supports two Agent App hosts, Codex and Claude Code, over one
host-neutral protocol surface. Both hosts remain inert dry-run candidates; no
live host support is asserted. Each case family below names where its evidence
actually lives; nothing in this candidate involves a live `claude` or Codex
App binary.

**Proven by this candidate's own test suite** (`npm test`, offline by
construction: neither the bootstrap nor the suite opens an internet socket —
the only `node:net` use is a local unix-domain-socket file fixture for
special-file rejection):

- archive safety: traversal, absolute paths, control characters, non-NFC
  paths, duplicate and case-colliding paths, links, special files, entry and
  byte limits (`ARCHIVE_PATH_INVALID`, `ARCHIVE_ENTRY_INVALID`,
  `ARCHIVE_LIMIT_EXCEEDED`), and per-entry digest tamper
  (`ARCHIVE_DIGEST_MISMATCH`);
- release trust: identity mismatch, signature and key substitution, policy
  transplant/replay, epoch rollback, revocation, and expiry
  (`IDENTITY_MISMATCH`, `MANIFEST_INVALID`, `POLICY_INVALID`,
  `POLICY_REVOKED`, `POLICY_EXPIRED`, `ROLLBACK_REJECTED`);
- root resolution: wrong remote, forged checkout, dirty production checkout,
  symlinked root, ambiguity (`ROOT_IDENTITY_MISMATCH`, `ROOT_DIRTY`,
  `ROOT_SYMLINK`, `ROOT_AMBIGUOUS`);
- lifecycle and transaction safety: install, update, reinstall, uninstall,
  crash/SIGKILL injection at every effective point, lock contention,
  replacement preservation, byte-identical private Workspace state, zero
  residue — exercised once against the shared host-neutral mutation surface,
  which is the only mutation surface either host uses;
- the live-location guard, per host shape: user-level `~/.claude/**`, project
  `.claude/skills`, `~/.codex/**`, and case-variant components (e.g. `.Claude`)
  are rejected with `LIVE_LOCATION_FORBIDDEN` by a case-folded lexical check on
  the resolved path components, before the test-root marker gate or any
  filesystem probe, so install, update, reinstall, and uninstall cannot touch a
  live host Skill location. The lifecycle tests additionally assert the
  disposable test root is the only write surface and that failed operations
  leave no residue.

**Bound to the pinned Workflow release's hermetic proofs** (the three
Claude-Code-new families are implemented and proven in the Workflow repository
at exactly the pinned rc.4 identity above, by its `verify:p6b` suite —
fragment reversibility, forbidden-path, fallback, and cross-host parity
cases): `.claude/settings.json` hook-fragment merge/remove byte-reversibility;
user-vs-project precedence with user-level `~/.claude` never written; and
directory trust-window fallback to CLAUDE.md-only. This candidate ships no
settings or hook surface of its own; those behaviors execute only inside the
pinned Workflow release.

**Not yet proven — planned P9-B live-validation families** (listed for
completeness; no proof is claimed and no live support is asserted until the
release board accepts them): approved network clone/update execution (this
candidate's `plan-network` emits a static plan and performs no network
mutation), bare-session fallback on either host, and per-host live-install
surfaces (installation and removal remain test-root-only in this candidate on
both hosts).

## Archive and manifest

An archive is a JSON document with `schemaVersion` and entries already sorted
by normalized path. Every entry is a regular relative file with a canonical
base64 payload and SHA-256 digest. Validation rejects traversal, absolute paths,
controls, non-NFC paths, duplicate/case-colliding paths, file/ancestor
collisions, links, special files, digest mismatch, and configured entry/byte
limits before extraction. The release manifest binds the archive digest, exact identity,
issuer, signer, provenance digest, policy epoch, expiry, and a real Ed25519
signature. The verifier requires a public key supplied independently of the
manifest and checks its SHA-256 fingerprint against policy; production private
keys never belong in this repository. The complete policy is separately signed
by that trusted key and binds the exact manifest and archive digests; reject a
policy transplant or replay before reading its expiry, revocation, epoch,
issuer, signer, or provenance fields.

## Stable reason codes

`APPROVAL_REQUIRED`, `ARCHIVE_DIGEST_MISMATCH`, `ARCHIVE_ENTRY_INVALID`,
`ARCHIVE_LIMIT_EXCEEDED`, `ARCHIVE_PATH_INVALID`, `IDENTITY_MISMATCH`,
`INPUT_REPLACED`, `INPUT_TOO_LARGE`, `LIVE_LOCATION_FORBIDDEN`,
`MANIFEST_INVALID`, `POLICY_EXPIRED`, `POLICY_INVALID`, `POLICY_REVOKED`,
`PROVENANCE_INVALID`, `PROVENANCE_REQUIRED`, `ROLLBACK_REJECTED`,
`ROOT_AMBIGUOUS`, `ROOT_DIRTY`, `ROOT_IDENTITY_MISMATCH`, `ROOT_MISSING`,
`ROOT_REPLACED`, `ROOT_SYMLINK`, `STATE_PATH_INVALID`, `STATE_REPLACED`,
`TEST_ROOT_REQUIRED`, `TIME_INVALID`, `TRANSACTION_CONFLICT`,
`TRANSACTION_INTERRUPTED`, `TRUST_BASIS_REQUIRED`, and `WORKSPACE_INVALID`
are fail-closed.

## Receipts

Success emits canonical JSON with `reasonCode` and no absolute path.
`TRUST_VALIDATED`, `ROOT_RESOLVED`, `INSTALL_COMPLETED`, and
`UNINSTALL_COMPLETED` additionally carry immutable input or state digests.
`NETWORK_PLAN_APPROVED` carries only the validated static plan
(`operation` limited to `clone` or `update`,
`networkMutationPerformed: false`); it binds no inputs because it performs no
operation. Persist mutable anti-rollback state and private Workspace outside
the Skill directory. Installation and removal are test-root-only in this
candidate; validation and root resolution are read-only.
