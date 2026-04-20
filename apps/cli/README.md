# AgileFlow v4 (alpha)

> **Status:** pre-release skeleton. Not for production use. See `CHANGELOG.md` and plan at `/home/bk/.claude/plans/fizzy-stirring-kahan.md`.

AgileFlow v4 is a clean-break rewrite of the `agileflow` npm package. It replaces v3's 94-command / 149-agent / everything-enabled-by-default surface with a skills-first architecture and opt-in plugin categories.

## Why v4

- **Skills-first** — the primary interaction surface is skills (auto-discovered by Claude Code), with slash commands as optional thin wrappers.
- **Opt-in plugins** — only the `core` plugin (Epic, Story, Status, Babysit) installs by default; Ads / SEO / Audit / Council / Mobile / Compliance are user-activated.
- **Hook meta-orchestrator** — 6 Claude Code hook entry points dispatch an internal chain with `runAfter` / `skipOnError` / per-hook `timeout`, eliminating v3's cascading SessionStart failures.
- **Unified config** — one user-facing `agileflow.config.json` at project root replaces the scattered `.agileflow/config.yaml` + `.claude/settings.json` + `manifest.yaml` surface of v3.

## Install (alpha)

```bash
npm i agileflow@alpha
npx agileflow setup
```

## Phase status

| Phase | Scope | Status |
|-------|-------|--------|
| 1 — Skeleton + Config | `package.json`, config loader, CLI entry, stubs | **in progress** |
| 2 — Installer + Plugin Loader | sync engine port, plugin registry | pending |
| 3 — Hook Orchestrator | manifest-driven chain dispatcher | pending |
| 4 — Core Plugin Content | Epic, Story, Status, Babysit | pending |
| 5 — Skill Validator + CI + alpha.1 publish | CI, validator, personalization | pending |

## Relationship to v3

v3 lives at `packages/cli/` (temporarily renamed to `agileflow-v3-legacy` on the `v4` branch to avoid workspace name collision). v3 patches happen on `main` only. When v4 reaches core parity the `v4` branch merges to `main` and `packages/cli/` is removed.

## License

MIT — see `LICENSE`.
