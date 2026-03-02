/**
 * ac-test-matcher.js - Automated Acceptance Criteria to Test Mapping
 *
 * Reads story AC from status.json, scans test files for keyword overlap,
 * and returns matched/unmatched AC with confidence levels.
 *
 * Usage:
 *   const { matchACToTests } = require('./lib/ac-test-matcher');
 *
 *   const result = matchACToTests('US-0042', projectRoot);
 *   // result = {
 *   //   storyId: 'US-0042',
 *   //   total: 5,
 *   //   matched: [{ index: 0, ac: '...', confidence: 'high', testFiles: [...] }],
 *   //   unmatched: [{ index: 2, ac: '...' }],
 *   //   coverage: 0.6
 *   // }
 */

'use strict';

const fs = require('fs');
const path = require('path');

const { getProjectRoot, getStatusPath } = require('../../lib/paths');
const { safeReadJSON } = require('../../lib/errors');

// ============================================================================
// Keyword Extraction
// ============================================================================

/**
 * Extract meaningful keywords from an AC string.
 * Filters out stop words and short tokens.
 */
const STOP_WORDS = new Set([
  'the',
  'a',
  'an',
  'is',
  'are',
  'was',
  'were',
  'be',
  'been',
  'being',
  'have',
  'has',
  'had',
  'do',
  'does',
  'did',
  'will',
  'would',
  'could',
  'should',
  'may',
  'might',
  'must',
  'shall',
  'can',
  'need',
  'dare',
  'to',
  'of',
  'in',
  'for',
  'on',
  'with',
  'at',
  'by',
  'from',
  'as',
  'into',
  'through',
  'during',
  'before',
  'after',
  'above',
  'below',
  'and',
  'but',
  'or',
  'nor',
  'not',
  'so',
  'yet',
  'both',
  'either',
  'neither',
  'each',
  'every',
  'all',
  'any',
  'few',
  'more',
  'most',
  'other',
  'some',
  'such',
  'no',
  'only',
  'own',
  'same',
  'than',
  'too',
  'very',
  'just',
  'that',
  'this',
  'these',
  'those',
  'it',
  'its',
  'when',
  'where',
  'how',
  'what',
  'which',
  'who',
  'whom',
  'then',
  'there',
  'here',
  'if',
  'else',
  'while',
  'about',
  'up',
  'out',
  'also',
  'given',
  'user',
  'system',
  'able',
]);

function extractKeywords(text) {
  if (!text || typeof text !== 'string') return [];
  // Split on non-alphanumeric (keep hyphenated words)
  const tokens = text
    .toLowerCase()
    .replace(/[^a-z0-9-_]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length >= 3 && !STOP_WORDS.has(t));

  return [...new Set(tokens)];
}

// ============================================================================
// Test File Discovery
// ============================================================================

/** Common test file patterns */
const TEST_PATTERNS = [
  /\.test\.[jt]sx?$/,
  /\.spec\.[jt]sx?$/,
  /_test\.[jt]sx?$/,
  /_test\.go$/,
  /test_.*\.py$/,
  /.*_test\.py$/,
  /\.test\.ts$/,
];

/**
 * Recursively find test files under a directory.
 * Skips node_modules, dist, .git, coverage, etc.
 */
function findTestFiles(dir, maxDepth = 5) {
  const results = [];
  const skipDirs = new Set([
    'node_modules',
    '.git',
    'dist',
    'build',
    'coverage',
    '.next',
    '.nuxt',
    '.agileflow',
    '.claude',
    'vendor',
  ]);

  function walk(currentDir, depth) {
    if (depth > maxDepth) return;
    let entries;
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (!skipDirs.has(entry.name)) {
          walk(path.join(currentDir, entry.name), depth + 1);
        }
      } else if (entry.isFile()) {
        if (TEST_PATTERNS.some(pat => pat.test(entry.name))) {
          results.push(path.join(currentDir, entry.name));
        }
      }
    }
  }

  walk(dir, 0);
  return results;
}

// ============================================================================
// Test Content Scanning
// ============================================================================

/**
 * Read a test file and extract its content for keyword matching.
 * Returns lowercased content (describe/it blocks, comments, etc.)
 */
function readTestContent(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    return content.toLowerCase();
  } catch {
    return '';
  }
}

// ============================================================================
// AC-to-Test Matching
// ============================================================================

/**
 * Calculate keyword overlap between AC keywords and test file content.
 * Returns a confidence score.
 */
function calculateConfidence(acKeywords, testContent) {
  if (acKeywords.length === 0) return 0;
  let matchCount = 0;
  for (const kw of acKeywords) {
    if (testContent.includes(kw)) {
      matchCount++;
    }
  }
  const ratio = matchCount / acKeywords.length;
  return ratio;
}

/**
 * Determine confidence level from ratio.
 */
function confidenceLevel(ratio) {
  if (ratio >= 0.6) return 'high';
  if (ratio >= 0.3) return 'medium';
  if (ratio > 0) return 'low';
  return 'none';
}

/**
 * Match acceptance criteria to test files.
 *
 * @param {string} storyId - Story ID (e.g., 'US-0042')
 * @param {string} [rootDir] - Project root (auto-detected if omitted)
 * @returns {{ storyId, total, matched, unmatched, coverage, error? }}
 */
function matchACToTests(storyId, rootDir) {
  rootDir = rootDir || getProjectRoot();

  if (!rootDir) {
    return {
      storyId,
      total: 0,
      matched: [],
      unmatched: [],
      coverage: 0,
      error: 'Project root not found',
    };
  }

  // Load story from status.json
  const statusPath = getStatusPath(rootDir);
  const result = safeReadJSON(statusPath, { defaultValue: { stories: {} } });
  const status = result.ok ? result.data : null;
  if (!status || !status.stories) {
    return {
      storyId,
      total: 0,
      matched: [],
      unmatched: [],
      coverage: 0,
      error: 'status.json not found or invalid',
    };
  }

  const story = status.stories[storyId];
  if (!story) {
    return {
      storyId,
      total: 0,
      matched: [],
      unmatched: [],
      coverage: 0,
      error: `Story ${storyId} not found`,
    };
  }

  const acList = story.acceptance_criteria || story.ac || [];
  if (!Array.isArray(acList) || acList.length === 0) {
    return {
      storyId,
      total: 0,
      matched: [],
      unmatched: [],
      coverage: 0,
      error: 'No acceptance criteria defined',
    };
  }

  // Find test files
  const testFiles = findTestFiles(rootDir);
  if (testFiles.length === 0) {
    return {
      storyId,
      total: acList.length,
      matched: [],
      unmatched: acList.map((ac, i) => ({
        index: i,
        ac: typeof ac === 'string' ? ac : ac.text || String(ac),
      })),
      coverage: 0,
      error: 'No test files found',
    };
  }

  // Read all test content (cached in memory for this run)
  const testContentMap = {};
  for (const tf of testFiles) {
    testContentMap[tf] = readTestContent(tf);
  }

  // Match each AC against test files
  const matched = [];
  const unmatched = [];

  for (let i = 0; i < acList.length; i++) {
    const acText = typeof acList[i] === 'string' ? acList[i] : acList[i].text || String(acList[i]);
    const keywords = extractKeywords(acText);

    if (keywords.length === 0) {
      unmatched.push({ index: i, ac: acText });
      continue;
    }

    // Find best matching test files
    const fileMatches = [];
    for (const [filePath, content] of Object.entries(testContentMap)) {
      const ratio = calculateConfidence(keywords, content);
      if (ratio > 0) {
        fileMatches.push({
          file: path.relative(rootDir, filePath),
          ratio,
          confidence: confidenceLevel(ratio),
        });
      }
    }

    // Sort by match ratio descending
    fileMatches.sort((a, b) => b.ratio - a.ratio);

    // Take top 3 matches
    const topMatches = fileMatches.slice(0, 3);
    const bestConfidence = topMatches.length > 0 ? topMatches[0].confidence : 'none';

    if (bestConfidence === 'high' || bestConfidence === 'medium') {
      matched.push({
        index: i,
        ac: acText,
        confidence: bestConfidence,
        keywords,
        testFiles: topMatches.map(m => ({ file: m.file, confidence: m.confidence })),
      });
    } else {
      unmatched.push({
        index: i,
        ac: acText,
        keywords,
        testFiles:
          topMatches.length > 0
            ? topMatches.map(m => ({ file: m.file, confidence: m.confidence }))
            : undefined,
      });
    }
  }

  return {
    storyId,
    total: acList.length,
    matched,
    unmatched,
    coverage: acList.length > 0 ? matched.length / acList.length : 0,
  };
}

/**
 * Write ac_status to status.json for a story based on match results.
 *
 * @param {string} storyId - Story ID
 * @param {Object} matchResult - Result from matchACToTests
 * @param {Object} [manualOverrides] - Manual AC verification { index: 'verified' }
 * @param {string} [rootDir] - Project root
 */
function writeACStatus(storyId, matchResult, manualOverrides = {}, rootDir) {
  rootDir = rootDir || getProjectRoot();
  const statusPath = getStatusPath(rootDir);
  const result = safeReadJSON(statusPath);
  if (!result.ok || !result.data || !result.data.stories || !result.data.stories[storyId]) return;
  const status = result.data;

  const acStatus = {};

  // Auto-verified from high-confidence matches
  for (const m of matchResult.matched) {
    if (m.confidence === 'high') {
      acStatus[m.index] = 'auto-verified';
    } else {
      acStatus[m.index] = 'likely-covered';
    }
  }

  // Unmatched remain unverified
  for (const u of matchResult.unmatched) {
    acStatus[u.index] = 'unverified';
  }

  // Apply manual overrides
  for (const [idx, val] of Object.entries(manualOverrides)) {
    acStatus[idx] = val;
  }

  status.stories[storyId].ac_status = acStatus;
  status.stories[storyId].ac_coverage = matchResult.coverage;

  const { safeWriteJSON: writeJSON } = require('../../lib/errors');
  writeJSON(statusPath, status);
}

module.exports = {
  matchACToTests,
  writeACStatus,
  // Exported for testing
  extractKeywords,
  findTestFiles,
  calculateConfidence,
  confidenceLevel,
};
