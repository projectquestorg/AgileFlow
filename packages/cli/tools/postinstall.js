#!/usr/bin/env node

/**
 * AgileFlow Postinstall Script
 *
 * Automatically runs AgileFlow installation after npm install.
 * Includes smart detection to avoid running in inappropriate contexts.
 */

const { execSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const { c: colors } = require('../lib/colors');

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function shouldSkipInstall() {
  // Skip if environment variable is set
  if (process.env.AGILEFLOW_SKIP_INSTALL === 'true') {
    log('ℹ️  Skipping auto-install (AGILEFLOW_SKIP_INSTALL=true)', 'dim');
    return true;
  }

  // Skip in CI environments
  if (process.env.CI === 'true' || process.env.CI === '1') {
    log('ℹ️  Skipping auto-install (CI environment detected)', 'dim');
    return true;
  }

  // Skip if installed globally
  if (process.env.npm_config_global === 'true') {
    log('ℹ️  Skipping auto-install (global installation)', 'dim');
    log('   Run "agileflow setup" in your project directory instead', 'dim');
    return true;
  }

  // Skip if running in npm cache or npx temp directory
  if (__dirname.includes('_npx') || __dirname.includes('.npm')) {
    log('ℹ️  Skipping auto-install (npm cache or npx temp directory)', 'dim');
    return true;
  }

  // Skip if we're in the AgileFlow monorepo itself (development mode)
  // Check for monorepo structure: packages/cli/tools/postinstall.js
  // __dirname is tools/ so ../ goes to packages/cli/
  const packageJsonPath = path.join(__dirname, '..', 'package.json');

  if (fs.existsSync(packageJsonPath)) {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));

    if (packageJson.name === 'agileflow') {
      // Check multiple indicators of monorepo development:
      // 1. Parent directory structure (packages/cli pattern)
      const isInPackagesDir = __dirname.includes('/packages/cli/');

      // 2. Workspace root package.json exists
      // Path from tools/ -> packages/cli -> packages -> AgileFlow
      const rootPackageJson = path.join(__dirname, '..', '..', '..', 'package.json');
      let isWorkspaceRoot = false;
      if (fs.existsSync(rootPackageJson)) {
        try {
          const rootPkg = JSON.parse(fs.readFileSync(rootPackageJson, 'utf-8'));
          isWorkspaceRoot = rootPkg.name === 'agileflow-monorepo' || Boolean(rootPkg.workspaces);
        } catch (e) {
          // Ignore parse errors
        }
      }

      // 3. Git repository check (look for .git in monorepo root)
      // Path from tools/ -> packages/cli -> packages -> AgileFlow -> .git
      const gitDir = path.join(__dirname, '..', '..', '..', '.git');
      const isGitRepo = fs.existsSync(gitDir);

      if (isInPackagesDir || isWorkspaceRoot || isGitRepo) {
        log('ℹ️  Skipping auto-install (running in development/monorepo)', 'dim');
        return true;
      }
    }
  }

  // Get the installation directory (user's project root)
  const installDir = process.cwd();

  // Skip if .agileflow or .claude/commands/agileflow folder already exists
  const agileflowPath = path.join(installDir, '.agileflow');
  const claudeAgileflowPath = path.join(installDir, '.claude', 'commands', 'AgileFlow');

  if (fs.existsSync(agileflowPath) || fs.existsSync(claudeAgileflowPath)) {
    log('ℹ️  AgileFlow already installed in this project', 'dim');
    return true;
  }

  return false;
}

async function runAutoInstall() {
  try {
    console.log(''); // Blank line for spacing
    log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'blue');
    log('  AgileFlow Auto-Setup', 'blue');
    log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'blue');
    console.log('');

    // Path to the CLI
    const cliPath = path.join(__dirname, 'cli', 'agileflow-cli.js');

    if (!fs.existsSync(cliPath)) {
      log('⚠️  Could not find AgileFlow CLI. Run "npx agileflow setup" manually.', 'yellow');
      return;
    }

    // Check if running in interactive mode (TTY)
    const isInteractive = process.stdin.isTTY && process.stdout.isTTY;

    if (isInteractive) {
      // Interactive mode: ask for confirmation
      console.log('AgileFlow can set up automatically in your project now.');
      console.log('');
      console.log('Options:');
      console.log('  1) Run setup now (recommended)');
      console.log('  2) Skip setup for now (run "npx agileflow setup" later)');
      console.log('');

      // Use readline for simple input
      const readline = require('readline').createInterface({
        input: process.stdin,
        output: process.stdout,
      });

      const answer = await new Promise(resolve => {
        readline.question('Choose an option (1 or 2): ', ans => {
          readline.close();
          resolve(ans.trim());
        });
      });

      console.log('');

      if (answer !== '1') {
        log('ℹ️  Setup skipped. Run "npx agileflow setup" when ready.', 'dim');
        console.log('');
        return;
      }

      log('🚀 Setting up AgileFlow in your project...', 'green');
      console.log('');

      // Run setup command (interactive mode, no --yes flag)
      execSync(`node "${cliPath}" setup`, {
        stdio: 'inherit',
        cwd: process.cwd(),
      });
    } else {
      // Non-interactive mode (e.g., npm install in scripts): run with --yes
      log('🚀 Setting up AgileFlow in your project...', 'green');
      console.log('');

      execSync(`node "${cliPath}" setup --yes`, {
        stdio: 'inherit',
        cwd: process.cwd(),
      });
    }

    console.log('');
    log('✨ AgileFlow is ready to use!', 'green');
    console.log('');
    log('To skip auto-setup in the future, set: AGILEFLOW_SKIP_INSTALL=true', 'dim');
    console.log('');
  } catch (error) {
    console.log('');
    log('⚠️  Auto-setup encountered an issue.', 'yellow');
    log('   You can run "npx agileflow setup" manually to complete setup.', 'yellow');
    console.log('');

    if (process.env.DEBUG) {
      console.error(error);
    }
  }
}

// Main execution
(async () => {
  if (shouldSkipInstall()) {
    process.exit(0);
  }

  await runAutoInstall();
})();
