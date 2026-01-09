#!/usr/bin/env node

/**
 * screenshot-verifier.js - Verify all screenshots have been reviewed
 *
 * Part of Visual Mode for UI development. This script checks that all
 * screenshots in a directory have been prefixed with "verified-" to
 * confirm Claude has visually reviewed each one.
 *
 * Usage:
 *   node scripts/screenshot-verifier.js                    # Default: ./screenshots
 *   node scripts/screenshot-verifier.js --path ./e2e/shots # Custom path
 *   node scripts/screenshot-verifier.js --help             # Show help
 *
 * Exit codes:
 *   0 - All screenshots verified (or no screenshots found)
 *   1 - Some screenshots missing verified- prefix
 *   2 - Error (directory not found, etc.)
 */

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
  brand: '\x1b[38;2;232;104;58m',
};

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    path: './screenshots',
    help: false,
    quiet: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--quiet' || arg === '-q') {
      options.quiet = true;
    } else if (arg === '--path' || arg === '-p') {
      if (args[i + 1]) {
        options.path = args[i + 1];
        i++;
      }
    } else if (!arg.startsWith('-')) {
      // Positional argument - treat as path
      options.path = arg;
    }
  }

  return options;
}

// Show help message
function showHelp() {
  console.log(`
${c.brand}${c.bold}screenshot-verifier${c.reset} - Verify all screenshots have been reviewed

${c.bold}USAGE${c.reset}
  node screenshot-verifier.js [OPTIONS] [PATH]

${c.bold}OPTIONS${c.reset}
  --path, -p <dir>   Directory containing screenshots (default: ./screenshots)
  --quiet, -q        Only output on failure
  --help, -h         Show this help message

${c.bold}EXAMPLES${c.reset}
  node screenshot-verifier.js                       # Check ./screenshots
  node screenshot-verifier.js ./tests/e2e/shots     # Check custom path
  node screenshot-verifier.js --path ./shots -q     # Quiet mode

${c.bold}EXIT CODES${c.reset}
  0 - All screenshots verified (or no screenshots found)
  1 - Some screenshots missing 'verified-' prefix
  2 - Error (directory not found, etc.)

${c.bold}VISUAL MODE${c.reset}
  This script is part of AgileFlow's Visual Mode for UI development.

  Workflow:
  1. Playwright tests create screenshots in the target directory
  2. Claude reviews each screenshot visually
  3. Claude renames verified screenshots with 'verified-' prefix
  4. This script confirms all screenshots have been reviewed

  The 'verified-' prefix ensures Claude actually looked at each image
  rather than declaring completion prematurely.
`);
}

// Get all image files in directory
function getImageFiles(dir) {
  const imageExtensions = ['.png', '.jpg', '.jpeg', '.webp', '.gif'];

  try {
    const files = fs.readdirSync(dir);
    return files.filter((file) => {
      const ext = path.extname(file).toLowerCase();
      return imageExtensions.includes(ext);
    });
  } catch (err) {
    if (err.code === 'ENOENT') {
      return null; // Directory doesn't exist
    }
    throw err;
  }
}

// Main verification logic
function verifyScreenshots(options) {
  const dir = path.resolve(options.path);

  // Check if directory exists
  if (!fs.existsSync(dir)) {
    if (!options.quiet) {
      console.log(`${c.yellow}No screenshots directory found at: ${dir}${c.reset}`);
      console.log(`${c.dim}Create the directory or run tests to generate screenshots.${c.reset}`);
    }
    return { success: true, total: 0, verified: 0, unverified: [] };
  }

  // Get all image files
  const files = getImageFiles(dir);

  if (files === null) {
    console.error(`${c.red}Error: Could not read directory: ${dir}${c.reset}`);
    process.exit(2);
  }

  if (files.length === 0) {
    if (!options.quiet) {
      console.log(`${c.yellow}No screenshots found in: ${dir}${c.reset}`);
    }
    return { success: true, total: 0, verified: 0, unverified: [] };
  }

  // Check each file for verified- prefix
  const verified = [];
  const unverified = [];

  for (const file of files) {
    if (file.startsWith('verified-')) {
      verified.push(file);
    } else {
      unverified.push(file);
    }
  }

  return {
    success: unverified.length === 0,
    total: files.length,
    verified: verified.length,
    unverified,
  };
}

// Format result output
function formatResult(result, options) {
  if (options.quiet && result.success) {
    return;
  }

  console.log('');

  if (result.total === 0) {
    console.log(`${c.yellow}No screenshots to verify${c.reset}`);
    return;
  }

  if (result.success) {
    console.log(`${c.green}${c.bold}All screenshots verified${c.reset}`);
    console.log(`${c.dim}${result.verified}/${result.total} screenshots have 'verified-' prefix${c.reset}`);
  } else {
    console.log(`${c.red}${c.bold}Unverified screenshots found${c.reset}`);
    console.log(`${c.dim}${result.verified}/${result.total} verified${c.reset}`);
    console.log('');
    console.log(`${c.yellow}Missing 'verified-' prefix:${c.reset}`);
    for (const file of result.unverified) {
      console.log(`  ${c.red}- ${file}${c.reset}`);
    }
    console.log('');
    console.log(`${c.cyan}To verify: Review each screenshot visually, then rename:${c.reset}`);
    console.log(`${c.dim}  mv screenshots/example.png screenshots/verified-example.png${c.reset}`);
  }

  console.log('');
}

// Main entry point
function main() {
  const options = parseArgs();

  if (options.help) {
    showHelp();
    process.exit(0);
  }

  const result = verifyScreenshots(options);
  formatResult(result, options);

  process.exit(result.success ? 0 : 1);
}

// Run if called directly
if (require.main === module) {
  main();
}

// Export for testing
module.exports = { verifyScreenshots, getImageFiles };
