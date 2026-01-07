#!/usr/bin/env node

/**
 * AgileFlow TUI Dashboard
 *
 * BETA - Internal use only, not publicly documented
 *
 * Usage: npx agileflow start
 */

const path = require('path');
const fs = require('fs');

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  orange: '\x1b[38;2;232;104;58m',
  bgYellow: '\x1b[43m',
  bgRed: '\x1b[41m',
};

function showBetaWarning() {
  console.log('');
  console.log(`${colors.bgYellow}${colors.bold}  BETA  ${colors.reset} ${colors.yellow}This feature is in beta and not yet stable${colors.reset}`);
  console.log(`${colors.dim}        Expect bugs and incomplete features${colors.reset}`);
  console.log('');
}

function showHeader() {
  console.log(`${colors.orange}${colors.bold}`);
  console.log('  ╔═══════════════════════════════════════════╗');
  console.log('  ║         AgileFlow TUI Dashboard           ║');
  console.log('  ╚═══════════════════════════════════════════╝');
  console.log(`${colors.reset}`);
}

async function loadStatus() {
  const statusPath = path.join(process.cwd(), 'docs', '09-agents', 'status.json');

  if (!fs.existsSync(statusPath)) {
    return null;
  }

  try {
    const content = fs.readFileSync(statusPath, 'utf8');
    return JSON.parse(content);
  } catch (err) {
    return null;
  }
}

function getStatusColor(status) {
  switch (status) {
    case 'completed':
    case 'done':
      return colors.green;
    case 'in_progress':
    case 'in-progress':
      return colors.yellow;
    case 'blocked':
      return colors.red;
    case 'ready':
      return colors.cyan;
    default:
      return colors.dim;
  }
}

function formatStory(story) {
  const statusColor = getStatusColor(story.status);
  const id = story.id || story.story_id || 'Unknown';
  const title = story.title || story.summary || 'Untitled';
  const status = (story.status || 'unknown').toUpperCase();
  const owner = story.owner || '-';

  return `  ${colors.bold}${id}${colors.reset} ${title.substring(0, 40)}${title.length > 40 ? '...' : ''}
           ${statusColor}[${status}]${colors.reset} ${colors.dim}Owner: ${owner}${colors.reset}`;
}

async function showDashboard() {
  showBetaWarning();
  showHeader();

  const status = await loadStatus();

  if (!status) {
    console.log(`${colors.dim}  No status.json found. Run /agileflow:story to create stories.${colors.reset}`);
    console.log('');
    return;
  }

  // Count stories by status
  const stories = Object.values(status).filter(s => s && typeof s === 'object' && (s.id || s.story_id));
  const counts = {
    in_progress: stories.filter(s => ['in_progress', 'in-progress'].includes(s.status)).length,
    blocked: stories.filter(s => s.status === 'blocked').length,
    ready: stories.filter(s => s.status === 'ready').length,
    completed: stories.filter(s => ['completed', 'done'].includes(s.status)).length,
  };

  const total = stories.length;
  const completionPct = total > 0 ? Math.round((counts.completed / total) * 100) : 0;

  // Summary
  console.log(`${colors.bold}  Summary${colors.reset}`);
  console.log(`  ────────────────────────────────────────────`);
  console.log(`  ${colors.yellow}In Progress:${colors.reset} ${counts.in_progress}   ${colors.red}Blocked:${colors.reset} ${counts.blocked}   ${colors.cyan}Ready:${colors.reset} ${counts.ready}   ${colors.green}Done:${colors.reset} ${counts.completed}`);
  console.log(`  ${colors.dim}Completion: ${completionPct}%${colors.reset}`);
  console.log('');

  // In Progress Stories
  const inProgressStories = stories.filter(s => ['in_progress', 'in-progress'].includes(s.status));
  if (inProgressStories.length > 0) {
    console.log(`${colors.bold}  ${colors.yellow}In Progress${colors.reset}`);
    console.log(`  ────────────────────────────────────────────`);
    inProgressStories.forEach(story => {
      console.log(formatStory(story));
    });
    console.log('');
  }

  // Blocked Stories
  const blockedStories = stories.filter(s => s.status === 'blocked');
  if (blockedStories.length > 0) {
    console.log(`${colors.bold}  ${colors.red}Blocked${colors.reset}`);
    console.log(`  ────────────────────────────────────────────`);
    blockedStories.forEach(story => {
      console.log(formatStory(story));
    });
    console.log('');
  }

  // Ready Stories (up to 5)
  const readyStories = stories.filter(s => s.status === 'ready').slice(0, 5);
  if (readyStories.length > 0) {
    console.log(`${colors.bold}  ${colors.cyan}Ready for Work${colors.reset} ${colors.dim}(showing ${readyStories.length} of ${counts.ready})${colors.reset}`);
    console.log(`  ────────────────────────────────────────────`);
    readyStories.forEach(story => {
      console.log(formatStory(story));
    });
    console.log('');
  }

  console.log(`${colors.dim}  Use /agileflow:board for interactive kanban view${colors.reset}`);
  console.log(`${colors.dim}  Use /agileflow:story:list for full story list${colors.reset}`);
  console.log('');
}

async function main() {
  const args = process.argv.slice(2);

  // Check for help flag
  if (args.includes('--help') || args.includes('-h')) {
    showBetaWarning();
    console.log(`${colors.bold}AgileFlow TUI Dashboard${colors.reset}`);
    console.log('');
    console.log(`${colors.bold}Usage:${colors.reset}`);
    console.log('  npx agileflow start           Show dashboard');
    console.log('  npx agileflow start --help    Show this help');
    console.log('');
    console.log(`${colors.dim}This is a beta feature. For stable commands, use Claude Code slash commands.${colors.reset}`);
    return;
  }

  await showDashboard();
}

main().catch(err => {
  console.error(`${colors.red}Error:${colors.reset}`, err.message);
  process.exit(1);
});

module.exports = { main };
