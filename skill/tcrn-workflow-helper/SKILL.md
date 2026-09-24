---
name: tcrn-workflow-helper
description: Trusted setup and operating guidance for TCRN Workflow. Use when Codex or Claude Code must discover, inspect, or test-only install, update, reinstall, uninstall, or invoke TCRN Workflow while enforcing release identity, pinned release-byte digests, offline-safe validation, and explicit approval. Use it also while working in a project that carries an installed governed workspace — when a discussion converges on a direction, a decision with consequences is made, work completes, or a choice warrants deliberation, it routes that moment to the verb family that records it. It offers; it never records without the user's explicit yes.
---

# TCRN Workflow Helper

Use this Skill only after a trusted bootstrap has accepted the complete immutable
archive. Never treat this directory, a clone, a cache, or a discovered path as
trustworthy by itself.

That gate governs everything this Skill can *do*. The two advisory sections
below — Deliberation Triggers and Recording Triggers — instead describe when to
*speak*: they hold no authority, run nothing, and decide nothing the engine
would otherwise decide. Reading them in a session that never installs anything
is the expected case.

Targets the TCRN Workflow `v1.2.0` release on two Agent App hosts, Codex and
Claude Code, with host-neutral protocols. The helper payload itself is `v1.0.6`:
the immutable Workflow `v1.1.0` and Helper `v1.0.2` publications remain separate
prior releases, and the two version identities remain distinct. Publication and
trust state for the current pair is established only by its release assets and
independently verified bootstrap.

Current-surface facts about the candidate, each of which contradicts guidance you may
meet elsewhere — including older copies of this Skill:

- **The CLI is the only transport.** The engine ships no MCP server; guidance
  describing structured MCP tools is describing a retired candidate. Nearly every
  catalog verb is `cli` — the handful that are not are marked `fixture-only` and
  are not an operator surface. Read `availability` from the catalog rather than
  assuming it.
- **No live host activation is claimed.** The activation paths are inert until
  separately authorized. This helper drives none of them: its own mutating
  commands are test-root-only and nothing here touches a live host binary.
- **The current catalog is the capability authority.** `event-list` is present,
  while `relocation-*`, `adapter-*`, `model-plan-*`, and `persona-*` are not
  current CLI verbs. Older descriptions of those families are historical
  replay context only and must not be invoked. Host projection is the separate
  `scripts/host-render.mjs` path; it is not an engine catalog verb.
- **`v0.13.0` tightened two gates and raised one budget.** A gate now clears
  `done` only when `satisfied` — flipping it to `blocked` no longer releases the
  work item. Story purpose anchors accept either working language. A single
  conference position may carry up to 8,192 bytes, with the per-workspace
  writing budget in `conference.positionBudgetBytes` (default 4,096).
- **`v0.14.0` made every verb answer for itself, and gave the read surface a
  headroom report.** `<verb> --help` returns that verb's catalog entry — every
  flag, whether it is required, and what kind of value it takes — so an argument
  shape is one call away rather than a refusal to interpret. `status` now carries
  a `budgets` block: each view's bytes against the canonical ceiling, the largest
  event segment, and the record count against its cap. Two refusals are new and
  mean opposite things: `WORKSPACE_VIEW_BUDGET_EXCEEDED` is raised before
  anything is written and the chain is untouched, while a receipt carrying
  `viewProjection: "unwritten"` reports a write that **did** land whose derived
  view did not — do not retry that one, run `recover`.
- **`v0.15.0` uses local segmented storage for new workspaces.** New event
  history is canonical NDJSON in numbered byte-bounded segments with `.idx`,
  label/time, and manifest sidecars; the `file-segmented` backend is selected
  by default and the legacy count-based event files remain readable. Reads use
  the newest atomic replay snapshot plus its tail, and a damaged replay
  snapshot returns `WORKSPACE_SNAPSHOT_INVALID` rather than silently replaying
  the whole history. Knowledge bodies and time-attestation receipts have the
  same disposable legacy-to-segmented migration path; their metadata remains
  the source of record.

This Skill's prose (SKILL.md + references) may be distributed into a live host
skills folder by a standard installer, but a distributed copy has **no authority
until an independently obtained trusted bootstrap has verified it** (see the
First-Run Guidance). Distribution is read-only placement; every mutating helper
command (`install`/`update`/`reinstall`/`uninstall`) stays test-root-only.

## First-Run Guidance

When the user asks to set up, install, or deploy TCRN Workflow, follow
`references/first-run-wizard.md` step by step. It roots trust in an
independently obtained bootstrap runtime, gates every later step on a
machine-checkable marker (never on this prose), and uses managed default paths so
a non-technical user types nothing. Explain every fail-closed stop using
`references/reason-codes.md`. When the user later needs work items or knowledge,
teach on-demand queries per `references/on-demand-context.md`, and route the
governed feature itself per `references/workflow-operations.md` — this Skill never
injects work/knowledge data into context.

For natural-language installation or update requests, apply
references/install-surface-wizard.md before taking any action. Similar wording
is an intent signal, not approval: ask the matching-language confirmation first,
then run the full wizard only after an explicit yes. The wizard uses the
engine's install manifest as its single installation-surface source, but first
requires a read-only version/capability preflight for the install-manifest
surface. The preflight stops before that verb when the engine is older than
`v0.11.16` or does not advertise the capability; it never turns
`CLI_COMMAND_UNKNOWN` into a false green. Engine receipts, host approval, and real trigger evidence
remain separate.

For a multi-project setup, the wizard's resolved tree follows
`references/platform-layout.md`; that document defines the five engine roots,
the shared release-trust root, per-partition attestations, stable key prefixes,
and the one-confirmation/one-way-gate language.

For the operating contract after trust is established, teach
`references/operating-contract-v1.md` as three short chapters: `AGENTS.md` is
the single prose pole; every question routes through prose → settings →
template → engine; and templates/hooks retain their two-layer/two-zone
boundaries. The document is guidance only: the engine remains the authority.

## Resident platform rules and audience routing

When a platform root `AGENTS.md` is present, treat it as a small resident index.
It must retain identity, security, permissions, true-address entries, and
clear next-read pointers. Load detailed topology, archive, or history only for
the matching question. Load Owner-facing presentation rules only when the
response is addressed to Owner. An internal subagent instead loads its bound
Story brief, role/work/Pack binding, applicable safety rules, and relevant
source pointers; it does not receive the generic Owner presentation contract
or unrelated work/archive history by default.

A broken or missing pointer is a discovery failure and is reported as
`not-verifiable`; do not infer a replacement from prompt prose or a sibling
repository. The root-file byte count is only a documentation metric. It does
not prove that historical context was cleared, that a new session received
fewer tokens, or that cost fell; without a directly comparable same-input
session measurement, those outcomes stay `unknown`/`not-verifiable`.

The platform's path-free companion names are `platform-container-detail.md`
for topology/archive history, `platform-governance-detail.md` for the
governance and gate rules, and `owner-output-contract.md` for
Owner-facing presentation. The local index supplies their resolved location;
this Skill does not hard-code a machine path or become their authority.

## Where the chain lives, and the two interfaces onto it

A governed chain may be read or written only through the engine copy that is
bound to its five absolute roots. The current catalog has no relocation family:
there is no supported `relocation-*` operation, and copying or hand-editing a
control tree at another path does not move its authority. An operating session's
first question is therefore **which host holds the chain about to be read or
written** — answered by looking, never by remembering. Two hosts means two
installed copies and two command catalogs, so "does this verb exist" is a
question about the copy actually being invoked.

When the chain and the engine sit on another host, there are exactly two ways to
reach them. They are not two copies of the truth; they are **two interfaces onto
one chain**:

- **A reading interface** — a cockpit process running *on the host that holds the
  chain*, reached from the operator's machine over a forwarded local port. It
  reads through the engine's own read verbs and holds no privileged position.
- **A ceremony interface** — a governed session that runs the engine *on that same
  host*, driven over an authenticated remote shell, one governed verb at a time,
  with the receipt read back on the operator's machine.

**Changing interfaces does not change the chain.** Both paths end at the same
event log on the same host, and the reading interface can show nothing the
ceremony interface did not write. Which one to use is decided by the act, not by
preference — a read belongs on the reading interface, and every write belongs on
the engine ceremony on the host that owns the roots. If a deployment needs a
different address, stop and obtain a separately supported engine operation; do
not present a file copy as a move.

Two rules follow, and both have been broken in practice:

1. **Never write to a remote control tree with file tools.** `cat >`, `sed -i` or
   `rsync` over a remote shell is the same forbidden act as editing the tree
   locally, and it fails the same way — the chain then refuses reads too. A write
   to a chain on another host must be performed by the engine *on that host*.
2. **A check that reads only the local machine proves nothing about the remote
   one.** A backup routine or freshness check pointed at the wrong local path can
   report success while covering nothing. Verifying a remote chain means asking
   the host that owns it.

`references/aos-integration.md` carries the cockpit-specific form of this, and
the historical relocation notes in `references/workflow-operations.md` are
explicitly non-operational.

## Deliberation Triggers (advisory)

Some decisions in a governed loop warrant explicit multi-party deliberation
before they are committed. The decision classes to watch for are: **irreversible
or hard-to-reverse actions**, **scope or budget changes**, **cross-actor or
authority-boundary changes**, **policy/gate exceptions**, and **conflicting or
low-confidence evidence**. When one is in play, the installed Workflow
exposes conference verbs to record the deliberation on the event
log: `conference-open` to start a deliberation, `conference-append-position` to
record a party's stated position, `conference-close` to conclude it with a
recorded outcome, and `conference-cancel` to abandon it without an outcome.

One trigger is not a prose signal at all, and so does not inherit the
unreliability below: **fanning work out to two or more agents on the same
contested question.** The orchestrator knows it has done that at the moment it
dispatches, so this one fires deterministically. Open the conference, carry
each agent's position verbatim under its own actor id, and let the close record
which position prevailed and which were rejected. Sign a position with the
**persona role** it argues from — `profile:tcrn-<role>-v1` (the mandate the
position speaks for), not the model name that executed it (`agent:sonnet` is the
wrong id) — and keep two levels of signing distinct: the *event* actor is who
executed the write, the *position* `actorId` is the persona. Disclose the
execution form in the position's first line (subagent fan-out vs main-thread
synthesis) so a later reader knows how it was produced. A position written down
by an orchestrator and one written by its author carry the same weight, because
neither is cryptographically bound to its actor — the actor field is an
attribution claim, not proof of identity. Faithful transcription is therefore
the whole of the guarantee, which is why positions are carried verbatim rather
than summarised.

A single position has an **engine byte budget** — since `v0.13.0` a fixed ceiling of
8,192 UTF-8 bytes, with the workspace's own writing budget declared in
`conference.positionBudgetBytes` (default 4,096). The engine rejects an oversized
position outright with `CONFERENCE_BUDGET_EXCEEDED` naming `position`; it does not
truncate. Bytes, not characters — CJK runs about three bytes per character. When a
position genuinely does not fit, split it into sequential positions under the same
`actorId` and **never summarise it into the budget**; the full protocol is in
`references/workflow-operations.md`, and the convention that owns it is the
platform's `deliberation-adoption-convention.md`.

This section is otherwise **advisory only**. Deciding when to deliberate from prose
signals is **unreliable-by-design**: prose cannot be trusted to fire
consistently on these classes, and nothing here promises the agent will open a
conference at the right moment. The pinned release ships gate identity — an
`owner_intent_required` gate refuses to close without an out-of-band roster and
a named actor it permits (see `references/workflow-operations.md`) — so the
*closing* of a contested gate is now machine-checked. The *timing* of
deliberation is not, and stays a checklist a human or reviewer applies.

## Recording Triggers (advisory)

The judgment of *when* to suggest recording belongs to the driving agent — no
enumerated trigger list covers real conversations. The one generative signal:
**the conversation has produced something with consequences that the event log
does not yet hold** — a decision made, a direction converged, work completed, a
handoff implied. On noticing that gap, offer once to record it, naming what
would be recorded and through which verb (route per
`references/workflow-operations.md`; never improvise a recording path).

The timing is yours; the discipline around an offer is not:

- **Offer; never record without an explicit yes.** A suggestion names the
  record and the verb. Only the user's explicit approval runs it.
- **A scoped instruction is one yes for its whole batch.** "Decompose this
  Initiative" authorises the records that decomposing it produces; asking
  again for each of forty is the discipline defeating itself. Show the whole
  tree once, before any of it lands, and let a single confirmation cover it.
  What the rule protects is unchanged: the yes still precedes every write and
  still sees what it approves.
- **Declined means dropped.** Do not re-raise a declined offer; at most one
  aggregate reminder at a natural closing point for what is still unrecorded.
- **Relay what queries reveal.** When on-demand reads surface stale work items,
  unclosed gates, or an idle deliberation, say so in one line. The Workflow has
  no voice of its own; between queries it is silent by design.

Recording is where the offer discipline lives; *acting on a plan already agreed*
is where a second discipline does. Once the user has approved an Initiative and
its decomposition, the default is to carry the work through — not to return for
a confirmation at every step. Stop and ask for exactly three things, and treat
everything else as proceed-and-report:

- **A gate whose outcome class is `owner_intent_required`.** The engine already
  refuses to satisfy it without the roster and the named actor; the person whose
  intent it names has to supply that, so this stop is real and unavoidable.
- **An outward, hard-to-reverse publish** — pushing a tag, cutting a release,
  anything that leaves a durable public mark.
- **An irreversible direction change no existing ruling supports.** A choice
  that is reversible, or that a prior decision already covers, is not this.

Everything else — recording hygiene, correcting a misstatement, a technical
choice inside the agreed scope — proceeds, with a line in the record noting the
user may reject it and that it is single-point reversible. When you report back,
separate *what was done and is open to rejection* from *what genuinely awaits a
decision*, and let the second list earn its place: an item belongs there only
when you cannot settle it from the existing rulings and the evidence in hand. Do
not pre-register a future stop while planning; write the condition instead ("if
this still holds when the work reaches it, raise it"), because the plan often
dissolves the question before the step arrives.

Illustrative, not exhaustive: a discussion converges on a direction (offer
`work-create` for the matching Initiative or Story); the user chooses between
real alternatives (offer a conference to record the decision and the rejected
positions); a deliverable lands (offer the completing `work-transition`); a
gate closes `satisfied` while `backup.cadence` is `gate-close` (propose the
snapshot in the same breath as reporting the closure — a cadence that never
surfaces after a closure is a missed backup, not a kept preference); a defect is
found but *deferred* rather than fixed on the spot (offer a record for it so the
chain carries the known-but-unfixed state — one fixed in the same sitting is a
closed loop and needs none). Like
Deliberation Triggers, prose signals are best-effort by design: timing quality
scales with the driving agent's capability (the pinned release's README,
"Driver assumptions"), and nothing here promises an offer fires at the right
moment.

## Native dispatch and review evidence

Every native dispatch names its task classification from the current dispatch
configuration. When that class has `verify: true`, a non-empty task-level
verification command is required and review evidence must retain its result.
One dispatch carries one deliverable, and a one-command operation stays with the
driving session. After completion, run
`tcrn-workflow/scripts/review-evidence.mjs` against the exact work item: it
executes the chain's `advisory:verify`, records the real test-run output apart
from the engine test result's `tests` array count and before/after `countCoverage`
AST counts, and measures fixed base/head diff
entries plus untracked files against the file list declared before execution.
The result's `outOfBounds` list is not cleared by changing the list afterwards,
and caller-supplied passed or count values are not evidence. Attach the three
rows to the `done` closeout. Until this rule takes effect, the existing per-item
gate procedure remains in force; after it takes effect, task-level verify,
risk-proportional tests and review evidence close tasks, while the full
acceptance-gate roster runs after the final candidate commit and before external
publication. A lower cadence never removes a gate.

For a formal batch's current-stage read, `work-show` remains the native source for
both dependencies and implementation outcomes. An `advisory:verify` value is only
a command/locator; it is not proof that the command ran. A successful active-work
outcome must be recorded on that native work surface with an explicit successful
status, `ok: true`, `exitCode: 0`, command, evidence locator, and the current work
revision/scope binding. Dependencies must be an explicit array; an omitted field is
unknown, not an empty graph. Missing, failed, or stale outcomes remain
`unknown`/`not-verifiable`. A genuine native result note may qualify a work item
such as 428 even when it has no `advisory:verify` command; a prompt, copied result,
or external completion store never qualifies it.

### Verification cadence

The execution brief may carry an optional `verificationPlan` with one of four
phases: `development`, `candidate-final`, `publication`, or `merge-sensitive`.
During development, choose local checks from the changed files and their known
dependencies; unknown impact, an incomplete dependency, or a failed check is
`blocked`, never a silent skip. The final and publication stages execute the
acceptance roster's top-level roots once, while `contains` children are reported
as `covered-by` and are not launched a second time. A merge-sensitive stage
rechecks roots affected by the merge. Reuse requires matching source,
environment, command/arguments, and baseline digests plus a successful terminal
result; missing or changed inputs, failure, and in-progress results are
`invalidated`. Plans expose `selected`, `executed`, `covered-by`, `reused`,
`invalidated`, and `blocked`; same-repository output work is serial. This is a
frequency rule only: it does not remove a gate or grant visual acceptance or
publication authority.

Verification impact is derived from changed source, dependencies, configuration,
generated artifacts, environment, and cross-repository changes. Each required
gate is recorded as `run`, `reused`, `not-applicable`, or `not-verifiable`, with
the basis for that state. Reuse requires matching source, environment,
command/arguments, baseline digests, and successful terminal evidence. Run each
top-level root once and report contained children as `covered-by`; same-
repository output work is serial. Unknown impact is handled conservatively and
is never a silent skip. These obligations apply whether or not a phase is named.

### Agent lifecycle for dispatch rounds

A new Codex task/EPIC/Story Pack, rework, decision, or acceptance round reads its
bound Story with native `work-show` and resolves model/effort from the live
dispatch settings immediately before spawn. The Codex prompt carries only role,
phase, work id, repository root, and red-line boundaries; Claude Code follows its prompt for host details.
No external brief, structured handoff,
digest-derived task name, or pre-call receipt is required. For Codex, the spawn
input carries `forkTurns: "none"`; this is a Codex constraint, not a claim about
Claude Code. A completed or terminal-blocked Codex instance is not a target for a
later follow-up. Reuse only decision or evidence digests; do not carry the old
transcript, and do not treat compaction as a new instance.

The only same-instance exception for a still-running bounded Codex task is a
necessary factual clarification. Mark it `phase: clarification`,
`sameTaskRunning: true`, and `newInstance: false`, then use Codex's `SendMessage`
path without cancelling or restarting progress. Missing role, work, Pack,
tool-input, or child `turn_context` evidence is `unknown`/`not-verifiable`; a
prompt's self-description is not identity. The SubagentStart/SubagentStop hook
records bounded facts only; missing native role/provider fields stay unknown and
do not block a valid Codex dispatch.

### Batch and hook boundary

The formal batch boundary treats 420's dynamic plan and 421's qualification as
separate interfaces. Hooks may assist with qualification or notification, and
the Stop hook performs its qualification check; neither hook invocation is the
formal batch trigger, which remains a separate operation. Running work, missing
dependencies, binding or queue drift, and a security refusal stop the batch or
make its result `not-verifiable`; they are not silently accepted. An approved
publication, installation, or measurement is a post-action activity, not a
current-stage prerequisite.

## Fitness and retirement

Fitness is evidence about reuse, not a permission to delete arbitrary records. The
engine's `fitness.windowDays` setting is the count of complete UTC observation days
required by `retire-proposals` and `retire-sweep` (default 90), and
`fitness.minEvents` is the minimum observed telemetry-event count for a small card
(default 1). Missing or invalid days are incomplete evidence and never count as
zero activity. `retire-proposals` is read-only and returns the window counts plus
base-digest-bound removal diffs; `retire-sweep` applies only the adopted small-card
rule. Articles, their index cards, decision records, gates, and rule/verify
artifacts remain retained. Do not lower either setting to make a retirement
eligible, and do not call a candidate archive or a local telemetry fixture
production evidence.

## Trust Gate

1. Read `references/trust-contract.md` before an installation or root decision.
2. Before extracting or installing this Skill, run the independently supplied
   trusted-bootstrap runtime against the complete archive and machine state
   path. Require its canonical receipt. Do not use a file from this archive to
   authenticate this archive.
3. Resolve one explicit approved root with `resolve`; reject ambiguity, symlinks,
   replacement, wrong remote/version, and dirty production checkout on either
   host.
4. Run Workflow only after both commands succeed. Keep the clone, private
   Workspace, cache, and machine trust state outside this Skill directory.

## Mutating Operations

Require explicit user approval before network clone/update or any installation
mutation. First produce `plan-network`; do not perform the plan implicitly.
Use `install`, `update`, `reinstall`, and `uninstall` only through the helper's
disposable `tcrn-helper-test-*` root gate. This release has no user-approved
or production-root mutation surface. Preserve private Workspace bytes, use a
staged transaction, and retain the canonical receipt. Never use the helper
lifecycle commands against a live host Skill location. Standard distribution
places Codex's universal user copy at `~/.agents/skills` and Claude Code's copy
at `~/.claude/skills`; a project `.claude/skills` location is also live. The
bootstrap rejects both host families fail-closed (`LIVE_LOCATION_FORBIDDEN`);
installation and removal are test-root-only (`tcrn-helper-test-*`) in this
release on both hosts.

## Failure Handling

Stop on the stable reason code. Do not retry by weakening identity, digest,
checksum, provenance, root, or archive checks. Read
`references/trust-contract.md` for the receipt and input contracts.

## Resources

- `scripts/create-skill-archive.mjs` creates a deterministic archive manifest.
- `references/trust-contract.md` defines the offline bootstrap contract, the
  out-of-band trust anchor, and reason codes.
- `references/first-run-wizard.md` is the guided setup flow for non-technical
  users (root-of-trust ordering, marker precondition, managed defaults).
- `references/reason-codes.md` translates every stable reason code into plain
  language (what happened / security stop? / what to do).
- `references/aos-integration.md` covers the AOS questions that come up during
  setup — a cockpit already running on the machine, a user moving from local-only
  Workflow to AOS, and the two interfaces onto a chain that lives on the cockpit's
  host — including the read verbs a cockpit needs, the current no-relocation
  boundary, and the boundary this helper will not cross (it explains AOS; it never
  installs or drives it).
- `references/on-demand-context.md` defines how the agent fetches only
  prompt-relevant work/knowledge on demand — the Skill teaches querying, never
  carries data.
- `references/settings-elicitation.md` defines the conversational settings
  elicitation flow (agent-as-configuration-UI, observation-grounded, Tier-1
  explain-only).
- `references/operating-contract-v1.md` is the three-chapter guide to
  `AGENTS.md` scope, the four-layer route, template bottom/genre separation,
  and TCRN-managed versus user-owned hook zones.
- `references/driver-capability-profile.md` defines `driver.capabilityProfile`
  (`frontier` / `standard`) — how a deployment declares which tier of driver it
  runs, which guidance that shapes, and the three boundaries it must not cross
- `references/model-plan.md` documents the current dispatch-tier settings and
  `host-render` projection, and labels legacy model-plan/persona records as
  historical (authority and audit constraints never vary; the user declares the
  capability profile and the agent never infers it; engine limits stay out of it).
- `references/backup-elicitation.md` defines the snapshot backup runbook and
  live-sync warning (external backup destination, `backup.cadence` /
  `backup.destination` settings), for the candidate's snapshot surface —
  including the same-path restore boundary and what a backup means once the
  workspace is not on the operator's machine.
- `references/workflow-operations.md` routes a governed situation to the feature
  that answers it (work graph, gates, conferences, knowledge, recovery,
  snapshots), states the three things every mutation must supply, and names the
  one-way doors an agent must disclose before proposing them.
