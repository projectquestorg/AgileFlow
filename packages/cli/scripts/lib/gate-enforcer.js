/**
 * gate-enforcer.js - Workflow Gate Enforcement for Babysit Strict Mode
 *
 * Filters AskUserQuestion options based on workflow gate status.
 * When STRICT=true in babysit, certain options are removed or blocked
 * based on whether gates have been satisfied (tests passed, review done, etc.).
 *
 * Gates:
 * - tests_passed: Must run and pass tests before commit
 * - review_done: Must run code review for 5+ source files before commit
 * - logic_audit_done: Must run logic audit before commit (advisory in non-strict)
 *
 * Usage:
 *   const { filterOptions, getGateStatus, updateGate } = require('./gate-enforcer');
 *   const filtered = filterOptions(options, gateState, { strict: true });
 */

'use strict';

// ============================================================================
// Constants
// ============================================================================

/**
 * Gate types that can block workflow progression
 */
const GATES = {
  TESTS_PASSED: 'tests_passed',
  REVIEW_DONE: 'review_done',
  LOGIC_AUDIT_DONE: 'logic_audit_done',
};

/**
 * Actions that require specific gates to be satisfied
 */
const GATE_REQUIREMENTS = {
  commit: {
    strict: [GATES.TESTS_PASSED],
    strict_5plus: [GATES.TESTS_PASSED, GATES.REVIEW_DONE],
  },
  next_story: {
    strict: [GATES.TESTS_PASSED],
  },
};

/**
 * Patterns that identify commit-related options
 */
const COMMIT_PATTERNS = [/^commit/i, /^git commit/i, /commit.*changes/i, /commit:?\s/i];

/**
 * Patterns that identify "skip" options
 */
const SKIP_PATTERNS = [/skip.*test/i, /skip.*review/i, /skip.*audit/i, /skip.*verif/i];

/**
 * Patterns that identify "next story" options
 */
const NEXT_STORY_PATTERNS = [/continue to/i, /next story/i, /move to.*US-/i];

// ============================================================================
// Gate State Management
// ============================================================================

/**
 * Create initial gate state for a workflow session
 * @param {Object} options
 * @param {number} options.filesChanged - Number of source files modified
 * @param {boolean} options.strict - Whether strict mode is enabled
 * @returns {Object} Initial gate state
 */
function createGateState(options = {}) {
  const { filesChanged = 0, strict = false } = options;

  return {
    strict,
    files_changed: filesChanged,
    gates: {
      [GATES.TESTS_PASSED]: false,
      [GATES.REVIEW_DONE]: false,
      [GATES.LOGIC_AUDIT_DONE]: false,
    },
    history: [],
    created_at: new Date().toISOString(),
  };
}

/**
 * Update a gate's status
 * @param {Object} gateState - Current gate state
 * @param {string} gate - Gate name from GATES
 * @param {boolean} passed - Whether the gate passed
 * @param {Object} metadata - Additional info (e.g., test count, review findings)
 * @returns {Object} Updated gate state
 */
function updateGate(gateState, gate, passed, metadata = {}) {
  if (!Object.values(GATES).includes(gate)) {
    throw new Error(`Unknown gate: ${gate}. Valid: ${Object.values(GATES).join(', ')}`);
  }

  const updated = {
    ...gateState,
    gates: {
      ...gateState.gates,
      [gate]: passed,
    },
    history: [
      ...gateState.history,
      {
        gate,
        passed,
        at: new Date().toISOString(),
        ...metadata,
      },
    ],
  };

  return updated;
}

/**
 * Check if all required gates for an action are satisfied
 * @param {Object} gateState - Current gate state
 * @param {string} action - Action to check ('commit', 'next_story')
 * @returns {{ allowed: boolean, missing: string[] }}
 */
function checkGates(gateState, action) {
  if (!gateState.strict) {
    return { allowed: true, missing: [] };
  }

  let requirements;
  if (action === 'commit' && gateState.files_changed >= 5) {
    requirements = GATE_REQUIREMENTS.commit.strict_5plus || [];
  } else {
    requirements = (GATE_REQUIREMENTS[action] && GATE_REQUIREMENTS[action].strict) || [];
  }

  const missing = requirements.filter(gate => !gateState.gates[gate]);

  return {
    allowed: missing.length === 0,
    missing,
  };
}

// ============================================================================
// Option Filtering
// ============================================================================

/**
 * Check if an option label matches any pattern in a list
 * @param {string} label - Option label text
 * @param {RegExp[]} patterns - Patterns to match against
 * @returns {boolean}
 */
function matchesPattern(label, patterns) {
  if (typeof label !== 'string') return false;
  return patterns.some(p => p.test(label));
}

/**
 * Filter AskUserQuestion options based on gate state
 *
 * In strict mode:
 * - Remove "commit" options if tests haven't passed
 * - Remove "commit" options if review not done (5+ files)
 * - Remove "skip tests/review/audit" options
 * - Add gate status hints to option descriptions
 *
 * In non-strict mode:
 * - Options are returned unchanged (soft guidance only)
 *
 * @param {Object[]} options - AskUserQuestion options array
 * @param {Object} gateState - Current gate state
 * @returns {Object[]} Filtered options
 */
function filterOptions(options, gateState) {
  if (!Array.isArray(options)) return [];
  if (!gateState || !gateState.strict) {
    return options;
  }

  return options
    .filter(opt => {
      const label = opt.label || '';

      // In strict mode, remove skip options entirely
      if (matchesPattern(label, SKIP_PATTERNS)) {
        return false;
      }

      // Check commit gates
      if (matchesPattern(label, COMMIT_PATTERNS)) {
        const { allowed } = checkGates(gateState, 'commit');
        if (!allowed) {
          return false;
        }
      }

      // Check next story gates
      if (matchesPattern(label, NEXT_STORY_PATTERNS)) {
        const { allowed } = checkGates(gateState, 'next_story');
        if (!allowed) {
          return false;
        }
      }

      return true;
    })
    .map(opt => {
      // Add gate status hints to descriptions
      const label = opt.label || '';

      if (matchesPattern(label, COMMIT_PATTERNS) && gateState.strict) {
        const checks = [];
        if (gateState.gates[GATES.TESTS_PASSED]) checks.push('tests passed');
        if (gateState.gates[GATES.REVIEW_DONE]) checks.push('review done');
        if (gateState.gates[GATES.LOGIC_AUDIT_DONE]) checks.push('audit done');

        if (checks.length > 0) {
          return {
            ...opt,
            description: `${opt.description || ''} [Gates: ${checks.join(', ')}]`.trim(),
          };
        }
      }

      return opt;
    });
}

/**
 * Get a human-readable gate status summary
 * @param {Object} gateState - Current gate state
 * @returns {string} Status summary
 */
function getGateStatusSummary(gateState) {
  if (!gateState || !gateState.strict) {
    return 'Strict mode: OFF (soft guidance)';
  }

  const lines = [`Strict mode: ON | ${gateState.files_changed} files changed`];

  for (const [gate, passed] of Object.entries(gateState.gates)) {
    const icon = passed ? '✅' : '⬜';
    const name = gate.replace(/_/g, ' ');
    lines.push(`  ${icon} ${name}`);
  }

  return lines.join('\n');
}

/**
 * Get blocking message for a failed gate check
 * @param {string[]} missingGates - List of unsatisfied gates
 * @returns {string} Human-readable blocking message
 */
function getBlockingMessage(missingGates) {
  const messages = {
    [GATES.TESTS_PASSED]: 'Run tests first (tests must pass before committing)',
    [GATES.REVIEW_DONE]: 'Run code review first (required for 5+ modified files)',
    [GATES.LOGIC_AUDIT_DONE]: 'Run logic audit first',
  };

  return missingGates.map(gate => `🚫 ${messages[gate] || gate}`).join('\n');
}

// ============================================================================
// Exports
// ============================================================================

module.exports = {
  // Constants
  GATES,
  GATE_REQUIREMENTS,

  // State management
  createGateState,
  updateGate,
  checkGates,

  // Option filtering
  filterOptions,
  matchesPattern,

  // Reporting
  getGateStatusSummary,
  getBlockingMessage,

  // Patterns (for testing)
  COMMIT_PATTERNS,
  SKIP_PATTERNS,
  NEXT_STORY_PATTERNS,
};
