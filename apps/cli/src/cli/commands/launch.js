/**
 * `agileflow launch`.
 *
 * Two surfaces:
 *   - `agileflow launch setup`  — always runs the prefs wizard.
 *   - `agileflow launch`         — runs setup on first invocation
 *                                  (no prefs file); otherwise loads
 *                                  prefs, resolves the user's preferred
 *                                  AI CLI, and either wraps it in a
 *                                  per-cwd tmux session (if tmux is
 *                                  installed and enabled in prefs) or
 *                                  plain-spawns it as a foreground
 *                                  child.
 *
 * Errors here go through the typed-error / `fail()` plumbing in
 * `src/lib/errors.js` so messages stay consistent with `setup` /
 * `doctor` / etc.
 */
const fs = require("fs");
const path = require("path");
const prompts = require("@clack/prompts");
const pkg = require("../../../package.json");
const { logoBanner, questionMessage } = require("../../lib/brand.js");
const {
  loadPrefs,
  writePrefs,
  prefsExist,
} = require("../../runtime/launch/prefs.js");
const { pickCli } = require("../wizard/launch-cli-picker.js");
const { pickTmux } = require("../wizard/launch-tmux-picker.js");
const { pickAliases } = require("../wizard/launch-alias-picker.js");
const { resolveCli } = require("../../runtime/launch/resolve-cli.js");
const { runCli } = require("../../runtime/launch/spawn.js");
const {
  isInsideTmux,
  tmuxAvailable,
  launchInTmux,
  listSessionsForCli,
  killSession,
  defaultRunner: defaultTmuxRunner,
} = require("../../runtime/launch/tmux.js");
const {
  runParallelSpawn,
} = require("../../runtime/launch/parallel-session.js");
const { runExec } = require("../../runtime/launch/exec-wrapper.js");
const { runRestore } = require("../../runtime/launch/restore.js");
const {
  loadRegistry,
  pinSession,
} = require("../../runtime/launch/session-registry.js");
const {
  listSessions,
  killBySessionName,
  attachByName,
  pruneCandidates,
  applyPrune,
} = require("../../runtime/launch/session-lifecycle.js");
const {
  runDoctorChecks,
  anyFailed,
} = require("../../runtime/launch/doctor.js");
const {
  installAfAlias,
  uninstallAfAlias,
  resolveAgileflowBin,
} = require("../../runtime/launch/alias-installer.js");
const { loadCascadedPrefs } = require("../../runtime/launch/project-prefs.js");
const closedWindows = require("../../runtime/launch/closed-windows.js");
const {
  AgileflowError,
  OperationFailedError,
  fail,
} = require("../../lib/errors.js");

/**
 * Pure helper for unit testing: decide which flow to enter given the
 * subcommand name and whether a prefs file exists.
 *
 * @param {{ sub?: string, hasPrefs: boolean }} input
 * @returns {'setup' | 'engine' | 'first-run-setup'}
 */
function decideFlow({ sub, hasPrefs }) {
  if (sub === "setup") return "setup";
  if (!hasPrefs) return "first-run-setup";
  return "engine";
}

/**
 * Load prefs, or `fail()` with the actionable hint that matches the
 * inner-wizard error path. Without this, the bare-launch / first-run-tail
 * call sites fall through to the catch-all `OperationFailedError` wrapper
 * and the user gets a generic "re-run with DEBUG=1" message for what is
 * really a "fix or delete the prefs file" situation.
 *
 * @returns {Promise<Awaited<ReturnType<typeof loadPrefs>>>}
 */
async function loadPrefsOrFail() {
  try {
    // Cascade: defaults ← global ~/.agileflow ← project .agileflow.
    // Returns the same shape as loadPrefs() (prefs + source path) plus
    // a `sources` audit trail consumed by `agileflow launch where`.
    const cascaded = await loadCascadedPrefs();
    // Preserve the loadPrefs() shape so existing callers that destructure
    // { prefs } keep working. The extra `sources` field is silently
    // ignored by destructures that don't ask for it.
    return {
      prefs: cascaded.prefs,
      // `source` here reflects the HIGHEST-precedence layer that
      // contributed, since downstream messages like "fix or delete the
      // prefs file" need a single concrete path to point at. If the
      // project file is present, that's the most-recently-edited file.
      source: cascaded.sources.some((s) => s.layer === "project")
        ? "file"
        : cascaded.sources.some((s) => s.layer === "global")
          ? "file"
          : "defaults",
      path:
        (cascaded.sources.find((s) => s.layer === "project") || {}).path ||
        (cascaded.sources.find((s) => s.layer === "global") || {}).path ||
        "",
      sources: cascaded.sources,
    };
  } catch (err) {
    fail(
      new OperationFailedError(err.message, {
        suggestion:
          "fix or delete the prefs file and re-run `agileflow launch setup`",
        cause: err,
      }),
      { command: "launch" },
    );
  }
}

/**
 * Pure helper: decide whether to offer orphan cleanup, given the prior
 * preferred CLI, the new one, and whether tmux is available. Extracted
 * so unit tests can cover the decision matrix without spinning up tmux.
 *
 * @param {{
 *   oldPreferred: string | undefined,
 *   newPreferred: string,
 *   tmuxAvailable: boolean,
 *   existingSource: 'file' | 'defaults',
 * }} input
 * @returns {boolean}
 */
function shouldOfferOrphanCleanup({
  oldPreferred,
  newPreferred,
  tmuxAvailable: tmuxOk,
  existingSource,
}) {
  if (existingSource !== "file") return false; // first-time setup has no orphans
  if (!tmuxOk) return false;
  if (!oldPreferred || oldPreferred === newPreferred) return false;
  return true;
}

/**
 * Run the interactive setup wizard. Used by both explicit `launch setup`
 * and first-run from bare `launch`.
 *
 * Returns the prefs object that was just persisted so the first-run path
 * can hand it straight to runEngine without re-reading from disk — which
 * avoids surfacing a misleading "fix or delete the prefs file" hint in
 * the rare case where the file becomes unreadable immediately after a
 * successful write.
 *
 * @returns {Promise<import('../../runtime/launch/defaults.js').LaunchPrefs>}
 */
async function runSetup() {
  // eslint-disable-next-line no-console
  console.log("\n" + logoBanner(pkg.version) + "\n");
  prompts.intro("agileflow launch — setup");

  /** @type {Awaited<ReturnType<typeof loadPrefs>>} */
  let existing;
  try {
    existing = await loadPrefs();
  } catch (err) {
    prompts.log.error(err.message);
    prompts.cancel("Fix or delete the prefs file and re-run.");
    process.exit(1);
  }

  if (existing.source === "file") {
    prompts.log.info(
      `Existing prefs at ${existing.path} — re-running wizard to update.`,
    );
  } else {
    prompts.log.info("No prefs found — starting from defaults.");
  }

  const base = existing.prefs;

  const cli = await pickCli(base);
  const tmuxAndKeybinds = await pickTmux(base);
  const aliases = await pickAliases(base);

  const next = {
    version: /** @type {1} */ (1),
    cli,
    tmux: tmuxAndKeybinds.tmux,
    keybinds: tmuxAndKeybinds.keybinds,
    aliases,
    pinned: base.pinned,
  };

  // Orphan cleanup: when the user switches their preferred CLI, the old
  // `<old-cli>-<dir>` sessions stop being reachable through `launch` but
  // keep occupying the tmux server. Offer to kill them while we have the
  // user's attention — declining is fine, they can clean up manually later.
  if (
    shouldOfferOrphanCleanup({
      oldPreferred: base.cli.preferred,
      newPreferred: cli.preferred,
      tmuxAvailable: tmuxAvailable(),
      existingSource: existing.source,
    })
  ) {
    const runner = defaultTmuxRunner();
    const orphans = listSessionsForCli(base.cli.preferred, runner);
    if (orphans.length > 0) {
      const choice = await prompts.confirm({
        message: questionMessage(
          `Kill ${orphans.length} stale tmux session(s) from your previous CLI (${base.cli.preferred})?`,
          orphans.join(", "),
        ),
        initialValue: true,
      });
      if (prompts.isCancel(choice)) {
        prompts.cancel("Setup cancelled. No changes made.");
        process.exit(1);
      }
      if (choice) {
        let killed = 0;
        let failed = 0;
        for (const name of orphans) {
          if (killSession(name, runner)) killed++;
          else failed++;
        }
        if (killed > 0) {
          prompts.log.info(`Killed ${killed} orphaned session(s).`);
        }
        if (failed > 0) {
          prompts.log.warn(
            `${failed} session(s) could not be killed — check \`tmux ls\`.`,
          );
        }
      }
    }
  }

  // Apply the alias side-effect BEFORE writing prefs. Writing first
  // risks recording `aliases.af.enabled = true` to disk when the symlink
  // failed to materialize — on next invocation we'd then lie about the
  // alias being installed. Run the install/uninstall, reconcile the
  // `next` object against what actually happened, then persist.
  /** @type {string[]} */
  const aliasSummary = [];

  if (aliases.af.enabled) {
    const aliasSpinner = prompts.spinner();
    aliasSpinner.start("Installing `af` alias");
    const result = await installAfAlias();
    if (result.status === "installed" || result.status === "updated") {
      aliasSpinner.stop(
        `Alias ${result.status} → ${result.path} → ${result.target}`,
      );
      if (!result.onPath) {
        prompts.log.warn(
          `${path.dirname(result.path)} is not on your PATH. Add this to your shell rc:\n  ` +
            `export PATH="$HOME/.local/bin:$PATH"`,
        );
      }
      aliasSummary.push(`af alias: ${result.status} (${result.path})`);
    } else if (result.status === "unchanged") {
      aliasSpinner.stop("Alias already in place");
      aliasSummary.push(`af alias: unchanged (${result.path})`);
    } else if (result.status === "unsupported") {
      aliasSpinner.stop("Alias not auto-installable on this platform");
      prompts.log.warn(result.message || "Unsupported platform");
      aliasSummary.push("af alias: skipped (platform)");
      // Reconcile: no symlink exists, so persist that truth.
      next.aliases.af.enabled = false;
    } else {
      aliasSpinner.stop("Alias install failed");
      prompts.log.warn(
        `${result.message || "unknown failure"}\n  ` +
          "Re-run `agileflow launch setup` to retry, or create the symlink manually.",
      );
      aliasSummary.push("af alias: failed");
      // Reconcile: install failed → no symlink exists.
      next.aliases.af.enabled = false;
    }
  } else {
    // User declined — clean up any previous symlink we installed.
    const aliasSpinner = prompts.spinner();
    aliasSpinner.start("Checking `af` alias");
    const removal = await uninstallAfAlias();
    if (removal.status === "removed") {
      aliasSpinner.stop(`Alias removed → ${removal.path}`);
      aliasSummary.push(`af alias: removed (${removal.path})`);
    } else if (removal.status === "absent") {
      aliasSpinner.stop("Alias not present");
      aliasSummary.push("af alias: not present");
    } else if (removal.status === "skipped") {
      aliasSpinner.stop("Alias points elsewhere — left untouched");
      prompts.log.warn(
        removal.message ||
          `${removal.path} points at a different binary; remove it manually to free the name.`,
      );
      aliasSummary.push("af alias: skipped (foreign symlink)");
    } else if (removal.status === "failed") {
      aliasSpinner.stop("Alias removal failed");
      prompts.log.warn(
        `Could not remove existing af alias at ${removal.path}: ${
          removal.message || "unknown error"
        }`,
      );
      aliasSummary.push(`af alias: removal failed (${removal.path})`);
    }
  }

  const writeSpinner = prompts.spinner();
  writeSpinner.start("Writing launch-prefs.json");
  /** @type {string} */
  let file;
  try {
    file = await writePrefs(next);
  } catch (err) {
    writeSpinner.stop("Prefs write failed");
    prompts.log.error(err.message);
    process.exit(1);
  }
  writeSpinner.stop(`Prefs written → ${file}`);

  /** @type {string[]} */
  const summary = [
    `preferred CLI: ${cli.preferred}`,
    `fallback order: ${cli.fallbackOrder.join(" → ")}`,
    tmuxAndKeybinds.tmux.enabled
      ? `tmux: on (status ${tmuxAndKeybinds.tmux.statusPosition}, keybinds ${tmuxAndKeybinds.keybinds.preset})`
      : "tmux: off",
    ...aliasSummary,
  ];

  prompts.outro(summary.join("\n"));

  return next;
}

/**
 * Resolve the AI CLI from prefs and launch it as a foreground child.
 * Exits the parent with the child's exit code so shell pipelines see
 * the right status.
 *
 * Slice 2b: when `prefs.tmux.enabled === true` AND tmux is on PATH AND
 * we're not already inside a tmux client, wrap the CLI in a per-cwd
 * tmux session via `launchInTmux`. Otherwise — including the
 * "tmux=true but unavailable / nested" fallback paths — plain-spawn the
 * CLI (slice 2a behavior).
 *
 * @param {import('../../runtime/launch/defaults.js').LaunchPrefs} prefs
 * @returns {Promise<never>}
 */
async function runEngine(prefs) {
  const { resolved, tried } = resolveCli(prefs);
  if (!resolved) {
    fail(
      new OperationFailedError(
        `no configured AI CLI is installed (tried ${tried.join(", ")})`,
        {
          suggestion:
            "install one of the supported CLIs (claude, codex, cursor-agent, aider), " +
            "or run `agileflow launch setup` to update your fallback order",
        },
      ),
      { command: "launch" },
    );
  }

  if (prefs.tmux.enabled) {
    if (isInsideTmux()) {
      // Nesting tmux sessions is allowed but confusing — and the v3 `af`
      // explicitly avoided it. Plain-spawn in the current pane.
      // eslint-disable-next-line no-console
      console.error(
        `agileflow launch: already inside a tmux session — launching ${resolved.bin} in the current pane.`,
      );
    } else if (!tmuxAvailable()) {
      // eslint-disable-next-line no-console
      console.error(
        `agileflow launch: tmux is not installed — launching ${resolved.bin} directly. Install tmux to enable session management.`,
      );
    } else {
      try {
        const result = await launchInTmux({
          bin: resolved.bin,
          args: [],
          statusPosition: prefs.tmux.statusPosition,
          keybindPreset: prefs.keybinds.preset,
        });
        process.exit(result.exitCode);
      } catch (err) {
        fail(
          new OperationFailedError(
            `tmux launch failed: ${err && err.message ? err.message : String(err)}`,
            {
              suggestion:
                "verify tmux works (`tmux new-session -d -s test && tmux kill-session -t test`), " +
                "or disable tmux via `agileflow launch setup`",
              cause: err,
            },
          ),
          { command: "launch" },
        );
      }
    }
  }

  const result = await runCli(resolved.bin, []);
  process.exit(result.exitCode);
}

/**
 * `agileflow launch new [name]` — spawn a parallel session (same-dir or
 * worktree-backed) and switch the user's tmux client to it. Bound by
 * default to Alt+s (no name) and Alt+n (prompts for a name) via the
 * default keybind preset.
 *
 * Pre-conditions:
 *   - prefs file must exist (no auto-setup here — `new` only makes sense
 *     after the user has already configured launch)
 *   - we must be inside a tmux client (switch-client needs a current
 *     client; outside tmux there is no session to swap from)
 *   - the user's preferred CLI must be installed
 *   - tmux must be on PATH (it's a prerequisite for being "inside tmux"
 *     so this should always hold, but we guard defensively)
 *
 * Returns void on success (user is now inside the new session via
 * switch-client; the parent process exits cleanly with status 0). All
 * failure paths call `fail()` which calls `process.exit(1)`.
 *
 * @param {string | undefined} name  - worktree name; omit for same-dir
 * @returns {Promise<void>}
 */
async function runNew(name) {
  if (!(await prefsExist())) {
    fail(
      new OperationFailedError("agileflow launch new requires prefs first", {
        suggestion: "run `agileflow launch setup` to create launch-prefs.json",
      }),
      { command: "launch" },
    );
  }

  if (!isInsideTmux()) {
    fail(
      new OperationFailedError(
        "agileflow launch new only works inside an existing tmux session",
        {
          suggestion:
            "run `agileflow launch` first to start a session, then use Alt+s / Alt+n inside it",
        },
      ),
      { command: "launch" },
    );
  }

  if (!tmuxAvailable()) {
    fail(
      new OperationFailedError(
        "tmux is not available — required for `launch new`",
        { suggestion: "install tmux and try again" },
      ),
      { command: "launch" },
    );
  }

  const { prefs } = await loadPrefsOrFail();
  const { resolved, tried } = resolveCli(prefs);
  if (!resolved) {
    fail(
      new OperationFailedError(
        `no configured AI CLI is installed (tried ${tried.join(", ")})`,
        {
          suggestion:
            "install one of the supported CLIs (claude, codex, cursor-agent, aider), " +
            "or run `agileflow launch setup` to update your fallback order",
        },
      ),
      { command: "launch" },
    );
  }

  try {
    await runParallelSpawn({
      bin: resolved.bin,
      name,
      prefs,
    });
  } catch (err) {
    const code = err && err.code;
    let suggestion = "re-run with DEBUG=1 for a stack trace";
    if (code === "EWT_DIR_EXISTS") {
      suggestion =
        "remove the existing worktree directory or pick a different name";
    } else if (code === "EWT_BRANCH_EXISTS") {
      suggestion = "the branch already exists — pick a different name";
    } else if (code === "EWT_NOT_REPO") {
      suggestion =
        "run from inside a git repository, or omit the name for a same-dir session";
    } else if (code === "EWT_NO_HEAD") {
      suggestion =
        "check out a branch first (HEAD is detached), or pass an explicit base via prefs";
    } else if (code === "EWT_BAD_NAME") {
      suggestion =
        "pick a name with letters, digits, dot, underscore, or hyphen";
    } else if (code === "EWT_CREATE") {
      suggestion =
        "git worktree add failed; inspect the repo state and try again, or omit the name for a same-dir session";
    } else if (code === "ETMUX_CREATE") {
      suggestion =
        "tmux session creation failed; verify tmux works (`tmux new-session -d -s test && tmux kill-session -t test`)";
    } else if (code === "ETMUX_SWITCH") {
      // The session is alive but switch-client didn't take. Tell the user
      // exactly how to attach to it manually.
      suggestion =
        "switch-client failed but the new session is still running — attach with `tmux attach -t <session-name>` (see error message above for the name)";
    }
    fail(
      new OperationFailedError(
        `launch new failed: ${err && err.message ? err.message : String(err)}`,
        { suggestion, cause: err },
      ),
      { command: "launch" },
    );
  }
  // runParallelSpawn returns normally after switch-client. We don't
  // process.exit — the user is now inside the new session and this
  // invocation finishes cleanly with exit code 0.
}

/**
 * `agileflow launch restore` — bulk-restore every session in the
 * registry that isn't currently alive on the tmux server. Used after a
 * reboot (or `tmux kill-server`) to bring back the tabs the user had
 * before. Idempotent.
 *
 * @returns {Promise<void>}
 */
async function runRestoreCommand() {
  if (!(await prefsExist())) {
    fail(
      new OperationFailedError(
        "agileflow launch restore requires prefs first",
        {
          suggestion:
            "run `agileflow launch setup` to create launch-prefs.json",
        },
      ),
      { command: "launch" },
    );
  }
  if (!tmuxAvailable()) {
    fail(
      new OperationFailedError(
        "tmux is not available — required for `launch restore`",
        { suggestion: "install tmux and try again" },
      ),
      { command: "launch" },
    );
  }
  const { prefs } = await loadPrefsOrFail();
  const reg = loadRegistry();
  if (reg.sessions.length === 0) {
    // eslint-disable-next-line no-console
    console.error(
      "agileflow launch: no saved sessions to restore (registry is empty).",
    );
    return;
  }

  const result = runRestore({ prefs });
  // eslint-disable-next-line no-console
  console.error(
    `agileflow launch: restored ${result.restored}, already-alive ${result.alreadyAlive}, ` +
      `skipped ${result.skipped}, failed ${result.failed}`,
  );
  if (result.failed > 0 || result.skipped > 0) {
    for (const note of result.notes) {
      // eslint-disable-next-line no-console
      console.error(`  ${note.name}: ${note.reason}`);
    }
  }
}

/**
 * `agileflow launch ls` — print a one-line-per-session table of every
 * known session with its current state. Read-only; no prefs required.
 *
 * @returns {Promise<void>}
 */
async function runLs() {
  const rows = listSessions();
  if (rows.length === 0) {
    // eslint-disable-next-line no-console
    console.log("No saved sessions. Run `agileflow launch` to create one.");
    return;
  }
  // Pinned entries float to the top so the user sees their "always keep"
  // sessions first. Within each group, original registry order is
  // preserved (which is roughly creation order).
  rows.sort(
    (a, b) => (b.pinned === true ? 1 : 0) - (a.pinned === true ? 1 : 0),
  );
  // Column widths sized to the longest value, capped to keep wide cwds
  // from blowing past the terminal. Leading column reserves a glyph for
  // the pin marker so pinned/unpinned rows align.
  const nameW = Math.max(4, ...rows.map((r) => r.name.length));
  const cliW = Math.max(3, ...rows.map((r) => r.cli.length));
  const stateW = "missing-cwd".length;
  const pinMark = (r) => (r.pinned ? "★" : " ");
  const fmt = (r) =>
    `${pinMark(r)} ${r.name.padEnd(nameW)}  ${r.cli.padEnd(cliW)}  ${r.state.padEnd(stateW)}  ${r.cwd}${
      r.worktree && r.worktree.branch ? ` [wt ${r.worktree.branch}]` : ""
    }`;
  // eslint-disable-next-line no-console
  console.log(
    `  ${"NAME".padEnd(nameW)}  ${"CLI".padEnd(cliW)}  ${"STATE".padEnd(stateW)}  CWD`,
  );
  for (const r of rows) {
    // eslint-disable-next-line no-console
    console.log(fmt(r));
  }
}

/**
 * `agileflow launch kill <name>` — kill the tmux session if alive,
 * forget the registry entry, and optionally remove its git worktree.
 *
 * @param {string | undefined} name
 * @returns {Promise<void>}
 */
async function runKill(name) {
  if (!name) {
    fail(
      new OperationFailedError(
        "agileflow launch kill requires a session name",
        {
          suggestion: "run `agileflow launch ls` to see available names",
        },
      ),
      { command: "launch" },
    );
  }
  const reg = loadRegistry();
  const entry = reg.sessions.find((s) => s.name === name);
  if (!entry) {
    fail(
      new OperationFailedError(`no session named "${name}" in the registry`, {
        suggestion: "run `agileflow launch ls` to see available names",
      }),
      { command: "launch" },
    );
  }
  // Surface the worktree question only when there's something to remove —
  // missing worktree dirs don't need a prompt, just forget the entry.
  let removeWorktreeFlag = false;
  if (
    entry.worktree &&
    entry.worktree.path &&
    fs.existsSync(entry.worktree.path)
  ) {
    const choice = await prompts.confirm({
      message: questionMessage(
        `Also remove the worktree at ${entry.worktree.path}?`,
        `branch: ${entry.worktree.branch} — this runs \`git worktree remove -f\` and \`git branch -D\`.`,
      ),
      initialValue: true,
    });
    if (prompts.isCancel(choice)) {
      prompts.cancel("Kill cancelled.");
      process.exit(0);
    }
    removeWorktreeFlag = !!choice;
  }
  const result = killBySessionName({
    name,
    removeWorktree: removeWorktreeFlag,
  });
  if (!result.ok) {
    fail(
      new OperationFailedError(
        `could not kill "${name}": ${result.reason || "unknown reason"}`,
        { suggestion: "run `agileflow launch ls` to confirm the name" },
      ),
      { command: "launch" },
    );
  }
  /** @type {string[]} */
  const summary = [];
  summary.push(
    result.wasAlive
      ? `Killed tmux session "${name}" and forgot it.`
      : `Forgot dormant session "${name}".`,
  );
  if (result.worktree) {
    if (result.worktree.removed && result.worktree.branchRemoved) {
      summary.push(`Removed worktree + branch.`);
    } else if (result.worktree.removed) {
      summary.push(`Removed worktree (branch removal failed).`);
    } else {
      summary.push(`Worktree removal failed: ${result.worktree.stderr}`);
    }
  }
  // eslint-disable-next-line no-console
  console.log(summary.join("\n"));
}

/**
 * `agileflow launch attach <name>` — attach to a named session, lazily
 * restoring it from the registry if the tmux server doesn't have it.
 *
 * @param {string | undefined} name
 * @returns {Promise<void>}
 */
async function runAttachByName(name) {
  if (!name) {
    fail(
      new OperationFailedError(
        "agileflow launch attach requires a session name",
        {
          suggestion: "run `agileflow launch ls` to see available names",
        },
      ),
      { command: "launch" },
    );
  }
  if (!tmuxAvailable()) {
    fail(
      new OperationFailedError(
        "tmux is not available — required for `launch attach`",
        { suggestion: "install tmux and try again" },
      ),
      { command: "launch" },
    );
  }
  const { prefs } = await loadPrefsOrFail();
  const result = await attachByName({
    name,
    prefs,
    agileflowBin: resolveAgileflowBin(),
  });
  if (!result.ok) {
    /** @type {string} */
    let suggestion;
    if (result.reason === "not in registry") {
      suggestion = "run `agileflow launch ls` to see available names";
    } else if (result.reason === "cwd missing") {
      suggestion = `the original directory has been deleted — run \`agileflow launch kill ${name}\` to forget it`;
    } else {
      suggestion = "check tmux state and the registry file";
    }
    fail(
      new OperationFailedError(
        `could not attach "${name}": ${result.reason || "unknown reason"}`,
        { suggestion },
      ),
      { command: "launch" },
    );
  }
  // Always exit with the attach's exit code so shell pipelines see the
  // right status. Defensive default of 0 covers the unlikely case where
  // the attach result doesn't carry a numeric exitCode — better to exit
  // cleanly than leave the parent process hung in the terminal.
  const exitCode =
    result.attach &&
    typeof result.attach === "object" &&
    typeof result.attach.exitCode === "number"
      ? result.attach.exitCode
      : 0;
  process.exit(exitCode);
}

/**
 * `agileflow launch prune` — interactive cleanup of dormant entries
 * whose original directory has been deleted, or whose worktree path no
 * longer exists.
 *
 * @returns {Promise<void>}
 */
async function runPrune() {
  const candidates = pruneCandidates();
  if (candidates.length === 0) {
    // eslint-disable-next-line no-console
    console.log(
      "Nothing to prune — every registered session still has a live cwd.",
    );
    return;
  }
  const options = candidates.map((c) => ({
    value: c.name,
    label: c.name,
    hint: `${c.cli} — ${c.reason}`,
  }));
  const selection = await prompts.multiselect({
    message: questionMessage(
      `Select session(s) to forget (${candidates.length} candidate(s))`,
      "Forgetting drops the registry entry; worktree dirs are only removed if they still exist.",
    ),
    options,
    initialValues: options.map((o) => o.value),
    required: false,
  });
  if (prompts.isCancel(selection)) {
    prompts.cancel("Prune cancelled.");
    process.exit(0);
  }
  if (!Array.isArray(selection) || selection.length === 0) {
    // eslint-disable-next-line no-console
    console.log("No sessions selected. Nothing to do.");
    return;
  }
  const result = applyPrune({
    selections: selection.map((name) => ({ name })),
    // Worktree removal is skipped here: the candidates that surface ARE
    // the ones whose dirs are already missing OR whose cwd is missing.
    // For "dir missing" entries there's no worktree to remove; for
    // "cwd missing" the worktree path may still exist as a stranded
    // directory. We surface it but don't auto-rm to avoid surprising
    // users — they can `launch kill <name>` for targeted removal.
    removeWorktrees: false,
  });
  // eslint-disable-next-line no-console
  console.log(
    `Forgot ${result.forgotten} session(s), removed ${result.worktreesRemoved} worktree(s).`,
  );
  if (result.errors.length > 0) {
    for (const e of result.errors) {
      // eslint-disable-next-line no-console
      console.error(`  ${e.name}: ${e.error}`);
    }
  }
}

/**
 * `agileflow launch doctor` — read-only health check. Exits 1 if any
 * check fails (tmux missing, preferred CLI missing, registry malformed).
 * Warnings don't fail the doctor.
 *
 * @returns {Promise<void>}
 */
async function runDoctor() {
  const report = await runDoctorChecks();
  for (const c of report.checks) {
    const symbol = c.status === "pass" ? "✓" : c.status === "warn" ? "⚠" : "✗";
    // eslint-disable-next-line no-console
    console.log(`${symbol} ${c.id}: ${c.message}`);
    if (c.fix) {
      // eslint-disable-next-line no-console
      console.log(`  fix: ${c.fix}`);
    }
  }
  if (anyFailed(report)) {
    process.exit(1);
  }
}

/**
 * `agileflow launch pin <name>` / `unpin <name>` — flip the pinned flag
 * on a registry entry. Pinned entries skip `prune` and arrive pre-
 * selected in the auto-restore picker.
 *
 * @param {string | undefined} name
 * @param {boolean} pinned
 * @returns {Promise<void>}
 */
async function runPin(name, pinned) {
  const action = pinned ? "pin" : "unpin";
  if (!name) {
    fail(
      new OperationFailedError(
        `agileflow launch ${action} requires a session name`,
        { suggestion: "run `agileflow launch ls` to see available names" },
      ),
      { command: "launch" },
    );
  }
  const ok = pinSession(name, pinned);
  if (!ok) {
    fail(
      new OperationFailedError(`no session named "${name}" in the registry`, {
        suggestion: "run `agileflow launch ls` to see available names",
      }),
      { command: "launch" },
    );
  }
  // eslint-disable-next-line no-console
  console.log(`${pinned ? "Pinned" : "Unpinned"} "${name}".`);
}

/**
 * `agileflow launch where` — show which prefs files contributed to the
 * effective config in this directory. Useful for debugging "why is this
 * repo picking codex when my global says claude?" surprises.
 *
 * @returns {Promise<void>}
 */
async function runWhere() {
  const cascaded = await loadCascadedPrefs();
  // eslint-disable-next-line no-console
  console.log(
    "Active launch prefs in this directory (lowest → highest precedence):",
  );
  for (const s of cascaded.sources) {
    const label =
      s.layer === "defaults"
        ? "built-in defaults"
        : s.layer === "global"
          ? `global   ${s.path}`
          : `project  ${s.path}`;
    // eslint-disable-next-line no-console
    console.log(`  ${label}`);
  }
  // eslint-disable-next-line no-console
  console.log("");
  // eslint-disable-next-line no-console
  console.log("Effective values:");
  // eslint-disable-next-line no-console
  console.log(`  cli.preferred       ${cascaded.prefs.cli.preferred}`);
  // eslint-disable-next-line no-console
  console.log(
    `  cli.fallbackOrder   ${cascaded.prefs.cli.fallbackOrder.join(" → ")}`,
  );
  // eslint-disable-next-line no-console
  console.log(
    `  tmux                ${cascaded.prefs.tmux.enabled ? "on" : "off"} (status ${cascaded.prefs.tmux.statusPosition})`,
  );
  // eslint-disable-next-line no-console
  console.log(`  keybinds            ${cascaded.prefs.keybinds.preset}`);
  // eslint-disable-next-line no-console
  console.log(
    `  af alias            ${cascaded.prefs.aliases.af.enabled ? "on" : "off"}`,
  );
}

/**
 * Hidden subcommand wired to the `Alt+w` tab close keybind. Captures
 * the current tmux window's name + pane cwd via `tmux display-message`,
 * pushes onto the closed-windows log, then `kill-window`s. Designed to
 * be called from a tmux `run-shell` action — no UI, no exceptions
 * propagated to the user (failures only log to stderr so they appear in
 * the tmux pane error overlay if the user surfaces it).
 *
 * Ordering: kill-window FIRST (with an explicit `-t session:index`
 * target captured atomically from display-message), then push to the
 * log only on kill success. This is the inverse of the obvious order
 * but it avoids two real bugs caught in pre-commit audit:
 *   (a) Phantom log entry — if kill fails (permission, race) we'd
 *       otherwise leave a "closed" record pointing at a still-alive
 *       window, and Alt+T would duplicate it.
 *   (b) Wrong-window kill — a bare `kill-window` with no target acts
 *       on whatever window has focus at that instant, which can drift
 *       between display-message and the kill if the user switches
 *       windows in another pane. Explicit `-t` pins it.
 *
 * Trade-off: if push fails (lock contention etc.) the window is gone
 * but Alt+T can't undo it — acceptable, since the inverse failure
 * (logged but alive) is worse.
 *
 * @param {{
 *   runner?: ReturnType<typeof defaultTmuxRunner>,
 *   pushClosedImpl?: typeof closedWindows.pushClosed,
 * }} [deps]
 * @returns {Promise<void>}
 */
async function runInternalCloseWindow(deps = {}) {
  const runner = deps.runner || defaultTmuxRunner();
  const pushClosedImpl = deps.pushClosedImpl || closedWindows.pushClosed;
  const exit = deps.exit || ((code) => process.exit(code));
  // ASCII Unit Separator — never appears in a session/window name or
  // filesystem path, so splitting on it is unambiguous.
  const DELIM = "\x1f";
  // When the tmux keybind passes session+index positionally, target
  // that exact window. This avoids a wrong-window kill if focus shifts
  // between Alt+w being pressed and this subprocess starting.
  const argSession = (deps.targetSession || "").trim();
  const argIndex = (deps.targetIndex || "").trim();
  let probeArgs;
  if (argSession && argIndex) {
    probeArgs = [
      "display-message",
      "-p",
      "-t",
      `${argSession}:${argIndex}`,
      "-F",
      `#S${DELIM}#I${DELIM}#W${DELIM}#{pane_current_path}`,
    ];
  } else {
    probeArgs = [
      "display-message",
      "-p",
      "-F",
      `#S${DELIM}#I${DELIM}#W${DELIM}#{pane_current_path}`,
    ];
  }
  const probe = runner.runSync(probeArgs);
  if (probe.status !== 0) {
    // eslint-disable-next-line no-console
    console.error(
      `agileflow launch __close-window: tmux display-message failed: ${probe.stderr || "unknown"}`,
    );
    return exit(1);
  }
  const parts = (probe.stdout || "").trimEnd().split(DELIM);
  if (parts.length !== 4) {
    // eslint-disable-next-line no-console
    console.error(
      `agileflow launch __close-window: unexpected display-message output (got ${parts.length} fields)`,
    );
    return exit(1);
  }
  const [sessionName, windowIndex, windowName, cwd] = parts;
  if (!sessionName || !windowIndex || !cwd) {
    // eslint-disable-next-line no-console
    console.error(
      "agileflow launch __close-window: missing session/index/cwd; skipping kill",
    );
    return exit(1);
  }
  // Kill first with the explicit target captured above. If this fails
  // we abort without touching the log — the window is still alive and
  // a phantom entry would mislead Alt+T into resurrecting a duplicate.
  const kill = runner.runSync([
    "kill-window",
    "-t",
    `${sessionName}:${windowIndex}`,
  ]);
  if (kill.status !== 0) {
    // eslint-disable-next-line no-console
    console.error(
      `agileflow launch __close-window: kill-window failed: ${kill.stderr || "unknown"}`,
    );
    return exit(1);
  }
  try {
    pushClosedImpl({ sessionName, name: windowName || "", cwd });
  } catch (err) {
    // Window is already gone; push failure means Alt+T can't undo
    // this particular close. Surface for visibility but don't throw —
    // a tmux keybind run-shell can't usefully recover.
    // eslint-disable-next-line no-console
    console.error(
      `agileflow launch __close-window: log push failed (window already closed): ${err && err.message ? err.message : err}`,
    );
  }
}

/**
 * Hidden subcommand wired to the `Alt+T` restore keybind. Pops the
 * most recent closed entry for the current tmux session and spawns a
 * new window in its cwd with the original name. No-op when the log is
 * empty for this session — quieter than printing a "nothing to undo"
 * message, since the user just sees their layout unchanged.
 *
 * @param {{
 *   runner?: ReturnType<typeof defaultTmuxRunner>,
 *   popClosedImpl?: typeof closedWindows.popClosed,
 * }} [deps]
 * @returns {Promise<void>}
 */
async function runInternalRestoreWindow(deps = {}) {
  const runner = deps.runner || defaultTmuxRunner();
  const popClosedImpl = deps.popClosedImpl || closedWindows.popClosed;
  const pushClosedImpl = deps.pushClosedImpl || closedWindows.pushClosed;
  const exit = deps.exit || ((code) => process.exit(code));
  // Keybind passes #{session_name} so the restore targets the session
  // the user actually pressed Alt+T from. Fall back to display-message
  // for manual invocations (which only works inside tmux).
  let sessionName = (deps.targetSession || "").trim();
  if (!sessionName) {
    const probe = runner.runSync(["display-message", "-p", "-F", "#S"]);
    if (probe.status !== 0) {
      // eslint-disable-next-line no-console
      console.error(
        `agileflow launch __restore-window: tmux display-message failed: ${probe.stderr || "unknown"}`,
      );
      return exit(1);
    }
    sessionName = (probe.stdout || "").trim();
  }
  if (!sessionName) return exit(1);
  /** @type {ReturnType<typeof closedWindows.popClosed>} */
  let entry;
  try {
    entry = popClosedImpl(sessionName);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(
      `agileflow launch __restore-window: log pop failed: ${err && err.message ? err.message : err}`,
    );
    return exit(1);
  }
  if (!entry) {
    // Empty stack — silent. The user pressed Alt+T with nothing to undo.
    return;
  }
  const args = ["new-window", "-t", sessionName, "-c", entry.cwd];
  if (entry.name) args.push("-n", entry.name);
  const create = runner.runSync(args);
  if (create.status !== 0) {
    // eslint-disable-next-line no-console
    console.error(
      `agileflow launch __restore-window: new-window failed: ${create.stderr || "unknown"}`,
    );
    // Re-push so the user doesn't lose their undo entry — pop already
    // mutated the log, so a failed new-window without re-push means
    // pressing Alt+T again would skip THIS entry and pop the NEXT one,
    // double-losing data.
    try {
      pushClosedImpl({
        sessionName,
        name: entry.name,
        cwd: entry.cwd,
      });
    } catch (pushErr) {
      // eslint-disable-next-line no-console
      console.error(
        `agileflow launch __restore-window: failed to re-push entry after new-window failure: ${pushErr && pushErr.message ? pushErr.message : pushErr}`,
      );
    }
    return exit(1);
  }
}

/**
 * Hidden subcommand wired to tmux's window-linked / window-unlinked /
 * window-renamed hooks. Queries the named session's current window
 * layout and patches the registry's `windows` array so restore can
 * later replay every tab in its original cwd.
 *
 * Silent on every failure path: this runs in the background on every
 * tab change, so noise here would clutter the user's terminal. If the
 * session no longer exists or tmux is gone, we just no-op.
 *
 * @param {string} sessionName
 * @param {{ runner?: ReturnType<typeof defaultTmuxRunner> }} [deps]
 * @returns {Promise<void>}
 */
async function runInternalSnapshotSession(sessionName, deps = {}) {
  if (!sessionName) return;
  const runner = deps.runner || defaultTmuxRunner();
  const DELIM = "\x1f";
  const fmt = `#{window_index}${DELIM}#{window_name}${DELIM}#{pane_current_path}`;
  // Capture timestamp BEFORE list-windows so concurrent subprocesses
  // produce a stable ordering. The registry rejects writes whose
  // capturedAt is older than what's already stored — without this,
  // out-of-order lock acquisition can clobber newer state with older.
  const capturedAt = Date.now();
  const result = runner.runSync(["list-windows", "-t", sessionName, "-F", fmt]);
  if (result.status !== 0) return;
  const lines = (result.stdout || "")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  /** @type {import("../../runtime/launch/session-registry.js").WindowSnapshot[]} */
  const windows = [];
  for (const line of lines) {
    const parts = line.split(DELIM);
    if (parts.length !== 3) continue;
    const index = Number(parts[0]);
    if (!Number.isFinite(index)) continue;
    const name = parts[1];
    const cwd = parts[2];
    if (!cwd) continue;
    windows.push({ index, name, cwd });
  }
  try {
    const {
      updateSession,
    } = require("../../runtime/launch/session-registry.js");
    updateSession(sessionName, { windows, windowsCapturedAt: capturedAt });
  } catch {
    // Registry might not exist or session might have been forgotten;
    // either way we can't usefully recover. Stay silent.
  }
}

/**
 * Auto-restore check on bare `agileflow launch`. Fires only when:
 *   - tmux is available (we use sessionExists to count alive sessions)
 *   - the registry has entries
 *   - none of those entries' sessions are currently alive on the
 *     server (typical post-reboot state — tmux server is brand-new)
 *
 * Prompts the user yes/no. On yes, calls runRestore and falls through
 * so the normal engine flow attaches to (or creates) the cwd's session
 * afterwards.
 *
 * @param {import("../../runtime/launch/defaults.js").LaunchPrefs} prefs
 * @returns {Promise<void>}
 */
async function maybeOfferAutoRestore(prefs) {
  if (!tmuxAvailable()) return;
  const reg = loadRegistry();
  if (reg.sessions.length === 0) return;

  // If ANY registered session is alive, the server isn't fresh — skip
  // the bulk-restore prompt. The user is likely just launching a new
  // window in an already-running server.
  const runner = defaultTmuxRunner();
  const { sessionExists } = require("../../runtime/launch/tmux.js");
  for (const s of reg.sessions) {
    if (sessionExists(s.name, runner)) return;
  }

  // eslint-disable-next-line no-console
  console.log("\n" + logoBanner(pkg.version) + "\n");
  prompts.intro("agileflow launch — saved sessions detected");
  prompts.log.info(
    `Found ${reg.sessions.length} saved session(s) from before this tmux server started.`,
  );

  // Multi-select picker: every session is an option, pinned entries
  // (and entries with worktrees — these are usually intentional Alt+n
  // work-in-progress) come pre-selected. Default-selecting nothing
  // would surprise users coming from v3 (which restored all), so when
  // no session is pinned we default-select everything.
  const sorted = reg.sessions.slice().sort((a, b) => {
    const ap = a.pinned === true ? 1 : 0;
    const bp = b.pinned === true ? 1 : 0;
    if (ap !== bp) return bp - ap;
    return 0;
  });
  // Smart toggle at the top of the picker: one entry that flips the
  // current selection state. If everything's selected, checking it
  // deselects all; if anything's unselected, checking it selects all.
  // Visually separated from session entries by a dash divider line
  // so it doesn't blend in with real options.
  const TOGGLE_ALL = "__toggle_all__";
  const DIVIDER = "__divider__";
  const allNames = sorted.map((s) => s.name);
  const sessionOptions = sorted.map((s) => ({
    value: s.name,
    label: `${s.pinned ? "* " : "  "}${s.name}`,
    hint: `${s.cli} — ${s.cwd}${s.worktree && s.worktree.branch ? ` [wt ${s.worktree.branch}]` : ""}`,
  }));
  const options = [
    {
      value: TOGGLE_ALL,
      label: "[ select all / deselect all ]",
      hint: "toggles every session below",
    },
    {
      value: DIVIDER,
      label: "─────────────────────────────",
      hint: "",
    },
    ...sessionOptions,
  ];
  const anyPinned = sorted.some((s) => s.pinned === true);
  const initial = anyPinned
    ? sorted.filter((s) => s.pinned === true).map((s) => s.name)
    : sorted.map((s) => s.name);

  const selection = await prompts.multiselect({
    message: questionMessage(
      "Pick which sessions to restore",
      "Pinned (★) entries are pre-selected. Space toggles, Enter confirms, Ctrl+C cancels everything.",
    ),
    options,
    initialValues: initial,
    required: false,
  });
  // Distinguish Ctrl+C ("cancel everything") from explicit "no selections"
  // ("skip restore but keep going"). The two used to be one branch and
  // both fell through to runEngine — surprising for users who pressed
  // Ctrl+C expecting nothing further to happen.
  if (prompts.isCancel(selection)) {
    prompts.cancel("Launch cancelled. No sessions restored.");
    process.exit(0);
  }
  /** @type {string[]} */
  let chosen = Array.isArray(selection) ? selection : [];
  // Strip the synthetic divider always (it's never a real choice).
  // Resolve the toggle: if the user checked it, flip the current
  // selection state — everything selected goes to nothing, anything
  // partial or empty goes to everything.
  const toggled = chosen.includes(TOGGLE_ALL);
  chosen = chosen.filter((v) => v !== TOGGLE_ALL && v !== DIVIDER);
  if (toggled) {
    const allSelected =
      chosen.length === allNames.length &&
      allNames.every((n) => chosen.includes(n));
    chosen = allSelected ? [] : [...allNames];
  }
  if (chosen.length === 0) {
    prompts.outro(
      "Skipped. Run `agileflow launch restore` later to bring them back.",
    );
    return;
  }
  const result = runRestore({ prefs, onlyNames: chosen });
  prompts.outro(
    `Restored ${result.restored} session(s). Continuing into the current directory's session...`,
  );
  if (result.failed > 0 || result.skipped > 0) {
    for (const note of result.notes) {
      // eslint-disable-next-line no-console
      console.error(`  ${note.name}: ${note.reason}`);
    }
  }
}

/**
 * Commander action for `agileflow launch [sub] [name]`.
 *
 * Commander v12 invokes action with positional args first, options last:
 * `action((sub, name, options) => ...)` for `.command("launch [sub] [name]")`.
 * The `name` is only meaningful when `sub === "new"`; ignored otherwise.
 *
 * @param {string | undefined} sub
 * @param {string | undefined} nameArg
 * @param {Record<string, unknown>} [_options]
 */
async function launch(sub, nameArg, _options) {
  try {
    if (sub === "new") {
      await runNew(nameArg);
      return;
    }
    if (sub === "__exec") {
      // Hidden subcommand invoked by tmux itself when a session boots.
      // `nameArg` is the registry key. runExec loads the entry, spawns
      // the right CLI with its resume args, captures the new UUID after
      // exit, and process.exits with the CLI's status.
      if (!nameArg) {
        fail(
          new OperationFailedError(
            "agileflow launch __exec requires a session name",
            { suggestion: "this command is invoked by tmux internally" },
          ),
          { command: "launch" },
        );
      }
      await runExec(nameArg);
      return;
    }
    if (sub === "restore") {
      await runRestoreCommand();
      return;
    }
    if (sub === "ls") {
      await runLs();
      return;
    }
    if (sub === "kill") {
      await runKill(nameArg);
      return;
    }
    if (sub === "attach") {
      await runAttachByName(nameArg);
      return;
    }
    if (sub === "prune") {
      await runPrune();
      return;
    }
    if (sub === "doctor") {
      await runDoctor();
      return;
    }
    if (sub === "pin") {
      await runPin(nameArg, true);
      return;
    }
    if (sub === "unpin") {
      await runPin(nameArg, false);
      return;
    }
    if (sub === "where") {
      await runWhere();
      return;
    }
    if (sub === "__close-window") {
      // Hidden subcommand invoked from tmux keybind (Alt+w). The keybind
      // passes session name + window index as positional args so we
      // target the exact tab the user pressed Alt+w on, regardless of
      // any focus shift during the confirmation prompt. nameArg is the
      // session name; we read the window index from raw argv since
      // commander's signature only declares two positionals.
      const targetSession = nameArg || "";
      const targetIndex = (process.argv && process.argv[5]) || "";
      await runInternalCloseWindow({ targetSession, targetIndex });
      return;
    }
    if (sub === "__restore-window") {
      // Hidden subcommand invoked from tmux keybind (Alt+T). Pops the
      // most recent closed entry for the session the user pressed
      // Alt+T from (passed positionally via #{session_name}) and
      // spawns a new window in that cwd with the original name. No-op
      // when the log is empty for this session.
      await runInternalRestoreWindow({ targetSession: nameArg || "" });
      return;
    }
    if (sub === "__snapshot-session") {
      // Hidden subcommand invoked from tmux hooks (window-linked,
      // window-unlinked, window-renamed). Queries the current window
      // layout for the named session and writes it to the registry's
      // `windows` field so restore can replay every tab.
      await runInternalSnapshotSession(nameArg || "");
      return;
    }
    if (sub && sub !== "setup") {
      fail(
        new OperationFailedError(`unknown launch subcommand: ${sub}`, {
          suggestion:
            "use `agileflow launch`, `agileflow launch setup`, `agileflow launch new [name]`, `agileflow launch restore`, `agileflow launch ls`, `agileflow launch kill <name>`, `agileflow launch attach <name>`, `agileflow launch prune`, `agileflow launch doctor`, `agileflow launch pin <name>`, `agileflow launch unpin <name>`, or `agileflow launch where`",
        }),
        { command: "launch" },
      );
    }

    const hasPrefs = await prefsExist();
    const flow = decideFlow({ sub, hasPrefs });

    if (flow === "setup") {
      await runSetup();
      return;
    }

    if (flow === "first-run-setup") {
      // Walk the user through setup, then immediately launch — they
      // expect `agileflow launch` to do something on first invocation,
      // not just configure and exit. Use the prefs returned from
      // runSetup directly so a failed reload can't tell the user to
      // "re-run setup" when they just finished doing exactly that.
      const prefs = await runSetup();
      // eslint-disable-next-line no-console
      console.log("");
      await runEngine(prefs);
      return;
    }

    const { prefs } = await loadPrefsOrFail();
    // Auto-restore prompt before engine: if tmux is up, the registry
    // has entries, and none of them are currently alive on the server,
    // ask the user whether to bulk-restore. After they choose, the
    // engine still runs and either attaches to (or creates) the cwd's
    // canonical session.
    await maybeOfferAutoRestore(prefs);
    await runEngine(prefs);
  } catch (err) {
    // Preserve typed AgileflowError subclasses (OperationFailedError,
    // InvalidArgumentError, MissingFileError) with their `suggestion`
    // intact. A `name` string compare would miss subclasses — they each
    // override `name` to their own class name.
    if (err instanceof AgileflowError) throw err;

    // TOCTOU: the PATH probe in resolveCli passed, but the binary was
    // removed before spawn. Surface the same actionable hint as the
    // no-CLI-installed path, not the generic "re-run with DEBUG=1".
    if (err && err.code === "ENOENT") {
      fail(
        new OperationFailedError(
          `AI CLI not found at launch time: ${err.message}`,
          {
            suggestion:
              "install one of the supported CLIs (claude, codex, cursor-agent, aider), " +
              "or run `agileflow launch setup` to update your fallback order",
            cause: err,
          },
        ),
        { command: "launch" },
      );
    }

    // Binary exists but is not executable — distinct fix from "install".
    if (err && err.code === "EACCES") {
      fail(
        new OperationFailedError(`AI CLI is not executable: ${err.message}`, {
          suggestion:
            "check file permissions on the CLI binary, or re-install it",
          cause: err,
        }),
        { command: "launch" },
      );
    }

    fail(
      new OperationFailedError(
        `launch failed: ${err && err.message ? err.message : String(err)}`,
        { suggestion: "re-run with DEBUG=1 for a stack trace", cause: err },
      ),
      { command: "launch" },
    );
  }
}

module.exports = launch;
module.exports.decideFlow = decideFlow;
module.exports.runSetup = runSetup;
module.exports.runEngine = runEngine;
module.exports.runNew = runNew;
module.exports.runLs = runLs;
module.exports.runKill = runKill;
module.exports.runAttachByName = runAttachByName;
module.exports.runPrune = runPrune;
module.exports.runDoctor = runDoctor;
module.exports.runPin = runPin;
module.exports.runWhere = runWhere;
module.exports.shouldOfferOrphanCleanup = shouldOfferOrphanCleanup;
