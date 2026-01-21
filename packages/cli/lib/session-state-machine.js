/**
 * Session State Machine
 *
 * Provides type-safe state transitions for AgileFlow sessions.
 * Enforces valid state changes and emits events on transitions.
 *
 * States:
 * - idle: Session created but not started
 * - active: Session is running
 * - paused: Session temporarily suspended
 * - terminated: Session has ended
 *
 * Valid Transitions:
 * - idle → active (start)
 * - active → paused (pause)
 * - active → terminated (stop)
 * - paused → active (resume)
 * - paused → terminated (stop)
 *
 * Usage:
 *   const { SessionStateMachine, SessionState } = require('./session-state-machine');
 *
 *   const sm = new SessionStateMachine('idle');
 *   sm.on('transition', ({ from, to, action }) => {
 *     console.log(`Transition: ${from} -[${action}]-> ${to}`);
 *   });
 *
 *   sm.canTransition('start');  // true
 *   sm.transition('start');     // State is now 'active'
 */

'use strict';

const EventEmitter = require('events');

/**
 * Valid session states
 * @enum {string}
 */
const SessionState = Object.freeze({
  IDLE: 'idle',
  ACTIVE: 'active',
  PAUSED: 'paused',
  TERMINATED: 'terminated',
});

/**
 * Valid state transition actions
 * @enum {string}
 */
const SessionAction = Object.freeze({
  START: 'start',
  PAUSE: 'pause',
  RESUME: 'resume',
  STOP: 'stop',
  RESTART: 'restart',
});

/**
 * State transition table
 * Maps current state → action → next state
 */
const TRANSITIONS = Object.freeze({
  [SessionState.IDLE]: {
    [SessionAction.START]: SessionState.ACTIVE,
  },
  [SessionState.ACTIVE]: {
    [SessionAction.PAUSE]: SessionState.PAUSED,
    [SessionAction.STOP]: SessionState.TERMINATED,
    [SessionAction.RESTART]: SessionState.ACTIVE, // Self-transition for restart
  },
  [SessionState.PAUSED]: {
    [SessionAction.RESUME]: SessionState.ACTIVE,
    [SessionAction.STOP]: SessionState.TERMINATED,
  },
  [SessionState.TERMINATED]: {
    // No transitions out of terminated (final state)
  },
});

/**
 * Get all valid states
 * @returns {string[]}
 */
function getValidStates() {
  return Object.values(SessionState);
}

/**
 * Get all valid actions
 * @returns {string[]}
 */
function getValidActions() {
  return Object.values(SessionAction);
}

/**
 * Check if a state is valid
 * @param {string} state
 * @returns {boolean}
 */
function isValidState(state) {
  return getValidStates().includes(state);
}

/**
 * Check if an action is valid
 * @param {string} action
 * @returns {boolean}
 */
function isValidAction(action) {
  return getValidActions().includes(action);
}

/**
 * Get valid transitions from a state
 * @param {string} state - Current state
 * @returns {Object} Map of action → next state
 */
function getTransitionsFromState(state) {
  return TRANSITIONS[state] || {};
}

/**
 * Get available actions from a state
 * @param {string} state - Current state
 * @returns {string[]} Available actions
 */
function getAvailableActions(state) {
  return Object.keys(getTransitionsFromState(state));
}

/**
 * Check if a transition is valid
 * @param {string} currentState - Current state
 * @param {string} action - Action to perform
 * @returns {boolean}
 */
function canTransition(currentState, action) {
  const transitions = TRANSITIONS[currentState];
  return !!(transitions && transitions[action]);
}

/**
 * Get the next state for a transition
 * @param {string} currentState - Current state
 * @param {string} action - Action to perform
 * @returns {string|null} Next state or null if invalid
 */
function getNextState(currentState, action) {
  const transitions = TRANSITIONS[currentState];
  return (transitions && transitions[action]) || null;
}

/**
 * Session state machine error
 */
class StateMachineError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'StateMachineError';
    this.currentState = details.currentState;
    this.action = details.action;
    this.code = details.code || 'INVALID_TRANSITION';
  }
}

/**
 * Session State Machine
 * @extends EventEmitter
 *
 * Events:
 * - 'transition': { from, to, action, timestamp }
 * - 'invalidTransition': { currentState, action, error }
 * - 'stateChange': { state }
 */
class SessionStateMachine extends EventEmitter {
  /**
   * @param {string} [initialState='idle'] - Initial state
   * @param {Object} [options={}] - Options
   * @param {boolean} [options.strict=true] - Throw on invalid transitions
   * @param {boolean} [options.historyEnabled=false] - Track transition history
   */
  constructor(initialState = SessionState.IDLE, options = {}) {
    super();

    // Validate initial state
    if (!isValidState(initialState)) {
      throw new StateMachineError(`Invalid initial state: ${initialState}`, {
        code: 'INVALID_STATE',
      });
    }

    this._state = initialState;
    this._strict = options.strict !== false;
    this._historyEnabled = options.historyEnabled || false;
    this._history = this._historyEnabled ? [{ state: initialState, timestamp: new Date() }] : [];
    this._metadata = {};
  }

  /**
   * Get current state
   * @returns {string}
   */
  get state() {
    return this._state;
  }

  /**
   * Get transition history (if enabled)
   * @returns {Array<{state: string, action?: string, timestamp: Date}>}
   */
  get history() {
    return [...this._history];
  }

  /**
   * Get metadata
   * @returns {Object}
   */
  get metadata() {
    return { ...this._metadata };
  }

  /**
   * Set metadata
   * @param {Object} meta - Metadata to merge
   */
  setMetadata(meta) {
    this._metadata = { ...this._metadata, ...meta };
  }

  /**
   * Check if state machine is in a final state
   * @returns {boolean}
   */
  isFinal() {
    return this._state === SessionState.TERMINATED;
  }

  /**
   * Check if a transition can be performed
   * @param {string} action - Action to check
   * @returns {boolean}
   */
  canTransition(action) {
    return canTransition(this._state, action);
  }

  /**
   * Get available actions from current state
   * @returns {string[]}
   */
  getAvailableActions() {
    return getAvailableActions(this._state);
  }

  /**
   * Perform a transition
   * @param {string} action - Action to perform
   * @returns {{ok: boolean, from?: string, to?: string, error?: Error}}
   */
  transition(action) {
    const from = this._state;

    // Check if action is valid
    if (!isValidAction(action)) {
      const error = new StateMachineError(`Invalid action: ${action}`, {
        currentState: from,
        action,
        code: 'INVALID_ACTION',
      });

      this.emit('invalidTransition', { currentState: from, action, error });

      if (this._strict) {
        throw error;
      }
      return { ok: false, error };
    }

    // Check if transition is valid
    const to = getNextState(from, action);

    if (!to) {
      const error = new StateMachineError(
        `Cannot perform '${action}' from state '${from}'. Available actions: ${this.getAvailableActions().join(', ') || 'none'}`,
        {
          currentState: from,
          action,
          code: 'INVALID_TRANSITION',
        }
      );

      this.emit('invalidTransition', { currentState: from, action, error });

      if (this._strict) {
        throw error;
      }
      return { ok: false, error };
    }

    // Perform transition
    this._state = to;

    const timestamp = new Date();

    if (this._historyEnabled) {
      this._history.push({ state: to, action, from, timestamp });
    }

    // Emit events
    this.emit('transition', { from, to, action, timestamp });
    this.emit('stateChange', { state: to });

    return { ok: true, from, to };
  }

  /**
   * Attempt transition without throwing on failure
   * @param {string} action - Action to perform
   * @returns {boolean} True if transition succeeded
   */
  tryTransition(action) {
    try {
      const result = this.transition(action);
      return result.ok;
    } catch {
      return false;
    }
  }

  /**
   * Reset to initial state
   * @param {string} [state='idle'] - State to reset to
   */
  reset(state = SessionState.IDLE) {
    if (!isValidState(state)) {
      throw new StateMachineError(`Invalid state: ${state}`, {
        code: 'INVALID_STATE',
      });
    }

    const from = this._state;
    this._state = state;

    if (this._historyEnabled) {
      this._history.push({ state, action: 'reset', from, timestamp: new Date() });
    }

    this.emit('transition', { from, to: state, action: 'reset', timestamp: new Date() });
    this.emit('stateChange', { state });
  }

  /**
   * Check if state matches
   * @param {string} state - State to check
   * @returns {boolean}
   */
  is(state) {
    return this._state === state;
  }

  /**
   * Check if state is one of given states
   * @param {...string} states - States to check
   * @returns {boolean}
   */
  isOneOf(...states) {
    return states.includes(this._state);
  }

  /**
   * Serialize state machine
   * @returns {Object}
   */
  serialize() {
    return {
      state: this._state,
      history: this._historyEnabled ? this._history : undefined,
      metadata: Object.keys(this._metadata).length > 0 ? this._metadata : undefined,
    };
  }

  /**
   * Deserialize state machine
   * @param {Object} data - Serialized data
   * @param {Object} [options={}] - Options
   * @returns {SessionStateMachine}
   */
  static deserialize(data, options = {}) {
    const sm = new SessionStateMachine(data.state, {
      ...options,
      historyEnabled: !!data.history,
    });

    if (data.history) {
      sm._history = data.history.map(h => ({
        ...h,
        timestamp: new Date(h.timestamp),
      }));
    }

    if (data.metadata) {
      sm._metadata = data.metadata;
    }

    return sm;
  }

  /**
   * Create state machine diagram (Mermaid format)
   * @returns {string}
   */
  static toMermaid() {
    const lines = ['stateDiagram-v2'];

    for (const [state, transitions] of Object.entries(TRANSITIONS)) {
      for (const [action, nextState] of Object.entries(transitions)) {
        lines.push(`    ${state} --> ${nextState}: ${action}`);
      }
    }

    // Mark initial and final states
    lines.push('    [*] --> idle');
    lines.push('    terminated --> [*]');

    return lines.join('\n');
  }
}

/**
 * Create a pre-configured state machine for sessions
 * @param {Object} [options={}] - Options
 * @returns {SessionStateMachine}
 */
function createSessionStateMachine(options = {}) {
  return new SessionStateMachine(SessionState.IDLE, options);
}

module.exports = {
  // Enums
  SessionState,
  SessionAction,

  // Constants
  TRANSITIONS,

  // Utility functions
  getValidStates,
  getValidActions,
  isValidState,
  isValidAction,
  getTransitionsFromState,
  getAvailableActions,
  canTransition,
  getNextState,

  // Classes
  StateMachineError,
  SessionStateMachine,

  // Factory
  createSessionStateMachine,
};
