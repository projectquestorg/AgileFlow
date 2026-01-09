#!/usr/bin/env node

/**
 * get-env.js - Helper script to output environment information
 *
 * This script can be called from hooks or other automation to get
 * consistent environment information about the AgileFlow project.
 *
 * Usage:
 *   node scripts/get-env.js [--json] [--compact]
 *
 * Flags:
 *   --json     Output as JSON
 *   --compact  Minimal output for status line
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

function getProjectInfo() {
  const rootDir = path.resolve(__dirname, '..');

  // Read package.json files
  let cliPackage = {};
  let rootPackage = {};

  try {
    cliPackage = JSON.parse(
      fs.readFileSync(path.join(rootDir, 'packages/cli/package.json'), 'utf8')
    );
  } catch (err) {
    // Ignore if not found
  }

  try {
    rootPackage = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
  } catch (err) {
    // Ignore if not found
  }

  // Get git info
  let gitBranch = 'unknown';
  let gitCommit = 'unknown';
  let recentCommits = [];

  try {
    gitBranch = execSync('git branch --show-current', {
      cwd: rootDir,
      encoding: 'utf8',
    }).trim();
    gitCommit = execSync('git rev-parse --short HEAD', {
      cwd: rootDir,
      encoding: 'utf8',
    }).trim();

    // Get recent commits (last 5)
    const commitLog = execSync('git log --oneline -5 2>/dev/null', {
      cwd: rootDir,
      encoding: 'utf8',
    }).trim();
    recentCommits = commitLog.split('\n').filter(Boolean);
  } catch (err) {
    // Ignore if git not available
  }

  // Get AgileFlow status info
  const activeStories = [];
  let wipCount = 0;
  let blockedCount = 0;
  const activeEpics = [];

  try {
    const statusPath = path.join(rootDir, 'docs/09-agents/status.json');
    if (fs.existsSync(statusPath)) {
      const status = JSON.parse(fs.readFileSync(statusPath, 'utf8'));

      // Get active stories
      if (status.stories) {
        Object.entries(status.stories).forEach(([id, story]) => {
          if (story.status === 'in_progress') {
            activeStories.push({ id, title: story.title, owner: story.owner });
            wipCount++;
          }
          if (story.status === 'blocked') {
            blockedCount++;
          }
        });
      }

      // Get active epics
      if (status.epics) {
        Object.entries(status.epics).forEach(([id, epic]) => {
          if (epic.status !== 'complete') {
            activeEpics.push({ id, title: epic.title });
          }
        });
      }
    }
  } catch (err) {
    // Ignore if status.json not available
  }

  return {
    project: {
      name: cliPackage.name || rootPackage.name || 'AgileFlow',
      version: cliPackage.version || rootPackage.version || 'unknown',
      description: cliPackage.description || rootPackage.description || '',
      rootDir: rootDir,
    },
    git: {
      branch: gitBranch,
      commit: gitCommit,
      recentCommits: recentCommits,
    },
    agileflow: {
      activeStories: activeStories,
      wipCount: wipCount,
      blockedCount: blockedCount,
      activeEpics: activeEpics,
    },
    system: {
      node: process.version,
      platform: os.platform(),
      arch: os.arch(),
      hostname: os.hostname(),
      user: os.userInfo().username,
    },
    timestamp: new Date().toISOString(),
  };
}

function formatOutput(info, asJson = false, compact = false) {
  if (asJson) {
    return JSON.stringify(info, null, 2);
  }

  if (compact) {
    // Minimal output for status line
    const story = info.agileflow.activeStories[0];
    const storyStr = story ? `${story.id}: ${story.title.substring(0, 30)}` : 'No active story';
    return `[${info.git.branch}] ${storyStr} | WIP: ${info.agileflow.wipCount}`;
  }

  // ANSI colors (including brand color #e8683a as RGB)
  const c = {
    reset: '\x1b[0m',
    bold: '\x1b[1m',
    dim: '\x1b[2m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
    red: '\x1b[31m',
    brand: '\x1b[38;2;232;104;58m', // #e8683a - AgileFlow brand orange

    // Vibrant 256-color palette (modern, sleek look)
    mintGreen: '\x1b[38;5;158m', // Healthy/success states
    peach: '\x1b[38;5;215m', // Warning states
    coral: '\x1b[38;5;203m', // Critical/error states
    lightGreen: '\x1b[38;5;194m', // Session healthy
    skyBlue: '\x1b[38;5;117m', // Directories/paths
    lavender: '\x1b[38;5;147m', // Model info
  };

  // Beautiful compact colorful format (using vibrant 256-color palette)
  const lines = [];

  // Header line with project info (brand color name, dim version, colored branch)
  const branchColor = info.git.branch === 'main' ? c.mintGreen : c.skyBlue;
  lines.push(
    `${c.brand}${c.bold}${info.project.name}${c.reset} ${c.dim}v${info.project.version}${c.reset} | ${branchColor}${info.git.branch}${c.reset} ${c.dim}(${info.git.commit})${c.reset}`
  );

  // Status line (peach WIP, coral blocked)
  const wipColor = info.agileflow.wipCount > 0 ? c.peach : c.dim;
  let statusLine =
    info.agileflow.wipCount > 0
      ? `${wipColor}WIP: ${info.agileflow.wipCount}${c.reset}`
      : `${c.dim}No active work${c.reset}`;
  if (info.agileflow.blockedCount > 0) {
    statusLine += ` | ${c.coral}Blocked: ${info.agileflow.blockedCount}${c.reset}`;
  }
  lines.push(statusLine);

  // Active story (if any) - just the first one (sky blue label)
  if (info.agileflow.activeStories.length > 0) {
    const story = info.agileflow.activeStories[0];
    lines.push(`${c.skyBlue}Current:${c.reset} ${story.id} - ${story.title}`);
  }

  // Last commit (just one, dim)
  if (info.git.recentCommits.length > 0) {
    lines.push(`${c.dim}Last: ${info.git.recentCommits[0]}${c.reset}`);
  }

  return lines.join('\n');
}

// Main execution
if (require.main === module) {
  const args = process.argv.slice(2);
  const asJson = args.includes('--json');
  const compact = args.includes('--compact');

  try {
    const info = getProjectInfo();
    console.log(formatOutput(info, asJson, compact));
    process.exit(0);
  } catch (err) {
    console.error('Error getting environment info:', err.message);
    process.exit(1);
  }
}

// Export for use as module
module.exports = { getProjectInfo, formatOutput };
