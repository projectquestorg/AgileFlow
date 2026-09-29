# Changelog

All notable changes to `agileflow` are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Security

- A managed lockfile entry must record a well-formed package `integrity`; a
  missing or malformed hash makes the lock invalid instead of letting the
  source be trusted again.
- `update` refuses a registry version or git commit whose content changed since
  it was locked (published versions never change) instead of re-pinning it.
- `@agileflow/*` packages count as official only from the default registry, the
  user's environment, or personal config. A registry named in the project's
  `agileflow.yaml` is third-party, so its content goes through review and
  approval.
- Installs and updates show what trust changes, not just the version: source,
  description, activation, instructions, files, scripts, allowed tools,
  network and required commands, and new scan findings. `update --dry-run`
  shows the full third-party review, including the diff.
- `sync` asks before writing third-party content this machine has not
  installed before (a teammate's lock change, a fresh clone). Non-interactive
  runs skip it with exit 3 unless `--yes`; declining is not remembered as
  approval.
- The package cache is kept per registry, so a registry a repository once
  named can never supply bytes later read as official. The trust review also
  reports frontmatter changes (and flags `hooks`, which run commands
  automatically), and a look-alike managed notice shipped by a package is
  scanned like any other text.
- `work init` asks before installing an agile pack from a registry the
  repository chose (non-interactive runs need `--yes`).
- Registry redirects may not leave the registry's origin
  (`AGILEFLOW_ALLOW_REDIRECTS=1` to allow).
- Signed registry metadata: a pinned trust root of ed25519 publisher keys with
  rotation, and a signed snapshot that binds the manifest, with rollback and
  expiry protection. It is enforced for the official registry once the key
  ceremony pins a root (see `PUBLISHING.md`). `verify` reports whether the
  registry is signed.
- `registry:check` verifies published history against the manifest at the last
  release tag and against the integrities pinned in the CLI, so an old bundle
  rewritten together with its hashes is caught.

### Evals

- Scenarios end as passed, failed, inconclusive, or not-run, with a breakdown
  by error kind (provider, judge, isolation, setup, ungraded, ...).
  Infrastructure errors and ungraded criteria (including `--judge none`)
  never pass and exit 1. The JSON report is now schemaVersion 2.
- Inconclusive runs keep their evidence: observed activation, rule checks, the
  judge's raw reply, and the transcript. `--out` is rewritten after every
  scenario. Ctrl-C and crashes clean up provider processes, isolated HOMEs, and
  sandboxes, and leave a partial report.
- A preflight checks providers, the judge, scenario files, fixtures, and setup
  permissions before any paid run.
- Each run records which SKILL.md it loaded; a copy from outside the sandbox is
  an isolation error. Reports record provider CLI version, models, judge,
  auth mode (never secrets), skill and fixture hashes, and the AgileFlow
  version.
- Setup and bin scripts run without `--allow-setup` only for official registry
  packages, with no credentials in their environment. Providers get only
  their own credentials.
- Implicit activation, explicit invocation, and task completion are reported
  separately.
- `eval --compare` runs a skill's scenarios with no skill, the released
  version, and the candidate, under matched, interleaved conditions. It
  reports task completion, correct activation, questions asked, unnecessary
  edits, time, tokens, and cost as deltas with 95% intervals. Each scenario and
  the run overall get a verdict: improves, no measurable difference,
  regresses, or inconclusive.
- `eval --pack <name|installed>` installs a whole pack and reports which skill
  activated for which request. `--pack --compare` flags existing skills whose
  precision or recall a new skill worsens.
- `heldOut: true` scenarios are reported separately by comparisons. New
  deterministic checks: `run` (command exit code) and `maxFilesChanged`
  rubric rules, and `assert.changes`.
- `eval --lint`:
  - Optional scenario `path` (happy, blocked, failure).
  - Official skills must cover each near neighbor.
  - New checks for `references/` files, skill IDs named in descriptions, the
    `userInteraction` contract, and body length.
- Nightly CI compares changed skills against their last released versions.

### Changed

- Crash safety: every update is re-checked immediately before each skill is
  replaced, and a skill edited meanwhile is skipped. A batch is fully staged
  before anything is replaced. Previous copies are kept until the lockfile is
  written. The next command then finishes or rolls back each skill from a
  per-skill journal and says what was not applied. `list`, `check`, `diff`, and
  `verify` show such skills as "interrupted" instead of modified or missing.
- One ownership check for planning and applying: a directory never becomes
  replaceable just because its name was added to `agileflow.yaml`. Provider
  links are replaced or removed only while they are still AgileFlow's, and
  never fall back to a mirror over something that appeared at the path.
- Reproducible installs:
  - The lock records the installed-file comparison rule (`hashVersion`,
    `executables`) and the render inputs (`renderer`, `questionOverlay`).
  - A whole-file CRLF checkout is not a modification; CRLF on some lines is.
  - `+x` changes count as modifications on macOS and Linux, but not on Windows
    or with `core.fileMode=false`.
  - Teammates on different AgileFlow versions no longer rewrite each other's
    skills or lock. `update` lists renderer changes as re-render items.
  - The lockfile moves to format 2 only when these fields are used; older CLIs
    refuse format 2 instead of ignoring it.
- `check` grades providers as enforced, advisory, or visible (not verified),
  and `--verbose` shows per skill whether it is installed, discovered,
  explicitly invocable, and eligible for automatic use.
- One versioned JSON result (`schema: 1`: `applied`, `skipped`, `failed`,
  `repaired`, `warnings`, `events`) for `add`, `remove`, `sync`, `update`,
  `configure`, and `migrate`. JSON mode never prompts, and errors are only the
  JSON document.
- Faster startup: commands and their dependencies load only when used.
- Node.js 22 or newer is required (Node 20 reached end of life).
- `CODEX_HOME` and `CLAUDE_CONFIG_DIR` expand `~` and resolve relative paths.
  Codex `config.toml` edits are re-checked immediately before writing.

### Added

- `add --adopt` brings skills already in `.agents/skills` or provider folders
  under AgileFlow. It previews first, and a skill becomes managed only when it
  is byte-identical to a published version; otherwise it is locally owned.
  Skills found only in a provider folder are moved and linked back, with a
  backup.
- `agileflow outdated`: locked, wanted, and latest version per skill, marking
  third-party updates; says "not verified" when offline.
- `search` shows activation, requirements, and packs; `info` shows behavior,
  eval scenario counts, and published eval results.
- `create` scaffolds `references/`, a blocked-path eval, fixture and neighbor
  hints, and a "Not for" reminder.
- `migrate --json` and `migrate --dry-run`.
- `sync --yes` approves third-party content this machine has not installed
  before.
- Agile Work:
  - `work next` lists the stories that can start now, with the reason for each.
  - `work evidence` records evidence per acceptance criterion; `work show`
    reports each criterion as verified, stale, or not verified.
  - The v4 import previews status and dependency mappings, keeps `legacy_id`
    and `legacy_source`, uses stable IDs, and holds back conflicting items
    unless `--prefer json|markdown` is given.
- Opt-in `@agileflow/engineering` pack: writing-tests, refactoring-safely,
  writing-commits, reviewing-security, profiling-performance, and
  planning-migrations. It is not installed by default.
- Release: the packed CLI is smoke-tested in a clean HOME and PATH before
  tagging and publishing, and the published package is checked on Linux,
  macOS, and Windows. npm trusted publishing (OIDC) replaces the long-lived
  token.

### Fixed

- Agile Work writes are atomic and refused when the file changed since it was
  read. `work board` and `work list` flag duplicate IDs. `check` and
  `work new` name the exact path Git ignores. Titles with control characters
  are rejected.
- Skill boundaries: reviewing-changes reviews a diff for defects,
  verifying-changes proves one behavior, reviewing-story checks acceptance
  criteria and the Definition of Done, and writing-tests builds the test
  suite. Every official skill has a happy path, a failure or blocked path, and
  a tagged near-neighbor negative eval.
- Running from source no longer cuts off large piped output.
- Agile Work changes (`new`, `status`, `evidence`, `import`) run under the
  project lock. Evidence paths resolve from the current directory and are
  stored relative to the project. The v4 import never links an epic to a story.
- Recovery never deletes a previous copy it could not restore; it keeps it
  under `.<id>.agileflow-kept-<time>` and says where. Taking over a stale
  scope lock can no longer leave two holders.
- reviewing-story and working-story 1.1.0 record per-criterion acceptance
  evidence with `agileflow work evidence`. A story is closed only when every
  criterion has fresh evidence and the Definition of Done is met.

## [5.0.0-alpha.1] - 2026-09-27

Portable skill manager with Agile Work and hardened installs.

AgileFlow v5: portable workflows for coding agents. A clean break from v4.

### Added

- Skill manager built on standard Agent Skills: canonical `.agents/skills`,
  `agileflow.yaml` (intent) and `agileflow.lock` (exact versions, package
  integrity, installed base hash).
- Commands: `init`, `search`, `info`, `add`, `remove`, `list`, `sync`,
  `update`, `check`, `verify`, `configure`, `work`, `fork`, `diff`, `create`,
  `history`, `registry`, `migrate`, `eval`, `completion`, `self-update`.
- Static skill registry with semver resolution, integrity verification, an
  offline package cache, packs, and git/path sources.
- Provider adapters: Codex, Cursor, OpenCode, Gemini (native `.agents/skills`),
  Claude Code (per-skill links, junction or marked-mirror fallback). Manual
  skills are translated per provider.
- Update conflict handling: locally modified skills are never overwritten
  (fork, reset, skip, diff); `update --non-interactive` exits 3.
- Optional, reversible Codex structured-questions setting with exact restore.
- Fourteen official skills in four packs with evals, and an eval runner for activation and
  behavioral rubric tests against real provider CLIs.
- `migrate v4`: removes only provably AgileFlow-owned hooks, mirrors, and
  runtime files, with preview and backup; never deletes docs.
- **AgileFlow Work** (opt-in): product, roadmap, epics, stories, and decisions
  as Markdown in one directory (`docs/agile` by default) with five fixed
  categories. `agileflow work init|new|list|show|status|board`, all with
  `--json`. Collision-resistant IDs (`STORY-3Q7MX2PK`, 8 random Crockford
  Base32 characters) with unambiguous prefixes (`agileflow work show 3Q7M`).
  Boards, epic progress, and relationships are derived from frontmatter; no
  status file, board file, index, or counter is written. Status changes patch
  only the `status:` line. `agileflow check` validates the workspace (duplicate
  IDs, unknown epics, dependencies, and decision references, dependency cycles,
  done epics with unfinished stories, done stories with unchecked acceptance
  criteria). `agileflow init` offers it; `work init` adopts a compatible
  existing workspace after confirmation and never overwrites files.
- `@agileflow/agile` pack with four skills: `creating-epics`,
  `writing-stories`, `working-story`, and `reviewing-story`.
- JSON Schemas for Work artifacts in `schemas/work/`.

### Changed

- `filing-pr` 1.1.0 includes the AgileFlow story ID and a brief
  acceptance-criteria summary when the work is tied to a story, and moves the
  story to `in-review`; `babysitting-pr` 1.1.0 keeps the story `in-review` until
  merge and final verification.
- `agileflow check` reports warnings in its result line ("healthy with 1 warning").
- Full-mode eval judges also see the final sandbox changes (status, diffs, new
  file contents), not only truncated tool inputs.
- `interaction.questionPreference` is a render overlay with exact semantics:
  `prefer` asks when multiple reasonable choices would materially change the
  result, after resolving what the repository answers (structured question
  tool when available, plain text otherwise); `minimize` assumes, continues,
  and states consequential assumptions. The skill's `userInteraction`
  contract wins: `none` gets no overlay, and `required` skills still ask what
  their workflow needs under `minimize`.
- `diagnosing-bugs` 1.0.1 declares decision points; `interviewing-requirements`
  1.0.1 no longer reads `agileflow.yaml` itself; `simplifying-explanations`
  1.0.1 declares `userInteraction: none`.
- The lockfile field `baseHash` is now `renderedHash`, next to `integrity`
  (the source package). A skill with local modifications reports when a new
  preference was not applied, and `agileflow diff` no longer attributes a
  preference change to your edits.
- `agileflow eval --question-preference provider-default|prefer|minimize|all`
  runs scenarios under a preference; `all` compares the three. Scenarios with
  an `interaction` block (`choice`, `missing-information`,
  `repository-answerable`) check the expected asking behavior, and in full
  mode a judge records whether questions were material or answerable from the
  repository, whether assumptions were reasonable, and whether the task
  succeeded. A synthetic `fixtures/skills/interaction-test` skill isolates
  question behavior from real skill guidance.

### Added (hardening and ecosystem, 2026-09)

- `agileflow search <query>`: the official catalog (works offline from the
  cached index) and the public skills.sh directory, with the exact `add`
  argument for each result.
- GitHub and skills.sh sources: `agileflow add owner/repo`,
  `owner/repo/skill`, `owner/repo@ref`, `github:owner/repo`, and
  `https://github.com/o/r/tree/<ref>/<path>`; `add --ref`. Git sources fetch
  only the needed subdirectory and lock the commit and the requested ref.
- `agileflow info <target>`: versions, license, compatibility,
  `allowed-tools`, files, requirements, a content risk scan, and optionally
  `SKILL.md`, before installing.
- `agileflow verify [--attestations] [--fail-on high|medium]`: re-verifies
  every locked package against the lockfile and the integrities pinned into
  the CLI, checks installed files, scans content, and verifies GitHub
  (Sigstore) build attestations of official bundles with `gh`.
- `agileflow create <name>`: scaffolds a skill (SKILL.md with a "Done when"
  section, sidecar, eval scenarios from `--trigger`/`--not-trigger`) that
  passes the release-gate lint.
- `agileflow history`: local log of what changed where, and which
  third-party content was approved.
- `agileflow completion bash|zsh|fish`, `agileflow self-update [--to <v>]`
  (rollback with an exact version), `agileflow configure show`, and the
  aliases `doctor` (`check`), `install` (`add`), and `config` (`configure`).
- `agileflow registry build|check --scope <org>`: build a private team
  registry (organization-wide skill index) with the official format and
  append-only rules.
- `agileflow verify --sbom`: a CycloneDX 1.5 bill of materials of the locked
  skills (version, source, commit, license, verification results).
- `--json` on every command (one JSON document on stdout; errors as
  `{"ok": false, "error": {...}}`), `--dry-run` plans for `add`, `remove`,
  `sync`, and `update`, and global `--offline`, `--debug`, `--no-color`.
- Content scanning for untrusted skills (pipe-to-shell, destructive commands,
  credential access, exfiltration, prompt-injection phrasing, hidden Unicode
  and HTML comments, encoded payloads, broad `allowed-tools`, undeclared
  network use), shown by `add`, `update`, `info`, and `verify`.
- Custom providers from configuration: `providers.<id>.skillsDir` /
  `userSkillsDir` link skills into any agent's skill directory.
- `agileflow:` in `agileflow.yaml`: the CLI version range a project needs;
  older CLIs refuse to change it.
- Registry: `v1/manifest.json` (append-only record of every published
  version), JSON Schemas for registry documents in `schemas/registry/`,
  official integrities pinned into each CLI release.
- Evals: activation precision, recall, and F1 per skill and provider;
  Wilson 95% intervals for `--runs > 1`; side-by-side provider comparison;
  deterministic rubric checks; `kind: adversarial` scenarios with `forbid`
  rules; `--judge-model`; isolated HOME per run (`--no-isolate` to opt out);
  `--allow-setup` for third-party setup scripts; JSON reports with
  `schemaVersion`; scenario `bin:` stand-in commands (for example a scripted
  `gh`, so `babysitting-pr` evals are scored against a realistic pull request)
  and `neighbor:` negatives that measure trigger conflicts between skills.
- Agile Work: `work list --ready` and per-story readiness in JSON for agent
  orchestrators, `work import v4` (idempotent, never touches the v4 files),
  and a warning when the workspace directory is ignored by Git.
- New official skill `recording-decisions` (agile pack); `resolving-conflicts`
  moved to the core pack. Agile skill descriptions say what, when, and what
  not; `reviewing-changes`, `verifying-changes`, and `checking-blast-radius`
  triggers no longer overlap; skills that never ask state their assumptions;
  `filing-pr` hands over the drafted PR when `gh` is unavailable and
  `babysitting-pr` falls back to bounded polling. Eval fixtures can now
  satisfy every rubric (extended `monorepo`, new `ops-dashboard`).
- A reusable GitHub Action (`uses: projectquestorg/AgileFlow@<ref>`) that runs
  `check`, `verify`, and optionally the lint for skills you author.

### Security

- Git refs and commits from `agileflow.yaml`/`agileflow.lock` are validated
  and passed after `--end-of-options`: a cloned repository can no longer make
  `sync` or `update` run commands through a crafted ref.
- Registries must use HTTPS (loopback and `AGILEFLOW_ALLOW_INSECURE=1`
  excepted); redirects cannot downgrade; git is limited to https, ssh, and
  file transports; git never prompts (ssh `BatchMode`) and times out.
- Registry documents are schema-validated and cross-checked (names, versions,
  bundle headers); bundle URLs must stay inside the registry; cache paths are
  derived only from validated names.
- Third-party content needs `--yes` when not interactive; `update` shows
  third-party diffs and findings and skips unapproved changes (exit 3).
- Config writes keep file permissions (a `0600` Codex config stays `0600`)
  and write through symlinks instead of replacing them.
- `eval` runs providers with an isolated HOME and does not run third-party
  scenario setup scripts without `--allow-setup`.
- CI publishes with npm provenance after checking the tag matches the version
  and is on `main`; every official registry bundle gets a GitHub build
  attestation.

### Fixed

- `update` no longer installs over a hand-written skill directory, no longer
  fails after partially applying when a skipped skill's config changed, and
  reports exit 3 as documented.
- Multi-skill writes are journaled: a failure or crash part-way leaves every
  skill either updated and recorded or untouched (no false "modified"
  skills, no orphan directories), and the next command finishes or rolls
  back an interrupted write.
- Concurrent commands on one project no longer lose each other's updates
  (advisory scope lock).
- Skills checked out with CRLF line endings or without exec bits (Windows,
  `core.autocrlf`) are no longer reported as modified; git checkouts are
  byte-identical on every OS.
- Files AgileFlow cannot hash (symlinks, nested `.git`, `node_modules`, empty
  directories) inside a managed skill mark it modified instead of being
  deleted on the next update.
- `sync` no longer rewrites committed skills just because a teammate uses a
  different AgileFlow version; `update` refreshes them.
- Git `ref` changes in `agileflow.yaml` are detected by `sync` and `check`.
- `add` of a skill still in the lock no longer overwrites local edits;
  duplicate ids in one request are refused.
- `remove` keeps the records `sync` needs to clean up skills a teammate
  removed.
- The home directory is never treated as a project.
- `check` no longer downloads packages (it verifies the cache; `verify`
  downloads), and a personal config without skills no longer makes `check`
  fail in every project.
- Lockfiles written by a newer AgileFlow keep their extra fields; a newer
  format version stops with an upgrade message.
- Path sources whose files changed report a warning (run `update`), not an
  integrity error.
- `remove --all --global` keeps personal defaults, provider settings, and the
  registry setting, strips the managed notice from mirrors, and restores the
  Codex setting AgileFlow changed (when nobody edited it since).
- OpenCode manual-only activation is reported as semantic (OpenCode has no
  switch); `CLAUDE_CONFIG_DIR` and `CODEX_HOME` are honored; Claude links work
  when `.claude` is a symlink; stale Windows junctions and Git-degraded
  symlinks are repaired; Codex TOML edits never produce a duplicate
  `[features]` table.
- `migrate v4` also cleans a user-level v4 install (`migrate v4 --global`),
  warns about Codex `approval_policy = "never"` / `danger-full-access`,
  preserves `config.toml` comments, validates `--skills` before changing
  anything, and asks before `--detach`.
- Agile Work: status edits handle quoted keys, flow mappings, CRLF, and BOMs;
  duplicate and ambiguous IDs are reported; deep dependency chains no longer
  overflow; large workspaces scan in linear time; titles are sanitized in
  terminal output.

### Changed (hardening)

- Commands load lazily; startup is about 0.14 s. `sync` and `update` fetch
  packages in parallel (bounded) and show progress on a terminal.
- The lockfile records `ref` for git sources, and `renderedHash` is
  line-ending and exec-bit insensitive (older exact hashes are still
  accepted).
- CI runs on Linux, macOS, and Windows (CRLF clone smoke test), installs from
  the lockfile, and rejects changes to published registry files; a nightly
  workflow checks the live registry, provider conformance, and activation
  evals.

### Removed

- v4 plugins, agents, hook runtime and `hook` command, `setup`, `launch`,
  `learn`, `plugins`, `skills`, and `status` (`doctor` is an alias of `check`), the eleven-folder docs scaffolding, the central
  story/epic status JSON, skill learnings, `AGENTS.md`/`CLAUDE.md` generation, and all
  provider sandbox/approval changes.

## Earlier versions

AgileFlow 5 is a clean break. The changelog for v4 and earlier lives on the [`v4` branch](https://github.com/projectquestorg/AgileFlow/blob/v4/apps/cli/CHANGELOG.md).
