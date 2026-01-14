/**
 * feedback.js - Unified Progress Feedback System
 *
 * Consolidates all progress/feedback patterns:
 * - Status messages (success, error, warning, info)
 * - Spinners for indeterminate progress
 * - Progress bars for determinate progress
 * - Task tracking for multi-step operations
 * - Consistent formatting across all output
 *
 * Features:
 * - TTY detection (graceful degradation for non-interactive)
 * - Doherty Threshold timing (operations <400ms feel instant)
 * - Nested task support with indentation
 * - Consistent symbol and color usage
 *
 * Usage:
 *   const { feedback } = require('./feedback');
 *
 *   // Simple messages
 *   feedback.success('Task completed');
 *   feedback.error('Something went wrong');
 *
 *   // With spinner
 *   const spinner = feedback.spinner('Processing...');
 *   await doWork();
 *   spinner.succeed('Done!');
 *
 *   // Multi-step operations
 *   const task = feedback.task('Installing', 3);
 *   task.step('Copying files');
 *   task.step('Setting permissions');
 *   task.complete('Installed successfully');
 */

const { c, BRAND_HEX } = require('./colors');
const chalk = require('chalk');

// Symbols for consistent output
const SYMBOLS = {
  success: '✓',
  error: '✗',
  warning: '⚠',
  info: 'ℹ',
  bullet: '•',
  arrow: '→',
  pending: '○',
  active: '●',
};

// Braille spinner characters (smooth animation)
const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

// Doherty Threshold - operations faster than this feel instant
const DOHERTY_THRESHOLD_MS = 400;

/**
 * Format duration for display
 * @param {number} ms - Duration in milliseconds
 * @returns {string} Formatted duration
 */
function formatDuration(ms) {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

/**
 * Unified Feedback class
 * Provides consistent progress and status output
 */
class Feedback {
  constructor(options = {}) {
    this.isTTY = options.isTTY !== undefined ? options.isTTY : process.stdout.isTTY;
    this.indent = options.indent || 0;
    this.quiet = options.quiet || false;
    this.verbose = options.verbose || false;
  }

  /**
   * Get indentation string
   * @returns {string}
   * @private
   */
  _indent() {
    return '  '.repeat(this.indent);
  }

  /**
   * Print a message (respects quiet mode)
   * @param {string} symbol - Symbol to prefix
   * @param {string} message - Message text
   * @param {string} color - Color to apply
   * @private
   */
  _print(symbol, message, color = '') {
    if (this.quiet) return;
    const prefix = this._indent();
    console.log(`${prefix}${color}${symbol}${c.reset} ${message}`);
  }

  /**
   * Print success message
   * @param {string} message - Success message
   * @returns {Feedback} this for chaining
   */
  success(message) {
    this._print(SYMBOLS.success, message, c.green);
    return this;
  }

  /**
   * Print error message
   * @param {string} message - Error message
   * @returns {Feedback} this for chaining
   */
  error(message) {
    this._print(SYMBOLS.error, message, c.red);
    return this;
  }

  /**
   * Print warning message
   * @param {string} message - Warning message
   * @returns {Feedback} this for chaining
   */
  warning(message) {
    this._print(SYMBOLS.warning, message, c.yellow);
    return this;
  }

  /**
   * Print info message
   * @param {string} message - Info message
   * @returns {Feedback} this for chaining
   */
  info(message) {
    this._print(SYMBOLS.info, message, c.blue);
    return this;
  }

  /**
   * Print dim/subtle message
   * @param {string} message - Message
   * @returns {Feedback} this for chaining
   */
  dim(message) {
    if (this.quiet) return this;
    const prefix = this._indent();
    console.log(`${prefix}${c.dim}${message}${c.reset}`);
    return this;
  }

  /**
   * Print verbose message (only in verbose mode)
   * @param {string} message - Message
   * @returns {Feedback} this for chaining
   */
  debug(message) {
    if (!this.verbose) return this;
    this._print(SYMBOLS.bullet, message, c.dim);
    return this;
  }

  /**
   * Print bullet point
   * @param {string} message - Message
   * @returns {Feedback} this for chaining
   */
  bullet(message) {
    this._print(SYMBOLS.bullet, message, c.dim);
    return this;
  }

  /**
   * Print branded message (uses brand color)
   * @param {string} message - Message
   * @returns {Feedback} this for chaining
   */
  brand(message) {
    if (this.quiet) return this;
    const prefix = this._indent();
    console.log(`${prefix}${chalk.hex(BRAND_HEX)(message)}`);
    return this;
  }

  /**
   * Print empty line
   * @returns {Feedback} this for chaining
   */
  newline() {
    if (this.quiet) return this;
    console.log();
    return this;
  }

  /**
   * Create a new spinner
   * @param {string} message - Spinner message
   * @param {Object} [options={}] - Spinner options
   * @returns {FeedbackSpinner}
   */
  spinner(message, options = {}) {
    return new FeedbackSpinner(message, {
      ...options,
      isTTY: this.isTTY,
      indent: this.indent,
    });
  }

  /**
   * Create a task tracker for multi-step operations
   * @param {string} name - Task name
   * @param {number} [totalSteps] - Total number of steps (optional)
   * @returns {FeedbackTask}
   */
  task(name, totalSteps = null) {
    return new FeedbackTask(name, totalSteps, {
      isTTY: this.isTTY,
      indent: this.indent,
    });
  }

  /**
   * Create a progress bar
   * @param {string} label - Progress label
   * @param {number} total - Total items
   * @param {Object} [options={}] - Progress bar options
   * @returns {FeedbackProgressBar}
   */
  progressBar(label, total, options = {}) {
    return new FeedbackProgressBar(label, total, {
      ...options,
      isTTY: this.isTTY,
      indent: this.indent,
    });
  }

  /**
   * Run an async operation with a spinner
   * @param {string} message - Spinner message
   * @param {Function} fn - Async function to execute
   * @param {Object} [options={}] - Spinner options
   * @returns {Promise<any>} Result of the async function
   */
  async withSpinner(message, fn, options = {}) {
    const spinner = this.spinner(message, options).start();
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
   * Create a child feedback with increased indentation
   * @returns {Feedback}
   */
  child() {
    return new Feedback({
      isTTY: this.isTTY,
      indent: this.indent + 1,
      quiet: this.quiet,
      verbose: this.verbose,
    });
  }
}

/**
 * Spinner for indeterminate progress
 */
class FeedbackSpinner {
  constructor(message, options = {}) {
    this.message = message;
    this.isTTY = options.isTTY !== undefined ? options.isTTY : process.stdout.isTTY;
    this.indent = options.indent || 0;
    this.interval = options.interval || 80;
    this.frameIndex = 0;
    this.timer = null;
    this.startTime = null;
  }

  _prefix() {
    return '  '.repeat(this.indent);
  }

  /**
   * Start the spinner
   * @returns {FeedbackSpinner}
   */
  start() {
    if (!this.isTTY) {
      console.log(`${this._prefix()}${c.dim}${this.message}${c.reset}`);
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
   * Update spinner message
   * @param {string} message - New message
   * @returns {FeedbackSpinner}
   */
  update(message) {
    this.message = message;
    if (this.isTTY && this.timer) {
      this.render();
    }
    return this;
  }

  /**
   * Render spinner frame
   * @private
   */
  render() {
    if (!this.isTTY) return;
    const frame = SPINNER_FRAMES[this.frameIndex];
    const line = `${this._prefix()}${c.cyan}${frame}${c.reset} ${this.message}`;
    process.stdout.clearLine(0);
    process.stdout.cursorTo(0);
    process.stdout.write(line);
  }

  /**
   * Stop spinner with result
   * @param {string} symbol - Symbol to show
   * @param {string} [message] - Final message
   * @param {string} [color] - Color code
   * @returns {FeedbackSpinner}
   */
  stop(symbol, message = null, color = '') {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }

    if (this.isTTY) {
      process.stdout.clearLine(0);
      process.stdout.cursorTo(0);
    }

    const elapsed = this.startTime ? Date.now() - this.startTime : 0;
    const suffix =
      elapsed > DOHERTY_THRESHOLD_MS ? ` ${c.dim}(${formatDuration(elapsed)})${c.reset}` : '';
    const msg = message || this.message;

    console.log(`${this._prefix()}${color}${symbol}${c.reset} ${msg}${suffix}`);
    return this;
  }

  succeed(message = null) {
    return this.stop(SYMBOLS.success, message, c.green);
  }
  fail(message = null) {
    return this.stop(SYMBOLS.error, message, c.red);
  }
  warn(message = null) {
    return this.stop(SYMBOLS.warning, message, c.yellow);
  }
  info(message = null) {
    return this.stop(SYMBOLS.info, message, c.blue);
  }
}

/**
 * Task tracker for multi-step operations
 */
class FeedbackTask {
  constructor(name, totalSteps = null, options = {}) {
    this.name = name;
    this.totalSteps = totalSteps;
    this.currentStep = 0;
    this.isTTY = options.isTTY !== undefined ? options.isTTY : process.stdout.isTTY;
    this.indent = options.indent || 0;
    this.startTime = Date.now();
    this.steps = [];
  }

  _prefix() {
    return '  '.repeat(this.indent);
  }

  /**
   * Start the task (optional - for explicit start message)
   * @param {string} [message] - Start message
   * @returns {FeedbackTask}
   */
  start(message = null) {
    const msg = message || this.name;
    console.log(`${this._prefix()}${c.cyan}${SYMBOLS.active}${c.reset} ${msg}`);
    return this;
  }

  /**
   * Mark a step as complete
   * @param {string} message - Step message
   * @returns {FeedbackTask}
   */
  step(message) {
    this.currentStep++;
    this.steps.push(message);

    let stepInfo = '';
    if (this.totalSteps) {
      stepInfo = ` ${c.dim}[${this.currentStep}/${this.totalSteps}]${c.reset}`;
    }

    console.log(`${this._prefix()}  ${c.green}${SYMBOLS.success}${c.reset} ${message}${stepInfo}`);
    return this;
  }

  /**
   * Log a sub-item (dimmed, no step counting)
   * @param {string} message - Item message
   * @returns {FeedbackTask}
   */
  item(message) {
    console.log(`${this._prefix()}    ${c.dim}${SYMBOLS.bullet} ${message}${c.reset}`);
    return this;
  }

  /**
   * Complete the task successfully
   * @param {string} [message] - Completion message
   * @returns {FeedbackTask}
   */
  complete(message = null) {
    const elapsed = Date.now() - this.startTime;
    const suffix =
      elapsed > DOHERTY_THRESHOLD_MS ? ` ${c.dim}(${formatDuration(elapsed)})${c.reset}` : '';
    const msg = message || `${this.name} complete`;

    console.log(`${this._prefix()}${c.green}${SYMBOLS.success}${c.reset} ${msg}${suffix}`);
    return this;
  }

  /**
   * Fail the task
   * @param {string} [message] - Failure message
   * @returns {FeedbackTask}
   */
  fail(message = null) {
    const msg = message || `${this.name} failed`;
    console.log(`${this._prefix()}${c.red}${SYMBOLS.error}${c.reset} ${msg}`);
    return this;
  }
}

/**
 * Progress bar for determinate progress
 */
class FeedbackProgressBar {
  constructor(label, total, options = {}) {
    this.label = label;
    this.total = total;
    this.current = 0;
    this.width = options.width || 30;
    this.isTTY = options.isTTY !== undefined ? options.isTTY : process.stdout.isTTY;
    this.indent = options.indent || 0;
    this.startTime = Date.now();
    this.lastPrintedPercent = -1;
  }

  _prefix() {
    return '  '.repeat(this.indent);
  }

  /**
   * Update progress
   * @param {number} current - Current count
   * @param {string} [item] - Current item name
   * @returns {FeedbackProgressBar}
   */
  update(current, item = null) {
    this.current = current;

    if (!this.isTTY) {
      // Non-TTY: print every 10% or on completion
      const percent = Math.floor((current / this.total) * 100);
      if (percent % 10 === 0 && percent !== this.lastPrintedPercent) {
        this.lastPrintedPercent = percent;
        console.log(`${this._prefix()}${this.label}: ${percent}% (${current}/${this.total})`);
      }
      return this;
    }

    const percent = this.total > 0 ? current / this.total : 0;
    const filled = Math.round(this.width * percent);
    const empty = this.width - filled;

    const bar = `${c.green}${'█'.repeat(filled)}${c.dim}${'░'.repeat(empty)}${c.reset}`;
    const percentStr = `${Math.round(percent * 100)}%`.padStart(4);
    const countStr = `${current}/${this.total}`;
    const itemStr = item ? ` ${c.dim}${item}${c.reset}` : '';

    process.stdout.clearLine(0);
    process.stdout.cursorTo(0);
    process.stdout.write(
      `${this._prefix()}${this.label} ${bar} ${percentStr} (${countStr})${itemStr}`
    );

    return this;
  }

  /**
   * Increment by 1
   * @param {string} [item] - Current item name
   * @returns {FeedbackProgressBar}
   */
  increment(item = null) {
    return this.update(this.current + 1, item);
  }

  /**
   * Complete the progress bar
   * @param {string} [message] - Completion message
   * @returns {FeedbackProgressBar}
   */
  complete(message = null) {
    if (this.isTTY) {
      process.stdout.clearLine(0);
      process.stdout.cursorTo(0);
    }

    const elapsed = Date.now() - this.startTime;
    const suffix =
      elapsed > DOHERTY_THRESHOLD_MS ? ` ${c.dim}(${formatDuration(elapsed)})${c.reset}` : '';
    const msg = message || `${this.label} complete`;

    console.log(
      `${this._prefix()}${c.green}${SYMBOLS.success}${c.reset} ${msg} (${this.total} items)${suffix}`
    );
    return this;
  }
}

// Singleton instance for convenience
const feedback = new Feedback();

module.exports = {
  Feedback,
  FeedbackSpinner,
  FeedbackTask,
  FeedbackProgressBar,
  feedback,
  SYMBOLS,
  SPINNER_FRAMES,
  DOHERTY_THRESHOLD_MS,
  formatDuration,
};
