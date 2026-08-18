# Contributing

English · [简体中文](./CONTRIBUTING.zh-CN.md) · [日本語](./CONTRIBUTING.ja.md) · [한국어](./CONTRIBUTING.ko.md) · [Français](./CONTRIBUTING.fr.md)

This repository distributes one file a stranger is expected to verify by hand,
and a Skill payload that teaches an agent to drive TCRN Workflow. Almost every
rule below follows from that: the thing being shipped is a claim about bytes, so
a change that makes the claim harder to check is a regression even when it makes
the code nicer.

## Before proposing a change

Run `pnpm test` in full. Not a subset, and not `pnpm verify` in its place — those
answer different questions, and a tagged commit once shipped with 22 of 72 tests
red because `verify` was run instead. `verify` checks that the artifacts match
their digests; it says nothing about whether the pinned identity and the
provenance agree.

Any change touching `bootstrap/trusted-bootstrap.mjs`, `IDENTITY`, an `EXPECTED_*`
constant, or anything under `manifests/` must run the whole suite before it is
committed, and `pnpm push-gate` after — that gate judges the committed tree, so
running it earlier reports your own uncommitted bytes back at you.

## Three rules with no exceptions

**Zero runtime dependencies.** The bootstrap is one file and stays one file. A
dependency would mean a stranger verifying one digest is trusting a supply chain
they cannot see from here.

**No network in the verification path.** Validation is offline by construction.
If a check needs the network to decide, it is not a check a user can repeat.

**The anchor digest is published in six places or it is not published.** Steps
that change the bootstrap's bytes change the value a user checks by hand, and a
stale anchor in any one document tells that reader the download was tampered
with. `push-gate` fails on both a missing and a superseded anchor for exactly
that reason.

## Releases

`RELEASING.md` is the ceremony, in order, and the order is not cosmetic: the
suite rewrites `artifacts/`, so the candidate manifest is bound after it rather
than before, and the source archive is built after the anchor is final because it
covers the documents that carry it. Read it rather than reconstructing it.

The provenance file is a byte copy of the Workflow repository's generated
statement. Do not write it by hand, and do not refuse to update it: there is a
generator, and it lives in the other repository.

## Translations

The English documents are the normative source. Each translation carries a
`tcrn-doc-synced-to` pin naming its source and that source's SHA-256, and a
structural change to an English document is mirrored in the same change — a
convenience translation that silently lags its source is worse than an absent
one, because it reads as current.

## What a good report looks like

For a verification failure: the version, the value you computed, the value the
document told you to expect, and where you obtained the file. For anything else:
what you expected, what happened, and the exact command. A reason code is worth
more than a description of the error message.
