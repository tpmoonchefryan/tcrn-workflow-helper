# On-demand context (the Skill teaches querying — it never carries data)

This is the boundary the whole design protects: **the Skill must never inject
work items, knowledge records, or workspace data into the agent's context.** It
does not carry that data, and the wizard must not pre-load it. Instead, when the
agent needs a work item or a knowledge record, it fetches **only the
prompt-relevant piece, on demand**, using the Workflow's own governed query
commands — which are metadata-first and budgeted by construction.

## These are Workflow (product) read commands, run through the engine's CLI — not helper commands

The helper (this Skill's trust boundary) exposes only trust/lifecycle verbs
(`validate`, `verify-installed-copy`, `resolve`, `plan-network`,
`install`/`update`/`reinstall`/`uninstall`). It has **no** work/knowledge query
command, on purpose — that keeps the verifier and the product in separate trust
domains. The commands below belong to the installed **TCRN Workflow** engine and
are invoked through the installed engine's **CLI**, each naming the workspace it
reads.

Where the chains are hosted by an AOS cockpit rather than sitting on the
operator's machine, the same reads are forwarded through **AOS's** read face
(`tcrn-workflow-aos-read`, tools prefixed `tcrn_remote_read_`), each naming a
**partition** so the workspace path comes from the topology and never from the
caller. That face belongs to AOS, not to the engine: `v0.11.18` retires the
engine's own MCP transport, so a deployment with no cockpit has no MCP in this
path at all. On either route, SSH direct is break-glass only (see the platform
root `CLAUDE.md`).

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
out-of-band authority the shipped CLI cannot accept, so a well-formed shell
invocation stops at `CONTEXT_AUTHORITY_REQUIRED` ("Out-of-band context authority
is required"). Getting that far takes the right flags — `--request`,
`--profile-receipt`, `--authority` — and this document used to describe a
`--workspace` invocation, which never reaches the authority check at all: it
refuses at `CLI_ARGUMENT_UNKNOWN`. The distinction matters because one refusal
means "correct call, missing authority" and the other means "this call was never
valid". Selection and reading (steps 1, 3 and 4 below) are unaffected. Until the
authority-supply program lands, the budget discipline is carried by the per-verb
windows and by this document — apply the same freshness and budget restraint
yourself, and never treat the router's refusal as a check to work around.

## The metadata-first query commands to teach

Every command below is a verb of the installed **TCRN Workflow** engine, run through
its CLI against a workspace path. Ask the engine's own `commands` catalog if you want
to confirm any of them; that output, not this document, is the authority on what
exists.

- `knowledge-list` — lists knowledge records by metadata (never opens bodies). The
  starting point for enumerating what exists in scope. Note the `--selection` window:
  the default shows promoted records only, and `--selection all` includes candidates.
  A store holding twenty-six cards answers `total: 22` under the default, which reads
  like a smaller library rather than a filtered view of the same one.
- `knowledge-candidates` — the relevance-selection verb: given `--search`, `--tag`,
  `--category`, `--role-scope` or `--project-id` it returns a **candidate set** by
  metadata, still bodies-closed. This is where "what is relevant to this prompt" is
  decided, and it is the step the whole pre-conversation retrieval rests on.
- `context-route` — the P6 router/enforcer: given a candidate set you built, it
  enforces **freshness / budget / authority** and returns admitted metadata-first
  references. No relevance selection; no bodies.
- `knowledge-snippet` — returns a bounded snippet, not a full body.
- `knowledge-body` — returns a single record's body **only when explicitly
  requested** for that one record.
- `knowledge-freshness` — checks freshness metadata.

Where the chains are hosted by an AOS cockpit rather than sitting on the operator's
machine, the same reads are forwarded through **AOS's** read face, whose tools are
prefixed `tcrn_remote_read_` and take a `partition` instead of a workspace path. That
face belongs to AOS. A deployment without a cockpit — which is every single-operator
installation — has no such tool, and this document named those tools as the pipeline
until 2026-08-19, when checking them against the pinned engine's catalog found all
five absent (`TCRN-CROSS-INC-226`). Read the AOS names as the cockpit variant of each
CLI verb above, never as the thing to reach for first.

## Two refusals that stop this pipeline dead, and what they actually are

**The store trails the chain, so reads refuse.** The knowledge store's marker must
match the chain head, and *any* chain event moves that head. One `work-create` was
measured taking all six of this platform's partitions dark, which is why the audited
week showed context injections and no knowledge citations at all: a session that
wrote anything could not read the store afterwards, and loaded files instead. Pass
`--allow-trailing true` on any of the five read verbs to be answered anyway. The
answer then carries `knowledgeStoreTrailing`, `storeHighWaterDigest` and
`chainHeadEventHash`, so how stale it is comes back with it. Writes are not exempt
and neither is `validate`: filing a card still requires `knowledge-rebase` first.

**`--expected-version` means something different here.** On the knowledge verbs it is
the *knowledge store's* version, not the chain version the same flag names on every
other verb. Passing the chain version returns `KNOWLEDGE_CAS_MISMATCH` with both
numbers — `4295:160` means you supplied 4295 and it wanted 160 — which is the only
reason the mistake is recoverable. Nothing in the catalog distinguishes the two
meanings, so read the refusal rather than guessing a second time.

## The rule for the agent (the pipeline order matters)

1. Enumerate with `knowledge-list`, then narrow to relevant candidates with
   `knowledge-candidates` — this is the only step that decides relevance, and it
   stays metadata-first (no bodies). In a workspace being worked in, expect to pass
   `--allow-trailing true`; that is the normal state, not an anomaly.
2. Construct a `context-route` request from that candidate set; let the router
   enforce freshness, budget, and authority. Treat what it admits as the governed
   working set — it filtered on policy, not on relevance. From a shell this step
   stops at `CONTEXT_AUTHORITY_REQUIRED` **only once it has a well-formed request**:
   the verb takes `--request`, `--profile-receipt` and `--authority`, and an
   invocation naming `--workspace` refuses at `CLI_ARGUMENT_UNKNOWN` long before any
   authority check runs. Until the authority-supply program lands, keep the candidate
   set metadata-first, apply the freshness and budget restraint yourself, and
   continue with step 3.
3. Read a body (`knowledge-body`) only for a specific admitted record the task
   actually needs, and only when asked — one at a time, within budget.
4. Never bulk-load work items or knowledge bodies "just in case", and never let this
   Skill or its wizard place that data into context preemptively.

This mirrors — and is meant to demonstrate — the Workflow's own P6 discipline:
metadata-first selection, explicit body reads, budgeted retrieval. A guided Skill that
followed the opposite pattern (injecting bulk context every turn) is exactly what this
project is designed not to do. The failure mode to watch for is subtler than bulk
injection, though, and this repository produced it: when the pull path refuses, an
agent does not stop — it reads files instead, and the result looks like diligence.
