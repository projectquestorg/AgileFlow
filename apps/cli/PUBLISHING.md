# Publishing the agileflow CLI

The npm package contains only `bin/` and the bundled `dist/cli.js`. Skills are
not bundled: they are published to the static registry in `registry/` and
versioned independently of the CLI.

## Skills (registry)

1. Edit a skill in `skills/<id>/` and bump `package.version` in its
   `agileflow.skill.yaml` (patch: wording/eval improvements; minor: new optional
   capability; major: behavioral contract change).
2. `npm run registry:build` (from the repo root). Rebuilding changed content
   under an already published version fails on purpose.
3. `npx tsx apps/cli/src/index.ts eval --lint --catalog skills` must pass; run
   provider evals for changed skills, e.g.
   `npx tsx apps/cli/src/index.ts eval <id> --catalog skills --provider claude`.
4. Once registry signing is set up (below): `npm run registry:sign -- snapshot
--sign <snapshot-key.pem>` so `registry/v1/snapshot.json` covers the new
   manifest. `npm run registry:check` fails until it does.
5. Commit `skills/` and `registry/` together. Once merged to `main`, the
   registry is served from
   `https://raw.githubusercontent.com/projectquestorg/AgileFlow/main/registry`.

`registry:check` also verifies every previously published version against the
manifest at the latest `v*` release tag in git (override with
`AGILEFLOW_REGISTRY_BASELINE=<ref>`), and refuses to change an integrity already
pinned into the CLI. Rewriting an old bundle together with its hashes is caught
there, not only by the per-file consistency checks.

## Registry signing

Hashes next to the bytes only prove a download was not corrupted. Signed
metadata proves an authorized publisher produced the manifest those hashes come
from (a small subset of The Update Framework):

- `registry/v1/root/<n>.json`: the trust root, listing the ed25519 keys for the
  `root` role (signs key changes) and the `snapshot` role (signs releases), and
  how many signatures each needs.
- `registry/v1/snapshot.json`: binds the exact bytes of `v1/manifest.json`, with
  a version that only increases (clients refuse rollbacks) and an expiry
  (clients refuse a registry that stopped being re-signed).

The CLI pins root v1 in `packages/registry/src/trust-root.ts`. While that is
`null` (the state until the ceremony below), official packages are protected by
the per-release integrity pins only and `registry:sign -- check` reports
"unsigned". Once pinned, the official registry must serve a valid signed
snapshot, and every official package installed must appear in it with the same
integrity.

Key ceremony (once, on a trusted machine; keep private keys offline, never in
the repository or CI unless you accept an online snapshot key):

```bash
npm run registry:sign -- keygen ~/agileflow-keys   # root key; repeat for more root keys
npm run registry:sign -- keygen ~/agileflow-keys   # snapshot key
npm run registry:sign -- root --version 1 --expires 2028-01-01 \
  --root-keys <root-pub> --root-threshold 1 \
  --snapshot-keys <snapshot-pub> --snapshot-threshold 1 \
  --sign ~/agileflow-keys/<root>.pem
npm run registry:sign -- snapshot --sign ~/agileflow-keys/<snapshot>.pem
```

Commit `registry/v1/root/1.json`, `registry/v1/snapshot.json`, and the
regenerated `trust-root.ts`; the next CLI release enforces signatures.

- Re-sign the snapshot after every registry change, and at least once a year
  (`--expires-days`, default 365). `registry:check` fails 30 days before expiry.
- Rotate or revoke keys by publishing root `n+1` (new key lists), signed by
  enough keys of root `n` and of root `n+1`. Clients follow the chain from the
  root they pin and remember the newest root they verified.
- A valid signature says who published a skill, not that its instructions are
  safe; installs and updates still show the trust review.

## CLI (npm)

Releases are cut from `main` (the registry the CLI uses by default is served
from `main`):

```bash
./scripts/release.sh 5.0.0-alpha.1 "Portable skill manager MVP"
```

The script refuses to run off `main`, with a dirty tree, or with a version that
is not greater than the current one. It runs `npm run release-gate`, packs the
CLI and audits it installed in an empty project (`npm audit --omit=dev
--audit-level=high`), moves the CHANGELOG `Unreleased` notes under the version,
bumps `apps/cli/package.json` and the root `package.json` together, syncs this
package's README from the root README, then commits, tags `v<version>`, pushes,
and creates the GitHub release. Before tagging it also installs the packed CLI
into a clean HOME and PATH and runs `init`, `check`, and `sync` against the
registry (`apps/cli/scripts/smoke-pack.mjs`).

`.github/workflows/publish.yml` publishes on the tag after checking that the tag
matches both package versions and is on `main`, rerunning the release gate, and
smoke-testing the packed tarball; prereleases (versions with `-`) go to the
`next` dist-tag. A follow-up job installs the published version from npm on
Linux, macOS, and Windows and runs it against the public registry.

Authentication uses npm trusted publishing (OIDC; no long-lived token). Set it
up once on npmjs.com: package `agileflow` > Settings > Trusted publishing >
GitHub Actions, repository `projectquestorg/AgileFlow`, workflow `publish.yml`.
`NPM_TOKEN` is only used as a fallback until then.

Emergency manual publish: `cd apps/cli && npm run release-gate && npm run build && npm publish --access public --tag next`.
