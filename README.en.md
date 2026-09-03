<div align="center">

# TCRN Workflow Helper

### Verify one file by hand, once. After that it refuses everything else for you

**A single-file, zero-dependency bootstrap. It proves a release is exactly what was published before a single line of it runs.**

[简体中文](./README.md) · English · [日本語](./README.ja.md) · [한국어](./README.ko.md) · [Français](./README.fr.md)

![status](https://img.shields.io/badge/status-1.0.1-blue?style=flat-square) ![deps](https://img.shields.io/badge/dependencies-0-success?style=flat-square) ![files](https://img.shields.io/badge/bootstrap-1%20file-brightgreen?style=flat-square) ![force](https://img.shields.io/badge/--force-does%20not%20exist-critical?style=flat-square)

![license](https://img.shields.io/badge/license-Apache--2.0-lightgrey?style=flat-square) ![node](https://img.shields.io/badge/node-%E2%89%A5%2024-informational?style=flat-square) ![network](https://img.shields.io/badge/network-none-important?style=flat-square) ![hosts](https://img.shields.io/badge/hosts-Claude%20Code%20%C2%B7%20Codex-blueviolet?style=flat-square) ![supports](https://img.shields.io/badge/TCRN%20Workflow-v1.0.1-blue?style=flat-square)

[Verify this one file first](#verify-this-one-file-first) · [What it solves](#what-it-solves) · [Who it is for](#who-it-is-for) · [What it enforces](#what-it-enforces) · [Three-minute start](#three-minute-start) · [Current status](#current-status) · [Full documentation](#full-documentation)

</div>

<table>
<tr>
<td align="center" width="25%">

### 1
file<br><sub>The whole bootstrap. You can read it in one sitting</sub>

</td>
<td align="center" width="25%">

### 1
manual check<br><sub>Do it once, and refusal is automatic afterwards</sub>

</td>
<td align="center" width="25%">

### 0
dependencies<br><sub>No network, no telemetry</sub>

</td>
<td align="center" width="25%">

### 0
uses of `--force`<br><sub>The option does not exist, it is not disabled</sub>

</td>
</tr>
</table>

---

## Verify this one file first

The bootstrap is the only thing you ever have to trust, so verify it before you believe anything it tells you. One command, one comparison:

```sh
shasum -a 256 bootstrap/trusted-bootstrap.mjs
# ee61a092b96b16ca1207d5a259a493b4ab3354d1aba52cc6536dd1a474dd8d1b
```

This digest is published in three places: here, in `SECURITY.md`, and in the GitHub release notes. Three independent sources that check each other.

> [!IMPORTANT]
> If what you compute does not match, stop. Do not run anything, and do not try it anyway. A mismatch is the mechanism working.

---

## What it solves

A skill or workflow arrives from a repository, and nothing proves the bytes you are about to run are the bytes somebody actually reviewed.

TCRN Workflow Helper reduces that to a single manual check. Once you have verified the bootstrap, which release bytes get accepted is decided by cryptography rather than by your judgement.

There is no `--force`, because the option does not exist. It is not a switch that defaults to off, nor a dangerous operation behind a confirmation. It is absent from the program.

---

## Who it is for

| ✓ A fit if | ✗ Not a fit if |
| :--- | :--- |
| You run TCRN Workflow on your own machine and want the bytes confirmed before any code executes. | You do not need a provenance guarantee for release bytes. |
| You accept one manual check in exchange for automatic refusal thereafter. | You are willing to run whatever you downloaded. |

---

## What it enforces

| Guarantee | How it works |
| :--- | :--- |
| **Reproducible artifacts** | The skill archive, the source archive and the SBOM are deterministic. CI replays them from a clean clone and asserts the digests match the committed ones. Anyone can rebuild the bytes and check. |
| **Exact release identity** | The accepted Workflow version is pinned by repository URL, version, commit, tree and annotated tag object, all verified against a real Git checkout. Git object ids are content hashes, so the binding authenticates itself. |
| **Pinned release bytes** | The accepted archive and provenance digests are compiled into the bootstrap itself. Any other archive fails closed with `IDENTITY_MISMATCH`. |
| **Anti-rollback** | GitHub immutable releases: tags cannot move, assets cannot be replaced. An earlier release also fails the digest comparison, because each bootstrap accepts exactly one archive. |
| **Hostile-archive defence** | Path traversal, absolute paths, control characters, non-NFC paths, duplicate and case-colliding paths, links, special files, per-entry digest tampering, entry and byte ceilings: all refused before extraction. |
| **The live environment is never touched** | Install, update, reinstall and uninstall operate only inside disposable `tcrn-helper-test-*` roots. Any path containing a `.claude` or `.codex` component, in any case, is refused with `LIVE_LOCATION_FORBIDDEN` before the filesystem is even probed. |
| **Transactional lifecycle** | Every change is a staged, journalled transaction whose crash recovery is proven by real `SIGKILL` injection. A failed operation leaves the prior state byte-for-byte identical, with no residue. |

---

## Three-minute start

```sh
# run the full proof suite (offline; allow 10 to 20 minutes, it includes real SIGKILL injection)
npm test

# validate a release set before anything executes
node bootstrap/trusted-bootstrap.mjs validate \
  --archive <archive.json> --provenance <provenance.json> --state <state.json>
```

<details>
<summary><b>The remaining bootstrap commands</b></summary>

<br>

```sh
# read-only verification of the copy an installer placed in the skills directory
node bootstrap/trusted-bootstrap.mjs verify-installed-copy \
  --installed-dir <skills-dir/tcrn-workflow-helper> \
  --provenance <provenance.json> --state <state.json> --marker <marker.json>

# resolve exactly one accepted Workflow checkout (refuses ambiguity, symlinks, dirty trees)
node bootstrap/trusted-bootstrap.mjs resolve --root <workflow-checkout>
```

</details>

> [!NOTE]
> Success emits a single canonical-form JSON receipt (`TRUST_VALIDATED`, `ROOT_RESOLVED`, `NETWORK_PLAN_APPROVED`, `INSTALL_COMPLETED`, `UNINSTALL_COMPLETED`). Failure emits a single stable reason code. Nothing in between.

---

## Current status

- `1.0.1` is the first accepted version and supports exactly TCRN Workflow `v1.0.1`.
- The bootstrap is a single file: zero dependencies, no network, no telemetry.
- Network operations are planned, never performed: `plan-network` prints a static plan and issues no requests.

## Full documentation

Architecture, the command reference, criteria and gates, and known limits live in the TCRN Workflow repository's **[GitHub Wiki](https://github.com/tpmoonchefryan/tcrn-workflow/wiki)**. This repository does not keep a wiki of its own.

Documents in this repository: [Contributing](./CONTRIBUTING.md) · [Security](./SECURITY.md) · [Code of conduct](./CODE_OF_CONDUCT.md) · [Releasing](./RELEASING.md)

## License

Apache-2.0. See [LICENSE](./LICENSE) and [NOTICE](./NOTICE).
