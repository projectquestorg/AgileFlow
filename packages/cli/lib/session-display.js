/**
 * session-display.js - Session visualization and health checks
 *
 * Provides Kanban board rendering, table formatting, and session health analysis.
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const { c } = require('./colors');
const { getProjectRoot } = require('./paths');
const {
  SESSION_PHASES,
  getSessionPhase,
  getSessionPhasesAsync,
} = require('./git-operations');

const ROOT = getProjectRoot();

/**
 * Get detailed file information for a session's changes
 * @param {string} sessionPath - Path to session worktree
 * @param {string[]} changes - Array of git status lines
 * @returns {Object[]} Array of file details with analysis
 */
function getFileDetails(sessionPath, changes) {
  return changes.map(change => {
    const status = change.substring(0, 2).trim();
    const file = change.substring(3);

    const detail = { status, file, trivial: false, existsInMain: false, diffLines: 0 };

    // For modified files, get diff stats
    if (status === 'M') {
      try {
        const diffStat = spawnSync('git', ['diff', '--numstat', file], {
          cwd: sessionPath,
          encoding: 'utf8',
          timeout: 3000,
        });
        if (diffStat.stdout) {
          const parts = diffStat.stdout.trim().split('\t');
          const added = parseInt(parts[0], 10) || 0;
          const removed = parseInt(parts[1], 10) || 0;
          detail.diffLines = added + removed;
          // Trivial if only 1-2 lines changed (likely whitespace)
          detail.trivial = detail.diffLines <= 2;
        }
      } catch (e) {
        // Can't get diff, assume not trivial
      }
    }

    // For untracked files, check if exists in main
    if (status === '??') {
      detail.existsInMain = fs.existsSync(path.join(ROOT, file));
      // Trivial if it's a duplicate
      detail.trivial = detail.existsInMain;
    }

    // Config/cache files are trivial
    if (file.includes('.claude/') || file.includes('.agileflow/cache')) {
      detail.trivial = true;
    }

    return detail;
  });
}

/**
 * Get health status for all sessions
 * Detects: stale sessions, uncommitted changes, orphaned entries
 * @param {Object} options - { staleDays: 7, detailed: false }
 * @param {Function} loadRegistry - Registry loader function
 * @returns {Object} Health report
 */
function getSessionsHealth(options = {}, loadRegistry) {
  const { staleDays = 7, detailed = false } = options;
  const registry = loadRegistry();
  const now = Date.now();
  const staleThreshold = staleDays * 24 * 60 * 60 * 1000;

  const health = {
    stale: [], // Sessions with no activity > staleDays
    uncommitted: [], // Sessions with uncommitted git changes
    orphanedRegistry: [], // Registry entries where path doesn't exist
    orphanedWorktrees: [], // Worktrees not in registry
    healthy: 0,
  };

  // Check each registered session
  for (const [id, session] of Object.entries(registry.sessions)) {
    if (session.is_main) continue; // Skip main session

    const age = now - new Date(session.last_active).getTime();
    const pathExists = fs.existsSync(session.path);

    // Check for orphaned registry entry (path missing)
    if (!pathExists) {
      health.orphanedRegistry.push({ id, ...session, reason: 'path_missing' });
      continue;
    }

    // Check for stale session
    if (age > staleThreshold) {
      health.stale.push({
        id,
        ...session,
        ageDays: Math.floor(age / (24 * 60 * 60 * 1000)),
      });
    }

    // Check for uncommitted changes
    try {
      const result = spawnSync('git', ['status', '--porcelain'], {
        cwd: session.path,
        encoding: 'utf8',
        timeout: 5000,
      });
      if (result.stdout && result.stdout.trim()) {
        const changes = result.stdout.split('\n').filter(line => line.length > 0);
        const sessionData = {
          id,
          ...session,
          changeCount: changes.length,
          changes: detailed ? changes : changes.slice(0, 5),
        };

        // Add detailed file analysis if requested
        if (detailed) {
          sessionData.fileDetails = getFileDetails(session.path, changes);
          sessionData.allTrivial = sessionData.fileDetails.every(f => f.trivial);
        }

        health.uncommitted.push(sessionData);
      } else {
        health.healthy++;
      }
    } catch (e) {
      // Can't check, skip
    }
  }

  // Check for orphaned worktrees (directories not in registry)
  try {
    const worktreeList = spawnSync('git', ['worktree', 'list', '--porcelain'], {
      encoding: 'utf8',
    });
    if (worktreeList.stdout) {
      const worktrees = worktreeList.stdout
        .split('\n')
        .filter(line => line.startsWith('worktree '))
        .map(line => line.replace('worktree ', ''));

      const mainPath = ROOT;
      for (const wtPath of worktrees) {
        const inRegistry = Object.values(registry.sessions).some(s => s.path === wtPath);
        if (!inRegistry && wtPath !== mainPath) {
          // Check if it's an AgileFlow worktree (has .agileflow folder)
          if (fs.existsSync(path.join(wtPath, '.agileflow'))) {
            health.orphanedWorktrees.push({ path: wtPath });
          }
        }
      }
    }
  } catch (e) {
    // Can't list worktrees, skip
  }

  return health;
}

/**
 * Format Kanban board from sessions grouped by phase
 * @param {Object} byPhase - Sessions grouped by phase
 * @returns {string} Formatted Kanban board
 */
function formatKanbanBoard(byPhase) {
  const lines = [];
  const colWidth = 14;
  const separator = '  ';
  const phaseOrder = [SESSION_PHASES.TODO, SESSION_PHASES.CODING, SESSION_PHASES.REVIEW, SESSION_PHASES.MERGED];

  // Header
  lines.push(`${c.cyan}Sessions (Kanban View):${c.reset}`);
  lines.push('');

  // Column headers
  const headers = [
    `${c.dim}TO DO${c.reset}`,
    `${c.yellow}CODING${c.reset}`,
    `${c.blue}REVIEW${c.reset}`,
    `${c.green}MERGED${c.reset}`,
  ];
  lines.push(headers.map(h => h.padEnd(colWidth + 10)).join(separator));

  // Top borders
  const topBorder = `┌${'─'.repeat(colWidth)}┐`;
  lines.push([topBorder, topBorder, topBorder, topBorder].join(separator));

  // Find max rows needed
  const maxRows = Math.max(1, ...phaseOrder.map(p => byPhase[p].length));

  // Render rows
  for (let i = 0; i < maxRows; i++) {
    // Session info row
    const cells = phaseOrder.map(phase => {
      const session = byPhase[phase][i];
      if (!session) return `│${' '.repeat(colWidth)}│`;

      const id = `[${session.id}]`;
      const name = session.nickname || session.branch || '';
      const truncName = name.length > colWidth - 5 ? name.slice(0, colWidth - 8) + '...' : name;
      const content = `${id} ${truncName}`.slice(0, colWidth);
      return `│${content.padEnd(colWidth)}│`;
    });
    lines.push(cells.join(separator));

    // Story row
    const storyCells = phaseOrder.map(phase => {
      const session = byPhase[phase][i];
      if (!session) return `│${' '.repeat(colWidth)}│`;

      const story = session.story || '-';
      const storyTrunc = story.length > colWidth - 2 ? story.slice(0, colWidth - 5) + '...' : story;
      return `│${c.dim}${storyTrunc.padEnd(colWidth)}${c.reset}│`;
    });
    lines.push(storyCells.join(separator));
  }

  // Bottom borders
  const bottomBorder = `└${'─'.repeat(colWidth)}┘`;
  lines.push([bottomBorder, bottomBorder, bottomBorder, bottomBorder].join(separator));

  // Summary
  lines.push('');
  const summary = [
    `${c.dim}To Do: ${byPhase[SESSION_PHASES.TODO].length}${c.reset}`,
    `${c.yellow}Coding: ${byPhase[SESSION_PHASES.CODING].length}${c.reset}`,
    `${c.blue}Review: ${byPhase[SESSION_PHASES.REVIEW].length}${c.reset}`,
    `${c.green}Merged: ${byPhase[SESSION_PHASES.MERGED].length}${c.reset}`,
  ].join(' │ ');
  lines.push(summary);

  return lines.join('\n');
}

/**
 * Group sessions by phase (helper for kanban rendering)
 * @param {Object[]} sessionsWithPhases - Sessions with phase property
 * @returns {Object} Sessions grouped by phase
 */
function groupSessionsByPhase(sessionsWithPhases) {
  const byPhase = {
    [SESSION_PHASES.TODO]: [],
    [SESSION_PHASES.CODING]: [],
    [SESSION_PHASES.REVIEW]: [],
    [SESSION_PHASES.MERGED]: [],
  };
  for (const session of sessionsWithPhases) {
    byPhase[session.phase].push(session);
  }
  return byPhase;
}

/**
 * Render Kanban board synchronously
 * @param {Object[]} sessions - Sessions array
 * @returns {string} Formatted Kanban board
 */
function renderKanbanBoard(sessions) {
  // Get phases synchronously and group
  const sessionsWithPhases = sessions.map(session => ({
    ...session,
    phase: getSessionPhase(session),
  }));
  return formatKanbanBoard(groupSessionsByPhase(sessionsWithPhases));
}

/**
 * Render Kanban board asynchronously (parallel git ops)
 * @param {Object[]} sessions - Sessions array
 * @returns {Promise<string>} Formatted Kanban board
 */
async function renderKanbanBoardAsync(sessions) {
  // Get all phases in parallel using Promise.all
  const sessionsWithPhases = await getSessionPhasesAsync(sessions);
  return formatKanbanBoard(groupSessionsByPhase(sessionsWithPhases));
}

/**
 * Format sessions for display as table
 * @param {Object[]} sessions - Sessions array
 * @returns {string} Formatted table
 */
function formatSessionsTable(sessions) {
  const lines = [];

  lines.push(`${c.cyan}Active Sessions:${c.reset}`);
  lines.push(`${'─'.repeat(70)}`);

  for (const session of sessions) {
    const status = session.active ? `${c.green}●${c.reset}` : `${c.dim}○${c.reset}`;
    const current = session.current ? ` ${c.yellow}(current)${c.reset}` : '';
    const name = session.nickname ? `"${session.nickname}"` : session.branch;
    const story = session.story ? `${c.blue}${session.story}${c.reset}` : `${c.dim}-${c.reset}`;

    lines.push(`  ${status} [${c.bold}${session.id}${c.reset}] ${name}${current}`);
    lines.push(`      ${c.dim}Story:${c.reset} ${story} ${c.dim}│ Path:${c.reset} ${session.path}`);
  }

  lines.push(`${'─'.repeat(70)}`);

  return lines.join('\n');
}

module.exports = {
  // File details
  getFileDetails,
  // Health checks
  getSessionsHealth,
  // Kanban board
  formatKanbanBoard,
  groupSessionsByPhase,
  renderKanbanBoard,
  renderKanbanBoardAsync,
  // Table display
  formatSessionsTable,
};
