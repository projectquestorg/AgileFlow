#!/usr/bin/env node
/**
 * feature-catalog.js
 *
 * Static catalog of all major AgileFlow features with descriptions,
 * usage hints, and dynamic status computation.
 *
 * Solves the "invisible features" problem: when smart-detect detectors
 * don't trigger, features vanish from the AI's context. This catalog
 * ensures the AI always knows what's available.
 *
 * Usage:
 *   const { FEATURE_CATALOG, buildCatalogWithStatus } = require('./feature-catalog');
 *   const catalog = buildCatalogWithStatus(signals, recommendations, autoEnabled, metadata);
 */

'use strict';

// =============================================================================
// Static Feature Catalog
// =============================================================================

/**
 * All major AgileFlow features organized by category.
 *
 * Fields:
 *   feature     - Unique key (matches detector/command names)
 *   name        - Human-readable display name
 *   description - What it does (1 sentence)
 *   how_to_use  - Command or trigger hint
 *   category    - Grouping: modes | collaboration | workflow | analysis | automation
 *   detector    - Name of signal detector that triggers this (null if none)
 *   auto_mode   - Key in auto_enabled that maps to this feature (null if none)
 *   prerequisites - Lightweight prereq checks as { signal_path, description } or null
 */
const FEATURE_CATALOG = [
  // --- modes ---
  {
    feature: 'loop-mode',
    name: 'Loop Mode',
    description: 'Auto-claim and implement multiple stories in sequence without pausing',
    how_to_use: '3+ ready stories in same epic + test setup',
    category: 'modes',
    detector: null,
    auto_mode: 'loop_mode',
    prerequisites: [
      { signal_path: 'story.epic', description: 'Active story with epic' },
      { signal_path: 'tests.hasTestSetup', description: 'Test setup configured' },
    ],
  },
  {
    feature: 'coverage-mode',
    name: 'Coverage Mode',
    description: 'Track and enforce code coverage thresholds during implementation',
    how_to_use: 'Coverage data in coverage/coverage-summary.json',
    category: 'modes',
    detector: null,
    auto_mode: 'coverage_mode',
    prerequisites: [{ signal_path: 'files.coverage', description: 'Coverage summary exists' }],
  },

  // --- collaboration ---
  {
    feature: 'agent-teams',
    name: 'Agent Teams',
    description: 'Coordinate multiple specialized agents working in parallel on complex tasks',
    how_to_use: '/agileflow:team:start <template>',
    category: 'collaboration',
    detector: null,
    auto_mode: null,
    prerequisites: null,
  },
  {
    feature: 'council',
    name: 'AI Council',
    description: 'Three-perspective decision making: Optimist, Advocate, and Analyst',
    how_to_use: '/agileflow:council "<decision>"',
    category: 'collaboration',
    detector: null,
    auto_mode: null,
    prerequisites: null,
  },
  {
    feature: 'multi-expert',
    name: 'Multi-Expert',
    description: 'Deploy 3-5 domain experts on the same problem and synthesize results',
    how_to_use: '/agileflow:multi-expert "<question>"',
    category: 'collaboration',
    detector: null,
    auto_mode: null,
    prerequisites: null,
  },
  {
    feature: 'sessions',
    name: 'Parallel Sessions',
    description: 'Run multiple Claude instances in git worktrees for parallel development',
    how_to_use: '/agileflow:session:new <name>',
    category: 'collaboration',
    detector: null,
    auto_mode: null,
    prerequisites: null,
  },

  // --- workflow ---
  {
    feature: 'rpi',
    name: 'RPI Workflow',
    description: 'Structured Research-Plan-Implement cycle with phase gates',
    how_to_use: '/agileflow:rpi "<feature>"',
    category: 'workflow',
    detector: null,
    auto_mode: null,
    prerequisites: null,
  },
  {
    feature: 'discovery',
    name: 'Discovery',
    description: 'Brainstorm, research, and synthesize findings into a Product Brief',
    how_to_use: '/agileflow:ideate:discover "<topic>"',
    category: 'workflow',
    detector: null,
    auto_mode: null,
    prerequisites: null,
  },
  {
    feature: 'batch',
    name: 'Batch Processing',
    description: 'Process multiple items with map/pmap/filter patterns',
    how_to_use: '/agileflow:batch <pattern> <items>',
    category: 'workflow',
    detector: null,
    auto_mode: null,
    prerequisites: null,
  },
  {
    feature: 'sprint',
    name: 'Sprint Planning',
    description: 'Data-driven sprint planning with velocity forecasting',
    how_to_use: '/agileflow:sprint',
    category: 'workflow',
    detector: null,
    auto_mode: null,
    prerequisites: [{ signal_path: 'storyCount', description: 'Stories exist in status.json' }],
  },

  // --- analysis ---
  {
    feature: 'research',
    name: 'Research',
    description: 'Generate research prompts, save notes, and maintain a research index',
    how_to_use: '/agileflow:research:ask "<question>"',
    category: 'analysis',
    detector: null,
    auto_mode: null,
    prerequisites: null,
  },
  {
    feature: 'impact-analysis',
    name: 'Impact Analysis',
    description: 'Analyze change impact across the codebase before making modifications',
    how_to_use: '/agileflow:impact "<change>"',
    category: 'analysis',
    detector: 'impact',
    auto_mode: null,
    prerequisites: null,
  },
  {
    feature: 'logic-audit',
    name: 'Logic Audit',
    description: 'Multi-agent analysis for edge cases, race conditions, type bugs, and dead code',
    how_to_use: '/agileflow:code:logic',
    category: 'analysis',
    detector: null,
    auto_mode: null,
    prerequisites: null,
  },
  {
    feature: 'completeness-audit',
    name: 'Completeness Audit',
    description:
      'Multi-agent analysis for forgotten features, dead handlers, stub code, and incomplete implementations',
    how_to_use: '/agileflow:code:completeness',
    category: 'analysis',
    detector: null,
    auto_mode: null,
    prerequisites: null,
  },
  {
    feature: 'diagnose',
    name: 'Diagnose',
    description: 'System health diagnostics for hooks, config, and runtime issues',
    how_to_use: '/agileflow:diagnose',
    category: 'analysis',
    detector: null,
    auto_mode: null,
    prerequisites: null,
  },

  // --- testing ---
  {
    feature: 'browser-qa',
    name: 'UI Testing (Bowser)',
    description:
      'Agentic browser testing + visual verification during development. Playwright-based screenshot evidence and workflow validation.',
    how_to_use: '/agileflow:browser-qa SCENARIO=<spec.yaml> or VISUAL=true on babysit',
    category: 'testing',
    detector: null,
    auto_mode: 'browser_qa_mode',
    prerequisites: [{ signal_path: 'files.playwright', description: 'Playwright config exists' }],
  },

  // --- automation ---
  {
    feature: 'ideation',
    name: 'Ideation',
    description: 'Generate categorized improvement ideas using multi-expert analysis',
    how_to_use: '/agileflow:ideate:new',
    category: 'automation',
    detector: null,
    auto_mode: null,
    prerequisites: null,
  },
];

// Valid categories for validation
const VALID_CATEGORIES = [
  'modes',
  'collaboration',
  'workflow',
  'analysis',
  'testing',
  'automation',
];

// Valid statuses
const VALID_STATUSES = ['triggered', 'available', 'unavailable', 'disabled'];

// =============================================================================
// Status Computation
// =============================================================================

/**
 * Resolve a dot-path signal (e.g. 'story.epic') against the signals object.
 * Returns the value at that path, or undefined if any segment is missing.
 */
function resolveSignalPath(signals, dotPath) {
  const parts = dotPath.split('.');
  let current = signals;
  for (const part of parts) {
    if (current == null || typeof current !== 'object') return undefined;
    current = current[part];
  }
  return current;
}

/**
 * Check if all prerequisites are met for a feature.
 * Returns true if prerequisites is null (no requirements) or all paths are truthy.
 */
function checkPrerequisites(signals, prerequisites) {
  if (!prerequisites || prerequisites.length === 0) return true;
  return prerequisites.every(prereq => {
    const value = resolveSignalPath(signals, prereq.signal_path);
    return !!value;
  });
}

/**
 * Build the feature catalog with dynamic status for each entry.
 *
 * Status logic:
 *   1. If feature is in metadata.smart_detect.disabled_features -> 'disabled'
 *   2. If feature's auto_mode key is truthy in autoEnabled -> 'triggered'
 *   3. If feature's detector triggered (in recommendations) -> 'triggered'
 *   4. If prerequisites all met -> 'available'
 *   5. Otherwise -> 'unavailable'
 *
 * @param {Object} signals - Extracted signals from smart-detect
 * @param {{ immediate: Object[], available: Object[] }} recommendations - Filtered recommendations
 * @param {Object} autoEnabled - Auto-enabled mode flags (loop_mode, visual_mode, etc.)
 * @param {Object} metadata - AgileFlow metadata (for disabled_features)
 * @returns {Object[]} Catalog entries with 'status' field added
 */
function buildCatalogWithStatus(signals, recommendations, autoEnabled, metadata) {
  const disabledFeatures = new Set(metadata?.smart_detect?.disabled_features || []);

  // Collect all triggered feature names from recommendations
  const triggeredFeatures = new Set();
  const allRecs = [...(recommendations?.immediate || []), ...(recommendations?.available || [])];
  for (const rec of allRecs) {
    triggeredFeatures.add(rec.feature);
  }

  // Collect auto-enabled mode keys that are truthy
  const autoEnabledKeys = new Set();
  if (autoEnabled) {
    for (const [key, value] of Object.entries(autoEnabled)) {
      if (value) autoEnabledKeys.add(key);
    }
  }

  return FEATURE_CATALOG.map(entry => {
    let status;

    if (disabledFeatures.has(entry.feature)) {
      status = 'disabled';
    } else if (entry.auto_mode && autoEnabledKeys.has(entry.auto_mode)) {
      status = 'triggered';
    } else if (
      triggeredFeatures.has(entry.feature) ||
      (entry.detector && triggeredFeatures.has(entry.detector))
    ) {
      status = 'triggered';
    } else if (checkPrerequisites(signals, entry.prerequisites)) {
      status = 'available';
    } else {
      status = 'unavailable';
    }

    return { ...entry, status };
  });
}

module.exports = {
  FEATURE_CATALOG,
  VALID_CATEGORIES,
  VALID_STATUSES,
  buildCatalogWithStatus,
  // Exported for testing
  resolveSignalPath,
  checkPrerequisites,
};
