/**
 * automation-registry.js - Scheduled Automation Management
 *
 * Manages scheduled automations for AgileFlow, enabling recurring tasks
 * like changelog generation, dependency audits, and tech debt scans.
 *
 * Architecture:
 * - No daemon required - automations run during user sessions
 * - Definitions stored in docs/09-agents/automation-schedule.json
 * - SessionStart hook checks for due automations
 * - Simple scheduling: daily, weekly, monthly, or custom intervals
 *
 * Usage:
 *   const { AutomationRegistry, getAutomationRegistry } = require('./automation-registry');
 *
 *   const registry = getAutomationRegistry();
 *
 *   // List automations
 *   const automations = registry.list();
 *
 *   // Get due automations
 *   const due = registry.getDue();
 *
 *   // Record that automation ran
 *   registry.recordRun('weekly-changelog', { success: true });
 */

'use strict';

const EventEmitter = require('events');
const fs = require('fs');
const path = require('path');
const { getProjectRoot, getAgentsDir } = require('../../lib/paths');

// Default configuration
const DEFAULT_SCHEDULE_FILE = 'automation-schedule.json';

// Schedule types
const ScheduleType = {
  DAILY: 'daily',
  WEEKLY: 'weekly',
  MONTHLY: 'monthly',
  INTERVAL: 'interval', // Custom interval in hours
  ON_SESSION: 'on_session', // Every session start
};

// Day names for weekly scheduling
const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

/**
 * Automation Registry - Manages scheduled automation definitions
 */
class AutomationRegistry extends EventEmitter {
  /**
   * @param {Object} [options={}] - Registry options
   * @param {string} [options.rootDir] - Project root directory
   * @param {string} [options.scheduleFile] - Custom schedule file name
   */
  constructor(options = {}) {
    super();

    this.rootDir = options.rootDir || getProjectRoot();
    this.scheduleFile = options.scheduleFile || DEFAULT_SCHEDULE_FILE;
    this.schedulePath = path.join(getAgentsDir(this.rootDir), this.scheduleFile);

    // Cache
    this._cache = null;
    this._cacheTime = 0;
    this._cacheTTL = 5000; // 5 second cache
  }

  // ==========================================================================
  // CRUD Operations
  // ==========================================================================

  /**
   * Load schedule from disk
   *
   * @param {boolean} [force=false] - Force reload ignoring cache
   * @returns {Object} Schedule data
   */
  load(force = false) {
    if (!force && this._cache && Date.now() - this._cacheTime < this._cacheTTL) {
      return this._cache;
    }

    if (!fs.existsSync(this.schedulePath)) {
      const defaultSchedule = this._createDefaultSchedule();
      this._cache = defaultSchedule;
      this._cacheTime = Date.now();
      return defaultSchedule;
    }

    try {
      const content = fs.readFileSync(this.schedulePath, 'utf8');
      this._cache = JSON.parse(content);
      this._cacheTime = Date.now();
      return this._cache;
    } catch (error) {
      this.emit('error', { type: 'load', error: error.message });
      return this._createDefaultSchedule();
    }
  }

  /**
   * Save schedule to disk
   *
   * @param {Object} schedule - Schedule data to save
   */
  save(schedule) {
    schedule.updated_at = new Date().toISOString();

    const dir = path.dirname(this.schedulePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Atomic write
    const tempPath = `${this.schedulePath}.tmp`;
    fs.writeFileSync(tempPath, JSON.stringify(schedule, null, 2) + '\n');
    fs.renameSync(tempPath, this.schedulePath);

    this._cache = schedule;
    this._cacheTime = Date.now();
    this.emit('saved', { automationCount: Object.keys(schedule.automations || {}).length });
  }

  /**
   * Create default schedule structure
   */
  _createDefaultSchedule() {
    return {
      schema_version: '1.0.0',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      automations: {},
      run_history: [],
    };
  }

  /**
   * List all automations
   *
   * @returns {Object[]} Array of automation objects
   */
  list() {
    const schedule = this.load();
    return Object.entries(schedule.automations || {}).map(([id, automation]) => ({
      id,
      ...automation,
    }));
  }

  /**
   * Get automation by ID
   *
   * @param {string} id - Automation ID
   * @returns {Object|null} Automation object or null
   */
  get(id) {
    const schedule = this.load();
    const automation = schedule.automations?.[id];
    return automation ? { id, ...automation } : null;
  }

  /**
   * Add or update an automation
   *
   * @param {string} id - Automation ID
   * @param {Object} automation - Automation definition
   * @returns {{ success: boolean, error?: string }}
   */
  set(id, automation) {
    // Validate automation
    const validation = this._validateAutomation(automation);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    const schedule = this.load(true);
    const isNew = !schedule.automations?.[id];

    schedule.automations = schedule.automations || {};
    schedule.automations[id] = {
      ...automation,
      created_at: isNew ? new Date().toISOString() : schedule.automations[id]?.created_at,
      updated_at: new Date().toISOString(),
    };

    this.save(schedule);
    this.emit(isNew ? 'created' : 'updated', { id, automation: schedule.automations[id] });

    return { success: true };
  }

  /**
   * Delete an automation
   *
   * @param {string} id - Automation ID
   * @returns {{ success: boolean, error?: string }}
   */
  delete(id) {
    const schedule = this.load(true);

    if (!schedule.automations?.[id]) {
      return { success: false, error: `Automation '${id}' not found` };
    }

    delete schedule.automations[id];
    this.save(schedule);
    this.emit('deleted', { id });

    return { success: true };
  }

  /**
   * Enable/disable an automation
   *
   * @param {string} id - Automation ID
   * @param {boolean} enabled - Enable state
   * @returns {{ success: boolean, error?: string }}
   */
  setEnabled(id, enabled) {
    const schedule = this.load(true);

    if (!schedule.automations?.[id]) {
      return { success: false, error: `Automation '${id}' not found` };
    }

    schedule.automations[id].enabled = enabled;
    schedule.automations[id].updated_at = new Date().toISOString();
    this.save(schedule);

    this.emit('toggled', { id, enabled });
    return { success: true };
  }

  // ==========================================================================
  // Scheduling Logic
  // ==========================================================================

  /**
   * Get automations that are due to run
   *
   * @returns {Object[]} Array of due automations
   */
  getDue() {
    const schedule = this.load();
    const now = new Date();
    const due = [];

    for (const [id, automation] of Object.entries(schedule.automations || {})) {
      if (!automation.enabled) continue;

      if (this._isDue(automation, now, schedule.run_history)) {
        due.push({ id, ...automation });
      }
    }

    return due;
  }

  /**
   * Check if an automation is due to run
   *
   * @param {Object} automation - Automation definition
   * @param {Date} now - Current time
   * @param {Object[]} history - Run history
   * @returns {boolean}
   */
  _isDue(automation, now, history) {
    const lastRun = this._getLastRun(automation.id || automation.name, history);
    const scheduleType = automation.schedule?.type || ScheduleType.DAILY;

    switch (scheduleType) {
      case ScheduleType.ON_SESSION:
        // Run every session
        return true;

      case ScheduleType.DAILY:
        // Run once per day
        if (!lastRun) return true;
        return !this._isSameDay(lastRun, now);

      case ScheduleType.WEEKLY:
        // Run on specified day of week
        if (!lastRun) return true;
        const targetDay = automation.schedule?.day || 0; // Default Sunday
        const dayIndex = typeof targetDay === 'string' ? DAYS.indexOf(targetDay.toLowerCase()) : targetDay;
        return now.getDay() === dayIndex && !this._isSameDay(lastRun, now);

      case ScheduleType.MONTHLY:
        // Run on specified day of month
        if (!lastRun) return true;
        const targetDate = automation.schedule?.date || 1;
        return now.getDate() === targetDate && !this._isSameDay(lastRun, now);

      case ScheduleType.INTERVAL:
        // Run every N hours
        if (!lastRun) return true;
        const intervalHours = automation.schedule?.hours || 24;
        const hoursSinceLastRun = (now - lastRun) / (1000 * 60 * 60);
        return hoursSinceLastRun >= intervalHours;

      default:
        return false;
    }
  }

  /**
   * Get last run time for an automation
   */
  _getLastRun(automationId, history) {
    const runs = (history || [])
      .filter(r => r.automation_id === automationId)
      .sort((a, b) => new Date(b.at) - new Date(a.at));

    return runs.length > 0 ? new Date(runs[0].at) : null;
  }

  /**
   * Check if two dates are the same day
   */
  _isSameDay(date1, date2) {
    return (
      date1.getFullYear() === date2.getFullYear() &&
      date1.getMonth() === date2.getMonth() &&
      date1.getDate() === date2.getDate()
    );
  }

  // ==========================================================================
  // Run History
  // ==========================================================================

  /**
   * Record an automation run
   *
   * @param {string} automationId - Automation ID
   * @param {Object} result - Run result
   */
  recordRun(automationId, result = {}) {
    const schedule = this.load(true);

    schedule.run_history = schedule.run_history || [];
    schedule.run_history.push({
      automation_id: automationId,
      at: new Date().toISOString(),
      success: result.success !== false,
      duration_ms: result.duration_ms,
      output: result.output?.slice(0, 1000), // Truncate long output
      error: result.error,
    });

    // Keep last 100 runs per automation (prevent unbounded growth)
    const MAX_HISTORY_PER_AUTOMATION = 100;
    const runCounts = {};
    schedule.run_history = schedule.run_history
      .reverse()
      .filter(run => {
        const id = run.automation_id;
        runCounts[id] = (runCounts[id] || 0) + 1;
        return runCounts[id] <= MAX_HISTORY_PER_AUTOMATION;
      })
      .reverse();

    this.save(schedule);
    this.emit('run_recorded', { automationId, result });
  }

  /**
   * Get run history for an automation
   *
   * @param {string} automationId - Automation ID
   * @param {number} [limit=10] - Max results
   * @returns {Object[]} Run history entries
   */
  getRunHistory(automationId, limit = 10) {
    const schedule = this.load();
    return (schedule.run_history || [])
      .filter(r => r.automation_id === automationId)
      .sort((a, b) => new Date(b.at) - new Date(a.at))
      .slice(0, limit);
  }

  // ==========================================================================
  // Validation
  // ==========================================================================

  /**
   * Validate automation definition
   */
  _validateAutomation(automation) {
    if (!automation.name) {
      return { valid: false, error: 'Automation must have a name' };
    }

    if (!automation.command && !automation.script) {
      return { valid: false, error: 'Automation must have a command or script' };
    }

    if (automation.schedule) {
      const validTypes = Object.values(ScheduleType);
      if (automation.schedule.type && !validTypes.includes(automation.schedule.type)) {
        return {
          valid: false,
          error: `Invalid schedule type: ${automation.schedule.type}. Valid: ${validTypes.join(', ')}`,
        };
      }

      if (automation.schedule.type === ScheduleType.WEEKLY && automation.schedule.day) {
        const day = automation.schedule.day;
        if (typeof day === 'string' && !DAYS.includes(day.toLowerCase())) {
          return { valid: false, error: `Invalid day: ${day}. Valid: ${DAYS.join(', ')}` };
        }
      }

      if (automation.schedule.type === ScheduleType.MONTHLY && automation.schedule.date) {
        const date = automation.schedule.date;
        if (date < 1 || date > 31) {
          return { valid: false, error: `Invalid date: ${date}. Must be 1-31` };
        }
      }

      if (automation.schedule.type === ScheduleType.INTERVAL && automation.schedule.hours) {
        const hours = automation.schedule.hours;
        if (hours < 1) {
          return { valid: false, error: `Invalid interval: ${hours}. Must be >= 1 hour` };
        }
      }
    }

    return { valid: true };
  }

  // ==========================================================================
  // Presets
  // ==========================================================================

  /**
   * Get preset automation templates
   *
   * @returns {Object} Map of preset ID to automation definition
   */
  static getPresets() {
    return {
      'weekly-changelog': {
        name: 'Weekly Changelog Generation',
        description: 'Generate changelog from commits every Sunday',
        command: '/agileflow:changelog ACTION=generate',
        schedule: { type: ScheduleType.WEEKLY, day: 'sunday' },
        timeout: 300000, // 5 minutes
        enabled: true,
      },
      'daily-ci-summary': {
        name: 'Daily CI Summary',
        description: 'Summarize CI failures from the past 24 hours',
        script: 'node .agileflow/scripts/ci-summary.js',
        schedule: { type: ScheduleType.DAILY },
        timeout: 120000, // 2 minutes
        enabled: true,
      },
      'monthly-debt-scan': {
        name: 'Monthly Tech Debt Scan',
        description: 'Scan for tech debt and generate report on the 1st',
        command: '/agileflow:debt ACTION=scan',
        schedule: { type: ScheduleType.MONTHLY, date: 1 },
        timeout: 600000, // 10 minutes
        enabled: true,
      },
      'weekly-dependency-audit': {
        name: 'Weekly Dependency Audit',
        description: 'Check for security vulnerabilities every Monday',
        script: 'npm audit --json || true',
        schedule: { type: ScheduleType.WEEKLY, day: 'monday' },
        timeout: 180000, // 3 minutes
        enabled: true,
      },
      'session-context-refresh': {
        name: 'Session Context Refresh',
        description: 'Refresh CONTEXT.md on every session',
        script: 'node .agileflow/scripts/context-loader.js',
        schedule: { type: ScheduleType.ON_SESSION },
        timeout: 30000, // 30 seconds
        enabled: false, // Disabled by default
      },
    };
  }

  /**
   * Install a preset automation
   *
   * @param {string} presetId - Preset ID
   * @returns {{ success: boolean, error?: string }}
   */
  installPreset(presetId) {
    const presets = AutomationRegistry.getPresets();
    const preset = presets[presetId];

    if (!preset) {
      return { success: false, error: `Unknown preset: ${presetId}` };
    }

    return this.set(presetId, preset);
  }
}

// ==========================================================================
// Singleton & Factory
// ==========================================================================

let _instance = null;

/**
 * Get singleton registry instance
 *
 * @param {Object} [options={}] - Options
 * @returns {AutomationRegistry}
 */
function getAutomationRegistry(options = {}) {
  if (!_instance || options.forceNew) {
    _instance = new AutomationRegistry(options);
  }
  return _instance;
}

/**
 * Reset singleton (for testing)
 */
function resetAutomationRegistry() {
  _instance = null;
}

module.exports = {
  AutomationRegistry,
  getAutomationRegistry,
  resetAutomationRegistry,
  ScheduleType,
  DAYS,
};
