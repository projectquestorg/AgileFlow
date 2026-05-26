/**
 * The body of `agileflow launch __exec <session-name>` — a hidden
 * subcommand that tmux sessions invoke instead of the raw CLI. It:
 *
 *   1. Loads the session's entry from the registry to learn which CLI
 *      to spawn and the last-known conversation UUID.
 *   2. Spawns the CLI with the CLI-specific resume flags (so claude
 *      gets `--resume <uuid>` etc.).
 *   3. After the CLI exits, asks the resume strategy to capture a fresh
 *      UUID from disk (claude writes a new jsonl per conversation) and
 *      writes it back to the registry. This makes the NEXT __exec /
 *      restore pick up the newest conversation.
 *
 * Wired up by `tmux new-session -d -s <name> -c <cwd> <agileflow-bin>
 * launch __exec <name>`. tmux is responsible for the cwd and the
 * pane; we just route the CLI invocation through here so the resume
 * dance happens transparently.
 */
const { runCli } = require("./spawn.js");
const { findSession, updateSession } = require("./session-registry.js");
const { findCli } = require("./detect-clis.js");
const { getResumeStrategy } = require("./cli-resume.js");
const { OperationFailedError, fail } = require("../../lib/errors.js");

/**
 * @param {string} sessionName
 * @returns {Promise<never>}
 */
async function runExec(sessionName) {
  const entry = findSession(sessionName);
  if (!entry) {
    fail(
      new OperationFailedError(
        `agileflow launch __exec: no registry entry for session "${sessionName}"`,
        {
          suggestion:
            "this command is meant to be invoked by tmux on session create — " +
            "run `agileflow launch` from the original directory to spawn a session normally",
        },
      ),
      { command: "launch" },
    );
  }

  const cliDesc = findCli(entry.cli);
  if (!cliDesc) {
    fail(
      new OperationFailedError(
        `unknown CLI "${entry.cli}" in registry entry for "${sessionName}"`,
        {
          suggestion:
            "the registry references a CLI agileflow doesn't know about; " +
            "edit ~/.agileflow/launch-sessions.json or re-run `agileflow launch setup`",
        },
      ),
      { command: "launch" },
    );
  }

  const strategy = getResumeStrategy(entry.cli);
  const args = strategy.resumeArgs(entry.uuid);

  /** @type {{ exitCode: number, signal: NodeJS.Signals | null }} */
  let result;
  try {
    result = await runCli(cliDesc.bin, args);
  } catch (err) {
    // Spawn failure — most often the binary disappeared since the
    // session was created. Tell the user what happened and bail with
    // a non-zero exit so the tmux pane closes.
    fail(
      new OperationFailedError(
        `agileflow launch __exec: ${err && err.message ? err.message : String(err)}`,
        {
          suggestion: `verify "${cliDesc.bin}" is on PATH; install it or run \`agileflow launch setup\` to pick a different CLI`,
          cause: err,
        },
      ),
      { command: "launch" },
    );
  }

  // Best-effort UUID capture. Failures here are NEVER fatal — the user
  // ran their CLI fine; we just don't get to update the registry. Worst
  // case: next __exec resumes the same UUID we had before.
  //
  // CRITICAL: only persist a new UUID when the CLI exited cleanly. If
  // claude crashed mid-conversation the newest .jsonl is an incomplete
  // snapshot, and resuming into it later would land the user in a
  // corrupted state. On non-zero exit we still bump lastSeen so the
  // registry shows the session was alive recently, but the UUID
  // pointer stays at whatever the last successful capture wrote.
  try {
    if (result.exitCode === 0) {
      const newUuid = strategy.captureUuid(entry.cwd);
      if (newUuid) {
        updateSession(sessionName, {
          uuid: newUuid,
          lastSeen: new Date().toISOString(),
        });
      } else {
        updateSession(sessionName, { lastSeen: new Date().toISOString() });
      }
    } else {
      updateSession(sessionName, { lastSeen: new Date().toISOString() });
    }
  } catch {
    /* swallow */
  }

  process.exit(result.exitCode);
}

module.exports = { runExec };
