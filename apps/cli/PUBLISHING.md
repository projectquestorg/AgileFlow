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
4. Commit `skills/` and `registry/` together. Once merged to `main`, the
   registry is served from
   `https://raw.githubusercontent.com/projectquestorg/AgileFlow/main/registry`.

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
and creates the GitHub release. `.github/workflows/publish.yml` publishes on the
tag with `NPM_TOKEN`; prereleases (versions with `-`) go to the `next` dist-tag.

Emergency manual publish: `cd apps/cli && npm run release-gate && npm run build && npm publish --access public --tag next`.
