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
const { loadRegistry } = require("../../runtime/launch/session-registry.js");
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
    return await loadPrefs();
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
  // Column widths sized to the longest value, capped to keep wide cwds
  // from blowing past the terminal.
  const nameW = Math.max(4, ...rows.map((r) => r.name.length));
  const cliW = Math.max(3, ...rows.map((r) => r.cli.length));
  const stateW = "missing-cwd".length;
  const fmt = (r) =>
    `${r.name.padEnd(nameW)}  ${r.cli.padEnd(cliW)}  ${r.state.padEnd(stateW)}  ${r.cwd}${
      r.worktree && r.worktree.branch ? ` [wt ${r.worktree.branch}]` : ""
    }`;
  // eslint-disable-next-line no-console
  console.log(
    `${"NAME".padEnd(nameW)}  ${"CLI".padEnd(cliW)}  ${"STATE".padEnd(stateW)}  CWD`,
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
  const choice = await prompts.confirm({
    message: questionMessage(
      "Restore all saved sessions now?",
      "Each session re-creates in its original directory, resuming the conversation where possible.",
    ),
    initialValue: true,
  });
  // Distinguish Ctrl+C ("cancel everything") from explicit "No" ("skip
  // restore but keep going"). The two used to be one branch and both
  // fell through to runEngine — surprising for users who pressed Ctrl+C
  // expecting nothing further to happen.
  if (prompts.isCancel(choice)) {
    prompts.cancel("Launch cancelled. No sessions restored.");
    process.exit(0);
  }
  if (!choice) {
    prompts.outro(
      "Skipped. Run `agileflow launch restore` later to bring them back.",
    );
    return;
  }
  const result = runRestore({ prefs });
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
    if (sub && sub !== "setup") {
      fail(
        new OperationFailedError(`unknown launch subcommand: ${sub}`, {
          suggestion:
            "use `agileflow launch`, `agileflow launch setup`, `agileflow launch new [name]`, `agileflow launch restore`, `agileflow launch ls`, `agileflow launch kill <name>`, `agileflow launch attach <name>`, `agileflow launch prune`, or `agileflow launch doctor`",
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
module.exports.shouldOfferOrphanCleanup = shouldOfferOrphanCleanup;
