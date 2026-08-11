# Snapshot Backup Elicitation and Runbook (WSF-5)

The helper agent may guide the operator through taking and restoring a hermetic
snapshot of the workspace control tree. This flow teaches the operator to drive
the installed **TCRN Workflow** snapshot verbs — it never carries
workspace data itself, and it never runs a backup automatically.

All paths below are workspace-relative placeholders. `<root>` is the Workspace
authority root (the directory that contains `.tcrn-workflow/`). Paths with spaces
are first-class — always double-quote them.

## Capabilities and the release that provides them

- The `snapshot-manifest` verb, which writes the deterministic canonical-JSON
  receipt (sorted per-file sha256 + head event hash + embedded validate result),
  is provided by the pinned TCRN Workflow release.
- The `snapshot-verify` verb, which proves a copy or a restored tree is
  byte-identical to the manifest and emits `SNAPSHOT_VERIFIED`, is provided by
  the pinned TCRN Workflow release.
- The `backup.cadence` and `backup.destination` conversational (Tier-2) settings
  keys, read only when this flow composes an explicit snapshot invocation, are
  provided by the pinned TCRN Workflow release.
- The quiesce/settle preconditions (`recover`, `validate`, the lease as the
  quiesce proof) that a provable snapshot depends on are provided by the pinned
  TCRN Workflow release.

## Two doctrines to state before starting

1. **A restore is same-path.** It targets the exact original path. The reason is
   unchanged and is not a limitation to route around: the engine binds five
   absolute roots, so a restored tree at any other path is refused by every read
   verb rather than quietly adopted. Restore in place at the original `<root>`.

   **Half of this doctrine is retired, and the half that is retired is the
   interesting one.** It used to continue: *root rebind (a new path or machine) has
   no apply path in this release.* That was true of the releases it was written
   against; it is not true of the pinned one, which ships `relocation-plan`,
   `relocation-vacate`, `relocation-adopt`, `relocation-abort` and
   `relocation-inspect`. What survives is the same-path rule for a restore. What is
   withdrawn is the claim of impossibility — and with it the habit of telling an
   operator that a workspace can never change machines.

   Keep the two apart when explaining them, because they are different operations
   with different receipts, different authorities and different failure modes:
   **a restore puts a verified copy back where it came from; a relocation is a
   separate recorded ceremony that changes where a workspace is bound.** Never
   present relocation as "restoring to a new machine". If a workspace legitimately
   has to move, restore it at its original path first, prove it, and relocate from
   there. Before proposing a first hop, state the one-way properties the operator
   has to know — they are in `references/workflow-operations.md` under one-way
   doors, and the authoritative account is the pinned release's
   `docs/adr/0003-workspace-relocation.md`.
2. **Lockstep-only.** Snapshot and restore the WHOLE `.tcrn-workflow` control
   tree — both the workspace event log and the knowledge store together. A
   partial restore bricks the store and is unrecoverable by design.

## SNAPSHOT runbook (teach the operator to run these)

1. **Quiesce.** End every agent session against `<root>`. A live lease holder
   surfaces `WORKSPACE_LOCKED`.
2. **Settle and prove green.**

   ```
   pnpm --silent exec tcrn-workflow recover --workspace "<root>" --at "<instant>"
   pnpm --silent exec tcrn-workflow validate --workspace "<root>"
   ```

   If the chain advanced since the knowledge store was last aligned — any
   `conference-close --distill`, or any lockstep operation — `snapshot-manifest`
   in the next step fails `KNOWLEDGE_HIGH_WATER_MISMATCH`. Realign first:

   ```
   pnpm --silent exec tcrn-workflow knowledge-rebase --workspace "<root>" --expected-version "<marker>" --at "<instant>"
   ```

   The `<marker>` is the store's own version, not the chain's; if you do not
   know it, attempt with `0` and the `KNOWLEDGE_CAS_MISMATCH <yours>:<actual>`
   refusal tells you the real one.

3. **Write the receipt** (save stdout verbatim):

   ```
   pnpm --silent exec tcrn-workflow snapshot-manifest --workspace "<root>" --at "<instant>" > "<receipt>"
   ```

4. **Copy the tree** with OS tools into a fresh per-snapshot directory under
   the destination, named `<partition>-<utc-instant>` so snapshots accumulate
   side by side instead of overwriting, and place the receipt beside the tree:

   ```
   mkdir -p "<destination>/<partition>-<utc-instant>"
   cp -R "<root>/.tcrn-workflow" "<destination>/<partition>-<utc-instant>/.tcrn-workflow"
   cp "<receipt>" "<destination>/<partition>-<utc-instant>/snapshot-manifest.json"
   ```

5. **Prove the copy:**

   ```
   pnpm --silent exec tcrn-workflow snapshot-verify --root "<destination>/<partition>-<utc-instant>" --manifest "<receipt>"
   ```

   The `--root` is the directory that CONTAINS `.tcrn-workflow`, never
   `.tcrn-workflow` itself. `SNAPSHOT_VERIFIED` means the copy is
   byte-identical. Any other result (`SNAPSHOT_MISMATCH`,
   `SNAPSHOT_RESIDUE_PRESENT`, `SNAPSHOT_MANIFEST_INVALID`,
   `SNAPSHOT_PATH_INVALID`, `SNAPSHOT_INPUT_INVALID`): do not keep the copy — see
   `references/reason-codes.md`.

6. **Rotate.** Only after step 5's `SNAPSHOT_VERIFIED`, apply the runbook's
   prose-only retention count: list the per-snapshot directories under the
   destination that match this flow's `<partition>-<utc-instant>` naming, and
   while more than the retention count remain, delete the oldest. Three rails are
   absolute: never delete anything before the new copy has verified; never
   touch any path that is not a matching per-snapshot directory under the
   destination; and name every deleted snapshot in the same breath as the
   backup receipt — rotation that reports nothing is deletion, not rotation.

## RESTORE runbook

1. **Quiesce.** End every agent session. Never restore over a live workspace.
2. **Copy the tree back to the ORIGINAL `<root>`** (whole control tree, both
   stores together — never a partial restore). If the workspace is meant to end
   up somewhere else, this step does not change: restore here, then run the
   relocation ceremony as its own operation.
3. **Prove the restored tree** with `snapshot-verify --root "<root>" --manifest
   "<receipt>"`; expect `SNAPSHOT_VERIFIED`.
4. **Validate both stores** (`validate` and `knowledge-validate`) before agents
   resume.

## The backup settings keys (elicit; never assume)

- `backup.cadence` — a Tier-2 conversational preference from the closed enum
  `{gate-close, session-end, manual}` (default `gate-close`). It is **advisory
  only**: there is no engine scheduler, so cadence informs *when the agent
  proposes* a backup, never an automatic trigger. Advisory does not mean
  silent: `gate-close` names a concrete moment, and reporting a gate
  `satisfied` without proposing the snapshot in the same breath is a missed
  backup, not a kept preference. A cadence the user chose earns its keep only
  by surfacing at its moment.
- Retention count is a prose-only choice of this runbook, not a registered
  Workspace setting. It controls how many verified snapshots the destination
  keeps (default `5`; a positive integer, or `unlimited`). Rotation is a
  runbook step, never a scheduler: it runs only inside the SNAPSHOT flow,
  immediately after a new snapshot proves `SNAPSHOT_VERIFIED`, oldest first,
  reporting every deletion by name. Do not send it to `settings-set`.
- `backup.destination` — a Tier-2 conversational preference with **no default**:
  always elicit an explicit absolute path. Recommend a destination that is
  **OUTSIDE both** the workspace control directory `.tcrn-workflow`
  (`WORKSPACE_CONTROL_DIRECTORY`) **and** the helper's managed trust-state root
  `~/.tcrn-workflow` (a distinct tree that holds the machine-bound trust state —
  putting a backup there would collide with it). Also keep it out of the
  workspace root and out of any live host skills directory (`~/.claude/skills`
  or a project `.claude/skills`) — the same location hygiene the first-run
  wizard enforces for the state root.

## Live-sync warning (state this every time)

**No live-sync.** Never place a live workspace, or a backup destination, under a
cloud/network sync client (Dropbox, iCloud, OneDrive, Google Drive) or behind a
symlink/junction. A snapshot proves a *quiesced* tree; a sync client mutating
files mid-copy defeats the byte-identical guarantee and can surface
`SNAPSHOT_MISMATCH`. A destination on a synced or cloud-backed filesystem also
means workspace data leaves the machine — treat that as an off-machine transfer
and get explicit operator approval before accepting such a `backup.destination`.

## When the workspace does not live on this machine

Every step above runs where the control tree is. The quiesce, both snapshot verbs
and the tree copy all touch the engine's own roots, so they run on the host that
holds them — not on whichever machine the operator happens to be typing on. Three
consequences to state before the first off-host backup:

- **Say which host each step ran on.** A receipt that does not name the machine it
  measured cannot be checked later, and this is precisely where a wrong assumption
  survives longest.
- **A backup taken on the host that holds the chain is a copy, not an off-site
  copy.** Both halves sit on one machine and one loss takes both. An off-site copy
  is a second transfer to a different machine, and which end initiates it is a
  credentials question rather than a preference: the end that can authenticate to
  the other is the end that starts it. Deciding that from convenience produces a
  configuration that cannot actually run.
- **A cadence pointed at a local path keeps succeeding after the chain moves, and
  covers nothing.** It finds no workspace, reports no error, and the silence reads
  as health. A backup check whose subject may have moved has to assert what it
  found, not merely that it finished.

## Never a backup destination

`.tcrn-workflow/backups/` is migration-reserved: created empty at init, required
as a directory, and never a user backup target. Copy snapshots to a destination
outside `<root>`, never into `backups/`.
