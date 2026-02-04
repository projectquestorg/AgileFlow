#!/usr/bin/env node
/**
 * automation-run-due.js - Run all due automations
 *
 * This script is spawned by the SessionStart hook to run
 * due automations in the background without blocking the welcome display.
 *
 * Usage:
 *   node automation-run-due.js [--verbose]
 */

'use strict';

const fs = require('fs');
const path = require('path');

// Resolve paths for automation modules
let automationRunner;
try {
  automationRunner = require('./lib/automation-runner.js');
} catch (e) {
  console.error('Automation runner not available:', e.message);
  process.exit(1);
}

const { getProjectRoot, getBusLogPath } = require('../lib/paths');

// Parse arguments
const verbose = process.argv.includes('--verbose') || process.argv.includes('-v');

/**
 * Log to bus/log.jsonl
 */
function logToBus(rootDir, message) {
  try {
    const busPath = getBusLogPath(rootDir);
    const dir = path.dirname(busPath);

    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const entry = {
      ts: new Date().toISOString(),
      from: 'AUTOMATION',
      type: 'automation',
      ...message,
    };

    fs.appendFileSync(busPath, JSON.stringify(entry) + '\n');
  } catch (e) {
    // Silently fail
  }
}

/**
 * Main entry point
 */
async function main() {
  const rootDir = getProjectRoot();
  const runner = automationRunner.getAutomationRunner({ rootDir });

  // Log start
  logToBus(rootDir, {
    action: 'run_due_started',
    timestamp: new Date().toISOString(),
  });

  if (verbose) {
    console.log('[Automation] Checking for due automations...');
  }

  try {
    const { ran, results } = await runner.runDue();

    if (ran === 0) {
      if (verbose) {
        console.log('[Automation] No automations due.');
      }
      return;
    }

    // Log results
    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    logToBus(rootDir, {
      action: 'run_due_completed',
      ran,
      successful,
      failed,
      results: results.map(r => ({
        id: r.id,
        success: r.success,
        duration_ms: r.duration_ms,
        error: r.error,
      })),
    });

    if (verbose) {
      console.log(`[Automation] Ran ${ran} automation(s): ${successful} succeeded, ${failed} failed`);
      for (const result of results) {
        const status = result.success ? '✓' : '✗';
        console.log(`  ${status} ${result.id} (${result.duration_ms}ms)`);
        if (result.error) {
          console.log(`    Error: ${result.error}`);
        }
      }
    }
  } catch (error) {
    logToBus(rootDir, {
      action: 'run_due_error',
      error: error.message,
    });

    if (verbose) {
      console.error('[Automation] Error:', error.message);
    }
    process.exit(1);
  }
}

main().catch(error => {
  console.error('Unexpected error:', error);
  process.exit(1);
});
