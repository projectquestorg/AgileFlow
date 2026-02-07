#!/usr/bin/env node

/**
 * AgileFlow CLI - Dependency Check Script
 *
 * Local script for checking dependency vulnerabilities and generating reports.
 * Can be run manually or integrated into CI/CD pipelines.
 *
 * Usage:
 *   node scripts/dependency-check.js [options]
 *
 * Options:
 *   --json         Output results as JSON
 *   --fix          Attempt to auto-fix vulnerabilities
 *   --force        Force fixes (may include breaking changes)
 *   --severity=X   Minimum severity to report (low, moderate, high, critical)
 *   --quiet        Only show errors
 *   --help         Show help
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
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

const SEVERITY_LEVELS = ['low', 'moderate', 'high', 'critical'];

/**
 * Parse command line arguments
 */
function parseArgs(args) {
  const options = {
    json: false,
    fix: false,
    force: false,
    severity: 'low',
    quiet: false,
    help: false,
  };

  for (const arg of args) {
    if (arg === '--json') options.json = true;
    else if (arg === '--fix') options.fix = true;
    else if (arg === '--force') options.force = true;
    else if (arg === '--quiet') options.quiet = true;
    else if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg.startsWith('--severity=')) {
      const level = arg.split('=')[1].toLowerCase();
      if (SEVERITY_LEVELS.includes(level)) {
        options.severity = level;
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
${c.bold}AgileFlow Dependency Check${c.reset}

${c.cyan}Usage:${c.reset}
  node scripts/dependency-check.js [options]

${c.cyan}Options:${c.reset}
  --json         Output results as JSON
  --fix          Attempt to auto-fix vulnerabilities
  --force        Force fixes (may include breaking changes)
  --severity=X   Minimum severity to report (low, moderate, high, critical)
  --quiet        Only show errors
  --help, -h     Show this help message

${c.cyan}Examples:${c.reset}
  # Check for all vulnerabilities
  node scripts/dependency-check.js

  # Only report high and critical
  node scripts/dependency-check.js --severity=high

  # Auto-fix and output JSON
  node scripts/dependency-check.js --fix --json

  # Force all fixes
  node scripts/dependency-check.js --fix --force
`);
}

/**
 * Run npm audit and parse results
 */
function runAudit() {
  try {
    const output = execFileSync('npm', ['audit', '--json'], {
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024, // 10MB buffer for large outputs
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return JSON.parse(output);
  } catch (error) {
    // npm audit exits with non-zero if vulnerabilities found
    if (error.stdout) {
      try {
        return JSON.parse(error.stdout);
      } catch {
        return { error: error.message, metadata: { vulnerabilities: {} } };
      }
    }
    return { error: error.message, metadata: { vulnerabilities: {} } };
  }
}

/**
 * Apply npm audit fix
 */
function runFix(force = false) {
  const args = force
    ? ['audit', 'fix', '--force', '--legacy-peer-deps']
    : ['audit', 'fix', '--legacy-peer-deps'];
  try {
    const output = execFileSync('npm', args, { encoding: 'utf8', stdio: 'pipe' });
    return { success: true, output };
  } catch (error) {
    return { success: false, error: error.message, output: error.stdout || '' };
  }
}

/**
 * Filter vulnerabilities by severity
 */
function filterBySeverity(audit, minSeverity) {
  const minIndex = SEVERITY_LEVELS.indexOf(minSeverity);
  const filtered = { ...audit };

  if (audit.vulnerabilities) {
    filtered.vulnerabilities = Object.fromEntries(
      Object.entries(audit.vulnerabilities).filter(([, vuln]) => {
        const vulnIndex = SEVERITY_LEVELS.indexOf(vuln.severity);
        return vulnIndex >= minIndex;
      })
    );
  }

  return filtered;
}

/**
 * Format audit results for console output
 */
function formatResults(audit, options) {
  const { metadata = {}, vulnerabilities = {} } = audit;
  const vulnCounts = metadata.vulnerabilities || {};

  const lines = [];

  // Header
  lines.push(`\n${c.bold}Dependency Audit Report${c.reset}`);
  lines.push(`${c.dim}${'─'.repeat(40)}${c.reset}\n`);

  // Summary
  const total = vulnCounts.total || 0;
  if (total === 0) {
    lines.push(`${c.green}✓ No vulnerabilities found!${c.reset}\n`);
    return lines.join('\n');
  }

  lines.push(`${c.bold}Vulnerabilities Found: ${total}${c.reset}`);
  lines.push('');

  // By severity
  if (vulnCounts.critical > 0) {
    lines.push(`  ${c.red}● Critical: ${vulnCounts.critical}${c.reset}`);
  }
  if (vulnCounts.high > 0) {
    lines.push(`  ${c.yellow}● High: ${vulnCounts.high}${c.reset}`);
  }
  if (vulnCounts.moderate > 0) {
    lines.push(`  ${c.cyan}● Moderate: ${vulnCounts.moderate}${c.reset}`);
  }
  if (vulnCounts.low > 0) {
    lines.push(`  ${c.dim}● Low: ${vulnCounts.low}${c.reset}`);
  }
  lines.push('');

  // Details (if not quiet)
  if (!options.quiet && Object.keys(vulnerabilities).length > 0) {
    lines.push(`${c.bold}Details:${c.reset}`);
    for (const [name, vuln] of Object.entries(vulnerabilities)) {
      const severityColor =
        vuln.severity === 'critical'
          ? c.red
          : vuln.severity === 'high'
            ? c.yellow
            : vuln.severity === 'moderate'
              ? c.cyan
              : c.dim;
      lines.push(`  ${severityColor}[${vuln.severity.toUpperCase()}]${c.reset} ${name}`);
      if (vuln.via && Array.isArray(vuln.via)) {
        const vias = vuln.via.filter(v => typeof v === 'object').slice(0, 2);
        for (const via of vias) {
          if (via.title) {
            lines.push(`    └─ ${via.title}`);
          }
        }
      }
    }
    lines.push('');
  }

  // Recommendations
  lines.push(`${c.bold}Recommendations:${c.reset}`);
  lines.push('  Run: npm audit fix');
  if (vulnCounts.critical > 0 || vulnCounts.high > 0) {
    lines.push('  Or force: npm audit fix --force (may include breaking changes)');
  }
  lines.push('');

  return lines.join('\n');
}

/**
 * Main function
 */
async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    showHelp();
    process.exit(0);
  }

  if (!options.quiet && !options.json) {
    console.log(`${c.cyan}Running dependency audit...${c.reset}`);
  }

  // Run audit
  let audit = runAudit();

  // Filter by severity
  audit = filterBySeverity(audit, options.severity);

  // Apply fix if requested
  let fixResult = null;
  if (options.fix) {
    if (!options.quiet && !options.json) {
      console.log(`${c.cyan}Applying fixes...${c.reset}`);
    }
    fixResult = runFix(options.force);
  }

  // Output results
  if (options.json) {
    const result = {
      audit,
      fix: fixResult,
      timestamp: new Date().toISOString(),
      severity_filter: options.severity,
    };
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(formatResults(audit, options));
    if (fixResult) {
      if (fixResult.success) {
        console.log(`${c.green}✓ Fixes applied successfully${c.reset}`);
      } else {
        console.log(`${c.yellow}⚠ Some fixes could not be applied${c.reset}`);
      }
    }
  }

  // Exit with appropriate code
  const vulnCounts = audit.metadata?.vulnerabilities || {};
  const total = vulnCounts.total || 0;
  const hasHighSeverity = (vulnCounts.critical || 0) + (vulnCounts.high || 0) > 0;

  if (hasHighSeverity) {
    process.exit(2); // High/critical vulnerabilities
  } else if (total > 0) {
    process.exit(1); // Some vulnerabilities
  }
  process.exit(0); // All clear
}

// Run if called directly
if (require.main === module) {
  main().catch(error => {
    console.error(`${c.red}Error: ${error.message}${c.reset}`);
    process.exit(1);
  });
}

module.exports = {
  parseArgs,
  runAudit,
  runFix,
  filterBySeverity,
  formatResults,
  SEVERITY_LEVELS,
};
