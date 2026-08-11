# Operating contract v1: the readable route and its authorities

This is the short teaching contract for a new harness user. It describes where
to put a question, a preference, a template, or an authority-bearing decision.
The helper is prose and a trust boundary; it never becomes the engine's source
of truth.

## Chapter 1 — AGENTS.md is the single prose pole

Use `AGENTS.md` as the canonical management document at every applicable scope:
platform, repository, and narrower repository directory. Put the broad rule at
the broad scope and the exception at the nearest narrower scope. A repository's
`CLAUDE.md` may be a host-compatibility pointer to `AGENTS.md`, but it must not
become a second copy of the contract. If two scopes disagree, the more specific
applicable scope wins; if a rule must be universal, keep it at the platform
scope and do not restate it in every child file.

`AGENTS.md` is discoverability and operating prose. The engine does not read it,
and prose in it cannot authorize a write, alter a gate, or change a setting. A
reader must route any authority-bearing claim to the engine's public read face
and any mutation to the governed ceremony. This is the single-pole rule: one
prose source per scope, with no parallel `CLAUDE.md` policy body.

## Chapter 2 — Route every question through four layers

Ask which layer owns the answer before editing anything:

1. **Prose** — `AGENTS.md` explains location, vocabulary, and the next read. It
   may remind an operator; it cannot enforce.
2. **Settings** — a value belongs here only when it is in the engine's
   `settings-catalog`. Read the catalog first, show an exact before/after, then
   use the public `settings-set` ceremony with an actor and retain its receipt.
3. **Template** — a document shape belongs in an admitted template. The
   template's bottom carries the engine-owned anchors and closeout requirements;
   its genre carries headings and prose. A binding receipt connects an instance
   to the admitted template version and digest.
4. **Engine** — graph state, permissions, gates, actors, receipts, and event
   history belong to the engine. Read them through CLI/MCP public faces and
   write them only through the ceremony. Never smuggle an engine decision into
   prose, a setting, or a private module import.

The route is a placement rule, not a suggestion to add more files. If a needed
capability is absent from the public surface, record the gap for the Owner; do
not import `tcrn-workflow` internals or make the helper a privileged client.

## Chapter 3 — Templates have two layers; hooks have two zones

The template contract has two layers. The **bottom** is the engine-owned,
kind-independent contract: the four anchors, required closeout elements, and
any binding/receipt fields. The **genre** is admitted data: headings, examples,
and the domain vocabulary for a Story, Incident, or another template. Admission
pins the template digest and version; binding makes the chosen template
observable. The `Credentials 引用` and `Attachments 引用` fields are references
only—never paste a secret, token, password, or authenticated URL into an
instance.

Hooks also have two zones. The **TCRN-managed zone** contains only the exact
fragments installed by the governed adapter and is the only zone the adapter
validates, merges, or removes. The **user-owned zone** may contain arbitrary
hooks and must be preserved byte-for-byte; user hooks are not reported as TCRN
baseline findings. An adapter uninstall removes only its managed fragment. A
stop-pact hook that is not on the managed baseline is an explicitly recorded
independent/Owner-boundary item, not an excuse to write the user zone.

These two two-layer/two-zone rules keep the readable route honest: prose can
explain a contract, templates can carry admitted shape, and hooks can operate
without taking ownership of a user's unrelated configuration.
