# Trusted Bootstrap Contract

`bootstrap/trusted-bootstrap.mjs` is the trust boundary. Its inputs are bounded
regular single-link files containing fatal-UTF-8 canonical JSON: object keys are
recursively sorted, arrays retain their mandated order, and every document ends
in one newline. Strings must be well-formed Unicode; unsafe integers and
non-canonical scalar encodings fail closed.

## Required identity

The accepted Workflow release is repository
`https://github.com/tpmoonchefryan/tcrn-workflow.git`, version `v0.6.0`,
commit `bae1c26bbcfe830d9e273d0cfdc516eda82689b3`, tree
`22db11d53d1ff42061596b8750f5cf2465b325f5`, and tag object
`185e613aa14dec0a14e09ab6182efdfeaca4899f`.

## Out-of-band trust anchor (root of trust)

This Skill's prose (SKILL.md + references) may be distributed into a live host
skills folder by a standard installer. Such a copy is loaded into the agent's
context automatically and therefore has **no authority on its own** — a tampered
or look-alike copy could rewrite these instructions. The root of trust is
anchored out-of-band, through a repository-independent channel, for exactly ONE
thing:

1. **The trusted bootstrap runtime digest** — the SHA-256 of the exact
   `bootstrap/trusted-bootstrap.mjs`, published in this repository's `README.md`
   and `SECURITY.md` and in the GitHub release notes. The skills installer
   copies only the `skill/…` prose, NOT the runtime, so the user must obtain the
   runtime through the repo-independent channel and verify it against that
   published digest before it is trusted. The verified runtime — never the copied
   prose — carries the pinned release identity and the pinned accepted archive
   and provenance digests, and is the sole authority that validates anything.

An earlier candidate of this repository also claimed an Ed25519 signing root.
Its key fingerprint and its bootstrap digest were published nowhere a user could
independently reach, so every check ran against an anchor that shipped inside the
download. That chain has been removed rather than dressed up; the runtime digest
above is the only anchor, and it is now actually published.

A runtime or copy that cannot be anchored against the published digest fails
closed. The authority for guided setup is a **successful,
fail-closed run of `verify-installed-copy` under the anchored runtime** (its
receipt / process exit), not the presence of any instruction text. The
`INSTALLED_COPY_VALIDATED` marker (below) is an unsigned convenience record of
that run at a caller-chosen managed-state-root path; it is not itself
tamper-evident, so an agent must re-run `verify-installed-copy` each session
rather than trust a marker file it did not just produce.

## verify-installed-copy (read-only)

`verify-installed-copy` reconstructs the on-disk Skill directory's canonical
archive, compares its SHA-256 against the archive digest compiled into the
runtime, validates the release provenance against the provenance digest compiled
into the runtime, and — on success — records the verified archive digest in
machine state and writes an `INSTALLED_COPY_VALIDATED` marker. Both the state and
the marker are written only to the managed state root; a state or marker path
resolving inside any `.claude`/`.codex` skill/live directory fails closed
(`LIVE_LOCATION_FORBIDDEN`). It never mutates the Skill directory itself (that
stays read-only).

Stated exactly, a success receipt attests: *the bytes on disk at the installed
directory reconstruct, under this bootstrap's canonicalization rules, to
precisely the archive whose SHA-256 is compiled into this bootstrap.* That is a
byte-identity claim against a runtime the user verified out-of-band. It claims
nothing about a publisher's key, a validity window, a revocation list, or a
downgrade history. Downgrade resistance lives in two places instead: each
bootstrap accepts exactly ONE archive, so an older release fails the digest
comparison; and GitHub immutable releases prevent a published tag or asset from
being moved, deleted, or changed at all.
The helper's own mutating commands (`install`/`update`/`reinstall`/`uninstall`)
remain test-root-only and never write to a live host Skill location.

## Host matrix

This candidate supports two Agent App hosts, Codex and Claude Code, over one
host-neutral protocol surface. The pinned Workflow release ships reversible,
project-local SessionStart activation for both hosts, plus a seven-command
operator surface and the same catalog as structured MCP tools. All remain inert
until separately pinned and authorized. The current exact SessionStart
definitions are code- and fixture-proven; historical host receipts cover
superseded definitions, so no current live activation is claimed. None of those
host surfaces is exercised here: each case family below names where its evidence
actually lives, and nothing in this candidate involves a live `claude` or Codex
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
- release trust: an archive whose digest is not the one pinned into the runtime
  (`IDENTITY_MISMATCH`), missing or tampered provenance (`PROVENANCE_REQUIRED`,
  `PROVENANCE_INVALID`), and malformed persisted state (`STATE_INVALID`);
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

**Bound to the pinned Workflow release's hermetic proofs**: the Workflow
repository at exactly the pinned identity above proves Claude settings-fragment
merge/remove byte-reversibility, user-vs-project precedence, Codex inert install
and exact-definition approval boundaries, persona-free SessionStart definitions,
cross-host hostile-input parity, the pinned operator-authority grant, and the
structured MCP catalog. This candidate ships no settings, hook, operator, or MCP
surface of its own; those behaviors execute only inside the pinned Workflow
release.

**Not claimed by this candidate**: current exact live activation on either host,
approved network clone/update execution (this candidate's `plan-network` emits a
static plan and performs no network mutation), or live-install surfaces for the
helper itself. Its installation and removal commands remain test-root-only on
both hosts.

## Archive and manifest

An archive is a JSON document with `schemaVersion` and entries already sorted
by normalized path. Every entry is a regular relative file with a canonical
base64 payload and SHA-256 digest. Validation rejects traversal, absolute paths,
controls, non-NFC paths, duplicate/case-colliding paths, file/ancestor
collisions, links, special files, digest mismatch, and configured entry/byte
limits before extraction. The accepted archive digest and the accepted
provenance digest are compiled into `bootstrap/trusted-bootstrap.mjs` beside the
pinned release identity. Validation computes the archive digest from the bytes
and compares it to that compiled-in constant; a mismatch is `IDENTITY_MISMATCH`.
The authority is the runtime itself, verified out-of-band against its published
SHA-256 — no document inside or beside the download is trusted to assert what
the correct digest is.

The release provenance
(`manifests/complete-skill-archive.provenance.json`) is a **self-asserted local
build statement**, not a hosted-builder attestation: it declares build type
`tcrn.workflow.local-unpublished-candidate.v1`, builder id
`tcrn-workflow-local`, and zeroed timestamps. It is pinned by digest so it cannot
be swapped, but it is not third-party evidence of how the release was built. The
reproducible-build chain (`npm run ci:replay`) is what lets a third party check
the build, by rebuilding the artifacts from a clean checkout and asserting digest
equality with the committed ones.

## Stable reason codes

`APPROVAL_REQUIRED`, `ARCHIVE_DIGEST_MISMATCH`, `ARCHIVE_ENTRY_INVALID`,
`ARCHIVE_LIMIT_EXCEEDED`, `ARCHIVE_PATH_INVALID`, `IDENTITY_MISMATCH`,
`INPUT_REPLACED`, `INPUT_TOO_LARGE`, `INVOCATION_INVALID`,
`LIVE_LOCATION_FORBIDDEN`, `PROVENANCE_INVALID`, `PROVENANCE_REQUIRED`,
`ROOT_AMBIGUOUS`, `ROOT_DIRTY`, `ROOT_IDENTITY_MISMATCH`, `ROOT_MISSING`,
`ROOT_REPLACED`, `ROOT_SYMLINK`, `STATE_INVALID`, `STATE_PATH_INVALID`,
`STATE_REPLACED`, `TEST_ROOT_REQUIRED`, `TIME_INVALID`,
`TRANSACTION_CONFLICT`, `TRANSACTION_INTERRUPTED`, and `WORKSPACE_INVALID`
are fail-closed.

## Receipts

Success emits canonical JSON with `reasonCode` and no absolute path.
`TRUST_VALIDATED`, `ROOT_RESOLVED`, `INSTALLED_COPY_VALIDATED`,
`INSTALL_COMPLETED`, and `UNINSTALL_COMPLETED` additionally carry immutable
input or state digests. `INSTALLED_COPY_VALIDATED` also names the reconstructed
archive digest and the pinned release version; the receipt itself is the
authority, and (when a marker path is given) an unsigned copy is also recorded at
that managed-state-root path as a convenience.
`NETWORK_PLAN_APPROVED` carries only the validated static plan
(`operation` limited to `clone` or `update`,
`networkMutationPerformed: false`); it binds no inputs because it performs no
operation. Persist mutable machine state and private Workspace outside
the Skill directory. Installation and removal are test-root-only in this
candidate; validation and root resolution are read-only.
