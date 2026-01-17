#!/usr/bin/env node

/**
 * AgileFlow TUI Dashboard
 *
 * Static dashboard view - prints once and exits.
 * No continuous refresh, no screen clearing, scrollable output.
 *
 * Usage: npx agileflow tui
 */

const path = require('path');
const fs = require('fs');
const { c: colors } = require('../../../lib/colors');

function showHeader(version) {
  console.log('');
  console.log(
    `${colors.orange}${colors.bold}  ╔═══════════════════════════════════════════╗${colors.reset}`
  );
  console.log(
    `${colors.orange}${colors.bold}  ║         AgileFlow Dashboard               ║${colors.reset}`
  );
  console.log(
    `${colors.orange}${colors.bold}  ╚═══════════════════════════════════════════╝${colors.reset}`
  );
  if (version) {
    console.log(`${colors.dim}  v${version}${colors.reset}`);
  }
  console.log('');
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

function loadLoopStatus() {
  const loopPath = path.join(process.cwd(), 'docs', '09-agents', 'loop-status.json');

  if (!fs.existsSync(loopPath)) {
    return null;
  }

  try {
    const content = fs.readFileSync(loopPath, 'utf8');
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

function getStatusSymbol(status) {
  switch (status) {
    case 'completed':
    case 'done':
      return '✓';
    case 'in_progress':
    case 'in-progress':
      return '▶';
    case 'blocked':
      return '✗';
    case 'ready':
      return '○';
    default:
      return '·';
  }
}

function formatStory(story, compact = false) {
  const statusColor = getStatusColor(story.status);
  const symbol = getStatusSymbol(story.status);
  const id = story.id || story.story_id || 'Unknown';
  const title = story.title || story.summary || 'Untitled';
  const status = (story.status || 'unknown').replace(/_/g, ' ');
  const owner = story.owner || '-';

  if (compact) {
    const truncTitle = title.length > 35 ? title.substring(0, 32) + '...' : title;
    return `  ${statusColor}${symbol}${colors.reset} ${colors.bold}${id}${colors.reset} ${truncTitle}`;
  }

  return `  ${statusColor}${symbol}${colors.reset} ${colors.bold}${id}${colors.reset} ${title.substring(0, 50)}${title.length > 50 ? '...' : ''}
     ${statusColor}${status}${colors.reset} ${colors.dim}│ Owner: ${owner}${colors.reset}`;
}

function drawProgressBar(percent, width = 20) {
  const filled = Math.round((percent / 100) * width);
  const empty = width - filled;
  const bar = '█'.repeat(filled) + '░'.repeat(empty);

  let color = colors.red;
  if (percent >= 80) color = colors.green;
  else if (percent >= 50) color = colors.yellow;
  else if (percent >= 20) color = colors.cyan;

  return `${color}${bar}${colors.reset} ${percent}%`;
}

async function showDashboard(options = {}) {
  const version = options.version;
  const compact = options.compact || false;

  showHeader(version);

  const status = await loadStatus();
  const loopStatus = loadLoopStatus();

  if (!status) {
    console.log(
      `${colors.dim}  No status.json found. Run /agileflow:story to create stories.${colors.reset}`
    );
    console.log('');
    return;
  }

  // Count stories by status
  const stories = Object.values(status).filter(
    s => s && typeof s === 'object' && (s.id || s.story_id)
  );
  const counts = {
    in_progress: stories.filter(s => ['in_progress', 'in-progress'].includes(s.status)).length,
    blocked: stories.filter(s => s.status === 'blocked').length,
    ready: stories.filter(s => s.status === 'ready').length,
    completed: stories.filter(s => ['completed', 'done'].includes(s.status)).length,
  };

  const total = stories.length;
  const completionPct = total > 0 ? Math.round((counts.completed / total) * 100) : 0;

  // Summary Section
  console.log(`${colors.bold}  SUMMARY${colors.reset}`);
  console.log(`  ${'─'.repeat(45)}`);
  console.log(
    `  ${colors.yellow}● In Progress:${colors.reset} ${counts.in_progress}   ${colors.red}● Blocked:${colors.reset} ${counts.blocked}   ${colors.cyan}● Ready:${colors.reset} ${counts.ready}   ${colors.green}● Done:${colors.reset} ${counts.completed}`
  );
  console.log(`  Progress: ${drawProgressBar(completionPct)}`);
  console.log('');

  // Loop Status (if active)
  if (loopStatus && loopStatus.state && loopStatus.state !== 'idle') {
    const stateColor =
      loopStatus.state === 'running'
        ? colors.green
        : loopStatus.state === 'paused'
          ? colors.yellow
          : colors.dim;
    console.log(`${colors.bold}  ACTIVE LOOP${colors.reset}`);
    console.log(`  ${'─'.repeat(45)}`);
    console.log(
      `  ${stateColor}●${colors.reset} ${loopStatus.epic || '-'} / ${loopStatus.story || '-'}`
    );
    if (loopStatus.progress !== undefined) {
      console.log(`  Progress: ${drawProgressBar(loopStatus.progress)}`);
    }
    console.log('');
  }

  // In Progress Stories
  const inProgressStories = stories.filter(s => ['in_progress', 'in-progress'].includes(s.status));
  if (inProgressStories.length > 0) {
    console.log(`${colors.bold}  ${colors.yellow}IN PROGRESS${colors.reset}`);
    console.log(`  ${'─'.repeat(45)}`);
    inProgressStories.forEach(story => {
      console.log(formatStory(story, compact));
    });
    console.log('');
  }

  // Blocked Stories
  const blockedStories = stories.filter(s => s.status === 'blocked');
  if (blockedStories.length > 0) {
    console.log(`${colors.bold}  ${colors.red}BLOCKED${colors.reset}`);
    console.log(`  ${'─'.repeat(45)}`);
    blockedStories.forEach(story => {
      console.log(formatStory(story, compact));
    });
    console.log('');
  }

  // Ready Stories (up to 5)
  const readyStories = stories.filter(s => s.status === 'ready').slice(0, 5);
  if (readyStories.length > 0) {
    const moreReady =
      counts.ready > 5 ? ` ${colors.dim}(+${counts.ready - 5} more)${colors.reset}` : '';
    console.log(`${colors.bold}  ${colors.cyan}READY${colors.reset}${moreReady}`);
    console.log(`  ${'─'.repeat(45)}`);
    readyStories.forEach(story => {
      console.log(formatStory(story, compact));
    });
    console.log('');
  }

  // Completed Stories (last 3)
  const completedStories = stories
    .filter(s => ['completed', 'done'].includes(s.status))
    .slice(-3)
    .reverse();
  if (completedStories.length > 0) {
    const moreCompleted =
      counts.completed > 3 ? ` ${colors.dim}(+${counts.completed - 3} more)${colors.reset}` : '';
    console.log(`${colors.bold}  ${colors.green}RECENTLY COMPLETED${colors.reset}${moreCompleted}`);
    console.log(`  ${'─'.repeat(45)}`);
    completedStories.forEach(story => {
      console.log(formatStory(story, compact));
    });
    console.log('');
  }

  // Footer
  console.log(`${colors.dim}  ─────────────────────────────────────────────${colors.reset}`);
  console.log(`${colors.dim}  /agileflow:board       Interactive kanban view${colors.reset}`);
  console.log(`${colors.dim}  /agileflow:story:list  Full story listing${colors.reset}`);
  console.log('');
}

async function main(options = {}) {
  const args = process.argv.slice(2);

  // Check for help flag
  if (args.includes('--help') || args.includes('-h')) {
    console.log('');
    console.log(`${colors.bold}AgileFlow TUI Dashboard${colors.reset}`);
    console.log('');
    console.log(`${colors.bold}Usage:${colors.reset}`);
    console.log('  npx agileflow tui           Show dashboard');
    console.log('  npx agileflow tui --compact Compact view');
    console.log('  npx agileflow tui --help    Show this help');
    console.log('');
    return;
  }

  const compact = args.includes('--compact') || args.includes('-c');

  // Get version from package.json
  let version;
  try {
    const pkgPath = path.join(__dirname, '..', '..', '..', 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    version = pkg.version;
  } catch (e) {
    version = null;
  }

  await showDashboard({ version, compact, ...options });
}

// Run directly if executed as script
if (require.main === module) {
  main().catch(err => {
    console.error(`${colors.red}Error:${colors.reset}`, err.message);
    process.exit(1);
  });
}

module.exports = {
  name: 'tui',
  description: 'Show project dashboard',
  action: main,
};
