#!/usr/bin/env node
/**
 * Claude Code hook dispatcher: PreToolUse:Edit.
 *
 * Mirror of pre-bash.js but for the Edit tool. Hooks here typically
 * gate which paths can be edited (session-boundary, damage-control-edit).
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
    event: 'PreToolUse:Edit',
    agileflowDir,
    stdin,
  });
  process.exit(result.exitCode);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('PreToolUse:Edit dispatcher error:', err && err.stack ? err.stack : err);
  process.exit(0);
});
