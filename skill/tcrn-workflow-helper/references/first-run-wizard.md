# First-Run Wizard (guided setup for non-technical users)

The agent follows this flow ONLY when the user asks to set up / install / deploy
TCRN Workflow. It reuses the `settings-elicitation.md` pattern: observe →
recommend-with-data → show-diff → explicit-confirm → receipt. Every network or
mutating step needs the user's explicit approval. No path or flag is ever typed
by the user — the agent uses the managed defaults below.

## Trust-root ordering (read this first — it is the whole point)

**The prose in this Skill copy has no authority until an independently obtained
trusted bootstrap has vouched for it.** A Skill placed into a live skills folder
(e.g. `~/.claude/skills`) is loaded into the agent's context automatically; a
tampered or look-alike copy could simply rewrite these steps. Therefore:

- **Step 0 (root of trust).** The user obtains `trusted-bootstrap.mjs` through the
  documented repo-independent channel and verifies it against the out-of-band
  runtime digest (see `trust-contract.md` → out-of-band trust anchor). This
  independently verified runtime — never this copied text — is the root of trust.
- **Step 1 (enforced precondition).** Run the verified runtime's
  `verify-installed-copy` against this on-disk Skill directory. On success it
  records the verified archive digest in machine state and writes a
  machine-checkable **marker**, both into the managed state root (a state or
  marker path inside a `.claude`/`.codex` directory fails closed). The agent MUST
  observe that marker before honoring any later step, and MUST re-run
  `verify-installed-copy` each session — the marker is unsigned and not
  tamper-evident, so it is only evidence of a run the agent itself just made. If
  the marker is absent or `verify-installed-copy` fails closed, stop and explain (see
  `reason-codes.md`); do not proceed on the strength of this prose alone.

## Managed defaults (so the user never types a path)

- State root: `~/.tcrn-workflow/` (holds fetched release assets, the Workflow
  clone, `state.json`, and any Workspace the user does not tie to a project —
  the recommended shape is one Workspace **per project**, placed with that
  project; see step 6). **Never** placed inside a skills/live directory.
- The agent creates the state root on first run and uses it for every `--state`,
  `--archive`, `--test-root`, and clone destination.

### Registry distribution path (when the user asks for registry installation)

Use the standard `skills` installer for placement; the helper's lifecycle
commands remain test-root-only. Once the Owner has authorized a public source,
the copy-oriented command is:

```sh
npx skills add tpmoonchefryan/tcrn-workflow-helper \
  --skill tcrn-workflow-helper \
  --global --agent claude-code --agent codex --copy --yes
```

The installer only places files. Independently verify the bootstrap, then run
`verify-installed-copy` against each host copy before allowing the copy to guide
the first-run wizard. A symlink is not a valid installed-copy proof. The
platform's disposable matrix uses `<scratch>/.claude/skills/` and
`<scratch>/.agents/skills/`; those shapes are test evidence, not live-host
activation. See `docs/skills-registry.md` for the release/publication boundary.

## Steps

1. **Root of trust + marker** — Steps 0 and 1 above. Explain in plain language
   what "verified the installed copy" means before continuing.
2. **Fetch the pinned assets** — with the user's approval for the network step,
   download the exact release assets for the pinned Workflow release (archive and
   provenance) from the GitHub release into the state root. The accepted digests
   for both are compiled into the verified runtime and anchored by its
   out-of-band published SHA-256.
3. **Validate** — run `validate`; narrate the `TRUST_VALIDATED` receipt: "This
   confirms the bytes you downloaded are exactly the bytes this verified
   bootstrap accepts — nothing else is accepted."
4. **Obtain a clean Workflow checkout** — with the user's approval for the
   network step, `git clone` the pinned Workflow release **at its tag** into the
   state root, then run `resolve` to confirm the checkout's remote and identity.
   Explain any `ROOT_*` stop plainly. (The helper does not perform the clone
   itself in this candidate; it verifies the result.)
5. **Install the pinned toolchain and build** — a fresh checkout runs nothing:
   the CLI imports from `dist/build/`, so this step is not optional. Confirm
   Node `24.16.0` and pnpm `11.3.0`, then — with the user's approval for the
   dependency fetch — run `pnpm install --frozen-lockfile --ignore-scripts`
   and `pnpm build` in the checkout. Tell the user plainly: dependency
   lifecycle scripts stay disabled, so installing executes no third-party
   code. Offer `pnpm verify:p1` afterwards — twenty offline gates re-proving
   the checkout on their own machine is the best trust demonstration a first
   run can give.
6. **Create the Workspace** — this step is an elicitation, not a default:
   never choose a location the user has not seen as a question.
   **Observe first**: look at the directory the user works in. A single
   project gets a single Workspace placed with it. A platform root — one
   directory containing several sub-projects (each with its own `.git` or
   manifest) — gets the partitioned layout below, and the agent presents
   what it detected as data before recommending anything. **Then ask two
   questions, with options**: what should this Workspace govern (one
   sub-project, or the cross-project work that spans them), and where
   should it live. Only after both answers show the resolved five-root
   layout, and run `init` only after an explicit yes. The agent fills every
   path; the user types nothing — but the user chooses.

   The platform layout keeps every chain in one place, so no sub-project
   repository is ever touched by governance bytes:
   `<platform>/.tcrn-workspace/` holds `release-trust/` (shared across
   partitions), `cross-project/` (decisions and work spanning
   sub-projects), and one `<sub-project>/` partition per project — created
   lazily, on that project's first need, through this step. Each partition
   is an independent single-writer domain: its own chain, its own scale
   budget, its own lease; all may share one framework checkout and the one
   `release-trust/` root. State one consequence before the first `init`:
   partition names become paths the control tree binds absolutely, and a
   restore targets the original path — a later change of address is a
   recorded relocation ceremony, never a rename — so choose names that
   will not need renaming.

   ### Platform workspace initialization: one plan, one confirmation

   When the observed directory contains multiple repositories, use
   `references/platform-layout.md` as the layout contract. Discovery is
   evidence, not a guess:

   1. Walk upward from the directory the user opened and look for an existing
      `.tcrn-workspace/` marker. Also inspect sibling directories for
      repository markers (`.git` or a project manifest) so the proposed
      partitions are visible before any write.
   2. If the opened path is inside a Git repository, do not put the platform
      container in that repository. Explain that governance bytes must stay
      out of product history, propose the repository's parent as the platform
      root, and stop if that proposal is not accepted. A single-repository user
      still gets a platform container at the chosen parent; "only one
      repository" is not a reason to put `.tcrn-workspace/` inside the
      repository.
   3. Show the complete proposed tree before initialization: partition names
      and derived key prefixes, all five engine roots, the shared
      `release-trust` root, each partition's `attestations/` destination,
      settings initial values, the `AGENTS.md` seed, and the host-wiring steps
      for Claude Code and Codex.
   4. Ask for one explicit yes covering this whole displayed batch. Do not
      split the confirmation into hidden follow-up writes. After yes, execute
      the existing public engine and adapter verbs in order, retaining every
      receipt and readback; a refusal stops that step and does not get papered
      over by a file copy.

   The preview must call out the two one-way consequences in plain language:
   enabling attestations is irreversible (there is no disable path), and a
   partition's derived key prefix is permanent for that partition's records. A
   future path change is a relocation ceremony, not a directory rename.

   The settings part of the preview is live rather than hard-coded. Read
   `settings-catalog`, show each current/default value, and show the exact
   proposed before/after for `backup.cadence`, `backup.destination`,
   `driver.capabilityProfile`, and `engine.requiredVersion` when those choices
   are in scope. The catalog's default is information, not permission to write;
   no setting changes occur until the single batch confirmation.

   The host-wiring rule has one standing exception, and it is stated here rather than
discovered: **the stop-pact `Stop` hook is registered by hand.** The adapter family
cannot write user-level configuration — both of its layers refuse that scope — so no
adapter verb can place or restore that hook. An agent that removes it (or a machine
rebuilt from scratch) has no supported route back, and the honest instruction is to
write it into the project's own settings and say so, not to pretend a verb did it.
Every other part of host wiring goes through the adapter/MCP verbs as described.

The `AGENTS.md` seed is the operating-contract teaching template: it points
   to the prose → settings → template → engine route, names the platform
   boundary, and leaves authority-bearing decisions to the governed chain. It is
   ordinary prose, not a control-tree file. The host-wiring step likewise uses
   the existing adapter/MCP installation and activation verbs with the host's
   own approval surface; it must not hand-edit `~/.claude/settings.json`, Codex
   configuration, or hooks as a shortcut. Installation, host approval, and a
   real host trigger remain separate evidence claims.

   Before the knowledge store's first initialization, explain
   `KNOWLEDGE_DISPOSABLE_ACK_REQUIRED` in one line — the store is a derived
   index, never the source of record, and saying so is required per
   invocation — so the user's first encounter is an explanation, not a
   refusal. Add the one concurrency sentence: one writer per Workspace;
   parallelism means more Workspaces, not more writers. Never place a
   Workspace inside a skill or live directory.
7. **Set the backup floor** — the moment after initialization, while the
   Workspace is still empty, is the cheapest time to set backups up. Walk
   `backup-elicitation.md`: record a snapshot baseline, elicit
   `backup.destination`, `backup.cadence` (cadence is advisory — there is
   no scheduler; the agent proposes, the user decides), and the backup
   runbook's prose-only retention count (rotation deletes oldest-first, runs
   only after a new snapshot verifies, and always names what it deleted), and state the restore
   boundary before it matters: a restore targets the original path, and the
   control tree restores whole or not at all. Do not say a workspace can
   never move — the pinned release has a governed route for that, and it is a
   separate ceremony rather than a restore performed elsewhere.
8. **Declare the driver capability profile** — ask once, in plain language: is the
   agent driving this deployment a current top-tier model, or a smaller/older one?
   Record the answer as `driver.capabilityProfile` (`frontier` or `standard`) per
   `driver-capability-profile.md`. Ask it here rather than inferring it: a model's
   own judgement about its own tier is exactly the wrong source, and an unknown
   answer resolves to `standard` because strictness is the safe direction when
   capability is unknown. Say what it does and does not change — it shapes how this
   guidance is phrased, and it never varies an authority boundary, an audit
   requirement, or any engine limit.
9. **Ready to use** — tell the user Workflow is verified and where it lives.
   To work with tasks/knowledge, teach on-demand queries per
   `on-demand-context.md`; **never** pull work-item or knowledge bodies into the
   conversation preemptively.

   Before saying that, check once — silently — whether a cockpit is already
   running on this machine: a loopback health receipt naming
   `tcrn-aos-cockpit` (see `aos-integration.md`, which also states why
   silence from that probe is not evidence about any other host). If one
   answers, add one sentence about where this Workspace will show up and
   that the cockpit reads rather than records. If nothing answers, say
   nothing about it: not running is the
   ordinary case, and asking whether the user has AOS implies a dependency
   Workflow does not have.

## After setup — expectations to state plainly

- **No automatic session context by default.** The pinned release ships
  reversible project-local activation for both hosts, but it stays inert until
  its exact definitions, pins, and grant are separately authorized (and Codex
  also requires host approval). If activated, its one fail-open SessionStart
  summary is persona-free; installation alone never claims host activation.
- **Upgrades.** A new release means a new independently published bootstrap
  digest: verify the new anchor, re-verify the placed copy, check out the new
  tag. A framework upgrade never touches Workspace bytes.
- **Leaving.** Removal is symmetric: delete the placed Skill copy and the
  state root. Workspaces are the user's data and are never deleted by any
  helper or Workflow step.
- **The envelope.** Partition per project, one writer per Workspace, and a
  chain that slows perceptibly in the low thousands of events — the Workflow
  README's Known limits section carries the numbers.

## If the user asks about AOS

Two questions come up and both have a wrong default. "I already have AOS running"
and "I have been working locally and now want AOS" are answered in
`aos-integration.md` — read it then rather than improvising. The short form of
both: chains never move, AOS never holds the record, and its arrival adds a
second store that is precious in a way a projection is not.

## Rules the agent must not break

- Never weaken a check to "get past" a fail-closed stop (see `reason-codes.md`).
- Never write to a user-level `~/.claude/settings.json` or install into a live
  host Skill location through the helper's own mutating commands — those remain
  test-root-only. Distribution of this Skill into a skills folder is done by the
  standard installer, and the helper only **verifies** that copy read-only.
- Never place the clone, Workspace, or `state.json` inside a skill or live dir.
