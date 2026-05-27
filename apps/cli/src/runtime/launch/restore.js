/**
 * Bulk-restore tmux sessions from the registry after the tmux server
 * died (typical cause: PC reboot). Walks every entry and re-creates
 * the corresponding tmux session in the original cwd, wired to invoke
 * `agileflow launch __exec <name>` so the per-CLI resume strategy
 * fires automatically.
 *
 * Sessions that already exist on the running tmux server are skipped —
 * restore is idempotent. Sessions whose original cwd no longer exists
 * are skipped with a warning (e.g., user deleted the project dir).
 *
 * Returns counts so the caller can show a "restored N of M" summary.
 */
const fs = require("fs");
const os = require("os");
const path = require("path");

const {
  defaultRunner,
  sessionExists,
  createSession,
  applyKeybindPreset,
  applyTabFormat,
  installSessionHooks,
  detectTmuxVersion,
} = require("./tmux.js");
const { loadRegistry } = require("./session-registry.js");
const { resolveAgileflowBin } = require("./alias-installer.js");

const RESTORE_LOCK_FILE = "launch-restore.lock";
const RESTORE_LOCK_STALE_MS = 30000;

/**
 * O_EXCL lock around the entire restore operation so two concurrent
 * `agileflow launch restore` invocations don't race on createSession
 * and produce duplicate-session errors plus wasted hook installation
 * work. Same pattern as the registry lock but on a separate file so
 * it doesn't block snapshot writes from running sessions.
 *
 * @template T
 * @param {string | undefined} home
 * @param {() => T} fn
 * @returns {T}
 */
function withRestoreLock(home, fn) {
  const dir = path.join(home || os.homedir(), ".agileflow");
  fs.mkdirSync(dir, { recursive: true });
  const lockFile = path.join(dir, RESTORE_LOCK_FILE);
  let lockFd = null;
  try {
    lockFd = fs.openSync(lockFile, "wx");
  } catch (err) {
    if (err && err.code === "EEXIST") {
      // Check for stale lock (process crashed mid-restore).
      try {
        const stat = fs.statSync(lockFile);
        if (Date.now() - (stat.mtimeMs || 0) > RESTORE_LOCK_STALE_MS) {
          fs.unlinkSync(lockFile);
          lockFd = fs.openSync(lockFile, "wx");
        }
      } catch {
        /* fall through to throw */
      }
    }
    if (lockFd === null) {
      throw new Error(
        "another `agileflow launch restore` is already in progress",
      );
    }
  }
  try {
    return fn();
  } finally {
    try {
      fs.closeSync(lockFd);
    } catch {
      /* swallow */
    }
    try {
      fs.unlinkSync(lockFile);
    } catch {
      /* swallow */
    }
  }
}

/**
 * @typedef {Object} RestoreResult
 * @property {number} restored
 * @property {number} alreadyAlive
 * @property {number} skipped       - cwd missing or other unrecoverable state
 * @property {number} failed
 * @property {Array<{ name: string, reason: string }>} notes
 */

/**
 * @param {{
 *   prefs: import("./defaults.js").LaunchPrefs,
 *   runner?: ReturnType<typeof defaultRunner>,
 *   home?: string,
 *   agileflowBin?: string,
 *   existsSync?: (p: string) => boolean,
 *   log?: (msg: string) => void,
 *   onlyName?: string,
 *   onlyNames?: string[],
 * }} opts
 * @returns {RestoreResult}
 */
function runRestore(opts) {
  return withRestoreLock(opts.home, () => runRestoreInner(opts));
}

/** @param {Parameters<typeof runRestore>[0]} opts */
function runRestoreInner(opts) {
  const runner = opts.runner || defaultRunner();
  const existsSync = opts.existsSync || ((p) => fs.existsSync(p));
  const log =
    typeof opts.log === "function"
      ? opts.log
      : (msg) => {
          // eslint-disable-next-line no-console
          console.error(msg);
        };
  const agileflowBin = opts.agileflowBin || resolveAgileflowBin();

  const reg = loadRegistry(opts.home);
  /** @type {RestoreResult} */
  const result = {
    restored: 0,
    alreadyAlive: 0,
    skipped: 0,
    failed: 0,
    notes: [],
  };

  /** @type {import("./session-registry.js").SessionEntry[]} */
  let entries;
  if (opts.onlyName) {
    entries = reg.sessions.filter((s) => s.name === opts.onlyName);
  } else if (Array.isArray(opts.onlyNames)) {
    // Use a Set for O(1) lookup so a 100-entry registry restoring a
    // 20-entry subset stays linear, not quadratic.
    const wanted = new Set(opts.onlyNames);
    entries = reg.sessions.filter((s) => wanted.has(s.name));
  } else {
    entries = reg.sessions.slice();
  }

  for (const entry of entries) {
    if (sessionExists(entry.name, runner)) {
      result.alreadyAlive++;
      continue;
    }
    if (!existsSync(entry.cwd)) {
      result.skipped++;
      result.notes.push({
        name: entry.name,
        reason: `cwd no longer exists: ${entry.cwd}`,
      });
      log(
        `agileflow launch: skipping ${entry.name} — cwd missing (${entry.cwd})`,
      );
      continue;
    }

    // Tmux session command: invoke our own wrapper. tmux passes argv
    // as separate words via the new-session args we hand it.
    const wrapperArgs = [agileflowBin, "launch", "__exec", entry.name];
    const create = createSession(
      {
        name: entry.name,
        bin: wrapperArgs[0],
        args: wrapperArgs.slice(1),
        cwd: entry.cwd,
        statusPosition: opts.prefs.tmux.statusPosition,
      },
      runner,
    );
    if (create.status !== 0) {
      result.failed++;
      const stderr = (create.stderr || "").trim() || "tmux new-session failed";
      result.notes.push({ name: entry.name, reason: stderr });
      log(`agileflow launch: failed to restore ${entry.name} — ${stderr}`);
      continue;
    }
    // Apply the same per-session styling launchInTmux does for fresh
    // sessions so the tab strip looks consistent on restore. Without
    // this, restored sessions show tmux's default green status bar
    // instead of the AgileFlow dark strip.
    runner.runSync(["set-option", "-t", entry.name, "status", "1"]);
    applyTabFormat(entry.name, runner, {
      tmuxVersion: detectTmuxVersion(runner),
      agileflowBin,
    });
    // Replay saved tabs (windows) if we have any from the last hook
    // snapshot. The first window already exists (createSession opened
    // it running __exec), so we skip it. Each restored window is
    // opened with `new-window -t session -c cwd -n name` and only
    // gets a shell — restoring the original CLI is out of scope (we
    // don't know what command was running, and respawning Claude in
    // every tab would be surprising). Users can re-run agileflow in
    // any tab manually.
    if (Array.isArray(entry.windows) && entry.windows.length > 1) {
      const sorted = entry.windows
        .slice()
        .sort((a, b) => (a.index || 0) - (b.index || 0));
      // Skip the wrapper window specifically — new-session already
      // recreated it. Tracked by wrapperWindowIndex (set at session-
      // creation time, defaults to 0) so a user who reordered windows
      // doesn't lose a real tab to "first index = wrapper" assumption.
      const wrapperIdx =
        typeof entry.wrapperWindowIndex === "number"
          ? entry.wrapperWindowIndex
          : 0;
      let replayed = 0;
      let replayFailures = 0;
      for (const w of sorted) {
        if (w.index === wrapperIdx) continue;
        if (!existsSync(w.cwd)) continue;
        const args = ["new-window", "-t", entry.name, "-c", w.cwd];
        if (w.name) args.push("-n", w.name);
        const r = runner.runSync(args);
        // Only count tabs that actually got created. tmux can refuse
        // new-window on resource limits, permission errors, or if the
        // session got killed between createSession and this call —
        // surface those so the user knows the restore was partial,
        // instead of a misleading green-check log.
        if (r.status === 0) {
          replayed++;
        } else {
          replayFailures++;
          log(
            `agileflow launch: failed to replay tab ${
              w.name || `(index ${w.index})`
            } for ${entry.name} — ${(r.stderr || "unknown").trim()}`,
          );
        }
      }
      if (replayed > 0 || replayFailures > 0) {
        log(
          `agileflow launch: replayed ${replayed} tab(s) for ${entry.name}` +
            (replayFailures > 0 ? ` (${replayFailures} failed)` : ""),
        );
      }
    }
    // Install hooks AFTER replay so the new-window calls above don't
    // each fire window-linked and overwrite the saved snapshot with
    // a partial mid-replay state.
    installSessionHooks(entry.name, runner, { agileflowBin });
    result.restored++;
    log(`agileflow launch: restored session ${entry.name} (${entry.cwd})`);
  }

  // Apply keybinds once after the bulk restore so the user's preset is
  // active across all the new sessions (tmux bind-key is server-wide).
  if (
    result.restored > 0 &&
    opts.prefs.keybinds &&
    opts.prefs.keybinds.preset
  ) {
    const kr = applyKeybindPreset(opts.prefs.keybinds.preset, runner, {
      agileflowBin,
    });
    for (const f of kr.failures) {
      log(`agileflow launch: keybind skipped during restore — ${f.hint}`);
    }
  }

  return result;
}

module.exports = { runRestore };
