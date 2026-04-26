#!/usr/bin/env node
/**
 * Claude Code hook dispatcher: PreToolUse:Bash.
 *
 * Runs the chain of hooks registered for `event: PreToolUse:Bash`.
 * Hooks here typically validate Bash commands against allow/block lists
 * (`damage-control-bash`). If any hook with `skipOnError: false` exits
 * non-zero, this dispatcher exits 1 (which Claude Code treats as
 * "block this Bash invocation"). Otherwise exits 0.
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
    event: 'PreToolUse:Bash',
    agileflowDir,
    stdin,
  });
  process.exit(result.exitCode);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('PreToolUse:Bash dispatcher error:', err && err.stack ? err.stack : err);
  process.exit(0);
});
