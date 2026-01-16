'use strict';

/**
 * Loop Control - Pause/Resume mechanism for Ralph Loop
 *
 * Provides file-based pause/resume signals that ralph-loop.js checks
 * between iterations. This allows external control (TUI, CLI) to
 * pause ongoing loops without interrupting mid-work.
 *
 * Mechanism:
 *   - Pause: Create .agileflow/sessions/loop.pause file
 *   - Resume: Remove the pause file
 *   - Status: Check if file exists
 */

const fs = require('fs');
const path = require('path');
const EventEmitter = require('events');

// Get project root
let getProjectRoot;
try {
  getProjectRoot = require('../../../lib/paths').getProjectRoot;
} catch (e) {
  getProjectRoot = () => process.cwd();
}

// Get safe JSON utilities
let safeReadJSON, safeWriteJSON;
try {
  const errors = require('../../../lib/errors');
  safeReadJSON = errors.safeReadJSON;
  safeWriteJSON = errors.safeWriteJSON;
} catch (e) {
  safeReadJSON = (path, opts = {}) => {
    try {
      const data = JSON.parse(fs.readFileSync(path, 'utf8'));
      return { ok: true, data };
    } catch (e) {
      return { ok: false, error: e.message, data: opts.defaultValue };
    }
  };
  safeWriteJSON = (path, data) => {
    fs.writeFileSync(path, JSON.stringify(data, null, 2));
    return { ok: true };
  };
}

/**
 * Get pause file path
 */
function getPauseFilePath(sessionId = 'default') {
  const rootDir = getProjectRoot();
  return path.join(rootDir, '.agileflow', 'sessions', `${sessionId}.pause`);
}

/**
 * Get session state path
 */
function getSessionStatePath() {
  const rootDir = getProjectRoot();
  return path.join(rootDir, 'docs', '09-agents', 'session-state.json');
}

/**
 * Check if loop is paused
 */
function isPaused(sessionId = 'default') {
  const pauseFile = getPauseFilePath(sessionId);
  return fs.existsSync(pauseFile);
}

/**
 * Pause the loop
 * Creates pause file and optionally updates session state
 */
function pause(sessionId = 'default', reason = 'user_request') {
  const pauseFile = getPauseFilePath(sessionId);

  // Ensure directory exists
  const dir = path.dirname(pauseFile);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // Create pause file with metadata
  const pauseData = {
    paused_at: new Date().toISOString(),
    reason,
    session_id: sessionId
  };

  fs.writeFileSync(pauseFile, JSON.stringify(pauseData, null, 2));

  // Update session state
  const statePath = getSessionStatePath();
  const result = safeReadJSON(statePath, { defaultValue: {} });
  const state = result.ok ? result.data : {};

  if (state.ralph_loop) {
    state.ralph_loop.paused = true;
    state.ralph_loop.paused_at = pauseData.paused_at;
    state.ralph_loop.pause_reason = reason;
    safeWriteJSON(statePath, state);
  }

  return pauseData;
}

/**
 * Resume the loop
 * Removes pause file and updates session state
 */
function resume(sessionId = 'default') {
  const pauseFile = getPauseFilePath(sessionId);

  // Get pause data before removing
  let pauseData = null;
  if (fs.existsSync(pauseFile)) {
    try {
      pauseData = JSON.parse(fs.readFileSync(pauseFile, 'utf8'));
    } catch (e) {
      // Ignore parse errors
    }
    fs.unlinkSync(pauseFile);
  }

  // Update session state
  const statePath = getSessionStatePath();
  const result = safeReadJSON(statePath, { defaultValue: {} });
  const state = result.ok ? result.data : {};

  if (state.ralph_loop) {
    state.ralph_loop.paused = false;
    state.ralph_loop.resumed_at = new Date().toISOString();
    delete state.ralph_loop.paused_at;
    delete state.ralph_loop.pause_reason;
    safeWriteJSON(statePath, state);
  }

  return {
    resumed_at: new Date().toISOString(),
    was_paused: pauseData !== null,
    pause_data: pauseData
  };
}

/**
 * Get loop status
 */
function getLoopStatus() {
  const statePath = getSessionStatePath();
  const result = safeReadJSON(statePath, { defaultValue: {} });
  const state = result.ok ? result.data : {};

  const loop = state.ralph_loop;
  if (!loop || !loop.enabled) {
    return {
      active: false,
      paused: false,
      message: 'Loop not active'
    };
  }

  const paused = isPaused() || loop.paused;

  return {
    active: true,
    paused,
    epic: loop.epic,
    currentStory: loop.current_story,
    iteration: loop.iteration || 0,
    maxIterations: loop.max_iterations || 20,
    visualMode: loop.visual_mode || false,
    coverageMode: loop.coverage_mode || false,
    coverageThreshold: loop.coverage_threshold || 80,
    coverageCurrent: loop.coverage_current || 0,
    pausedAt: loop.paused_at,
    pauseReason: loop.pause_reason,
    startedAt: loop.started_at
  };
}

/**
 * Stop the loop completely
 */
function stopLoop(reason = 'user_request') {
  const statePath = getSessionStatePath();
  const result = safeReadJSON(statePath, { defaultValue: {} });
  const state = result.ok ? result.data : {};

  if (state.ralph_loop) {
    state.ralph_loop.enabled = false;
    state.ralph_loop.stopped_at = new Date().toISOString();
    state.ralph_loop.stopped_reason = reason;
    safeWriteJSON(statePath, state);
  }

  // Also remove any pause file
  const pauseFile = getPauseFilePath();
  if (fs.existsSync(pauseFile)) {
    fs.unlinkSync(pauseFile);
  }

  return {
    stopped: true,
    reason,
    stopped_at: new Date().toISOString()
  };
}

/**
 * LoopController class - EventEmitter for loop control
 *
 * Emits events:
 *   - 'paused' - Loop was paused
 *   - 'resumed' - Loop was resumed
 *   - 'stopped' - Loop was stopped
 *   - 'statusChange' - Loop status changed
 */
class LoopController extends EventEmitter {
  constructor(options = {}) {
    super();

    this.sessionId = options.sessionId || 'default';
    this.pollInterval = options.pollInterval || 1000;
    this.lastStatus = null;
    this.pollTimer = null;
    this.isWatching = false;
  }

  /**
   * Start watching for status changes
   */
  startWatching() {
    if (this.isWatching) return;

    this.lastStatus = getLoopStatus();
    this.isWatching = true;

    this.pollTimer = setInterval(() => {
      this._checkStatus();
    }, this.pollInterval);

    this.emit('started');
  }

  /**
   * Stop watching
   */
  stopWatching() {
    if (!this.isWatching) return;

    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }

    this.isWatching = false;
    this.emit('stopped');
  }

  /**
   * Check for status changes
   */
  _checkStatus() {
    const newStatus = getLoopStatus();

    if (!this.lastStatus) {
      this.lastStatus = newStatus;
      return;
    }

    // Check for changes
    if (this.lastStatus.paused !== newStatus.paused) {
      if (newStatus.paused) {
        this.emit('paused', {
          pausedAt: newStatus.pausedAt,
          reason: newStatus.pauseReason
        });
      } else {
        this.emit('resumed');
      }
    }

    if (this.lastStatus.active !== newStatus.active) {
      if (!newStatus.active && this.lastStatus.active) {
        this.emit('loopStopped');
      }
    }

    if (this.lastStatus.iteration !== newStatus.iteration) {
      this.emit('iteration', {
        iteration: newStatus.iteration,
        maxIterations: newStatus.maxIterations
      });
    }

    if (this.lastStatus.currentStory !== newStatus.currentStory) {
      this.emit('storyChange', {
        previousStory: this.lastStatus.currentStory,
        currentStory: newStatus.currentStory
      });
    }

    // Always emit statusChange if anything changed
    const changed = JSON.stringify(this.lastStatus) !== JSON.stringify(newStatus);
    if (changed) {
      this.emit('statusChange', newStatus);
    }

    this.lastStatus = newStatus;
  }

  /**
   * Pause the loop
   */
  pause(reason = 'user_request') {
    const result = pause(this.sessionId, reason);
    this._checkStatus();
    return result;
  }

  /**
   * Resume the loop
   */
  resume() {
    const result = resume(this.sessionId);
    this._checkStatus();
    return result;
  }

  /**
   * Stop the loop
   */
  stop(reason = 'user_request') {
    const result = stopLoop(reason);
    this._checkStatus();
    return result;
  }

  /**
   * Get current status
   */
  getStatus() {
    return getLoopStatus();
  }
}

/**
 * Default controller instance
 */
let defaultController = null;

function getDefaultController() {
  if (!defaultController) {
    defaultController = new LoopController();
  }
  return defaultController;
}

module.exports = {
  isPaused,
  pause,
  resume,
  getLoopStatus,
  stopLoop,
  getPauseFilePath,
  LoopController,
  getDefaultController
};
