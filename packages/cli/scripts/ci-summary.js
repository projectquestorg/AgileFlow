#!/usr/bin/env node

/**
 * AgileFlow CLI - CI Summary Script
 *
 * Summarizes CI/CD workflow failures from the past 24 hours.
 * Uses GitHub CLI (gh) to fetch workflow run data.
 *
 * Usage:
 *   node scripts/ci-summary.js [options]
 *
 * Options:
 *   --json         Output results as JSON
 *   --hours=N      Look back N hours (default: 24)
 *   --quiet        Only show failures
 *   --help         Show help
 */

const { execFileSync } = require('child_process');
const path = require('path');

// ANSI colors
const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
};

/**
 * Parse command line arguments
 */
function parseArgs(args) {
  const options = {
    json: false,
    hours: 24,
    quiet: false,
    help: false,
  };

  for (const arg of args) {
    if (arg === '--json') options.json = true;
    else if (arg === '--quiet') options.quiet = true;
    else if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg.startsWith('--hours=')) {
      const hours = parseInt(arg.split('=')[1], 10);
      if (!isNaN(hours) && hours > 0) {
        options.hours = hours;
      }
    }
  }

  return options;
}

/**
 * Show help message
 */
function showHelp() {
  console.log(`
${c.bold}AgileFlow CI Summary${c.reset}

${c.cyan}Usage:${c.reset}
  node scripts/ci-summary.js [options]

${c.cyan}Options:${c.reset}
  --json         Output results as JSON
  --hours=N      Look back N hours (default: 24)
  --quiet        Only show failures
  --help, -h     Show this help message
`);
}

/**
 * Check if gh CLI is available
 */
function hasGhCli() {
  try {
    execFileSync('gh', ['--version'], { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if we're in a git repo with a GitHub remote
 */
function hasGitHubRemote() {
  try {
    const remote = execFileSync('git', ['remote', 'get-url', 'origin'], {
      stdio: 'pipe',
      encoding: 'utf8',
    }).trim();
    return remote.includes('github.com');
  } catch {
    return false;
  }
}

/**
 * Fetch workflow runs from GitHub
 */
function fetchWorkflowRuns(hours) {
  try {
    const output = execFileSync(
      'gh',
      [
        'run',
        'list',
        '--limit',
        '50',
        '--json',
        'databaseId,name,status,conclusion,createdAt,headBranch,event,url',
      ],
      { stdio: 'pipe', encoding: 'utf8', timeout: 30000 }
    );

    const runs = JSON.parse(output);
    const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);

    return runs.filter(run => new Date(run.createdAt) >= cutoff);
  } catch (e) {
    throw new Error(`Failed to fetch workflow runs: ${e.message}`);
  }
}

/**
 * Generate summary from runs
 */
function generateSummary(runs, hours) {
  const summary = {
    period_hours: hours,
    total: runs.length,
    successful: 0,
    failed: 0,
    cancelled: 0,
    in_progress: 0,
    failures: [],
    workflows: {},
  };

  for (const run of runs) {
    const workflowName = run.name || 'Unknown';

    if (!summary.workflows[workflowName]) {
      summary.workflows[workflowName] = { total: 0, passed: 0, failed: 0 };
    }
    summary.workflows[workflowName].total++;

    if (run.conclusion === 'success') {
      summary.successful++;
      summary.workflows[workflowName].passed++;
    } else if (run.conclusion === 'failure') {
      summary.failed++;
      summary.workflows[workflowName].failed++;
      summary.failures.push({
        workflow: workflowName,
        branch: run.headBranch,
        event: run.event,
        created: run.createdAt,
        url: run.url,
      });
    } else if (run.conclusion === 'cancelled') {
      summary.cancelled++;
    } else if (run.status === 'in_progress' || run.status === 'queued') {
      summary.in_progress++;
    }
  }

  return summary;
}

/**
 * Format summary for console output
 */
function formatSummary(summary, quiet) {
  const lines = [];

  if (!quiet) {
    lines.push(`${c.bold}CI Summary (last ${summary.period_hours}h)${c.reset}`);
    lines.push('');
  }

  if (summary.total === 0) {
    lines.push(`${c.dim}No workflow runs in the past ${summary.period_hours} hours.${c.reset}`);
    return lines.join('\n');
  }

  if (!quiet) {
    lines.push(`  Total runs:   ${summary.total}`);
    lines.push(`  ${c.green}Successful:${c.reset}  ${summary.successful}`);
    if (summary.failed > 0) {
      lines.push(`  ${c.red}Failed:${c.reset}      ${summary.failed}`);
    }
    if (summary.cancelled > 0) {
      lines.push(`  ${c.yellow}Cancelled:${c.reset}   ${summary.cancelled}`);
    }
    if (summary.in_progress > 0) {
      lines.push(`  ${c.cyan}In progress:${c.reset} ${summary.in_progress}`);
    }
    lines.push('');
  }

  // Show failures
  if (summary.failures.length > 0) {
    lines.push(`${c.red}${c.bold}Failures:${c.reset}`);
    for (const failure of summary.failures) {
      lines.push(
        `  ${c.red}x${c.reset} ${failure.workflow} ${c.dim}(${failure.branch}, ${failure.event})${c.reset}`
      );
      if (failure.url) {
        lines.push(`    ${c.dim}${failure.url}${c.reset}`);
      }
    }
    lines.push('');
  }

  // Workflow breakdown (non-quiet)
  if (!quiet) {
    const workflowNames = Object.keys(summary.workflows);
    if (workflowNames.length > 0) {
      lines.push(`${c.bold}Workflows:${c.reset}`);
      for (const name of workflowNames) {
        const w = summary.workflows[name];
        const status = w.failed > 0 ? c.red : c.green;
        lines.push(`  ${status}${name}${c.reset}: ${w.passed}/${w.total} passed`);
      }
    }
  }

  return lines.join('\n');
}

/**
 * Main entry point
 */
function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    showHelp();
    process.exit(0);
  }

  // Pre-flight checks
  if (!hasGhCli()) {
    if (options.json) {
      console.log(JSON.stringify({ error: 'GitHub CLI (gh) not installed', runs: [] }));
    } else {
      console.log(
        `${c.dim}CI Summary: GitHub CLI (gh) not available. Install from https://cli.github.com/${c.reset}`
      );
    }
    process.exit(0);
  }

  if (!hasGitHubRemote()) {
    if (options.json) {
      console.log(JSON.stringify({ error: 'No GitHub remote found', runs: [] }));
    } else {
      console.log(`${c.dim}CI Summary: No GitHub remote detected. Skipping.${c.reset}`);
    }
    process.exit(0);
  }

  // Fetch and summarize
  try {
    const runs = fetchWorkflowRuns(options.hours);
    const summary = generateSummary(runs, options.hours);

    if (options.json) {
      console.log(JSON.stringify(summary, null, 2));
    } else {
      console.log(formatSummary(summary, options.quiet));
    }

    // Always exit 0 when summary was generated successfully.
    // The automation runner treats non-zero as script failure.
    process.exit(0);
  } catch (e) {
    if (options.json) {
      console.log(JSON.stringify({ error: e.message, runs: [] }));
    } else {
      console.error(`${c.red}CI Summary error:${c.reset} ${e.message}`);
    }
    process.exit(1);
  }
}

main();
