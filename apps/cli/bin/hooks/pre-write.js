#!/usr/bin/env node
/**
 * Claude Code hook dispatcher: PreToolUse:Write.
 *
 * Mirror of pre-bash.js but for the Write tool. Same path-validation
 * use case as pre-edit.js — Claude Code differentiates the matchers,
 * but the hook chain semantics are identical.
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
    event: 'PreToolUse:Write',
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
