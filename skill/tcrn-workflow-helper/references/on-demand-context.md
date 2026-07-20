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

## What `context-route` actually does — and does NOT do

A common misreading is that `context-route` is a search: hand it a prompt and it
picks the relevant records for you. **It does not.** `context-route` performs
**no relevance selection.** It is the P6 enforcement gate: you hand it a
candidate set that *you* selected, and it applies freshness, budget, and
authority policy to that set, returning the admitted metadata-first references
(never bodies). Relevance is decided *before* `context-route`, by the listing
and candidate verbs — never by the router itself.

One current-state fact belongs here rather than in a footnote: in the pinned
release, `context-route` is one of the twelve governed verbs that require an
out-of-band authority the shipped CLI cannot accept — invoked from a shell it
stops at `CONTEXT_AUTHORITY_REQUIRED` ("Out-of-band context authority is
required"). Selection and reading (steps 1, 3 and 4 below) are unaffected.
Until the authority-supply program lands, the budget discipline is carried by
the per-verb windows and by this document — apply the same freshness and
budget restraint yourself, and never treat the router's refusal as a check to
work around.

## The metadata-first query commands to teach (the real pipeline)

- `knowledge-list` — lists knowledge records by metadata (never opens bodies).
  The starting point for enumerating what exists in scope.
- `knowledge-candidates` — the relevance-selection verb (present at the pinned
  release): given a scope/query it returns a **candidate set** of record
  references by metadata, ranked/filtered, still bodies-closed. This is where
  "what is relevant to this prompt" is decided.
- `context-route` — the P6 router/enforcer: given the candidate set you built,
  it enforces **freshness / budget / authority** and returns the admitted
  metadata-first references. No relevance selection; no bodies.
- `knowledge-snippet` — returns a bounded snippet, not a full body.
- `knowledge-body` — returns a single record's body **only when explicitly
  requested** for that one record.
- `knowledge-freshness` — checks freshness metadata.

## The rule for the agent (the pipeline order matters)

1. Enumerate with `knowledge-list`, then narrow to relevant candidates with
   `knowledge-candidates` — this is the only step that decides relevance, and it
   stays metadata-first (no bodies).
2. Construct a `context-route` request from that candidate set; let the router
   enforce freshness, budget, and authority. Treat what it admits as the
   governed working set — it filtered on policy, not on relevance. (From
   today's shell this step stops at `CONTEXT_AUTHORITY_REQUIRED` — see above;
   keep the candidate set metadata-first, apply the freshness and budget
   restraint yourself, and continue with step 3.)
3. Read a body (`knowledge-body`) only for a specific admitted record the task
   actually needs, and only when asked — one at a time, within budget.
4. Never bulk-load work items or knowledge bodies "just in case", and never let
   this Skill or its wizard place that data into context preemptively.

This mirrors — and is meant to demonstrate — the Workflow's own P6 discipline:
metadata-first selection, explicit body reads, budgeted retrieval. A guided
Skill that followed the opposite pattern (injecting bulk context every turn) is
exactly what this project is designed not to do.
