# Reason codes — plain-language guide

When the trusted bootstrap stops, it prints one **stable reason code**. Every
stop is the system working correctly, not a broken product. The agent must
translate the code for the user using this table and **never weaken a check to
get past a stop**. "Security stop = yes" means: do not retry, do not work around
it — the thing being installed is not trustworthy as-is.

Format: `CODE` — what happened / security stop? / what to do.

## Trust and identity

- `TRUST_BASIS_REQUIRED` — the independently supplied trusted key is missing or
  wrong. / yes / obtain the correct trusted key through the documented
  out-of-band channel and retry.
- `IDENTITY_MISMATCH` — the signed release names a different repository, version,
  commit, tree, or tag than the one this Skill trusts. / yes / you have the wrong
  or a substituted release; get the exact pinned release.
- `MANIFEST_INVALID` — the release manifest is malformed, unsigned, or its
  signature does not verify. / yes / re-download the release; do not proceed.
- `POLICY_INVALID` — the signed policy is malformed, its signature fails, or it
  does not bind this exact archive/manifest (this also fires when installed bytes
  were tampered so the archive digest no longer matches). / yes / re-download; a
  mismatch here often means the copy was altered.
- `POLICY_EXPIRED` — the release policy's validity window has passed. / yes / use
  a current release.
- `POLICY_REVOKED` — this release version was revoked. / yes / do not use it;
  upgrade to a supported release.
- `ROLLBACK_REJECTED` — someone is trying to install an OLDER release than one
  this machine already accepted (anti-downgrade). / yes / this is a downgrade
  attempt; keep the newer release.
- `PROVENANCE_REQUIRED` / `PROVENANCE_INVALID` — the build provenance is missing
  or does not match. / yes / re-download the full signed release set.

## Archive safety

- `ARCHIVE_DIGEST_MISMATCH` — a file inside the archive does not match its
  recorded hash. / yes / the archive was altered; re-download.
- `ARCHIVE_ENTRY_INVALID` — an archive entry is not a plain file (a link or
  special file), or is malformed. / yes / re-download.
- `ARCHIVE_PATH_INVALID` — an archive path is unsafe (traversal, absolute,
  control chars, duplicate/case-colliding). / yes / re-download.
- `ARCHIVE_LIMIT_EXCEEDED` — the archive exceeds the entry or byte limit. / yes /
  re-download; do not raise the limit.

## Install root and location

- `TEST_ROOT_REQUIRED` — a helper install/uninstall was aimed at a non-test root.
  Helper-managed installs are test-root-only. / no (guardrail) / the agent must
  use a `tcrn-helper-test-*` root, or, for the live Skill copy, use
  `verify-installed-copy` (read-only) instead of `install`.
- `LIVE_LOCATION_FORBIDDEN` — a helper mutating command was pointed at a live
  host Skill location (`.claude`/`.codex`). / no (guardrail) / distribution into a
  skills folder is done by the standard installer; the helper only verifies it
  read-only. Do not force it.
- `ROOT_MISSING` / `ROOT_AMBIGUOUS` — no single clear Workflow checkout was
  resolved. / no / point at exactly one clean checkout.
- `ROOT_SYMLINK` / `ROOT_REPLACED` — the target directory is a symlink or was
  swapped. / yes / use a real, stable directory.
- `ROOT_DIRTY` — the Workflow checkout has uncommitted changes. / no / use a
  clean checkout.
- `ROOT_IDENTITY_MISMATCH` — the checkout's remote/identity is not the pinned
  Workflow. / yes / clone the correct pinned release.

## Inputs, state, transactions

- `INPUT_REPLACED` / `INPUT_TOO_LARGE` — an input file was swapped mid-read or is
  too large. / yes / retry from clean inputs.
- `STATE_PATH_INVALID` / `STATE_REPLACED` — the anti-rollback state file path is
  invalid or was swapped. / yes / use the managed state root.
- `WORKSPACE_INVALID` — the private Workspace failed its integrity check. / yes /
  do not proceed; report it.
- `TRANSACTION_CONFLICT` / `TRANSACTION_INTERRUPTED` — a concurrent or interrupted
  transaction. / no / wait and retry once; the engine recovers to a clean state.
- `APPROVAL_REQUIRED` — a network or mutating step ran without explicit approval.
  / no / ask the user to approve, then retry.
- `TIME_INVALID` — a bad timestamp was supplied. / no / retry with a proper time.

## New in this candidate (guided-install surfaces)

- `INSTALLED_COPY_VALIDATED` — success receipt: the on-disk Skill copy matches the
  signed release; the anti-rollback floor is advanced and the marker written into
  the managed state root. / (not a stop) / proceed. A later re-install of an older
  release will now be caught as `ROLLBACK_REJECTED`.
- (Any `verify-installed-copy` failure reuses the trust codes above — e.g.
  `POLICY_INVALID` when the copy was altered, `ROLLBACK_REJECTED` on downgrade.)
