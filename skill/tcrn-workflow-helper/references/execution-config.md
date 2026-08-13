# Execution settings and host dispatch policy

The execution surface is now split by authority. Workspace policy remains in
the settings catalog; a subagent model plan is a governed complex setting value
that hosts read before dispatch. The engine records names and assignments but
does not guess a model, contact a provider, or store credentials.

## Closed policy settings

- `execution.subagentPolicy` is `allowed`, `review-only`, or `forbidden`, with
  default `allowed`. It is declarative: hosts honour it and the engine keeps
  the exact value.
- `execution.independenceFloor` is `none`, `verification`,
  `verification-and-risk`, or `all`, with default `none`. Where it covers a
  conference type, `conference-close` requires `--execution-form independent`.
- `execution.maxConcurrentSubagents` is a governed string integer from 1
  through 32 and defaults to `8`.
- `execution.maxDispatchDepth` is a governed string integer from 1 through 4
  and defaults to `1`.
- `execution.personalessDispatch` is `allowed` or `forbidden`, with default
  `allowed`.

Read `settings-catalog` before changing one. A setting write is one event and
must use a fresh `--expected-version`, an explicit `--at`, and an actor. A
failed value is a named engine refusal; the helper must not invent a fallback.

## Active plan references

`execution.claudeCodeSubagentPlan` and `execution.codexSubagentPlan` are the two
host-specific active references. An unset reference means that host's own
default. A set reference must name an existing plan for the matching host; the
engine refuses a missing plan. A plan is not a separate work entity, and it has
no independent Owner transition.

See `model-plan.md` for the record and four write verbs. The safe sequence is:

1. read `settings-catalog` and `model-plan-list`;
2. create or update the plan with `model-plan-set`;
3. append persona assignments with `model-plan-assign` or remove one with
   `model-plan-unassign`;
4. set the matching active reference with `settings-set`;
5. retain the receipts and read both surfaces back.

Removing a plan that an active reference names is refused by the engine. Remove
the setting reference first, then remove the plan. No endpoint, token, API key,
or authenticated URL belongs in a plan or on the governed chain.

The old host-configuration and persona-binding write family is retired from the
public catalog. Historical events remain replay-compatible, but a current
caller receives `CLI_COMMAND_UNKNOWN` for those retired verbs. Do not revive a
retired command in the helper or portal as a compatibility shortcut.
