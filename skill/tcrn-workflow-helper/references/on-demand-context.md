# On-demand context (the Skill teaches querying — it never carries data)

This is the boundary the whole design protects: **the Skill must never inject
work items, knowledge records, or workspace data into the agent's context.** It
does not carry that data, and the wizard must not pre-load it. Instead, when the
agent needs a work item or a knowledge record, it fetches **only the
prompt-relevant piece, on demand**, using the Workflow's own governed query
commands — which are metadata-first and budgeted by construction.

## These are Workflow (product) commands, run AFTER install — not helper commands

The helper (this Skill's trust boundary) exposes only trust/lifecycle verbs
(`validate`, `verify-installed-copy`, `resolve`, `plan-network`,
`install`/`update`/`reinstall`/`uninstall`). It has **no** work/knowledge query
command, on purpose — that keeps the verifier and the product in separate trust
domains. The commands below belong to the installed **TCRN Workflow** CLI
(`node scripts/tcrn-workflow.mjs …`) at the pinned release, and are invoked only
after the Workflow is verified and resolved.

## The metadata-first query commands to teach

- `context-route` — the P6 context router: given a scope/risk/budget, it returns
  a **metadata-first** selection of the relevant records, with explicit,
  separate body reads. Use this to find "what is relevant to this prompt"
  without pulling bodies.
- `knowledge-list` — lists knowledge records by metadata (never opens bodies).
- `knowledge-snippet` — returns a bounded snippet, not a full body.
- `knowledge-body` — returns a single record's body **only when explicitly
  requested** for that one record.
- `knowledge-freshness` — checks freshness metadata.

## The rule for the agent

1. Query metadata first (`context-route` / `knowledge-list`) to identify the one
   or few records relevant to the current prompt.
2. Read a body (`knowledge-body`) only for a specific record the task actually
   needs, and only when asked — one at a time, within budget.
3. Never bulk-load work items or knowledge bodies "just in case", and never let
   this Skill or its wizard place that data into context preemptively.

This mirrors — and is meant to demonstrate — the Workflow's own P6 discipline:
metadata-first selection, explicit body reads, budgeted retrieval. A guided
Skill that followed the opposite pattern (injecting bulk context every turn) is
exactly what this project is designed not to do.
