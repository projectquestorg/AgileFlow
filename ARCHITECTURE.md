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
| Work (opt-in) | `docs/agile/` product, roadmap, epics, stories, decisions | the team; AgileFlow Work creates, queries, and validates the Markdown |
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
packages/work       Agile Work: types + frontmatter schemas, paths, ids, frontmatter (parse, validate,
                    patch, serialize), scanner, queries (incl. board), lifecycle, templates, writer, validate
```

Core defines the `ProviderAdapter` and `PackageFetcher` interfaces; providers and registry implement them; the CLI wires the concrete implementations. There is no dependency injection framework, event bus, plugin runtime, daemon, or database.

## Files

- `agileflow.yaml` (project) / `~/.config/agileflow/config.yaml` (personal): intent. Small schema: skills, providers (built-in and custom link providers), interaction, an optional `agileflow:` CLI version range the project requires, and `work`.
- `agileflow.lock` / `~/.config/agileflow/agileflow.lock`: resolution. For each skill: source, version, resolved commit and requested `ref` (git), `integrity` (hash of the package as published), `path`, `renderedHash` (hash of the directory as installed, line-ending and exec-bit insensitive), activation, ownership (`managed` or `local`). Unknown fields written by a newer CLI are preserved; a newer format `version` stops with an upgrade message.
- `~/.cache/agileflow/packages/<name>/<version>/bundle.json`: package cache; `sync` works offline from it. `~/.cache/agileflow/registry/<hash>/v1/...`: cached catalog documents, so `search` and pickers work offline. The project files remain the active skills.
- `~/.cache/agileflow/projects/<scope>-<hash>/`: machine-local state for one scope: `state.json` (what this machine last synced, used to clean up skills that left the lockfile after a `git pull`, only when unmodified), `lock` (the advisory scope lock), and `transaction.json` (the crash-recovery journal, present only while a write is in flight).
- `~/.cache/agileflow/history.jsonl`: local operation history (`agileflow history`), including third-party content the user approved. Off with `AGILEFLOW_NO_HISTORY=1`.
- `~/.config/agileflow/state.yaml`: provider patches AgileFlow applied on request, with previous values.

Nothing in the repository is hidden state: the lockfile and config are the only AgileFlow files a project commits.

## Materialization

A package is rendered deterministically before it is written to `.agents/skills/<id>`:

1. `evals/` is not installed (scenarios are for `agileflow eval`, read from the locked package).
2. Frontmatter `name` is set to the install id.
3. Managed skills get a `<!-- Managed by AgileFlow ... agileflow fork <id> -->` notice after the frontmatter.
4. Interaction overlay: if `interaction.questionPreference` is `prefer` or `minimize`, skills whose sidecar `capabilities.userInteraction` is `optional` or `required` get a short instruction in their body (`renderSkill` / `interactionOverlay` in `packages/core/src/render.ts`). The skill contract wins over the preference: `none` never gets an overlay, and `required` under `minimize` still asks what the workflow requires. The provider sees the overlay only while that skill is active; it never changes activation. The project value is committed (same behavior for the whole team); the personal default seeds new projects and applies to personal skills.
5. `activation: manual` is translated by every adapter that has a switch: `disable-model-invocation: true` (Claude, Cursor), `agents/openai.yaml` `policy.allow_implicit_invocation: false` (Codex). OpenCode and Gemini have no hard switch (OpenCode's loader ignores extra metadata), so nothing is written for them and `check` reports "manual-only enforcement: semantic" (the description asks for explicit use).

The published package is the *source*; the directory in `.agents/skills` is the *rendered* skill. The lock records both (`integrity`, `renderedHash`), so `sync` can tell that only render inputs changed (same `integrity`) and re-render. Because rendering is deterministic, a skill is *clean* exactly when the hash of its directory equals `renderedHash`. That hash ignores line endings and executable bits (Git with `core.autocrlf` and Windows change both), and entries hashing cannot see (symlinks, nested `.git`/`node_modules`, empty directories) make a skill count as modified instead of being deleted silently. `sync` re-renders a clean skill only when an input it recorded changed (activation or question preference); a difference that comes from another AgileFlow version's renderer is left alone so teammates on different CLI versions never ping-pong files, and `update` refreshes it. The installed base for diffs is re-rendered with the preference that reproduces `renderedHash`, so a later preference change is never attributed to the user. Clean skills can be replaced; modified skills never are without an explicit choice (fork, reset, skip).

## Consistency and crash safety

- **One writer per scope.** Every command that changes a scope holds an advisory lock (`<cache>/projects/<scope>/lock`, pid + host, stale locks from dead processes are broken, others wait up to 30 s, `AGILEFLOW_LOCK_TIMEOUT`). Nested operations in one call chain re-enter.
- **Journaled batches.** Multi-skill writes (`add`, `update`, `sync`, `remove`, `fork`) record the intended lock entries in a journal, swap directories (`replaceDirAtomic`: stage, rename aside, rename in, with retries for Windows `EPERM`/`EBUSY`), then write the lock and config. A failure part-way records exactly the skills that were written. After a crash the next mutating command rolls each skill forward (its directory already has the new content) or leaves it at the previous state, restores a directory caught between the two renames, and removes staging litter.
- **Resolve before write.** `add`, `init`, and `migrate --skills` resolve and render everything before writing anything, so a typo or an unreachable source never leaves a half-configured project.
- **Guards.** `add` and `update` never install over a hand-written skill directory, a locally owned skill, or a modified managed skill. `update` reports config/lock mismatches it left behind (skipped skills) instead of failing after partially applying.
- **Scopes.** The home directory is never a project (`~/.agents/skills` belongs to personal skills); `init` refuses it and the project search stops below it.
- **Atomic config edits** keep file modes and write through symlinks (dotfile managers).

## Claude compatibility

Claude Code reads `.claude/skills` (`$CLAUDE_CONFIG_DIR/skills` for personal skills when set). The Claude adapter creates one link per skill (`.claude/skills/<id> -> ../../.agents/skills/<id>`, computed from resolved paths so a symlinked `.claude` works), falling back to a junction on Windows and then to a generated mirror marked with `.agileflow-mirror.json`. It owns only those links and mirrors, never the directory, never `.claude/settings.json`. A directly edited mirror is detected and never silently overwritten. A junction left behind by a moved project and a symlink that Git checked out as a text file (`core.symlinks=false`) are recognized as AgileFlow's and repaired. If `.claude/skills` itself links to `.agents/skills`, nothing is created.

## Custom providers

Any agent that reads skills from its own directory is supported from configuration, with no plugin code:

```yaml
providers:
  windsurf:
    enabled: true
    skillsDir: .windsurf/skills              # project-relative
    userSkillsDir: .codeium/windsurf/skills  # home-relative, for --global
    displayName: Windsurf
```

A custom provider gets per-skill links exactly like Claude (same link, junction, mirror, and ownership rules). Paths must be relative and stay inside the project or home directory. Built-in ids reject `skillsDir`; an unknown id without one is reported by `check`. Agents that read `.agents/skills` natively need nothing. `check --verbose` reports each detected provider CLI's version.

## Registry

A static registry (no database) served over HTTPS from `registry/`:

```text
v1/skills/index.json                GET /v1/skills
v1/skills/<name>/index.json         GET /v1/skills/{name}
v1/skills/<name>/<version>.json     GET /v1/skills/{name}/{version}
v1/packs/<name>.json                GET /v1/packs/{name}
packages/<name>/<version>.json      skill bundles
v1/packs/index.json                 pack list
v1/manifest.json                    every published name@version -> integrity (append-only record)
```

`npm run registry:build` regenerates it from `skills/` and `packs/`. The registry is served from `main`, so merging to `main` publishes: registry changes land together with the CLI changes that need them, `v1/` stays backward compatible, and a breaking format change would go under `v2/`. Published versions are immutable and append-only: rebuilding changed content under an existing version fails, every older version (version document, index entry, bundle bytes) is re-verified on each build, removing a published version is an error, and CI rejects diffs that modify or delete published files. Packages may contain only `SKILL.md`, the sidecar, `LICENSE`/`README.md`, and `references/`, `scripts/`, `assets/`, `evals/`, `agents/`; hidden files are refused. Versions must be canonical semver. Override the location with `registry:` in config or `AGILEFLOW_REGISTRY`; JSON Schemas for every registry document are in `schemas/registry/` for self-hosted registries, and `agileflow registry build --scope <org>` builds a private team registry (same format and rules) from a directory of skills.

Sources besides the registry: git repositories (`git+https://...#path`, `owner/repo[/skill][@ref]`, `https://github.com/o/r/tree/<ref>/<path>`, which is how skills.sh lists skills), and local paths. Git checkouts fetch only the needed subdirectory (partial clone + sparse checkout) and are byte-identical on every machine (no line-ending conversion, no symlinks). `agileflow search` queries the official catalog (offline from the cache) and the public skills.sh index.

## Security model

Skills are instructions for agents that can run shell commands, so AgileFlow treats every package as untrusted content and decides what reaches an agent:

- **Transport.** Registries must be HTTPS (or a local path; loopback `http://` is allowed for development); redirects may not downgrade to `http://`. Git uses `https`, `ssh`, and `file` only; `http`/`git://` need `AGILEFLOW_ALLOW_INSECURE=1`. `ext::` is never allowed.
- **Argument safety.** Git refs and commits from config or lockfiles are validated (no leading `-`, no revision expressions, commits must be full SHAs) and passed after `--end-of-options`; URLs with a leading dash or whitespace are refused. A cloned repository's `agileflow.yaml`/`agileflow.lock` cannot make `sync` run commands.
- **Integrity and authenticity.** Every package is verified against the integrity its registry document declares and against the lockfile (TOFU after the first install). Official packages are additionally verified against integrities pinned into the CLI at build time (`packages/registry/src/official-pins.ts`, generated from `v1/manifest.json`): a registry, mirror, or network attacker cannot serve different bytes for a version this CLI release knows, even if it also rewrites the metadata. The CLI itself is published with npm provenance (Sigstore-signed SLSA build provenance), and every official bundle on `main` gets a GitHub artifact attestation; `agileflow verify --attestations` checks those with `gh attestation verify`.
- **Registry documents** are schema-validated; names, versions, bundle headers, and index keys are cross-checked; bundle URLs must stay inside the registry (no `file://` or other hosts); cache paths come only from validated names and versions.
- **Review before trust.** `add` and `info` show what a skill contains and a content scan (`scanSkill`: pipe-to-shell, destructive commands, credential access, exfiltration, prompt-injection phrasing, hidden Unicode and HTML comments, encoded blobs, broad `allowed-tools`, undeclared network use). Non-interactive installs of third-party content need `--yes`; `update` shows third-party diffs and findings and skips unapproved third-party changes (exit 3). Approvals are recorded in the local history. `verify --fail-on high` turns findings into a CI gate.
- **Execution.** AgileFlow never executes skill content. The only execution is `agileflow eval`, which runs providers in isolated sandboxes with a throwaway HOME, and runs scenario `setup` scripts only for official or explicitly passed local skills unless `--allow-setup` is given.
- **Provider settings** are never changed implicitly; explicit changes (Codex structured questions) keep file modes and symlinks, are recorded, and are restored only when nobody edited them since.

## CLI surface

`init`, `search`, `info`, `add` (alias `install`), `remove`, `list`, `sync`, `update`, `check` (alias `doctor`), `verify` (incl. `--sbom`), `configure` (alias `config`, incl. `configure show`), `fork`, `diff`, `create`, `history`, `registry`, `migrate`, `eval`, `work`, `completion`, `self-update`. Every command has `--help` and `--json`; in JSON mode stdout carries exactly one document and errors are `{"ok": false, "error": {"code", "message", "hints"}}`. Changing commands have a plan mode (`--dry-run`) and a consent rule: interactive runs ask, non-interactive runs need `--yes` wherever work would be lost or third-party content would reach an agent. Global flags: `--offline` (`AGILEFLOW_OFFLINE`), `--debug`, `--no-color`. Exit codes: 0 success, 1 error or problems found, 3 a non-interactive `update` skipped skills that need a decision; never 2. Command modules load lazily (startup is one small bundle import).

## Skill release gate

An official skill needs: a specific description that says what it does and when to activate; a small body (ideal 30-120 lines, soft limit 200, design review at 300, maximum 500); a `## Done when` completion section; portable frontmatter (`name`, `description` only); a valid `agileflow.skill.yaml`; at least three eval scenarios including a negative trigger and a positive with a rubric; and, when another catalog skill has a similar description, a negative scenario whose prompt belongs to that neighbor (`neighbor:`), so trigger conflicts are measured. `agileflow eval --lint --catalog skills` enforces this in CI; the same lint runs on any skill directory (third-party gaps are warnings), and `agileflow create` scaffolds a skill that passes it.

Behavioral evals (`--provider claude|codex|gemini|opencode`, several at once for a side-by-side comparison) run real provider CLIs in sandbox repositories with the whole catalog installed and an isolated HOME that holds only the provider's login files, so personal skills never leak in. Reports give activation precision, recall, and F1 per skill and provider, pass rates with Wilson 95% intervals for repeated runs (`--runs`), deterministic rubric checks alongside the LLM judge (which gets its own `--judge-model`; a judge failure is an error, never a pass), and `kind: adversarial` scenarios whose `forbid` rules (commands, files, output) are checked from the transcript and the sandbox diff. Provider crashes, timeouts, missing fixtures, and failed setup scripts are errors, never true negatives. Any failure or error exits 1, so evals gate releases.

## Conformance

`npm run test:conformance` checks each installed provider's own view of the skills, without a model call where possible:

- Codex: `codex debug prompt-input` lists auto skills from `.agents/skills`, omits manual skills, and reflects updates and removals; `codex features list` reflects the structured-questions opt-in.
- OpenCode: `opencode debug skill` lists the skills from `.agents/skills`.
- Claude Code: the stream-json `init` event lists the skills through links and through mirrors.
- Gemini CLI: `gemini skills list`, when the CLI is installed.
- Cursor: no headless skill-listing command exists yet, so it is checked manually (open the project, confirm the skills appear under Settings > Rules/Skills, invoke one by name).

T3 Code launches these provider CLIs in the project directory, so provider conformance covers it. Manual T3 check: open the project in T3, start a Codex or Claude thread, invoke a skill by name (`$diagnosing-bugs` / `/diagnosing-bugs`), and confirm the provider loads it. T3's own skill picker may not list every provider-visible skill; that is a known host caveat, not a skill problem.

## Agile Work

Opt-in and decoupled from the skill manager (`agileflow work init` sets `work.enabled` and `work.root` in `agileflow.yaml`). Everything Agile lives in `packages/work`, loaded only when a `work` command runs; the CLI has one `work` command (`init`, `new`, `list`, `show`, `status`, `board`, `import v4`) and `agileflow check` adds an "Agile Work" section from `validateWorkspace`. Core only knows the `work` config key. Agile Work is not an orchestrator: it exposes readiness (`work list --ready --json`, per-story `dependenciesDone`/`waitingOn`/`ready`) so external multi-agent tools can schedule work from plain files.

- One root directory with exactly five categories: `00-product/product.md`, `01-roadmap/roadmap.md`, `02-epics/`, `03-stories/`, `04-decisions/`. The scanner reads only the three artifact folders; anything else in the workspace is reported, never loaded.
- Markdown files are the database. No `status.json`, board file, index, dependency graph, or cache in the repository: boards, epic progress, and relationships are derived on every call. A story points at its epic (`epic:`); the epic never lists stories.
- IDs are `EPIC-`/`STORY-`/`DEC-` plus 8 random Crockford Base32 characters. No counter or registry, so branches, worktrees, and parallel agents create IDs without coordinating; `check` reports a duplicate as an error and prefix lookups refuse ambiguous matches. Files are `<ID>-<slug>.md`; the frontmatter ID is authoritative.
- `schema: 1` frontmatter per type (`schemas/work/*.schema.json`). Status changes patch only the `status:` line; the body stays byte-for-byte identical.
- The lifecycle is a recommended state machine, not a workflow engine: off-path story moves are applied with warnings; closing an epic with unfinished stories needs `--force`. Validation never changes a status.
- The `agile` pack (`creating-epics`, `writing-stories`, `working-story`, `reviewing-story`, `recording-decisions`) is optional; the workspace and CLI work without it.
- `work import v4` converts a v4 backlog into Work items (recording `legacy_id`, idempotent), never touching the v4 files.

## Hooks

AgileFlow installs zero hooks. If a deterministic hook becomes genuinely useful later, it will be declared by a skill package and installed with the provider's native hook system, optional and fully removable. There is no hook dispatcher, manifest, or orchestrator.

## Deviations from the v5 design document

Intentional, reviewed differences from `docs/04-architecture/agileflow-v5-architecture.md`:

- **npm workspaces instead of pnpm (section 15).** The repository already installs the CLI, website, and docs apps with npm (`package-lock.json`, CI). The package manager does not reach users: the published `agileflow` package bundles `packages/*` into `dist/cli.js` with esbuild and depends only on its runtime libraries. Switching would churn every app's lockfile for no architectural benefit. Stale `pnpm-lock.yaml` files (root and `apps/docs`) were removed so `package-lock.json` is the single source of truth.
- **Eval scenarios are not installed into projects (section 16 shows `evals/` inside `.agents/skills/<id>`).** A live eval run showed an agent reading a scenario file from the project, so `evals/` ships in the registry package but is stripped on install. `agileflow eval <skill>` reads scenarios from the locked package in the cache.
- **Registry packages are JSON bundles, not tarballs (section 56 leaves the format open).** One document per version, base64 file contents, integrity = hash of the file tree. No archive dependency, and the same integrity applies to registry, git, and path sources.
- **`packages/*` are private source packages bundled into the CLI**, not separately published packages, to keep one npm artifact.
- **`agileflow doctor` is an alias of `check`** (section 64 allows this; it is the name most CLIs use for diagnostics). `agileflow hook` does not exist; invoking it prints a pointer to `migrate v4` and exits 1 (never 2, which v4-era hook entries would treat as "block").
- **Agile Work docs live in the docs site (`apps/docs/content/docs/work/`), not `docs/work/` (Agile Work MVP section 139).** This repository's `/docs/` directory is internal and gitignored; user-facing documentation is the Fumadocs site. Work tests follow the MVP layout (`packages/work/tests/`).
- **Cursor has no automated conformance test**: its CLI has no headless skill listing yet, so it is checked manually (section 96 requires real behavior tests "where CI licenses/environment permit").

## Research review decisions (2026-09)

An external research report recommended evolving AgileFlow toward open standards, supply-chain security, and a modern CLI. What was adopted, and what was declined because it conflicts with the design principles above:

| Recommendation | Decision |
| --- | --- |
| Agent Skills standard (SKILL.md), `.agents/skills`, standard precedence | Already the foundation; unknown frontmatter (`license`, `compatibility`, `allowed-tools`, `metadata`) is preserved and shown by `info`. |
| Use existing registries (skills.sh, GitHub) instead of only a custom one | Adopted: `search` covers skills.sh; `add owner/repo[/skill][@ref]` installs from GitHub, pinned to a commit in the lock. The static official registry stays for the curated catalog (versioned, pinned, attested). |
| OCI registries | Declined for now: no demand, and git + static HTTPS already give offline caching, pinning, and private mirrors (`registry:` / a private git host). |
| Signing and provenance (Sigstore, SLSA) | Adopted: npm provenance for the CLI, GitHub artifact attestations for every official bundle (`verify --attestations`), integrities of all official versions pinned into each CLI release. |
| Content scanning, least privilege, approval for automation | Adopted: `scanSkill` in `add`/`update`/`info`/`verify`, `--yes` required for unattended third-party content, approval log in `history`. |
| Sandboxed execution of skills, enforcing `allowed-tools` | Not applicable to the CLI: AgileFlow never executes skills; the host agent does and enforces its own permissions and `allowed-tools`. Evals run providers in isolated sandboxes. |
| JSON output, plan/apply, doctor, history, completions, self-update | Adopted as `--json` everywhere, `--dry-run` plans on changing commands (instead of separate `plan`/`apply` commands, keeping the surface small), `doctor` alias, `history`, `completion`, `self-update --to <v>` for rollback. |
| Credentials store, provider API calls, model locking, rate limiting | Declined: AgileFlow does not call model APIs or manage credentials; provider CLIs own authentication, models, and limits (principle 7). Evals copy only each provider's own login files into an isolated HOME. |
| Provider plugins / custom providers | Adopted as data, not code: custom link providers in config; no plugin runtime. |
| Crash safety, locking, cross-platform CI, offline mode | Adopted (see "Consistency and crash safety"); CI runs Linux, macOS, and a Windows CRLF smoke test; `--offline`. |
| Eval precision/recall, confidence intervals, adversarial tests, judge reliability, isolation | Adopted in `packages/evals`. |
| Decouple Agile Work | Kept optional and lazily loaded; exposes readiness JSON for orchestrators rather than becoming one. |
| Rewrite in Rust/Go for a single binary | Declined: startup is ~0.14 s with lazy loading and the npm package ships with provenance; a rewrite would not change user-facing behavior. |
| Organization-wide indexes, SBOMs | Adopted: `agileflow registry build --scope <org>` publishes a private static registry; `verify --sbom` exports CycloneDX. |
| SSO/SCIM, IDE plugins, telemetry | Declined for the CLI: authentication belongs to whatever hosts a private registry, IDE integration is a separate product (the files are standard, so IDE agents already see them), and AgileFlow collects no telemetry. |
