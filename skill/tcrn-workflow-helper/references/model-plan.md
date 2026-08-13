# Subagent model plans

A model plan is a host-scoped table used to choose models for subagent
dispatch. It is a complex setting value, not a work entity: its name is stable,
its `defaultModel` is required, and each persona assignment is an explicit
persona-name to model-name pair. The closed host roster is `claude-code` and
`codex`.

The engine never interprets model names and never stores credentials. A persona
missing from `assignments` uses the plan's default model. If the active setting
reference is unset, the host's own default applies.

## Read and write sequence

Read the current chain version immediately before each write. Every write uses
the public CLI with `--expected-version`, `--at`, and `--actor`, and each receipt
is read back:

- `model-plan-set --host <host> --name <name> --default-model <model>` creates
  or revises a plan while retaining its assignments.
- `model-plan-assign --host <host> --plan <name> --persona <name> --model
  <model>` adds or replaces one assignment. The persona must be active.
- `model-plan-unassign --host <host> --plan <name> --persona <name>` removes one
  assignment.
- `model-plan-remove --host <host> --name <name>` removes a plan only when no
  active setting references it.
- `model-plan-list` is read-only and may filter by host.

Then set one of the matching active references with `settings-set`:

- `execution.claudeCodeSubagentPlan` points only at a `claude-code` plan.
- `execution.codexSubagentPlan` points only at a `codex` plan.

If a write refuses, stop on its reason code. Do not retry with a different model,
rename a persona, or silently fall back. A direction question about which host,
plan, or model should be active is an Owner decision; record it in notes and
leave the chain unchanged.
