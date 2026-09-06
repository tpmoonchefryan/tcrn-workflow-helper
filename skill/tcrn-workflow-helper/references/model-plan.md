# Subagent model plans

A model plan is a host-scoped table used to choose models and effort levels for
subagent dispatch. It is a complex setting value, not a work entity: its name is
stable, its `defaultModel` is required, and each persona assignment is an
explicit persona-name to model-name pair, optionally carrying an effort level.
The closed host roster is `claude-code` and `codex`.

The engine never interprets model names and never stores credentials. A persona
missing from `assignments` uses the plan's default model. If the active setting
reference is unset, the host's own default applies. Effort resolves the same
way: a persona with no entry in `efforts` uses the plan's `defaultEffort`, and a
plan with no `defaultEffort` leaves effort unset.

## Effort levels

Effort is a separate axis from the model name, and unlike a model name the
engine does validate it against a closed roster (`tcrn.agent-effort.v1`). Seven
levels may be assigned to a persona: `minimal`, `low`, `medium`, `high`,
`xhigh`, `max`, and `none`. Two further levels — `ultra` and `ultracode` — are
session levels rather than per-request values; naming one for a persona refuses
at `MODEL_PLAN_EFFORT_NOT_ASSIGNABLE`. A level that is not legal for the named
host refuses at `MODEL_PLAN_EFFORT_HOST_UNSUPPORTED`, and the refusal lists the
legal values, so read the refusal rather than guessing the roster.

## Read and write sequence

Read the current chain version immediately before each write. Every write uses
the public CLI with `--expected-version`, `--at`, and `--actor`, and each receipt
is read back:

- `model-plan-set --host <host> --name <name> --default-model <model>
  [--default-effort <level>]` creates or revises a plan while retaining its
  assignments. `--default-effort` is optional; rewriting a plan without naming
  one clears the plan's default effort.
- `model-plan-assign --host <host> --plan <name> --persona <name> --model
  <model> [--effort <level>]` adds or replaces one assignment. The persona must
  be active. `--effort` is optional; omitting it leaves that persona on the
  plan's `defaultEffort`.
- `model-plan-unassign --host <host> --plan <name> --persona <name>` removes one
  assignment.
- `model-plan-remove --host <host> --name <name>` removes a plan only when no
  active setting references it.
- `model-plan-list` is read-only and may filter by host.

Then set one of the matching active references with `settings-set`:

- `execution.claudeCodeSubagentPlan` points only at a `claude-code` plan.
- `execution.codexSubagentPlan` points only at a `codex` plan.

If a write refuses, stop on its reason code. Do not retry with a different model
or effort level, rename a persona, or silently fall back. A direction question about which host,
plan, or model should be active is an Owner decision; record it in notes and
leave the chain unchanged.
