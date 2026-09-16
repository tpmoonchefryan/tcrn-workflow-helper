# Trusted Bootstrap Contract

**Where the runtime lives now.** This repository ships the Skill payload only.
`bootstrap/trusted-bootstrap.mjs`, the release artifacts, the provenance
manifest and the build chain that produced them are no longer distributed from
here; obtain the runtime from the pinned Workflow release through the
out-of-band channel described below. Every path this document names under
`bootstrap/`, `artifacts/` or `manifests/` describes that release, not a file
you will find beside this page.

`bootstrap/trusted-bootstrap.mjs` is the trust boundary. Its inputs are bounded
regular single-link files containing fatal-UTF-8 canonical JSON: object keys are
recursively sorted, arrays retain their mandated order, and every document ends
in one newline. Strings must be well-formed Unicode; unsafe integers and
non-canonical scalar encodings fail closed.

## Candidate identity (unpublished)

The current provisional candidate targets repository
`https://github.com/tpmoonchefryan/tcrn-workflow.git`, version `v1.1.0`,
commit `3d94469d9170d7bf0fdf7a64020b33cad28e22b0`, tree
`c11191b469e1e5ff7b7df879403241cd2b26ad76`, and the planned annotated-tag
object `a7f6c737434db7595e25d7937d3852a828301eaf` for the exact recipe below.
This is the clean E3 source commit for the bounded INC320 receipt-JSON totality
rework; the source version remains `v1.1.0`. The annotated tag is not created and the
candidate is not published. The companion Helper repository remains version
`v1.0.2`; its final commit, tree,
tag recipe, archive, and all asset digests are fixed in the dual-version
release manifest, not inferred from this prose. Remote tag inspection
identifies `v1.0.1` as the last published release for both repositories.

The planned engine tag-object recipe is independently reproducible with Git's
SHA-1 annotated-tag object framing (`tag <UTF-8 byte length>\0<recipe>`). It is
metadata only; do not create or move this tag in the implementation Pack.

```text
object 3d94469d9170d7bf0fdf7a64020b33cad28e22b0
type commit
tag v1.1.0
tagger tpmoonchefryan <253097889+tpmoonchefryan@users.noreply.github.com> 1789228800 +0800

TCRN Workflow v1.1.0
```

These values are candidate metadata, not a trust anchor. After publication, the
bootstrap runtime must pin the same engine identity and its SHA-256 must be
published through an independent channel. Until then, a local bootstrap or this
prose cannot make the candidate trusted. When an identity in this paragraph,
the generated manifest, or the bootstrap disagrees, do not silently repair a
mismatch; stop and compare the final manifest with the bootstrap.

## Out-of-band trust anchor (root of trust)

This Skill's prose (SKILL.md + references) may be distributed into a live host
skills folder by a standard installer. Such a copy is loaded into the agent's
context automatically and therefore has **no authority on its own** — a tampered
or look-alike copy could rewrite these instructions. The root of trust is
anchored out-of-band, through a repository-independent channel, for exactly ONE
thing:

1. **The trusted bootstrap runtime digest** — the SHA-256 of the exact
   `bootstrap/trusted-bootstrap.mjs`, to be published in the GitHub release
   notes for the approved release. The skills installer
   copies only the `skill/…` prose, NOT the runtime, so the user must obtain the
   runtime through the repo-independent channel and verify it against that
   published digest before it is trusted. The verified runtime — never the copied
   prose — carries the pinned release identity and the pinned accepted archive
   and provenance digests, and is the sole authority that validates anything.

An earlier candidate of this repository also claimed an Ed25519 signing root.
Its key fingerprint and its bootstrap digest were published nowhere a user could
independently reach, so every check ran against an anchor that shipped inside the
download. That chain has been removed rather than dressed up; the runtime digest
will be the only anchor once the approved release publishes it. The current
candidate has no external bootstrap digest and therefore cannot pass the trust
gate for a live placement.

A runtime or copy that cannot be anchored against a published digest fails
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
host-neutral projection surface. The current Workflow release exposes
`scripts/host-render.mjs` for host-owned model/effort and harness-hook files;
there is no current `adapter-*` CLI family and no live activation claim. The
structured MCP tool catalog earlier candidates pinned is retired. Historical
host receipts and profile/model-plan records remain replay data only. None of
those host surfaces is exercised here: each case family below names where its
evidence actually lives, and nothing in this candidate involves a live `claude`
or Codex App binary.

**Proven by the Helper-local archive check**
(`node skill/tcrn-workflow-helper/scripts/create-skill-archive.mjs --check`): the
helper package has no `scripts` entry and therefore has no `npm test` command;
`npm test` must not be presented as a Helper-produced proof. The archive check
is deterministic and covers the Helper payload's sorted paths, per-file SHA-256
digests, regular-file/symlink shape, and required `SKILL.md` entry. It does not
claim Workflow runtime, host activation, or publication trust.

**Proven by the Workflow candidate's own offline test surface** (the Workflow
checkout's declared `pnpm test`/`pnpm verify:p1` commands; the Helper package is
not the test runner):

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

**Bound to the Workflow candidate source**: the Workflow repository at exactly
the candidate identity above proves the current `host-render` projection,
user-owned hook preservation, the CLI catalog, and the operator-authority grant
through its own tests. Historical MCP, adapter, persona, and model-plan surfaces
are not current operator paths. This Helper candidate ships no live host
configuration; projection writes execute only through the Workflow script after
a user has approved the target and plan. These are candidate-local proofs, not
published trust and not evidence that a host has approved or triggered them.

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

The candidate provenance (`complete-skill-archive.provenance.json`) is a
**self-asserted local build statement**, not a hosted-builder attestation: it
declares build type `tcrn.workflow.local-unpublished-candidate.v1`, builder id
`tcrn-workflow-local`, and zeroed timestamps. It is pinned by digest in the
candidate bootstrap so it cannot be swapped, but it is not third-party evidence
of how the candidate was built. After publication, the reproducible-build
materials let a third party rebuild from the approved clean checkouts and assert
digest equality; until then, these files are local candidate evidence only.

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
