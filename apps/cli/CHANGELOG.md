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

### Phase 2a — hardening (flow audit fixes)

Flow audit (wiring / errors / persistence / feedback) ran against Phase 2a and flagged 3 P0 + 5 P1 gaps. All addressed:

- **writeConfig now atomic**: temp file (`.agileflow.config.json.tmp-<pid>`) + rename. Same-directory rename is atomic on POSIX and same-volume Windows. Readers always see either old or new content — never a truncated half-write. Temp file is cleaned up on failure.
- **writeConfig errors surface as friendly messages**: EPERM / ENOSPC / EACCES no longer leak stack traces. Interactive path shows `prompts.log.error` + recovery hint; non-interactive path writes to stderr with exit 1.
- **Plugin discovery errors handled in interactive path**: malformed `plugin.yaml` or duplicate ids no longer crash before the wizard starts. Wizard shows "Failed to load plugins: {msg}" and exits.
- **Unknown `--plugins` ids now error loudly**: `agileflow setup --yes --plugins core,typo` exits 1 with the typo listed and all available plugin ids printed.
- **Custom plugin entries preserved on wizard rerun**: user-added entries in `plugins.mycustom` survive every wizard invocation (interactive and `--yes`). Extracted `buildPluginsMap()` pure helper to unit-test this guarantee.
- **Cancellation semantics fixed**: Ctrl+C / Esc in any prompt now says "Setup cancelled. No changes made." and exits 1 (was exit 0). CI can now distinguish user abort from success.
- **Round-trip tests expanded per schema field**: hooks, ide.primary, language, plugin settings sub-objects, and personalization each tested independently. A writer-forgets-a-field regression can't hide behind the loader's default-merge.
- **Test suite grew 22 → 40 passing** across 5 test files.

### Phase 2a — logic audit fixes

Logic audit (5 analyzers: edge / flow / invariant / race / type) on the hardened Phase 2a code. Verdicts: **CLEAN** (control flow), **HOLDS** (invariants), **ACCEPTABLE** (edge + race), **LOOSE** (type). 4 P1 fixes applied:

- **`registry.js`**: `depends` is now strictly validated. A plugin author writing `depends: core` (string, common YAML authoring mistake) used to be silently coerced to `[]`; now it throws a clear error. Empty/absent `depends` still defaults to `[]`.
- **`plugin-picker.js::buildPluginsMap`**: added `!Array.isArray(entry)` guard for the custom-plugin preservation branch. Arrays pass `typeof === 'object'` but would break any downstream code reading `entry.enabled` as a property.
- **`plugin-picker.js::buildPluginsMap`**: discovered plugins now preserve their `settings` sub-object across wizard reruns. Previously the picker would strip `plugins.seo.settings.crawlDepth` every time it ran; now settings travel with the plugin entry (including when enable=false).
- **`loader.js`**: eliminated the `existsSync`→`readFileSync` TOCTOU window. We now read directly and treat `ENOENT` as "no config → defaults"; any other read error surfaces as before. Simpler code, no race.
- Test suite grew **40 → 46 passing**.

### Phase 2b slice 1 — Sync engine port

Ported the v3 SHA256-based safe-update engine from `installer.js:349-455` into `apps/cli/src/runtime/installer/`. Each scenario has dedicated test coverage.

- **`src/lib/hash.js`** — `sha256Hex(Buffer|string)` (UTF-8 deterministic) and `sha256File(path)` helpers.
- **`src/runtime/installer/file-index.js`** — read/write `_cfg/files.json` (schema v1); atomic writes (temp+rename); rejects arrays-masquerading-as-objects at both levels.
- **`src/runtime/installer/stash.js`** — writes conflicting upstream content to `_cfg/updates/<timestamp>/<relativePath>` for manual merge.
- **`src/runtime/installer/sync-engine.js`** — `syncFile({ content, dest, relativePath, fileIndex, cfgDir, timestamp, force, ops })` handles the 5-scenario decision tree: CREATED, UPDATED (via force), UPDATED (via baseline match), UNCHANGED (3 variants — baseline noop, protected auto-converge, unknown auto-adopt), PRESERVED (stash+keep-user, for protected-mismatch and locally-modified cases). Works for both text content (strings) and binary (Buffers).
- **27 new tests** covering every branch of the decision tree plus index round-trips and deterministic hashing. Suite: **46 → 73 passing**.

### Phase 2b slice 2 — Plugin resolver + strict validator

- **`src/runtime/plugins/resolver.js`** — `resolvePlugins(discovered, userSelected)` computes the transitive closure (auto-enabling dependencies of user-selected plugins), produces a topologically-sorted install order, and detects cycles via DFS three-color marking with full cycle-path reporting (e.g. `a -> b -> c -> a`). `cannotDisable` plugins (currently just `core`) are always included.
- **`src/runtime/plugins/validator.js`** — strict per-plugin validation:
  - `id` matches `^[a-z0-9][a-z0-9-]{0,63}$` (kebab-case)
  - `version` is valid semver including pre-release / build-metadata tags
  - `description` is non-empty and ≥ 16 chars (warning under that)
  - `enabledByDefault` and `cannotDisable` are real booleans (not coerced strings)
  - `cannotDisable: true` implies `enabledByDefault: true`
  - `depends` entries are valid plugin ids; self-dependency rejected; duplicates flagged as warnings
  - `provides` is an object with array-typed sub-keys; unknown keys flagged as warnings
  - `validatePluginSet()` adds cross-plugin checks (duplicate ids, unresolved depends)
  - `hasErrors(issues)` for gating commits / CI
- **37 new tests** (resolver: 12, validator: 25) covering diamond dependencies, 3-node cycles, semver edge cases, kebab-case rejections, and cross-plugin invariants. Suite: **73 → 110 passing**.
- All 5 bundled plugin manifests pass strict validation with zero issues.

### Phase 2b slice 4 — End-to-end install orchestrator + integration tests

- **`src/runtime/installer/install.js`** — `installPlugins({ discovered, userSelected, agileflowDir, cliVersion, force })` wires every layer: strict-validate → resolve transitive deps + topo sort → read or seed file index → walk each plugin's source dir → `syncFile` every file under `<agileflowDir>/plugins/<id>/...` → remove directories of plugins no longer enabled (and prune their index entries) → atomically write the index. Throws on validation errors (zero partial install) and dependency cycles.
- **`removeDisabledPlugins`** — only blasts directories whose ids are in the discovered set. Unknown user-placed dirs under `<agileflowDir>/plugins/` are left alone.
- **`FileOpsCounters`** gained a `removed` field for plugin-level removal accounting.
- **`tests/integration/install-plugins.test.js`** (7 tests) covers:
  - First install with selected opt-ins → `core` first in topo order, file index records every file, disabled plugins absent.
  - Idempotency: second run reports zero writes, all `unchanged`.
  - User-modified file → `preserved` + stash written under `_cfg/updates/<timestamp>/<relativePath>` containing the upstream version.
  - Disabled plugin removal → directory rm'd + index entries pruned.
  - User-placed unknown directory under `plugins/` is preserved.
  - Validation errors abort with a flat report, zero filesystem side effects.
  - Cycle detection trips before any writes.
- Suite: **110 → 117 passing** (1 unit test updated for the new `removed` counter; 7 new integration tests).
- **Phase 2b "done when" criteria all met**: SHA256 round-trip passes, disabled-plugin removal works, integration test installs into a scratch dir end-to-end. The content injector port (slice 3) is deferred to Phase 4 — it's only needed once skills/commands with `<!-- {{TOKEN}} -->` placeholders ship.

### Not yet implemented

- Plugin registry & loader (Phase 2).
- Installer sync engine (Phase 2 — ported from v3 `installer.js:349-455`).
- Content placeholder injector (Phase 2).
- Hook meta-orchestrator + 6 dispatchers (Phase 3).
- Core plugin content — Epic, Story, Status, Babysit (Phase 4).
- Skill validator, personalization injector, CI, npm publish (Phase 5).

### Removed from v3

- `packages/cli/` renamed to `agileflow-v3-legacy` on the `v4` branch (workspace collision prevention). v3 continues to ship from `main`.
