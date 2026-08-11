# Platform workspace layout

This is the layout contract for a platform that contains more than one
project. It is a teaching document, not an authority source: the verified
Workflow engine owns the bindings, and the wizard must show the resolved paths
and obtain one explicit confirmation before it initializes anything.

## Container boundary

The platform container is the parent-level directory
`<platform>/.tcrn-workspace/`. It must not be placed inside a product Git
repository. A platform can contain one repository and still use this shape;
the container boundary is about keeping governance bytes out of product
history, not about counting repositories.

If the user opened a path inside `<platform>/<project>/.git/`, propose
`<platform>/.tcrn-workspace/` at the parent level. If a `.tcrn-workspace/`
marker is found while walking upward, show it as an existing candidate and
ask whether it is the intended container. Never silently create a second
container beside an existing one.

## Root mapping

The engine's five `init` roots are mapped as follows. The framework checkout is
machine-level and can be shared; it is not a second workspace and must not be
copied into a skill directory.

| Logical root | Standard location | Sharing rule |
| --- | --- | --- |
| `framework` | `<workflow-checkout>` | One approved, resolved checkout may serve multiple partitions. |
| `workspace` | `<platform>/.tcrn-workspace/<partition>/workspace` | One independent event chain per partition. |
| `transient` | `<platform>/.tcrn-workspace/<partition>/transient` | Per-partition scratch and temporary engine state. |
| `evidence-locator` | `<platform>/.tcrn-workspace/<partition>/evidence-locator` | Per-partition locator for reviewable evidence. |
| `release-trust` | `<platform>/.tcrn-workspace/release-trust` | Shared release identity/trust root for the platform. |

The attestation destination is a sixth visible directory, not a replacement
for one of the five engine roots:

```text
<platform>/.tcrn-workspace/
├── release-trust/
├── <partition-a>/
│   ├── attestations/
│   ├── evidence-locator/
│   ├── transient/
│   └── workspace/
└── <partition-b>/
    ├── attestations/
    ├── evidence-locator/
    ├── transient/
    └── workspace/
```

Each `init` call receives the five logical roots explicitly. Every later
mutating call reads the current workspace head, supplies the expected version
and actor, and passes the partition's attestation destination when that verb
supports it. A copied directory at another path is not a second authority.

## Partition and key-prefix rules

Partition names are stable path components, not display labels. They contain no
slash, are case-sensitive, and must be chosen as if a future restore will need
the same name. Use `cross-project` for work spanning projects and a stable
project identifier for project-local chains; shadows or scratch fixtures must
be visibly named as such.

The external-key prefix is derived, never invented per item:

```text
<PLATFORM>-<PARTITION>-<KIND>-<SEQ>
```

For example, a platform-level initialization item may use
`ACME-CROSS-INIT-001`, while a project partition may use
`ACME-DESIGN-STORY-001`. `SEQ` is the next chain-assigned sequence for that
kind; do not reuse a key after a refusal or correction. The derivation law is
permanent for the partition's records, so changing a prefix requires a new
governed direction rather than a text edit.

## Declaring the engine a container requires

The engine runs at machine level while chains live in the platform container,
so one engine serves every partition on the machine. `engine.requiredVersion`
is how a container states the contract its records were written under. Set it
during initialization to the engine version in use, and raise it when a chain
starts depending on a newer contract.

An engine that does not satisfy the declaration refuses by name and reports
both the required and the running version, rather than presenting a version
shortfall as a damaged chain. A container that carries no declaration is not
judged against one, so existing containers keep reading and writing unchanged;
adding the declaration later is an ordinary governed setting write.

The value is the engine's own version string. Do not invent a range or a
comparator: the declaration names a floor, and the engine performs the
comparison.

## First-run preview and irreversible choices

Before the first write, the wizard displays one complete plan containing:

- every partition and its derived key prefix;
- all five engine roots, the shared `release-trust`, and each
  `attestations/` destination;
- the live settings catalog, current/default values, and the proposed initial
  values for backup cadence/destination, driver profile, and any engine version
  declaration;
- the `AGENTS.md` operating-contract seed; and
- the host-wiring plan for Claude Code and Codex, including MCP entries and the
  adapter-managed hook baseline.

The user gives one explicit yes for this batch. Attestation selection is a
one-way gate: once actor attestation is enabled, it cannot be disabled. The
wizard says this before asking for the yes. It also says that a path change is
a relocation ceremony, not a filesystem rename, and that a host installation
receipt is not proof of host approval or a real trigger.

`AGENTS.md` is ordinary prose. The seed teaches the prose → settings →
template → engine route and the platform boundary; it never grants authority
and never contains private workspace data.

## Host wiring boundary

After the platform chain and settings are initialized, host wiring is a
separate, approved step. The agent uses the existing public adapter verbs to
prepare and install the MCP entries and the managed hook baseline for each
host: generate a fragment with `adapter-generate`, assess it with
`adapter-activation-assess`, install it with `adapter-install`, and only then
use `adapter-activate` when the host's approval is present. The fragment covers
the Claude Code and Codex MCP entries plus the adapter-managed hooks baseline.
It does not hand-edit user-level Claude or Codex configuration, and it does not
claim activation merely because an installation receipt exists. Host approval,
live trigger evidence, and governed chain records remain separate readbacks.
