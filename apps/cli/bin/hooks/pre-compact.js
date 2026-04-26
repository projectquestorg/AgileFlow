#!/usr/bin/env node
/**
 * Claude Code hook dispatcher: PreCompact.
 *
 * Runs immediately before context compaction. Hooks here preserve
 * critical state (open-task lists, session metadata) so it survives the
 * compaction summary. Always fails open — losing a hook should never
 * block compaction.
 */
const path = require('path');
const { runEvent } = require('../../src/runtime/hooks/orchestrator.js');

async function main() {
  const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const agileflowDir = path.join(projectDir, '.agileflow');

  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const stdin = Buffer.concat(chunks);

  const result = await runEvent({
    event: 'PreCompact',
    agileflowDir,
    stdin,
  });
  // Always exit 0 — compaction must not be blocked even on hook chain failure.
  process.exit(result.exitCode === 0 ? 0 : 0);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('PreCompact dispatcher error:', err && err.stack ? err.stack : err);
  process.exit(0);
});
