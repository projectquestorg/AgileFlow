# AgileFlow v5 architecture

AgileFlow is a portable skill manager, compatibility layer, and evaluation system for coding agents. It supplies small pieces of reusable operational guidance and then gets out of the way: nothing AgileFlow ships runs while an agent works.

## Design principles

1. **Trust the host agent.** Claude, Codex, Cursor, OpenCode, and Gemini are the execution engines. Do not reimplement their intelligence.
2. **Standards first.** Use standard Agent Skills wherever possible. Provider adapters exist only where standards diverge.
3. **`.agents/skills` is canonical.** One source of truth. Provider compatibility points to it rather than creating independent copies.
4. **Skills fix workflows, not intelligence.** Teach repeated process and project constraints. Do not write textbooks for models that already know the subject.
5. **Small by default.** Every token in a loaded skill must justify itself.
6. **Progressive disclosure.** Keep `SKILL.md` small; use references and scripts only when needed.
7. **Provider defaults are good defaults.** Never override model, effort, context, sandbox, permission, or memory settings because AgileFlow exists.
8. **No invisible behavior.** If AgileFlow changes provider configuration, the user explicitly asked for it, and the change is recorded so it can be undone exactly.
9. **User files belong to the user.** Never delete or overwrite based on naming heuristics. Ownership comes from the lockfile (skills), self-describing markers (mirrors), or proof (v4 file index hashes).
10. **Forking is a feature.** Users customize skills freely.
11. **Updates are deterministic.** Config specifies intent. The lockfile specifies resolution. Sync reproduces exactly. Update intentionally changes versions.
12. **No runtime dependency.** Installed skills keep working if AgileFlow disappears.
13. **Evals over prompt vibes.** Descriptions and instructions change because measured behavior changed.
14. **Don't blindly migrate v4.** Keep the useful ideas; delete the architecture that no longer makes sense.
15. **Make the obvious thing work.** `agileflow add`, `agileflow update`, use your coding agent normally.

The rule for adding any instruction to a skill: add it only when it encodes information the model cannot reasonably infer, captures a repeatable workflow, or corrects a demonstrated failure mode.

## Three layers

| Layer | Examples | Owner |
| ----- | -------- | ----- |
| Repository context | `AGENTS.md`, `CLAUDE.md`, `GEMINI.md` | the repository (AgileFlow never generates or edits these) |
| Skills | `.agents/skills/<id>/SKILL.md` | AgileFlow manages versions; users can fork |
| Provider/runtime behavior | effort, permissions, sandbox, progress updates, question tools | the provider (inherited, never managed) |

## Packages

```text
apps/cli            Commander CLI; ui/ (output, prompts, tables), commands/ (one file per command)
packages/core       context, config + lockfile (zod, comment-preserving YAML edits), skill parsing,
                    rendering, installer (materialize, sync, add, remove), updater (update, fork, diff),
                    ownership, links, diagnostics (check), detach, v4 migration
packages/providers  ProviderAdapter implementations; each adapter owns its compatibility knowledge
packages/registry   static registry client, registry/git/path sources, bundle format, integrity, builder
packages/evals      scenario schema, release-gate lint, provider drivers, judge, runner
```

Core defines the `ProviderAdapter` and `PackageFetcher` interfaces; providers and registry implement them; the CLI wires the concrete implementations. There is no dependency injection framework, event bus, plugin runtime, daemon, or database.

## Files

- `agileflow.yaml` (project) / `~/.config/agileflow/config.yaml` (personal): intent. Small schema: skills, providers, interaction.
- `agileflow.lock` / `~/.config/agileflow/agileflow.lock`: resolution. For each skill: source, version, resolved commit (git), `integrity` (hash of the package as published), `path`, `baseHash` (hash of the directory as installed), activation, ownership (`managed` or `local`).
- `~/.cache/agileflow/packages/<name>/<version>/bundle.json`: package cache; `sync` works offline from it. The project files remain the active skills.
- `~/.cache/agileflow/projects/<scope>-<hash>/state.json`: what this machine last synced, used to clean up skills that left the lockfile after a `git pull` (only when unmodified).
- `~/.config/agileflow/state.yaml`: provider patches AgileFlow applied on request, with previous values.

## Materialization

A package is rendered deterministically before it is written to `.agents/skills/<id>`:

1. `evals/` is not installed (scenarios are for `agileflow eval`, read from the locked package).
2. Frontmatter `name` is set to the install id.
3. Managed skills get a `<!-- Managed by AgileFlow ... agileflow fork <id> -->` notice after the frontmatter.
4. If `interaction.questionPreference` is `prefer` or `minimize`, skills whose sidecar declares user interaction get one line stating it.
5. `activation: manual` is translated by every adapter: `disable-model-invocation: true` (Claude, Cursor), `metadata.opencode/autoinvoke: false` (OpenCode), `agents/openai.yaml` `policy.allow_implicit_invocation: false` (Codex). Gemini has no hard switch; `check` reports "manual-only enforcement: semantic".

Because rendering is deterministic, a skill is *clean* exactly when the hash of its directory equals `baseHash`. Clean skills can be replaced; modified skills never are without an explicit choice (fork, reset, skip).

## Claude compatibility

Claude Code reads `.claude/skills`. The Claude adapter creates one link per skill (`.claude/skills/<id> -> ../../.agents/skills/<id>`), falling back to a junction on Windows and then to a generated mirror marked with `.agileflow-mirror.json`. It owns only those links and mirrors, never the directory, never `.claude/settings.json`. A directly edited mirror is detected and never silently overwritten. If `.claude/skills` itself links to `.agents/skills`, nothing is created.

## Registry

A static registry (no database) served over HTTPS from `registry/`:

```text
v1/skills/index.json                GET /v1/skills
v1/skills/<name>/index.json         GET /v1/skills/{name}
v1/skills/<name>/<version>.json     GET /v1/skills/{name}/{version}
v1/packs/<name>.json                GET /v1/packs/{name}
packages/<name>/<version>.json      skill bundles
```

`npm run registry:build` regenerates it from `skills/` and `packs/`. Published versions are immutable: rebuilding changed content under an existing version fails. Downloads are verified against the published integrity and the lockfile before anything is written. Override the location with `registry:` in config or `AGILEFLOW_REGISTRY`.

## Skill release gate

An official skill needs: a specific description that says what it does and when to activate; a small body (ideal 30-120 lines, soft limit 200, design review at 300, maximum 500); a `## Done when` completion section; portable frontmatter (`name`, `description` only); a valid `agileflow.skill.yaml`; and at least three eval scenarios including a negative trigger. `agileflow eval --lint --catalog skills` enforces this in CI. Behavioral evals (`--provider claude|codex|gemini|opencode`) run against real provider CLIs in sandbox repositories with the whole catalog installed, so activation precision is measured, not assumed.

## Conformance

`npm run test:conformance` checks each installed provider's own view of the skills, without a model call where possible:

- Codex: `codex debug prompt-input` lists auto skills from `.agents/skills`, omits manual skills, and reflects updates and removals; `codex features list` reflects the structured-questions opt-in.
- OpenCode: `opencode debug skill` lists the skills from `.agents/skills`.
- Claude Code: the stream-json `init` event lists the skills through links and through mirrors.
- Gemini CLI: `gemini skills list`, when the CLI is installed.
- Cursor: no headless skill-listing command exists yet, so it is checked manually (open the project, confirm the skills appear under Settings > Rules/Skills, invoke one by name).

T3 Code launches these provider CLIs in the project directory, so provider conformance covers it. Manual T3 check: open the project in T3, start a Codex or Claude thread, invoke a skill by name (`$diagnosing-bugs` / `/diagnosing-bugs`), and confirm the provider loads it. T3's own skill picker may not list every provider-visible skill; that is a known host caveat, not a skill problem.

## Hooks

AgileFlow installs zero hooks. If a deterministic hook becomes genuinely useful later, it will be declared by a skill package and installed with the provider's native hook system, optional and fully removable. There is no hook dispatcher, manifest, or orchestrator.

## Deviations from the v5 design document

Intentional, reviewed differences from `docs/04-architecture/agileflow-v5-architecture.md`:

- **npm workspaces instead of pnpm (section 15).** The repository already installs the CLI, website, and docs apps with npm (`package-lock.json`, CI). The package manager does not reach users: the published `agileflow` package bundles `packages/*` into `dist/cli.js` with esbuild and depends only on its runtime libraries. Switching would churn every app's lockfile for no architectural benefit. Stale `pnpm-lock.yaml` files (root and `apps/docs`) were removed so `package-lock.json` is the single source of truth.
- **Eval scenarios are not installed into projects (section 16 shows `evals/` inside `.agents/skills/<id>`).** A live eval run showed an agent reading a scenario file from the project, so `evals/` ships in the registry package but is stripped on install. `agileflow eval <skill>` reads scenarios from the locked package in the cache.
- **Registry packages are JSON bundles, not tarballs (section 56 leaves the format open).** One document per version, base64 file contents, integrity = hash of the file tree. No archive dependency, and the same integrity applies to registry, git, and path sources.
- **`packages/*` are private source packages bundled into the CLI**, not separately published packages, to keep one npm artifact.
- **`agileflow doctor` stays as a hidden alias of `check`** during the transition (section 64 allows this). `agileflow hook` does not exist; invoking it prints a pointer to `migrate v4` and exits 1 (never 2, which v4-era hook entries would treat as "block").
- **Cursor has no automated conformance test**: its CLI has no headless skill listing yet, so it is checked manually (section 96 requires real behavior tests "where CI licenses/environment permit").
