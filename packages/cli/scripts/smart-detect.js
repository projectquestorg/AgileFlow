#!/usr/bin/env node
/**
 * smart-detect.js
 *
 * Orchestrator for contextual feature routing.
 * Gathers signals from prefetched context data, runs feature detectors,
 * filters by lifecycle phase, and outputs recommendations.
 *
 * Called by obtain-context.js after prefetchAllData() returns.
 * Output: docs/09-agents/smart-detect.json
 *
 * Usage (standalone):
 *   node scripts/smart-detect.js
 *
 * Usage (as module):
 *   const smartDetect = require('./smart-detect');
 *   const result = smartDetect.analyze(prefetched, sessionState, metadata);
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { detectLifecyclePhase, getRelevantPhases } = require('./lib/lifecycle-detector');
const { runDetectorsForPhases } = require('./lib/signal-detectors');

let safeReadJSON, safeWriteJSON;
try {
  const errors = require('../lib/errors');
  safeReadJSON = errors.safeReadJSON;
  safeWriteJSON = errors.safeWriteJSON;
} catch {
  // Fallback for when running outside package context
  safeReadJSON = (filePath, opts = {}) => {
    try {
      if (!fs.existsSync(filePath)) {
        return opts.defaultValue !== undefined
          ? { ok: true, data: opts.defaultValue }
          : { ok: false, error: 'not found' };
      }
      return { ok: true, data: JSON.parse(fs.readFileSync(filePath, 'utf8')) };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  };
  safeWriteJSON = (filePath, data) => {
    try {
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n');
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  };
}

// =============================================================================
// Signal Extraction from Prefetched Data
// =============================================================================

/**
 * Extract structured signals from prefetched context data.
 *
 * @param {Object} prefetched - Data from obtain-context.js prefetchAllData()
 * @param {Object} sessionState - Parsed session-state.json
 * @param {Object} metadata - Parsed agileflow-metadata.json
 * @returns {Object} Structured signals for detectors
 */
function extractSignals(prefetched, sessionState, metadata) {
  const statusJson = prefetched?.json?.statusJson || null;
  const git = prefetched?.git || {};
  const packageJsonPath = path.join(process.cwd(), 'package.json');

  let packageJson = null;
  try {
    if (fs.existsSync(packageJsonPath)) {
      packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    }
  } catch {
    // No package.json or invalid
  }

  // Determine current story
  let story = null;
  const currentStoryId = sessionState?.current_session?.current_story;
  if (currentStoryId && statusJson?.stories?.[currentStoryId]) {
    const s = statusJson.stories[currentStoryId];
    story = { id: currentStoryId, ...s };
  }

  // Count stories by status
  const counts = {};
  let storyCount = 0;
  if (statusJson?.stories) {
    Object.values(statusJson.stories).forEach(s => {
      const status = s.status || 'unknown';
      counts[status] = (counts[status] || 0) + 1;
      storyCount++;
    });
  }

  // Git signals
  const statusLines = (git.status || '').split('\n').filter(Boolean);
  const changedFiles = statusLines.map(line => line.substring(3).trim());
  const branch = git.branch || '';
  const isClean = statusLines.length === 0;
  const onFeatureBranch = branch !== 'main' && branch !== 'master' && branch !== '';

  // Parse diff stats if available
  let diffStats = null;
  if (git.diffStat) {
    const match = git.diffStat.match(/(\d+) insertions?.*?(\d+) deletions?/);
    if (match) {
      diffStats = { insertions: parseInt(match[1], 10), deletions: parseInt(match[2], 10) };
    }
  }

  // File existence checks
  const files = {
    tsconfig: fs.existsSync('tsconfig.json'),
    eslintrc: fs.existsSync('.eslintrc.js') || fs.existsSync('.eslintrc.json') || fs.existsSync('.eslintrc.yml'),
    coverage: fs.existsSync('coverage/coverage-summary.json'),
    playwright: fs.existsSync('playwright.config.ts') || fs.existsSync('playwright.config.js'),
    screenshots: fs.existsSync('screenshots'),
    ciConfig: fs.existsSync('.github/workflows') || fs.existsSync('.gitlab-ci.yml') || fs.existsSync('Jenkinsfile'),
    expertiseDir: fs.existsSync('.agileflow/expertise'),
  };

  // Test state
  let tests = { passing: null, hasTestSetup: false };
  if (packageJson?.scripts?.test) {
    tests.hasTestSetup = true;
  }

  // Plan mode detection
  const planModeActive = (sessionState?.active_commands || []).some(
    c => c.active_sections && c.active_sections.includes('plan-mode')
  );

  // Thresholds from metadata
  const thresholds = metadata?.smart_detect?.thresholds || {};

  return {
    statusJson,
    sessionState,
    metadata,
    git: {
      branch,
      filesChanged: statusLines.length,
      changedFiles,
      isClean,
      onFeatureBranch,
      diffStats,
      commitCount: git.commitCount || 0,
    },
    packageJson,
    story,
    files,
    tests,
    counts,
    storyCount,
    thresholds,
    session: {
      planModeActive,
      activeCommands: sessionState?.active_commands || [],
    },
  };
}

// =============================================================================
// Recommendation Filtering
// =============================================================================

/**
 * Filter recommendations based on user preferences and session history.
 *
 * @param {Object[]} recommendations - Raw recommendations from detectors
 * @param {Object} metadata - AgileFlow metadata (for disabled features)
 * @param {Object} sessionState - Session state (for already-offered features)
 * @returns {Object} Filtered and categorized recommendations
 */
function filterRecommendations(recommendations, metadata, sessionState) {
  const disabledFeatures = new Set(metadata?.smart_detect?.disabled_features || []);
  const offeredFeatures = new Set(sessionState?.smart_detect?.features_offered || []);
  const skippedFeatures = new Set(sessionState?.smart_detect?.features_skipped || []);

  // Apply priority overrides from metadata
  const priorityOverrides = metadata?.smart_detect?.priority_overrides || {};

  const filtered = recommendations
    .filter(r => !disabledFeatures.has(r.feature))
    .filter(r => !skippedFeatures.has(r.feature))
    .map(r => {
      if (priorityOverrides[r.feature]) {
        return { ...r, priority: priorityOverrides[r.feature] };
      }
      return r;
    });

  // Categorize: immediate (high priority, not yet offered), available (rest)
  const immediate = filtered.filter(r => r.priority === 'high' && !offeredFeatures.has(r.feature));
  const available = filtered.filter(r => r.priority !== 'high' || offeredFeatures.has(r.feature));

  // Sort by priority within each category
  const priorityOrder = { high: 0, medium: 1, low: 2 };
  immediate.sort((a, b) => (priorityOrder[a.priority] || 2) - (priorityOrder[b.priority] || 2));
  available.sort((a, b) => (priorityOrder[a.priority] || 2) - (priorityOrder[b.priority] || 2));

  return { immediate, available };
}

// =============================================================================
// Main Analysis
// =============================================================================

/**
 * Run full smart detection analysis.
 *
 * @param {Object} prefetched - Data from obtain-context.js prefetchAllData()
 * @param {Object} [sessionState] - Parsed session-state.json (optional, extracted from prefetched if omitted)
 * @param {Object} [metadata] - Parsed agileflow-metadata.json (optional, extracted from prefetched if omitted)
 * @returns {Object} Smart detection results
 */
function analyze(prefetched, sessionState, metadata) {
  // Extract from prefetched if not provided directly
  if (!sessionState) {
    sessionState = prefetched?.json?.sessionState || {};
  }
  if (!metadata) {
    metadata = prefetched?.json?.metadata || {};
  }

  // Check if smart-detect is disabled
  if (metadata?.smart_detect?.enabled === false) {
    return {
      detected_at: new Date().toISOString(),
      lifecycle_phase: 'unknown',
      recommendations: { immediate: [], available: [], auto_enabled: {} },
      signals_summary: {},
      disabled: true,
    };
  }

  // Extract signals
  const signals = extractSignals(prefetched, sessionState, metadata);

  // Detect lifecycle phase
  const phaseResult = detectLifecyclePhase(signals);
  const relevantPhases = getRelevantPhases(phaseResult.phase);

  // Run detectors for relevant phases
  const rawRecommendations = runDetectorsForPhases(relevantPhases, signals);

  // Filter and categorize
  const { immediate, available } = filterRecommendations(rawRecommendations, metadata, sessionState);

  // Auto-enabled features (existing babysit modes)
  const autoEnabled = detectAutoModes(signals);

  // Build signals summary
  const signalsSummary = {
    story: signals.story
      ? `${signals.story.id} (${signals.story.status || 'unknown'}${signals.story.owner ? ', ' + signals.story.owner : ''})`
      : 'none',
    files_changed: signals.git.filesChanged,
    core_files: (signals.git.changedFiles || []).filter(f =>
      /^(src\/(core|lib|shared)|lib\/|packages\/.*\/src\/)/.test(f)
    ).length,
    tests_passing: signals.tests.passing,
    on_feature_branch: signals.git.onFeatureBranch,
    story_counts: signals.counts,
  };

  return {
    detected_at: new Date().toISOString(),
    lifecycle_phase: phaseResult.phase,
    phase_confidence: phaseResult.confidence,
    phase_reason: phaseResult.reason,
    recommendations: {
      immediate,
      available,
      auto_enabled: autoEnabled,
    },
    signals_summary: signalsSummary,
  };
}

/**
 * Detect existing babysit auto-modes (loop, visual, coverage).
 * Preserves backward compatibility with existing Smart Detection.
 *
 * @param {Object} signals
 * @returns {Object} Auto-enabled mode flags
 */
function detectAutoModes(signals) {
  const { statusJson, story, files, packageJson } = signals;

  // Loop mode: 3+ ready stories in same epic + test setup
  let loopMode = false;
  if (story?.epic && statusJson?.stories) {
    const readyInEpic = Object.entries(statusJson.stories).filter(
      ([, s]) => s.epic === story.epic && s.status === 'ready'
    ).length;
    loopMode = readyInEpic >= 3 && !!(packageJson?.scripts?.test);
  }

  // Visual mode: UI-related story or visual e2e setup
  const visualMode = !!(files.playwright && files.screenshots);

  // Coverage mode: coverage data exists
  const coverageMode = !!files.coverage;

  return {
    loop_mode: loopMode,
    visual_mode: visualMode,
    coverage_mode: coverageMode,
  };
}

// =============================================================================
// Output
// =============================================================================

/**
 * Write recommendations to smart-detect.json.
 *
 * @param {Object} results - Analysis results from analyze()
 * @param {string} [outputPath] - Override output path
 * @returns {{ ok: boolean, error?: string }}
 */
function writeRecommendations(results, outputPath) {
  const targetPath = outputPath || path.join(process.cwd(), 'docs/09-agents/smart-detect.json');
  return safeWriteJSON(targetPath, results, { createDir: true });
}

// =============================================================================
// CLI Entry Point
// =============================================================================

if (require.main === module) {
  // Run standalone - gather our own data
  const statusJsonResult = safeReadJSON(
    path.join(process.cwd(), 'docs/09-agents/status.json'),
    { defaultValue: {} }
  );
  const sessionStateResult = safeReadJSON(
    path.join(process.cwd(), 'docs/09-agents/session-state.json'),
    { defaultValue: {} }
  );
  const metadataResult = safeReadJSON(
    path.join(process.cwd(), 'docs/00-meta/agileflow-metadata.json'),
    { defaultValue: {} }
  );

  // Build minimal prefetched structure
  const { execSync } = require('child_process');
  let gitBranch = '', gitStatus = '';
  try { gitBranch = execSync('git branch --show-current', { encoding: 'utf8' }).trim(); } catch { /* */ }
  try { gitStatus = execSync('git status --short', { encoding: 'utf8' }).trim(); } catch { /* */ }

  const prefetched = {
    json: {
      statusJson: statusJsonResult.ok ? statusJsonResult.data : {},
      sessionState: sessionStateResult.ok ? sessionStateResult.data : {},
      metadata: metadataResult.ok ? metadataResult.data : {},
    },
    git: {
      branch: gitBranch,
      status: gitStatus,
    },
  };

  const results = analyze(prefetched);
  writeRecommendations(results);

  // Output summary to stderr for visibility
  const { immediate, available } = results.recommendations;
  process.stderr.write(`Smart detect: phase=${results.lifecycle_phase}, `);
  process.stderr.write(`${immediate.length} immediate, ${available.length} available\n`);
}

module.exports = {
  analyze,
  writeRecommendations,
  extractSignals,
  filterRecommendations,
  detectAutoModes,
};
