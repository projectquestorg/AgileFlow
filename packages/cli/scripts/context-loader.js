#!/usr/bin/env node
/**
 * context-loader.js - Auto-generate session context from authoritative sources
 *
 * This hook runs during SessionStart to provide project context that Claude
 * should be aware of. Context is DYNAMICALLY GENERATED from sources that
 * are already being updated (status.json, git, epics) - no manual maintenance.
 *
 * Context Sources (in order):
 *   1. status.json - Current WIP stories, blocked items
 *   2. Git - Current branch, recent commits
 *   3. Active epics - From docs/05-epics/
 *   4. CONTEXT.md (optional) - Static rules/constraints that rarely change
 *
 * Exit codes:
 *   0 - Success
 *   1 - Error (unexpected failure)
 *
 * Usage: Add to SessionStart hooks in .claude/settings.json
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

// Optional: hook metrics integration
let hookMetrics;
try {
  hookMetrics = require('./lib/hook-metrics.js');
} catch (e) {
  // Hook metrics not available
}

// Feature flags (Agent Teams detection)
let featureFlags;
try {
  featureFlags = require('../lib/feature-flags');
} catch (e) {
  // Feature flags not available
}

// Colors for output
const c = {
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
  yellow: '\x1b[33m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  reset: '\x1b[0m',
};

/**
 * Find project root by looking for .agileflow or .git directory
 */
function findProjectRoot() {
  let dir = process.cwd();
  while (dir !== '/') {
    if (fs.existsSync(path.join(dir, '.agileflow'))) {
      return dir;
    }
    if (fs.existsSync(path.join(dir, '.git'))) {
      return dir;
    }
    dir = path.dirname(dir);
  }
  return process.cwd();
}

/**
 * Get current stories from status.json
 */
function getStoriesContext(projectRoot) {
  const statusPath = path.join(projectRoot, 'docs', '09-agents', 'status.json');
  if (!fs.existsSync(statusPath)) return null;

  try {
    const status = JSON.parse(fs.readFileSync(statusPath, 'utf8'));
    const stories = status.stories || {};

    const inProgress = [];
    const blocked = [];
    const ready = [];

    for (const [id, story] of Object.entries(stories)) {
      const item = { id, title: story.title, epic: story.epic };
      if (story.status === 'in_progress') inProgress.push(item);
      else if (story.status === 'blocked') blocked.push(item);
      else if (story.status === 'ready') ready.push(item);
    }

    return { inProgress, blocked, ready };
  } catch (e) {
    return null;
  }
}

/**
 * Get git context (branch, recent commits)
 */
function getGitContext(projectRoot) {
  try {
    const branch = execFileSync('git', ['branch', '--show-current'], {
      cwd: projectRoot,
      encoding: 'utf8',
      timeout: 5000,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();

    const recentCommits = execFileSync('git', ['log', '-3', '--oneline'], {
      cwd: projectRoot,
      encoding: 'utf8',
      timeout: 5000,
      stdio: ['pipe', 'pipe', 'pipe'],
    })
      .trim()
      .split('\n')
      .filter(Boolean);

    // Check for uncommitted changes
    const status = execFileSync('git', ['status', '--porcelain'], {
      cwd: projectRoot,
      encoding: 'utf8',
      timeout: 5000,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();

    const hasUncommitted = status.length > 0;
    const uncommittedCount = hasUncommitted ? status.split('\n').length : 0;

    return { branch, recentCommits, hasUncommitted, uncommittedCount };
  } catch (e) {
    return null;
  }
}

/**
 * Get active epics from docs/05-epics/
 */
function getEpicsContext(projectRoot) {
  const epicsDir = path.join(projectRoot, 'docs', '05-epics');
  if (!fs.existsSync(epicsDir)) return null;

  try {
    const files = fs.readdirSync(epicsDir).filter(f => f.endsWith('.md'));
    const epics = [];

    for (const file of files.slice(0, 5)) {
      // Limit to 5 epics
      const content = fs.readFileSync(path.join(epicsDir, file), 'utf8');
      const titleMatch = content.match(/^#\s+(.+)/m);
      const statusMatch = content.match(/status:\s*(\w+)/i);

      if (titleMatch) {
        epics.push({
          id: file.replace('.md', ''),
          title: titleMatch[1].trim(),
          status: statusMatch ? statusMatch[1] : 'unknown',
        });
      }
    }

    return epics.filter(e => e.status !== 'completed');
  } catch (e) {
    return null;
  }
}

/**
 * Load static rules from CONTEXT.md (optional - for things that rarely change)
 */
function getStaticRules(projectRoot) {
  const contextFile = path.join(projectRoot, 'CONTEXT.md');
  if (!fs.existsSync(contextFile)) return null;

  try {
    const content = fs.readFileSync(contextFile, 'utf8');

    // Extract only "Key Constraints" or "Rules" sections - these are static
    const rulesMatch = content.match(
      /##\s*(Key Constraints|Rules|Constraints|Guidelines)([\s\S]*?)(?=##|$)/i
    );
    if (rulesMatch) {
      return rulesMatch[2].trim();
    }

    // If file is small (<2KB), include it all as static rules
    if (content.length < 2048) {
      return content.trim();
    }

    return null;
  } catch (e) {
    return null;
  }
}

/**
 * Generate and output context
 */
function generateContext() {
  const timer = hookMetrics ? hookMetrics.startHookTimer('SessionStart', 'context_loader') : null;
  const projectRoot = findProjectRoot();

  // Gather context from all sources
  const stories = getStoriesContext(projectRoot);
  const git = getGitContext(projectRoot);
  const epics = getEpicsContext(projectRoot);
  const staticRules = getStaticRules(projectRoot);

  // Check if we have any meaningful context to output
  const hasStories = stories && (stories.inProgress.length > 0 || stories.blocked.length > 0);
  const hasGit = git && git.branch;
  const hasEpics = epics && epics.length > 0;
  const hasRules = staticRules && staticRules.length > 0;

  if (!hasStories && !hasGit && !hasEpics && !hasRules) {
    // No context to output
    if (timer && hookMetrics) {
      hookMetrics.recordHookMetrics(timer, 'success', null, { rootDir: projectRoot });
    }
    process.exit(0);
  }

  // Output context header
  console.log('');
  console.log(`${c.cyan}━━━ Session Context (auto-generated) ━━━${c.reset}`);

  // Current Work (from status.json)
  if (hasStories) {
    console.log('');
    console.log(`${c.yellow}## Current Work${c.reset}`);

    if (stories.inProgress.length > 0) {
      console.log(`${c.green}In Progress:${c.reset}`);
      for (const s of stories.inProgress.slice(0, 3)) {
        const epic = s.epic ? ` (${s.epic})` : '';
        console.log(`  - ${s.id}: ${s.title}${epic}`);
      }
      if (stories.inProgress.length > 3) {
        console.log(`  ${c.dim}... and ${stories.inProgress.length - 3} more${c.reset}`);
      }
    }

    if (stories.blocked.length > 0) {
      console.log(`${c.red}Blocked:${c.reset}`);
      for (const s of stories.blocked.slice(0, 2)) {
        console.log(`  - ${s.id}: ${s.title}`);
      }
    }
  }

  // Git context
  if (hasGit) {
    console.log('');
    console.log(`${c.yellow}## Git Status${c.reset}`);
    console.log(`Branch: ${c.green}${git.branch}${c.reset}`);

    if (git.hasUncommitted) {
      console.log(`${c.yellow}Uncommitted changes: ${git.uncommittedCount} file(s)${c.reset}`);
    }

    if (git.recentCommits.length > 0) {
      console.log(`${c.dim}Recent commits:${c.reset}`);
      for (const commit of git.recentCommits) {
        console.log(`  ${c.dim}${commit}${c.reset}`);
      }
    }
  }

  // Active epics
  if (hasEpics) {
    console.log('');
    console.log(`${c.yellow}## Active Epics${c.reset}`);
    for (const epic of epics) {
      console.log(`  - ${epic.id}: ${epic.title}`);
    }
  }

  // Agent Teams capability
  if (featureFlags) {
    try {
      const teamsInfo = featureFlags.getAgentTeamsDisplayInfo({ rootDir: projectRoot });
      if (teamsInfo.status === 'enabled') {
        console.log('');
        console.log(`${c.yellow}## Agent Teams${c.reset}`);
        console.log(`Mode: ${c.green}native${c.reset} (Claude Code Agent Teams enabled)`);
        console.log(`${c.dim}Use /agileflow:team:start <template> to create a team${c.reset}`);
      }
    } catch (e) {
      // Silently ignore
    }
  }

  // Static rules from CONTEXT.md
  if (hasRules) {
    console.log('');
    console.log(`${c.yellow}## Project Rules${c.reset}`);
    console.log(staticRules);
  }

  // Footer
  console.log('');
  console.log(`${c.dim}━━━ End Context ━━━${c.reset}`);
  console.log('');

  // Record metrics
  if (timer && hookMetrics) {
    hookMetrics.recordHookMetrics(timer, 'success', null, { rootDir: projectRoot });
  }

  process.exit(0);
}

// Run
generateContext();
