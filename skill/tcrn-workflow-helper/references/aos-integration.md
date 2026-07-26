# AOS integration (when a cockpit reads these chains)

TCRN AOS is a separate product that reads Workflow's chains and puts a operations
cockpit over them: work items across every partition, an operator inbox, boards,
deliberation threads reassembled into readable arguments. Workflow does not
require it and never depends on it — the engine is silent between queries by
design, and AOS is one thing that can choose to speak.

This reference exists because two situations come up during setup and both have a
wrong default. Read it only when one of them is true.

## Situation A — AOS is already deployed on this machine

**How to tell, without asking the user to know:** a cockpit service answers on
loopback with a health receipt naming itself.

```
curl -s http://127.0.0.1:4318/api/health
```

A JSON body with `"service": "tcrn-aos-cockpit"` means it is running; anything
else means it is not, and *not running is the ordinary case*. Do not ask the user
whether they have AOS — most people setting up Workflow do not, and the question
implies a dependency that does not exist.

**What changes if it is running:** nothing about how Workflow is installed, and
one thing about what you say at the end. The cockpit reads the chains through the
engine's own read verbs; it holds no privileged position and creates no coupling.
So step 9 of the first-run wizard ("Ready to use") gains one sentence: the
Workspace they just created will appear in the cockpit after its next projection
refresh, and the cockpit is a reader — the chain remains the record.

**What must not change:**

- Never place a Workspace inside AOS's directories, or AOS's database inside a
  Workspace. They are separate stores with opposite properties: a chain is
  append-only and permanent, a projection is disposable and rebuilt on demand.
- Never let AOS's presence relax a Workflow check. It is a consumer, not an
  authority, and nothing it reports can substitute for a receipt from the engine.
- Never suggest editing chain records through the cockpit as a shortcut. It can
  ask the engine to move a work item, and the engine judges the move exactly as
  it would from the CLI — the refusal codes are the same because the path is.

## Situation B — the user has been working locally and now wants AOS

This is a migration question in the user's mind and *not* a migration in fact,
and saying so is most of the help.

**The chains do not move.** AOS reads a Workspace where it already sits. There is
no export, no import, no conversion, and no moment where governance data exists in
two forms. If a conversation is heading toward "migrate my Workflow data into
AOS", stop it there: nothing is migrated, because AOS never holds the record.

**What genuinely changes** is worth stating plainly, because two of the three are
new obligations:

1. **A second store appears, and it is precious.** The cockpit keeps its own
   annotations — assignee, labels, comments, free relations — that no chain
   holds. That data cannot be rebuilt from anything. The Workspace backup floor
   set in step 7 does not cover it; AOS carries its own export, and the user
   should know they now have two things to back up rather than one.
2. **A read becomes cheap enough to be habitual.** Before a cockpit, answering
   "what is waiting on me across four projects" meant running several list verbs
   and reading receipts. Afterwards it is a screen. This is the actual benefit;
   it is worth naming so the user knows what they gained.
3. **Nothing becomes automatic.** The engine still does not schedule, notify, or
   act. A cockpit that shows an owner-intent gate has not cleared it.

**The one thing to check before recommending it:** AOS needs the pinned release's
read surface. `work-list` must return `externalKey`, and `conference-position-list`
and `conference-minutes-list` must exist. Ask the engine rather than the version
string:

```
tcrn-workflow commands
```

If those verbs are absent, the deployed Workflow predates them; the cockpit will
still run but cannot name records on any chain too large for `export`, and it
will show deliberations without their positions. Say that plainly rather than
letting the user discover a half-populated screen and conclude the cockpit is
broken.

## What to say when the user asks "should I use AOS?"

Answer from their situation, not from enthusiasm:

- **One project, one person, occasional governance** — no. The CLI and the
  on-demand queries in `on-demand-context.md` cover it, and a second system to
  keep running is a real cost against a small benefit.
- **Several partitions, or work that regularly spans them** — probably. The
  cross-partition views are the thing the CLI genuinely cannot give in one look.
- **Anyone who needs to see governance state without a terminal** — yes, with the
  read-only mirror rather than the write surface.

## Boundaries this helper will not cross

- This helper does not install, configure, start, or stop AOS. It reads a health
  endpoint and explains; deploying a separate product is that product's business.
- Nothing here is authority. If a step in the first-run wizard fails closed, an
  AOS deployment does not make it pass, and no sentence in this file may be used
  to continue past it.
