/**
 * `agileflow hook <event>` — unified hook dispatcher.
 *
 * Replaces the per-event scripts under `bin/hooks/*.js` for production
 * use. Claude Code's `.claude/settings.json` registers
 * `npx --no-install agileflow hook <event> [--matcher <name>]` as the
 * hook command.
 *
 * Validates the event name + matcher requirement up front so
 * misspellings or missing flags surface as loud errors (exit 1)
 * instead of silently no-op'ing the chain. Once past validation, reads
 * stdin, calls the orchestrator's `runEvent`, and exits with the
 * chain's resolved code. Always fails open on internal errors.
 */
const path = require("path");
const { runEvent } = require("../../runtime/hooks/orchestrator.js");
const {
  VALID_EVENTS,
  MATCHER_EVENTS,
} = require("../../runtime/hooks/manifest-loader.js");
const { InvalidArgumentError, fail } = require("../../lib/errors.js");

/**
 * Events whose stdout Claude Code injects into the model's context. For
 * these, a non-empty chain stdout is re-emitted as a single JSON envelope
 * so the captured hook output actually reaches the model. Every other
 * event emits nothing to stdout.
 * @type {Set<string>}
 */
const CONTEXT_EVENTS = new Set([
  "SessionStart",
  "PostCompact",
  "UserPromptSubmit",
]);

/**
 * Emit the chain's accumulated stdout as a single Claude Code context
 * envelope line, if the event is context-capable and there is output.
 * Uses JSON.stringify for correct escaping. Never throws.
 * @param {string} event
 * @param {import('../../runtime/hooks/orchestrator.js').ChainOutcome} result
 */
function emitContext(event, result) {
  if (!CONTEXT_EVENTS.has(event)) return;
  if (typeof result.stdout !== "string" || result.stdout.length === 0) return;
  const envelope = {
    hookSpecificOutput: {
      hookEventName: event,
      additionalContext: result.stdout,
    },
  };
  process.stdout.write(JSON.stringify(envelope) + "\n");
}

/**
 * @param {string} event
 * @param {{ matcher?: string }} options
 */
async function hook(event, options = {}) {
  // Validate event name BEFORE doing any I/O. A typo like "SesionStart"
  // would otherwise produce a silent empty-chain no-op.
  if (!VALID_EVENTS.has(event)) {
    fail(
      new InvalidArgumentError(`unknown event "${event}"`, {
        suggestion: `use one of: ${[...VALID_EVENTS].sort().join(", ")}`,
      }),
      { command: "hook" },
    );
  }
  // Tool-related events MUST come with a matcher (Claude Code passes
  // tool_name in stdin, but we register matcher-keyed entries in
  // settings.json so each tool gets its own dispatcher invocation).
  if (MATCHER_EVENTS.has(event) && !options.matcher) {
    fail(
      new InvalidArgumentError(`event "${event}" requires --matcher`, {
        suggestion: `add a tool name, e.g. --matcher Bash`,
      }),
      { command: "hook" },
    );
  }

  const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const agileflowDir = path.join(projectDir, ".agileflow");

  /** @type {Buffer[]} */
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const stdin = Buffer.concat(chunks);

  let result;
  try {
    result = await runEvent({
      event,
      matcher: options.matcher,
      agileflowDir,
      stdin,
    });
  } catch (err) {
    // Hook dispatcher must NEVER throw uncaught — fail open.
    // eslint-disable-next-line no-console
    console.error(
      `agileflow hook ${event} dispatcher error:`,
      err && err.stack ? err.stack : err,
    );
    process.exit(0);
  }

  // Re-emit captured hook stdout as a context envelope for context-capable
  // events. Guard against any internal error so the dispatcher stays
  // fail-open — a formatting failure must never block the session.
  try {
    emitContext(event, result);
  } catch {
    /* fail open — never block on a context-emit failure */
  }

  // PostCompact and Stop must NOT block, regardless of chain outcome.
  // PostCompact still emits its additionalContext line above BEFORE exiting 0.
  if (event === "PostCompact" || event === "Stop") {
    process.exit(0);
  }
  process.exit(result.exitCode);
}

module.exports = hook;
