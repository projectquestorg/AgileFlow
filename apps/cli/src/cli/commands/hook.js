/**
 * `agileflow hook <event>` — unified hook dispatcher.
 *
 * Replaces the per-event scripts under `bin/hooks/*.js` for production
 * use. Claude Code's `.claude/settings.json` registers
 * `npx agileflow hook <event> [--matcher <name>]` as the hook command,
 * which works regardless of whether the package is npm-installed
 * locally, globally, or run via npx — the npm bin entry resolves the
 * path automatically.
 *
 * Reads stdin (Claude Code's payload), calls the orchestrator's
 * `runEvent`, exits with the chain's resolved code. Tool events
 * receive a `--matcher` flag that filters the manifest chain.
 *
 * Always fails open on dispatcher-internal errors (e.g. missing
 * manifest). The orchestrator itself controls the exit code based on
 * `skipOnError` semantics.
 */
const path = require('path');
const { runEvent } = require('../../runtime/hooks/orchestrator.js');

/**
 * @param {string} event
 * @param {{ matcher?: string }} options
 */
async function hook(event, options = {}) {
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
    console.error(`agileflow hook ${event} dispatcher error:`, err && err.stack ? err.stack : err);
    process.exit(0);
    return;
  }

  // PreCompact and Stop must NOT block, regardless of chain outcome.
  if (event === 'PreCompact' || event === 'Stop') {
    process.exit(0);
    return;
  }
  process.exit(result.exitCode);
}

module.exports = hook;
