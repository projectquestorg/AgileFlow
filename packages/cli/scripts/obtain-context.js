#!/usr/bin/env node
/**
 * obtain-context.js
 *
 * Gathers all project context in a single execution for any AgileFlow command or agent.
 *
 * SMART OUTPUT STRATEGY:
 * - Calculates summary character count dynamically
 * - Shows (30K - summary_chars) of full content first
 * - Then shows the summary (so user sees it at their display cutoff)
 * - Then shows rest of full content (for Claude)
 *
 * Usage:
 *   node scripts/obtain-context.js              # Just gather context
 *   node scripts/obtain-context.js babysit      # Gather + register 'babysit'
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const DISPLAY_LIMIT = 30000; // Claude Code's Bash tool display limit

// Optional: Register command for PreCompact context preservation
const commandName = process.argv[2];
if (commandName) {
  const sessionStatePath = 'docs/09-agents/session-state.json';
  if (fs.existsSync(sessionStatePath)) {
    try {
      const state = JSON.parse(fs.readFileSync(sessionStatePath, 'utf8'));

      // Initialize active_commands array if not present
      if (!Array.isArray(state.active_commands)) {
        state.active_commands = [];
      }

      // Remove any existing entry for this command (avoid duplicates)
      state.active_commands = state.active_commands.filter(c => c.name !== commandName);

      // Add the new command
      state.active_commands.push({
        name: commandName,
        activated_at: new Date().toISOString(),
        state: {},
      });

      // Remove legacy active_command field (only use active_commands array now)
      if (state.active_command !== undefined) {
        delete state.active_command;
      }

      fs.writeFileSync(sessionStatePath, JSON.stringify(state, null, 2) + '\n');
    } catch (e) {
      // Silently continue if session state can't be updated
    }
  }
}

// ANSI colors
const C = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
  cyan: '\x1b[36m',
  yellow: '\x1b[33m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  magenta: '\x1b[35m',
  blue: '\x1b[34m',
  brightCyan: '\x1b[96m',
  brightYellow: '\x1b[93m',
  brightGreen: '\x1b[92m',
  brand: '\x1b[38;2;232;104;58m', // AgileFlow brand orange

  // Vibrant 256-color palette (modern, sleek look)
  mintGreen: '\x1b[38;5;158m',    // Healthy/success states
  peach: '\x1b[38;5;215m',        // Warning states
  coral: '\x1b[38;5;203m',        // Critical/error states
  lightGreen: '\x1b[38;5;194m',   // Session healthy
  lightYellow: '\x1b[38;5;228m',  // Session warning
  skyBlue: '\x1b[38;5;117m',      // Directories/paths
  lavender: '\x1b[38;5;147m',     // Model info
  softGold: '\x1b[38;5;222m',     // Cost/money
};

function safeRead(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
}

function safeReadJSON(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function safeLs(dirPath) {
  try {
    return fs.readdirSync(dirPath);
  } catch {
    return [];
  }
}

function safeExec(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } catch {
    return null;
  }
}

// ============================================
// GENERATE SUMMARY (calculated first for positioning)
// ============================================

function generateSummary() {
  // Box drawing characters
  const box = {
    tl: '╭',
    tr: '╮',
    bl: '╰',
    br: '╯',
    h: '─',
    v: '│',
    lT: '├',
    rT: '┤',
    tT: '┬',
    bT: '┴',
    cross: '┼',
  };

  const W = 58; // Total inner width (matches welcome script)
  const L = 20; // Left column width
  const R = W - 24; // Right column width (34 chars) - matches welcome

  // Pad string to length, accounting for ANSI codes
  function pad(str, len) {
    const stripped = str.replace(/\x1b\[[0-9;]*m/g, '');
    const diff = len - stripped.length;
    if (diff <= 0) return str;
    return str + ' '.repeat(diff);
  }

  // Truncate string to max length, respecting ANSI codes
  function truncate(str, maxLen, suffix = '..') {
    const stripped = str.replace(/\x1b\[[0-9;]*m/g, '');
    if (stripped.length <= maxLen) return str;

    const targetLen = maxLen - suffix.length;
    let visibleCount = 0;
    let cutIndex = 0;
    let inEscape = false;

    for (let i = 0; i < str.length; i++) {
      if (str[i] === '\x1b') {
        inEscape = true;
      } else if (inEscape && str[i] === 'm') {
        inEscape = false;
      } else if (!inEscape) {
        visibleCount++;
        if (visibleCount >= targetLen) {
          cutIndex = i + 1;
          break;
        }
      }
    }
    return str.substring(0, cutIndex) + suffix;
  }

  // Create a row with auto-truncation
  function row(left, right, leftColor = '', rightColor = '') {
    const leftStr = `${leftColor}${left}${leftColor ? C.reset : ''}`;
    const rightTrunc = truncate(right, R);
    const rightStr = `${rightColor}${rightTrunc}${rightColor ? C.reset : ''}`;
    return `${C.dim}${box.v}${C.reset} ${pad(leftStr, L)} ${C.dim}${box.v}${C.reset} ${pad(rightStr, R)} ${C.dim}${box.v}${C.reset}\n`;
  }

  // All borders use same width formula: 22 dashes + separator + 36 dashes = 61 total chars
  const divider = () =>
    `${C.dim}${box.lT}${box.h.repeat(L + 2)}${box.cross}${box.h.repeat(W - L - 2)}${box.rT}${C.reset}\n`;
  const headerTopBorder = `${C.dim}${box.tl}${box.h.repeat(L + 2)}${box.tT}${box.h.repeat(W - L - 2)}${box.tr}${C.reset}\n`;
  const headerDivider = `${C.dim}${box.lT}${box.h.repeat(L + 2)}${box.tT}${box.h.repeat(W - L - 2)}${box.rT}${C.reset}\n`;
  const bottomBorder = `${C.dim}${box.bl}${box.h.repeat(L + 2)}${box.bT}${box.h.repeat(W - L - 2)}${box.br}${C.reset}\n`;

  // Gather data
  const branch = safeExec('git branch --show-current') || 'unknown';
  const lastCommitShort = safeExec('git log -1 --format="%h"') || '?';
  const lastCommitMsg = safeExec('git log -1 --format="%s"') || 'no commits';
  const statusLines = (safeExec('git status --short') || '').split('\n').filter(Boolean);
  const statusJson = safeReadJSON('docs/09-agents/status.json');
  const sessionState = safeReadJSON('docs/09-agents/session-state.json');
  const researchFiles = safeLs('docs/10-research')
    .filter(f => f.endsWith('.md') && f !== 'README.md')
    .sort()
    .reverse();
  const epicFiles = safeLs('docs/05-epics').filter(f => f.endsWith('.md') && f !== 'README.md');

  // Count stories by status
  const byStatus = {};
  const readyStories = [];
  if (statusJson && statusJson.stories) {
    Object.entries(statusJson.stories).forEach(([id, story]) => {
      const s = story.status || 'unknown';
      byStatus[s] = (byStatus[s] || 0) + 1;
      if (s === 'ready') readyStories.push(id);
    });
  }

  // Session info
  let sessionDuration = null;
  let currentStory = null;
  if (sessionState && sessionState.current_session && sessionState.current_session.started_at) {
    const started = new Date(sessionState.current_session.started_at);
    sessionDuration = Math.round((Date.now() - started.getTime()) / 60000);
    currentStory = sessionState.current_session.current_story;
  }

  // Build table
  let summary = '\n';
  summary += headerTopBorder;

  // Header row (full width, no column divider)
  const title = commandName ? `Context [${commandName}]` : 'Context Summary';
  const branchColor = branch === 'main' ? C.mintGreen : branch.startsWith('fix') ? C.coral : C.skyBlue;
  const maxBranchLen = 20;
  const branchDisplay =
    branch.length > maxBranchLen ? branch.substring(0, maxBranchLen - 2) + '..' : branch;
  const header = `${C.brand}${C.bold}${title}${C.reset}  ${branchColor}${branchDisplay}${C.reset} ${C.dim}(${lastCommitShort})${C.reset}`;
  summary += `${C.dim}${box.v}${C.reset} ${pad(header, W - 1)} ${C.dim}${box.v}${C.reset}\n`;

  summary += headerDivider;

  // Story counts with vibrant 256-color palette
  summary += row(
    'In Progress',
    byStatus['in-progress'] ? `${byStatus['in-progress']}` : '0',
    C.peach,
    byStatus['in-progress'] ? C.peach : C.dim
  );
  summary += row(
    'Blocked',
    byStatus['blocked'] ? `${byStatus['blocked']}` : '0',
    C.coral,
    byStatus['blocked'] ? C.coral : C.dim
  );
  summary += row(
    'Ready',
    byStatus['ready'] ? `${byStatus['ready']}` : '0',
    C.skyBlue,
    byStatus['ready'] ? C.skyBlue : C.dim
  );
  const completedColor = `${C.bold}${C.mintGreen}`;
  summary += row(
    'Completed',
    byStatus['done'] ? `${byStatus['done']}` : '0',
    completedColor,
    byStatus['done'] ? completedColor : C.dim
  );

  summary += divider();

  // Git status (using vibrant 256-color palette)
  const uncommittedStatus =
    statusLines.length > 0 ? `${statusLines.length} uncommitted` : '✓ clean';
  summary += row('Git', uncommittedStatus, C.blue, statusLines.length > 0 ? C.peach : C.mintGreen);

  // Session
  const sessionText = sessionDuration !== null ? `${sessionDuration} min active` : 'no session';
  summary += row('Session', sessionText, C.blue, sessionDuration !== null ? C.lightGreen : C.dim);

  // Current story
  const storyText = currentStory ? currentStory : 'none';
  summary += row('Working on', storyText, C.blue, currentStory ? C.lightYellow : C.dim);

  // Ready stories (if any)
  if (readyStories.length > 0) {
    summary += row('⭐ Up Next', readyStories.slice(0, 3).join(', '), C.skyBlue, C.skyBlue);
  }

  summary += divider();

  // Key files (using vibrant 256-color palette)
  const keyFileChecks = [
    { path: 'CLAUDE.md', label: 'CLAUDE' },
    { path: 'README.md', label: 'README' },
    { path: 'docs/04-architecture/README.md', label: 'arch' },
    { path: 'docs/02-practices/README.md', label: 'practices' },
  ];
  const keyFileStatus = keyFileChecks
    .map(f => {
      const exists = fs.existsSync(f.path);
      return exists ? `${C.mintGreen}✓${C.reset}${f.label}` : `${C.dim}○${f.label}${C.reset}`;
    })
    .join(' ');
  summary += row('Key files', keyFileStatus, C.lavender, '');

  // Research
  const researchText = researchFiles.length > 0 ? `${researchFiles.length} notes` : 'none';
  summary += row('Research', researchText, C.lavender, researchFiles.length > 0 ? C.skyBlue : C.dim);

  // Epics
  const epicText = epicFiles.length > 0 ? `${epicFiles.length} epics` : 'none';
  summary += row('Epics', epicText, C.lavender, epicFiles.length > 0 ? C.skyBlue : C.dim);

  summary += divider();

  // Last commit (using vibrant 256-color palette)
  summary += row(
    'Last commit',
    `${C.peach}${lastCommitShort}${C.reset} ${lastCommitMsg}`,
    C.dim,
    ''
  );

  summary += bottomBorder;
  summary += '\n';
  summary += `${C.dim}Full context continues below (Claude sees all)...${C.reset}\n\n`;

  return summary;
}

// ============================================
// GENERATE FULL CONTENT
// ============================================

function generateFullContent() {
  let content = '';

  const title = commandName ? `AgileFlow Context [${commandName}]` : 'AgileFlow Context';
  content += `${C.lavender}${C.bold}${title}${C.reset}\n`;
  content += `${C.dim}Generated: ${new Date().toISOString()}${C.reset}\n`;

  // 1. GIT STATUS (using vibrant 256-color palette)
  content += `\n${C.skyBlue}${C.bold}═══ Git Status ═══${C.reset}\n`;
  const branch = safeExec('git branch --show-current') || 'unknown';
  const status = safeExec('git status --short') || '';
  const statusLines = status.split('\n').filter(Boolean);
  const lastCommit = safeExec('git log -1 --format="%h %s"') || 'no commits';

  content += `Branch: ${C.mintGreen}${branch}${C.reset}\n`;
  content += `Last commit: ${C.dim}${lastCommit}${C.reset}\n`;
  if (statusLines.length > 0) {
    content += `Uncommitted: ${C.peach}${statusLines.length} file(s)${C.reset}\n`;
    statusLines.slice(0, 10).forEach(line => (content += `  ${C.dim}${line}${C.reset}\n`));
    if (statusLines.length > 10)
      content += `  ${C.dim}... and ${statusLines.length - 10} more${C.reset}\n`;
  } else {
    content += `Uncommitted: ${C.mintGreen}clean${C.reset}\n`;
  }

  // 2. STATUS.JSON - Full Content (using vibrant 256-color palette)
  content += `\n${C.skyBlue}${C.bold}═══ Status.json (Full Content) ═══${C.reset}\n`;
  const statusJsonPath = 'docs/09-agents/status.json';
  const statusJson = safeReadJSON(statusJsonPath);

  if (statusJson) {
    content += `${C.dim}${'─'.repeat(50)}${C.reset}\n`;
    content +=
      JSON.stringify(statusJson, null, 2)
        .split('\n')
        .map(l => `  ${l}`)
        .join('\n') + '\n';
    content += `${C.dim}${'─'.repeat(50)}${C.reset}\n`;
  } else {
    content += `${C.dim}No status.json found${C.reset}\n`;
  }

  // 3. SESSION STATE (using vibrant 256-color palette)
  content += `\n${C.skyBlue}${C.bold}═══ Session State ═══${C.reset}\n`;
  const sessionState = safeReadJSON('docs/09-agents/session-state.json');
  if (sessionState) {
    const current = sessionState.current_session;
    if (current && current.started_at) {
      const started = new Date(current.started_at);
      const duration = Math.round((Date.now() - started.getTime()) / 60000);
      content += `Active session: ${C.lightGreen}${duration} min${C.reset}\n`;
      if (current.current_story) {
        content += `Working on: ${C.lightYellow}${current.current_story}${C.reset}\n`;
      }
    } else {
      content += `${C.dim}No active session${C.reset}\n`;
    }
    // Show all active commands (array)
    if (Array.isArray(sessionState.active_commands) && sessionState.active_commands.length > 0) {
      const cmdNames = sessionState.active_commands.map(c => c.name).join(', ');
      content += `Active commands: ${C.skyBlue}${cmdNames}${C.reset}\n`;
    } else if (sessionState.active_command) {
      // Backwards compatibility for old format
      content += `Active command: ${C.skyBlue}${sessionState.active_command.name}${C.reset}\n`;
    }
  } else {
    content += `${C.dim}No session-state.json found${C.reset}\n`;
  }

  // 4. DOCS STRUCTURE (using vibrant 256-color palette)
  content += `\n${C.skyBlue}${C.bold}═══ Documentation ═══${C.reset}\n`;
  const docsDir = 'docs';
  const docFolders = safeLs(docsDir).filter(f => {
    try {
      return fs.statSync(path.join(docsDir, f)).isDirectory();
    } catch {
      return false;
    }
  });

  if (docFolders.length > 0) {
    docFolders.forEach(folder => {
      const folderPath = path.join(docsDir, folder);
      const files = safeLs(folderPath);
      const mdFiles = files.filter(f => f.endsWith('.md'));
      const jsonFiles = files.filter(f => f.endsWith('.json') || f.endsWith('.jsonl'));
      const info = [];
      if (mdFiles.length > 0) info.push(`${mdFiles.length} md`);
      if (jsonFiles.length > 0) info.push(`${jsonFiles.length} json`);
      content += `  ${C.dim}${folder}/${C.reset} ${info.length > 0 ? `(${info.join(', ')})` : ''}\n`;
    });
  }

  // 5. RESEARCH NOTES - List + Full content of most recent (using vibrant 256-color palette)
  content += `\n${C.skyBlue}${C.bold}═══ Research Notes ═══${C.reset}\n`;
  const researchDir = 'docs/10-research';
  const researchFiles = safeLs(researchDir).filter(f => f.endsWith('.md') && f !== 'README.md');
  if (researchFiles.length > 0) {
    researchFiles.sort().reverse();
    content += `${C.dim}───${C.reset} Available Research Notes\n`;
    researchFiles.forEach(file => (content += `  ${C.dim}${file}${C.reset}\n`));

    const mostRecentFile = researchFiles[0];
    const mostRecentPath = path.join(researchDir, mostRecentFile);
    const mostRecentContent = safeRead(mostRecentPath);

    if (mostRecentContent) {
      content += `\n${C.mintGreen}📄 Most Recent: ${mostRecentFile}${C.reset}\n`;
      content += `${C.dim}${'─'.repeat(60)}${C.reset}\n`;
      content += mostRecentContent + '\n';
      content += `${C.dim}${'─'.repeat(60)}${C.reset}\n`;
    }
  } else {
    content += `${C.dim}No research notes${C.reset}\n`;
  }

  // 6. BUS MESSAGES (using vibrant 256-color palette)
  content += `\n${C.skyBlue}${C.bold}═══ Recent Agent Messages ═══${C.reset}\n`;
  const busPath = 'docs/09-agents/bus/log.jsonl';
  const busContent = safeRead(busPath);
  if (busContent) {
    const lines = busContent.trim().split('\n').filter(Boolean);
    const recent = lines.slice(-5);
    if (recent.length > 0) {
      recent.forEach(line => {
        try {
          const msg = JSON.parse(line);
          const time = msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString() : '?';
          content += `  ${C.dim}[${time}]${C.reset} ${msg.from || '?'}: ${msg.type || msg.message || '?'}\n`;
        } catch {
          content += `  ${C.dim}${line.substring(0, 80)}...${C.reset}\n`;
        }
      });
    } else {
      content += `${C.dim}No messages${C.reset}\n`;
    }
  } else {
    content += `${C.dim}No bus log found${C.reset}\n`;
  }

  // 7. KEY FILES - Full content
  content += `\n${C.cyan}${C.bold}═══ Key Context Files (Full Content) ═══${C.reset}\n`;

  const keyFilesToRead = [
    { path: 'CLAUDE.md', label: 'CLAUDE.md (Project Instructions)' },
    { path: 'README.md', label: 'README.md (Project Overview)' },
    { path: 'docs/04-architecture/README.md', label: 'Architecture Index' },
    { path: 'docs/02-practices/README.md', label: 'Practices Index' },
    { path: 'docs/08-project/roadmap.md', label: 'Roadmap' },
  ];

  keyFilesToRead.forEach(({ path: filePath, label }) => {
    const fileContent = safeRead(filePath);
    if (fileContent) {
      content += `\n${C.green}✓ ${label}${C.reset} ${C.dim}(${filePath})${C.reset}\n`;
      content += `${C.dim}${'─'.repeat(60)}${C.reset}\n`;
      content += fileContent + '\n';
      content += `${C.dim}${'─'.repeat(60)}${C.reset}\n`;
    } else {
      content += `${C.dim}○ ${label} (not found)${C.reset}\n`;
    }
  });

  const settingsExists = fs.existsSync('.claude/settings.json');
  content += `\n  ${settingsExists ? `${C.green}✓${C.reset}` : `${C.dim}○${C.reset}`} .claude/settings.json\n`;

  // 8. EPICS FOLDER
  content += `\n${C.cyan}${C.bold}═══ Epic Files ═══${C.reset}\n`;
  const epicFiles = safeLs('docs/05-epics').filter(f => f.endsWith('.md') && f !== 'README.md');
  if (epicFiles.length > 0) {
    epicFiles.forEach(file => (content += `  ${C.dim}${file}${C.reset}\n`));
  } else {
    content += `${C.dim}No epic files${C.reset}\n`;
  }

  // FOOTER
  content += `\n${C.dim}─────────────────────────────────────────${C.reset}\n`;
  content += `${C.dim}Context gathered in single execution. Claude has full context.${C.reset}\n`;

  return content;
}

// ============================================
// MAIN: Output with smart summary positioning
// ============================================

const summary = generateSummary();
const fullContent = generateFullContent();

const summaryLength = summary.length;
const cutoffPoint = DISPLAY_LIMIT - summaryLength;

if (fullContent.length <= cutoffPoint) {
  // Full content fits before summary - just output everything
  console.log(fullContent);
  console.log(summary);
} else {
  // Split: content before cutoff + summary + content after cutoff
  const contentBefore = fullContent.substring(0, cutoffPoint);
  const contentAfter = fullContent.substring(cutoffPoint);

  console.log(contentBefore);
  console.log(summary);
  console.log(contentAfter);
}
