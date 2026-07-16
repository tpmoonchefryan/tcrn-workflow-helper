---
name: tcrn-workflow-helper
description: Validate and exercise a trusted TCRN Workflow helper from a verified immutable Skill archive. Use when Codex or Claude Code must discover, inspect, or test-only install, update, reinstall, uninstall, or invoke TCRN Workflow while enforcing release identity, policy, anti-rollback, offline-safe validation, and explicit approval.
---

# TCRN Workflow Helper

Use this Skill only after a trusted bootstrap has accepted the complete immutable
archive. Never treat this directory, a clone, a cache, or a discovered path as
trustworthy by itself.

Supports TCRN Workflow `v0.1.0-rc.4` on two Agent App hosts, Codex and
Claude Code, with host-neutral protocols. Both remain inert dry-run candidates;
no live host support is asserted.

## Trust Gate

1. Read `references/trust-contract.md` before an installation or root decision.
2. Before extracting or installing this Skill, run the independently supplied
   trusted-bootstrap runtime against the complete archive, release manifest,
   policy, and machine state path. Require its canonical receipt. Do not use a
   file from this archive to authenticate this archive.
3. Resolve one explicit approved root with `resolve`; reject ambiguity, symlinks,
   replacement, wrong remote/version, and dirty production checkout on either
   host.
4. Run Workflow only after both commands succeed. Keep the clone, private
   Workspace, cache, and anti-rollback state outside this Skill directory.

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

Stop on the stable reason code. Do not retry by weakening identity, expiry,
revocation, checksum, provenance, root, archive, or rollback checks. Read
`references/trust-contract.md` for the receipt and input contracts.

## Resources

- `scripts/create-skill-archive.mjs` creates a deterministic archive manifest.
- `references/trust-contract.md` defines the offline bootstrap contract and
  reason codes.
- `references/settings-elicitation.md` defines the conversational settings
  elicitation flow (agent-as-configuration-UI, observation-grounded, Tier-1
  explain-only).
