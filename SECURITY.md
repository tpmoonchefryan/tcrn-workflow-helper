# Security policy

## The one thing to verify

`bootstrap/trusted-bootstrap.mjs` is the entire trust boundary. It carries the
pinned release identity and the accepted archive and provenance digests, and
nothing else in this repository has authority. Obtain it through a channel
independent of whatever you are about to install, and check it:

```sh
shasum -a 256 bootstrap/trusted-bootstrap.mjs
# a1e0f2c4c318bd303e974100602d221605b9e38a3fd34f25c6ae8d52c5956b3b
```

The same digest is published in `README.md` and in the GitHub release notes for
this version. If it does not match, stop — everything downstream of an
unverified bootstrap is unverified.

This repository does **not** sign its releases. A previous candidate shipped a
self-built Ed25519 signing chain; it was removed because it was never anchored
anywhere a user could independently reach, which made it decoration rather than
evidence. What replaces it: the published bootstrap digest above, the accepted
release digests compiled into that bootstrap, GitHub immutable releases (tags
and assets cannot be moved, deleted, or changed), and a reproducible-build chain
(`npm run ci:replay`) that rebuilds every committed artifact from a clean
checkout and asserts digest equality. That chain is checkable by anyone, which
a solo publisher's self-generated key never was.

Revocation is handled by yanking the affected GitHub release, publishing a new
bootstrap with a new published digest, and issuing a GitHub Security Advisory.

## Reporting a vulnerability

Report suspected bootstrap, archive, identity, or path-validation defects
privately through GitHub Private Vulnerability Reporting on this repository
(Security tab -> Report a vulnerability:
https://github.com/tpmoonchefryan/tcrn-workflow-helper/security/advisories/new).
Do not include credentials, private Workspace contents, or production paths in
public reports.
