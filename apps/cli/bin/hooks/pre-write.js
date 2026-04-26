#!/usr/bin/env node
/**
 * Claude Code hook dispatcher: PreToolUse for the Write tool.
 *
 * Registered in `.claude/settings.json` as a `PreToolUse` hook with
 * `matcher: "Write"`. Mirror of pre-bash.js for the Write tool.
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
    event: 'PreToolUse',
    matcher: 'Write',
    agileflowDir,
    stdin,
  });
  process.exit(result.exitCode);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('PreToolUse:Write dispatcher error:', err && err.stack ? err.stack : err);
  process.exit(0);
});
