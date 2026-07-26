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

Supports TCRN Workflow `v0.7.0` on two Agent App hosts, Codex and
Claude Code, with host-neutral protocols. The pinned release ships a governed
seven-command operator surface, the same catalog as structured MCP tools, and
reversible project-local activation for both hosts. Those activation paths are
inert until separately authorized; their current exact SessionStart definitions
are code- and fixture-proven, but no current live host activation is claimed.
This helper drives none of those surfaces: its own mutating commands are
test-root-only and nothing here touches a live host binary.

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

A single position nevertheless has an **engine byte budget** — 2,048 bytes of
UTF-8 at the pinned release — and the engine rejects an oversized one outright
with `CONFERENCE_BUDGET_EXCEEDED` naming `position`; it does not truncate. The
budget is counted in bytes, not characters, so non-Latin text reaches it far
sooner than its length suggests (CJK runs about three bytes per character,
putting the ceiling near 680 characters). When a position does not fit, split
it on paragraph boundaries and record the parts as **sequential positions under
the same `actorId`**, distinct external keys (`POS-<AGENT>-1`, `POS-<AGENT>-2`)
and a `1/2`, `2/2` marker in each body so the reading order survives; the parts
concatenate back to the original text. Continuation exists to carry the whole
position, and is never a licence to summarise one into the budget.

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
disposable `tcrn-helper-test-*` root gate. This candidate has no user-approved
or production-root mutation surface. Preserve private Workspace bytes, use a
staged transaction, and retain the canonical receipt. Never install into a live
host Skill location — for Codex, the Codex Skill locations; for Claude Code,
a user-level `~/.claude/skills` or project `.claude/skills` location. The
bootstrap rejects both host families fail-closed (`LIVE_LOCATION_FORBIDDEN`);
installation and removal are test-root-only (`tcrn-helper-test-*`) in this
candidate on both hosts.

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
- `references/aos-integration.md` covers the two AOS questions that come up
  during setup — a cockpit already running on the machine, and a user moving
  from local-only Workflow to AOS — including the read verbs a cockpit needs and
  the boundary this helper will not cross (it explains AOS; it never installs
  or drives it).
- `references/on-demand-context.md` defines how the agent fetches only
  prompt-relevant work/knowledge on demand — the Skill teaches querying, never
  carries data.
- `references/settings-elicitation.md` defines the conversational settings
  elicitation flow (agent-as-configuration-UI, observation-grounded, Tier-1
  explain-only).
- `references/driver-capability-profile.md` defines `driver.capabilityProfile`
  (`frontier` / `standard`) — how a deployment declares which tier of driver it
  runs, which guidance that shapes, and the three boundaries it must not cross
  (authority and audit constraints never vary; the user declares it and the agent
  never infers it; engine limits stay out of it).
- `references/backup-elicitation.md` defines the snapshot backup runbook and
  live-sync warning (external backup destination, `backup.cadence` /
  `backup.destination` settings), for the pinned release's snapshot surface.
- `references/workflow-operations.md` routes a governed situation to the feature
  that answers it (work graph, gates, conferences, knowledge, recovery,
  snapshots), states the three things every mutation must supply, and names the
  one-way doors an agent must disclose before proposing them.
