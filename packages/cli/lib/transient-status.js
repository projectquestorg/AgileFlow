/**
 * transient-status.js - TTY-Aware Transient Status Updates
 *
 * Provides in-place status updates that overwrite previous output
 * using carriage returns. Automatically falls back to line-based
 * output when not connected to a TTY.
 *
 * Features:
 * - TTY detection for smart formatting
 * - Carriage return updates (in-place overwrites)
 * - Multi-line status support
 * - Graceful degradation for non-TTY
 * - Safe for piping to files or other processes
 *
 * Usage:
 *   const { TransientStatus } = require('./transient-status');
 *
 *   const status = new TransientStatus();
 *   status.update('Processing file 1 of 10...');
 *   // ... do work ...
 *   status.update('Processing file 2 of 10...');
 *   // ... when done ...
 *   status.done('Processed 10 files');
 */

const { c } = require('./colors');

/**
 * TransientStatus - Single-line in-place status updates
 *
 * Updates overwrite the previous line when connected to a TTY.
 * Falls back to printing each update on a new line otherwise.
 */
class TransientStatus {
  /**
   * @param {Object} [options={}] - Configuration options
   * @param {boolean} [options.isTTY] - Override TTY detection
   * @param {NodeJS.WriteStream} [options.stream=process.stdout] - Output stream
   * @param {string} [options.prefix=''] - Prefix for all messages
   * @param {boolean} [options.showTimestamp=false] - Include timestamp
   */
  constructor(options = {}) {
    this.stream = options.stream || process.stdout;
    this.isTTY = options.isTTY !== undefined ? options.isTTY : this.stream.isTTY === true;
    this.prefix = options.prefix || '';
    this.showTimestamp = options.showTimestamp || false;
    this.lastLineLength = 0;
    this.isActive = false;
    this.startTime = null;
  }

  /**
   * Format timestamp if enabled
   * @returns {string}
   * @private
   */
  _formatTimestamp() {
    if (!this.showTimestamp) return '';
    const now = new Date();
    const time = now.toTimeString().slice(0, 8);
    return this.isTTY ? `${c.dim}[${time}]${c.reset} ` : `[${time}] `;
  }

  /**
   * Clear the current line
   * @private
   */
  _clearLine() {
    if (this.isTTY && this.lastLineLength > 0) {
      this.stream.clearLine(0);
      this.stream.cursorTo(0);
    }
  }

  /**
   * Update the status message (overwrites previous in TTY mode)
   *
   * @param {string} message - Status message
   * @returns {TransientStatus} this for chaining
   */
  update(message) {
    if (!this.isActive) {
      this.isActive = true;
      this.startTime = Date.now();
    }

    const timestamp = this._formatTimestamp();
    const fullMessage = `${timestamp}${this.prefix}${message}`;

    if (this.isTTY) {
      this._clearLine();
      this.stream.write(fullMessage);
      this.lastLineLength = fullMessage.length;
    } else {
      // Non-TTY: print on new line each time
      this.stream.write(fullMessage + '\n');
    }

    return this;
  }

  /**
   * Update with a progress indicator
   *
   * @param {number} current - Current item
   * @param {number} total - Total items
   * @param {string} [message] - Optional message
   * @returns {TransientStatus} this for chaining
   */
  progress(current, total, message = '') {
    const percent = total > 0 ? Math.round((current / total) * 100) : 0;
    const progressText = `[${current}/${total}] ${percent}%`;
    const fullMessage = message ? `${progressText} ${message}` : progressText;

    return this.update(fullMessage);
  }

  /**
   * Clear status and print a final success message
   *
   * @param {string} [message] - Final message
   * @returns {TransientStatus} this for chaining
   */
  done(message = '') {
    this._clearLine();

    if (message) {
      const elapsed = this.startTime ? Date.now() - this.startTime : 0;
      const elapsedStr = elapsed > 400 ? ` ${c.dim}(${formatMs(elapsed)})${c.reset}` : '';

      if (this.isTTY) {
        this.stream.write(`${c.green}✓${c.reset} ${message}${elapsedStr}\n`);
      } else {
        this.stream.write(`✓ ${message}\n`);
      }
    }

    this.isActive = false;
    this.lastLineLength = 0;
    return this;
  }

  /**
   * Clear status and print a final failure message
   *
   * @param {string} [message] - Final message
   * @returns {TransientStatus} this for chaining
   */
  fail(message = '') {
    this._clearLine();

    if (message) {
      if (this.isTTY) {
        this.stream.write(`${c.red}✗${c.reset} ${message}\n`);
      } else {
        this.stream.write(`✗ ${message}\n`);
      }
    }

    this.isActive = false;
    this.lastLineLength = 0;
    return this;
  }

  /**
   * Clear status and print a final warning message
   *
   * @param {string} [message] - Final message
   * @returns {TransientStatus} this for chaining
   */
  warn(message = '') {
    this._clearLine();

    if (message) {
      if (this.isTTY) {
        this.stream.write(`${c.yellow}⚠${c.reset} ${message}\n`);
      } else {
        this.stream.write(`⚠ ${message}\n`);
      }
    }

    this.isActive = false;
    this.lastLineLength = 0;
    return this;
  }

  /**
   * Clear the status without printing anything
   *
   * @returns {TransientStatus} this for chaining
   */
  clear() {
    this._clearLine();
    if (this.isTTY) {
      this.stream.write('\n');
    }
    this.isActive = false;
    this.lastLineLength = 0;
    return this;
  }
}

/**
 * MultiLineStatus - Multi-line status that can update individual lines
 *
 * Useful for showing progress of multiple concurrent operations.
 * Falls back to sequential updates when not connected to a TTY.
 */
class MultiLineStatus {
  /**
   * @param {number} lineCount - Number of status lines
   * @param {Object} [options={}] - Configuration options
   * @param {boolean} [options.isTTY] - Override TTY detection
   * @param {NodeJS.WriteStream} [options.stream=process.stdout] - Output stream
   */
  constructor(lineCount, options = {}) {
    this.lineCount = lineCount;
    this.stream = options.stream || process.stdout;
    this.isTTY = options.isTTY !== undefined ? options.isTTY : this.stream.isTTY === true;
    this.lines = new Array(lineCount).fill('');
    this.isActive = false;
  }

  /**
   * Start displaying the multi-line status
   * @returns {MultiLineStatus} this for chaining
   */
  start() {
    if (this.isTTY) {
      // Print empty lines to reserve space
      for (let i = 0; i < this.lineCount; i++) {
        this.stream.write('\n');
      }
      // Move cursor back up
      this.stream.moveCursor(0, -this.lineCount);
    }
    this.isActive = true;
    return this;
  }

  /**
   * Update a specific line
   *
   * @param {number} lineIndex - Line index (0-based)
   * @param {string} message - Message for this line
   * @returns {MultiLineStatus} this for chaining
   */
  updateLine(lineIndex, message) {
    if (lineIndex < 0 || lineIndex >= this.lineCount) return this;

    this.lines[lineIndex] = message;

    if (this.isTTY) {
      // Save cursor position
      const currentLine = lineIndex;

      // Move to the correct line
      if (currentLine > 0) {
        this.stream.moveCursor(0, currentLine);
      }

      // Clear and write
      this.stream.clearLine(0);
      this.stream.cursorTo(0);
      this.stream.write(message);

      // Move cursor back to start position
      if (currentLine > 0) {
        this.stream.moveCursor(0, -currentLine);
      }
      this.stream.cursorTo(0);
    } else {
      // Non-TTY: just print the update
      this.stream.write(`[${lineIndex + 1}/${this.lineCount}] ${message}\n`);
    }

    return this;
  }

  /**
   * Finish and move cursor past all lines
   * @returns {MultiLineStatus} this for chaining
   */
  done() {
    if (this.isTTY) {
      // Move cursor to end
      this.stream.moveCursor(0, this.lineCount);
      this.stream.write('\n');
    }
    this.isActive = false;
    return this;
  }

  /**
   * Clear all lines
   * @returns {MultiLineStatus} this for chaining
   */
  clear() {
    if (this.isTTY) {
      for (let i = 0; i < this.lineCount; i++) {
        this.stream.clearLine(0);
        if (i < this.lineCount - 1) {
          this.stream.moveCursor(0, 1);
        }
      }
      // Move back to start
      this.stream.moveCursor(0, -(this.lineCount - 1));
      this.stream.cursorTo(0);
    }
    this.lines.fill('');
    this.isActive = false;
    return this;
  }
}

/**
 * Simple function to create and use a transient status in one go
 *
 * @param {string} initialMessage - Initial status message
 * @param {Function} fn - Async function to run
 * @param {Object} [options={}] - TransientStatus options
 * @returns {Promise<any>} Result of the function
 *
 * @example
 * const result = await withStatus('Processing...', async (status) => {
 *   for (let i = 0; i < 10; i++) {
 *     status.update(`Processing item ${i + 1}...`);
 *     await doWork(i);
 *   }
 *   return 'done';
 * });
 */
async function withStatus(initialMessage, fn, options = {}) {
  const status = new TransientStatus(options);
  status.update(initialMessage);

  try {
    const result = await fn(status);
    return result;
  } catch (error) {
    status.fail(error.message);
    throw error;
  }
}

/**
 * Format milliseconds as human-readable duration
 * @param {number} ms - Milliseconds
 * @returns {string} Formatted duration
 */
function formatMs(ms) {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.round((ms % 60000) / 1000);
  return `${minutes}m ${seconds}s`;
}

/**
 * Check if output is going to a TTY
 * @param {NodeJS.WriteStream} [stream=process.stdout] - Stream to check
 * @returns {boolean}
 */
function isTTY(stream = process.stdout) {
  return stream.isTTY === true;
}

module.exports = {
  TransientStatus,
  MultiLineStatus,
  withStatus,
  formatMs,
  isTTY,
};
