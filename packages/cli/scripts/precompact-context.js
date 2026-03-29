#!/usr/bin/env node
/**
 * precompact-context.js - AgileFlow PreCompact Hook
 *
 * Outputs critical context that should survive conversation compaction.
 * Node.js rewrite of precompact-context.sh for testability and performance.
 *
 * Supports two modes:
 * 1. Default: Extract COMPACT_SUMMARY sections from active command files
 * 2. Experimental (fullFileInjection): Inject entire command files
 *
 * Exit codes: Always 0 (fail-open)
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

// Lazy-load compaction tree
let _compactionTree;
function getCompactionTree() {
  if (!_compactionTree) {
    try {
      _compactionTree = require('./lib/compaction-tree');
    } catch {
      _compactionTree = null;
    }
  }
  return _compactionTree;
}

// Lazy-load hook metrics
let _hookMetrics;
function getHookMetrics() {
  if (!_hookMetrics) {
    try {
      _hookMetrics = require('./lib/hook-metrics');
    } catch {
      _hookMetrics = null;
    }
  }
  return _hookMetrics;
}

// Output-only commands that should NOT be preserved during compact
const OUTPUT_ONLY_COMMANDS = [
  'research/ask',
  'research/list',
  'research/view',
  'help',
  'metrics',
  'board',
];

// Allowed command file directory prefixes (security)
const ALLOWED_PREFIXES = [
  'packages/cli/src/core/commands/',
  '.agileflow/commands/',
  '.claude/commands/agileflow/',
];

// Safe path pattern (alphanumeric, /, -, _, .)
const SAFE_PATH_RE = /^[a-zA-Z0-9/_.-]+$/;

/**
 * Find project root by walking up to find package.json or .agileflow/
 * @returns {string}
 */
function findProjectRoot() {
  let dir = process.cwd();
  for (let i = 0; i < 10; i++) {
    if (
      fs.existsSync(path.join(dir, '.agileflow')) ||
      fs.existsSync(path.join(dir, 'package.json'))
    ) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}

/**
 * Get project version from package.json
 * @param {string} root - Project root
 * @returns {string}
 */
function getVersion(root) {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    return pkg.version || 'unknown';
  } catch {
    return 'unknown';
  }
}

/**
 * Check if hierarchical compaction is enabled
 * @param {string} root - Project root
 * @returns {{ enabled: boolean, maxAncestors: number, pruneKeep: number }}
 */
function getHierarchicalCompactionConfig(root) {
  try {
    const meta = JSON.parse(
      fs.readFileSync(path.join(root, 'docs', '00-meta', 'agileflow-metadata.json'), 'utf8')
    );
    const config = meta.features?.hierarchicalCompaction;
    if (config?.enabled) {
      return {
        enabled: true,
        maxAncestors: config.maxAncestors || 5,
        pruneKeep: config.pruneKeep || 20,
      };
    }
  } catch {
    // Fall through
  }
  return { enabled: false, maxAncestors: 5, pruneKeep: 20 };
}

/**
 * Check if fullFileInjection experimental mode is enabled
 * @param {string} root - Project root
 * @returns {boolean}
 */
function getFullFileInjection(root) {
  try {
    const meta = JSON.parse(
      fs.readFileSync(path.join(root, 'docs', '00-meta', 'agileflow-metadata.json'), 'utf8')
    );
    return meta.features?.experimental?.fullFileInjection === true;
  } catch {
    return false;
  }
}

/**
 * Get current git branch
 * @returns {string}
 */
function getBranch() {
  try {
    const result = spawnSync('git', ['branch', '--show-current'], {
      encoding: 'utf8',
      timeout: 5000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return (result.stdout || '').trim() || 'unknown';
  } catch {
    return 'unknown';
  }
}

/**
 * Get in-progress stories as a display string
 * @param {string} root - Project root
 * @returns {string}
 */
function getActiveStories(root) {
  try {
    const statusPath = path.join(root, 'docs', '09-agents', 'status.json');
    if (!fs.existsSync(statusPath)) return 'None in progress';
    const status = JSON.parse(fs.readFileSync(statusPath, 'utf8'));
    const stories = Object.entries(status.stories || {})
      .filter(([, v]) => v.status === 'in_progress')
      .map(([k, v]) => k + ': ' + v.title)
      .join(', ');
    return stories || 'None in progress';
  } catch {
    return 'Unable to read';
  }
}

/**
 * Get count of in-progress stories
 * @param {string} root - Project root
 * @returns {number}
 */
function getWipCount(root) {
  try {
    const statusPath = path.join(root, 'docs', '09-agents', 'status.json');
    if (!fs.existsSync(statusPath)) return 0;
    const status = JSON.parse(fs.readFileSync(statusPath, 'utf8'));
    return Object.values(status.stories || {}).filter(v => v.status === 'in_progress').length;
  } catch {
    return 0;
  }
}

/**
 * Get list of practice doc basenames
 * @param {string} root - Project root
 * @returns {string}
 */
function getPractices(root) {
  try {
    const practicesDir = path.join(root, 'docs', '02-practices');
    if (!fs.existsSync(practicesDir)) return '';
    const files = fs.readdirSync(practicesDir).filter(f => f.endsWith('.md'));
    return files
      .slice(0, 8)
      .map(f => path.basename(f, '.md'))
      .join(',');
  } catch {
    return '';
  }
}

/**
 * Get list of active epics
 * @param {string} root - Project root
 * @returns {string}
 */
function getActiveEpics(root) {
  try {
    const epicsDir = path.join(root, 'docs', '05-epics');
    if (!fs.existsSync(epicsDir)) return '';
    return fs.readdirSync(epicsDir).slice(0, 5).join(',');
  } catch {
    return '';
  }
}

/**
 * Get active (non-output-only) command names from session state
 * @param {string} root - Project root
 * @returns {string[]}
 */
function getActiveCommands(root) {
  try {
    const statePath = path.join(root, 'docs', '09-agents', 'session-state.json');
    if (!fs.existsSync(statePath)) return [];
    const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    return (state.active_commands || [])
      .filter(c => !OUTPUT_ONLY_COMMANDS.includes(c.name) && c.type !== 'output-only')
      .map(c => c.name);
  } catch {
    return [];
  }
}

/**
 * Resolve a command file path from command name, searching 3 directories
 * @param {string} root - Project root
 * @param {string} commandName - Command name (e.g., "babysit", "story/list")
 * @returns {string|null}
 */
function resolveCommandFile(root, commandName) {
  const candidates = [
    path.join('packages', 'cli', 'src', 'core', 'commands', commandName + '.md'),
    path.join('.agileflow', 'commands', commandName + '.md'),
    path.join('.claude', 'commands', 'agileflow', commandName + '.md'),
  ];

  for (const candidate of candidates) {
    const fullPath = path.join(root, candidate);
    if (fs.existsSync(fullPath)) {
      // Security: validate path is safe
      if (!SAFE_PATH_RE.test(candidate) || candidate.includes('..')) {
        continue;
      }
      // Security: validate path is within allowed prefixes
      if (!ALLOWED_PREFIXES.some(p => candidate.startsWith(p))) {
        continue;
      }
      return fullPath;
    }
  }
  return null;
}

/**
 * Extract COMPACT_SUMMARY section from a command file
 * @param {string} filePath - Absolute path to command file
 * @returns {string|null}
 */
function extractCompactSummary(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const match = content.match(
      /<!-- COMPACT_SUMMARY_START[\s\S]*?-->([\s\S]*?)<!-- COMPACT_SUMMARY_END -->/
    );
    return match ? match[1].trim() : null;
  } catch {
    return null;
  }
}

/**
 * Read full file content for experimental full-file injection mode
 * @param {string} filePath - Absolute path to command file
 * @returns {string|null}
 */
function extractFullFile(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
}

/**
 * Build command summary sections for all active commands
 * @param {string} root - Project root
 * @param {string[]} activeCommands - List of command names
 * @param {boolean} fullFileMode - Whether to inject full files
 * @returns {string}
 */
function buildCommandSummaries(root, activeCommands, fullFileMode) {
  const sections = [];

  for (const commandName of activeCommands) {
    if (!commandName) continue;

    const commandFile = resolveCommandFile(root, commandName);
    if (!commandFile) continue;

    let section;
    if (fullFileMode) {
      const content = extractFullFile(commandFile);
      if (content) {
        section =
          `## \u26A0\uFE0F FULL COMMAND FILE (EXPERIMENTAL MODE): /agileflow:${commandName}\n\n` +
          'The following is the COMPLETE command file. Follow ALL instructions below.\n\n' +
          '---\n\n' +
          content;
      }
    } else {
      const summary = extractCompactSummary(commandFile);
      if (summary) {
        section = `## ACTIVE COMMAND: /agileflow:${commandName}\n\n${summary}`;
      }
    }

    if (section) {
      sections.push(section);
    }
  }

  return sections.join('\n\n');
}

/**
 * Extract key conventions from CLAUDE.md
 * @param {string} root - Project root
 * @returns {string}
 */
function getKeyConventions(root) {
  try {
    const claudeMdPath = path.join(root, 'CLAUDE.md');
    if (!fs.existsSync(claudeMdPath)) return '- Read CLAUDE.md for project conventions';
    const content = fs.readFileSync(claudeMdPath, 'utf8');
    const lines = content.split('\n');
    const result = [];
    let capturing = false;
    let captureCount = 0;

    for (const line of lines) {
      if (/^## (Key|Critical|Important)|CRITICAL:/.test(line)) {
        capturing = true;
        captureCount = 0;
      }
      if (capturing) {
        result.push(line);
        captureCount++;
        if (captureCount >= 15) {
          capturing = false;
        }
      }
      if (result.length >= 20) break;
    }

    return result.length > 0 ? result.join('\n') : '- Read CLAUDE.md for project conventions';
  } catch {
    return '- Read CLAUDE.md for project conventions';
  }
}

/**
 * Get recent agent bus activity
 * @param {string} root - Project root
 * @returns {string}
 */
function getRecentAgentActivity(root) {
  try {
    const logPath = path.join(root, 'docs', '09-agents', 'bus', 'log.jsonl');
    if (!fs.existsSync(logPath)) return '';
    const content = fs.readFileSync(logPath, 'utf8');
    const lines = content.trim().split('\n');
    return lines.slice(-3).join('\n');
  } catch {
    return '';
  }
}

/**
 * Get task orchestration state
 * @param {string} root - Project root
 * @returns {string}
 */
function getTaskOrchestrationState(root) {
  try {
    const taskPath = path.join(root, '.agileflow', 'state', 'task-dependencies.json');
    if (!fs.existsSync(taskPath)) return 'No active task orchestration';

    const taskState = JSON.parse(fs.readFileSync(taskPath, 'utf8'));
    const tasks = Object.values(taskState.tasks || {});

    if (tasks.length === 0) return 'No active task orchestration';

    const running = tasks.filter(t => t.state === 'running');
    const queued = tasks.filter(t => t.state === 'queued');
    const blocked = tasks.filter(t => t.state === 'blocked');

    if (running.length === 0 && queued.length === 0 && blocked.length === 0) {
      return 'No active task orchestration';
    }

    const lines = ['### Active Task Graph', ''];

    if (running.length > 0) {
      lines.push(`**Running (${running.length}):**`);
      for (const t of running) {
        lines.push(`- ${t.id}: ${(t.description || 'No description').slice(0, 50)}`);
        if (t.subagent_type) lines.push(`  Agent: ${t.subagent_type}`);
        if (t.metadata?.claude_task_id)
          lines.push(`  Claude ID: ${t.metadata.claude_task_id} (use TaskOutput to check)`);
        if (t.story_id) lines.push(`  Story: ${t.story_id}`);
      }
      lines.push('');
    }

    if (queued.length > 0) {
      lines.push(`**Queued (${queued.length}):**`);
      for (const t of queued.slice(0, 5)) {
        lines.push(`- ${t.id}: ${(t.description || 'No description').slice(0, 50)}`);
        if (t.story_id) lines.push(`  Story: ${t.story_id}`);
      }
      if (queued.length > 5) lines.push(`  ... and ${queued.length - 5} more`);
      lines.push('');
    }

    if (blocked.length > 0) {
      lines.push(`**Blocked (${blocked.length}):**`);
      for (const t of blocked.slice(0, 3)) {
        lines.push(`- ${t.id} (blocked by: ${(t.blockedBy || []).join(', ')})`);
      }
      lines.push('');
    }

    const withDeps = tasks.filter(t => (t.blockedBy || []).length > 0);
    if (withDeps.length > 0) {
      lines.push('**Dependency Chain:**');
      lines.push('Task state file: .agileflow/state/task-dependencies.json');
      lines.push('Use TaskOutput to collect results from running tasks.');
    }

    return lines.join('\n');
  } catch {
    return 'No active task orchestration';
  }
}

/**
 * Set last_precompact_at timestamp in session-state.json
 * @param {string} root - Project root
 */
function setLastPrecompactAt(root) {
  try {
    const statePath = path.join(root, 'docs', '09-agents', 'session-state.json');
    if (!fs.existsSync(statePath)) return;
    const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    state.last_precompact_at = new Date().toISOString();
    fs.writeFileSync(statePath, JSON.stringify(state, null, 2) + '\n');
  } catch {
    // Fail silently
  }
}

/**
 * Build the complete PreCompact output
 * @param {object} data - Collected context data
 * @returns {string}
 */
function buildOutput(data) {
  const lines = [
    'AGILEFLOW PROJECT CONTEXT (preserve during compact):',
    '',
    '## Project Status',
    `- Project: AgileFlow v${data.version}`,
    `- Branch: ${data.branch}`,
    `- Active Stories: ${data.activeStories}`,
    `- WIP Count: ${data.wipCount}`,
    '',
    '## Key Files to Check After Compact',
    '- CLAUDE.md - Project system prompt with conventions',
    '- README.md - Project overview and setup',
    '- docs/09-agents/status.json - Story statuses and assignments',
    `- docs/02-practices/ - Codebase practices (${data.practices || 'check folder'})`,
    '',
    '## Active Epics',
    data.epics || 'Check docs/05-epics/ for epic files',
    '',
    '## Key Conventions (from CLAUDE.md)',
    data.conventions,
    '',
    '## Recent Agent Activity',
    data.recentActivity,
  ];

  // Active command summaries
  if (data.commandSummaries) {
    lines.push('', data.commandSummaries);
  }

  // Task orchestration state
  lines.push('', '## Task Orchestration State', data.taskState);

  // Compaction history (telescoping)
  if (data.compactionHistory) {
    lines.push('', data.compactionHistory);
  }

  // Post-compact actions
  lines.push(
    '',
    '## Post-Compact Actions',
    '1. Re-read CLAUDE.md if unsure about conventions',
    '2. Check status.json for current story state',
    '3. Review docs/02-practices/ for implementation patterns',
    '4. Check git log for recent changes',
    '5. If tasks were running, use TaskOutput to check results'
  );

  return lines.join('\n');
}

/**
 * Main entry point
 */
function main() {
  const metrics = getHookMetrics();
  const timer = metrics ? metrics.startHookTimer('PreCompact', 'context') : null;

  try {
    const root = findProjectRoot();
    const version = getVersion(root);
    const fullFileMode = getFullFileInjection(root);
    const branch = getBranch();
    const activeStories = getActiveStories(root);
    const wipCount = getWipCount(root);
    const practices = getPractices(root);
    const epics = getActiveEpics(root);
    const activeCommands = getActiveCommands(root);
    const commandSummaries = buildCommandSummaries(root, activeCommands, fullFileMode);
    const conventions = getKeyConventions(root);
    const recentActivity = getRecentAgentActivity(root);
    const taskState = getTaskOrchestrationState(root);

    // Hierarchical compaction: create node and get telescoping history
    let compactionHistory = '';
    const hcConfig = getHierarchicalCompactionConfig(root);
    if (hcConfig.enabled) {
      try {
        const ct = getCompactionTree();
        if (ct) {
          // Get current session ID
          let sessionId = null;
          try {
            const statePath = path.join(root, 'docs', '09-agents', 'session-state.json');
            if (fs.existsSync(statePath)) {
              const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
              sessionId = state.current_session?.id || null;
            }
          } catch {
            // No session ID available
          }

          // Get the last commit message for summary context
          let lastCommit = '';
          try {
            const result = spawnSync('git', ['log', '-1', '--format=%s'], {
              encoding: 'utf8',
              timeout: 3000,
              stdio: ['pipe', 'pipe', 'pipe'],
            });
            lastCommit = (result.stdout || '').trim();
          } catch {
            // No git
          }

          // Build summary
          const storyList = activeStories === 'None in progress' ? '' : activeStories;
          const summaryParts = [];
          if (storyList) summaryParts.push(storyList);
          if (lastCommit) summaryParts.push(`Last commit: ${lastCommit}`);
          const summary = summaryParts.join('. ') || 'No active work';

          // Create compaction node
          const node = ct.createNode(
            root,
            {
              summary,
              active_stories: storyList
                ? storyList.split(', ').map(s => s.split(':')[0].trim())
                : [],
              branch,
              active_commands: activeCommands,
              session_id: sessionId,
              metadata: { version, wip_count: wipCount },
            },
            { pruneKeep: hcConfig.pruneKeep }
          );

          // Get ancestors for telescoping
          const ancestors = ct.getAncestors(root, node.id, hcConfig.maxAncestors);
          if (ancestors.length > 0) {
            compactionHistory = ct.formatTelescopingOutput(ancestors, {
              maxChars: 2000,
            });
          }
        }
      } catch {
        // Fail silently - compaction history is not critical
      }
    }

    const output = buildOutput({
      version,
      branch,
      activeStories,
      wipCount,
      practices,
      epics,
      commandSummaries,
      conventions,
      recentActivity,
      taskState,
      compactionHistory,
    });

    process.stdout.write(output + '\n');

    // Mark that PreCompact just ran
    setLastPrecompactAt(root);

    // Record metrics
    if (timer && metrics) {
      metrics.recordHookMetrics(timer, 'success');
    }
  } catch (e) {
    // Fail open - output minimal context
    process.stdout.write('AGILEFLOW PROJECT CONTEXT (preserve during compact):\n');
    process.stdout.write('PreCompact error - re-read CLAUDE.md and status.json\n');

    if (timer && metrics) {
      metrics.recordHookMetrics(timer, 'error', e.message);
    }
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}

module.exports = {
  findProjectRoot,
  getVersion,
  getFullFileInjection,
  getHierarchicalCompactionConfig,
  getBranch,
  getActiveStories,
  getWipCount,
  getPractices,
  getActiveEpics,
  getActiveCommands,
  resolveCommandFile,
  extractCompactSummary,
  extractFullFile,
  buildCommandSummaries,
  getKeyConventions,
  getRecentAgentActivity,
  getTaskOrchestrationState,
  setLastPrecompactAt,
  buildOutput,
  main,
  // Constants for testing
  OUTPUT_ONLY_COMMANDS,
  ALLOWED_PREFIXES,
};
