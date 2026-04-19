/**
 * skill-auto-research.js - Orchestrator for Skill Prompt Optimization
 *
 * Ties together skill-eval-criteria.js (binary eval) and skill-research-log.js
 * (JSONL audit trail) into the research loop described by /skill:research.
 *
 * Storage layout:
 *   .agileflow/skills/{id}/
 *     ├── metadata.json        - custom criteria, config
 *     ├── research-log.jsonl   - experiment audit trail
 *     ├── candidates/
 *     │   ├── gen-1.md         - baseline snapshot
 *     │   ├── gen-2.md         - candidate prompt
 *     │   └── ...
 *     └── backups/
 *         └── pre-gen-2.md     - backup before applying gen-2
 *
 * NO EXTERNAL DEPENDENCIES - only Node.js built-ins + sibling modules
 */

'use strict';

const fs = require('fs');
const path = require('path');

const { findProjectRoot } = require('./damage-control-utils');
const evalCriteria = require('./skill-eval-criteria');
const researchLog = require('./skill-research-log');

const SKILLS_DIR = '.agileflow/skills';
const CANDIDATES_DIR = 'candidates';
const BACKUPS_DIR = 'backups';

// ============================================================================
// Skill Discovery
// ============================================================================

/**
 * Find the source path for a skill's prompt file.
 * Searches commands/ and agents/ directories.
 *
 * @param {string} skillId - Skill identifier (e.g. "commit-message-formatter")
 * @param {Object} [options]
 * @param {string} [options.rootDir] - Project root override
 * @returns {{ found: boolean, path?: string, type?: string }}
 */
function findSkillPath(skillId, options = {}) {
  const root = options.rootDir || findProjectRoot();
  const searchPaths = [
    { dir: path.join(root, 'packages/cli/src/core/commands'), type: 'command' },
    { dir: path.join(root, 'packages/cli/src/core/agents'), type: 'agent' },
    { dir: path.join(root, '.claude/commands'), type: 'command' },
    { dir: path.join(root, '.agileflow/agents'), type: 'agent' },
  ];

  for (const { dir, type } of searchPaths) {
    const direct = path.join(dir, `${skillId}.md`);
    if (fs.existsSync(direct)) {
      return { found: true, path: direct, type };
    }
    const nested = findNestedSkill(dir, skillId);
    if (nested) {
      return { found: true, path: nested, type };
    }
  }

  return { found: false };
}

function findNestedSkill(dir, skillId) {
  if (!fs.existsSync(dir)) return null;
  try {
    const parts = skillId.split('/');
    if (parts.length > 1) {
      const nested = path.join(dir, ...parts) + '.md';
      if (fs.existsSync(nested)) return nested;
    }
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const nested = path.join(dir, entry.name, `${skillId}.md`);
        if (fs.existsSync(nested)) return nested;
      }
    }
  } catch {
    // ignore
  }
  return null;
}

// ============================================================================
// Research State
// ============================================================================

function getSkillDir(skillId, rootDir) {
  const root = rootDir || findProjectRoot();
  return path.join(root, SKILLS_DIR, skillId);
}

function ensureSkillDir(skillId, rootDir) {
  const dir = getSkillDir(skillId, rootDir);
  const candidatesDir = path.join(dir, CANDIDATES_DIR);
  const backupsDir = path.join(dir, BACKUPS_DIR);
  for (const d of [dir, candidatesDir, backupsDir]) {
    if (!fs.existsSync(d)) {
      fs.mkdirSync(d, { recursive: true });
    }
  }
  return dir;
}

/**
 * Get research status summary for a skill.
 *
 * @param {string} skillId
 * @param {Object} [options]
 * @returns {{ generations: number, totalExperiments: number, bestScore: number, bestGeneration: number, currentScore: number, pendingCandidates: string[], lastResearch: string|null, history: Object[] }}
 */
function getResearchStatus(skillId, options = {}) {
  const history = researchLog.getGenerationHistory(skillId, options);
  const dir = getSkillDir(skillId, options.rootDir);
  const candidatesDir = path.join(dir, CANDIDATES_DIR);

  let pendingCandidates = [];
  if (fs.existsSync(candidatesDir)) {
    try {
      pendingCandidates = fs
        .readdirSync(candidatesDir)
        .filter(f => f.startsWith('gen-') && f.endsWith('.md'));
    } catch {
      // ignore
    }
  }

  if (history.length === 0) {
    return {
      generations: 0,
      totalExperiments: 0,
      bestScore: 0,
      bestGeneration: 0,
      currentScore: 0,
      pendingCandidates,
      lastResearch: null,
      history: [],
    };
  }

  const allEntries = researchLog.readLog(skillId, options);
  let bestScore = 0;
  let bestGeneration = 0;
  for (const h of history) {
    if ((h.eval_score || 0) > bestScore) {
      bestScore = h.eval_score;
      bestGeneration = h.generation;
    }
  }

  const latest = history[history.length - 1];

  return {
    generations: history.length,
    totalExperiments: allEntries.length,
    bestScore,
    bestGeneration,
    currentScore: latest.eval_score || 0,
    pendingCandidates,
    lastResearch: latest.timestamp || null,
    history,
  };
}

// ============================================================================
// Weakness Analysis
// ============================================================================

/**
 * Analyze weaknesses from eval history for a skill.
 *
 * @param {string} skillId
 * @param {Object} [options]
 * @returns {{ weaknesses: Object[], evalCount: number }}
 */
function analyzeWeaknesses(skillId, options = {}) {
  const entries = researchLog.readLog(skillId, options);
  const evalResults = entries
    .filter(e => e.eval_answers && e.eval_answers.length > 0)
    .map(e => ({ answers: e.eval_answers }));

  const weaknesses = evalCriteria.identifyWeaknesses(evalResults);
  return { weaknesses, evalCount: evalResults.length };
}

// ============================================================================
// Candidate Management
// ============================================================================

/**
 * Create a candidate prompt file for a new generation.
 *
 * @param {string} skillId
 * @param {string} promptContent - The candidate prompt text
 * @param {string} hypothesis - Improvement hypothesis
 * @param {Object} [options]
 * @returns {{ success: boolean, generation: number, candidatePath: string, error?: string }}
 */
function createCandidate(skillId, promptContent, hypothesis, options = {}) {
  const dir = ensureSkillDir(skillId, options.rootDir);
  const generation = researchLog.getNextGeneration(skillId, options);

  if (generation > researchLog.MAX_GENERATIONS) {
    return {
      success: false,
      generation,
      candidatePath: '',
      error: `Maximum generations (${researchLog.MAX_GENERATIONS}) reached. Clean up old candidates first.`,
    };
  }

  const candidatePath = path.join(dir, CANDIDATES_DIR, `gen-${generation}.md`);

  try {
    fs.writeFileSync(candidatePath, promptContent, 'utf8');

    const hash = researchLog._promptHash(promptContent);
    researchLog.appendEntry(
      skillId,
      {
        generation,
        prompt_hash: hash,
        hypothesis,
        outcome: 'pending',
      },
      options
    );

    return { success: true, generation, candidatePath };
  } catch (e) {
    return { success: false, generation, candidatePath: '', error: e.message };
  }
}

/**
 * Record benchmark results for a candidate.
 *
 * @param {string} skillId
 * @param {number} generation
 * @param {Object} evalResult - Output of evalCriteria.scoreOutput()
 * @param {Object} [options]
 * @returns {{ success: boolean, outcome: string }}
 */
function benchmarkCandidate(skillId, generation, evalResult, options = {}) {
  const history = researchLog.getGenerationHistory(skillId, options);
  const baseline = history.length > 0 ? history[0] : null;
  const baseScore = baseline ? baseline.eval_score || 0 : 0;
  const score = evalResult.score || 0;

  let outcome;
  if (score > baseScore) {
    outcome = 'improved';
  } else if (score < baseScore) {
    outcome = 'regressed';
  } else {
    outcome = 'neutral';
  }

  const dir = getSkillDir(skillId, options.rootDir);
  const candidatePath = path.join(dir, CANDIDATES_DIR, `gen-${generation}.md`);
  let hash = '00000000';
  if (fs.existsSync(candidatePath)) {
    hash = researchLog._promptHash(fs.readFileSync(candidatePath, 'utf8'));
  }

  researchLog.appendEntry(
    skillId,
    {
      generation,
      prompt_hash: hash,
      eval_score: score,
      eval_answers: evalResult.answers || [],
      hypothesis: `benchmark gen-${generation}`,
      outcome,
    },
    options
  );

  return { success: true, outcome };
}

/**
 * Approve a candidate: copy to live prompt, create backup.
 *
 * @param {string} skillId
 * @param {number} generation
 * @param {Object} [options]
 * @returns {{ success: boolean, backupPath?: string, error?: string }}
 */
function approveCandidate(skillId, generation, options = {}) {
  const dir = getSkillDir(skillId, options.rootDir);
  const candidatePath = path.join(dir, CANDIDATES_DIR, `gen-${generation}.md`);

  if (!fs.existsSync(candidatePath)) {
    return { success: false, error: `Candidate gen-${generation} not found` };
  }

  const skill = findSkillPath(skillId, options);
  if (!skill.found) {
    return { success: false, error: `Skill "${skillId}" not found` };
  }

  const backupPath = path.join(dir, BACKUPS_DIR, `pre-gen-${generation}.md`);
  try {
    if (fs.existsSync(skill.path)) {
      fs.copyFileSync(skill.path, backupPath);
    }
    const candidate = fs.readFileSync(candidatePath, 'utf8');
    fs.writeFileSync(skill.path, candidate, 'utf8');

    researchLog.appendEntry(
      skillId,
      {
        generation,
        prompt_hash: researchLog._promptHash(candidate),
        hypothesis: `approved gen-${generation}`,
        outcome: 'approved',
      },
      options
    );

    return { success: true, backupPath };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

/**
 * Reject a candidate: log rejection, keep files for reference.
 *
 * @param {string} skillId
 * @param {number} generation
 * @param {Object} [options]
 * @returns {{ success: boolean }}
 */
function rejectCandidate(skillId, generation, options = {}) {
  researchLog.appendEntry(
    skillId,
    {
      generation,
      hypothesis: `rejected gen-${generation}`,
      outcome: 'rejected',
    },
    options
  );

  return { success: true };
}

/**
 * Clean up old candidate files (keep last N).
 *
 * @param {string} skillId
 * @param {Object} [options]
 * @param {number} [options.keep=3] - Number of recent candidates to keep
 * @returns {{ removed: string[] }}
 */
function cleanupCandidates(skillId, options = {}) {
  const keep = options.keep || 3;
  const dir = getSkillDir(skillId, options.rootDir);
  const candidatesDir = path.join(dir, CANDIDATES_DIR);

  if (!fs.existsSync(candidatesDir)) {
    return { removed: [] };
  }

  try {
    const files = fs
      .readdirSync(candidatesDir)
      .filter(f => f.startsWith('gen-') && f.endsWith('.md'))
      .sort((a, b) => {
        const numA = parseInt(a.replace('gen-', '').replace('.md', ''));
        const numB = parseInt(b.replace('gen-', '').replace('.md', ''));
        return numA - numB;
      });

    if (files.length <= keep) {
      return { removed: [] };
    }

    const toRemove = files.slice(0, files.length - keep);
    const removed = [];

    for (const f of toRemove) {
      const filePath = path.join(candidatesDir, f);
      fs.unlinkSync(filePath);
      removed.push(f);
    }

    return { removed };
  } catch {
    return { removed: [] };
  }
}

// ============================================================================
// Exports
// ============================================================================

module.exports = {
  findSkillPath,
  getResearchStatus,
  analyzeWeaknesses,
  createCandidate,
  benchmarkCandidate,
  approveCandidate,
  rejectCandidate,
  cleanupCandidates,
};
