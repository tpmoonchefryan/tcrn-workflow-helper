# Persona content

Workflow separates the eight Core Reference personas from user-owned persona
content. The Core Reference roster is compiled, read-only conference reference
data; it is useful for attribution and display, but it is not a host session
authority and it is never edited from a workspace.

## Custom persona records

Custom personas are governed content records written by the engine with
`persona-set` and `persona-remove`. A record has a user-facing `name` (at most
64 characters), `description` (at most 256), one of the six closed roles
`orchestrator`, `planner`, `implementer`, `reviewer`, `gatekeeper`, or `steward`,
and a `prompt` of at most 4096 characters. The engine derives the profile id
from the name; callers do not choose or edit that id. Repeating `persona-set`
for the same name is an update and advances the record revision. Each set or
remove is one event, so the readback and the audit chain agree.

Read the complete surface with `persona-list` (or the `personas` field on
`execution-config`). The list labels compiled records as `core-reference` and
`readOnly`, and custom records as `custom`; presentation policy may gray a row,
but it must not delete its data.

## Binding integrity

`persona-binding-set` accepts a custom derived id or one of the eight Core
Reference ids, including `profile:tcrn-verity-v1`. A missing profile is refused
by name. Removing a custom persona that a binding still references is also
refused and names the binding; remove the binding first. This is engine
referential integrity, not a portal-side validation shortcut, so a portal must
send over-limit prompts to the engine and show its refusal verbatim.

## Dispatch policy interaction

The execution catalog carries three orchestration keys in addition to the seven
existing settings: `execution.maxConcurrentSubagents` is a string integer from
1 through 32 and defaults to `8`; `execution.maxDispatchDepth` is a string
integer from 1 through 4 and defaults to `1`; and
`execution.personalessDispatch` is the closed enum `allowed`/`forbidden`,
defaulting to `allowed`. The `execution.subagentPolicy` value
`review-only` is a presentation policy: only `reviewer` and `gatekeeper`
personas and their bindings remain active-looking. `forbidden` grays the whole
Persona card. Both policies preserve the engine readback and never authorize a
new mutation by themselves.
