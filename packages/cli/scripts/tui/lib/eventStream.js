'use strict';

/**
 * Event Stream - Real-time event monitoring from agent bus
 *
 * Watches docs/09-agents/bus/log.jsonl for new events and emits them
 * to subscribers. Handles file rotation and truncation gracefully.
 */

const fs = require('fs');
const path = require('path');
const EventEmitter = require('events');

// Get project root
let getProjectRoot;
try {
  getProjectRoot = require('../../../lib/paths').getProjectRoot;
} catch (e) {
  // Fallback
  getProjectRoot = () => process.cwd();
}

/**
 * EventStream class - watches agent bus log and emits events
 */
class EventStream extends EventEmitter {
  constructor(options = {}) {
    super();

    this.options = {
      // Path to log file (defaults to agent bus)
      logPath: options.logPath || path.join(
        getProjectRoot(),
        'docs',
        '09-agents',
        'bus',
        'log.jsonl'
      ),
      // Polling interval in ms (fallback if fs.watch fails)
      pollInterval: options.pollInterval || 1000,
      // Maximum events to keep in buffer
      maxBufferSize: options.maxBufferSize || 100,
      // Whether to emit historical events on start
      emitHistory: options.emitHistory || false,
      // How many historical events to emit
      historyLimit: options.historyLimit || 10
    };

    this.buffer = [];
    this.filePosition = 0;
    this.watcher = null;
    this.pollTimer = null;
    this.isWatching = false;
  }

  /**
   * Start watching the log file
   */
  start() {
    if (this.isWatching) return;

    // Check if file exists
    if (!fs.existsSync(this.options.logPath)) {
      this.emit('error', new Error(`Log file not found: ${this.options.logPath}`));
      // Continue anyway - file might be created later
    }

    // Get initial file size
    this._updateFilePosition();

    // Emit historical events if requested
    if (this.options.emitHistory) {
      this._emitHistory();
    }

    // Try to use fs.watch (more efficient)
    try {
      this.watcher = fs.watch(this.options.logPath, (eventType) => {
        if (eventType === 'change') {
          this._processNewLines();
        }
      });

      this.watcher.on('error', (err) => {
        this.emit('error', err);
        // Fall back to polling
        this._startPolling();
      });
    } catch (e) {
      // Fall back to polling
      this._startPolling();
    }

    this.isWatching = true;
    this.emit('started');
  }

  /**
   * Stop watching the log file
   */
  stop() {
    if (!this.isWatching) return;

    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }

    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }

    this.isWatching = false;
    this.emit('stopped');
  }

  /**
   * Start polling as fallback
   */
  _startPolling() {
    if (this.pollTimer) return;

    this.pollTimer = setInterval(() => {
      this._processNewLines();
    }, this.options.pollInterval);
  }

  /**
   * Update tracked file position
   */
  _updateFilePosition() {
    try {
      if (fs.existsSync(this.options.logPath)) {
        const stats = fs.statSync(this.options.logPath);
        this.filePosition = stats.size;
      }
    } catch (e) {
      // Ignore errors
    }
  }

  /**
   * Emit historical events from file start
   */
  _emitHistory() {
    try {
      if (!fs.existsSync(this.options.logPath)) return;

      const content = fs.readFileSync(this.options.logPath, 'utf8');
      const lines = content.trim().split('\n').filter(Boolean);

      // Get last N lines
      const historyLines = lines.slice(-this.options.historyLimit);

      for (const line of historyLines) {
        try {
          const event = JSON.parse(line);
          this._addToBuffer(event);
          this.emit('event', event);
        } catch (e) {
          // Skip invalid JSON
        }
      }
    } catch (e) {
      this.emit('error', e);
    }
  }

  /**
   * Process new lines added to the file
   */
  _processNewLines() {
    try {
      if (!fs.existsSync(this.options.logPath)) return;

      const stats = fs.statSync(this.options.logPath);

      // Handle file truncation (rotation)
      if (stats.size < this.filePosition) {
        this.filePosition = 0;
        this.emit('truncated');
      }

      // No new content
      if (stats.size <= this.filePosition) return;

      // Read new content
      const fd = fs.openSync(this.options.logPath, 'r');
      const bufferSize = stats.size - this.filePosition;
      const buffer = Buffer.alloc(bufferSize);

      fs.readSync(fd, buffer, 0, bufferSize, this.filePosition);
      fs.closeSync(fd);

      // Update position
      this.filePosition = stats.size;

      // Process lines
      const content = buffer.toString('utf8');
      const lines = content.split('\n').filter(Boolean);

      for (const line of lines) {
        try {
          const event = JSON.parse(line);
          this._addToBuffer(event);
          this.emit('event', event);
        } catch (e) {
          // Skip invalid JSON lines
        }
      }
    } catch (e) {
      this.emit('error', e);
    }
  }

  /**
   * Add event to buffer (with size limit)
   */
  _addToBuffer(event) {
    this.buffer.push(event);

    // Trim buffer if too large
    while (this.buffer.length > this.options.maxBufferSize) {
      this.buffer.shift();
    }
  }

  /**
   * Get buffered events
   */
  getBuffer() {
    return [...this.buffer];
  }

  /**
   * Clear buffer
   */
  clearBuffer() {
    this.buffer = [];
  }

  /**
   * Get events by type
   */
  getEventsByType(type) {
    return this.buffer.filter(e => e.type === type);
  }

  /**
   * Get events by agent
   */
  getEventsByAgent(agent) {
    return this.buffer.filter(e => e.agent === agent);
  }
}

/**
 * Create a singleton event stream instance
 */
let defaultStream = null;

function getDefaultStream() {
  if (!defaultStream) {
    defaultStream = new EventStream();
  }
  return defaultStream;
}

/**
 * Format event for display
 */
function formatEvent(event) {
  const timestamp = event.timestamp
    ? new Date(event.timestamp).toLocaleTimeString()
    : '';

  const agent = event.agent || 'unknown';
  const eventType = event.event || event.type || 'unknown';

  let message = '';

  switch (event.event) {
    case 'init':
      message = `Loop started: gate=${event.gate}, max=${event.max_iterations}`;
      break;
    case 'iteration':
      message = `Iteration ${event.iter}: value=${event.value}, passed=${event.passed}`;
      break;
    case 'passed':
      message = `Loop passed! final=${event.final_value}`;
      break;
    case 'failed':
      message = `Loop failed: ${event.reason}, final=${event.final_value}`;
      break;
    case 'abort':
      message = `Loop aborted: ${event.reason}`;
      break;
    default:
      message = JSON.stringify(event);
  }

  return {
    timestamp,
    agent,
    eventType,
    message,
    raw: event
  };
}

module.exports = {
  EventStream,
  getDefaultStream,
  formatEvent
};
