/**
 * progress.js - Progress Indicators for Long-Running Operations
 *
 * Provides animated spinners and micro-progress indicators that meet
 * the Doherty Threshold (<400ms feels instant).
 *
 * Features:
 * - Animated braille spinner
 * - Micro-progress with current/total counts
 * - TTY detection (no animation in non-TTY)
 * - Minimal overhead for fast operations
 */

const { c } = require('./colors');

// Braille spinner characters (smooth animation)
const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

// Doherty Threshold - operations faster than this feel instant
const DOHERTY_THRESHOLD_MS = 400;

/**
 * Progress spinner for long-running operations.
 * Automatically handles TTY detection and cleanup.
 */
class Spinner {
  /**
   * Create a new spinner
   * @param {string} message - Initial message to display
   * @param {Object} [options={}] - Spinner options
   * @param {number} [options.interval=80] - Animation interval in ms
   * @param {boolean} [options.enabled=true] - Whether spinner is enabled
   */
  constructor(message, options = {}) {
    this.message = message;
    this.interval = options.interval || 80;
    this.enabled = options.enabled !== false && process.stdout.isTTY;
    this.frameIndex = 0;
    this.timer = null;
    this.startTime = null;
    this.current = 0;
    this.total = 0;
  }

  /**
   * Start the spinner animation
   * @returns {Spinner} this for chaining
   */
  start() {
    if (!this.enabled) {
      // In non-TTY, just print the message once
      console.log(`${c.dim}${this.message}${c.reset}`);
      return this;
    }

    this.startTime = Date.now();
    this.render();
    this.timer = setInterval(() => {
      this.frameIndex = (this.frameIndex + 1) % SPINNER_FRAMES.length;
      this.render();
    }, this.interval);

    return this;
  }

  /**
   * Update the spinner message
   * @param {string} message - New message
   * @returns {Spinner} this for chaining
   */
  update(message) {
    this.message = message;
    if (this.enabled && this.timer) {
      this.render();
    }
    return this;
  }

  /**
   * Update micro-progress (current/total)
   * @param {number} current - Current item number
   * @param {number} total - Total items
   * @param {string} [action] - Action being performed (e.g., 'Archiving')
   * @returns {Spinner} this for chaining
   */
  progress(current, total, action = null) {
    this.current = current;
    this.total = total;
    if (action) {
      this.message = `${action}... ${current}/${total}`;
    } else {
      this.message = `${this.message.split('...')[0]}... ${current}/${total}`;
    }
    if (this.enabled && this.timer) {
      this.render();
    }
    return this;
  }

  /**
   * Render the current spinner frame
   * @private
   */
  render() {
    if (!this.enabled) return;

    const frame = SPINNER_FRAMES[this.frameIndex];
    const line = `${c.cyan}${frame}${c.reset} ${this.message}`;

    // Clear line and write new content
    process.stdout.clearLine(0);
    process.stdout.cursorTo(0);
    process.stdout.write(line);
  }

  /**
   * Stop the spinner with a success message
   * @param {string} [message] - Success message (defaults to original message)
   * @returns {Spinner} this for chaining
   */
  succeed(message = null) {
    return this.stop('✓', message || this.message, c.green);
  }

  /**
   * Stop the spinner with a failure message
   * @param {string} [message] - Failure message (defaults to original message)
   * @returns {Spinner} this for chaining
   */
  fail(message = null) {
    return this.stop('✗', message || this.message, c.red);
  }

  /**
   * Stop the spinner with a warning message
   * @param {string} [message] - Warning message (defaults to original message)
   * @returns {Spinner} this for chaining
   */
  warn(message = null) {
    return this.stop('⚠', message || this.message, c.yellow);
  }

  /**
   * Stop the spinner with an info message
   * @param {string} [message] - Info message (defaults to original message)
   * @returns {Spinner} this for chaining
   */
  info(message = null) {
    return this.stop('ℹ', message || this.message, c.blue);
  }

  /**
   * Stop the spinner with a custom symbol
   * @param {string} symbol - Symbol to display
   * @param {string} message - Final message
   * @param {string} [color=''] - ANSI color code
   * @returns {Spinner} this for chaining
   */
  stop(symbol, message, color = '') {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }

    if (this.enabled) {
      process.stdout.clearLine(0);
      process.stdout.cursorTo(0);
    }

    const elapsed = this.startTime ? Date.now() - this.startTime : 0;
    const suffix = elapsed > DOHERTY_THRESHOLD_MS ? ` ${c.dim}(${formatDuration(elapsed)})${c.reset}` : '';

    console.log(`${color}${symbol}${c.reset} ${message}${suffix}`);
    return this;
  }

  /**
   * Check if operation was fast (under Doherty Threshold)
   * @returns {boolean}
   */
  wasFast() {
    return this.startTime && (Date.now() - this.startTime) < DOHERTY_THRESHOLD_MS;
  }
}

/**
 * Format duration for display
 * @param {number} ms - Duration in milliseconds
 * @returns {string} Formatted duration
 */
function formatDuration(ms) {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  const seconds = (ms / 1000).toFixed(1);
  return `${seconds}s`;
}

/**
 * Create and start a new spinner
 * @param {string} message - Message to display
 * @param {Object} [options={}] - Spinner options
 * @returns {Spinner} Started spinner instance
 */
function createSpinner(message, options = {}) {
  return new Spinner(message, options).start();
}

/**
 * Run an async operation with a spinner
 * @param {string} message - Message to display
 * @param {Function} fn - Async function to execute
 * @param {Object} [options={}] - Spinner options
 * @returns {Promise<any>} Result of the async function
 */
async function withSpinner(message, fn, options = {}) {
  const spinner = createSpinner(message, options);
  try {
    const result = await fn(spinner);
    spinner.succeed();
    return result;
  } catch (error) {
    spinner.fail(error.message);
    throw error;
  }
}

/**
 * Progress bar for operations with known total
 */
class ProgressBar {
  /**
   * Create a new progress bar
   * @param {string} label - Label to display
   * @param {number} total - Total items
   * @param {Object} [options={}] - Bar options
   * @param {number} [options.width=30] - Bar width in characters
   */
  constructor(label, total, options = {}) {
    this.label = label;
    this.total = total;
    this.current = 0;
    this.width = options.width || 30;
    this.enabled = process.stdout.isTTY;
    this.startTime = Date.now();
  }

  /**
   * Update progress
   * @param {number} current - Current item number
   * @param {string} [item] - Current item being processed
   * @returns {ProgressBar} this for chaining
   */
  update(current, item = null) {
    this.current = current;

    if (!this.enabled) {
      // Non-TTY: print every 10% or on completion
      const percent = Math.floor((current / this.total) * 100);
      if (percent % 10 === 0 || current === this.total) {
        console.log(`${this.label}: ${percent}% (${current}/${this.total})`);
      }
      return this;
    }

    const percent = this.total > 0 ? (current / this.total) : 0;
    const filled = Math.round(this.width * percent);
    const empty = this.width - filled;

    const bar = `${c.green}${'█'.repeat(filled)}${c.dim}${'░'.repeat(empty)}${c.reset}`;
    const percentStr = `${Math.round(percent * 100)}%`.padStart(4);
    const countStr = `${current}/${this.total}`;
    const itemStr = item ? ` ${c.dim}${item}${c.reset}` : '';

    process.stdout.clearLine(0);
    process.stdout.cursorTo(0);
    process.stdout.write(`${this.label} ${bar} ${percentStr} (${countStr})${itemStr}`);

    return this;
  }

  /**
   * Increment progress by 1
   * @param {string} [item] - Current item being processed
   * @returns {ProgressBar} this for chaining
   */
  increment(item = null) {
    return this.update(this.current + 1, item);
  }

  /**
   * Complete the progress bar
   * @param {string} [message] - Completion message
   * @returns {ProgressBar} this for chaining
   */
  complete(message = null) {
    if (this.enabled) {
      process.stdout.clearLine(0);
      process.stdout.cursorTo(0);
    }

    const elapsed = Date.now() - this.startTime;
    const suffix = elapsed > DOHERTY_THRESHOLD_MS ? ` ${c.dim}(${formatDuration(elapsed)})${c.reset}` : '';
    const msg = message || `${this.label} complete`;

    console.log(`${c.green}✓${c.reset} ${msg} (${this.total} items)${suffix}`);
    return this;
  }
}

/**
 * Create a progress bar
 * @param {string} label - Label to display
 * @param {number} total - Total items
 * @param {Object} [options={}] - Bar options
 * @returns {ProgressBar}
 */
function createProgressBar(label, total, options = {}) {
  return new ProgressBar(label, total, options);
}

module.exports = {
  Spinner,
  ProgressBar,
  createSpinner,
  createProgressBar,
  withSpinner,
  formatDuration,
  DOHERTY_THRESHOLD_MS,
  SPINNER_FRAMES,
};
