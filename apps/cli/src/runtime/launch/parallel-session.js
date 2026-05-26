/**
 * Spawn a parallel tmux session — same-dir or worktree-backed — and
 * switch the user's existing client to it.
 *
 * Used by `agileflow launch new [name]`, which the default keybind
 * preset binds to Alt+s (no name → same-dir) and Alt+n (prompts for a
 * name → worktree). The caller has already verified we're inside a
 * tmux client; this module assumes that and uses `switch-client` to
 * swap rather than `attach-session`.
 *
 * No-name vs name flow:
 *   - No name: target dir is `process.cwd()`. New session uses
 *     `nextFreeSessionName(<cli>-<dir>, ...)` so it gets a `-2`, `-3`
 *     suffix when the canonical name is taken.
 *   - Name: `createWorktree({ name })` first, then the same fresh-name
 *     spawn against the worktree dir.
 */
const path = require("path");
const {
  baseSessionName,
  nextFreeSessionName,
  sessionExists,
  createSession,
  applyKeybindPreset,
  applyTabFormat,
  detectTmuxVersion,
  defaultRunner,
} = require("./tmux.js");
const { createWorktree, removeWorktree } = require("./worktree.js");
const { recordSession, forgetSession } = require("./session-registry.js");
const { resolveAgileflowBin } = require("./alias-installer.js");

/**
 * @typedef {Object} ParallelSpawnResult
 * @property {string} sessionName  - the new session's tmux name
 * @property {string} cwd          - the directory the session was created in (cwd or worktree path)
 * @property {{ path: string, branch: string, base: string }} [worktree]
 *                                 - only set when `name` was supplied
 */

/**
 * Build a typed error so callers can branch on `err.code`. Mirrors the
 * pattern used elsewhere in the launch runtime.
 *
 * @param {string} message
 * @param {string} code
 * @returns {Error}
 */
function makeSpawnError(message, code) {
  const err = new Error(message);
  /** @type {any} */ (err).code = code;
  return err;
}

/**
 * Resolve the directory for the new session. With `name`, create a
 * worktree first and use its path. Pure logic so tests can verify the
 * branching without spawning anything.
 *
 * @param {{
 *   name?: string,
 *   cwd: string,
 *   createWorktreeImpl?: typeof createWorktree,
 * }} opts
 * @returns {{ cwd: string, worktree?: { path: string, branch: string, base: string } }}
 */
function resolveSpawnDir(opts) {
  if (!opts.name) {
    return { cwd: opts.cwd };
  }
  const impl = opts.createWorktreeImpl || createWorktree;
  const wt = impl({ name: opts.name });
  return { cwd: wt.path, worktree: wt };
}

/**
 * Spawn a new tmux session and switch the user's client to it.
 *
 * @param {{
 *   bin: string,
 *   name?: string,
 *   prefs: import("./defaults.js").LaunchPrefs,
 *   cwd?: string,
 *   runner?: ReturnType<typeof defaultRunner>,
 *   log?: (msg: string) => void,
 *   createWorktreeImpl?: typeof createWorktree,
 *   removeWorktreeImpl?: typeof removeWorktree,
 * }} opts
 * @returns {Promise<ParallelSpawnResult>}
 */
async function runParallelSpawn(opts) {
  const runner = opts.runner || defaultRunner();
  const removeWt = opts.removeWorktreeImpl || removeWorktree;
  const log =
    typeof opts.log === "function"
      ? opts.log
      : (msg) => {
          // eslint-disable-next-line no-console
          console.error(msg);
        };

  const { cwd: targetCwd, worktree } = resolveSpawnDir({
    name: opts.name,
    cwd: opts.cwd || process.cwd(),
    createWorktreeImpl: opts.createWorktreeImpl,
  });

  if (worktree) {
    log(
      `agileflow launch: created worktree at ${worktree.path} on branch ${worktree.branch}`,
    );
  }

  // Once we've created the worktree we OWN it — if any of the tmux steps
  // below fail, roll it back so the user isn't left with an orphan dir
  // + branch they have to clean up by hand. The rollback helper itself
  // is best-effort; on failure we surface a warning but still re-throw
  // the original tmux error.
  // Track the session name across the try/catch boundary so the
  // rollback path can also forget the registry entry we added.
  /** @type {string | null} */
  let registeredName = null;
  try {
    const cliId = path.basename(opts.bin);
    const base = baseSessionName(cliId, targetCwd);
    // Always pick a fresh name. `new` semantics are "I want a parallel
    // session" — never "reattach". `nextFreeSessionName` walks
    // base, base-2, base-3, ... until it finds an unused slot.
    const sessionName = nextFreeSessionName(base, (n) =>
      sessionExists(n, runner),
    );
    registeredName = sessionName;

    // Record the session in the cross-reboot registry BEFORE spawning
    // so the __exec wrapper can find its entry. If the spawn fails we
    // unrecord in the catch block below.
    recordSession({
      name: sessionName,
      cli: cliId,
      cwd: targetCwd,
      uuid: null,
      worktree: worktree
        ? { path: worktree.path, branch: worktree.branch, base: worktree.base }
        : undefined,
    });

    const agileflowBin = resolveAgileflowBin();
    const create = createSession(
      {
        name: sessionName,
        bin: agileflowBin,
        args: ["launch", "__exec", sessionName],
        cwd: targetCwd,
        statusPosition: opts.prefs.tmux.statusPosition,
      },
      runner,
    );
    if (create.status !== 0) {
      if (create.error) throw create.error;

      // Race recovery: in the same-dir (no-name) case, another
      // `agileflow launch new` invocation could have grabbed our
      // candidate name between the nextFreeSessionName probe and the
      // new-session call. If the session is alive now, treat this as
      // "user got what they wanted" and switch-client to it. We don't
      // do this for the worktree path because the worktree dir is
      // freshly created and unique, so the name collision shouldn't
      // happen — if it does, something weirder is going on and the
      // user should see the original error.
      if (!opts.name && sessionExists(sessionName, runner)) {
        log(
          `agileflow launch: race-recovered, attaching to session ${sessionName}`,
        );
      } else {
        const stderr = create.stderr.trim() || "tmux new-session failed";
        throw makeSpawnError(`tmux: ${stderr}`, "ETMUX_CREATE");
      }
    }

    // Apply the user's keybind preset to the (server-wide) bindings table.
    // Same call the engine makes on every launch, so the new session
    // inherits the same Alt+q etc. as the parent.
    if (opts.prefs.keybinds && opts.prefs.keybinds.preset) {
      const result = applyKeybindPreset(opts.prefs.keybinds.preset, runner);
      for (const f of result.failures) {
        log(`agileflow launch: keybind skipped — ${f.hint}`);
      }
    }

    // Apply the tab strip styling to the new session — without this,
    // Alt+s and Alt+n spawn sessions with tmux's default green status
    // bar. Same call the engine does on every fresh-launch session.
    runner.runSync(["set-option", "-t", sessionName, "status", "1"]);
    applyTabFormat(sessionName, runner, {
      tmuxVersion: detectTmuxVersion(runner),
    });

    // Swap the user's tmux client to the new session. If switch-client
    // fails the session is still alive — surface its name so the user
    // can attach manually.
    const sw = runner.runSync(["switch-client", "-t", sessionName]);
    if (sw.status !== 0) {
      throw makeSpawnError(
        `switch-client failed: ${sw.stderr.trim() || "unknown error"}; ` +
          `session "${sessionName}" is still running — \`tmux attach -t ${sessionName}\` to enter it.`,
        "ETMUX_SWITCH",
      );
    }

    log(`agileflow launch: switched to new session ${sessionName}`);
    return { sessionName, cwd: targetCwd, worktree };
  } catch (err) {
    // Forget the registry entry we added — the spawn didn't succeed
    // so there's nothing to restore later. Worst case: a tmux session
    // exists but isn't in the registry (cosmetic; user can attach
    // manually via `tmux attach -t <name>`).
    if (registeredName) {
      try {
        forgetSession(registeredName);
      } catch {
        /* swallow */
      }
    }
    // Rollback path. Worktree got created but a subsequent step (tmux
    // create / keybind apply / switch-client) failed — remove the
    // worktree dir + branch so the repo state matches the launch state
    // (i.e., as if the user had never pressed Alt+n).
    if (worktree) {
      try {
        const result = removeWt({
          path: worktree.path,
          branch: worktree.branch,
        });
        if (result.removed && result.branchRemoved) {
          log(
            `agileflow launch: rolled back worktree ${worktree.path} + branch ${worktree.branch}`,
          );
        } else {
          log(
            `agileflow launch: worktree rollback partial — manual cleanup may be needed (${result.stderr})`,
          );
        }
      } catch (rollbackErr) {
        log(
          `agileflow launch: rollback failed — leftover at ${worktree.path}: ${rollbackErr.message}`,
        );
      }
    }
    throw err;
  }
}

module.exports = {
  runParallelSpawn,
  resolveSpawnDir,
  makeSpawnError,
};
