# Changelog

All notable changes to `agileflow` v4 are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [4.0.0-alpha.1] — Unreleased

v4 Phase 1 skeleton. Not yet publishable.

### Added

- Monorepo workspace `apps/cli/` with `name: agileflow`, `version: 4.0.0-alpha.1`.
- Unified user config surface at `agileflow.config.json` (JSON Schema + Ajv loader).
- Default config factory with `core` plugin always enabled.
- CLI entry at `bin/agileflow.js` with `commander`-based dispatch (`status`, `setup`, `doctor` stubs).
- Vitest test infrastructure with `tests/unit/config/loader.test.js` (8 passing tests).
- `@clack/prompts` as the TUI library for the setup wizard — matches the skills.sh/vercel-labs/skills UX (clean step indicators, multiselect, search). Replaces the Ink 5 direction from the original plan.

### Phase 2a — Setup wizard

- Plugin registry (`src/runtime/plugins/registry.js`) — discovers `plugin.yaml` manifests under `content/plugins/*`, sorts required-first, enforces unique ids.
- Config writer (`src/runtime/config/writer.js`) — serializes user-facing fields to `agileflow.config.json` with schema pointer, stable 2-space formatting.
- Clack wizard (`src/cli/wizard/plugin-picker.js`, `src/cli/wizard/personalization.js`) — multiselect plugin picker (core always on) + 3 enum selects (tone, ask_level, verbosity). Cancellation cleanly exits.
- Stub plugin manifests for `core` / `ads` / `seo` / `audit` / `council` in `content/plugins/*/plugin.yaml` (content bodies land in Phase 4).
- Non-interactive path: `agileflow setup --yes --plugins core,seo,audit` writes config without prompts.
- 14 new tests (`plugins/registry.test.js`, `config/writer.test.js`); total suite: 22 passing.

### Not yet implemented

- Plugin registry & loader (Phase 2).
- Installer sync engine (Phase 2 — ported from v3 `installer.js:349-455`).
- Content placeholder injector (Phase 2).
- Hook meta-orchestrator + 6 dispatchers (Phase 3).
- Core plugin content — Epic, Story, Status, Babysit (Phase 4).
- Skill validator, personalization injector, CI, npm publish (Phase 5).

### Removed from v3

- `packages/cli/` renamed to `agileflow-v3-legacy` on the `v4` branch (workspace collision prevention). v3 continues to ship from `main`.
