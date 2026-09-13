# Dispatch tiers and host rendering

The current execution surface is a three-tier host projection, not a live
persona model-plan editor. The workspace stores model and effort strings in
`execution.dispatchTiers`, selects a named mapping through
`execution.dispatchMode`, and declares the mapping behaviour in
`execution.dispatchClasses`.

The closed tier order is `flagship`, `main`, `economy`. Each host may carry a
different model name and effort string at each tier. A missing row is a real
empty value; the renderer falls down the selected mode's tier order and does
not invent a provider default. An unresolved main host model produces a
no-write result from `host-render`.

## Workspace read surface

Read the current catalog and dispatch data before proposing a change:

- `settings-catalog --workspace <workspace>` returns the four dispatch keys and
  their current values;
- `dispatch-classes-list --workspace <workspace>` returns each class's
  `dispatch` and `verify` behaviour bits;
- `dispatch-mode-list --workspace <workspace>` returns named mappings and, with
  `--host <claude-code|codex> --class <class>`, the resolved tier value.

The host names accepted by the current renderer are `claude-code` and
`codex`. Unknown hosts may remain in the stored open text configuration, but
the renderer refuses to write a host it cannot describe.

## Governed writes

Every workspace setting write reads a fresh status first and uses
`settings-set` with `--expected-version`, `--at`, and `--actor`. The update
verbs merge one class, one mode, or one host tier table into the existing
configuration and preserve other hosts and modes. The engine validates the
shape; the helper does not maintain a second enum table.

## Host projection

`node scripts/host-render.mjs --workspace <workspace> --host <claude-code|codex>
--root <host-root>` is the sole renderer/writer. It creates a plan from the live
dispatch settings, backs up changed files, checks that each target did not
change after planning, writes atomically, and reads every changed file back.
`--plan-only` shows the managed paths and digests without writing.

Claude projection owns only the top-level `model`, the
`CLAUDE_CODE_EFFORT_LEVEL` environment variable, the harness hook registrations,
the `CLAUDE.md` bridge, and the `model`/`effort` frontmatter in
`.claude/agents/<class>.md`. Codex projection owns the root `model` and
`model_reasoning_effort` keys in `.codex/config.toml` and the generated
`.codex/hooks.json` harness. Other host fields remain user-owned.

`host-render` returns a concurrent-modification refusal before writing when a
target's digest differs from the plan. A later write or readback failure
restores the files whose current bytes still equal this transaction's target;
it never overwrites a concurrent change. Backups and the receipt are separate
from the workspace chain, and neither proves host approval or a real model
trigger.

## Retired surfaces

The old `model-plan-*`, host-configuration, and persona-binding commands are
historical replay inputs only. The current CLI returns `CLI_COMMAND_UNKNOWN`
for those names. Do not recreate them in the helper or portal as a compatibility
shortcut; use the dispatch settings and the host renderer.
