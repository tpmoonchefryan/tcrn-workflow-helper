# Execution settings and host dispatch policy

The current execution surface is the engine's dispatch configuration plus the
separate `host-render` projection script. The engine records policy, class
behaviour, named tier mappings, and per-host model/effort values; it does not
contact a provider, infer a model, or store credentials.

## Current policy settings

These registered settings are read from `settings-catalog` and written through
the normal `settings-set` ceremony with a fresh expected version, explicit
timestamp, and actor:

- `execution.subagentPolicy`: `allowed`, `review-only`, or `forbidden`; default
  `allowed`.
- `execution.independenceFloor`: `none`, `verification`,
  `verification-and-risk`, or `all`; default `none`. A covered conference close
  must truthfully declare `--execution-form independent`.
- `execution.maxConcurrentSubagents`: string integer from 1 through 32; default
  `8`.
- `execution.maxDispatchDepth`: string integer from 1 through 4; default `1`.

The retired `execution.personalessDispatch` key is not registered. A caller that
names it receives the engine's `SETTINGS_KEY_UNREGISTERED` refusal.

## Current dispatch configuration

Read the current values before proposing a change:

1. `settings-catalog --workspace <workspace>` returns the four dispatch keys:
   `execution.dispatchClasses`, `execution.dispatchMode`,
   `execution.dispatchModes`, and `execution.dispatchTiers`.
2. `dispatch-classes-list --workspace <workspace>` returns each class's
   `dispatch` and `verify` behaviour bits.
3. `dispatch-mode-list --workspace <workspace>` returns named mappings; add
   `--host <claude-code|codex> --class <class>` to obtain the resolved tier and
   model/effort value for one host and class.

The closed tier order is `flagship`, `main`, `economy`. An empty tier row is a
real empty value. The renderer falls down the selected mode's mapping and emits
no host model write when the selected `plan` class cannot resolve a value.

Use the current dispatch write verbs, not a model-plan editor:

- `dispatch-classes-set` merges class behaviour bits;
- `dispatch-mode-set` merges one named class-to-tier mapping;
- `dispatch-tiers-set` merges one host's tier table; and
- `settings-set` changes scalar settings such as `execution.dispatchMode`.

Each mutating call must use the workspace path, a fresh numeric
`--expected-version` (or the catalog-advertised `head` sentinel when the
decision does not depend on earlier record contents), strict RFC 3339 `--at`, and
the acting `--actor`. Re-read `status` immediately before a numeric-CAS write.

## Host projection

`host-render` is not an engine catalog verb. It is the Workflow checkout's
`scripts/host-render.mjs` and is the sole renderer/writer for host-owned
projection files:

```sh
node scripts/host-render.mjs \
  --workspace <workspace> \
  --host <claude-code|codex> \
  --root <host-root> \
  --plan-only
```

The script reads dispatch settings from the selected workspace. `--plan-only`
shows managed paths, before/after digests, resolved values, and drift without
writing. An approved write uses the same command without `--plan-only`; use
`--backup-dir <directory>` when a separate backup location is required. Use
`--hooks-only` when synchronising the generated harness hooks while the model
plan is unresolved. The script checks target digests before writing, writes
atomically, reads every changed file back, and restores only bytes that still
match its transaction target after a later failure.

Claude projection owns the root `model`,
`CLAUDE_CODE_EFFORT_LEVEL`, harness-hook registrations, the `CLAUDE.md` bridge,
and `model`/`effort` frontmatter in `.claude/agents/<class>.md`. Codex projection
owns root `model` and `model_reasoning_effort` in `.codex/config.toml` plus the
generated `.codex/hooks.json`. Other host fields and unrelated hooks remain
user-owned. A host-render receipt proves only the projection transaction and
readback; it does not prove host approval or a real model trigger.

## Historical compatibility only

Older chains may contain model-plan records, persona/profile assignments, or
host-configuration events. They remain replay data where the engine permits,
but `model-plan-*`, `persona-*`, `persona-binding-*`, and host-configuration
verbs are not current operator commands. The current CLI returns
`CLI_COMMAND_UNKNOWN` for those retired names. Do not recreate them in the
helper or portal; use the dispatch settings and `host-render` surface above.

The catalog's `execution.claudeCodeSubagentPlan` and
`execution.codexSubagentPlan` entries are legacy model-plan-history references,
not a live plan editor. Do not set them unless a current engine contract
explicitly requires it; their presence in `settings-catalog` does not make the
retired commands available.
