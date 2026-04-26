# Publishing AgileFlow v4 to npm

> Quick reference for shipping a new alpha (or future stable) of the
> `agileflow` package from the `apps/cli/` workspace.

## Prerequisites

- npm publish rights to the `agileflow` package
- `NPM_TOKEN` configured in the repo's GitHub Secrets (used by
  `.github/workflows/v4-publish.yml`)
- Working tree clean on the `v4` branch
- `agileflow doctor` exits 0 against bundled content
- `vitest run` passes

## Versioning convention

- Pre-releases: `4.0.0-alpha.N` (current), `4.0.0-beta.N`, `4.0.0-rc.N`
- GA: `4.0.0`
- Tag format: **`agileflow-v<version>`** — e.g. `agileflow-v4.0.0-alpha.1`. The leading `agileflow-` keeps v4 tags
  distinct from any v3 tags that may still land on `main`.

## Local dry run

```bash
cd apps/cli

# 1. Confirm everything is green.
npx vitest run
node bin/agileflow.js doctor

# 2. Bump the version (writes apps/cli/package.json).
npm version 4.0.0-alpha.1 --no-git-tag-version

# 3. Confirm the publish payload.
npm pack --dry-run    # lists exactly what would ship
```

The `prepublishOnly` script automatically re-runs `vitest run` and
`agileflow doctor` immediately before any `npm publish`, so a
red doctor blocks the publish locally too.

## Publishing via CI (recommended)

```bash
cd apps/cli

# 1. Bump version + commit.
npm version 4.0.0-alpha.1 --no-git-tag-version
cd ../..
git add apps/cli/package.json apps/cli/CHANGELOG.md
git commit -m "release(v4): 4.0.0-alpha.1"

# 2. Tag with the agileflow-v prefix.
git tag agileflow-v4.0.0-alpha.1

# 3. Push the tag — `.github/workflows/v4-publish.yml` runs the
#    full validation + npm publish --tag alpha.
git push origin v4
git push origin agileflow-v4.0.0-alpha.1
```

The workflow:
1. Checks out the tag commit
2. Runs `vitest run` and `agileflow doctor`
3. Verifies the tag version matches `apps/cli/package.json` (catches
   forgotten `npm version` bumps)
4. Publishes to npm with `--access public --tag alpha`

## Publishing manually (emergency only)

```bash
cd apps/cli
npm publish --access public --tag alpha
```

`prepublishOnly` runs the same gates locally. Use only when CI is
unavailable; prefer the tag flow.

## Promoting alpha → latest

When v4 is stable enough to be the default install:

```bash
npm dist-tag add agileflow@4.0.0 latest
npm dist-tag rm agileflow alpha   # optional — keeps the alpha label off the new default
```

## What ships

The `files` field in `apps/cli/package.json` lists exactly:

- `bin/` — CLI entry point + the 6 legacy hook dispatchers
- `src/` — the runtime + CLI implementation
- `content/` — bundled plugin manifests, skills, hooks
- `README.md`, `LICENSE`, `CHANGELOG.md`

Nothing else (tests, vitest config, etc.) goes into the npm tarball.
Run `npm pack --dry-run` from `apps/cli/` to list the exact payload.

## Rollback

If a published alpha is broken:

```bash
# Mark the bad version deprecated (still installable, but warns).
npm deprecate agileflow@4.0.0-alpha.1 "broken — use 4.0.0-alpha.2"

# Or unpublish entirely (only works within 72 hours of publish).
npm unpublish agileflow@4.0.0-alpha.1
```

Then ship the next alpha through the normal flow. Don't reuse a
version number — npm registry policy disallows overwriting.
