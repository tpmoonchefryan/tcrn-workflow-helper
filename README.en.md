<div align="center">

# TCRN Workflow Helper

### Check one file by hand, once. It refuses everything else for you.

**A single-file, zero-dependency bootstrap that proves a release is exactly what was published — before a single line of it runs.**

[简体中文](./README.md) · English · [日本語](./README.ja.md) · [한국어](./README.ko.md) · [Français](./README.fr.md)

![status](https://img.shields.io/badge/status-1.0.1-blue) ![deps](https://img.shields.io/badge/dependencies-0-success) ![files](https://img.shields.io/badge/bootstrap-1%20file-brightgreen) ![force](https://img.shields.io/badge/--force-does%20not%20exist-critical)

![license](https://img.shields.io/badge/license-Apache--2.0-lightgrey) ![node](https://img.shields.io/badge/node-%E2%89%A5%2024-informational) ![network](https://img.shields.io/badge/network-none-important) ![hosts](https://img.shields.io/badge/hosts-Claude%20Code%20%C2%B7%20Codex-blueviolet) ![supports](https://img.shields.io/badge/TCRN%20Workflow-v1.0.1-blue)

[Check this file first](#check-this-file-first) · [What it solves](#what-it-solves) · [Who it is for](#who-it-is-for) · [What it enforces](#what-it-enforces) · [Three-minute start](#three-minute-start) · [Current status](#current-status) · [Full documentation](#full-documentation)

</div>

---

## Check this file first

The bootstrap is the only thing you ever have to trust, so check it before you trust anything it tells you. One command, one comparison:

```sh
shasum -a 256 bootstrap/trusted-bootstrap.mjs
# ee61a092b96b16ca1207d5a259a493b4ab3354d1aba52cc6536dd1a474dd8d1b
```

That digest is published in three places: here, in `SECURITY.md`, and in the GitHub release notes. **If what you compute does not match, stop.** Do not run anything, do not try it anyway. A mismatch is the system working.

## What it solves

A skill or workflow arrives from a repository, and nothing proves that the bytes you are about to run are the bytes somebody actually reviewed.

TCRN Workflow Helper reduces that to one manual check. Once you have checked the bootstrap, which release bytes get accepted is decided by cryptography rather than by your judgement. There is no `--force`, because the option does not exist.

## Who it is for

| | |
| --- | --- |
| **A good fit** | You run TCRN Workflow on your own machine and want the bytes confirmed before any code executes. You accept one manual check in exchange for automatic refusal from then on. |
| **Not a fit** | You do not need provenance for release bytes, or you are content to run whatever you downloaded. |

## What it enforces

| Guarantee | How it works |
| --- | --- |
| **Reproducible artifacts** | The skill archive, source archive, and SBOM are deterministic. A clean-clone CI replay rebuilds them from scratch and asserts the digests match the committed ones. Anyone can rebuild the bytes and check. |
| **Exact release identity** | The accepted Workflow release is pinned by repository URL, version, commit, tree, and annotated tag object, checked against a real Git checkout. Git object ids are content hashes, so the binding is self-authenticating. |
| **Pinned release bytes** | The accepted archive and provenance digests are compiled into the bootstrap itself. Any other archive fails closed with `IDENTITY_MISMATCH`. |
| **Anti-rollback** | GitHub immutable releases: tags cannot be moved, assets cannot be swapped. An older release also fails the pinned-digest comparison, because each bootstrap accepts exactly one archive. |
| **Hostile-archive safety** | Path traversal, absolute paths, control characters, non-NFC paths, duplicate and case-colliding paths, links, special files, per-entry digest tampering, and entry and byte limits are all rejected before extraction. |
| **Live-host protection** | Install, update, reinstall, and uninstall operate only inside disposable `tcrn-helper-test-*` roots. Any path containing a `.claude` or `.codex` component, in any letter case, is rejected before the filesystem is probed, with `LIVE_LOCATION_FORBIDDEN`. |
| **Transactional lifecycle** | Every mutation is a staged, journaled transaction with crash recovery proven by real `SIGKILL` injection. A failed operation leaves byte-identical prior state and zero residue. |

## Three-minute start

```sh
# run the full proof suite (offline; expect 10-20 minutes, it includes real SIGKILL fault injection)
npm test

# validate a release bundle before anything executes
node bootstrap/trusted-bootstrap.mjs validate \
  --archive <archive.json> --provenance <provenance.json> --state <state.json>

# verify, read-only, a copy an installer placed in the skills folder
node bootstrap/trusted-bootstrap.mjs verify-installed-copy \
  --installed-dir <skills-folder/tcrn-workflow-helper> \
  --provenance <provenance.json> --state <state.json> --marker <marker.json>

# resolve exactly one approved Workflow checkout (rejects ambiguity, symlinks, dirty trees)
node bootstrap/trusted-bootstrap.mjs resolve --root <workflow-checkout>
```

Success emits one canonical JSON receipt (`TRUST_VALIDATED`, `ROOT_RESOLVED`, `NETWORK_PLAN_APPROVED`, `INSTALL_COMPLETED`, `UNINSTALL_COMPLETED`). Failure emits one stable reason code. Nothing in between.

## Current status

- `1.0.1` is the first accepted release, supporting exactly TCRN Workflow `v1.0.1`.
- The bootstrap is a single file: zero dependencies, no network, no telemetry.
- Network operations are planned, never performed: `plan-network` prints a static plan and issues no requests.

## Full documentation

Architecture, command reference, claims and gates, and known limits live in the TCRN Workflow repository's [wiki](https://github.com/tpmoonchefryan/tcrn-workflow/wiki). This repository keeps no wiki of its own.

Documents in this repository: [Contributing](./CONTRIBUTING.md) · [Security](./SECURITY.md) · [Code of conduct](./CODE_OF_CONDUCT.md) · [Releasing](./RELEASING.md)

## License

Apache-2.0. See [LICENSE](./LICENSE) and [NOTICE](./NOTICE).
