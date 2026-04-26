#!/usr/bin/env node
/**
 * Claude Code hook dispatcher: PreToolUse for the Bash tool.
 *
 * Registered in `.claude/settings.json` as a `PreToolUse` hook with
 * `matcher: "Bash"`. Claude Code only invokes this dispatcher when a
 * Bash tool call is about to fire. We pass `matcher: "Bash"` through to
 * the orchestrator so manifest hooks with their own matcher field can
 * filter further (e.g. an MCP-tool-only hook will not run here).
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
    matcher: 'Bash',
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
