# Persona content

Workflow separates the eight Core Reference personas from user-owned persona
content. The Core Reference roster is compiled, read-only conference reference
data; it is useful for attribution and display, but it is not a host session
authority and it is never edited from a workspace.

## Custom persona records

Custom personas are governed content records written by the engine with
`persona-set` and `persona-remove`. A record has a user-facing `name` (at most
64 characters), one of the six closed roles `orchestrator`, `planner`,
`implementer`, `reviewer`, `gatekeeper`, or `steward`, and the bounded content
fields `jobTitle`, `mission`, `refusals`, `authorityBoundary`, `contactWhen`,
`requiredInputs`, `deliverables`, and `successCriteria`. The engine derives the
profile id from the name; callers do not choose or edit that id. Repeating
`persona-set` for the same name is an update and advances the record revision.
Each set or remove is one event, so the readback and the audit chain agree.

Read the complete surface with `persona-list`. The list labels compiled records as `core-reference` and
`readOnly`, and custom records as `custom`; presentation policy may gray a row,
but it must not delete its data.

## Preset overlay integrity

The eight presets may be overridden on any non-name field with
`persona-preset-override`. The compiled `factory` data is immutable and is the
restore source. `persona-preset-restore` restores one field or the complete
overlay. `persona-remove` tombstones a preset; a model-plan assignment keeps the
preset in use and the engine refuses the removal until the assignment is
unassigned. A custom persona with a preset's name is refused as a name conflict.

Model plans reference active persona names, not rendered prompts. Removing a
custom persona that a plan assignment still references is refused and names the
plan. This is engine referential integrity, not a portal-side validation
shortcut.

## Dispatch policy interaction

The execution catalog carries three orchestration keys in addition to the
subagent plan references: `execution.maxConcurrentSubagents` is a string
integer from 1 through 32 and defaults to `8`; `execution.maxDispatchDepth` is
a string integer from 1 through 4 and defaults to `1`; and
`execution.personalessDispatch` is the closed enum `allowed`/`forbidden`,
defaulting to `allowed`. The `execution.subagentPolicy` value
`review-only` is a presentation policy: only `reviewer` and `gatekeeper`
personas and their bindings remain active-looking. `forbidden` grays the whole
Persona card. Both policies preserve the engine readback and never authorize a
new mutation by themselves.
