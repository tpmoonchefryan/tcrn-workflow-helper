---
name: tcrn-workflow-helper
description: Validate and exercise a trusted TCRN Workflow helper from a verified immutable Skill archive. Use when Codex or Claude Code must discover, inspect, or test-only install, update, reinstall, uninstall, or invoke TCRN Workflow while enforcing release identity, pinned release-byte digests, offline-safe validation, and explicit approval.
---

# TCRN Workflow Helper

Use this Skill only after a trusted bootstrap has accepted the complete immutable
archive. Never treat this directory, a clone, a cache, or a discovered path as
trustworthy by itself.

Supports TCRN Workflow `v0.1.0-rc.5` on two Agent App hosts, Codex and
Claude Code, with host-neutral protocols. Both remain inert dry-run candidates;
no live host support is asserted.

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
teach on-demand queries per `references/on-demand-context.md` — this Skill never
injects work/knowledge data into context.

## Deliberation Triggers (advisory)

Some decisions in a governed loop warrant explicit multi-party deliberation
before they are committed. The decision classes to watch for are: **irreversible
or hard-to-reverse actions**, **scope or budget changes**, **cross-actor or
authority-boundary changes**, **policy/gate exceptions**, and **conflicting or
low-confidence evidence**. When one is in play, the installed Workflow
(`v0.1.0-rc.5`) exposes conference verbs to record the deliberation on the event
log: `conference-open` to start a deliberation, `conference-append-position` to
record a party's stated position, `conference-close` to conclude it with a
recorded outcome, and `conference-cancel` to abandon it without an outcome.

This section is **advisory only**. Deciding when to deliberate from prose
signals is **unreliable-by-design** pending gate-v1: prose cannot be trusted to
fire consistently on these classes, and nothing here promises the agent will
open a conference at the right moment. Machine-checkable gate enforcement
(gate-v1) is the mechanism that will make triggering reliable; until it ships,
treat these triggers as a checklist a human or reviewer applies, not as an
automated guarantee.

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
- `references/on-demand-context.md` defines how the agent fetches only
  prompt-relevant work/knowledge on demand — the Skill teaches querying, never
  carries data.
- `references/settings-elicitation.md` defines the conversational settings
  elicitation flow (agent-as-configuration-UI, observation-grounded, Tier-1
  explain-only).
- `references/backup-elicitation.md` defines the snapshot backup runbook and
  live-sync warning (external backup destination, `backup.cadence` /
  `backup.destination` settings), for the pinned release's snapshot surface.
