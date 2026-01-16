'use strict';

/**
 * Keyboard Handler - Key bindings for TUI
 *
 * Provides centralized keyboard handling with configurable bindings
 * and event emission for TUI components.
 */

const EventEmitter = require('events');

/**
 * Default key bindings
 */
const DEFAULT_BINDINGS = {
  quit: { key: 'q', description: 'Quit TUI' },
  start: { key: 's', description: 'Start loop' },
  pause: { key: 'p', description: 'Pause loop' },
  resume: { key: 'r', description: 'Resume loop' },
  trace: { key: 't', description: 'Toggle trace' },
  help: { key: '?', description: 'Show help' },
  // Session switching (1-9)
  session1: { key: '1', description: 'Session 1' },
  session2: { key: '2', description: 'Session 2' },
  session3: { key: '3', description: 'Session 3' },
  session4: { key: '4', description: 'Session 4' },
  session5: { key: '5', description: 'Session 5' },
  session6: { key: '6', description: 'Session 6' },
  session7: { key: '7', description: 'Session 7' },
  session8: { key: '8', description: 'Session 8' },
  session9: { key: '9', description: 'Session 9' }
};

/**
 * KeyboardHandler class - centralized keyboard handling
 */
class KeyboardHandler extends EventEmitter {
  constructor(options = {}) {
    super();

    this.bindings = { ...DEFAULT_BINDINGS, ...options.bindings };
    this.enabled = true;
    this.keyHistory = [];
    this.historyLimit = options.historyLimit || 50;
  }

  /**
   * Process a key press
   * @param {string} input - The key character
   * @param {object} key - The key object from useInput
   * @returns {object|null} - Action performed or null
   */
  processKey(input, key = {}) {
    if (!this.enabled) return null;

    // Record key press
    this._recordKey(input, key);

    // Handle Ctrl+C for quit
    if (key.ctrl && input === 'c') {
      const action = { action: 'quit', key: 'ctrl+c' };
      this.emit('action', action);
      this.emit('quit');
      return action;
    }

    // Handle escape for quit
    if (key.escape) {
      const action = { action: 'quit', key: 'escape' };
      this.emit('action', action);
      this.emit('quit');
      return action;
    }

    // Normalize input to lowercase for matching
    const normalizedInput = input.toLowerCase();

    // Check against bindings
    for (const [actionName, binding] of Object.entries(this.bindings)) {
      if (binding.key === normalizedInput || binding.key === input) {
        const action = { action: actionName, key: input };
        this.emit('action', action);
        this.emit(actionName, action);

        // Special handling for session switching
        if (actionName.startsWith('session')) {
          const sessionNum = parseInt(actionName.replace('session', ''), 10);
          this.emit('sessionSwitch', { session: sessionNum });
        }

        return action;
      }
    }

    // Unknown key
    this.emit('unknownKey', { key: input });
    return null;
  }

  /**
   * Record key press to history
   */
  _recordKey(input, key) {
    this.keyHistory.push({
      input,
      key,
      timestamp: Date.now()
    });

    // Trim history
    while (this.keyHistory.length > this.historyLimit) {
      this.keyHistory.shift();
    }
  }

  /**
   * Get key history
   */
  getHistory() {
    return [...this.keyHistory];
  }

  /**
   * Clear key history
   */
  clearHistory() {
    this.keyHistory = [];
  }

  /**
   * Enable keyboard handling
   */
  enable() {
    this.enabled = true;
  }

  /**
   * Disable keyboard handling
   */
  disable() {
    this.enabled = false;
  }

  /**
   * Check if a key is bound
   */
  isBound(key) {
    return Object.values(this.bindings).some(b => b.key === key);
  }

  /**
   * Get binding for action
   */
  getBinding(action) {
    return this.bindings[action] || null;
  }

  /**
   * Get all bindings
   */
  getBindings() {
    return { ...this.bindings };
  }

  /**
   * Set custom binding
   */
  setBinding(action, key, description) {
    this.bindings[action] = { key, description };
  }
}

/**
 * Format key bindings for footer display
 * @param {object} bindings - Key bindings object
 * @returns {string[]} - Array of formatted binding strings
 */
function formatBindings(bindings = DEFAULT_BINDINGS) {
  // Primary bindings to show in footer (exclude session numbers)
  const primaryBindings = ['quit', 'start', 'pause', 'resume', 'trace', 'help'];

  return primaryBindings
    .filter(name => bindings[name])
    .map(name => {
      const binding = bindings[name];
      return `${binding.key.toUpperCase()}:${binding.description}`;
    });
}

/**
 * Format bindings as help text
 * @param {object} bindings - Key bindings object
 * @returns {string} - Multi-line help text
 */
function formatHelp(bindings = DEFAULT_BINDINGS) {
  const lines = ['Key Bindings:', ''];

  // Group bindings
  const groups = {
    'Loop Control': ['start', 'pause', 'resume'],
    'View': ['trace', 'help'],
    'Navigation': ['quit'],
    'Sessions': ['session1', 'session2', 'session3', 'session4', 'session5',
                 'session6', 'session7', 'session8', 'session9']
  };

  for (const [groupName, actions] of Object.entries(groups)) {
    lines.push(`  ${groupName}:`);
    for (const action of actions) {
      if (bindings[action]) {
        const binding = bindings[action];
        lines.push(`    ${binding.key.toUpperCase()} - ${binding.description}`);
      }
    }
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Create default keyboard handler instance
 */
let defaultHandler = null;

function getDefaultHandler() {
  if (!defaultHandler) {
    defaultHandler = new KeyboardHandler();
  }
  return defaultHandler;
}

/**
 * React hook factory for keyboard handling
 * Returns a function that can be used with useInput
 */
function createKeyHandler(handler = null) {
  const kbd = handler || getDefaultHandler();

  return function handleKey(input, key) {
    return kbd.processKey(input, key);
  };
}

module.exports = {
  KeyboardHandler,
  DEFAULT_BINDINGS,
  formatBindings,
  formatHelp,
  getDefaultHandler,
  createKeyHandler
};
