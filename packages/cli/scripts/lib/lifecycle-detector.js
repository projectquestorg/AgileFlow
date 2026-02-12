#!/usr/bin/env node
/**
 * lifecycle-detector.js
 *
 * Determines the current workflow phase based on project signals.
 * Used by smart-detect.js to filter feature recommendations by phase.
 *
 * Phases (in order):
 *   pre-story      → No active story, selecting what to work on
 *   planning        → Story selected, planning implementation approach
 *   implementation  → Actively writing code, files changed
 *   post-impl       → Code done, reviewing/testing/documenting
 *   pre-pr          → Ready to create PR, final checks
 */

'use strict';

const PHASES = ['pre-story', 'planning', 'implementation', 'post-impl', 'pre-pr'];

/**
 * Detect the current lifecycle phase from project signals.
 *
 * @param {Object} signals - Gathered project signals
 * @param {Object} signals.story - Current story info { id, status, owner }
 * @param {Object} signals.git - Git state { branch, filesChanged, isClean, onFeatureBranch }
 * @param {Object} signals.session - Session state { planModeActive, activeCommands }
 * @param {Object} signals.tests - Test state { passing, hasTestSetup }
 * @returns {{ phase: string, confidence: number, reason: string }}
 */
function detectLifecyclePhase(signals = {}) {
  const { story: rawStory, git: rawGit, session: rawSession, tests: rawTests } = signals;
  const story = rawStory || {};
  const git = rawGit || {};
  const session = rawSession || {};
  const tests = rawTests || {};

  // Phase 5: pre-pr
  // Story in-progress, tests passing, git clean (or nearly), on feature branch
  if (
    story.status === 'in-progress' &&
    tests.passing === true &&
    git.isClean &&
    git.onFeatureBranch
  ) {
    return {
      phase: 'pre-pr',
      confidence: 0.9,
      reason: 'Tests passing, clean git, on feature branch',
    };
  }

  // Phase 4: post-impl
  // Story in-progress, tests passing (or test files exist), still has some changes
  if (story.status === 'in-progress' && tests.passing === true && git.filesChanged > 0) {
    return {
      phase: 'post-impl',
      confidence: 0.8,
      reason: 'Tests passing but uncommitted changes remain',
    };
  }

  // Phase 3: implementation
  // Story in-progress AND files changed (git status non-empty)
  if (story.status === 'in-progress' && git.filesChanged > 0) {
    return {
      phase: 'implementation',
      confidence: 0.85,
      reason: `Actively coding (${git.filesChanged} files changed)`,
    };
  }

  // Phase 2: planning
  // Story selected/in-progress but no files changed yet, OR plan mode active
  if (session.planModeActive) {
    return {
      phase: 'planning',
      confidence: 0.9,
      reason: 'Plan mode is active',
    };
  }

  if (story.status === 'in-progress' && (git.filesChanged || 0) === 0) {
    return {
      phase: 'planning',
      confidence: 0.7,
      reason: 'Story in-progress but no files changed yet',
    };
  }

  // Phase 1: pre-story (default)
  // No current story OR story is ready (not yet started)
  return {
    phase: 'pre-story',
    confidence: story.id ? 0.6 : 0.9,
    reason: story.id ? `Story ${story.id} not yet started (status: ${story.status || 'unknown'})` : 'No active story',
  };
}

/**
 * Get features relevant to a given phase.
 * Returns the set of feature categories that apply.
 *
 * @param {string} phase - Lifecycle phase name
 * @returns {string[]} Array of phase names whose features are relevant
 */
function getRelevantPhases(phase) {
  // Each phase also includes adjacent phase features (for smooth transitions)
  const phaseMap = {
    'pre-story': ['pre-story'],
    'planning': ['pre-story', 'planning'],
    'implementation': ['planning', 'implementation'],
    'post-impl': ['implementation', 'post-impl'],
    'pre-pr': ['post-impl', 'pre-pr'],
  };

  return phaseMap[phase] || ['pre-story'];
}

module.exports = {
  PHASES,
  detectLifecyclePhase,
  getRelevantPhases,
};
