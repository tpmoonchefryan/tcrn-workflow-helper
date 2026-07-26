# Driver capability profile (`driver.capabilityProfile`)

Guidance in this Skill is written for a driving agent that can judge — "notice the
gap and offer to record it", "pick the instrument that fits the question". That
assumption is stated plainly in the pinned release's README under *Driver
assumptions*, and it is honest but incomplete: it names the dependency without
letting a deployment declare which side of it that deployment is on.

This setting is that declaration. It exists so a deployment running a less capable
driver gets guidance shaped for it, instead of guidance written for a stronger one
and silently under-executed.

## The two profiles

- **`frontier`** (default) — the driver is a current top-tier model. Guidance may be
  stated as principles and judgement calls: *when* to deliberate, *whether* an
  instrument fits, *what* a situation warrants.
- **`standard`** — the driver is a smaller or older model, or an unknown one.
  Guidance for this tier is **fewer, simpler, harder** steps: fixed checkpoints at
  named moments, closed enumerations instead of open judgement, and a refusal in
  place of an inference.

The second profile is the one that is easy to get wrong, so state its design rule
before anything else:

> **`standard` is not `frontier` plus more rules, and it is not an older stricter
> version kept frozen.** More rules do not help a weaker driver — they compete for
> the same attention that is already the scarce resource, and a longer instruction
> set is followed *less* faithfully, not more. Designing for `standard` usually
> means **re-deriving** the constraint as a deterministic step, not preserving an
> earlier text.

Concretely, the same intent takes two forms:

| Intent | `frontier` | `standard` |
| --- | --- | --- |
| Deliberate before a contested decision | Judge from the decision classes when a conference is warranted | Open a conference whenever work fans out to two or more agents on one question — no judgement |
| Use the right instrument | Pick what is authoritative and cheapest, know its blind spots | Run the index's `status` at session start; if fresh, prefer the index for structural questions; if not, refresh or use grep |
| Record what has consequences | Notice the gap and offer once | At each named moment (decision made, work completed, defect deferred), offer the matching verb |

## Three boundaries this setting must not cross

1. **It modulates capability-compensating constraints only.** Constraints that
   preserve a human's right to decide (a publish authorization, an
   `owner_intent_required` gate) and constraints that keep a long chain externally
   auditable (the event chain, evidence binding, actor attestation) are **identical
   in every profile**. A profile that could relax either would be a privilege
   escalation switch wearing a configuration label. If a proposed profile-sensitive
   behaviour touches authority or auditability, the answer is no.
2. **The user declares it; the agent never infers it.** Self-assessment is three
   distinct escape hatches at once: a model can be wrong about its own identity; a
   model under task pressure has an incentive to choose the looser path; and
   observed content can simply *tell* the agent it is a frontier model. So the value
   comes from the user — in the first-run wizard, or later through the settings
   elicitation flow — and never from the agent's own judgement about itself. Where
   the host reports a model identity, use it to **cross-check** the declared value
   and raise a discrepancy; never to set it.
   **Unknown resolves to `standard`.** Strictness is the safe direction when
   capability is unknown, which is the opposite of what an agent inferring its own
   tier would choose.
3. **One payload, one small registry — not a forked Skill.** There is exactly one
   set of Skill documents. Profile-sensitive points are few, named, and listed in
   the registry below; everything else reads identically in both profiles.
   Maintaining two prose tracks is how translations drift, and a forked Skill would
   drift the same way with none of the review that catches it.

## What is explicitly *not* in this setting

- **Engine constants.** Byte budgets, transition tables, canonical forms and every
  other engine-enforced limit stay outside this setting. They participate in chain
  replay: a workspace whose limits varied by a local preference would not replay
  identically elsewhere, which is the one property the chain exists to provide.
  Changing such a limit is a versioned engine change with its own compatibility
  story, never a profile.
- **Anything the user has not been asked about.** Absent an explicit declaration the
  value is `frontier` by default *for guidance shaping only*; it never silently
  loosens a boundary listed above, because those do not vary at all.

## The profile-sensitive registry

Every point whose text or behaviour varies by profile is listed here, with the
evidence that justifies it. A point not in this list does not vary.

| Point | What varies | Evidence for the split |
| --- | --- | --- |
| Deliberation Triggers (SKILL.md) | `standard` uses the deterministic fan-out trigger only; `frontier` also judges the decision classes | The Skill already concedes prose-signal triggering is unreliable-by-design and scales with driver capability |
| Recording Triggers (SKILL.md) | `standard` offers at named moments; `frontier` judges the moment | Same concession, same section |
| Instrument selection (`workflow-operations.md`) | `standard` gets a fixed session-start freshness step; `frontier` gets the principle | A stale index answered structural questions for five consecutive Initiatives without anyone noticing |

Adding a row is a payload change like any other: it needs its own evidence, and it
rides the next candidate batch (`RELEASING.md`, step 0).

## Eliciting and changing it

First-run: the wizard asks once, in plain language, and records the answer. Later
changes go through `settings-elicitation.md` unchanged — observe, recommend with
cited evidence, show the exact diff, take a fresh explicit confirmation, record the
receipt. Like `backup.*` it is a Tier-2 conversational preference: the agent
proposes, the user decides, and the agent never edits it on its own initiative.

One honest limit: a declared profile is a **statement of intent, not an enforcement
mechanism**. Nothing verifies that the model reading this document is the tier the
user named. What the setting buys is that guidance can be *shaped* deliberately
rather than assumed — the same kind of claim `--actor` makes about attribution, and
bounded the same way.
