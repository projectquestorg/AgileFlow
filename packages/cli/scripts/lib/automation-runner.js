/**
 * automation-runner.js - Execute Scheduled Automations
 *
 * Executes automations with:
 * - Timeout protection (prevents runaway processes)
 * - Retry logic with exponential backoff
 * - Error handling and logging
 * - Loop detection to prevent infinite automation chains
 *
 * Architecture:
 * - Spawns automation in isolated child process
 * - Captures stdout/stderr for logging
 * - Reports results to AutomationRegistry
 * - Emits events for observability
 *
 * Usage:
 *   const { AutomationRunner, getAutomationRunner } = require('./automation-runner');
 *
 *   const runner = getAutomationRunner();
 *
 *   // Run a specific automation
 *   const result = await runner.run('weekly-changelog');
 *
 *   // Run all due automations
 *   const results = await runner.runDue();
 */

'use strict';

const EventEmitter = require('events');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { getAutomationRegistry } = require('./automation-registry');
const { getProjectRoot, getBusLogPath } = require('../../lib/paths');

// Default configuration
const DEFAULT_TIMEOUT = 300000; // 5 minutes
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_RETRY_DELAY = 5000; // 5 seconds
const MAX_OUTPUT_SIZE = 10000; // Max output to capture

// Loop detection
const LOOP_WINDOW_MS = 300000; // 5 minutes
const MAX_RUNS_IN_WINDOW = 3;

/**
 * Automation Runner - Execute scheduled automations
 */
class AutomationRunner extends EventEmitter {
  /**
   * @param {Object} [options={}] - Runner options
   * @param {string} [options.rootDir] - Project root directory
   * @param {number} [options.defaultTimeout] - Default timeout (ms)
   * @param {number} [options.maxRetries] - Max retry attempts
   * @param {number} [options.retryDelay] - Initial retry delay (ms)
   */
  constructor(options = {}) {
    super();

    this.rootDir = options.rootDir || getProjectRoot();
    this.defaultTimeout = options.defaultTimeout || DEFAULT_TIMEOUT;
    this.maxRetries = options.maxRetries || DEFAULT_MAX_RETRIES;
    this.retryDelay = options.retryDelay || DEFAULT_RETRY_DELAY;

    // Get registry
    this._registry = getAutomationRegistry({ rootDir: this.rootDir });

    // Run tracking for loop detection
    this._recentRuns = new Map();

    // Active processes
    this._activeProcesses = new Map();

    // Stats
    this._stats = {
      total: 0,
      successful: 0,
      failed: 0,
      timedOut: 0,
      skippedLoop: 0,
    };
  }

  // ==========================================================================
  // Run Operations
  // ==========================================================================

  /**
   * Run a specific automation by ID
   *
   * @param {string} automationId - Automation ID
   * @param {Object} [options={}] - Run options
   * @returns {Promise<{ success: boolean, output?: string, error?: string, duration_ms: number }>}
   */
  async run(automationId, options = {}) {
    const automation = this._registry.get(automationId);

    if (!automation) {
      return { success: false, error: `Automation '${automationId}' not found`, duration_ms: 0 };
    }

    // Loop detection
    if (this._detectLoop(automationId)) {
      this._stats.skippedLoop++;
      this.emit('loop_detected', { automationId });
      return {
        success: false,
        error: `Loop detected: ${automationId} ran ${MAX_RUNS_IN_WINDOW} times in ${LOOP_WINDOW_MS / 1000}s`,
        duration_ms: 0,
      };
    }

    this._stats.total++;
    this.emit('started', { automationId, automation });

    const startTime = Date.now();
    let lastError = null;
    let result = null;

    // Retry loop
    const maxRetries = options.retries ?? this.maxRetries;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      if (attempt > 0) {
        // Wait before retry with exponential backoff
        const delay = this.retryDelay * Math.pow(2, attempt - 1);
        this.emit('retrying', { automationId, attempt, delay });
        await this._sleep(delay);
      }

      try {
        result = await this._execute(automation, options);

        if (result.success) {
          this._stats.successful++;
          this._recordRun(automationId);
          this._registry.recordRun(automationId, result);
          this.emit('completed', { automationId, result, attempt });
          return result;
        }

        lastError = result.error;
      } catch (error) {
        lastError = error.message;
        if (error.timedOut) {
          this._stats.timedOut++;
        }
      }
    }

    // All retries failed
    this._stats.failed++;
    const finalResult = {
      success: false,
      error: lastError || 'Unknown error',
      duration_ms: Date.now() - startTime,
    };

    this._registry.recordRun(automationId, finalResult);
    this.emit('failed', { automationId, result: finalResult });

    return finalResult;
  }

  /**
   * Run all due automations
   *
   * @param {Object} [options={}] - Run options
   * @returns {Promise<{ ran: number, results: Object[] }>}
   */
  async runDue(options = {}) {
    const due = this._registry.getDue();

    if (due.length === 0) {
      return { ran: 0, results: [] };
    }

    this.emit('running_due', { count: due.length, automations: due.map(a => a.id) });

    const results = [];

    // Run sequentially to avoid overwhelming system
    for (const automation of due) {
      const result = await this.run(automation.id, options);
      results.push({ id: automation.id, ...result });
    }

    return { ran: results.length, results };
  }

  // ==========================================================================
  // Execution
  // ==========================================================================

  /**
   * Execute an automation
   *
   * @param {Object} automation - Automation definition
   * @param {Object} [options={}] - Execution options
   * @returns {Promise<{ success: boolean, output?: string, error?: string, duration_ms: number }>}
   */
  async _execute(automation, options = {}) {
    const timeout = automation.timeout || this.defaultTimeout;
    const startTime = Date.now();

    return new Promise((resolve, reject) => {
      let output = '';
      let errorOutput = '';
      let killed = false;

      // Determine command
      let command, args, shell;

      if (automation.script) {
        // Direct script execution
        shell = true;
        command = automation.script;
        args = [];
      } else if (automation.command) {
        // AgileFlow command (run through node)
        if (automation.command.startsWith('/agileflow:')) {
          // It's a slash command - would need to invoke Claude
          // For now, we'll treat it as a shell command
          shell = true;
          command = `echo "Slash command: ${automation.command}" && exit 0`;
          args = [];
        } else {
          shell = true;
          command = automation.command;
          args = [];
        }
      } else {
        return resolve({
          success: false,
          error: 'No command or script defined',
          duration_ms: 0,
        });
      }

      // Spawn process
      const proc = spawn(command, args, {
        cwd: this.rootDir,
        shell,
        env: {
          ...process.env,
          AGILEFLOW_AUTOMATION: automation.id || automation.name,
          AGILEFLOW_ROOT: this.rootDir,
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      const processId = `${automation.id || automation.name}-${Date.now()}`;
      this._activeProcesses.set(processId, proc);

      // Capture output
      proc.stdout.on('data', data => {
        if (output.length < MAX_OUTPUT_SIZE) {
          output += data.toString();
        }
      });

      proc.stderr.on('data', data => {
        if (errorOutput.length < MAX_OUTPUT_SIZE) {
          errorOutput += data.toString();
        }
      });

      // Set timeout
      const timeoutId = setTimeout(() => {
        killed = true;
        proc.kill('SIGTERM');

        // Force kill after 5 seconds if still running
        setTimeout(() => {
          if (this._activeProcesses.has(processId)) {
            proc.kill('SIGKILL');
          }
        }, 5000);
      }, timeout);

      // Handle completion
      proc.on('close', code => {
        clearTimeout(timeoutId);
        this._activeProcesses.delete(processId);

        const duration_ms = Date.now() - startTime;

        if (killed) {
          const error = new Error(`Automation timed out after ${timeout}ms`);
          error.timedOut = true;
          reject(error);
          return;
        }

        if (code === 0) {
          resolve({
            success: true,
            output: output.trim(),
            duration_ms,
          });
        } else {
          resolve({
            success: false,
            error: errorOutput.trim() || `Process exited with code ${code}`,
            output: output.trim(),
            duration_ms,
          });
        }
      });

      proc.on('error', error => {
        clearTimeout(timeoutId);
        this._activeProcesses.delete(processId);
        reject(error);
      });
    });
  }

  // ==========================================================================
  // Loop Detection
  // ==========================================================================

  /**
   * Check if automation is in a loop
   *
   * @param {string} automationId - Automation ID
   * @returns {boolean} True if loop detected
   */
  _detectLoop(automationId) {
    const now = Date.now();
    const runs = this._recentRuns.get(automationId) || [];

    // Clean old runs
    const recentRuns = runs.filter(time => now - time < LOOP_WINDOW_MS);
    this._recentRuns.set(automationId, recentRuns);

    return recentRuns.length >= MAX_RUNS_IN_WINDOW;
  }

  /**
   * Record a run for loop detection
   *
   * @param {string} automationId - Automation ID
   */
  _recordRun(automationId) {
    const runs = this._recentRuns.get(automationId) || [];
    runs.push(Date.now());
    this._recentRuns.set(automationId, runs);
  }

  // ==========================================================================
  // Utilities
  // ==========================================================================

  /**
   * Sleep utility
   */
  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Log to bus (append message to bus/log.jsonl)
   *
   * @param {Object} message - Message to log
   */
  logToBus(message) {
    const busPath = getBusLogPath(this.rootDir);
    const dir = path.dirname(busPath);

    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const entry = {
      ts: new Date().toISOString(),
      from: 'AUTOMATION',
      type: 'automation',
      ...message,
    };

    fs.appendFileSync(busPath, JSON.stringify(entry) + '\n');
  }

  // ==========================================================================
  // Status & Control
  // ==========================================================================

  /**
   * Get runner statistics
   *
   * @returns {Object} Stats object
   */
  getStats() {
    return {
      ...this._stats,
      successRate:
        this._stats.total > 0
          ? ((this._stats.successful / this._stats.total) * 100).toFixed(1) + '%'
          : '0%',
      activeProcesses: this._activeProcesses.size,
    };
  }

  /**
   * Get status of due automations
   *
   * @returns {Object} Status object
   */
  getDueStatus() {
    const due = this._registry.getDue();
    const all = this._registry.list();

    return {
      total: all.length,
      enabled: all.filter(a => a.enabled).length,
      due: due.length,
      dueAutomations: due.map(a => ({
        id: a.id,
        name: a.name,
        schedule: a.schedule,
      })),
    };
  }

  /**
   * Cancel all running automations
   */
  cancelAll() {
    for (const [id, proc] of this._activeProcesses) {
      proc.kill('SIGTERM');
      this.emit('cancelled', { processId: id });
    }
    this._activeProcesses.clear();
  }
}

// ==========================================================================
// Singleton & Factory
// ==========================================================================

let _instance = null;

/**
 * Get singleton runner instance
 *
 * @param {Object} [options={}] - Options
 * @returns {AutomationRunner}
 */
function getAutomationRunner(options = {}) {
  if (!_instance || options.forceNew) {
    _instance = new AutomationRunner(options);
  }
  return _instance;
}

/**
 * Reset singleton (for testing)
 */
function resetAutomationRunner() {
  if (_instance) {
    _instance.cancelAll();
  }
  _instance = null;
}

module.exports = {
  AutomationRunner,
  getAutomationRunner,
  resetAutomationRunner,
  DEFAULT_TIMEOUT,
  DEFAULT_MAX_RETRIES,
  DEFAULT_RETRY_DELAY,
  LOOP_WINDOW_MS,
  MAX_RUNS_IN_WINDOW,
};
