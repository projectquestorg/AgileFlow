/**
 * skill-research-log.js - JSONL Research Log for Skill Experiments
 *
 * Append-only JSONL log for tracking prompt optimization experiments.
 * Each entry records a generation (iteration), the prompt change made,
 * eval scores, benchmark results, and the hypothesis being tested.
 *
 * Storage: .agileflow/skills/{id}/research-log.jsonl
 * Pattern: Matches existing bus/metrics JSONL patterns in AgileFlow.
 *
 * NO EXTERNAL DEPENDENCIES - only Node.js built-ins + file-lock.js
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Lazy-load file-lock to avoid circular dependency issues
let _fileLock = null;
function getFileLock() {
  if (!_fileLock) {
    _fileLock = require('./file-lock');
  }
  return _fileLock;
}

// ============================================================================
// Constants
// ============================================================================

const SKILLS_DIR = '.agileflow/skills';
const LOG_FILE = 'research-log.jsonl';
const MAX_GENERATIONS = 10;
const MAX_LOG_ENTRIES = 500;

// ============================================================================
// Utility Functions
// ============================================================================

const { findProjectRoot } = require('./damage-control-utils');

/**
 * Get the research log path for a skill
 * @param {string} skillId - Skill identifier
 * @param {string} [rootDir] - Project root override
 * @returns {string} Absolute path to research-log.jsonl
 */
function getLogPath(skillId, rootDir) {
  const root = rootDir || findProjectRoot();
  return path.join(root, SKILLS_DIR, skillId, LOG_FILE);
}

/**
 * Compute a short hash of prompt content for tracking changes.
 * @param {string} content - Prompt content
 * @returns {string} 8-char hex hash
 */
function promptHash(content) {
  if (!content) return '00000000';
  return crypto.createHash('sha256').update(content).digest('hex').slice(0, 8);
}

/**
 * Generate ISO timestamp
 * @returns {string} ISO 8601 timestamp
 */
function nowISO() {
  return new Date().toISOString();
}

// ============================================================================
// Core Operations
// ============================================================================

/**
 * Append a research entry to the log.
 * Atomic append with file locking for concurrent access safety.
 *
 * @param {string} skillId - Skill identifier
 * @param {Object} entry - Research log entry
 * @param {number} entry.generation - Generation number (1-based)
 * @param {string} entry.prompt_hash - Hash of the prompt being tested
 * @param {string} [entry.parent_hash] - Hash of the parent prompt
 * @param {string} [entry.prompt_diff] - Summary of changes from parent
 * @param {number} entry.eval_score - Binary eval score (0-100)
 * @param {Object[]} [entry.eval_answers] - Individual criterion answers
 * @param {Object} [entry.benchmark] - Benchmark results snapshot
 * @param {Object} [entry.usage_snapshot] - Usage metrics at time of experiment
 * @param {string} entry.hypothesis - What improvement was hypothesized
 * @param {string} entry.outcome - Result: 'improved' | 'neutral' | 'regressed' | 'pending'
 * @param {Object} [options] - Options
 * @param {string} [options.rootDir] - Project root override
 * @returns {{ success: boolean, error?: string }}
 */
function appendEntry(skillId, entry, options = {}) {
  const logPath = getLogPath(skillId, options.rootDir);
  const fileLock = getFileLock();

  const lock = fileLock.acquireLock(logPath);
  try {
    // Ensure directory exists
    const dir = path.dirname(logPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const record = {
      timestamp: nowISO(),
      generation: entry.generation || 1,
      prompt_hash: entry.prompt_hash || '00000000',
      parent_hash: entry.parent_hash || null,
      prompt_diff: entry.prompt_diff || null,
      eval_score: entry.eval_score != null ? entry.eval_score : null,
      eval_answers: entry.eval_answers || [],
      benchmark: entry.benchmark || null,
      usage_snapshot: entry.usage_snapshot || null,
      hypothesis: entry.hypothesis || '',
      outcome: entry.outcome || 'pending',
    };

    const line = JSON.stringify(record) + '\n';
    fs.appendFileSync(logPath, line, 'utf8');

    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  } finally {
    if (lock.acquired) {
      fileLock.releaseLock(lock.lockPath);
    }
  }
}

/**
 * Read the full research log for a skill.
 *
 * @param {string} skillId - Skill identifier
 * @param {Object} [options] - Options
 * @param {string} [options.rootDir] - Project root override
 * @returns {Object[]} Array of log entries (newest last)
 */
function readLog(skillId, options = {}) {
  const logPath = getLogPath(skillId, options.rootDir);

  if (!fs.existsSync(logPath)) {
    return [];
  }

  try {
    const content = fs.readFileSync(logPath, 'utf8');
    const lines = content.trim().split('\n').filter(Boolean);

    return lines
      .map(line => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Get entries for a specific generation.
 *
 * @param {string} skillId - Skill identifier
 * @param {number} generation - Generation number
 * @param {Object} [options] - Options
 * @returns {Object[]} Entries for that generation
 */
function getGenerationEntries(skillId, generation, options = {}) {
  const entries = readLog(skillId, options);
  return entries.filter(e => e.generation === generation);
}

/**
 * Get the generation history: one summary per generation.
 *
 * @param {string} skillId - Skill identifier
 * @param {Object} [options] - Options
 * @returns {Object[]} Array of { generation, prompt_hash, eval_score, outcome, timestamp }
 */
function getGenerationHistory(skillId, options = {}) {
  const entries = readLog(skillId, options);
  const genMap = new Map();

  for (const entry of entries) {
    const gen = entry.generation;
    // Keep the latest entry per generation
    if (!genMap.has(gen) || entry.timestamp > genMap.get(gen).timestamp) {
      genMap.set(gen, {
        generation: gen,
        prompt_hash: entry.prompt_hash,
        eval_score: entry.eval_score,
        outcome: entry.outcome,
        hypothesis: entry.hypothesis,
        timestamp: entry.timestamp,
      });
    }
  }

  return Array.from(genMap.values()).sort((a, b) => a.generation - b.generation);
}

/**
 * Get the current generation number (latest + 1 for new experiments).
 *
 * @param {string} skillId - Skill identifier
 * @param {Object} [options] - Options
 * @returns {number} Next generation number
 */
function getNextGeneration(skillId, options = {}) {
  const history = getGenerationHistory(skillId, options);
  if (history.length === 0) return 1;
  return history[history.length - 1].generation + 1;
}

/**
 * Identify winners and losers across generations.
 *
 * @param {string} skillId - Skill identifier
 * @param {Object} [options] - Options
 * @returns {{ winners: Object[], losers: Object[], baseline: Object|null }}
 */
function getWinnersLosers(skillId, options = {}) {
  const history = getGenerationHistory(skillId, options);

  if (history.length === 0) {
    return { winners: [], losers: [], baseline: null };
  }

  const baseline = history[0];
  const baseScore = baseline.eval_score || 0;

  const winners = [];
  const losers = [];

  for (let i = 1; i < history.length; i++) {
    const gen = history[i];
    const score = gen.eval_score || 0;
    const delta = score - baseScore;

    const entry = { ...gen, delta, vs_baseline: baseScore };

    if (delta > 0) {
      winners.push(entry);
    } else if (delta < 0) {
      losers.push(entry);
    }
  }

  // Sort winners by delta descending, losers by delta ascending
  winners.sort((a, b) => b.delta - a.delta);
  losers.sort((a, b) => a.delta - b.delta);

  return { winners, losers, baseline };
}

/**
 * Prune old log entries if exceeding MAX_LOG_ENTRIES.
 * Keeps the most recent entries. Rewrites the file atomically.
 *
 * @param {string} skillId - Skill identifier
 * @param {Object} [options] - Options
 * @returns {{ pruned: number }}
 */
function pruneLog(skillId, options = {}) {
  const logPath = getLogPath(skillId, options.rootDir);
  const fileLock = getFileLock();

  if (!fs.existsSync(logPath)) {
    return { pruned: 0 };
  }

  const lock = fileLock.acquireLock(logPath);
  try {
    const entries = readLog(skillId, options);
    if (entries.length <= MAX_LOG_ENTRIES) {
      return { pruned: 0 };
    }

    const kept = entries.slice(-MAX_LOG_ENTRIES);
    const pruned = entries.length - kept.length;

    const content = kept.map(e => JSON.stringify(e)).join('\n') + '\n';
    const tempPath = `${logPath}.tmp.${process.pid}`;
    fs.writeFileSync(tempPath, content, 'utf8');
    fs.renameSync(tempPath, logPath);

    return { pruned };
  } catch {
    return { pruned: 0 };
  } finally {
    if (lock.acquired) {
      fileLock.releaseLock(lock.lockPath);
    }
  }
}

// ============================================================================
// Exports
// ============================================================================

module.exports = {
  // Constants
  MAX_GENERATIONS,
  MAX_LOG_ENTRIES,

  // Core operations
  appendEntry,
  readLog,
  getGenerationEntries,
  getGenerationHistory,
  getNextGeneration,
  getWinnersLosers,
  pruneLog,

  // Utilities (for testing)
  _promptHash: promptHash,
  _getLogPath: getLogPath,
};
