# Reason codes — plain-language guide

When the trusted bootstrap stops, it prints one **stable reason code**. Every
stop is the system working correctly, not a broken product. The agent must
translate the code for the user using this table and **never weaken a check to
get past a stop**. "Security stop = yes" means: do not retry, do not work around
it — the thing being installed is not trustworthy as-is.

Format: `CODE` — what happened / security stop? / what to do.

## Trust and identity

- `IDENTITY_MISMATCH` — the archive's SHA-256 is not the digest pinned into this
  trusted bootstrap. The bootstrap accepts exactly one archive, so this fires for
  a substituted archive, a tampered archive, and an older or newer release
  alike. / yes / you do not have the release this bootstrap accepts; obtain the
  exact pinned archive, or obtain (and independently verify) the bootstrap
  published for the release you want.
- `PROVENANCE_REQUIRED` / `PROVENANCE_INVALID` — the build provenance is missing,
  or does not match the provenance digest pinned into this bootstrap. / yes /
  re-download the full release set.
- `STATE_INVALID` — the persisted machine state file is malformed or does not
  match its schema. / yes / do not proceed; inspect the managed state root, and
  remove the corrupt state file only after confirming it was not tampered with.

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
- `STATE_PATH_INVALID` / `STATE_REPLACED` — the machine state file path is
  invalid or was swapped. / yes / use the managed state root.
- `WORKSPACE_INVALID` — the private Workspace failed its integrity check. / yes /
  do not proceed; report it.
- `TRANSACTION_CONFLICT` / `TRANSACTION_INTERRUPTED` — a concurrent or interrupted
  transaction. / no / wait and retry once; the engine recovers to a clean state.
- `APPROVAL_REQUIRED` — a network or mutating step ran without explicit approval.
  / no / ask the user to approve, then retry.
- `TIME_INVALID` — a bad timestamp was supplied. / no / retry with a proper time.
  This is the **bootstrap's** name for it; the installed engine answers
  `TIMESTAMP_INVALID` for the same fault, and every `--at` reaches it.
- `INVOCATION_INVALID` — the command line itself is wrong: an unknown flag, a
  missing required flag, a repeated flag, or an unknown command. / no / fix the
  invocation and retry. This is an argument fault, never a trust finding. Again a
  **bootstrap** name: the engine splits the same territory into `CLI_*` codes,
  below. Branching on the wrong namespace means waiting for a code that never
  arrives.

## New in this candidate (guided-install surfaces)

- `INSTALLED_COPY_VALIDATED` — success receipt: the bytes on disk reconstruct to
  precisely the archive whose SHA-256 is compiled into this bootstrap. The
  verified digest is recorded in machine state and the marker written into the
  managed state root. / (not a stop) / proceed. The marker is an unsigned
  convenience record and is not tamper-evident, so re-run `verify-installed-copy`
  each session rather than trusting a marker you did not just produce.
- (Any `verify-installed-copy` failure reuses the codes above — e.g.
  `IDENTITY_MISMATCH` when the copy was altered or is a different release.)

## Governed workspace surface (product codes, new in `0.1.0-rc.5`)

These are emitted by the installed **TCRN Workflow** engine, not by
the helper bootstrap, but the agent will surface them to the operator. Each is a
fail-closed governance stop; none is a defect.

- `WORKSPACE_GATE_PENDING` — a non-tombstoned gate that is **not yet
  `satisfied`** — `pending` or `blocked` alike — is anchored to a work item and
  blocks its transition to `done`. / no (governance guardrail) / satisfy the gate
  with recorded conference minutes before moving the item; do not route around
  it. Moving the gate to `blocked` does **not** release the item: that was a
  bypass, and `v0.13.0` closed it. The documented deadlock escape is still the
  tombstone (`gate-delete`), never `blocked`. (Only `done` is gated —
  `cancelled`/`blocked`/`ready`/`active` transitions are never blocked.)
- `WORKSPACE_GATE_EVIDENCE_UNRESOLVED` — a gate was moved toward `satisfied` but
  its `conference-minutes:<suffix>` evidence locator does not resolve to a real,
  non-tombstoned minutes record (or the minutes do not link the gate's work
  item). / no / record and close the referenced conference minutes first, then
  retry the satisfaction.
- `WORKSPACE_CONFERENCE_NOT_OPEN` — a conference mutation
  (`conference-append-position` / `conference-close` / `conference-cancel`) was
  aimed at a conference that is not in the `open` state. / no / open a conference
  first, or target one that is still open.
- `WORKSPACE_ACTOR_REQUIRED` — a mutating workspace verb ran without the required
  actor attribution. / no / supply the acting-actor identity and retry; the
  event log must attribute every mutation.
- `WORKSPACE_ACTOR_INVALID` — the supplied actor identity is malformed or its
  format is rejected. / no / supply a well-formed actor identity and retry.

## Snapshot backup / restore (product codes, new in `0.1.0-rc.5`)

Emitted by the installed Workflow's snapshot verbs (`snapshot-manifest` /
`snapshot-verify`). See `references/backup-elicitation.md` for the runbook.

- `SNAPSHOT_VERIFIED` — success receipt: the copy (or restored tree) is
  byte-identical to the snapshotted control tree. / (not a stop) / the backup is
  provable; keep it. Any other snapshot result means do not keep/trust the copy.
- `SNAPSHOT_MISMATCH` — the copy differs from the manifest at the named path — a
  corrupt or truncated copy. / yes / discard the copy and re-copy from a verified
  source; never restore from it.
- `SNAPSHOT_RESIDUE_PRESENT` — the tree carries crashed-session quarantine
  residue (`stale-lease-*`, `released-*`, `attempt-owned-*`); snapshotting over it
  would bake partial state into the receipt. / no / remove the named quarantine
  directory by hand, then re-run the snapshot from the settle/validate step.
- `SNAPSHOT_MANIFEST_INVALID` — the snapshot manifest/receipt is malformed or
  fails its schema check. / yes / re-take the manifest with `snapshot-manifest`;
  do not restore from a bad receipt.
- `SNAPSHOT_PATH_INVALID` — a snapshot root or destination path is unsafe or
  malformed. / yes / use a real, safe destination **outside** the workspace
  control tree.
- `SNAPSHOT_INPUT_INVALID` — a snapshot command input (flags/arguments) is
  invalid. / no / correct the invocation and retry.

## Governed relocation (product codes, new in Workflow `v0.9.0`)

Emitted by the installed Workflow's relocation verbs, and by any verb reached at
an address a relocation has retired. Not exhaustive — the family carries far more
refusals than an operator meets, and the engine's own message names the flag or
path at fault. See `references/workflow-operations.md` for the one-way properties
and the pinned release's `docs/adr/0003-workspace-relocation.md` for what the
mechanism does not do.

- `WORKSPACE_RELOCATION_VACATED` — the address was vacated by a governed
  relocation and is no longer a live workspace. / no / this is the mechanism
  working: the workspace now lives at the destination the ledger names. Do not
  restore the old `workspace.json` to revive it — that manufactures a second live
  authority for one chain and the engine cannot detect it.
- `WORKSPACE_RELOCATION_ADOPTION_REQUIRED` — this tree is a relocated copy that
  has not been adopted yet. / no / run `relocation-adopt` here with the hop's
  manifest text and an adopt-stage authority. Between the vacate and the adopt
  **zero** addresses are live, by design — this refusal is that gap, not a fault.
- `WORKSPACE_RELOCATION_UNSETTLED` — the control tree carries atomic-write residue
  (`.tmp-*`) and is not in a settled state to move. / no / run `recover`, then
  `validate`, then relocate. It is checked at the vacate precisely because that is
  where `recover` can still fix it.
- `WORKSPACE_RELOCATION_CONTROL_TREE_INCOMPLETE` — the copy is missing a directory
  the control tree requires. / yes / a copy tool dropped an empty directory. Re-copy
  with a tool that preserves them; do not create the directory by hand.
- `WORKSPACE_RELOCATION_TRANSPORT_RESIDUE` — the copy carried a lock or claim file
  across. / yes / remove the named file from the copy and re-verify. The snapshot
  manifest excludes these by design and therefore cannot see them, so
  `SNAPSHOT_VERIFIED` on the copy is not evidence against this refusal.
- `WORKSPACE_RELOCATION_LEDGER_FULL` — the workspace has used its relocation
  budget. / no / there is no compaction verb and no way to raise the cap; each
  attempt spends entries whether or not bytes moved. `relocation-plan` reports the
  remaining budget before the ceremony, which is the moment to read it out loud.
- `WORKSPACE_SCHEMA_INVALID` (on a relocated workspace) — an engine older than the
  release that introduced the relocation ledger is refusing a workspace that
  carries one. / yes / not corruption and not repairable by editing: that engine
  cannot read this workspace at all. Use the pinned release. This is why a first
  relocation version-locks a partition **even when the hop was aborted and moved no
  byte** — the ledger is append-only, so cancelling a move still writes to it.

## The engine's command line (`CLI_*`)

The bootstrap's `INVOCATION_INVALID` above and these are different namespaces for
overlapping ground. An operator driving the engine sees these; branching on the
bootstrap's name while the engine answers one of these means waiting for a code
that never arrives.

- `CLI_COMMAND_UNKNOWN` / `CLI_COMMAND_REQUIRED` — the verb does not exist, or no
  verb was given. / no / read `commands` and use a name it lists. A verb absent
  from the catalog of the copy you are invoking is absent, whatever some document
  says; this is also the code a capability preflight actually gets back.
- `CLI_ARGUMENT_UNKNOWN` / `CLI_ARGUMENT_MISSING` / `CLI_ARGUMENT_DUPLICATE` — an
  unrecognised flag, a required flag omitted, or one flag given twice. / no / fix
  the invocation. Note the empty-list trap: a list flag needs the `-` sentinel to
  mean "none"; an empty string reads as a missing argument, not an empty list.
- `CLI_ARGUMENT_MALFORMED` — the flag exists but its value is not admissible: a
  non-integer `--expected-version`, a `--kind` outside the create path's open set,
  or an outcome class the write path no longer mints (`gate-create` takes
  `role_decision` or `owner_intent_required`; `conference-close` declines
  `blocked`). / no / read the value set from the source, not from prose. A value
  the CLI does not recognise at all travels through to the engine instead, which
  answers with its own schema code — so an unfamiliar spelling and a retired-but
  -legal one fail differently, on purpose.

## Every mutation can stop here (workspace surface)

- `WORKSPACE_CAS_MISMATCH` — someone else wrote between your read and your write.
  / no / **retriable only after re-planning**: re-read, re-derive, re-issue. Do
  not resend the same delta with a bumped number. `--expected-version head`
  resolves under the held lease and skips the read-then-write, but it forfeits
  lost-update detection by design — use it only when the mutation does not depend
  on record contents you read earlier.
- `WORKSPACE_LOCKED` — another writer holds the lease. / no / back off and
  re-invoke. Do not busy-loop and never clear a lease by deleting its file; that
  is a fail-closed corruption path. `lease-inspect` diagnoses before you act.
- `WORKSPACE_VIEW_STALE` — a materialized view lags authority. / no / read-only
  and transient; `status` reads authority and never raises it.
- `WORKSPACE_SNAPSHOT_INVALID` — the engine's replay snapshot or its manifest
  is malformed, damaged, or no longer matches the event prefix. / yes / do not
  fall back to a full replay; rebuild the engine replay snapshot through the
  governed repair path and keep the append-only event segments unchanged.
- `WORKSPACE_EVENT_CORRUPT` — the control tree was written by something other than
  the engine, or an event fails its replay predicate. / yes / **reading stops
  working too, not just writing.** An editor that reformats on save, a linter, a
  sync daemon, or an agent reaching for a file-write tool all do this. Restore the
  whole tree from a verified snapshot; never repair by hand. One non-corruption
  cause looks identical and is worth ruling out first: an engine older than the
  release that introduced a record or a bound refuses the chain with this same
  code. Check the copy's version before concluding the bytes are damaged.
- `WORKSPACE_GATE_IDENTITY_REQUIRED` / `WORKSPACE_GATE_IDENTITY_REFUSED` — an
  `owner_intent_required` gate needs an out-of-band roster (`--identity-authority`
  plus its digest) and an `--actor` that roster permits; the second code means the
  roster was supplied and does not permit that actor. / no / obtain the roster
  from where it is published and name a permitted actor. This is authorization,
  not authentication: the engine can refuse an impermissible identity, never prove
  who typed the command.
- `WORKSPACE_STORY_SCOPE_REQUIRED` / `WORKSPACE_STORY_SCOPE_INVALID` — a new Story
  must carry its full scope atomically, and the ten-block contract is re-checked
  on every move to `ready`, `active`, or `done`. / no / complete the blocks and
  the four Goal anchors — since `v0.13.0` in either working language.
- `WORKSPACE_OWNER_ACCEPTANCE_REQUIRED` — a Story whose Goal names Owner as its
  decider is being moved to `done` without a deciding-minutes backlink. / no /
  record the ruling, then `work-annotate --decided-by`.

## Protocol shape and graph (`protocol-common`, `work-model`)

- `TIMESTAMP_INVALID` / `EXTERNAL_KEY_INVALID` — the instant is not strict
  RFC 3339, or the key is outside its grammar (upper-case alphanumeric segments
  joined by hyphens; an underscore is not admissible). / no / correct and resend.
- `INVALID_TRANSITION` / `GRAPH_PARENT_KIND_INVALID` / `REFERENTIAL_INTEGRITY` /
  `TOMBSTONE_REFERENCED` — the status jump is not on the frozen matrix (`planned`
  cannot reach `active` directly), the parent is the wrong kind for the child
  (Initiative → Epic → Story → Subtask; Initiative and Release are parentless), the
  reference names nothing, or it names a tombstoned record. / no / fix the shape.
  For a record that is *born* already in progress, `work-create --status` sets the
  birth state — the matrix governs existing records, not new ones.

## Deliberation records (`conference-v1`)

- `CONFERENCE_BUDGET_EXCEEDED` — a text field overran its bound. **Two different
  bounds report this same code**, and the message tells them apart: the engine's
  fixed ceiling on one position (8,192 bytes at `v0.13.0`), and this workspace's
  own writing budget (`conference.positionBudgetBytes`, default 4,096 — its
  message names the value). Every other conference text field keeps 2,048, and the
  bounded arrays have their own caps. / no / for a position, split into sequential
  positions under the same `actorId` and **never summarise into the budget**;
  bytes, not characters, so CJK reaches it about three times sooner than length
  suggests.
- `CONFERENCE_INDEPENDENCE_REQUIRED` — `execution.independenceFloor` covers this
  conference type and the close did not declare `--execution-form independent`.
  / no / declare it truthfully, or have the floor changed through the settings
  ceremony. Do not relabel a single-context deliberation to satisfy the floor.
- `KNOWLEDGE_HIGH_WATER_MISMATCH` / `KNOWLEDGE_CAS_MISMATCH` — **only**
  `conference-close --distill` touches the knowledge store. The first means the
  store trails the chain head: run `knowledge-rebase` first. The second means you
  passed a chain version where the store's own marker version was wanted; its
  message reads `<yours>:<actual>`, which is the fastest way to read the true
  marker. A close without `--distill` never meets either.
- `KNOWLEDGE_DISPOSABLE_ACK_REQUIRED` — `knowledge-init` refuses to build the
  store until the caller acknowledges what it is. / no / pass the acknowledgement
  flag. The refusal is the teaching: the store is a derived, disposable index over
  the chain, not a second place facts live, and anything it holds can be rebuilt
  from the events. Acknowledging that is what keeps a later `knowledge-rebase`
  from looking like data loss.
- `CONTEXT_AUTHORITY_REQUIRED` — a context route was asked for without the
  authority input it requires. / no / supply the authority the verb names; this is
  a missing input, not a trust finding.
