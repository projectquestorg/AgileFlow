/**
 * errors.js - Safe error handling wrappers
 *
 * Provides consistent error handling patterns across AgileFlow scripts.
 * All wrappers return Result objects: { ok: boolean, data?: T, error?: string }
 *
 * Usage:
 *   const { safeReadJSON, safeWriteJSON, safeExec } = require('../lib/errors');
 *
 *   const result = safeReadJSON('/path/to/file.json');
 *   if (result.ok) {
 *     console.log(result.data);
 *   } else {
 *     console.error(result.error);
 *   }
 */

const fs = require('fs');
const { execSync } = require('child_process');

// Debug logging (opt-in via AGILEFLOW_DEBUG=1)
const DEBUG = process.env.AGILEFLOW_DEBUG === '1';

/**
 * Patterns for detecting secrets that should be redacted from debug output.
 * Each pattern captures the sensitive portion for replacement.
 * ORDER MATTERS: More specific patterns should come before generic ones.
 */
const SECRET_PATTERNS = [
  // JWT tokens (header.payload.signature format) - MUST be before generic token pattern
  {
    pattern: /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,
    replacement: '***JWT_REDACTED***',
  },

  // NPM tokens - MUST be before generic token pattern
  { pattern: /\bnpm_[A-Za-z0-9]{36}/g, replacement: '***NPM_TOKEN_REDACTED***' },
  {
    pattern: /\/\/registry\.npmjs\.org\/:_authToken=([A-Za-z0-9_-]+)/g,
    replacement: '//registry.npmjs.org/:_authToken=***REDACTED***',
  },

  // GitHub tokens - MUST be before generic token pattern
  { pattern: /\b(ghp_[A-Za-z0-9]{36})/g, replacement: '***GITHUB_TOKEN_REDACTED***' },
  { pattern: /\b(github_pat_[A-Za-z0-9_]{22,})/g, replacement: '***GITHUB_PAT_REDACTED***' },

  // AWS keys
  { pattern: /\b(AKIA[A-Z0-9]{16})/g, replacement: '***AWS_KEY_REDACTED***' },
  {
    pattern: /\b(aws_secret_access_key)\s*[:=]\s*["']?([A-Za-z0-9/+=]{40})["']?/gi,
    replacement: '$1=***REDACTED***',
  },

  // Bearer tokens
  { pattern: /\bBearer\s+([A-Za-z0-9_.-]{20,})/gi, replacement: 'Bearer ***REDACTED***' },

  // Git URLs with credentials
  { pattern: /https?:\/\/([^:@\s]+):([^@\s]+)@/g, replacement: 'https://$1:***REDACTED***@' },

  // Private keys (just detect, don't try to capture whole key)
  {
    pattern: /-----BEGIN\s+(RSA\s+)?PRIVATE\s+KEY-----/g,
    replacement: '***PRIVATE_KEY_START_REDACTED***',
  },

  // Generic environment variable patterns (ALL_CAPS_WITH_SECRET_KEYWORD)
  {
    pattern:
      /\b([A-Z_]*(?:KEY|TOKEN|SECRET|PASSWORD|PASSWD|CREDENTIAL|AUTH)[A-Z_]*)\s*[:=]\s*["']?([^\s"',}]{8,})["']?/g,
    replacement: '$1=***REDACTED***',
  },

  // API keys and tokens (generic patterns) - lowercase, after env vars
  {
    pattern: /\b(api[_-]?key)\s*[:=]\s*["']?([A-Za-z0-9_-]{16,})["']?/gi,
    replacement: '$1=***REDACTED***',
  },
  {
    pattern: /\b(token)\s*[:=]\s*["']?([A-Za-z0-9_-]{16,})["']?/gi,
    replacement: '$1=***REDACTED***',
  },
  {
    pattern: /\b(secret)\s*[:=]\s*["']?([A-Za-z0-9_-]{16,})["']?/gi,
    replacement: '$1=***REDACTED***',
  },
  {
    pattern: /\b(password)\s*[:=]\s*["']?([^\s"',}]{4,})["']?/gi,
    replacement: '$1=***REDACTED***',
  },
  { pattern: /\b(passwd)\s*[:=]\s*["']?([^\s"',}]{4,})["']?/gi, replacement: '$1=***REDACTED***' },
  {
    pattern: /\b(credentials?)\s*[:=]\s*["']?([^\s"',}]{4,})["']?/gi,
    replacement: '$1=***REDACTED***',
  },

  // JSON-style "key":"value" patterns
  {
    pattern: /"(api[_-]?key|token|secret|password|passwd|credentials?)"\s*:\s*"([^"]{8,})"/gi,
    replacement: '"$1":"***REDACTED***"',
  },
];

/**
 * Sanitize debug output by redacting sensitive information.
 * This function should be applied to all debug output that might contain secrets.
 *
 * @param {string|any} input - String or object to sanitize
 * @returns {{ ok: boolean, sanitized: string, redactionCount: number }}
 */
function sanitizeDebugOutput(input) {
  // Handle non-string inputs by stringifying
  let str;
  if (typeof input === 'string') {
    str = input;
  } else if (input === null || input === undefined) {
    return { ok: true, sanitized: String(input), redactionCount: 0 };
  } else {
    try {
      str = JSON.stringify(input);
    } catch {
      str = String(input);
    }
  }

  let redactionCount = 0;
  let result = str;

  for (const { pattern, replacement } of SECRET_PATTERNS) {
    // Reset lastIndex for global patterns
    pattern.lastIndex = 0;

    // Count matches before replacing
    const matches = result.match(pattern);
    if (matches) {
      redactionCount += matches.length;
      result = result.replace(pattern, replacement);
    }
  }

  return {
    ok: true,
    sanitized: result,
    redactionCount,
  };
}

function debugLog(operation, details) {
  if (DEBUG) {
    const timestamp = new Date().toISOString();
    // Sanitize details to prevent secret leakage
    const sanitized = sanitizeDebugOutput(details);
    console.error(`[${timestamp}] [errors.js] ${operation}:`, sanitized.sanitized);
  }
}

/**
 * Shell metacharacters that could enable command injection.
 * These are dangerous in shell contexts:
 * - ; | & - Command chaining
 * - $ ` - Command substitution
 * - ( ) { } - Subshells and brace expansion
 * - < > - Redirects
 * - \n \r - Newline injection
 * - \ - Escape sequences
 */
const SHELL_DANGEROUS_CHARS = /[;|&$`(){}<>\n\r\\]/;

/**
 * Sanitize a string for safe use in shell commands.
 * Rejects strings containing shell metacharacters.
 *
 * @param {string} str - String to sanitize
 * @param {object} options - Optional settings
 * @param {boolean} options.allowSpaces - Allow spaces in string (default: true)
 * @param {string} options.context - Context description for error messages (default: 'argument')
 * @returns {{ ok: boolean, sanitized?: string, error?: string, detected?: string }}
 */
function sanitizeForShell(str, options = {}) {
  const { allowSpaces = true, context = 'argument' } = options;

  // Must be a string
  if (typeof str !== 'string') {
    return { ok: false, error: `Input must be a string, got ${typeof str}` };
  }

  // Empty strings are valid
  if (str.length === 0) {
    return { ok: true, sanitized: str };
  }

  // Check for dangerous shell metacharacters
  const match = str.match(SHELL_DANGEROUS_CHARS);
  if (match) {
    const detected = match[0];
    const charName = getCharName(detected);
    return {
      ok: false,
      error: `Unsafe characters in ${context}: contains ${charName}`,
      detected,
    };
  }

  // Optionally disallow spaces
  if (!allowSpaces && /\s/.test(str)) {
    return { ok: false, error: `Spaces not allowed in ${context}` };
  }

  return { ok: true, sanitized: str };
}

/**
 * Get human-readable name for a shell character
 */
function getCharName(char) {
  const names = {
    ';': 'semicolon (command separator)',
    '|': 'pipe (command chaining)',
    '&': 'ampersand (background/chaining)',
    $: 'dollar sign (variable/command substitution)',
    '`': 'backtick (command substitution)',
    '(': 'open parenthesis (subshell)',
    ')': 'close parenthesis (subshell)',
    '{': 'open brace (brace expansion)',
    '}': 'close brace (brace expansion)',
    '<': 'less than (input redirect)',
    '>': 'greater than (output redirect)',
    '\n': 'newline (command injection)',
    '\r': 'carriage return (command injection)',
    '\\': 'backslash (escape sequence)',
  };
  return names[char] || `character '${char}'`;
}

/**
 * Safely read and parse a JSON file
 * @param {string} filePath - Absolute path to JSON file
 * @param {object} options - Optional settings
 * @param {*} options.defaultValue - Value to return if file doesn't exist (makes missing file not an error)
 * @returns {{ ok: boolean, data?: any, error?: string }}
 */
function safeReadJSON(filePath, options = {}) {
  const { defaultValue } = options;

  try {
    if (!fs.existsSync(filePath)) {
      if (defaultValue !== undefined) {
        debugLog('safeReadJSON', { filePath, status: 'missing, using default' });
        return { ok: true, data: defaultValue };
      }
      const error = `File not found: ${filePath}`;
      debugLog('safeReadJSON', { filePath, error });
      return { ok: false, error };
    }

    const content = fs.readFileSync(filePath, 'utf8');
    const data = JSON.parse(content);
    debugLog('safeReadJSON', { filePath, status: 'success' });
    return { ok: true, data };
  } catch (err) {
    const error = `Failed to read JSON from ${filePath}: ${err.message}`;
    debugLog('safeReadJSON', { filePath, error: err.message });
    return { ok: false, error };
  }
}

/**
 * Safely write data as JSON to a file
 * @param {string} filePath - Absolute path to JSON file
 * @param {any} data - Data to serialize as JSON
 * @param {object} options - Optional settings
 * @param {number} options.spaces - JSON indentation (default: 2)
 * @param {boolean} options.createDir - Create parent directories if missing (default: false)
 * @returns {{ ok: boolean, error?: string }}
 */
function safeWriteJSON(filePath, data, options = {}) {
  const { spaces = 2, createDir = false } = options;

  try {
    if (createDir) {
      const dir = require('path').dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        debugLog('safeWriteJSON', { filePath, status: 'created directory', dir });
      }
    }

    const content = JSON.stringify(data, null, spaces) + '\n';
    fs.writeFileSync(filePath, content);
    debugLog('safeWriteJSON', { filePath, status: 'success' });
    return { ok: true };
  } catch (err) {
    const error = `Failed to write JSON to ${filePath}: ${err.message}`;
    debugLog('safeWriteJSON', { filePath, error: err.message });
    return { ok: false, error };
  }
}

/**
 * Safely read a text file
 * @param {string} filePath - Absolute path to file
 * @param {object} options - Optional settings
 * @param {string} options.defaultValue - Value to return if file doesn't exist
 * @returns {{ ok: boolean, data?: string, error?: string }}
 */
function safeReadFile(filePath, options = {}) {
  const { defaultValue } = options;

  try {
    if (!fs.existsSync(filePath)) {
      if (defaultValue !== undefined) {
        debugLog('safeReadFile', { filePath, status: 'missing, using default' });
        return { ok: true, data: defaultValue };
      }
      const error = `File not found: ${filePath}`;
      debugLog('safeReadFile', { filePath, error });
      return { ok: false, error };
    }

    const data = fs.readFileSync(filePath, 'utf8');
    debugLog('safeReadFile', { filePath, status: 'success' });
    return { ok: true, data };
  } catch (err) {
    const error = `Failed to read file ${filePath}: ${err.message}`;
    debugLog('safeReadFile', { filePath, error: err.message });
    return { ok: false, error };
  }
}

/**
 * Safely write text to a file
 * @param {string} filePath - Absolute path to file
 * @param {string} content - Content to write
 * @param {object} options - Optional settings
 * @param {boolean} options.createDir - Create parent directories if missing (default: false)
 * @returns {{ ok: boolean, error?: string }}
 */
function safeWriteFile(filePath, content, options = {}) {
  const { createDir = false } = options;

  try {
    if (createDir) {
      const dir = require('path').dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        debugLog('safeWriteFile', { filePath, status: 'created directory', dir });
      }
    }

    fs.writeFileSync(filePath, content);
    debugLog('safeWriteFile', { filePath, status: 'success' });
    return { ok: true };
  } catch (err) {
    const error = `Failed to write file ${filePath}: ${err.message}`;
    debugLog('safeWriteFile', { filePath, error: err.message });
    return { ok: false, error };
  }
}

/**
 * Safely execute a shell command
 * @param {string} command - Shell command to execute
 * @param {object} options - Optional settings
 * @param {string} options.cwd - Working directory
 * @param {number} options.timeout - Timeout in ms (default: 30000)
 * @param {boolean} options.silent - Suppress stderr (default: false)
 * @param {boolean} options.sanitize - Validate command for shell injection (default: false)
 * @returns {{ ok: boolean, data?: string, error?: string, exitCode?: number }}
 */
function safeExec(command, options = {}) {
  const { cwd = process.cwd(), timeout = 30000, silent = false, sanitize = false } = options;

  // Optional sanitization check
  if (sanitize) {
    const sanitizeResult = sanitizeForShell(command, { context: 'command' });
    if (!sanitizeResult.ok) {
      debugLog('safeExec', { command: command.slice(0, 50), error: sanitizeResult.error });
      return { ok: false, error: sanitizeResult.error, detected: sanitizeResult.detected };
    }
  }

  try {
    const output = execSync(command, {
      cwd,
      encoding: 'utf8',
      timeout,
      stdio: silent ? ['pipe', 'pipe', 'pipe'] : ['pipe', 'pipe', 'inherit'],
    });
    debugLog('safeExec', { command: command.slice(0, 50), status: 'success' });
    return { ok: true, data: output.trim() };
  } catch (err) {
    const exitCode = err.status || 1;
    const error = `Command failed (exit ${exitCode}): ${command.slice(0, 100)}${err.message ? ` - ${err.message}` : ''}`;
    debugLog('safeExec', { command: command.slice(0, 50), error: err.message, exitCode });
    return { ok: false, error, exitCode };
  }
}

/**
 * Safely check if a file or directory exists
 * @param {string} path - Path to check
 * @returns {{ ok: boolean, exists: boolean }}
 */
function safeExists(path) {
  try {
    const exists = fs.existsSync(path);
    return { ok: true, exists };
  } catch (err) {
    debugLog('safeExists', { path, error: err.message });
    return { ok: true, exists: false };
  }
}

/**
 * Safely create a directory
 * @param {string} dirPath - Directory path to create
 * @param {object} options - Optional settings
 * @param {boolean} options.recursive - Create parent directories (default: true)
 * @returns {{ ok: boolean, error?: string }}
 */
function safeMkdir(dirPath, options = {}) {
  const { recursive = true } = options;

  try {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive });
      debugLog('safeMkdir', { dirPath, status: 'created' });
    } else {
      debugLog('safeMkdir', { dirPath, status: 'already exists' });
    }
    return { ok: true };
  } catch (err) {
    const error = `Failed to create directory ${dirPath}: ${err.message}`;
    debugLog('safeMkdir', { dirPath, error: err.message });
    return { ok: false, error };
  }
}

/**
 * Wrap any function to catch errors and return Result
 * @param {Function} fn - Function to wrap
 * @param {string} operationName - Name for error messages
 * @returns {Function} - Wrapped function returning { ok, data?, error? }
 */
function wrapSafe(fn, operationName = 'operation') {
  return function (...args) {
    try {
      const result = fn.apply(this, args);
      return { ok: true, data: result };
    } catch (err) {
      const error = `${operationName} failed: ${err.message}`;
      debugLog('wrapSafe', { operationName, error: err.message });
      return { ok: false, error };
    }
  };
}

/**
 * Wrap an async function to catch errors and return Result
 * @param {Function} fn - Async function to wrap
 * @param {string} operationName - Name for error messages
 * @param {object} [options] - Optional settings
 * @param {boolean} [options.attachErrorCode=false] - Attach error code metadata
 * @returns {Function} - Wrapped async function returning { ok, data?, error?, errorCode?, suggestedFix? }
 */
function wrapSafeAsync(fn, operationName = 'operation', options = {}) {
  const { attachErrorCode = false } = options;

  return async function (...args) {
    try {
      const result = await fn.apply(this, args);
      return { ok: true, data: result };
    } catch (err) {
      const error = `${operationName} failed: ${err.message}`;
      debugLog('wrapSafeAsync', { operationName, error: err.message });

      const result = { ok: false, error };

      // Optionally attach error code metadata
      if (attachErrorCode) {
        try {
          const { getErrorCodeFromError } = require('./error-codes');
          const codeData = getErrorCodeFromError(err);
          result.errorCode = codeData.code;
          result.severity = codeData.severity;
          result.category = codeData.category;
          result.recoverable = codeData.recoverable;
          result.suggestedFix = codeData.suggestedFix;
          result.autoFix = codeData.autoFix;
        } catch {
          // error-codes not available, skip
        }
      }

      return result;
    }
  };
}

/**
 * Safely parse JSON string with optional field validation
 * @param {string} content - JSON string to parse
 * @param {object} options - Optional settings
 * @param {string[]} options.requiredFields - Array of field names that must exist
 * @param {object} options.schema - Simple schema: { fieldName: 'string' | 'number' | 'boolean' | 'object' | 'array' }
 * @returns {{ ok: boolean, data?: any, error?: string, missingFields?: string[], invalidFields?: string[] }}
 */
function safeParseJSON(content, options = {}) {
  const { requiredFields = [], schema = {} } = options;

  try {
    if (typeof content !== 'string') {
      return { ok: false, error: 'Content must be a string' };
    }

    const data = JSON.parse(content);
    debugLog('safeParseJSON', { status: 'parsed' });

    // Validate required fields
    if (requiredFields.length > 0) {
      const missingFields = requiredFields.filter(field => !(field in data));
      if (missingFields.length > 0) {
        const error = `Missing required fields: ${missingFields.join(', ')}`;
        debugLog('safeParseJSON', { error, missingFields });
        return { ok: false, error, missingFields };
      }
    }

    // Validate field types from schema
    if (Object.keys(schema).length > 0) {
      const invalidFields = [];
      for (const [field, expectedType] of Object.entries(schema)) {
        if (field in data) {
          const actualType = Array.isArray(data[field]) ? 'array' : typeof data[field];
          if (actualType !== expectedType) {
            invalidFields.push(`${field}: expected ${expectedType}, got ${actualType}`);
          }
        }
      }
      if (invalidFields.length > 0) {
        const error = `Invalid field types: ${invalidFields.join('; ')}`;
        debugLog('safeParseJSON', { error, invalidFields });
        return { ok: false, error, invalidFields };
      }
    }

    return { ok: true, data };
  } catch (err) {
    const error = `JSON parse error: ${err.message}`;
    debugLog('safeParseJSON', { error: err.message });
    return { ok: false, error };
  }
}

/**
 * Safely read and parse JSON file with validation
 * @param {string} filePath - Absolute path to JSON file
 * @param {object} options - Optional settings
 * @param {*} options.defaultValue - Value to return if file doesn't exist
 * @param {string[]} options.requiredFields - Array of field names that must exist
 * @param {object} options.schema - Simple schema for type validation
 * @returns {{ ok: boolean, data?: any, error?: string, missingFields?: string[], invalidFields?: string[] }}
 */
function safeReadJSONWithValidation(filePath, options = {}) {
  const { defaultValue, requiredFields, schema } = options;

  try {
    if (!fs.existsSync(filePath)) {
      if (defaultValue !== undefined) {
        debugLog('safeReadJSONWithValidation', { filePath, status: 'missing, using default' });
        return { ok: true, data: defaultValue };
      }
      const error = `File not found: ${filePath}`;
      debugLog('safeReadJSONWithValidation', { filePath, error });
      return { ok: false, error };
    }

    const content = fs.readFileSync(filePath, 'utf8');
    return safeParseJSON(content, { requiredFields, schema });
  } catch (err) {
    const error = `Failed to read JSON from ${filePath}: ${err.message}`;
    debugLog('safeReadJSONWithValidation', { filePath, error: err.message });
    return { ok: false, error };
  }
}

module.exports = {
  // Core safe operations
  safeReadJSON,
  safeWriteJSON,
  safeReadFile,
  safeWriteFile,
  safeExec,
  safeExists,
  safeMkdir,

  // JSON parsing with validation
  safeParseJSON,
  safeReadJSONWithValidation,

  // Security functions
  sanitizeForShell,
  sanitizeDebugOutput,

  // Utility wrappers
  wrapSafe,
  wrapSafeAsync,

  // Debug helper
  debugLog,
};
