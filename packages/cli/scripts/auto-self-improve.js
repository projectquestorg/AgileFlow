#!/usr/bin/env node

/**
 * auto-self-improve.js - Automatic Agent Expertise Updates
 *
 * This script runs as a Stop hook and automatically updates agent
 * expertise files based on work performed during the session.
 *
 * How it works:
 * 1. Reads session-state.json to find which agent was active
 * 2. Analyzes git diff to see what changed
 * 3. Detects patterns, new files, significant changes
 * 4. Generates a learning entry
 * 5. Appends to the agent's expertise.yaml
 *
 * Usage (as Stop hook):
 *   node scripts/auto-self-improve.js
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Shared utilities
const { c } = require('../lib/colors');
const { getProjectRoot } = require('../lib/paths');
const { safeReadJSON, safeReadFile, safeWriteFile } = require('../lib/errors');

// Agents that have expertise files
const AGENTS_WITH_EXPERTISE = [
  'accessibility',
  'adr-writer',
  'analytics',
  'api',
  'ci',
  'compliance',
  'database',
  'datamigration',
  'design',
  'devops',
  'documentation',
  'epic-planner',
  'integrations',
  'mentor',
  'mobile',
  'monitoring',
  'performance',
  'product',
  'qa',
  'readme-updater',
  'refactor',
  'research',
  'security',
  'testing',
  'ui',
];

// File patterns that suggest domain expertise
const DOMAIN_PATTERNS = {
  database: [/schema/, /migration/, /\.sql$/, /prisma/, /drizzle/, /sequelize/],
  api: [/\/api\//, /controller/, /route/, /endpoint/, /graphql/],
  ui: [/component/, /\.tsx$/, /\.jsx$/, /styles/, /\.css$/, /\.scss$/],
  testing: [/\.test\./, /\.spec\./, /__tests__/, /jest/, /vitest/],
  security: [/auth/, /password/, /token/, /jwt/, /oauth/, /permission/],
  ci: [/\.github\/workflows/, /\.gitlab-ci/, /dockerfile/i, /docker-compose/],
  documentation: [/\.md$/, /readme/i, /docs\//, /jsdoc/],
  performance: [/cache/, /optimize/, /performance/, /benchmark/],
  devops: [/deploy/, /kubernetes/, /k8s/, /terraform/, /ansible/],
};

// Read session state
function getSessionState(rootDir) {
  const statePath = path.join(rootDir, 'docs/09-agents/session-state.json');
  const result = safeReadJSON(statePath, { defaultValue: {} });
  return result.ok ? result.data : {};
}

// Get git diff summary
function getGitDiff(rootDir) {
  try {
    // Get list of changed files (staged and unstaged)
    const diffFiles = execSync('git diff --name-only HEAD 2>/dev/null || git diff --name-only', {
      cwd: rootDir,
      encoding: 'utf8',
    })
      .trim()
      .split('\n')
      .filter(Boolean);

    // Get staged files
    const stagedFiles = execSync('git diff --cached --name-only 2>/dev/null', {
      cwd: rootDir,
      encoding: 'utf8',
    })
      .trim()
      .split('\n')
      .filter(Boolean);

    // Get untracked files
    const untrackedFiles = execSync('git ls-files --others --exclude-standard 2>/dev/null', {
      cwd: rootDir,
      encoding: 'utf8',
    })
      .trim()
      .split('\n')
      .filter(Boolean);

    // Combine all
    const allFiles = [...new Set([...diffFiles, ...stagedFiles, ...untrackedFiles])];

    // Get diff stats
    let additions = 0;
    let deletions = 0;
    try {
      const stats = execSync('git diff --shortstat HEAD 2>/dev/null || echo ""', {
        cwd: rootDir,
        encoding: 'utf8',
      });
      const addMatch = stats.match(/(\d+) insertion/);
      const delMatch = stats.match(/(\d+) deletion/);
      if (addMatch) additions = parseInt(addMatch[1]);
      if (delMatch) deletions = parseInt(delMatch[1]);
    } catch (e) {}

    return {
      files: allFiles,
      additions,
      deletions,
      hasChanges: allFiles.length > 0,
    };
  } catch (e) {
    return { files: [], additions: 0, deletions: 0, hasChanges: false };
  }
}

// Detect which domain the changes relate to
function detectDomain(files) {
  const domainScores = {};

  for (const file of files) {
    for (const [domain, patterns] of Object.entries(DOMAIN_PATTERNS)) {
      for (const pattern of patterns) {
        if (pattern.test(file.toLowerCase())) {
          domainScores[domain] = (domainScores[domain] || 0) + 1;
        }
      }
    }
  }

  // Return domain with highest score
  const sorted = Object.entries(domainScores).sort((a, b) => b[1] - a[1]);
  return sorted.length > 0 ? sorted[0][0] : null;
}

// Generate learning summary from changes
function generateLearningSummary(diff, activeAgent) {
  const { files, additions, deletions } = diff;

  if (files.length === 0) return null;

  // Categorize files
  const newFiles = files.filter(f => !f.includes('/'));
  const testFiles = files.filter(f => /\.(test|spec)\.[jt]sx?$/.test(f));
  const configFiles = files.filter(f => /\.(json|yaml|yml|toml|config\.)/.test(f));
  const codeFiles = files.filter(f => /\.[jt]sx?$/.test(f) && !testFiles.includes(f));

  // Build summary
  const parts = [];

  if (codeFiles.length > 0) {
    const dirs = [...new Set(codeFiles.map(f => path.dirname(f)))];
    parts.push(`Modified ${codeFiles.length} code file(s) in: ${dirs.slice(0, 3).join(', ')}`);
  }

  if (testFiles.length > 0) {
    parts.push(`Updated ${testFiles.length} test file(s)`);
  }

  if (configFiles.length > 0) {
    parts.push(`Changed config: ${configFiles.slice(0, 2).join(', ')}`);
  }

  if (additions > 50 || deletions > 50) {
    parts.push(`Significant changes: +${additions}/-${deletions} lines`);
  }

  return parts.length > 0 ? parts.join('. ') : null;
}

// Find expertise file for agent
function getExpertisePath(rootDir, agent) {
  // Try installed location first
  const installedPath = path.join(rootDir, '.agileflow', 'experts', agent, 'expertise.yaml');
  if (fs.existsSync(installedPath)) return installedPath;

  // Try source location
  const sourcePath = path.join(
    rootDir,
    'packages',
    'cli',
    'src',
    'core',
    'experts',
    agent,
    'expertise.yaml'
  );
  if (fs.existsSync(sourcePath)) return sourcePath;

  return null;
}

// Append learning to expertise file
function appendLearning(expertisePath, learning) {
  const readResult = safeReadFile(expertisePath);
  if (!readResult.ok) return false;

  let content = readResult.data;

  // Find the learnings section
  const learningsMatch = content.match(/^learnings:\s*$/m);

  if (!learningsMatch) {
    // No learnings section, add it at the end
    content += `\n\nlearnings:\n${learning}`;
  } else {
    // Find where to insert (after "learnings:" line)
    const insertPos = learningsMatch.index + learningsMatch[0].length;
    content = content.slice(0, insertPos) + '\n' + learning + content.slice(insertPos);
  }

  const writeResult = safeWriteFile(expertisePath, content);
  return writeResult.ok;
}

// Format learning as YAML
function formatLearning(summary, files, detectedDomain) {
  const date = new Date().toISOString().split('T')[0];
  const topFiles = files
    .slice(0, 5)
    .map(f => `      - ${f}`)
    .join('\n');

  return `  - date: "${date}"
    auto_generated: true
    context: "Session work - ${detectedDomain || 'general'} domain"
    insight: "${summary.replace(/"/g, '\\"')}"
    files_touched:
${topFiles}`;
}

// Main function
function main() {
  const rootDir = getProjectRoot();
  const state = getSessionState(rootDir);
  const diff = getGitDiff(rootDir);

  // Check if there were any changes
  if (!diff.hasChanges) {
    return; // Silent exit - no changes to learn from
  }

  // Detect which agent was active
  let activeAgent = null;

  // Check session state for active command
  if (state.active_command?.name) {
    const name = state.active_command.name.replace('agileflow-', '');
    if (AGENTS_WITH_EXPERTISE.includes(name)) {
      activeAgent = name;
    }
  }

  // If no agent from session, detect from file changes
  if (!activeAgent) {
    activeAgent = detectDomain(diff.files);
  }

  // If still no agent, skip
  if (!activeAgent || !AGENTS_WITH_EXPERTISE.includes(activeAgent)) {
    return; // Silent exit - can't determine which agent to update
  }

  // Find expertise file
  const expertisePath = getExpertisePath(rootDir, activeAgent);
  if (!expertisePath) {
    return; // Silent exit - no expertise file found
  }

  // Generate learning summary
  const summary = generateLearningSummary(diff, activeAgent);
  if (!summary) {
    return; // Silent exit - no meaningful summary
  }

  // Format and append learning
  const learningYaml = formatLearning(summary, diff.files, activeAgent);
  const success = appendLearning(expertisePath, learningYaml);

  if (success) {
    console.log('');
    console.log(`${c.green}✓ Auto-learned:${c.reset} ${c.dim}${activeAgent}${c.reset}`);
    console.log(`${c.dim}  ${summary}${c.reset}`);
    console.log(
      `${c.dim}  → Updated ${path.basename(path.dirname(expertisePath))}/expertise.yaml${c.reset}`
    );
    console.log('');
  }
}

// Run if executed directly
if (require.main === module) {
  try {
    main();
  } catch (e) {
    // Silent fail - don't break the workflow
    if (process.env.DEBUG) {
      console.error('auto-self-improve error:', e.message);
    }
  }
}

module.exports = { main, detectDomain, generateLearningSummary };
