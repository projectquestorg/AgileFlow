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

### Not yet implemented

- Plugin registry & loader (Phase 2).
- Installer sync engine (Phase 2 — ported from v3 `installer.js:349-455`).
- Content placeholder injector (Phase 2).
- Hook meta-orchestrator + 6 dispatchers (Phase 3).
- Core plugin content — Epic, Story, Status, Babysit (Phase 4).
- Skill validator, personalization injector, CI, npm publish (Phase 5).

### Removed from v3

- `packages/cli/` renamed to `agileflow-v3-legacy` on the `v4` branch (workspace collision prevention). v3 continues to ship from `main`.
