'use strict';

/**
 * UiManager - Unified Progress Feedback System
 *
 * Provides consistent UI patterns across AgileFlow:
 * - Spinners with progress indication
 * - Micro-progress displays (current/total)
 * - ETA calculation for long operations
 * - Timing metrics for performance analysis
 */

const { c } = require('./colors');

// Spinner frames
const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
const SPINNER_INTERVAL = 80; // ms

/**
 * Format milliseconds to human readable string
 * @param {number} ms - Milliseconds
 * @returns {string} Formatted time
 */
function formatTime(ms) {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const mins = Math.floor(ms / 60000);
  const secs = Math.floor((ms % 60000) / 1000);
  return `${mins}m ${secs}s`;
}

/**
 * Format bytes to human readable string
 * @param {number} bytes - Bytes
 * @returns {string} Formatted size
 */
function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

/**
 * Calculate ETA based on progress
 * @param {number} current - Current count
 * @param {number} total - Total count
 * @param {number} startTime - Start time in ms
 * @returns {string} ETA string
 */
function calculateETA(current, total, startTime) {
  if (current === 0) return 'calculating...';
  if (current >= total) return 'complete';

  const elapsed = Date.now() - startTime;
  const rate = current / elapsed;
  const remaining = total - current;
  const etaMs = remaining / rate;

  return formatTime(etaMs);
}

/**
 * Spinner class for animated progress indication
 */
class Spinner {
  constructor(options = {}) {
    this.text = options.text || 'Loading...';
    this.frames = options.frames || SPINNER_FRAMES;
    this.interval = options.interval || SPINNER_INTERVAL;
    this.stream = options.stream || process.stderr;
    this.color = options.color || 'cyan';

    this._frameIndex = 0;
    this._timer = null;
    this._isSpinning = false;
    this._current = 0;
    this._total = 0;
    this._startTime = null;
    this._showProgress = options.showProgress || false;
    this._showETA = options.showETA || false;
  }

  /**
   * Start the spinner
   * @param {string} text - Optional text to display
   */
  start(text) {
    if (text) this.text = text;
    if (this._isSpinning) return this;

    this._isSpinning = true;
    this._startTime = Date.now();
    this._render();
    this._timer = setInterval(() => this._render(), this.interval);

    return this;
  }

  /**
   * Stop the spinner
   * @param {Object} options - Stop options
   */
  stop(options = {}) {
    if (!this._isSpinning) return this;

    clearInterval(this._timer);
    this._timer = null;
    this._isSpinning = false;

    // Clear the line
    this._clearLine();

    // Show final message if provided
    if (options.text) {
      const symbol = options.symbol || '✓';
      const color = options.color || 'green';
      this.stream.write(`${c[color]}${symbol}${c.reset} ${options.text}\n`);
    }

    return this;
  }

  /**
   * Update spinner text
   * @param {string} text - New text
   */
  update(text) {
    this.text = text;
    return this;
  }

  /**
   * Set progress for micro-progress display
   * @param {number} current - Current count
   * @param {number} total - Total count
   */
  setProgress(current, total) {
    this._current = current;
    this._total = total;
    this._showProgress = true;
    return this;
  }

  /**
   * Success - stop with success indicator
   * @param {string} text - Success message
   */
  succeed(text) {
    return this.stop({ text, symbol: '✓', color: 'green' });
  }

  /**
   * Fail - stop with failure indicator
   * @param {string} text - Failure message
   */
  fail(text) {
    return this.stop({ text, symbol: '✗', color: 'red' });
  }

  /**
   * Warn - stop with warning indicator
   * @param {string} text - Warning message
   */
  warn(text) {
    return this.stop({ text, symbol: '⚠', color: 'yellow' });
  }

  /**
   * Info - stop with info indicator
   * @param {string} text - Info message
   */
  info(text) {
    return this.stop({ text, symbol: 'ℹ', color: 'blue' });
  }

  /**
   * Render the spinner frame
   */
  _render() {
    const frame = this.frames[this._frameIndex];
    this._frameIndex = (this._frameIndex + 1) % this.frames.length;

    let line = `${c[this.color]}${frame}${c.reset} ${this.text}`;

    // Add progress if available
    if (this._showProgress && this._total > 0) {
      const pct = Math.round((this._current / this._total) * 100);
      line += ` ${c.dim}(${this._current}/${this._total} - ${pct}%)${c.reset}`;

      // Add ETA if enabled
      if (this._showETA && this._startTime) {
        const eta = calculateETA(this._current, this._total, this._startTime);
        line += ` ${c.dim}ETA: ${eta}${c.reset}`;
      }
    }

    this._clearLine();
    this.stream.write(line);
  }

  /**
   * Clear the current line
   */
  _clearLine() {
    if (this.stream.isTTY) {
      this.stream.clearLine(0);
      this.stream.cursorTo(0);
    }
  }
}

/**
 * Progress bar for visual progress indication
 */
class ProgressBar {
  constructor(options = {}) {
    this.total = options.total || 100;
    this.width = options.width || 30;
    this.fillChar = options.fillChar || '█';
    this.emptyChar = options.emptyChar || '░';
    this.stream = options.stream || process.stderr;
    this.showPercent = options.showPercent !== false;
    this.showETA = options.showETA || false;
    this.label = options.label || '';

    this._current = 0;
    this._startTime = null;
  }

  /**
   * Start the progress bar
   * @param {number} total - Total items
   */
  start(total) {
    if (total !== undefined) this.total = total;
    this._startTime = Date.now();
    this._current = 0;
    this._render();
    return this;
  }

  /**
   * Update progress
   * @param {number} current - Current progress
   */
  update(current) {
    this._current = Math.min(current, this.total);
    this._render();
    return this;
  }

  /**
   * Increment progress by amount
   * @param {number} amount - Amount to increment
   */
  increment(amount = 1) {
    return this.update(this._current + amount);
  }

  /**
   * Complete the progress bar
   */
  complete() {
    this._current = this.total;
    this._render();
    this.stream.write('\n');
    return this;
  }

  /**
   * Render the progress bar
   */
  _render() {
    const percent = this.total > 0 ? this._current / this.total : 0;
    const filled = Math.round(percent * this.width);
    const empty = this.width - filled;

    let bar = `${this.fillChar.repeat(filled)}${this.emptyChar.repeat(empty)}`;

    // Color based on progress
    let barColor = 'red';
    if (percent >= 0.8) barColor = 'green';
    else if (percent >= 0.5) barColor = 'yellow';

    let line = '';
    if (this.label) {
      line += `${this.label} `;
    }
    line += `${c[barColor]}${bar}${c.reset}`;

    if (this.showPercent) {
      line += ` ${Math.round(percent * 100)}%`;
    }

    line += ` ${c.dim}(${this._current}/${this.total})${c.reset}`;

    if (this.showETA && this._startTime && this._current > 0) {
      const eta = calculateETA(this._current, this.total, this._startTime);
      line += ` ${c.dim}ETA: ${eta}${c.reset}`;
    }

    // Clear and render
    if (this.stream.isTTY) {
      this.stream.clearLine(0);
      this.stream.cursorTo(0);
    }
    this.stream.write(line);
  }
}

/**
 * Timing tracker for performance analysis
 */
class TimingTracker {
  constructor(options = {}) {
    this.name = options.name || 'operation';
    this.phases = {};
    this._currentPhase = null;
    this._startTime = null;
  }

  /**
   * Start overall timing
   */
  start() {
    this._startTime = Date.now();
    return this;
  }

  /**
   * Start a phase
   * @param {string} name - Phase name
   */
  startPhase(name) {
    if (this._currentPhase) {
      this.endPhase();
    }

    this._currentPhase = name;
    this.phases[name] = {
      start: Date.now(),
      end: null,
      duration: null,
    };

    return this;
  }

  /**
   * End the current phase
   */
  endPhase() {
    if (!this._currentPhase) return this;

    const phase = this.phases[this._currentPhase];
    if (phase) {
      phase.end = Date.now();
      phase.duration = phase.end - phase.start;
    }

    this._currentPhase = null;
    return this;
  }

  /**
   * Get total elapsed time
   * @returns {number} Elapsed milliseconds
   */
  getElapsed() {
    if (!this._startTime) return 0;
    return Date.now() - this._startTime;
  }

  /**
   * Get timing summary
   * @returns {Object} Timing summary
   */
  getSummary() {
    // End current phase if any
    if (this._currentPhase) {
      this.endPhase();
    }

    const total = this.getElapsed();
    const phaseStats = {};

    for (const [name, phase] of Object.entries(this.phases)) {
      phaseStats[name] = {
        duration: phase.duration || 0,
        durationFormatted: formatTime(phase.duration || 0),
        percent: total > 0 ? Math.round(((phase.duration || 0) / total) * 100) : 0,
      };
    }

    return {
      name: this.name,
      totalMs: total,
      totalFormatted: formatTime(total),
      phases: phaseStats,
      startTime: this._startTime ? new Date(this._startTime).toISOString() : null,
      endTime: new Date().toISOString(),
    };
  }

  /**
   * Format summary for display
   * @returns {string} Formatted summary
   */
  formatSummary() {
    const summary = this.getSummary();
    const lines = [];

    lines.push(`${c.cyan}Timing Summary: ${summary.name}${c.reset}`);
    lines.push(`${c.dim}${'─'.repeat(40)}${c.reset}`);

    // Sort phases by duration (descending)
    const sorted = Object.entries(summary.phases).sort((a, b) => b[1].duration - a[1].duration);

    for (const [name, stats] of sorted) {
      const bar = '█'.repeat(Math.max(1, Math.round(stats.percent / 5)));
      lines.push(
        `  ${name.padEnd(20)} ${stats.durationFormatted.padStart(8)} ${c.dim}(${stats.percent}%)${c.reset} ${c.green}${bar}${c.reset}`
      );
    }

    lines.push(`${c.dim}${'─'.repeat(40)}${c.reset}`);
    lines.push(`${c.bold}Total:${c.reset} ${summary.totalFormatted}`);

    return lines.join('\n');
  }

  /**
   * Export to JSON for trending
   * @returns {string} JSON string
   */
  toJSON() {
    return JSON.stringify(this.getSummary(), null, 2);
  }
}

/**
 * UiManager - Main class for unified UI feedback
 */
class UiManager {
  constructor(options = {}) {
    this.stream = options.stream || process.stderr;
    this.verbose = options.verbose || false;
    this.timing = options.timing || false;
    this.quiet = options.quiet || false;

    this._spinner = null;
    this._progress = null;
    this._tracker = null;
  }

  /**
   * Create a spinner
   * @param {Object} options - Spinner options
   * @returns {Spinner} Spinner instance
   */
  spinner(options = {}) {
    return new Spinner({ stream: this.stream, ...options });
  }

  /**
   * Create a progress bar
   * @param {Object} options - Progress bar options
   * @returns {ProgressBar} Progress bar instance
   */
  progressBar(options = {}) {
    return new ProgressBar({ stream: this.stream, ...options });
  }

  /**
   * Create a timing tracker
   * @param {string} name - Operation name
   * @returns {TimingTracker} Timing tracker instance
   */
  tracker(name) {
    return new TimingTracker({ name });
  }

  /**
   * Log a message (respects quiet mode)
   * @param {string} message - Message to log
   */
  log(message) {
    if (!this.quiet) {
      this.stream.write(message + '\n');
    }
  }

  /**
   * Log verbose message (only if verbose mode)
   * @param {string} message - Message to log
   */
  debug(message) {
    if (this.verbose && !this.quiet) {
      this.stream.write(`${c.dim}[debug] ${message}${c.reset}\n`);
    }
  }

  /**
   * Log success message
   * @param {string} message - Success message
   */
  success(message) {
    if (!this.quiet) {
      this.stream.write(`${c.green}✓${c.reset} ${message}\n`);
    }
  }

  /**
   * Log error message
   * @param {string} message - Error message
   */
  error(message) {
    this.stream.write(`${c.red}✗${c.reset} ${message}\n`);
  }

  /**
   * Log warning message
   * @param {string} message - Warning message
   */
  warn(message) {
    if (!this.quiet) {
      this.stream.write(`${c.yellow}⚠${c.reset} ${message}\n`);
    }
  }

  /**
   * Log info message
   * @param {string} message - Info message
   */
  info(message) {
    if (!this.quiet) {
      this.stream.write(`${c.blue}ℹ${c.reset} ${message}\n`);
    }
  }

  /**
   * Display a section header
   * @param {string} title - Section title
   */
  section(title) {
    if (!this.quiet) {
      this.stream.write(`\n${c.cyan}${c.bold}${title}${c.reset}\n`);
      this.stream.write(`${c.dim}${'─'.repeat(title.length)}${c.reset}\n`);
    }
  }

  /**
   * Display a list of items with progress
   * @param {Array} items - Items to display
   * @param {Function} formatter - Function to format each item
   */
  list(items, formatter = item => String(item)) {
    if (this.quiet) return;

    const total = items.length;
    items.forEach((item, i) => {
      const formatted = formatter(item, i);
      this.stream.write(`  ${c.dim}[${i + 1}/${total}]${c.reset} ${formatted}\n`);
    });
  }

  /**
   * Display timing summary if timing enabled
   * @param {TimingTracker} tracker - Timing tracker
   */
  showTiming(tracker) {
    if (this.timing && tracker) {
      this.stream.write('\n' + tracker.formatSummary() + '\n');
    }
  }
}

// Singleton instance
let _instance = null;

/**
 * Get singleton UiManager instance
 * @param {Object} options - Options
 * @returns {UiManager} UiManager instance
 */
function getUiManager(options = {}) {
  if (!_instance || options.forceNew) {
    _instance = new UiManager(options);
  }
  return _instance;
}

/**
 * Reset singleton (for testing)
 */
function resetUiManager() {
  _instance = null;
}

module.exports = {
  UiManager,
  Spinner,
  ProgressBar,
  TimingTracker,
  getUiManager,
  resetUiManager,
  formatTime,
  formatBytes,
  calculateETA,
  SPINNER_FRAMES,
  SPINNER_INTERVAL,
};
