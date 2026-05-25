/**
 * Spawn an AI CLI as a foreground child process.
 *
 * stdio is inherited so the child takes over the terminal — same UX as
 * if the user had typed the CLI's name directly. We resolve to an
 * `{ exitCode, signal }` shape after the child closes so the caller can
 * mirror the child's exit status with `process.exit(exitCode)`.
 *
 * `spawnImpl` is injectable so tests don't actually fork a process.
 */
const child_process = require("child_process");

/**
 * @typedef {Object} SpawnResult
 * @property {number} exitCode  - 0..255 on normal exit; 128+signo on signal exits
 * @property {NodeJS.Signals | null} signal
 */

/**
 * Map a signal name to the conventional `128 + signo` exit code so
 * callers can `process.exit(result.exitCode)` and propagate the
 * termination cause to the parent shell. Falls back to 1 when the
 * signal isn't in the well-known set.
 *
 * @param {NodeJS.Signals | null} signal
 * @returns {number}
 */
function signalToExitCode(signal) {
  if (!signal) return 1;
  const table = {
    SIGHUP: 129,
    SIGINT: 130,
    SIGQUIT: 131,
    SIGILL: 132,
    SIGTRAP: 133,
    SIGABRT: 134,
    SIGBUS: 135,
    SIGFPE: 136,
    SIGKILL: 137,
    SIGUSR1: 138,
    SIGSEGV: 139,
    SIGUSR2: 140,
    SIGPIPE: 141,
    SIGALRM: 142,
    SIGTERM: 143,
  };
  return table[signal] || 1;
}

/**
 * Spawn `bin` with `args` and wait for it to close. Returns the
 * exit code the parent should propagate.
 *
 * @param {string} bin
 * @param {string[]} [args]
 * @param {{ spawn?: typeof child_process.spawn, cwd?: string, env?: NodeJS.ProcessEnv }} [options]
 * @returns {Promise<SpawnResult>}
 */
function runCli(bin, args = [], options = {}) {
  const spawn = options.spawn || child_process.spawn;
  return new Promise((resolve, reject) => {
    // Node's child_process fires `error` then `close` on a failed spawn.
    // Promises absorb the second settlement, but relying on that is
    // implicit — an explicit guard keeps behavior obvious in tests and
    // future Node versions.
    let settled = false;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      fn(value);
    };

    let child;
    try {
      child = spawn(bin, args, {
        stdio: "inherit",
        cwd: options.cwd,
        // `??` (not `||`) is the precise guard for "was env provided" —
        // future callers passing a falsy-but-meaningful value (e.g., `0`
        // or an empty string from a misconfigured wrapper) won't be
        // silently coerced to process.env. Node treats `null` and
        // `undefined` identically here, so both still default to
        // process.env via spawn's own handling.
        env: options.env ?? process.env,
      });
    } catch (err) {
      finish(reject, err);
      return;
    }

    child.on("error", (err) => {
      finish(reject, err);
    });

    child.on("close", (code, signal) => {
      const exitCode =
        typeof code === "number" ? code : signalToExitCode(signal);
      finish(resolve, { exitCode, signal });
    });
  });
}

module.exports = { runCli, signalToExitCode };
