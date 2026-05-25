/**
 * tmux session orchestration for `agileflow launch`.
 *
 * Slice 2b: wrap the user's AI CLI in a per-cwd tmux session so
 * detach/reattach work like the v3 `af` script. Multiple `agileflow
 * launch` invocations from the same directory either reattach to an
 * existing detached session, or — if one is already attached — spawn
 * a numbered sibling (`<cli>-<dir>`, `<cli>-<dir>-2`, etc.).
 *
 * Everything that shells out to tmux goes through the `runner` parameter
 * (default: child_process), so unit tests can drive every code path
 * without a real tmux daemon. The orchestrator also threads the
 * preferred status-bar position from launch-prefs.json onto the session
 * after it's created.
 *
 * What this module deliberately does NOT do (deferred):
 *   - keybind preset files (.tmux.conf snippets for default/minimal/none)
 *   - freeze recovery, kill, list subcommands
 *   - multi-pane / worktree session creation (Alt+N etc.)
 */
const path = require("path");
const child_process = require("child_process");

const { commandExists: realCommandExists } = require("../../lib/path-check.js");
const { signalToExitCode } = require("./spawn.js");

/**
 * @typedef {Object} TmuxLaunchResult
 * @property {number} exitCode                       - exit code of the attach (or session creation on failure)
 * @property {NodeJS.Signals | null} [signal]        - signal that terminated the attach, when applicable
 */

/**
 * @typedef {Object} TmuxRunSyncResult
 * @property {number} status                         - subprocess exit status (1 when spawn itself failed)
 * @property {string} stdout
 * @property {string} stderr
 * @property {Error | null} error                    - non-null when spawn ITSELF failed (e.g., ENOENT)
 */

/**
 * @typedef {Object} TmuxRunner
 * @property {(args: string[]) => TmuxRunSyncResult} runSync                                     - non-interactive tmux commands
 * @property {(args: string[]) => Promise<{ exitCode: number, signal: NodeJS.Signals | null }>} runAttach  - interactive `tmux attach` (foreground, stdio inherited)
 */

/**
 * Return true when the current process is already inside a tmux client.
 * tmux exports `$TMUX` containing the socket path + session id; we treat
 * any non-empty value as "inside". Callers should NOT nest sessions.
 *
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {boolean}
 */
function isInsideTmux(env = process.env) {
  return typeof env.TMUX === "string" && env.TMUX.length > 0;
}

/**
 * Whether `tmux` resolves on PATH. Injectable for tests.
 *
 * @param {(name: string) => boolean} [exists]
 * @returns {boolean}
 */
function tmuxAvailable(exists = realCommandExists) {
  return exists("tmux");
}

/**
 * Derive a tmux session name from the AI CLI id and the current working
 * directory. tmux session names can't contain `:` or `.`; we also strip
 * other shell-noisy characters so names stay tab-completable.
 *
 * @param {string} cli  - e.g. "claude" / "codex"
 * @param {string} cwd  - absolute path; the basename is what's used
 * @returns {string}
 */
function baseSessionName(cli, cwd) {
  const dir = path.basename(cwd).replace(/[^A-Za-z0-9_-]+/g, "_") || "root";
  return `${cli}-${dir}`;
}

/**
 * Walk `<base>`, `<base>-2`, `<base>-3`, ... until one is unused (per
 * `exists()`) — used to spawn a parallel session when the canonical name
 * is already attached. Caller decides whether to attach to an existing
 * detached session or always create new.
 *
 * @param {string} base
 * @param {(name: string) => boolean} exists
 * @param {number} [max] - safety bound; defaults to 32
 * @returns {string}
 */
function nextFreeSessionName(base, exists, max = 32) {
  if (!exists(base)) return base;
  for (let i = 2; i <= max; i++) {
    const candidate = `${base}-${i}`;
    if (!exists(candidate)) return candidate;
  }
  // Fall back to base — caller will see a tmux "duplicate session" error
  // rather than us silently picking a 33rd session. Surfacing the failure
  // is better than masking it.
  return base;
}

/**
 * @returns {TmuxRunner}
 */
function defaultRunner() {
  return {
    runSync(args) {
      const result = child_process.spawnSync("tmux", args, {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
      return {
        // spawnSync returns `status: null` when the spawn itself failed
        // (ENOENT etc.). In that case `error` is set; callers must check it
        // before treating status=1 as a real tmux exit code.
        status: typeof result.status === "number" ? result.status : 1,
        stdout: result.stdout || "",
        stderr: result.stderr || "",
        error: result.error || null,
      };
    },
    runAttach(args) {
      return new Promise((resolve, reject) => {
        let settled = false;
        const finish = (fn, value) => {
          if (settled) return;
          settled = true;
          fn(value);
        };
        let child;
        try {
          child = child_process.spawn("tmux", args, { stdio: "inherit" });
        } catch (err) {
          finish(reject, err);
          return;
        }
        child.on("error", (err) => finish(reject, err));
        child.on("close", (code, signal) => {
          // Mirror spawn.js's signal-to-exit-code table so shell scripts
          // can distinguish SIGINT (130) from SIGTERM (143) etc., instead
          // of all signal exits collapsing to 128.
          const exitCode =
            typeof code === "number" ? code : signalToExitCode(signal);
          finish(resolve, { exitCode, signal: signal || null });
        });
      });
    },
  };
}

/**
 * @param {string} name
 * @param {TmuxRunner} runner
 * @returns {boolean}
 */
function sessionExists(name, runner) {
  const result = runner.runSync(["has-session", "-t", `=${name}`]);
  return result.status === 0;
}

/**
 * Create a new detached tmux session that immediately runs `bin args...`.
 * Returns the runner's exit status (0 on success).
 *
 * @param {{ name: string, bin: string, args: string[], cwd?: string, statusPosition?: string }} opts
 * @param {TmuxRunner} runner
 * @returns {{ status: number, stderr: string }}
 */
function createSession(opts, runner) {
  const args = ["new-session", "-d", "-s", opts.name];
  if (opts.cwd) args.push("-c", opts.cwd);
  args.push(opts.bin, ...opts.args);
  const result = runner.runSync(args);
  if (result.status === 0 && opts.statusPosition) {
    // Per-session option; safe even if the user has a global tmux config.
    runner.runSync([
      "set-option",
      "-t",
      opts.name,
      "status-position",
      opts.statusPosition,
    ]);
  }
  return {
    status: result.status,
    stderr: result.stderr,
    // Propagate the spawn-itself-failed error so callers can re-throw
    // ENOENT (= tmux not on PATH, e.g., TOCTOU after tmuxAvailable()
    // succeeded) instead of masking it as a generic tmux failure.
    error: result.error || null,
  };
}

/**
 * Attach to an existing session in the foreground. Returns the user's
 * exit code from the attach (typically 0 on clean detach).
 *
 * @param {string} name
 * @param {TmuxRunner} runner
 * @returns {Promise<TmuxLaunchResult>}
 */
async function attachSession(name, runner) {
  const result = await runner.runAttach(["attach-session", "-t", name]);
  return { exitCode: result.exitCode, signal: result.signal || null };
}

/**
 * Top-level orchestrator: pick a session name, ensure it exists with
 * the user's CLI running inside it, then attach. If the canonical name
 * is already attached elsewhere, spawn a numbered sibling.
 *
 * Caller has already verified tmux is available and we're not nested.
 *
 * @param {{
 *   bin: string,
 *   args?: string[],
 *   cwd?: string,
 *   statusPosition?: string,
 *   runner?: TmuxRunner,
 * }} opts
 * @returns {Promise<TmuxLaunchResult>}
 */
async function launchInTmux(opts) {
  const runner = opts.runner || defaultRunner();
  const cwd = opts.cwd || process.cwd();
  const base = baseSessionName(path.basename(opts.bin), cwd);

  // Reattach to the canonical session if it exists. tmux's `attach-session`
  // is the right command for both "exists detached" and "exists attached"
  // — the latter steals or shares the session, mirroring v3 `af` behavior.
  // If the user wants a fresh parallel session, they use `launch --new` (slice 2c).
  const existsSync = (name) => sessionExists(name, runner);
  if (existsSync(base)) {
    // Apply prefs on every attach — cheap, and keeps the session in sync
    // if the user changed their pref since the session was created.
    if (opts.statusPosition) {
      runner.runSync([
        "set-option",
        "-t",
        base,
        "status-position",
        opts.statusPosition,
      ]);
    }
    return attachSession(base, runner);
  }

  // No existing session — create fresh with the AI CLI as its command.
  // We already confirmed `base` is free above, so no need to walk
  // `nextFreeSessionName`; that helper is reserved for the upcoming
  // `--new` flag where the user explicitly wants a parallel sibling.
  const name = base;
  const create = createSession(
    {
      name,
      bin: opts.bin,
      args: opts.args || [],
      cwd,
      statusPosition: opts.statusPosition,
    },
    runner,
  );
  if (create.status !== 0) {
    // Spawn-itself-failed: tmux disappeared between tmuxAvailable() and
    // here. Re-throw the original ENOENT so launch.js's existing TOCTOU
    // branch can produce the install-or-reconfigure suggestion.
    if (create.error) throw create.error;

    // Concurrent-launch race: another `agileflow launch` from the same
    // cwd created the session between our existsSync probe and our
    // new-session call. The session exists now and is what the user
    // wanted; just attach to it instead of surfacing a misleading
    // "duplicate session" error.
    if (sessionExists(name, runner)) {
      return attachSession(name, runner);
    }

    const stderr = create.stderr.trim() || "tmux new-session failed";
    const err = new Error(`tmux: ${stderr}`);
    /** @type {any} */ (err).code = "ETMUX_CREATE";
    throw err;
  }

  return attachSession(name, runner);
}

module.exports = {
  isInsideTmux,
  tmuxAvailable,
  baseSessionName,
  nextFreeSessionName,
  sessionExists,
  createSession,
  attachSession,
  launchInTmux,
  defaultRunner,
};
