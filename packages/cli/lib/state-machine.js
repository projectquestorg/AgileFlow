/**
 * state-machine.js - Generic State Machine Base Class
 *
 * Provides a reusable state machine pattern for:
 * - Story status transitions (ready → in_progress → completed)
 * - Session thread type transitions (base → parallel → fusion)
 *
 * Features:
 * - Configurable states and transitions
 * - Transition validation with clear error messages
 * - Audit trail support
 * - Force mode for admin overrides
 *
 * Usage:
 *   const { StateMachine } = require('./state-machine');
 *
 *   const storyMachine = new StateMachine({
 *     states: ['ready', 'in_progress', 'completed'],
 *     transitions: {
 *       ready: ['in_progress'],
 *       in_progress: ['completed', 'ready'],
 *       completed: [],
 *     },
 *     initial: 'ready',
 *   });
 *
 *   const result = storyMachine.transition('ready', 'in_progress');
 *   // { success: true, from: 'ready', to: 'in_progress' }
 */

/**
 * Generic State Machine
 */
class StateMachine {
  /**
   * @param {Object} config - State machine configuration
   * @param {string[]} config.states - Valid state values
   * @param {Object<string, string[]>} config.transitions - Map of state -> allowed next states
   * @param {string} [config.initial] - Initial state (first in states array if not specified)
   * @param {string} [config.name='state'] - Name for error messages (e.g., 'status', 'thread_type')
   */
  constructor(config) {
    if (!config.states || !Array.isArray(config.states) || config.states.length === 0) {
      throw new Error('StateMachine requires non-empty states array');
    }
    if (!config.transitions || typeof config.transitions !== 'object') {
      throw new Error('StateMachine requires transitions object');
    }

    this.states = config.states;
    this.transitions = config.transitions;
    this.initial = config.initial || config.states[0];
    this.name = config.name || 'state';

    // Validate that all transition targets are valid states
    for (const [from, targets] of Object.entries(this.transitions)) {
      if (!this.states.includes(from)) {
        throw new Error(`Invalid transition source state: ${from}`);
      }
      for (const to of targets) {
        if (!this.states.includes(to)) {
          throw new Error(`Invalid transition target state: ${to} (from ${from})`);
        }
      }
    }
  }

  /**
   * Check if a state is valid
   * @param {string} state - State to check
   * @returns {boolean}
   */
  isValidState(state) {
    return this.states.includes(state);
  }

  /**
   * Check if a transition is valid
   * @param {string} from - Current state
   * @param {string} to - Target state
   * @returns {boolean}
   */
  isValidTransition(from, to) {
    // Same state is always valid (no-op)
    if (from === to) {
      return true;
    }

    // Check if from state has defined transitions
    const allowed = this.transitions[from];
    if (!allowed) {
      return false;
    }

    return allowed.includes(to);
  }

  /**
   * Get valid transitions from a state
   * @param {string} from - Current state
   * @returns {string[]}
   */
  getValidTransitions(from) {
    return this.transitions[from] || [];
  }

  /**
   * Validate and perform a transition
   * @param {string} from - Current state
   * @param {string} to - Target state
   * @param {Object} [options={}] - Transition options
   * @param {boolean} [options.force=false] - Force transition even if invalid
   * @returns {{success: boolean, from: string, to: string, error?: string, forced?: boolean}}
   */
  transition(from, to, options = {}) {
    const { force = false } = options;

    // Validate target state
    if (!this.isValidState(to)) {
      return {
        success: false,
        from,
        to,
        error: `Invalid ${this.name}: "${to}". Valid values: ${this.states.join(', ')}`,
      };
    }

    // Validate source state
    if (!this.isValidState(from)) {
      return {
        success: false,
        from,
        to,
        error: `Invalid source ${this.name}: "${from}". Valid values: ${this.states.join(', ')}`,
      };
    }

    // Same state is a no-op
    if (from === to) {
      return {
        success: true,
        from,
        to,
        noop: true,
      };
    }

    // Check transition validity
    if (!force && !this.isValidTransition(from, to)) {
      const validTargets = this.getValidTransitions(from);
      return {
        success: false,
        from,
        to,
        error: `Invalid transition: ${from} → ${to}. Valid transitions from "${from}": ${validTargets.join(', ') || 'none'}`,
      };
    }

    return {
      success: true,
      from,
      to,
      forced: force && !this.isValidTransition(from, to),
    };
  }

  /**
   * Get the initial state
   * @returns {string}
   */
  getInitialState() {
    return this.initial;
  }

  /**
   * Get all valid states
   * @returns {string[]}
   */
  getStates() {
    return [...this.states];
  }

  /**
   * Get all transitions as a map
   * @returns {Object<string, string[]>}
   */
  getTransitionsMap() {
    return { ...this.transitions };
  }

  /**
   * Generate a Mermaid state diagram
   * @returns {string}
   */
  toMermaidDiagram() {
    const lines = ['stateDiagram-v2'];

    // Add initial state arrow
    lines.push(`    [*] --> ${this.initial}`);

    // Add transitions
    for (const [from, targets] of Object.entries(this.transitions)) {
      for (const to of targets) {
        lines.push(`    ${from} --> ${to}`);
      }
      // Mark terminal states
      if (targets.length === 0) {
        lines.push(`    ${from} --> [*]`);
      }
    }

    return lines.join('\n');
  }
}

// ============================================================================
// Pre-configured State Machines
// ============================================================================

/**
 * Story status state machine
 *
 * States: ready, in_progress, in_review, blocked, completed, archived
 *
 * Transitions:
 * - ready → in_progress, blocked
 * - in_progress → in_review, blocked, ready
 * - in_review → completed, in_progress, blocked
 * - blocked → ready, in_progress, in_review
 * - completed → archived, in_progress (reopened)
 * - archived → (terminal)
 */
const storyStatusMachine = new StateMachine({
  name: 'status',
  states: ['ready', 'in_progress', 'in_review', 'blocked', 'completed', 'archived'],
  transitions: {
    ready: ['in_progress', 'blocked'],
    in_progress: ['in_review', 'blocked', 'ready'],
    in_review: ['completed', 'in_progress', 'blocked'],
    blocked: ['ready', 'in_progress', 'in_review'],
    completed: ['archived', 'in_progress'],
    archived: [], // Terminal state
  },
  initial: 'ready',
});

/**
 * Session thread type state machine
 *
 * States: base, parallel, chained, fusion, big, long
 *
 * Thread Type Semantics:
 * - base: Main session in project root (default)
 * - parallel: Independent worktree session
 * - chained: Sequential dependency on another session
 * - fusion: Merged work from multiple sessions
 * - big: Large task spanning multiple sessions
 * - long: Extended session with context preservation
 *
 * Transitions:
 * - base → parallel (spawn worktree)
 * - parallel → base (merge to main), fusion (merge multiple), chained (add dependency)
 * - chained → parallel (remove dependency), fusion (complete chain)
 * - fusion → base (merge to main)
 * - big → parallel (split), fusion (consolidate)
 * - long → base (complete), parallel (split)
 */
const sessionThreadMachine = new StateMachine({
  name: 'thread_type',
  states: ['base', 'parallel', 'chained', 'fusion', 'big', 'long'],
  transitions: {
    base: ['parallel', 'big', 'long'],
    parallel: ['base', 'fusion', 'chained'],
    chained: ['parallel', 'fusion'],
    fusion: ['base'],
    big: ['parallel', 'fusion'],
    long: ['base', 'parallel'],
  },
  initial: 'base',
});

module.exports = {
  StateMachine,
  storyStatusMachine,
  sessionThreadMachine,
};
