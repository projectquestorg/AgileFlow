#!/usr/bin/env node
/**
 * scale-detector.js
 *
 * Project scope detection for scale-adaptive workflows (EP-0033)
 *
 * Detects project scale based on:
 * - Source file count (excluding node_modules, .git, dist, etc.)
 * - Active stories in status.json
 * - Git commit count (last 6 months)
 * - Dependency count (from package.json)
 *
 * Scale tiers:
 *   micro      - <20 files, <5 stories, <50 commits
 *   small      - <100 files, <20 stories, <200 commits
 *   medium     - <500 files, <50 stories, <1000 commits
 *   large      - <2000 files, <200 stories, <5000 commits
 *   enterprise - 2000+ files
 *
 * Performance target: <200ms detection, cached with 60s TTL
 */

const fs = require('fs');
const path = require('path');
const { git } = require('../../lib/process-executor');

// Cache TTL in milliseconds (60 seconds)
const CACHE_TTL_MS = 60000;

// Scale tier thresholds
const SCALE_THRESHOLDS = {
  micro: { maxFiles: 20, maxStories: 5, maxCommits: 50 },
  small: { maxFiles: 100, maxStories: 20, maxCommits: 200 },
  medium: { maxFiles: 500, maxStories: 50, maxCommits: 1000 },
  large: { maxFiles: 2000, maxStories: 200, maxCommits: 5000 },
  // enterprise: anything above large
};

// Directories to exclude from file counting
const EXCLUDE_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '.next', '.nuxt',
  'coverage', '.agileflow', '.claude', '__pycache__', '.venv',
  'vendor', 'target', 'out', '.cache', '.turbo', '.vercel',
]);

// Source file extensions to count
const SOURCE_EXTENSIONS = new Set([
  '.js', '.jsx', '.ts', '.tsx', '.py', '.rb', '.go', '.rs',
  '.java', '.kt', '.swift', '.c', '.cpp', '.h', '.cs',
  '.vue', '.svelte', '.astro', '.php', '.sh', '.bash',
  '.css', '.scss', '.less', '.html', '.sql', '.graphql',
]);

/**
 * Count source files recursively (fast, synchronous).
 * Uses readdir with withFileTypes to avoid stat calls.
 *
 * @param {string} dir - Directory to scan
 * @param {number} maxDepth - Maximum recursion depth
 * @returns {number} File count
 */
function countSourceFiles(dir, maxDepth = 6) {
  let count = 0;

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
        if (!EXCLUDE_DIRS.has(entry.name) && !entry.name.startsWith('.')) {
          walk(path.join(currentDir, entry.name), depth + 1);
        }
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (SOURCE_EXTENSIONS.has(ext)) {
          count++;
        }
      }
    }
  }

  walk(dir, 0);
  return count;
}

/**
 * Count active stories from status.json.
 *
 * @param {Object|null} statusJson - Pre-loaded status.json data
 * @param {string} rootDir - Project root directory
 * @returns {number} Total story count
 */
function countStories(statusJson, rootDir) {
  if (statusJson && statusJson.stories) {
    return Object.keys(statusJson.stories).length;
  }

  // Fallback: read from disk
  try {
    const statusPath = path.join(rootDir, 'docs', '09-agents', 'status.json');
    if (fs.existsSync(statusPath)) {
      const data = JSON.parse(fs.readFileSync(statusPath, 'utf8'));
      return data.stories ? Object.keys(data.stories).length : 0;
    }
  } catch {
    // Silently fail
  }
  return 0;
}

/**
 * Count git commits in the last 6 months.
 *
 * @param {string} rootDir - Project root directory
 * @returns {number} Commit count
 */
function countGitCommits(rootDir) {
  const result = git(['rev-list', '--count', '--since=6 months ago', 'HEAD'], {
    cwd: rootDir, timeout: 5000, fallback: '0',
  });
  const count = parseInt(result.data, 10);
  return isNaN(count) ? 0 : count;
}

/**
 * Count dependencies from package.json.
 *
 * @param {string} rootDir - Project root directory
 * @returns {number} Dependency count
 */
function countDependencies(rootDir) {
  try {
    const pkgPath = path.join(rootDir, 'package.json');
    if (!fs.existsSync(pkgPath)) return 0;
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    const deps = Object.keys(pkg.dependencies || {}).length;
    const devDeps = Object.keys(pkg.devDependencies || {}).length;
    return deps + devDeps;
  } catch {
    return 0;
  }
}

/**
 * Determine scale tier from metrics.
 *
 * @param {Object} metrics - { files, stories, commits, dependencies }
 * @returns {string} Scale tier: micro|small|medium|large|enterprise
 */
function classifyScale(metrics) {
  const { files, stories, commits } = metrics;

  // A project is classified at the HIGHEST tier where ANY metric exceeds the threshold
  // This ensures we don't under-estimate complexity
  for (const tier of ['micro', 'small', 'medium', 'large']) {
    const t = SCALE_THRESHOLDS[tier];
    if (files <= t.maxFiles && stories <= t.maxStories && commits <= t.maxCommits) {
      return tier;
    }
  }
  return 'enterprise';
}

/**
 * Read cached scale detection from session-state.json.
 *
 * @param {string} rootDir - Project root directory
 * @param {Object|null} sessionState - Pre-loaded session state
 * @returns {Object|null} Cached result or null if expired/missing
 */
function readCache(rootDir, sessionState) {
  try {
    let state = sessionState;
    if (!state) {
      const statePath = path.join(rootDir, 'docs', '09-agents', 'session-state.json');
      if (!fs.existsSync(statePath)) return null;
      state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    }

    const cached = state.scale_detection;
    if (!cached || !cached.detected_at) return null;

    const age = Date.now() - new Date(cached.detected_at).getTime();
    if (age > CACHE_TTL_MS) return null;

    return cached;
  } catch {
    return null;
  }
}

/**
 * Write scale detection to session-state.json cache.
 *
 * @param {string} rootDir - Project root directory
 * @param {Object} result - Detection result
 */
function writeCache(rootDir, result) {
  try {
    const statePath = path.join(rootDir, 'docs', '09-agents', 'session-state.json');
    let state = {};
    if (fs.existsSync(statePath)) {
      state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    }
    state.scale_detection = result;
    fs.writeFileSync(statePath, JSON.stringify(state, null, 2) + '\n');
  } catch {
    // Cache write failure is non-critical
  }
}

/**
 * Detect project scale with caching.
 *
 * @param {Object} options
 * @param {string} options.rootDir - Project root directory
 * @param {Object|null} options.statusJson - Pre-loaded status.json (optional)
 * @param {Object|null} options.sessionState - Pre-loaded session-state.json (optional)
 * @param {boolean} options.forceRefresh - Skip cache (default: false)
 * @returns {Object} Scale detection result
 */
function detectScale(options = {}) {
  const {
    rootDir = process.cwd(),
    statusJson = null,
    sessionState = null,
    forceRefresh = false,
  } = options;

  // Check cache first
  if (!forceRefresh) {
    const cached = readCache(rootDir, sessionState);
    if (cached) {
      return { ...cached, fromCache: true };
    }
  }

  const startTime = Date.now();

  // Collect metrics
  const metrics = {
    files: countSourceFiles(rootDir),
    stories: countStories(statusJson, rootDir),
    commits: countGitCommits(rootDir),
    dependencies: countDependencies(rootDir),
  };

  // Classify
  const scale = classifyScale(metrics);

  const result = {
    scale,
    metrics,
    detected_at: new Date().toISOString(),
    detection_ms: Date.now() - startTime,
    fromCache: false,
  };

  // Write to cache
  writeCache(rootDir, result);

  return result;
}

/**
 * Get a human-readable label for a scale tier.
 *
 * @param {string} scale - Scale tier
 * @returns {string} Label with emoji
 */
function getScaleLabel(scale) {
  const labels = {
    micro: 'Micro',
    small: 'Small',
    medium: 'Medium',
    large: 'Large',
    enterprise: 'Enterprise',
  };
  return labels[scale] || scale;
}

/**
 * Get workflow recommendations based on scale.
 *
 * @param {string} scale - Scale tier
 * @returns {Object} Recommendations for workflow depth
 */
function getScaleRecommendations(scale) {
  const recommendations = {
    micro: {
      planningDepth: 'minimal',
      skipArchival: true,
      skipEpicPlanning: true,
      contextDepth: 'summary',
      expertCount: 2,
      welcomeDetail: 'compact',
      description: 'Quick specs, direct implementation. Skip epics and full planning.',
    },
    small: {
      planningDepth: 'light',
      skipArchival: true,
      skipEpicPlanning: false,
      contextDepth: 'summary',
      expertCount: 3,
      welcomeDetail: 'compact',
      description: 'Light stories, optional epics. Streamlined workflow.',
    },
    medium: {
      planningDepth: 'standard',
      skipArchival: false,
      skipEpicPlanning: false,
      contextDepth: 'standard',
      expertCount: 4,
      welcomeDetail: 'standard',
      description: 'Full story workflow with epics and planning.',
    },
    large: {
      planningDepth: 'thorough',
      skipArchival: false,
      skipEpicPlanning: false,
      contextDepth: 'full',
      expertCount: 5,
      welcomeDetail: 'full',
      description: 'Thorough planning with architecture review and multi-expert analysis.',
    },
    enterprise: {
      planningDepth: 'comprehensive',
      skipArchival: false,
      skipEpicPlanning: false,
      contextDepth: 'full',
      expertCount: 5,
      welcomeDetail: 'full',
      description: 'Comprehensive planning with council review and full documentation.',
    },
  };
  return recommendations[scale] || recommendations.medium;
}

module.exports = {
  detectScale,
  classifyScale,
  getScaleLabel,
  getScaleRecommendations,
  countSourceFiles,
  countStories,
  countGitCommits,
  countDependencies,
  SCALE_THRESHOLDS,
  CACHE_TTL_MS,
};
