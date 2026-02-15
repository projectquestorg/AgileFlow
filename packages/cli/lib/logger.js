/**
 * logger.js - Centralized logger with level control
 *
 * Provides structured logging with configurable levels, colored output,
 * and automatic secret redaction on debug messages.
 *
 * Log Levels (ordered): debug < info < warn < error < silent
 *
 * Environment Variables:
 *   AGILEFLOW_LOG_LEVEL - Set minimum level (debug/info/warn/error/silent). Default: info
 *   AGILEFLOW_VERBOSE   - When 1/true, sets level to debug (shorthand)
 *   AGILEFLOW_DEBUG     - When 1, sets level to debug (backward compat with errors.js)
 *
 * Usage:
 *   const { createLogger } = require('../lib/logger');
 *   const log = createLogger('welcome');
 *
 *   log.debug('Loading model...');   // [DEBUG] [welcome] Loading model...
 *   log.info('Server started');      // [INFO] [welcome] Server started
 *   log.warn('Deprecated API');      // [WARN] [welcome] Deprecated API
 *   log.error('Connection failed');  // [ERROR] [welcome] Connection failed
 */

const { c } = require('./colors');
const { sanitizeDebugOutput } = require('./errors');

const LEVELS = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  silent: 4,
};

/**
 * Resolve the effective log level from environment variables.
 * Priority: AGILEFLOW_LOG_LEVEL > AGILEFLOW_VERBOSE > AGILEFLOW_DEBUG > default (info)
 */
function resolveLevel() {
  const explicit = process.env.AGILEFLOW_LOG_LEVEL;
  if (explicit && LEVELS[explicit] !== undefined) {
    return explicit;
  }

  const verbose = process.env.AGILEFLOW_VERBOSE;
  if (verbose === '1' || verbose === 'true') {
    return 'debug';
  }

  if (process.env.AGILEFLOW_DEBUG === '1') {
    return 'debug';
  }

  return 'info';
}

/**
 * Create a logger instance with an optional module name.
 *
 * @param {string} [moduleName] - Module name for log prefix (e.g. 'welcome', 'context-loader')
 * @param {object} [options] - Logger options
 * @param {string} [options.level] - Override log level (ignores env vars)
 * @param {boolean} [options.timestamps] - Include ISO timestamps in output (default: false)
 * @returns {{ debug: Function, info: Function, warn: Function, error: Function }}
 */
function createLogger(moduleName, options = {}) {
  const levelName = options.level || resolveLevel();
  const minLevel = LEVELS[levelName] !== undefined ? LEVELS[levelName] : LEVELS.info;
  const timestamps = options.timestamps || false;

  function formatPrefix(label, color) {
    const ts = timestamps ? `${new Date().toISOString()} ` : '';
    const mod = moduleName ? ` ${c.dim}[${moduleName}]${c.reset}` : '';
    return `${ts}${color}[${label}]${c.reset}${mod}`;
  }

  return {
    debug(...args) {
      if (minLevel > LEVELS.debug) return;
      const prefix = formatPrefix('DEBUG', c.dim);
      // Sanitize all args to prevent secret leakage in debug output
      const sanitized = args.map(arg => sanitizeDebugOutput(arg).sanitized);
      process.stderr.write(`${prefix} ${sanitized.join(' ')}\n`);
    },

    info(...args) {
      if (minLevel > LEVELS.info) return;
      const prefix = formatPrefix('INFO', c.cyan);
      process.stderr.write(`${prefix} ${args.join(' ')}\n`);
    },

    warn(...args) {
      if (minLevel > LEVELS.warn) return;
      const prefix = formatPrefix('WARN', c.yellow);
      process.stderr.write(`${prefix} ${args.join(' ')}\n`);
    },

    error(...args) {
      if (minLevel > LEVELS.error) return;
      const prefix = formatPrefix('ERROR', c.red);
      process.stderr.write(`${prefix} ${args.join(' ')}\n`);
    },
  };
}

module.exports = { createLogger, LEVELS };
