#!/usr/bin/env node
/**
 * Core plugin hook: session-welcome.
 *
 * Phase 3 stub. The real welcome banner (similar to v3's
 * agileflow-welcome.js but ~200 lines instead of 79KB) lands in
 * Phase 4 alongside the rest of Core plugin content.
 *
 * Reads stdin (Claude Code's payload) and exits 0 — non-blocking.
 */
let stdin = '';
process.stdin.on('data', (chunk) => {
  stdin += chunk;
});
process.stdin.on('end', () => {
  // eslint-disable-next-line no-console
  console.log('agileflow: session welcome (Phase 3 stub)');
  process.exit(0);
});
