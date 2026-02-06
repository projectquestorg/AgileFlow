#!/usr/bin/env node
/**
 * context-formatter.js
 *
 * Output formatting module for obtain-context.js (US-0148)
 *
 * Responsibilities:
 * - Summary table generation (compact overview)
 * - Full content generation (detailed context)
 * - Context budget warning display
 * - String padding and truncation utilities
 * - Box drawing and color formatting
 *
 * Note: Uses pre-fetched data from context-loader.js for all formatting
 */

const fs = require('fs');
const path = require('path');

// Import colors and helpers
let C, box;
try {
  const colors = require('../../lib/colors');
  C = colors.c;
  box = colors.box;
} catch {
  // Fallback if colors not available
  C = {
    dim: '',
    reset: '',
    bold: '',
    brand: '',
    coral: '',
    amber: '',
    skyBlue: '',
    mintGreen: '',
    peach: '',
    lavender: '',
    teal: '',
    cyan: '',
    blue: '',
    green: '',
    lightGreen: '',
    lightYellow: '',
  };
  box = {};
}

// Import loader for fallback sync reads
const {
  safeRead,
  safeReadJSON,
  safeLs,
  safeExec,
  getContextPercentage,
} = require('./context-loader');

// Import ideation index for filtering suggestions
let ideationIndex;
try {
  ideationIndex = require('./ideation-index');
} catch {
  // Ideation index not available
}

// =============================================================================
// String Utilities
// =============================================================================

/**
 * Pad string to length, accounting for ANSI escape codes.
 * @param {string} str - String to pad
 * @param {number} len - Target length
 * @returns {string} Padded string
 */
function pad(str, len) {
  const stripped = str.replace(/\x1b\[[0-9;]*m/g, '');
  const diff = len - stripped.length;
  if (diff <= 0) return str;
  return str + ' '.repeat(diff);
}

/**
 * Truncate string to max length, respecting ANSI codes.
 * @param {string} str - String to truncate
 * @param {number} maxLen - Maximum length
 * @param {string} suffix - Suffix for truncated strings
 * @returns {string} Truncated string
 */
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

// =============================================================================
// Context Budget Warning (GSD Integration)
// =============================================================================

/**
 * Generate context budget warning box if usage exceeds threshold.
 * Based on GSD research: 50% is where quality starts degrading.
 *
 * @param {number} percent - Context usage percentage
 * @returns {string} Warning box or empty string
 */
function generateContextWarning(percent) {
  if (percent < 50) {
    return '';
  }

  const width = 60;
  const topLine = `┏${'━'.repeat(width - 2)}┓`;
  const bottomLine = `┗${'━'.repeat(width - 2)}┛`;

  let color, icon, message, suggestion;

  if (percent >= 70) {
    color = C.coral;
    icon = '🔴';
    message = `Context usage: ${percent}% (in degradation zone)`;
    suggestion = 'Strongly recommend: compact conversation or delegate to sub-agent';
  } else {
    color = C.amber;
    icon = '⚠️';
    message = `Context usage: ${percent}% (approaching 50% threshold)`;
    suggestion = 'Consider: delegate to sub-agent or compact conversation';
  }

  const msgPadded = ` ${icon} ${message}`.padEnd(width - 3) + '┃';
  const sugPadded = ` → ${suggestion}`.padEnd(width - 3) + '┃';

  return [
    `${color}${C.bold}${topLine}${C.reset}`,
    `${color}${C.bold}┃${msgPadded}${C.reset}`,
    `${color}${C.bold}┃${sugPadded}${C.reset}`,
    `${color}${C.bold}${bottomLine}${C.reset}`,
    '',
  ].join('\n');
}

// =============================================================================
// Summary Generation
// =============================================================================

/**
 * Generate summary content using pre-fetched data.
 *
 * @param {Object} prefetched - Pre-fetched data from prefetchAllData()
 * @param {Object} options - Additional options
 * @param {string} options.commandName - Active command name
 * @param {string[]} options.activeSections - Active progressive disclosure sections
 * @returns {string} Summary content
 */
function generateSummary(prefetched = null, options = {}) {
  const { commandName = null, activeSections = [] } = options;

  // Box drawing characters
  const boxChars = {
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

  const W = 58; // Total inner width
  const L = 20; // Left column width
  const R = W - 24; // Right column width (34 chars)

  // Create a row with auto-truncation
  function row(left, right, leftColor = '', rightColor = '') {
    const leftStr = `${leftColor}${left}${leftColor ? C.reset : ''}`;
    const rightTrunc = truncate(right, R);
    const rightStr = `${rightColor}${rightTrunc}${rightColor ? C.reset : ''}`;
    return `${C.dim}${boxChars.v}${C.reset} ${pad(leftStr, L)} ${C.dim}${boxChars.v}${C.reset} ${pad(rightStr, R)} ${C.dim}${boxChars.v}${C.reset}\n`;
  }

  const divider = () =>
    `${C.dim}${boxChars.lT}${boxChars.h.repeat(L + 2)}${boxChars.cross}${boxChars.h.repeat(W - L - 2)}${boxChars.rT}${C.reset}\n`;
  const headerTopBorder = `${C.dim}${boxChars.tl}${boxChars.h.repeat(L + 2)}${boxChars.tT}${boxChars.h.repeat(W - L - 2)}${boxChars.tr}${C.reset}\n`;
  const headerDivider = `${C.dim}${boxChars.lT}${boxChars.h.repeat(L + 2)}${boxChars.tT}${boxChars.h.repeat(W - L - 2)}${boxChars.rT}${C.reset}\n`;
  const bottomBorder = `${C.dim}${boxChars.bl}${boxChars.h.repeat(L + 2)}${boxChars.bT}${boxChars.h.repeat(W - L - 2)}${boxChars.br}${C.reset}\n`;

  // Gather data - use prefetched when available, fallback to sync reads
  const branch = prefetched?.git?.branch ?? safeExec('git branch --show-current') ?? 'unknown';
  const lastCommitShort =
    prefetched?.git?.commitShort ?? safeExec('git log -1 --format="%h"') ?? '?';
  const lastCommitMsg =
    prefetched?.git?.commitMsg ?? safeExec('git log -1 --format="%s"') ?? 'no commits';
  const statusLines = (prefetched?.git?.status ?? safeExec('git status --short') ?? '')
    .split('\n')
    .filter(Boolean);
  const statusJson = prefetched?.json?.statusJson ?? safeReadJSON('docs/09-agents/status.json');
  const sessionState =
    prefetched?.json?.sessionState ?? safeReadJSON('docs/09-agents/session-state.json');
  const researchFiles =
    prefetched?.researchFiles ??
    safeLs('docs/10-research')
      .filter(f => f.endsWith('.md') && f !== 'README.md')
      .sort()
      .reverse();
  const epicFiles =
    prefetched?.dirs?.epics?.filter(f => f.endsWith('.md') && f !== 'README.md') ??
    safeLs('docs/05-epics').filter(f => f.endsWith('.md') && f !== 'README.md');

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

  // Header row
  const title = commandName ? `Context [${commandName}]` : 'Context Summary';
  const branchColor =
    branch === 'main' ? C.mintGreen : branch.startsWith('fix') ? C.coral : C.skyBlue;
  const maxBranchLen = 20;
  const branchDisplay =
    branch.length > maxBranchLen ? branch.substring(0, maxBranchLen - 2) + '..' : branch;
  const header = `${C.brand}${C.bold}${title}${C.reset}  ${branchColor}${branchDisplay}${C.reset} ${C.dim}(${lastCommitShort})${C.reset}`;
  summary += `${C.dim}${boxChars.v}${C.reset} ${pad(header, W - 1)} ${C.dim}${boxChars.v}${C.reset}\n`;

  summary += headerDivider;

  // Story counts
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

  // Git status
  const uncommittedStatus =
    statusLines.length > 0 ? `${statusLines.length} uncommitted` : '✓ clean';
  summary += row('Git', uncommittedStatus, C.blue, statusLines.length > 0 ? C.peach : C.mintGreen);

  // Session
  const sessionText = sessionDuration !== null ? `${sessionDuration} min active` : 'no session';
  summary += row('Session', sessionText, C.blue, sessionDuration !== null ? C.lightGreen : C.dim);

  // Current story
  const storyText = currentStory ? currentStory : 'none';
  summary += row('Working on', storyText, C.blue, currentStory ? C.lightYellow : C.dim);

  // Ready stories
  if (readyStories.length > 0) {
    summary += row('⭐ Up Next', readyStories.slice(0, 3).join(', '), C.skyBlue, C.skyBlue);
  }

  // Progressive disclosure: Show active sections
  if (activeSections.length > 0) {
    summary += divider();
    const sectionList = activeSections.join(', ');
    summary += row('📖 Sections', sectionList, C.cyan, C.mintGreen);
  }

  summary += divider();

  // Key files
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
  summary += row(
    'Research',
    researchText,
    C.lavender,
    researchFiles.length > 0 ? C.skyBlue : C.dim
  );

  // Epics
  const epicText = epicFiles.length > 0 ? `${epicFiles.length} epics` : 'none';
  summary += row('Epics', epicText, C.lavender, epicFiles.length > 0 ? C.skyBlue : C.dim);

  summary += divider();

  // Last commit
  summary += row(
    'Last commit',
    `${C.peach}${lastCommitShort}${C.reset} ${lastCommitMsg}`,
    C.dim,
    ''
  );

  summary += bottomBorder;

  return summary;
}

// =============================================================================
// Full Content Generation
// =============================================================================

/**
 * Generate full content using pre-fetched data.
 *
 * @param {Object} prefetched - Pre-fetched data from prefetchAllData()
 * @param {Object} options - Additional options
 * @param {string} options.commandName - Active command name
 * @param {string[]} options.activeSections - Active progressive disclosure sections
 * @returns {string} Full content
 */
function generateFullContent(prefetched = null, options = {}) {
  const { commandName = null, activeSections = [] } = options;

  let content = '';

  const title = commandName ? `AgileFlow Context [${commandName}]` : 'AgileFlow Context';
  content += `${C.lavender}${C.bold}${title}${C.reset}\n`;
  content += `${C.dim}Generated: ${new Date().toISOString()}${C.reset}\n`;

  // SESSION CONTEXT BANNER
  const sessionManagerPath = path.join(__dirname, '..', 'session-manager.js');
  const altSessionManagerPath = '.agileflow/scripts/session-manager.js';

  if (fs.existsSync(sessionManagerPath) || fs.existsSync(altSessionManagerPath)) {
    const managerPath = fs.existsSync(sessionManagerPath)
      ? sessionManagerPath
      : altSessionManagerPath;
    const sessionStatus = safeExec(`node "${managerPath}" status`);

    if (sessionStatus) {
      try {
        const statusData = JSON.parse(sessionStatus);
        if (statusData.current) {
          const session = statusData.current;
          const isMain = session.is_main === true;
          const sessionName = session.nickname
            ? `Session ${session.id} "${session.nickname}"`
            : `Session ${session.id}`;

          content += `\n${C.teal}${C.bold}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${C.reset}\n`;
          content += `${C.teal}${C.bold}📍 SESSION CONTEXT${C.reset}\n`;
          content += `${C.teal}${C.bold}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${C.reset}\n`;

          if (isMain) {
            content += `${C.mintGreen}${C.bold}${sessionName}${C.reset} ${C.dim}(main project)${C.reset}\n`;
          } else {
            content += `${C.peach}${C.bold}🔀 ${sessionName}${C.reset} ${C.dim}(worktree)${C.reset}\n`;
            content += `Branch: ${C.skyBlue}${session.branch || 'unknown'}${C.reset}\n`;
            content += `${C.dim}Path: ${session.path || process.cwd()}${C.reset}\n`;
          }

          if (statusData.otherActive > 0) {
            content += `${C.amber}⚠️ ${statusData.otherActive} other active session(s)${C.reset} - check story claims below\n`;
          }

          content += `${C.teal}${C.bold}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${C.reset}\n\n`;
        }
      } catch {
        // Silently ignore session parse errors
      }
    }
  }

  // INTERACTION MODE (AskUserQuestion)
  const earlyMetadata =
    prefetched?.json?.metadata ?? safeReadJSON('docs/00-meta/agileflow-metadata.json');
  const askUserQuestionConfig = earlyMetadata?.features?.askUserQuestion;

  if (askUserQuestionConfig?.enabled) {
    content += `${C.coral}${C.bold}┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓${C.reset}\n`;
    content += `${C.coral}${C.bold}┃ 🔔 MANDATORY: AskUserQuestion After EVERY Response      ┃${C.reset}\n`;
    content += `${C.coral}${C.bold}┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛${C.reset}\n`;
    content += `${C.bold}After completing ANY task${C.reset} (implementation, fix, etc.):\n`;
    content += `${C.mintGreen}→ ALWAYS${C.reset} call ${C.skyBlue}AskUserQuestion${C.reset} tool to offer next steps\n`;
    content += `${C.coral}→ NEVER${C.reset} end with text like "Done!" or "What's next?"\n\n`;
    content += `${C.dim}Balance: Use at natural pause points. Don't ask permission for routine work.${C.reset}\n\n`;
  }

  // CONTEXT BUDGET WARNING
  const contextUsage = getContextPercentage();
  if (contextUsage && contextUsage.percent >= 50) {
    content += generateContextWarning(contextUsage.percent);
  }

  // PROGRESSIVE DISCLOSURE
  if (activeSections.length > 0) {
    content += `\n${C.cyan}${C.bold}═══ 📖 Progressive Disclosure: Active Sections ═══${C.reset}\n`;
    content += `${C.dim}The following sections are activated based on command parameters.${C.reset}\n`;
    content += `${C.dim}Look for <!-- SECTION: name --> markers in the command file.${C.reset}\n\n`;

    activeSections.forEach(section => {
      content += `  ${C.mintGreen}✓${C.reset} ${C.bold}${section}${C.reset}\n`;
    });

    const sectionDescriptions = {
      'loop-mode': 'Autonomous epic execution (MODE=loop)',
      'multi-session': 'Multi-session coordination detected',
      'visual-e2e': 'Visual screenshot verification (VISUAL=true)',
      delegation: 'Expert spawning patterns (load when spawning)',
      stuck: 'Research prompt guidance (load after 2 failures)',
      'plan-mode': 'Planning workflow details (load when entering plan mode)',
      tools: 'Tool usage guidance (load when needed)',
    };

    content += `\n${C.dim}Section meanings:${C.reset}\n`;
    activeSections.forEach(section => {
      const desc = sectionDescriptions[section] || 'Conditional content';
      content += `  ${C.dim}• ${section}: ${desc}${C.reset}\n`;
    });
    content += '\n';
  }

  // GIT STATUS
  content += `\n${C.skyBlue}${C.bold}═══ Git Status ═══${C.reset}\n`;
  const branch = prefetched?.git?.branch ?? safeExec('git branch --show-current') ?? 'unknown';
  const status = prefetched?.git?.status ?? safeExec('git status --short') ?? '';
  const statusLines = status.split('\n').filter(Boolean);
  const lastCommit =
    prefetched?.git?.commitFull ?? safeExec('git log -1 --format="%h %s"') ?? 'no commits';

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

  // STATUS.JSON
  content += `\n${C.skyBlue}${C.bold}═══ Status.json (Full Content) ═══${C.reset}\n`;
  const statusJson = prefetched?.json?.statusJson ?? safeReadJSON('docs/09-agents/status.json');

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

  // SESSION STATE
  content += `\n${C.skyBlue}${C.bold}═══ Session State ═══${C.reset}\n`;
  const sessionState =
    prefetched?.json?.sessionState ?? safeReadJSON('docs/09-agents/session-state.json');
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
    if (Array.isArray(sessionState.active_commands) && sessionState.active_commands.length > 0) {
      const cmdNames = sessionState.active_commands.map(c => c.name).join(', ');
      content += `Active commands: ${C.skyBlue}${cmdNames}${C.reset}\n`;
    } else if (sessionState.active_command) {
      content += `Active command: ${C.skyBlue}${sessionState.active_command.name}${C.reset}\n`;
    }

    const batchLoop = sessionState.batch_loop;
    if (batchLoop && batchLoop.enabled) {
      content += `\n${C.skyBlue}${C.bold}── Batch Loop Active ──${C.reset}\n`;
      content += `Pattern: ${C.cyan}${batchLoop.pattern}${C.reset}\n`;
      content += `Action: ${C.cyan}${batchLoop.action}${C.reset}\n`;
      content += `Current: ${C.lightYellow}${batchLoop.current_item || 'none'}${C.reset}\n`;
      const summary = batchLoop.summary || {};
      content += `Progress: ${C.lightGreen}${summary.completed || 0}${C.reset}/${summary.total || 0} `;
      content += `(${C.lightYellow}${summary.in_progress || 0}${C.reset} in progress)\n`;
      content += `Iteration: ${batchLoop.iteration || 0}/${batchLoop.max_iterations || 50}\n`;
    }
  } else {
    content += `${C.dim}No session-state.json found${C.reset}\n`;
  }

  // Remaining content would continue here...
  // For brevity, returning the core content
  // The full implementation would include all remaining sections

  // Add remaining sections
  content += generateRemainingContent(prefetched, options);

  return content;
}

/**
 * Generate remaining content sections (internal helper).
 * @param {Object} prefetched - Pre-fetched data
 * @param {Object} options - Options
 * @returns {string} Remaining content
 */
function generateRemainingContent(prefetched, options = {}) {
  let content = '';

  // STORY CLAIMS
  const shouldLoadClaims = prefetched?.sectionsToLoad?.sessionClaims !== false;
  if (shouldLoadClaims) {
    const storyClaimingPath = path.join(__dirname, 'story-claiming.js');
    const altStoryClaimingPath = '.agileflow/scripts/lib/story-claiming.js';

    if (fs.existsSync(storyClaimingPath) || fs.existsSync(altStoryClaimingPath)) {
      try {
        const claimPath = fs.existsSync(storyClaimingPath)
          ? storyClaimingPath
          : altStoryClaimingPath;
        const storyClaiming = require(claimPath);

        const othersResult = storyClaiming.getStoriesClaimedByOthers();
        if (othersResult.ok && othersResult.stories && othersResult.stories.length > 0) {
          content += `\n${C.amber}${C.bold}═══ 🔒 Claimed Stories ═══${C.reset}\n`;
          content += `${C.dim}Stories locked by other sessions - pick a different one${C.reset}\n`;
          othersResult.stories.forEach(story => {
            const sessionDir = story.claimedBy?.path
              ? path.basename(story.claimedBy.path)
              : 'unknown';
            content += `  ${C.coral}🔒${C.reset} ${C.lavender}${story.id}${C.reset} "${story.title}" ${C.dim}→ Session ${story.claimedBy?.session_id || '?'} (${sessionDir})${C.reset}\n`;
          });
          content += '\n';
        }

        const myResult = storyClaiming.getClaimedStoriesForSession();
        if (myResult.ok && myResult.stories && myResult.stories.length > 0) {
          content += `\n${C.mintGreen}${C.bold}═══ ✓ Your Claimed Stories ═══${C.reset}\n`;
          myResult.stories.forEach(story => {
            content += `  ${C.mintGreen}✓${C.reset} ${C.lavender}${story.id}${C.reset} "${story.title}"\n`;
          });
          content += '\n';
        }
      } catch {
        // Story claiming not available
      }
    }
  }

  // VISUAL E2E STATUS
  const metadata =
    prefetched?.json?.metadata ?? safeReadJSON('docs/00-meta/agileflow-metadata.json');
  const visualE2eConfig = metadata?.features?.visual_e2e;
  const playwrightExists =
    fs.existsSync('playwright.config.ts') || fs.existsSync('playwright.config.js');
  const screenshotsExists = fs.existsSync('screenshots');
  const testsE2eExists = fs.existsSync('tests/e2e');

  const visualE2eEnabled = visualE2eConfig?.enabled || (playwrightExists && screenshotsExists);

  if (visualE2eEnabled) {
    content += `\n${C.brand}${C.bold}═══ 📸 VISUAL E2E TESTING: ENABLED ═══${C.reset}\n`;
    content += `${C.dim}${'─'.repeat(60)}${C.reset}\n`;
    content += `${C.mintGreen}✓ Playwright:${C.reset} ${playwrightExists ? 'configured' : 'not found'}\n`;
    content += `${C.mintGreen}✓ Screenshots:${C.reset} ${screenshotsExists ? 'screenshots/' : 'not found'}\n`;
    content += `${C.mintGreen}✓ E2E Tests:${C.reset} ${testsE2eExists ? 'tests/e2e/' : 'not found'}\n\n`;
    content += `${C.bold}FOR UI WORK:${C.reset} Use ${C.skyBlue}VISUAL=true${C.reset} flag with babysit:\n`;
    content += `${C.dim}  /agileflow:babysit EPIC=EP-XXXX MODE=loop VISUAL=true${C.reset}\n\n`;
    content += `${C.dim}${'─'.repeat(60)}${C.reset}\n\n`;
  }

  // DOCS STRUCTURE
  content += `\n${C.skyBlue}${C.bold}═══ Documentation ═══${C.reset}\n`;
  const docsDir = 'docs';
  const docFolders = (prefetched?.dirs?.docs ?? safeLs(docsDir)).filter(f => {
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

  // RESEARCH NOTES
  const shouldLoadResearch = prefetched?.sectionsToLoad?.researchContent !== false;
  content += `\n${C.skyBlue}${C.bold}═══ Research Notes ═══${C.reset}\n`;
  const researchDir = 'docs/10-research';
  const researchFiles =
    prefetched?.researchFiles ??
    safeLs(researchDir)
      .filter(f => f.endsWith('.md') && f !== 'README.md')
      .sort()
      .reverse();
  if (researchFiles.length > 0) {
    content += `${C.dim}───${C.reset} Available Research Notes\n`;
    researchFiles.forEach(file => (content += `  ${C.dim}${file}${C.reset}\n`));

    const mostRecentFile = researchFiles[0];
    const mostRecentPath = path.join(researchDir, mostRecentFile);
    const mostRecentContent =
      prefetched?.mostRecentResearch ?? (shouldLoadResearch ? safeRead(mostRecentPath) : null);

    if (mostRecentContent) {
      content += `\n${C.mintGreen}📄 Most Recent: ${mostRecentFile}${C.reset}\n`;
      content += `${C.dim}${'─'.repeat(60)}${C.reset}\n`;
      content += mostRecentContent + '\n';
      content += `${C.dim}${'─'.repeat(60)}${C.reset}\n`;
    } else if (!shouldLoadResearch) {
      content += `\n${C.dim}📄 Content deferred (lazy loading). Use /agileflow:research to access.${C.reset}\n`;
    }
  } else {
    content += `${C.dim}No research notes${C.reset}\n`;
  }

  // BUS MESSAGES
  content += `\n${C.skyBlue}${C.bold}═══ Recent Agent Messages ═══${C.reset}\n`;
  const busPath = 'docs/09-agents/bus/log.jsonl';
  const busContent = prefetched?.text?.busLog ?? safeRead(busPath);
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

  // KEY FILES
  content += `\n${C.cyan}${C.bold}═══ Key Context Files (Full Content) ═══${C.reset}\n`;

  const prefetchedKeyMap = {
    'CLAUDE.md': 'claudeMd',
    'README.md': 'readmeMd',
    'docs/04-architecture/README.md': 'archReadme',
    'docs/02-practices/README.md': 'practicesReadme',
    'docs/08-project/roadmap.md': 'roadmap',
  };

  const keyFilesToRead = [
    { path: 'CLAUDE.md', label: 'CLAUDE.md (Project Instructions)' },
    { path: 'README.md', label: 'README.md (Project Overview)' },
    { path: 'docs/04-architecture/README.md', label: 'Architecture Index' },
    { path: 'docs/02-practices/README.md', label: 'Practices Index' },
    { path: 'docs/08-project/roadmap.md', label: 'Roadmap' },
  ];

  keyFilesToRead.forEach(({ path: filePath, label }) => {
    const prefetchKey = prefetchedKeyMap[filePath];
    const fileContent = prefetched?.text?.[prefetchKey] ?? safeRead(filePath);
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

  // EPICS FOLDER
  content += `\n${C.cyan}${C.bold}═══ Epic Files ═══${C.reset}\n`;
  const epicFiles =
    prefetched?.dirs?.epics?.filter(f => f.endsWith('.md') && f !== 'README.md') ??
    safeLs('docs/05-epics').filter(f => f.endsWith('.md') && f !== 'README.md');
  if (epicFiles.length > 0) {
    epicFiles.forEach(file => (content += `  ${C.dim}${file}${C.reset}\n`));
  } else {
    content += `${C.dim}No epic files${C.reset}\n`;
  }

  // IDEATION SUGGESTIONS (filtered to exclude implemented)
  if (ideationIndex) {
    try {
      const rootDir = process.cwd();
      const indexResult = ideationIndex.loadIdeationIndex(rootDir);

      if (indexResult.ok && indexResult.data) {
        const index = indexResult.data;
        const summary = ideationIndex.getIndexSummary(index);

        // Only show if there are ideas
        if (summary.totalIdeas > 0) {
          content += `\n${C.cyan}${C.bold}═══ 💡 Ideation Summary ═══${C.reset}\n`;

          // Show status breakdown
          content += `${C.dim}Total ideas: ${summary.totalIdeas} | `;
          content += `Pending: ${summary.byStatus.pending || 0} | `;
          content += `Implemented: ${summary.byStatus.implemented || 0}${C.reset}\n`;

          // Get recurring ideas that are NOT implemented
          const recurringIdeas = ideationIndex.getRecurringIdeas(index, {
            excludeImplemented: true,
          });

          if (recurringIdeas.length > 0) {
            content += `\n${C.amber}🔥 Top Recurring Ideas (Not Yet Implemented)${C.reset}\n`;
            content += `${C.dim}These ideas appeared 2+ times across ideation reports - consider prioritizing them${C.reset}\n\n`;

            recurringIdeas.slice(0, 5).forEach((item, i) => {
              const { idea, occurrenceCount } = item;
              content += `  ${i + 1}. ${C.lavender}[${idea.id}]${C.reset} ${idea.title}\n`;
              content += `     ${C.dim}Category: ${idea.category} | Occurrences: ${occurrenceCount}x | Status: ${idea.status}${C.reset}\n`;
            });

            if (recurringIdeas.length > 5) {
              content += `\n  ${C.dim}... and ${recurringIdeas.length - 5} more recurring ideas${C.reset}\n`;
            }

            content += `\n${C.dim}Run /agileflow:ideate:history STATUS=recurring to see all${C.reset}\n`;
          } else if (summary.byStatus.pending > 0) {
            // Has pending ideas but none recurring
            content += `\n${C.dim}No recurring ideas found. ${summary.byStatus.pending} pending ideas available.${C.reset}\n`;
            content += `${C.dim}Run /agileflow:ideate:history STATUS=pending to see them.${C.reset}\n`;
          } else {
            // All ideas implemented!
            content += `\n${C.mintGreen}✓ All ideation items have been implemented!${C.reset}\n`;
            content += `${C.dim}Run /agileflow:ideate:new to generate fresh improvement ideas.${C.reset}\n`;
          }
        }
      }
    } catch {
      // Silently ignore ideation errors
    }
  }

  // FOOTER
  content += `\n${C.dim}─────────────────────────────────────────${C.reset}\n`;
  content += `${C.dim}Context gathered in single execution. Claude has full context.${C.reset}\n`;

  return content;
}

module.exports = {
  // String utilities
  pad,
  truncate,

  // Warning generation
  generateContextWarning,

  // Main generators
  generateSummary,
  generateFullContent,
};
