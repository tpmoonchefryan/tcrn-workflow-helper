# Snapshot Backup Elicitation and Runbook (WSF-5)

The helper agent may guide the operator through taking and restoring a hermetic
snapshot of the workspace control tree. This flow teaches the operator to drive
the installed **TCRN Workflow** (`0.1.0-rc.5`) snapshot verbs — it never carries
workspace data itself, and it never runs a backup automatically.

All paths below are workspace-relative placeholders. `<root>` is the Workspace
authority root (the directory that contains `.tcrn-workflow/`). Paths with spaces
are first-class — always double-quote them.

## Capabilities and the release that provides them

- The `snapshot-manifest` verb, which writes the deterministic canonical-JSON
  receipt (sorted per-file sha256 + head event hash + embedded validate result),
  is provided by TCRN Workflow `0.1.0-rc.5`.
- The `snapshot-verify` verb, which proves a copy or a restored tree is
  byte-identical to the manifest and emits `SNAPSHOT_VERIFIED`, is provided by
  TCRN Workflow `0.1.0-rc.5`.
- The `backup.cadence` and `backup.destination` conversational (Tier-2) settings
  keys, read only when this flow composes an explicit snapshot invocation, are
  provided by TCRN Workflow `0.1.0-rc.5`.
- The quiesce/settle preconditions (`recover`, `validate`, the lease as the
  quiesce proof) that a provable snapshot depends on are provided by TCRN
  Workflow `0.1.0-rc.5`.

## Two doctrines to state before starting

1. **Same-path-only.** A restore targets the exact original path on the same
   machine. Root rebind (a new path or machine) has no apply path in this
   release. Restore in place at the original `<root>`.
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

3. **Write the receipt** (save stdout verbatim):

   ```
   pnpm --silent exec tcrn-workflow snapshot-manifest --workspace "<root>" --at "<instant>" > "<receipt>"
   ```

4. **Copy the tree** with OS tools to a destination **outside** `<root>`:

   ```
   cp -R "<root>/.tcrn-workflow" "<destinationParent>/.tcrn-workflow"          # macOS/Linux
   robocopy "<root>\.tcrn-workflow" "<destinationParent>\.tcrn-workflow" /E    # Windows
   ```

5. **Prove the copy:**

   ```
   pnpm --silent exec tcrn-workflow snapshot-verify --root "<destinationParent>" --manifest "<receipt>"
   ```

   `SNAPSHOT_VERIFIED` means the copy is byte-identical. Any other result
   (`SNAPSHOT_MISMATCH`, `SNAPSHOT_RESIDUE_PRESENT`, `SNAPSHOT_MANIFEST_INVALID`,
   `SNAPSHOT_PATH_INVALID`, `SNAPSHOT_INPUT_INVALID`): do not keep the copy — see
   `references/reason-codes.md`.

## RESTORE runbook

1. **Quiesce.** End every agent session. Never restore over a live workspace.
2. **Copy the tree back to the ORIGINAL `<root>`** (whole control tree, both
   stores together — never a partial restore).
3. **Prove the restored tree** with `snapshot-verify --root "<root>" --manifest
   "<receipt>"`; expect `SNAPSHOT_VERIFIED`.
4. **Validate both stores** (`validate` and `knowledge-validate`) before agents
   resume.

## The backup settings keys (elicit; never assume)

- `backup.cadence` — a Tier-2 conversational preference from the closed enum
  `{gate-close, session-end, manual}` (default `gate-close`). It is **advisory
  only**: there is no engine scheduler, so cadence informs *when the agent
  proposes* a backup, never an automatic trigger.
- `backup.destination` — a Tier-2 conversational preference with **no default**:
  always elicit an explicit absolute path. Recommend a destination that is
  **OUTSIDE both** the workspace control directory `.tcrn-workflow`
  (`WORKSPACE_CONTROL_DIRECTORY`) **and** the helper's managed trust-state root
  `~/.tcrn-workflow` (a distinct tree that holds the machine-bound anti-rollback
  state — putting a backup there would collide with it). Also keep it out of the
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

## Never a backup destination

`.tcrn-workflow/backups/` is migration-reserved: created empty at init, required
as a directory, and never a user backup target. Copy snapshots to a destination
outside `<root>`, never into `backups/`.
