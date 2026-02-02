#!/usr/bin/env node
/**
 * backfill-ideation-status.js - One-time migration to fix existing data
 *
 * Scans all completed epics and marks their linked ideas as "implemented".
 * Run with --dry-run first to preview changes.
 *
 * Usage:
 *   node packages/cli/scripts/backfill-ideation-status.js --dry-run
 *   node packages/cli/scripts/backfill-ideation-status.js
 */

const path = require('path');
const { syncImplementedIdeas, getSyncStatus } = require('./lib/sync-ideation-status');

// ANSI colors
const c = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
};

function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const help = args.includes('--help') || args.includes('-h');

  if (help) {
    console.log(`
${c.cyan}backfill-ideation-status.js${c.reset} - Mark ideas as implemented based on completed epics

${c.yellow}Usage:${c.reset}
  node backfill-ideation-status.js [options]

${c.yellow}Options:${c.reset}
  --dry-run    Preview changes without saving
  --help, -h   Show this help message

${c.yellow}Description:${c.reset}
  This script scans all completed epics in status.json that have a 'research'
  field linking to an ideation report. For each epic, it finds all ideas in
  ideation-index.json that originated from that report and marks them as
  'implemented'.

${c.yellow}Example:${c.reset}
  # Preview what would change
  node packages/cli/scripts/backfill-ideation-status.js --dry-run

  # Apply changes
  node packages/cli/scripts/backfill-ideation-status.js
`);
    process.exit(0);
  }

  // Determine project root
  const rootDir = process.cwd();

  console.log(`\n${c.cyan}═══════════════════════════════════════════════════════════${c.reset}`);
  console.log(`${c.cyan}  Ideation Status Backfill Migration${c.reset}`);
  console.log(`${c.cyan}═══════════════════════════════════════════════════════════${c.reset}\n`);

  if (dryRun) {
    console.log(`${c.yellow}🔍 DRY RUN MODE - No changes will be saved${c.reset}\n`);
  }

  // Get status before
  const statusBefore = getSyncStatus(rootDir);
  console.log(`${c.dim}Current status:${c.reset}`);
  console.log(`  Total ideas:  ${statusBefore.totalIdeas}`);
  console.log(`  Pending:      ${statusBefore.pending}`);
  console.log(`  Implemented:  ${statusBefore.implemented}`);
  console.log(`  In Progress:  ${statusBefore.inProgress || 0}`);
  console.log(`  Rejected:     ${statusBefore.rejected || 0}`);
  console.log();

  // Run sync
  console.log(`${c.dim}Scanning completed epics...${c.reset}\n`);
  const result = syncImplementedIdeas(rootDir, { dryRun, verbose: true });

  if (!result.ok) {
    console.error(`\n${c.red}Migration failed:${c.reset}`);
    result.errors.forEach(e => console.error(`  ${c.red}✗${c.reset} ${e}`));
    process.exit(1);
  }

  // Summary
  console.log(`\n${c.cyan}───────────────────────────────────────────────────────────${c.reset}`);
  console.log(`${c.cyan}  Summary${c.reset}`);
  console.log(`${c.cyan}───────────────────────────────────────────────────────────${c.reset}\n`);

  if (result.updated === 0) {
    console.log(`${c.green}✓${c.reset} No ideas needed updating - all already synced!\n`);
  } else {
    const verb = dryRun ? 'would be' : 'were';
    console.log(`${c.green}✓${c.reset} ${result.updated} idea(s) ${verb} marked as implemented\n`);

    // Show details
    console.log(`${c.dim}Details by epic:${c.reset}`);
    for (const [epicId, info] of Object.entries(result.details)) {
      console.log(`  ${c.cyan}${epicId}${c.reset} (${info.research})`);
      info.ideas.forEach(id => console.log(`    ${c.green}→${c.reset} ${id}`));
    }
    console.log();

    // Get status after (only if not dry run)
    if (!dryRun) {
      const statusAfter = getSyncStatus(rootDir);
      console.log(`${c.dim}Updated status:${c.reset}`);
      console.log(`  Total ideas:  ${statusAfter.totalIdeas}`);
      console.log(`  Pending:      ${statusAfter.pending} ${c.dim}(was ${statusBefore.pending})${c.reset}`);
      console.log(`  Implemented:  ${statusAfter.implemented} ${c.green}(+${result.updated})${c.reset}`);
      console.log();
    }
  }

  if (dryRun && result.updated > 0) {
    console.log(`${c.yellow}Run without --dry-run to apply these changes${c.reset}\n`);
  }
}

main();
