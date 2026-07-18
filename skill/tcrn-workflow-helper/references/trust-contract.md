# Trusted Bootstrap Contract

`bootstrap/trusted-bootstrap.mjs` is the trust boundary. Its inputs are bounded
regular single-link files containing fatal-UTF-8 canonical JSON: object keys are
recursively sorted, arrays retain their mandated order, and every document ends
in one newline. Strings must be well-formed Unicode; unsafe integers and
non-canonical scalar encodings fail closed.

## Required identity

The accepted Workflow release is repository
`https://github.com/tpmoonchefryan/tcrn-workflow.git`, version `v0.1.0-rc.5`,
commit `e9629dd4510ea428851eadc01a2fb7e8dcae6d5d`, tree
`6272dda6ac2164429afad391c07e70ae47c4e3cc`, and tag object
`08bcc0527dd0090b6b36328b05b0a48cd89beccc`.

## Out-of-band trust anchor (root of trust)

This Skill's prose (SKILL.md + references) may be distributed into a live host
skills folder by a standard installer. Such a copy is loaded into the agent's
context automatically and therefore has **no authority on its own** — a tampered
or look-alike copy could rewrite these instructions. The root of trust is
anchored out-of-band, through a repository-independent channel, for TWO things:

1. **The trusted public-key fingerprint** — SHA-256
   `a320188bfc64797931de408f6064e0830d431fb4ebf73322f73219cc91a2ed90` (the
   Ed25519 key that signs the release manifest and policy).
2. **The trusted bootstrap runtime digest** — the SHA-256 of the exact
   `bootstrap/trusted-bootstrap.mjs`. The skills installer copies only the
   `skill/…` prose, NOT the runtime, so the user must obtain the runtime through
   the repo-independent channel and verify it against this digest before it is
   trusted. The verified runtime — never the copied prose — carries the pinned
   key and identity and is the sole authority that validates anything.

A runtime or copy that cannot be anchored against the published fingerprint/
digest fails closed. The authority for guided setup is a **successful,
fail-closed run of `verify-installed-copy` under the anchored runtime** (its
receipt / process exit), not the presence of any instruction text. The
`INSTALLED_COPY_VALIDATED` marker (below) is an unsigned convenience record of
that run at a caller-chosen managed-state-root path; it is not itself
tamper-evident, so an agent must re-run `verify-installed-copy` each session
rather than trust a marker file it did not just produce.

## verify-installed-copy (read-only)

`verify-installed-copy` reconstructs the on-disk Skill directory's canonical
archive, authenticates it against the signed manifest + policy (identity,
archive digest, provenance, and the persisted anti-rollback floor), and — on
success — **advances the persisted monotonic anti-rollback floor** and writes an
`INSTALLED_COPY_VALIDATED` marker. Both the state (floor) and the marker are
written only to the managed state root; a state or marker path resolving inside
any `.claude`/`.codex` skill/live directory fails closed
(`LIVE_LOCATION_FORBIDDEN`). It never mutates the Skill directory itself (that
stays read-only). Because it advances the floor, a later standard-installer
re-run with an OLDER release fails closed (`ROLLBACK_REJECTED`) on the next
verify — this is what makes the guided read-only install path downgrade-safe. It
is how a standard-installer-placed copy in `~/.claude/skills` is proven and
kept anti-rollback-protected.
The helper's own mutating commands (`install`/`update`/`reinstall`/`uninstall`)
remain test-root-only and never write to a live host Skill location.

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
at exactly the pinned rc.5 identity above, by its `verify:p6b` suite —
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
`TRUST_VALIDATED`, `ROOT_RESOLVED`, `INSTALLED_COPY_VALIDATED`,
`INSTALL_COMPLETED`, and `UNINSTALL_COMPLETED` additionally carry immutable
input or state digests. `INSTALLED_COPY_VALIDATED` also names the reconstructed
archive digest, policy epoch, and release version; the receipt itself is the
authority, and (when a marker path is given) an unsigned copy is also recorded at
that managed-state-root path as a convenience.
`NETWORK_PLAN_APPROVED` carries only the validated static plan
(`operation` limited to `clone` or `update`,
`networkMutationPerformed: false`); it binds no inputs because it performs no
operation. Persist mutable anti-rollback state and private Workspace outside
the Skill directory. Installation and removal are test-root-only in this
candidate; validation and root resolution are read-only.
