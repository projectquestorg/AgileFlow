#!/usr/bin/env node
/**
 * AgileFlow v4 CLI entry.
 *
 * Thin shebang wrapper — all logic lives in src/cli/index.js so the
 * dispatcher is unit-testable without spawning a process.
 */
const { run } = require('../src/cli/index.js');

run(process.argv).catch((err) => {
  // Fail-loud at the top level; commander itself handles structured exits.
  // eslint-disable-next-line no-console
  console.error(err && err.stack ? err.stack : String(err));
  process.exit(1);
});
