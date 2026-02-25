/**
 * tdd-phase-manager.js - TDD Phase Tracking for AgileFlow
 *
 * Manages RED→GREEN→REFACTOR phase transitions for TDD workflow.
 * Phase state is stored in status.json story entries under `tdd_phase`.
 *
 * Phases:
 * - red: Write failing tests first (no implementation code allowed)
 * - green: Write minimal code to make tests pass
 * - refactor: Clean up code while keeping tests green
 * - complete: TDD cycle done, ready for commit
 *
 * Transitions:
 * - red → green: Requires test_status = "failing" (tests exist and fail)
 * - green → refactor: Requires test_status = "passing" (tests pass)
 * - refactor → red: Start new cycle (tests must still pass)
 * - refactor → complete: TDD done (tests must pass)
 * - any → cancelled: Exit TDD workflow
 *
 * Usage:
 *   const { startTDD, advancePhase, getPhaseInstructions } = require('./tdd-phase-manager');
 *   const result = startTDD(statusData, 'US-0042');
 *   const advance = advancePhase(statusData, 'US-0042', testStatus);
 */

'use strict';

const fs = require('fs');
const path = require('path');

// ============================================================================
// Constants
// ============================================================================

const PHASES = {
  RED: 'red',
  GREEN: 'green',
  REFACTOR: 'refactor',
  COMPLETE: 'complete',
  CANCELLED: 'cancelled',
};

const VALID_TRANSITIONS = {
  [PHASES.RED]: [PHASES.GREEN, PHASES.CANCELLED],
  [PHASES.GREEN]: [PHASES.REFACTOR, PHASES.CANCELLED],
  [PHASES.REFACTOR]: [PHASES.RED, PHASES.COMPLETE, PHASES.CANCELLED],
  [PHASES.COMPLETE]: [], // Terminal
  [PHASES.CANCELLED]: [], // Terminal
};

/**
 * Conditions required for each transition
 */
const TRANSITION_CONDITIONS = {
  [`${PHASES.RED}->${PHASES.GREEN}`]: {
    requires: 'test_status_failing',
    message: 'Tests must exist and be FAILING before moving to GREEN phase',
    hint: 'Write your failing tests first, then run /agileflow:verify to confirm they fail',
  },
  [`${PHASES.GREEN}->${PHASES.REFACTOR}`]: {
    requires: 'test_status_passing',
    message: 'Tests must be PASSING before moving to REFACTOR phase',
    hint: 'Write minimal code to make tests pass, then run /agileflow:verify',
  },
  [`${PHASES.REFACTOR}->${PHASES.RED}`]: {
    requires: 'test_status_passing',
    message: 'Tests must still be PASSING before starting a new RED cycle',
    hint: 'Ensure refactoring did not break tests',
  },
  [`${PHASES.REFACTOR}->${PHASES.COMPLETE}`]: {
    requires: 'test_status_passing',
    message: 'Tests must be PASSING to complete TDD workflow',
    hint: 'Run /agileflow:verify to confirm all tests pass',
  },
};

/**
 * Phase-specific instructions for the AI agent
 */
const PHASE_INSTRUCTIONS = {
  [PHASES.RED]: {
    emoji: '🔴',
    title: 'RED Phase - Write Failing Tests',
    rules: [
      'Write test files ONLY - do NOT write implementation code yet',
      'Tests should cover the acceptance criteria for this story',
      'Tests MUST fail when run (they test code that does not exist yet)',
      'Focus on the public API/interface - what should the code DO?',
      'Use `.skip()` for tests you plan to implement later in this cycle',
    ],
    allowed_file_patterns: [
      '**/*.test.*',
      '**/*.spec.*',
      '**/test_*',
      '**/*_test.*',
      '**/tests/**',
      '**/__tests__/**',
      '**/test/**',
      '**/spec/**',
      '**/fixtures/**',
      '**/mocks/**',
      '**/helpers/**',
    ],
    next_action: 'Run /agileflow:verify to confirm tests FAIL, then /agileflow:tdd-next to advance',
  },
  [PHASES.GREEN]: {
    emoji: '🟢',
    title: 'GREEN Phase - Make Tests Pass',
    rules: [
      'Write MINIMAL implementation code to make failing tests pass',
      'Do NOT refactor yet - focus only on making tests green',
      'Do NOT add features beyond what tests require',
      'Do NOT modify test files (except removing .skip())',
      'Simple, direct solutions - even if ugly',
    ],
    next_action: 'Run /agileflow:verify to confirm tests PASS, then /agileflow:tdd-next to advance',
  },
  [PHASES.REFACTOR]: {
    emoji: '🔵',
    title: 'REFACTOR Phase - Clean Up',
    rules: [
      'Improve code quality while keeping ALL tests green',
      'Extract functions, rename variables, reduce duplication',
      'Run tests frequently - any failure means you broke something',
      'Do NOT add new features or change behavior',
      'When satisfied, use /agileflow:tdd-next to either start new RED cycle or complete',
    ],
    next_action:
      'Run /agileflow:verify, then /agileflow:tdd-next (choose "complete" or "new cycle")',
  },
  [PHASES.COMPLETE]: {
    emoji: '✅',
    title: 'TDD Complete',
    rules: ['All tests pass', 'Code is clean', 'Ready for code review and commit'],
    next_action: 'Run code review, then commit',
  },
};

// ============================================================================
// Phase Management
// ============================================================================

/**
 * Start TDD workflow for a story
 * @param {Object} statusData - Full status.json data
 * @param {string} storyId - Story ID (e.g., 'US-0042')
 * @returns {{ success: boolean, phase: string, message: string, instructions: Object }}
 */
function startTDD(statusData, storyId) {
  if (!statusData || typeof statusData !== 'object') {
    return { success: false, phase: null, message: 'Invalid status data', instructions: null };
  }
  if (!storyId || typeof storyId !== 'string') {
    return {
      success: false,
      phase: null,
      message: `Invalid story ID: ${storyId}`,
      instructions: null,
    };
  }
  const story = statusData.stories && statusData.stories[storyId];
  if (!story) {
    return {
      success: false,
      phase: null,
      message: `Story ${storyId} not found in status.json`,
      instructions: null,
    };
  }

  // Check if already in TDD
  if (
    story.tdd_phase &&
    story.tdd_phase !== PHASES.COMPLETE &&
    story.tdd_phase !== PHASES.CANCELLED
  ) {
    return {
      success: true,
      phase: story.tdd_phase,
      message: `Story ${storyId} already in TDD ${story.tdd_phase.toUpperCase()} phase - resuming`,
      instructions: PHASE_INSTRUCTIONS[story.tdd_phase],
    };
  }

  // Set RED phase
  story.tdd_phase = PHASES.RED;
  story.tdd_started_at = new Date().toISOString();
  story.tdd_cycles = (story.tdd_cycles || 0) + 1;
  statusData.updated_at = new Date().toISOString();

  return {
    success: true,
    phase: PHASES.RED,
    message: `TDD started for ${storyId} - entering RED phase (cycle ${story.tdd_cycles})`,
    instructions: PHASE_INSTRUCTIONS[PHASES.RED],
  };
}

/**
 * Advance to the next TDD phase
 * @param {Object} statusData - Full status.json data
 * @param {string} storyId - Story ID
 * @param {string} targetPhase - Desired next phase
 * @param {Object} context - Current context
 * @param {string} context.test_status - 'passing' | 'failing' | null
 * @returns {{ success: boolean, phase: string, message: string, instructions: Object }}
 */
function advancePhase(statusData, storyId, targetPhase, context = {}) {
  if (!statusData || typeof statusData !== 'object') {
    return { success: false, phase: null, message: 'Invalid status data', instructions: null };
  }
  if (!storyId || typeof storyId !== 'string') {
    return {
      success: false,
      phase: null,
      message: `Invalid story ID: ${storyId}`,
      instructions: null,
    };
  }
  if (!targetPhase || typeof targetPhase !== 'string') {
    return {
      success: false,
      phase: null,
      message: `Invalid target phase: ${targetPhase}`,
      instructions: null,
    };
  }
  // Normalize context if null passed explicitly
  if (!context || typeof context !== 'object') {
    context = {};
  }
  const story = statusData.stories && statusData.stories[storyId];
  if (!story) {
    return {
      success: false,
      phase: null,
      message: `Story ${storyId} not found`,
      instructions: null,
    };
  }

  const currentPhase = story.tdd_phase;
  if (!currentPhase) {
    return {
      success: false,
      phase: null,
      message: `Story ${storyId} is not in TDD mode. Start with /agileflow:tdd ${storyId}`,
      instructions: null,
    };
  }

  // Validate currentPhase is a known phase (catch corrupted data)
  if (!Object.values(PHASES).includes(currentPhase)) {
    return {
      success: false,
      phase: currentPhase,
      message: `Story ${storyId} has invalid TDD phase: "${currentPhase}". Valid: ${Object.values(PHASES).join(', ')}`,
      instructions: null,
    };
  }

  // Check if transition is valid
  const validTargets = VALID_TRANSITIONS[currentPhase] || [];
  if (!validTargets.includes(targetPhase)) {
    return {
      success: false,
      phase: currentPhase,
      message: `Cannot transition from ${currentPhase.toUpperCase()} to ${targetPhase.toUpperCase()}. Valid: ${validTargets.join(', ') || 'none'}`,
      instructions: PHASE_INSTRUCTIONS[currentPhase],
    };
  }

  // Cancel is always allowed
  if (targetPhase === PHASES.CANCELLED) {
    story.tdd_phase = PHASES.CANCELLED;
    story.tdd_cancelled_at = new Date().toISOString();
    statusData.updated_at = new Date().toISOString();
    return {
      success: true,
      phase: PHASES.CANCELLED,
      message: `TDD cancelled for ${storyId}`,
      instructions: null,
    };
  }

  // Check transition conditions
  const conditionKey = `${currentPhase}->${targetPhase}`;
  const condition = TRANSITION_CONDITIONS[conditionKey];

  if (condition) {
    const { test_status } = context;

    if (condition.requires === 'test_status_failing' && test_status !== 'failing') {
      return {
        success: false,
        phase: currentPhase,
        message: `🚫 ${condition.message}`,
        hint: condition.hint,
        instructions: PHASE_INSTRUCTIONS[currentPhase],
        gate_blocked: true,
      };
    }

    if (condition.requires === 'test_status_passing' && test_status !== 'passing') {
      return {
        success: false,
        phase: currentPhase,
        message: `🚫 ${condition.message}`,
        hint: condition.hint,
        instructions: PHASE_INSTRUCTIONS[currentPhase],
        gate_blocked: true,
      };
    }
  }

  // Transition
  const previousPhase = currentPhase;
  story.tdd_phase = targetPhase;
  story.tdd_last_transition = new Date().toISOString();

  // Track cycles
  if (targetPhase === PHASES.RED && previousPhase === PHASES.REFACTOR) {
    story.tdd_cycles = (story.tdd_cycles || 0) + 1;
  }

  if (targetPhase === PHASES.COMPLETE) {
    story.tdd_completed_at = new Date().toISOString();
  }

  statusData.updated_at = new Date().toISOString();

  return {
    success: true,
    phase: targetPhase,
    message: `${previousPhase.toUpperCase()} → ${targetPhase.toUpperCase()} for ${storyId}`,
    instructions: PHASE_INSTRUCTIONS[targetPhase] || null,
  };
}

/**
 * Get current phase info for a story
 * @param {Object} statusData - Full status.json data
 * @param {string} storyId - Story ID
 * @returns {{ phase: string|null, instructions: Object|null, active: boolean }}
 */
function getPhaseInfo(statusData, storyId) {
  if (!statusData || typeof statusData !== 'object') {
    return { phase: null, instructions: null, active: false };
  }
  const story = statusData.stories && statusData.stories[storyId];
  if (!story || !story.tdd_phase) {
    return { phase: null, instructions: null, active: false };
  }

  const active = story.tdd_phase !== PHASES.COMPLETE && story.tdd_phase !== PHASES.CANCELLED;

  return {
    phase: story.tdd_phase,
    instructions: PHASE_INSTRUCTIONS[story.tdd_phase] || null,
    active,
    cycles: story.tdd_cycles || 0,
    started_at: story.tdd_started_at || null,
  };
}

/**
 * Get the next valid phases from current phase
 * @param {string} currentPhase - Current TDD phase
 * @returns {string[]} Valid next phases
 */
function getNextPhases(currentPhase) {
  return VALID_TRANSITIONS[currentPhase] || [];
}

/**
 * Format phase status for display
 * @param {Object} statusData - Full status.json data
 * @param {string} storyId - Story ID
 * @returns {string} Formatted status string
 */
function formatPhaseStatus(statusData, storyId) {
  const info = getPhaseInfo(statusData, storyId);

  if (!info.phase) {
    return `${storyId}: No TDD workflow active`;
  }

  const inst = info.instructions;
  const lines = [
    `${inst ? inst.emoji : '?'} ${storyId}: TDD ${info.phase.toUpperCase()} phase (cycle ${info.cycles})`,
  ];

  if (inst) {
    lines.push(`   ${inst.title}`);
    if (inst.next_action) {
      lines.push(`   Next: ${inst.next_action}`);
    }
  }

  return lines.join('\n');
}

// ============================================================================
// Status.json Helpers
// ============================================================================

/**
 * Load status.json from the standard path
 * @param {string} projectRoot - Project root directory
 * @returns {Object|null} Parsed status data or null
 */
function loadStatusData(projectRoot) {
  const statusPath = path.join(projectRoot, 'docs', '09-agents', 'status.json');
  try {
    const content = fs.readFileSync(statusPath, 'utf8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

/**
 * Save status.json to the standard path
 * @param {string} projectRoot - Project root directory
 * @param {Object} statusData - Status data to save
 */
function saveStatusData(projectRoot, statusData) {
  const statusPath = path.join(projectRoot, 'docs', '09-agents', 'status.json');
  fs.writeFileSync(statusPath, JSON.stringify(statusData, null, 2) + '\n', 'utf8');
}

// ============================================================================
// Exports
// ============================================================================

module.exports = {
  // Constants
  PHASES,
  VALID_TRANSITIONS,
  TRANSITION_CONDITIONS,
  PHASE_INSTRUCTIONS,

  // Phase management
  startTDD,
  advancePhase,
  getPhaseInfo,
  getNextPhases,

  // Display
  formatPhaseStatus,

  // Status.json helpers
  loadStatusData,
  saveStatusData,
};
