#!/usr/bin/env node
/**
 * Claude Code hook dispatcher: SessionStart.
 *
 * Registered once in `.claude/settings.json` and invoked by Claude Code
 * at session boot. Reads `.agileflow/hook-manifest.yaml`, runs the
 * SessionStart chain via the orchestrator, and exits with the chain's
 * resolved exit code.
 *
 * Always fails open unless a hook with `skipOnError: false` failed: the
 * orchestrator returns 0 even when individual hooks errored, as long as
 * they had `skipOnError: true`. This is the v3 cascade-failure fix.
 */
const path = require('path');
const { runEvent } = require('../../src/runtime/hooks/orchestrator.js');

async function main() {
  const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const agileflowDir = path.join(projectDir, '.agileflow');

  // Read stdin (Claude Code may pipe a JSON payload).
  /** @type {Buffer[]} */
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const stdin = Buffer.concat(chunks);

  const result = await runEvent({
    event: 'SessionStart',
    agileflowDir,
    stdin,
  });

  process.exit(result.exitCode);
}

main().catch((err) => {
  // Hook dispatcher must NEVER throw uncaught — that would block
  // session start. Log to stderr and fail open.
  // eslint-disable-next-line no-console
  console.error('SessionStart dispatcher error:', err && err.stack ? err.stack : err);
  process.exit(0);
});
