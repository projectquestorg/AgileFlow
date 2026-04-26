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
const path = require('path');
const { runEvent } = require('../../runtime/hooks/orchestrator.js');
const {
  VALID_EVENTS,
  MATCHER_EVENTS,
} = require('../../runtime/hooks/manifest-loader.js');

/**
 * @param {string} event
 * @param {{ matcher?: string }} options
 */
async function hook(event, options = {}) {
  // Validate event name BEFORE doing any I/O. A typo like "SesionStart"
  // would otherwise produce a silent empty-chain no-op.
  if (!VALID_EVENTS.has(event)) {
    // eslint-disable-next-line no-console
    console.error(
      `agileflow hook: unknown event "${event}". Valid events: ${[...VALID_EVENTS].sort().join(', ')}`,
    );
    process.exit(1);
  }
  // Tool-related events MUST come with a matcher (Claude Code passes
  // tool_name in stdin, but we register matcher-keyed entries in
  // settings.json so each tool gets its own dispatcher invocation).
  if (MATCHER_EVENTS.has(event) && !options.matcher) {
    // eslint-disable-next-line no-console
    console.error(
      `agileflow hook: event "${event}" requires --matcher (e.g. --matcher Bash)`,
    );
    process.exit(1);
  }

  const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const agileflowDir = path.join(projectDir, '.agileflow');

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

  // PreCompact and Stop must NOT block, regardless of chain outcome.
  if (event === 'PreCompact' || event === 'Stop') {
    process.exit(0);
  }
  process.exit(result.exitCode);
}

module.exports = hook;
