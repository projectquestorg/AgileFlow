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

### Phase 2b — logic audit fixes

Logic audit (5 analyzers: edge / flow / invariant / race / type) on Phase 2b runtime. Verdicts: **HOLDS** (invariants), **CLEAN** (control flow), **SAFE** (race for CLI), **RISKY** (edge — path traversal flagged), **ACCEPTABLE** (type). 5 P0/P1 fixes applied:

- **`writeStash` path-traversal guard**: rejects absolute paths up front (`/etc/passwd` would otherwise be silently joined as a relative segment) AND verifies the resolved stash path is inside the resolved updates root. Defensive against malicious or buggy `relativePath` values escaping `_cfg/updates/<timestamp>/`.
- **`installPlugins` try/finally around sync + remove**: the file index is now written even when `installOnePlugin` throws mid-loop. Previously a transient EACCES/ENOSPC could leave on-disk files without index entries → next run would misclassify them as user-modified and stash them. Integration test confirms partial-install case persists the index.
- **Atomic `syncFile` writes**: `writeContent` ports the temp+rename pattern from `writeFileIndex`. Mid-write crashes can no longer leave a truncated dest file. Temp filename is `<dest>.tmp-<pid>-<random>` to avoid collisions in same-process concurrent installs.
- **Resolver rejects unknown `userSelected` ids loudly**: `resolvePlugins(discovered, ['typo'])` now throws with a clear message listing available plugin ids. Direct callers (CI / programmatic install) get the same protection the wizard already had via `pluginsFromCsv`.
- **`sha256Hex` null guard**: throws a `TypeError` with a clear message instead of the cryptic Buffer-internal error when called with `null`/`undefined`.
- **Random suffix on temp filenames** in `writeFileIndex` (PID alone could collide in same-process concurrent calls — rare but possible in tests).
- **14 new tests**: stash path-traversal (4), atomic writes (2), resolver unknown ids (2), null hash inputs (2), partial-install index persistence (1), plus existing test fixed for absolute-path rejection. Suite: **117 → 131 passing**.

### Phase 2c — Wire installer into CLI (setup + update)

- **`agileflow setup` now triggers an actual install**: after writing `agileflow.config.json`, both the interactive and `--yes` paths call `installPlugins()`. The interactive path shows a Clack spinner ("Installing N plugin(s)") with a per-counter summary on completion. The `--yes` path prints a single-line counter summary.
- **New `agileflow update` command**: re-runs `installPlugins()` against the currently-enabled plugin set in the config, no prompts. Use cases: applying manual edits to `agileflow.config.json`, picking up new bundled plugin content without re-prompting, CI sync. Supports `--force` to overwrite local modifications instead of preserving them.
- **Verified end-to-end**: `agileflow setup --yes --plugins core,seo,audit` in a scratch dir writes config, installs 3 `plugin.yaml` files into `.agileflow/plugins/{core,audit,seo}/`, and produces a valid SHA256-indexed `_cfg/files.json`. Subsequent `agileflow update` reports 3 unchanged (idempotent).

### Phase 3 slice A — Hook meta-orchestrator core

The fix for v3's cascading SessionStart failures lands. Six thin Claude Code dispatchers delegate to a single orchestrator that reads a project-side manifest, topologically orders hooks by `runAfter`, runs them with per-hook timeout + skipOnError semantics, and writes a JSONL log to `.agileflow/logs/hook-execution.jsonl`.

- **`src/runtime/hooks/manifest-loader.js`** — reads/normalizes `.agileflow/hook-manifest.yaml` (schema v1). Strict validation: rejects unknown events, non-array `runAfter`, negative `timeout`, non-boolean `enabled`/`skipOnError`, duplicate ids. Six valid Claude Code events recognized: `SessionStart`, `PreCompact`, `Stop`, `PreToolUse:{Bash,Edit,Write}`. Returns null for missing manifest.
- **`src/runtime/hooks/chain.js`** — `orderChain(hooks)` topologically sorts by `runAfter` via DFS three-color marking; cycles throw with the full path (`a -> b -> c -> a`); unresolved `runAfter` targets throw with the offending hook id; declaration order preserved within topo layers.
- **`src/runtime/hooks/logger.js`** — `appendHookLog(logPath, entry)` writes one JSON object per line. `truncate()` caps stdout/stderr at 4 KB per stream with a `…[truncated]` marker. Drops `undefined` keys for compact lines. Auto-creates the log directory.
- **`src/runtime/hooks/orchestrator.js`** — `runEvent({ event, agileflowDir, stdin, overrides, runHook? })` orchestrates a chain: load manifest → filter to event → apply user `overrides` from `agileflow.config.json.hooks` → topo sort → run each hook (via injectable `runHook`, defaulting to a child-process spawner with AbortController-enforced timeouts) → log every step → continue on `skipOnError: true` failures, abort with exit 1 on `skipOnError: false` failures. Default child-process runner picks the interpreter by extension (`.js`→node, `.sh`→bash, else direct), forwards stdin, captures stdout/stderr/exitCode/timedOut, sets `AGILEFLOW_DIR` env.
- **`bin/hooks/{session-start,pre-bash,pre-edit,pre-write,pre-compact,stop}.js`** — six executable thin dispatchers (~30 lines each). Each forwards stdin to `runEvent` and exits with the chain's resolved code. `pre-compact` and `stop` always exit 0 even on chain failure (these events must never block). All catch top-level errors and fail open.
- **`HOOK_LOG`** schema: `{ timestamp, event, hookId, status: 'ok'|'error'|'timeout'|'skipped', exitCode, durationMs, stdout?, stderr?, skippedByOnError? }`.
- **44+ new tests across 4 files**: manifest schema (15), chain ordering + cycles (9), JSONL logger + truncation (8), orchestrator with stubbed runHook (12) including timeout, skipOnError, runAfter ordering, override application, multi-hook logging. Suite: **131 → 184 passing**.
- **End-to-end smoke verified**: a manifest with `welcome` (ok) and `flaky` (exits 1, skipOnError: true) runs both in topo order, logs each, and the dispatcher exits 0 — the exact v3 cascade-failure case that previously broke session start now degrades gracefully.

### Phase 3 schema fix — align with Claude Code hooks reference

A read of the official Claude Code hooks docs revealed our event schema was wrong on two counts: incomplete (6 of 28 real events) and synthetic (`PreToolUse:Bash` is not a real event — it's `PreToolUse` + a separate `matcher: "Bash"` config field). Fixed before slices B/C build on the schema.

- **`VALID_EVENTS` expanded to all 28 events** in the Claude Code reference: `SessionStart`, `SessionEnd`, `UserPromptSubmit`, `UserPromptExpansion`, `PreToolUse`, `PermissionRequest`, `PermissionDenied`, `PostToolUse`, `PostToolUseFailure`, `PostToolBatch`, `PreCompact`, `PostCompact`, `Stop`, `StopFailure`, `SubagentStart`, `SubagentStop`, `TaskCreated`, `TaskCompleted`, `TeammateIdle`, `InstructionsLoaded`, `ConfigChange`, `CwdChanged`, `FileChanged`, `WorktreeCreate`, `WorktreeRemove`, `Notification`, `Elicitation`, `ElicitationResult`.
- **`matcher` is now a separate optional field** on hook manifest entries, only valid on tool-related events (`PreToolUse`, `PostToolUse`, `PostToolUseFailure`, `PermissionRequest`, `PermissionDenied`). Manifest schema rejects matcher on non-tool events with a clear error.
- **`matcherMatches(pattern, actual)`** helper implements Claude Code's matcher semantics: empty/`*` → match-all; alphanumeric+`_`+`|` → exact-or-pipe-list (`Bash`, `Edit|Write`); anything else → JS regex (`^Notebook`, `mcp__memory__.*`); invalid regex returns false instead of throwing.
- **Orchestrator's `runEvent` accepts a `matcher` parameter**: hooks with a manifest matcher only fire when their pattern accepts the runtime-supplied matcher; hooks without a manifest matcher fire for every value.
- **PreToolUse dispatchers** (`pre-bash.js`, `pre-edit.js`, `pre-write.js`) hardcode their respective matcher (`Bash`, `Edit`, `Write`) and pass it to `runEvent`. They register in `.claude/settings.json` (slice C) as `PreToolUse` hooks with the matching `matcher` field, so Claude Code routes correctly.
- **21 new tests** for the schema + matcher routing: 9 manifest-loader (matcher field validation, expanded event list), 5 orchestrator (matcher filtering across exact / pipe-list / regex / no-matcher), 7 `matcherMatches` cases. Suite: **184 → 205 passing**.
- **End-to-end re-verified**: a manifest with `welcome` (SessionStart, no matcher), `dc-bash` (PreToolUse, matcher: Bash), and `dc-edit` (PreToolUse, matcher: Edit) routes correctly. SessionStart fires welcome only; `pre-bash.js` invoking the orchestrator with `matcher: 'Bash'` fires only `dc-bash`, filtering out `dc-edit`.

### IDE / CLI awareness — install gates by target

Different agentic IDEs / CLIs support different feature subsets. Hooks are Claude Code only (the entire orchestrator we just shipped is Claude-Code-specific). Cursor / Windsurf / Codex don't have an equivalent hook API. The installer now picks an IDE up front and gates feature install on its capabilities.

- **`src/runtime/ide/capabilities.js`** declares an `IDE_CAPABILITIES` map for the four supported targets: `claude-code` (full feature set), `cursor` (commands + MCP), `windsurf` (commands), `codex` (very limited). Each entry lists `hooks` / `skills` / `commands` / `agents` / `mcp` booleans plus a `settingsFile` path.
- **`src/cli/wizard/ide-picker.js`** adds a Clack `select` prompt asking which IDE the user is targeting. Default is Claude Code. Selecting a non-full target prints a warning listing which features won't be installed (`cursor: hooks, skills, agents won't be installed (not supported by this IDE)`).
- **`agileflow setup --yes --ide <id>`** flag for the non-interactive path. Unknown IDE ids are rejected with the supported list. Default is `claude-code`.
- **Status output** now shows the IDE selection: `ide: claude-code (hooks=on, skills=on)`.
- **Future install gating**: the IDE choice is captured in `agileflow.config.json` at `ide.primary`; subsequent slices (Phase 3 slice C / Phase 4 install gating) consult `capabilitiesFor(ide).hooks` etc. before writing IDE-specific files.

### v4 direction lock — skills-only (no slash commands)

User directive 2026-04-26: AgileFlow ships **skills only**. No slash commands at all in the runtime. (Distinction: `npx agileflow setup` and friends are CLI subcommands and stay — the directive applies to in-IDE `/agileflow:*` slash commands.)

- **Plugin manifest `provides.commands`**: schema retained for backward compat but bundled plugins all ship `commands: []`. Phase 4 content authoring must NOT create command `.md` files.
- **Plan §C overlap table** at `/home/bk/.claude/plans/fizzy-stirring-kahan.md` is now wholly "retire in favor of skill" — every former "Kept" command becomes "Retired".
- **Skill design implication**: with no slash command for deterministic invocation, every skill must use the v2 frontmatter `triggers.keywords` + `priority` + `exclude` fields rigorously so Claude reliably picks the right skill.
- **IDE capability map**: the `commands: true/false` field stays informational. AgileFlow itself ships no commands regardless.

### Phase 3 slice B — Hook manifest aggregation at install (IDE-gated)

The install pipeline now produces a working `.agileflow/hook-manifest.yaml` automatically when the target IDE supports hooks. The 6 dispatchers + orchestrator from slice A finally have something to read.

- **`src/runtime/hooks/aggregator.js`** — `buildHookManifest(orderedPlugins)` walks each plugin's `provides.hooks` array, rewrites script paths from plugin-relative (`hooks/welcome.js`) to project-root-relative (`.agileflow/plugins/core/hooks/welcome.js`), and produces a `{ version: 1, hooks: [...] }` object. Defensive: skips invalid entries silently. Pure / no I/O.
- **`writeAggregatedManifest(plugins, agileflowDir)`** — atomically writes the YAML manifest with a `# Auto-generated …` header so users know not to hand-edit. Temp+rename pattern matching the rest of the runtime; cleans up the temp file on rename failure.
- **`removeAggregatedManifest(agileflowDir)`** — removes a stale manifest cleanly when the user switches to a non-hook IDE.
- **`installPlugins` now takes an `ide` parameter** and calls `writeAggregatedManifest` only when `capabilitiesFor(ide).hooks === true`. Switching from claude-code to cursor automatically removes the previously-written manifest. Result object grows a `hookManifestPath` field (path or null).
- **`setup` and `update` commands** thread `ide` through from `agileflow.config.json.ide.primary`. The bundled core plugin gained a stub `session-welcome.js` hook so aggregation has real content to test against.
- **17 new tests across aggregator + integration**: pure aggregator unit tests (build, atomic write, header comment, cleanup on failure, remove), 3 integration tests (manifest written for claude-code, NOT written for cursor, stale manifest removed on IDE switch). Suite: **213 → 227 passing across 18 files**.
- **End-to-end verified**: `agileflow setup --yes --plugins core --ide claude-code` writes hook-manifest.yaml with `session-welcome` registered for SessionStart; switching to `--ide cursor` removes the manifest. The orchestrator (slice A) reads the same file at runtime; the loop is closed.

### Phase 3 slice C — Claude Code settings.json registration

The final piece. When `ide=claude-code`, the installer registers our 6 hook entry points in `.claude/settings.json` so Claude Code actually invokes our orchestrator. The orchestrator → manifest loader → chain executor → dispatcher loop now closes against a real Claude Code session.

- **`src/runtime/ide/claude-code-settings.js`** — read/merge/write of `.claude/settings.json`. Critical correctness property: NEVER clobbers the user's other settings.json content (permissions, env, non-managed hooks). AgileFlow-owned entries are identified by the literal `agileflow hook` substring in their command and replaced atomically; everything else is preserved.
- **`src/cli/commands/hook.js`** + new `agileflow hook <event> [--matcher <name>]` CLI subcommand: a unified hook dispatcher that resolves through the npm bin entry. Settings.json registers `npx --no-install agileflow hook <Event>` so the path works regardless of how the package is installed (local node_modules, global, npx).
- **6 registrations across 4 events**: 1 SessionStart + 3 PreToolUse (Bash / Edit / Write matchers) + 1 PreCompact + 1 Stop. Each entry uses `type: command`, `timeout: 30` (seconds, per Claude Code docs), and the unified `agileflow hook ...` invocation.
- **`installPlugins`** now calls `writeClaudeCodeSettings(projectRoot)` when `ide=claude-code` and `removeClaudeCodeSettings(projectRoot)` otherwise. Switching IDEs cleans up stale entries; if AgileFlow was the only owner, the settings.json file is removed entirely.
- **24 new tests** for the settings.json writer (entry detection, merge, unmerge, file lifecycle, malformed input handling, idempotency, atomicity) plus 2 integration tests for ide-gated registration. Suite: **227 → 251 passing across 19 files**.
- **End-to-end verified**: `agileflow setup --yes --ide claude-code` writes `.claude/settings.json` with all 6 entries; `npx agileflow hook SessionStart` invokes the orchestrator; switching to `--ide cursor` deletes the settings file. **Phase 3 is functionally complete** — a fresh Claude Code session in a v4-installed project now actually invokes our hooks.

The 6 standalone dispatchers under `bin/hooks/*.js` are now legacy. The unified `agileflow hook` subcommand replaces them for production use; they're kept as direct-invocation aliases (useful for testing without npx). A future cleanup can prune them.

### Phase 4 first slice — agileflow-story-writer skill

The first real user-visible content lands in v4. After install, a Claude Code session in the user's project will discover `agileflow-story-writer` and activate it on prompts about features / user stories / acceptance criteria.

- **`content/plugins/core/skills/agileflow-story-writer/SKILL.md`** — ported from v3 to the v4 frontmatter v2 schema:
  - `description` follows the `Use when...` policy
  - explicit `triggers.keywords` (`user story`, `as a user, i want`, `feature request`, `implement this`, etc.)
  - `triggers.exclude` keywords damp false activations on `bedtime story` / `tell me a story`
  - `triggers.priority: 50` for collision resolution
  - `learns.enabled: true` with `_learnings/story-writer.yaml` for self-improvement
  - `<!-- {{PERSONALIZATION_BLOCK}} -->` placeholder for future personalization injection (Phase 5)
  - Body kept ≤ 200 lines per the §G validator policy
- **`content/plugins/core/plugin.yaml`** updated to declare the skill in `provides.skills`.
- **`src/runtime/ide/claude-code-skills.js`** — mirror logic that copies enabled plugin skills from `.agileflow/plugins/<id>/skills/<skill>/` into `.claude/skills/<skill>/` (Claude Code's canonical discovery location). Pruning is conservative: only `agileflow-*` prefixed dirs are removed when orphaned, leaving third-party skill dirs alone. Copy (not symlink) for Windows portability.
- **`installPlugins`** now mirrors skills when `ide=claude-code` AND `capabilities.skills`, and unmirrors them on switch-away. Result object gains `skillsMirrored` and `skillsPruned` arrays.
- **10 new tests across mirror module + 2 integration tests**: collect-skills, mirror to fresh dir, replace stale content, prune orphans, leave third-party alone, unmirror, ENOENT-safe; integration: install puts skill in `.claude/skills/`, IDE switch removes it. Suite: **251 → 261 passing across 20 files**.
- **End-to-end verified**: `agileflow setup --yes --plugins core --ide claude-code` lands `agileflow-story-writer` at `.claude/skills/agileflow-story-writer/SKILL.md` with the v4 frontmatter intact. Switching to `--ide cursor` removes it.

### Phase 3+4 logic-audit fixes

5 logic analyzers (edge / flow / invariant / race / type) on Phase 3 and Phase 4 code surfaced 7 actionable findings. All addressed before more skills land.

- **`mirrorClaudeCodeSkills`** — wrapped per-skill copy in try/catch. ENOENT (missing source dir) is now reported as `result.skipped` and the install continues; other errors still propagate. `copyDir` was also reordered to read source before creating dest, so a missing source no longer leaves an empty mirror dir behind.
- **`installPlugins` validate-before-write**: step 7 now builds the hook manifest in memory and runs it through `normalizeManifest` BEFORE writing. A plugin contributing an invalid hook (unknown event, missing matcher on a non-tool event, etc.) now errors at install time with `Hook manifest validation failed: ...` instead of silently registering hook dispatchers in `.claude/settings.json` against an unparseable manifest.
- **`mergeManagedHooks` / `unmanageHooks`** — added `!Array.isArray(existing.hooks)` guard so an array-shaped `hooks: []` in user settings.json doesn't get spread into an object with numeric keys (which would corrupt the file). Treats it as missing and rebuilds clean.
- **`agileflow hook` subcommand** — validates the event name against `VALID_EVENTS` and requires `--matcher` for tool-related events. Misspellings (`SesionStart`) and missing matchers now exit 1 with a clear error and the list of valid events. Previously these silently no-op'd the entire hook chain.
- **`removeClaudeCodeSettings`** — no longer swallows arbitrary read errors. ENOENT and SyntaxError are still tolerated by the inner `readExisting` (treated as empty), but EACCES / EIO now propagate so we don't lie about removing entries from an unreadable file.
- **`InstallResult` JSDoc** — extended typedef from 7 to 12 properties to match the actual return shape (`hookManifestPath`, `settingsPath`, `skillsMirrored`, `skillsPruned`, `skillsSkipped`, `ide`).
- **`collectPluginSkills`** — rejects entries with empty-string `id` or `dir`. An empty `dir: ""` would previously path-join to the plugin root and produce wrong copies.
- **5 new tests** + 2 modified for new return shapes: array-shaped hooks treated correctly, empty-string skill specs filtered, missing-source mirror reports skipped without crashing, validate-before-write rejects malformed manifest before settings.json is touched. Suite: **261 → 266 passing**.

End-to-end verified: `npx agileflow hook SesionStart` (typo) prints `unknown event "SesionStart"` with the full valid list and exits 1; `npx agileflow hook PreToolUse` (no `--matcher`) prints `event "PreToolUse" requires --matcher` and exits 1; the valid case still exits 0.

### Not yet implemented

- Plugin registry & loader (Phase 2).
- Installer sync engine (Phase 2 — ported from v3 `installer.js:349-455`).
- Content placeholder injector (Phase 2).
- Hook meta-orchestrator + 6 dispatchers (Phase 3).
- Core plugin content — Epic, Story, Status, Babysit (Phase 4).
- Skill validator, personalization injector, CI, npm publish (Phase 5).

### Removed from v3

- `packages/cli/` renamed to `agileflow-v3-legacy` on the `v4` branch (workspace collision prevention). v3 continues to ship from `main`.
