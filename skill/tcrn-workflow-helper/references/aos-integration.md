# AOS integration (when a cockpit reads these chains)

TCRN AOS is a separate product that reads Workflow's chains and puts an operations
cockpit over them: work items across every partition, an operator inbox, boards,
deliberation threads reassembled into readable arguments. Workflow does not
require it and never depends on it — the engine is silent between queries by
design, and AOS is one thing that can choose to speak.

This reference exists because a few situations come up during setup and each has a
wrong default: a cockpit already running here, a user moving from local-only
Workflow to a cockpit, and — once a chain lives on the cockpit's own host — the two
interfaces onto it. Read it only when one of them is true.

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

**One caveat this probe did not need when it was written.** Loopback answers only
for a cockpit on *this* machine. A cockpit serving a chain that lives on another
host binds loopback *there*, so the same probe run on the operator's machine
correctly reports nothing while a cockpit is running — unless a port is forwarded
from that host, in which case the probe answers through the tunnel and the receipt
describes the remote cockpit rather than a local one. Silence therefore means "no
cockpit reachable from here", never "no cockpit exists"; do not convert it into a
claim about the other host.

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

Most of the help here is still "this is not the migration you are imagining".
But the flat form of that sentence was wrong, and the correction is worth more
than the original claim was.

### The doctrine this file used to state, and its correction

**What stood here:** *the chains do not move; nothing is migrated, because AOS
never holds the record.*

**Why that was right when it was written.** At the releases it was written
against, the engine bound five absolute roots and shipped no verb that could
rebind them. A byte-identical copy of a control tree at any other path was
refused by every read verb, so an operator who had to move a workspace had
exactly one option — hand-editing `roots` — which nothing recorded and no
runbook could honestly recommend. "The chains do not move" was an accurate
description of the engine's capability, and the advice built on it (point the
cockpit at the workspace where it already sits) was the right advice.

**What changed.** The pinned release ships a governed relocation family:
`relocation-plan`, `relocation-vacate`, `relocation-adopt`, `relocation-abort`
and `relocation-inspect`. A workspace now has a recorded route to a new path or a
new machine. The old sentence has to be replaced rather than softened:

1. **Chains can move — but only through those verbs, and the engine moves with
   them.** The five absolute roots are not an obstacle to work around; they are
   the reason an unauthorized copy is inert instead of a second live authority.
   There is no supported arrangement in which the chain sits on one host and the
   engine that writes it runs on another.
2. **Relocation moves the BINDING, never the bytes.** No event is rewritten and
   no storage version changes. The operator copies the tree with ordinary OS tools
   between a `vacate` and an `adopt` — the engine deliberately has no copy path —
   and the event stream after a hop is byte-for-byte the stream before it. Nothing
   about a chain's content is a migration; only its address changed.
3. **The mechanism cannot prevent a fork. It can only make one legible.** Before
   promising anything about this family, read the pinned release's
   `docs/adr/0003-workspace-relocation.md`, and read its "four ceilings" section
   rather than a summary of it. The four: it is *authorization, not
   authentication*, so nothing proves who ran the verb; the ledger lives in the
   one control-tree file the event hash chain does not cover and can be deleted,
   so detection is the counterparty's capability and never the engine's; the
   abort-stage permit is a review device rather than a barrier, because whoever
   can mint one permit can mint the others; and a permit is a predicate over the
   bytes presented at a path rather than a token with a spend record, so one adopt
   permit admits the same tree on N hosts and the mandated two-sided compare is
   green at every one of them. Every sentence of the form "relocation prevents X"
   written about this family so far has been false. Do not write the next one.
4. **"AOS never holds the record" is no longer true as stated — and what made it
   untrue is not that AOS started holding records.** A cockpit host can now be the
   machine a chain physically lives on. What holds the chain there is the *engine*,
   in its own control tree, at its own roots; AOS's database remains a disposable
   projection plus its own annotations, exactly as before. So the distinction the
   old sentence was reaching for survives, and should be stated the way it is
   actually true: **the cockpit is never the record, and the host it runs on may
   nevertheless be where the record lives.**

What has *not* changed is the thing users most often ask for: there is still no
export, no import, no conversion, and no moment when governance data exists in two
forms. If a conversation is heading toward "migrate my Workflow data into AOS",
stop it there — that operation does not exist and is not what a relocation is.

**What genuinely changes** is worth stating plainly, because two of the three are
new obligations:

1. **A second store appears, and it is precious.** The cockpit keeps its own
   annotations — assignee, labels, comments, free relations — that no chain
   holds. That data cannot be rebuilt from anything. The Workspace backup floor
   set in step 7 does not cover it; AOS carries its own export, and the user
   should know they now have two things to back up rather than one. If the chain
   was relocated onto the cockpit's own host, both of those things now sit on one
   machine, so a backup taken there is a copy and not an off-site copy — see
   `backup-elicitation.md`, "When the workspace does not live on this machine".
2. **A read becomes cheap enough to be habitual.** Before a cockpit, answering
   "what is waiting on me across four projects" meant running several list verbs
   and reading receipts. Afterwards it is a screen. This is the actual benefit;
   it is worth naming so the user knows what they gained.
3. **Nothing becomes automatic.** The engine still does not schedule, notify, or
   act. A cockpit that shows an owner-intent gate has not cleared it.

**The one thing to check before recommending it:** AOS needs the pinned release's
read surface. `work-list` must return `externalKey`; `conference-position-list`
and `conference-minutes-list` must exist; and `event-list` must exist if the
cockpit is to re-derive a chain at all, because `export` refuses any workspace
whose canonical form exceeds one MiB and that is exactly the size at which a chain
becomes worth reproducing. Ask the engine rather than the version string — and ask
the copy on the host that holds the chain, not whichever copy is nearest:

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
- **Anyone who needs to see governance state without a terminal** — yes, as a
  read-only deployment rather than one with the write surface enabled. Say "a
  deployment with reads only" rather than naming a particular mirror or host: a
  named instance in guidance is an assertion about the world that nobody
  maintains, and the mirrors this file used to name have since been retired.

## The two interfaces, when the chain is on the cockpit's host

Once a chain has been relocated onto the host that runs the cockpit, an operator
working from another machine has two ways in, and confusing them is the expensive
mistake:

| Interface | Runs where | Reached how | Good for |
| --- | --- | --- | --- |
| The cockpit | On the host holding the chain | A browser on the operator's machine, over a forwarded local port | Reading — boards, inbox, cross-partition views |
| A governed session | The engine, on that same host | An authenticated remote shell, one governed verb at a time, receipt read back locally | Recording — every write, every gate, every ceremony |

**These are two interfaces onto one chain, not two copies of the truth.** Both end
at the same event log in the same control tree. The cockpit can display nothing
the governed session did not write, and the governed session needs nothing the
cockpit holds. Choosing between them is choosing by act — reads on the cheap
interface, writes on the ceremony one — and never a choice about which store is
authoritative, because there is only one.

Three things not to do, each of which looks reasonable at the moment it is
proposed:

- **Do not reach for a file tool over the remote shell.** A write into a control
  tree on another host is the same forbidden act as a local editor saving the file:
  `cat >`, `sed -i` and `rsync` all break the canonical byte form, and the chain
  then refuses reads as well as writes. The engine on that host performs the write,
  or it does not happen.
- **Do not let the cockpit's availability stand in for the engine's verdict.** A
  screen that renders is not a receipt. If the ceremony interface refuses, the
  refusal is the answer, and nothing visible in a browser overrides it.
- **Do not check the local machine and report on the remote one.** A probe, a
  freshness check, or a backup that still reads the pre-move local path will keep
  succeeding while measuring nothing at all.

## Boundaries this helper will not cross

- This helper does not install, configure, start, or stop AOS. It reads a health
  endpoint and explains; deploying a separate product is that product's business.
- Nothing here is authority. If a step in the first-run wizard fails closed, an
  AOS deployment does not make it pass, and no sentence in this file may be used
  to continue past it.
