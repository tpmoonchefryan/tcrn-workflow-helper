# Installation-surface wizard

This document is the language and intent contract for TCRN
Workflow installation and update requests. It is guidance, not an authority
source. The engine, its install manifest, and the host's approval surface
remain authoritative.

## Intent gate

Recognize a request as an installation or update request, but do not start a
command from a similar sentence. Ask one confirmation question in the user's
language first. An explicit yes enters the full wizard; a no, an answer about
a different task, or an ambiguous answer performs no installation work and does
not create a receipt.

The fixed phrases are the source table for this candidate. They are short
enough to be discoverable by a user and are not a permission by themselves.

| language | install | update |
| --- | --- | --- |
| en | Help me install TCRN Workflow | Help me update TCRN Workflow |
| zh-CN | 帮我安装 TCRN Workflow | 帮我更新 TCRN Workflow |
| ja | TCRN Workflow をインストールして | TCRN Workflow を更新して |
| ko | TCRN Workflow 설치해 줘 | TCRN Workflow 업데이트해 줘 |
| fr | Aide-moi à installer TCRN Workflow | Aide-moi à mettre à jour TCRN Workflow |

The confirmation questions use the same language and name the operation:
The agent asks the matching-language confirmation before any wizard step.

| language | install confirmation | update confirmation |
| --- | --- | --- |
| en | Do you want to install TCRN Workflow now? I will show the complete install-manifest plan first. | Do you want to update TCRN Workflow now? I will show the complete install-manifest plan first. |
| zh-CN | 你是想现在安装 TCRN Workflow 吗？我会先展示完整的 install-manifest 计划。 | 你是想现在更新 TCRN Workflow 吗？我会先展示完整的 install-manifest 计划。 |
| ja | 今すぐ TCRN Workflow をインストールしますか？先に install-manifest の全計画を表示します。 | 今すぐ TCRN Workflow を更新しますか？先に install-manifest の全計画を表示します。 |
| ko | 지금 TCRN Workflow를 설치할까요? 먼저 전체 install-manifest 계획을 보여 드립니다. | 지금 TCRN Workflow를 업데이트할까요? 먼저 전체 install-manifest 계획을 보여 드립니다. |
| fr | Voulez-vous installer TCRN Workflow maintenant ? Je montrerai d’abord le plan complet de l’install-manifest. | Voulez-vous mettre à jour TCRN Workflow maintenant ? Je montrerai d’abord le plan complet de l’install-manifest. |

Similar requests are intent signals, not commands. Each language has at least
two examples that must receive the matching-language question above:

| language | similar request examples |
| --- | --- |
| en | install the workflow；can you set up TCRN Workflow |
| zh-CN | 帮我安装 workflow；升级 workflow |
| ja | workflow をインストールして；TCRN Workflow を更新して |
| ko | workflow 설치해 줘；TCRN Workflow 업그레이드해 줘 |
| fr | installe le workflow；peux-tu mettre à jour TCRN Workflow |

Do not silently translate a similar request to English, infer approval from
the presence of the word install or update, or execute a host command before
the question is answered.

## Engine capability preflight

After the matching-language confirmation and trust check, but before reading
`install-manifest`, query the exact engine copy for its version and advertised
read-only capabilities. The installation-surface wizard requires Workflow
`v0.11.16` or newer and the `install-manifest` capability. This is a
version/capability preflight, not a guessed command probe.

If the engine reports an older version, omits `install-manifest`, or returns
`CLI_COMMAND_UNKNOWN` for the capability query, stop before invoking
`install-manifest`. (`CLI_COMMAND_UNKNOWN` is the engine's actual code for an
unrecognised verb — earlier copies of this document said `CLI_UNKNOWN`, which no
release has ever emitted, so an agent branching on it waited for a code that
could not arrive. That is exactly the false green the preflight exists to
prevent.) Report `ENGINE_CAPABILITY_PREFLIGHT_REQUIRED` — a helper-side label,
not an engine code — show the
observed version/capability result, and tell the operator that a
Workflow release newer than the one this candidate pins, and any helper re-pin
onto it, are not authorized by this candidate. Do not continue with a partial plan, do not write a receipt, and do
not treat the preflight stop as host approval or Owner acceptance.

## Full wizard

After the user answers yes, run the following complete flow. Keep the
install/update operation selected by the confirmed language phrase; do not
change it because a later prompt happens to contain another verb.

1. Read references/trust-contract.md and verify the independently supplied
   bootstrap before allowing this Skill to guide anything. Confirm the pinned
   Workflow identity and the helper copy with verify-installed-copy.
2. Discover the actual platform root and existing .tcrn-workspace marker.
   Show the complete plan before writing: platform container, every project,
   the two host adapters, machine/user guidance, the shared trust root, and
   every partition attestation destination. A platform root is an input, never
   a constant embedded in the doctor or the language table.
3. Read the engine's install-manifest surface. Present each item's layer,
   host, path template, writer, and acceptance probe. The project map must keep
   the exact lower-case directory name joi-button; display labels do not
   authorize a casing change.
4. Ask for one confirmation covering the displayed batch. On a no or an
   ambiguous reply, stop with no write. On yes, retain the operation phrase,
   the plan, and the user's language in the local acceptance packet.
5. For container items, use the canonical engine adapter commands and their read
   APIs. Materialize both Claude and Codex adapters for every listed root, even
   when only one host is currently open. Never hand-write an adapter bundle or a
   settings fragment. Project items are **not** materialized: since Workflow
   `v0.11.17` the harness is built at the container root and nowhere else, and
   the manifest's remaining project entries are `host-self` — a repository that
   commits its own file. Declared so a doctor leg can tell an accounted-for
   directory from a stray, never so the helper writes into a project root.
6. For machine and user items, present precise host-owned commands and explain
   their scope. The helper does not impersonate host approval and does not
   claim that a receipt proves activation or a real trigger. Any user-level
   write must be separately authorized by the platform handover.
7. After each write, read the canonical receipt back and run the platform
   doctor with its required --platform-root argument. The doctor must consume
   the same install manifest and must use synthetic temporary fixtures for its
   red-leg tests; CI tests must never depend on a personal machine directory.
8. Separate the evidence levels in the final report: engine materialization,
   host configuration, host approval, real runtime trigger, Owner acceptance,
   and outward publication. Record unresolved configuration differences as
   notes for the Owner instead of choosing for them.

For update requests, repeat the identity check, compare the current engine
version with both host helper copies, preserve the existing plan's boundaries,
and rerun the complete receipt and doctor readback. A version match is not
host approval, and a green test suite is not an acceptance transition.

## Boundaries

This wizard does not write a control tree, change a Workspace address, or
publish a release. It teaches a governed installation surface and keeps
machine paths in the host-side packet; public prose carries only placeholders
and stable project names.
