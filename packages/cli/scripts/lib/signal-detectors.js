#!/usr/bin/env node
/**
 * signal-detectors.js
 *
 * Registry of feature detector functions for contextual feature routing.
 * Each detector analyzes project signals and returns a recommendation
 * (or null if not triggered).
 *
 * Pattern follows DISCRETION_CONDITIONS from ralph-loop.js:
 *   name -> (signals) => result | null
 *
 * Organized by lifecycle phase:
 *   pre-story, planning, implementation, post-impl, pre-pr
 */

'use strict';

// =============================================================================
// Detector Result Helpers
// =============================================================================

/**
 * Create a recommendation result.
 * @param {string} feature - Feature/command name
 * @param {Object} opts
 * @param {'high'|'medium'|'low'} opts.priority
 * @param {string} opts.trigger - Why this was triggered
 * @param {'auto'|'suggest'|'offer'} opts.action - How to present it
 * @param {string} opts.command - AgileFlow command to run
 * @param {string} opts.phase - Lifecycle phase this belongs to
 * @returns {Object} Recommendation object
 */
function recommend(feature, opts) {
  return {
    feature,
    priority: opts.priority || 'medium',
    trigger: opts.trigger,
    action: opts.action || 'suggest',
    command: opts.command || `/agileflow:${feature}`,
    phase: opts.phase,
  };
}

// =============================================================================
// Signal Extraction Helpers
// =============================================================================

function getStoriesByStatus(statusJson, status) {
  if (!statusJson || !statusJson.stories) return [];
  return Object.entries(statusJson.stories)
    .filter(([, s]) => s.status === status)
    .map(([id, s]) => ({ id, ...s }));
}

function getStoriesForEpic(statusJson, epicId) {
  if (!statusJson || !statusJson.stories) return [];
  return Object.entries(statusJson.stories)
    .filter(([, s]) => s.epic === epicId)
    .map(([id, s]) => ({ id, ...s }));
}

function hasPackageScript(packageJson, scriptName) {
  return !!(packageJson && packageJson.scripts && packageJson.scripts[scriptName]);
}

function storyHasAC(story) {
  return !!(
    story &&
    story.acceptance_criteria &&
    Array.isArray(story.acceptance_criteria) &&
    story.acceptance_criteria.length > 0
  );
}

function storyMentions(story, keywords) {
  if (!story) return false;
  const text = `${story.title || ''} ${story.description || ''}`.toLowerCase();
  return keywords.some(kw => text.includes(kw.toLowerCase()));
}

// =============================================================================
// FEATURE DETECTORS - Organized by Lifecycle Phase
// =============================================================================

/**
 * @typedef {Object} Signals
 * @property {Object} statusJson - Parsed status.json
 * @property {Object} sessionState - Parsed session-state.json
 * @property {Object} metadata - Parsed agileflow-metadata.json
 * @property {Object} git - Git signals { branch, filesChanged, isClean, onFeatureBranch, diffStats }
 * @property {Object} packageJson - Parsed package.json
 * @property {Object} story - Current story { id, status, title, owner, epic, acceptance_criteria }
 * @property {Object} files - File existence checks { tsconfig, eslintrc, coverage, playwright, screenshots }
 * @property {number} storyCount - Total stories in status.json
 * @property {Object} counts - Story counts by status { ready, 'in-progress', blocked, done }
 */

const FEATURE_DETECTORS = {
  // =========================================================================
  // PRE-STORY PHASE
  // =========================================================================

  'story-validate': signals => {
    const { story } = signals;
    if (!story || !story.id) return null;
    if (story.status !== 'ready' && story.status !== 'in-progress') return null;
    if (!storyHasAC(story)) {
      return recommend('story-validate', {
        priority: 'high',
        trigger: `Story ${story.id} missing acceptance criteria`,
        action: 'suggest',
        phase: 'pre-story',
      });
    }
    return null;
  },

  blockers: signals => {
    const blocked = getStoriesByStatus(signals.statusJson, 'blocked');
    if (blocked.length === 0) return null;
    return recommend('blockers', {
      priority: 'high',
      trigger: `${blocked.length} blocked story(ies)`,
      action: 'suggest',
      phase: 'pre-story',
    });
  },

  choose: signals => {
    const { story, counts } = signals;
    if (story && story.id) return null; // Already have a story
    if ((counts.ready || 0) < 2) return null;
    return recommend('choose', {
      priority: 'medium',
      trigger: `${counts.ready} ready stories - use AI to pick the best one`,
      action: 'offer',
      phase: 'pre-story',
    });
  },

  assign: signals => {
    const ready = getStoriesByStatus(signals.statusJson, 'ready');
    const unassigned = ready.filter(s => !s.owner);
    if (unassigned.length === 0) return null;
    return recommend('assign', {
      priority: 'low',
      trigger: `${unassigned.length} ready stories without owner`,
      action: 'offer',
      phase: 'pre-story',
    });
  },

  board: signals => {
    const { storyCount } = signals;
    if (!storyCount || storyCount < 5) return null;
    return recommend('board', {
      priority: 'low',
      trigger: `${storyCount} stories tracked - visual board available`,
      action: 'offer',
      phase: 'pre-story',
    });
  },

  sprint: signals => {
    const { counts } = signals;
    if ((counts.ready || 0) < 3) return null;
    return recommend('sprint', {
      priority: 'low',
      trigger: `${counts.ready} ready stories - sprint planning available`,
      action: 'offer',
      phase: 'pre-story',
    });
  },

  batch: signals => {
    const ready = getStoriesByStatus(signals.statusJson, 'ready');
    if (ready.length < 5) return null;
    // Check if stories share same epic (good batch candidate)
    const epicGroups = {};
    ready.forEach(s => {
      const ep = s.epic || 'none';
      epicGroups[ep] = (epicGroups[ep] || 0) + 1;
    });
    const epicGroupCounts = Object.values(epicGroups);
    if (epicGroupCounts.length === 0) return null;
    const maxGroup = Math.max(...epicGroupCounts);
    if (maxGroup < 3) return null;
    return recommend('batch', {
      priority: 'medium',
      trigger: `${maxGroup} ready stories in same epic - batch processing available`,
      action: 'offer',
      phase: 'pre-story',
    });
  },

  workflow: signals => {
    const { metadata } = signals;
    const workflows = metadata?.workflows;
    if (!workflows || Object.keys(workflows).length === 0) return null;
    return recommend('workflow', {
      priority: 'low',
      trigger: `${Object.keys(workflows).length} workflow template(s) configured`,
      action: 'offer',
      phase: 'pre-story',
    });
  },

  template: signals => {
    const { story } = signals;
    if (!story || story.status !== 'ready') return null;
    if (!story.title) return null;
    // Suggest template if story is a new doc/pattern type
    if (storyMentions(story, ['template', 'boilerplate', 'scaffold', 'generator'])) {
      return recommend('template', {
        priority: 'low',
        trigger: `Story mentions template/scaffold patterns`,
        action: 'offer',
        phase: 'pre-story',
      });
    }
    return null;
  },

  configure: signals => {
    const { metadata } = signals;
    // Only suggest if metadata is minimal/missing
    if (metadata && Object.keys(metadata).length > 3) return null;
    return recommend('configure', {
      priority: 'low',
      trigger: 'Minimal AgileFlow configuration detected',
      action: 'offer',
      phase: 'pre-story',
    });
  },

  // =========================================================================
  // PLANNING PHASE
  // =========================================================================

  impact: signals => {
    const { git, story } = signals;
    if (!story || story.status !== 'in-progress') return null;
    // Suggest impact analysis if touching core/shared files
    const coreFilesChanged = (git.changedFiles || []).filter(f =>
      /^(src\/(core|lib|shared)|lib\/|packages\/.*\/src\/)/.test(f)
    ).length;
    if (coreFilesChanged < (signals.thresholds?.impact_min_files || 3)) return null;
    return recommend('impact', {
      priority: 'high',
      trigger: `${coreFilesChanged} core/shared files being modified`,
      action: 'suggest',
      phase: 'planning',
    });
  },

  adr: signals => {
    const { story } = signals;
    if (!story || !story.id) return null;
    if (
      storyMentions(story, [
        'architecture',
        'redesign',
        'migrate',
        'replace',
        'new system',
        'framework',
      ])
    ) {
      return recommend('adr', {
        priority: 'medium',
        trigger: 'Story involves architectural decisions',
        action: 'suggest',
        command: '/agileflow:adr',
        phase: 'planning',
      });
    }
    return null;
  },

  research: signals => {
    const { story } = signals;
    if (!story || !story.id) return null;
    if (
      storyMentions(story, [
        'research',
        'investigate',
        'evaluate',
        'compare',
        'POC',
        'proof of concept',
        'spike',
      ])
    ) {
      return recommend('research', {
        priority: 'medium',
        trigger: 'Story involves research/investigation',
        action: 'suggest',
        command: '/agileflow:research:ask',
        phase: 'planning',
      });
    }
    return null;
  },

  baseline: signals => {
    const { story, files } = signals;
    if (!story || story.status !== 'in-progress') return null;
    if (!files.coverage) return null;
    // Only suggest baseline at start of work (planning phase)
    return recommend('baseline', {
      priority: 'medium',
      trigger: 'Coverage data exists - mark baseline before changes',
      action: 'offer',
      phase: 'planning',
    });
  },

  council: signals => {
    const { story } = signals;
    if (!story || !story.id) return null;
    if (storyMentions(story, ['strategic', 'trade-off', 'decision', 'approach', 'architecture'])) {
      return recommend('council', {
        priority: 'low',
        trigger: 'Story involves strategic decision-making',
        action: 'offer',
        phase: 'planning',
      });
    }
    return null;
  },

  'multi-expert': signals => {
    const { story } = signals;
    if (!story || !story.id) return null;
    if (storyMentions(story, ['complex', 'cross-cutting', 'full-stack', 'multi-domain'])) {
      return recommend('multi-expert', {
        priority: 'low',
        trigger: 'Story involves multiple domains',
        action: 'offer',
        phase: 'planning',
      });
    }
    return null;
  },

  'validate-expertise': signals => {
    const { files } = signals;
    if (!files.expertiseDir) return null;
    return recommend('validate-expertise', {
      priority: 'low',
      trigger: 'Expertise files exist - validate for drift',
      action: 'offer',
      phase: 'planning',
    });
  },

  // =========================================================================
  // IMPLEMENTATION PHASE
  // =========================================================================

  verify: signals => {
    const { story, tests, git } = signals;
    if (!story || story.status !== 'in-progress') return null;
    if ((git.filesChanged || 0) === 0) return null;
    if (tests.passing === false) {
      return recommend('verify', {
        priority: 'high',
        trigger: 'Tests are failing',
        action: 'suggest',
        phase: 'implementation',
      });
    }
    return null;
  },

  tests: signals => {
    const { story, files, packageJson } = signals;
    if (!story || story.status !== 'in-progress') return null;
    if (!hasPackageScript(packageJson, 'test')) {
      return recommend('tests', {
        priority: 'medium',
        trigger: 'No test script found - set up testing infrastructure',
        action: 'suggest',
        phase: 'implementation',
      });
    }
    return null;
  },

  audit: signals => {
    const { story, git } = signals;
    if (!story || story.status !== 'in-progress') return null;
    if ((git.filesChanged || 0) < 5) return null;
    return recommend('audit', {
      priority: 'medium',
      trigger: `${git.filesChanged} files changed - audit story completion`,
      action: 'offer',
      command: '/agileflow:audit',
      phase: 'implementation',
    });
  },

  ci: signals => {
    const { files } = signals;
    if (files.ciConfig) return null; // Already has CI
    return recommend('ci', {
      priority: 'low',
      trigger: 'No CI configuration detected',
      action: 'offer',
      phase: 'implementation',
    });
  },

  deps: signals => {
    const { packageJson } = signals;
    if (!packageJson) return null;
    // Check for outdated or vulnerable deps signal
    const depCount =
      Object.keys(packageJson.dependencies || {}).length +
      Object.keys(packageJson.devDependencies || {}).length;
    if (depCount < 10) return null;
    return recommend('deps', {
      priority: 'low',
      trigger: `${depCount} dependencies - dependency graph available`,
      action: 'offer',
      phase: 'implementation',
    });
  },

  diagnose: signals => {
    const { sessionState } = signals;
    // Detect if there have been recent errors or stuck patterns
    const failCount = sessionState?.failure_count || 0;
    if (failCount < 2) return null;
    return recommend('diagnose', {
      priority: 'high',
      trigger: `${failCount} recent failures detected - run diagnostics`,
      action: 'suggest',
      phase: 'implementation',
    });
  },

  debt: signals => {
    const { story } = signals;
    if (!story || !story.id) return null;
    if (storyMentions(story, ['refactor', 'cleanup', 'tech debt', 'legacy', 'deprecat'])) {
      return recommend('debt', {
        priority: 'medium',
        trigger: 'Story involves technical debt work',
        action: 'offer',
        phase: 'implementation',
      });
    }
    return null;
  },

  maintain: signals => {
    const { story } = signals;
    if (!story || !story.id) return null;
    if (storyMentions(story, ['maintenance', 'update', 'upgrade', 'patch', 'housekeeping'])) {
      return recommend('maintain', {
        priority: 'low',
        trigger: 'Story involves maintenance work',
        action: 'offer',
        phase: 'implementation',
      });
    }
    return null;
  },

  packages: signals => {
    const { story } = signals;
    if (!story || !story.id) return null;
    if (
      storyMentions(story, [
        'dependency',
        'dependencies',
        'package',
        'upgrade',
        'npm',
        'vulnerability',
      ])
    ) {
      return recommend('packages', {
        priority: 'medium',
        trigger: 'Story involves dependency management',
        action: 'offer',
        phase: 'implementation',
      });
    }
    return null;
  },

  deploy: signals => {
    const { story } = signals;
    if (!story || !story.id) return null;
    if (storyMentions(story, ['deploy', 'deployment', 'CD', 'pipeline', 'staging', 'production'])) {
      return recommend('deploy', {
        priority: 'medium',
        trigger: 'Story involves deployment',
        action: 'offer',
        phase: 'implementation',
      });
    }
    return null;
  },

  serve: signals => {
    const { metadata } = signals;
    const dashboardEnabled = metadata?.features?.dashboard?.enabled;
    if (!dashboardEnabled) return null;
    return recommend('serve', {
      priority: 'low',
      trigger: 'Dashboard server available',
      action: 'offer',
      phase: 'implementation',
    });
  },

  // =========================================================================
  // POST-IMPLEMENTATION PHASE
  // =========================================================================

  review: signals => {
    const { git, story } = signals;
    if (!story || story.status !== 'in-progress') return null;
    const linesChanged = (git.diffStats?.insertions || 0) + (git.diffStats?.deletions || 0);
    if (linesChanged < (signals.thresholds?.review_min_lines || 100)) return null;
    return recommend('review', {
      priority: 'high',
      trigger: `${linesChanged} lines changed - code review recommended`,
      action: 'suggest',
      phase: 'post-impl',
    });
  },

  'logic-audit': signals => {
    const { git, story } = signals;
    if (!story || story.status !== 'in-progress') return null;
    // Suggest logic audit for complex changes
    const coreFiles = (git.changedFiles || []).filter(f =>
      /\.(js|ts|jsx|tsx|py|go|rs)$/.test(f)
    ).length;
    if (coreFiles < 3) return null;
    return recommend('logic-audit', {
      priority: 'medium',
      trigger: `${coreFiles} source files modified - logic audit available`,
      action: 'offer',
      command: '/agileflow:logic:audit',
      phase: 'post-impl',
    });
  },

  docs: signals => {
    const { git, story } = signals;
    if (!story || story.status !== 'in-progress') return null;
    // Detect API or public interface changes
    const apiFiles = (git.changedFiles || []).filter(f =>
      /\b(api|route|endpoint|handler|controller|schema)\b/i.test(f)
    ).length;
    if (apiFiles === 0) return null;
    return recommend('docs', {
      priority: 'medium',
      trigger: `${apiFiles} API/interface files changed - docs sync recommended`,
      action: 'suggest',
      phase: 'post-impl',
    });
  },

  changelog: signals => {
    const { git } = signals;
    // Suggest changelog if there are multiple commits on feature branch
    if (!git.onFeatureBranch) return null;
    if ((git.commitCount || 0) < 3) return null;
    return recommend('changelog', {
      priority: 'low',
      trigger: `${git.commitCount} commits on feature branch - changelog entry recommended`,
      action: 'offer',
      phase: 'post-impl',
    });
  },

  metrics: signals => {
    const { statusJson } = signals;
    if (!statusJson || !statusJson.stories) return null;
    const doneCount = getStoriesByStatus(statusJson, 'done').length;
    if (doneCount < 5) return null;
    return recommend('metrics', {
      priority: 'low',
      trigger: `${doneCount} completed stories - metrics dashboard available`,
      action: 'offer',
      phase: 'post-impl',
    });
  },

  retro: signals => {
    const { statusJson } = signals;
    if (!statusJson || !statusJson.epics) return null;
    // Suggest retro when an epic is mostly complete
    const epics = statusJson.epics || {};
    for (const [epId, ep] of Object.entries(epics)) {
      if (!ep) continue;
      if (ep.status === 'done' || ep.progress >= 90) {
        return recommend('retro', {
          priority: 'medium',
          trigger: `Epic ${epId} is ${ep.status === 'done' ? 'complete' : `${ep.progress ?? 0}% done`} - retrospective recommended`,
          action: 'offer',
          phase: 'post-impl',
        });
      }
    }
    return null;
  },

  velocity: signals => {
    const { statusJson } = signals;
    if (!statusJson || !statusJson.stories) return null;
    const doneCount = getStoriesByStatus(statusJson, 'done').length;
    if (doneCount < 10) return null;
    return recommend('velocity', {
      priority: 'low',
      trigger: `${doneCount} completed stories - velocity tracking available`,
      action: 'offer',
      phase: 'post-impl',
    });
  },

  'readme-sync': signals => {
    const { git } = signals;
    // Check if any README files were potentially affected
    const readmeAffected = (git.changedFiles || []).some(
      f => /readme/i.test(f) || /^(src|packages|apps)\/[^/]+\//.test(f)
    );
    if (!readmeAffected) return null;
    return recommend('readme-sync', {
      priority: 'low',
      trigger: 'Structural changes detected - README sync available',
      action: 'offer',
      phase: 'post-impl',
    });
  },

  feedback: signals => {
    const { sessionState } = signals;
    // Suggest feedback collection after extended sessions
    const sessionDuration = sessionState?.current_session?.started_at
      ? Math.round(
          (Date.now() - new Date(sessionState.current_session.started_at).getTime()) / 60000
        )
      : 0;
    if (isNaN(sessionDuration) || sessionDuration < 30) return null;
    return recommend('feedback', {
      priority: 'low',
      trigger: `${sessionDuration}min session - consider capturing feedback`,
      action: 'offer',
      phase: 'post-impl',
    });
  },

  // =========================================================================
  // PRE-PR PHASE
  // =========================================================================

  pr: signals => {
    const { git, tests, story } = signals;
    if (!story || story.status !== 'in-progress') return null;
    if (!git.onFeatureBranch) return null;
    if (tests.passing !== true) return null;
    return recommend('pr', {
      priority: 'high',
      trigger: 'Tests passing on feature branch - ready for PR',
      action: 'suggest',
      phase: 'pre-pr',
    });
  },

  compress: signals => {
    const { statusJson } = signals;
    if (!statusJson || !statusJson.stories) return null;
    const totalStories = Object.keys(statusJson.stories).length;
    if (totalStories < (signals.thresholds?.compress_min_stories || 100)) return null;
    return recommend('compress', {
      priority: 'medium',
      trigger: `${totalStories} stories in status.json - compression recommended`,
      action: 'suggest',
      phase: 'pre-pr',
    });
  },
};

// =============================================================================
// Phase Mapping (which detectors belong to which phase)
// =============================================================================

const PHASE_MAP = {
  'pre-story': [
    'story-validate',
    'blockers',
    'choose',
    'assign',
    'board',
    'sprint',
    'batch',
    'workflow',
    'template',
    'configure',
  ],
  planning: [
    'impact',
    'adr',
    'research',
    'baseline',
    'council',
    'multi-expert',
    'validate-expertise',
  ],
  implementation: [
    'verify',
    'tests',
    'audit',
    'ci',
    'deps',
    'diagnose',
    'debt',
    'maintain',
    'packages',
    'deploy',
    'serve',
  ],
  'post-impl': [
    'review',
    'logic-audit',
    'docs',
    'changelog',
    'metrics',
    'retro',
    'velocity',
    'readme-sync',
    'feedback',
  ],
  'pre-pr': ['pr', 'compress'],
};

/**
 * Get all detector names.
 * @returns {string[]}
 */
function getDetectorNames() {
  return Object.keys(FEATURE_DETECTORS);
}

/**
 * Get detectors for a specific phase.
 * @param {string} phase
 * @returns {string[]}
 */
function getDetectorsForPhase(phase) {
  return PHASE_MAP[phase] || [];
}

/**
 * Run a single detector by name.
 * @param {string} name - Detector name
 * @param {Signals} signals - Project signals
 * @returns {Object|null} Recommendation or null
 */
function runDetector(name, signals) {
  const detector = FEATURE_DETECTORS[name];
  if (!detector) return null;
  try {
    return detector(signals);
  } catch {
    return null;
  }
}

/**
 * Run all detectors for given phases.
 * @param {string[]} phases - Array of phase names
 * @param {Signals} signals - Project signals
 * @returns {Object[]} Array of recommendations
 */
function runDetectorsForPhases(phases, signals) {
  const results = [];
  const seen = new Set();

  for (const phase of phases) {
    const detectorNames = PHASE_MAP[phase] || [];
    for (const name of detectorNames) {
      if (seen.has(name)) continue;
      seen.add(name);
      const result = runDetector(name, signals);
      if (result) {
        results.push(result);
      }
    }
  }

  return results;
}

/**
 * Run all detectors (all phases).
 * @param {Signals} signals - Project signals
 * @returns {Object[]} Array of all triggered recommendations
 */
function runAllDetectors(signals) {
  const results = [];
  for (const [name, detector] of Object.entries(FEATURE_DETECTORS)) {
    try {
      const result = detector(signals);
      if (result) {
        results.push(result);
      }
    } catch {
      // Skip failed detectors
    }
  }
  return results;
}

module.exports = {
  FEATURE_DETECTORS,
  PHASE_MAP,
  recommend,
  getDetectorNames,
  getDetectorsForPhase,
  runDetector,
  runDetectorsForPhases,
  runAllDetectors,
  // Helpers exported for testing
  getStoriesByStatus,
  getStoriesForEpic,
  hasPackageScript,
  storyHasAC,
  storyMentions,
};
