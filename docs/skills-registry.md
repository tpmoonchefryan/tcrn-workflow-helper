# Skills registry publication and installation handoff

This document records the publication boundary for
`tcrn-workflow-helper`. It is a handoff, not a publication receipt.

## Registry contract used by this repository

The public Skills catalog is source-oriented: a user installs a skill from a
GitHub/source URL with the `skills` CLI, and the skill is discovered from its
`SKILL.md`. The repository's publication shape is therefore:

- `skill/tcrn-workflow-helper/SKILL.md` is the skill root and carries the
  required `name` and `description` frontmatter;
- `skill/tcrn-workflow-helper/agents/openai.yaml` carries the existing host
  metadata for the multi-agent wrapper; and
- `skill/tcrn-workflow-helper/references/` contains the guidance payload,
  including `first-run-wizard.md` and `platform-layout.md`.

There is no invented local registry manifest or private upload endpoint. The
source repository and a public release are the publication configuration. The
release runbook remains the authority for archive/provenance re-pinning and
anchor publication.

The public references consulted for this handoff are:

- [Skills documentation](https://www.skills.sh/docs) — source-oriented install
  and catalog model;
- [Skills CLI reference](https://www.skills.sh/docs/cli) — `skills add`,
  `--global`, `--agent`, `--copy`, and `--yes`; and
- [the open `skills` CLI repository](https://github.com/vercel-labs/skills) —
  supported source formats and host mappings.

## Standard installer path

After the Owner authorizes a public release and the registry can resolve that
release's source, the user-facing command is:

```sh
npx skills add <owner>/<repository> \
  --skill tcrn-workflow-helper \
  --global --agent claude-code --agent codex --copy --yes
```

`--copy` is deliberate. The bootstrap verifies an ordinary installed directory
read-only; a symlinked skill root is not a valid installed-copy proof. The
standard installer places files; it does not become the trust root. The user
must independently obtain and verify `trusted-bootstrap.mjs`, then run
`verify-installed-copy` against each placed host copy with the accepted
provenance and state paths.

The platform's scratch matrix uses these two host-shaped targets:

```text
<scratch-host>/.claude/skills/tcrn-workflow-helper/
<scratch-host>/.agents/skills/tcrn-workflow-helper/
```

The second path is the Codex host shape used by this platform's rehearsal. The
actual host CLI mapping is always read from the installed `skills` CLI and the
host's own documentation; a scratch path is not evidence of a live host.

## Trust and matrix order

The matrix order is fixed:

1. materialize the accepted candidate payload as an ordinary directory under
   each scratch host shape;
2. run `verify-installed-copy` against the real bootstrap/provenance/state
   trust root and retain `INSTALLED_COPY_VALIDATED` for both copies;
3. change one byte in the second copy and repeat the read-only verification;
   the expected red leg is `IDENTITY_MISMATCH`; and
4. remove the scratch directories and leave live host locations untouched.

When a payload edit is ahead of the accepted candidate archive, the green
matrix applies to the accepted candidate bytes. The edited source tree is
expected to fail against the old compiled archive until the release train
rebuilds and re-pins it; that failure is not permission to weaken the bootstrap
or to self-publish a replacement digest.

## Publication boundary

Registry indexing, a public remote, candidate re-pinning, and release notes are
external publication actions. They are not performed by this handoff. The
remaining state is explicitly:

```text
未证——归 skills 注册表实际发布/Owner
```

Once authorized, the release operator follows `RELEASING.md`, runs the full
release gates after the payload batch is re-pinned, and records the public
source URL and resulting registry readback separately from local matrix proof.
