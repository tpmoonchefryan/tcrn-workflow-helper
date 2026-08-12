# Execution configuration (model choices, policies, independence)

Since Workflow `v0.11.14` a workspace carries an execution-configuration
surface: which model each host should drive, per named configuration, with one
optional default per host and per-persona pins. The engine records and audits
these choices and enforces referential integrity; it never interprets a model
name. A user's model choice is a composite judgement of cost, intelligence and
feel — when Opus 5 shipped, a real population rolled back to 4.8, and both
releases sit in the same capability tier, which is why the NAME is recorded and
no tier vocabulary is imposed.

## The two-layer shape

- **Host configurations** — named entries `{name, model, note?}` per host. The
  host set is closed: `claude-code` and `codex`, exactly the adapter families
  that exist. An API or relay login still drives one of these two applications.
- **`default` pointer** — at most one per host. A global rollback is ONE
  switch: `host-config-default`. The pointer is called `default`, not `active`,
  because a pinned persona does not follow it.
- **Persona bindings** — `persona-binding-set` pins a profile (for example
  `profile:tcrn-verity-v1`) to a specific configuration, so a reviewer persona
  stays on the strong model while the default moves.

## The verbs

`host-config-set`, `host-config-remove`, `host-config-default` (`--clear true`
to unset explicitly — omission is refused, never read as a clear),
`persona-binding-set`, `persona-binding-remove`, `persona-set`,
`persona-remove`, and the read faces `execution-config` (`--host` filters) and
`persona-list`. Every write takes `--expected-version` from a fresh read and
returns the engine's receipt; each action is its own chain event, so "the
default moved" is one legible line in the audit trail.

A removal the state still points at — the host's default, or any persona
binding — refuses with `EXECUTION_CONFIGURATION_IN_USE`. Move or clear the
pointer first; the refusal names what points at it.

**Access details stay off the chain.** An entry is name + model + note. An
endpoint, key, or relay credential belongs to the host's own local
configuration; the Credentials discipline (references, never values) applies.
When a host cannot resolve a configured model at dispatch time, the correct
behaviour is a named refusal — never a silent fallback to some other model,
which would override the user's recorded choice.

## The two policy settings

- `execution.subagentPolicy` (`allowed` / `review-only` / `forbidden`,
  default `allowed`) — whether this workspace permits sub-agent fan-out.
  Declarative, like `backup.cadence`: the engine never sees a subagent; hosts
  honour it.
- `execution.independenceFloor` (`none` / `verification` /
  `verification-and-risk` / `all`, default `none`) — which conference types
  must declare an independently argued execution form at close. This one IS
  enforced: where the floor covers a conference's type, `conference-close`
  refuses with `CONFERENCE_INDEPENDENCE_REQUIRED` unless
  `--execution-form independent` is given. The declaration is a self-report,
  validated for presence and value and never for truth — the same
  authorization-not-authentication ceiling the gate machinery states about
  itself. Where the floor does not cover, the flag is optional and recorded
into the minutes when given.

Three orchestration settings complete the catalog. `execution.maxConcurrentSubagents`
is stored as a string integer from 1 through 32 and defaults to `8`;
`execution.maxDispatchDepth` is stored as a string integer from 1 through 4
and defaults to `1`; and `execution.personalessDispatch` is the closed enum
`allowed` / `forbidden`, defaulting to `allowed`. The engine validates these
values when `settings-set` runs; the portal must not invent a fallback when a
value is refused.

The portal's Execution surface manages all of this — configurations, defaults,
bindings, persona content, and the three orchestration keys — with the engine's
own receipt shown after every write.
