#!/usr/bin/env node
/**
 * Claude Code hook dispatcher: Stop.
 *
 * Runs when the agent stops. Hooks here perform cleanup, capture
 * end-of-session metrics, or trigger self-improvement loops. Like
 * PreCompact, this dispatcher always exits 0 — a Stop hook failure
 * should not be treated as a blocking event.
 */
const path = require('path');
const { runEvent } = require('../../src/runtime/hooks/orchestrator.js');

async function main() {
  const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const agileflowDir = path.join(projectDir, '.agileflow');

  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const stdin = Buffer.concat(chunks);

  await runEvent({
    event: 'Stop',
    agileflowDir,
    stdin,
  });
  // Stop is non-blocking — always exit 0 regardless of chain outcome.
  process.exit(0);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Stop dispatcher error:', err && err.stack ? err.stack : err);
  process.exit(0);
});
