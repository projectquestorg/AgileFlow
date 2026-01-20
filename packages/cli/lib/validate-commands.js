/**
 * validate-commands.js - Command Validation for Shell Execution
 *
 * Validates and sanitizes commands before shell execution to prevent
 * command injection attacks. Uses allowlist approach for safe commands
 * and rejects dangerous shell metacharacters.
 *
 * Usage:
 *   const { validateCommand, ALLOWED_COMMANDS } = require('./validate-commands');
 *
 *   const result = validateCommand('npm test');
 *   if (result.ok) {
 *     // Safe to execute
 *     const { command, args } = result.data;
 *   } else {
 *     console.error(result.error);
 *   }
 */

const { debugLog, sanitizeForShell } = require('./errors');

/**
 * Allowed command prefixes for agent-loop execution
 * These are the only commands that can be executed
 */
const ALLOWED_COMMANDS = {
  // Package managers
  npm: ['test', 'run', 'run-script'],
  npx: ['jest', 'tsc', 'eslint', 'prettier', 'playwright', 'vitest'],
  yarn: ['test', 'run'],
  pnpm: ['test', 'run'],
  bun: ['test', 'run'],

  // Direct test runners (for projects not using npm scripts)
  jest: true, // Allow all jest args
  vitest: true,
  mocha: true,
  playwright: ['test'],

  // Build tools
  tsc: ['--noEmit', '--build', '-b'],

  // Linters
  eslint: true,
  prettier: ['--check', '--write'],
};

/**
 * Dangerous shell metacharacters that could enable injection
 */
const DANGEROUS_PATTERNS = [
  /[;&|`$(){}]/g, // Shell operators, substitution
  /\$\{/g, // Variable expansion
  /\$\(/g, // Command substitution
  /`[^`]*`/g, // Backtick substitution
  />\s/g, // Redirection
  /<\s/g, // Input redirection
  /\n/g, // Newlines (could chain commands)
  /\r/g, // Carriage return
  /\\$/g, // Line continuation
];

/**
 * Parse a command string into executable and arguments
 * @param {string} cmdString - Full command string
 * @returns {{ executable: string, args: string[] }}
 */
function parseCommand(cmdString) {
  // Handle quoted arguments properly
  const parts = [];
  let current = '';
  let inQuote = null;

  for (let i = 0; i < cmdString.length; i++) {
    const char = cmdString[i];

    if (inQuote) {
      if (char === inQuote) {
        inQuote = null;
      } else {
        current += char;
      }
    } else if (char === '"' || char === "'") {
      inQuote = char;
    } else if (char === ' ' || char === '\t') {
      if (current) {
        parts.push(current);
        current = '';
      }
    } else {
      current += char;
    }
  }

  if (current) {
    parts.push(current);
  }

  return {
    executable: parts[0] || '',
    args: parts.slice(1),
  };
}

/**
 * Check if an argument contains dangerous patterns
 * @param {string} arg - Argument to check
 * @returns {{ safe: boolean, pattern?: string }}
 */
function checkArgSafety(arg) {
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(arg)) {
      return { safe: false, pattern: pattern.source };
    }
  }
  return { safe: true };
}

/**
 * Validate a command against the allowlist
 * @param {string} cmdString - Full command string to validate
 * @param {Object} [options={}] - Validation options
 * @param {boolean} [options.strict=true] - Require command in allowlist
 * @param {boolean} [options.logBlocked=true] - Log blocked commands
 * @returns {{ ok: boolean, data?: { command: string, args: string[] }, error?: string, severity?: string }}
 */
function validateCommand(cmdString, options = {}) {
  const { strict = true, logBlocked = true } = options;

  // Must be a string
  if (typeof cmdString !== 'string') {
    return {
      ok: false,
      error: `Command must be a string, got ${typeof cmdString}`,
      severity: 'high',
    };
  }

  // Trim and check for empty
  const trimmed = cmdString.trim();
  if (!trimmed) {
    return {
      ok: false,
      error: 'Command cannot be empty',
      severity: 'medium',
    };
  }

  // Parse the command
  const { executable, args } = parseCommand(trimmed);

  if (!executable) {
    return {
      ok: false,
      error: 'No executable found in command',
      severity: 'medium',
    };
  }

  // Check executable against allowlist
  const allowedSubcommands = ALLOWED_COMMANDS[executable];

  if (strict && !allowedSubcommands) {
    const error = `Command '${executable}' not in allowlist. Allowed: ${Object.keys(ALLOWED_COMMANDS).join(', ')}`;
    if (logBlocked) {
      debugLog('validateCommand', {
        blocked: true,
        command: executable,
        reason: 'not_in_allowlist',
      });
    }
    return {
      ok: false,
      error,
      severity: 'high',
    };
  }

  // If allowedSubcommands is an array, check the first argument
  if (Array.isArray(allowedSubcommands) && args.length > 0) {
    const subcommand = args[0];
    if (!allowedSubcommands.includes(subcommand)) {
      const error = `Subcommand '${subcommand}' not allowed for '${executable}'. Allowed: ${allowedSubcommands.join(', ')}`;
      if (logBlocked) {
        debugLog('validateCommand', {
          blocked: true,
          command: `${executable} ${subcommand}`,
          reason: 'subcommand_not_allowed',
        });
      }
      return {
        ok: false,
        error,
        severity: 'high',
      };
    }
  }

  // Check all arguments for dangerous patterns
  for (const arg of args) {
    const argCheck = checkArgSafety(arg);
    if (!argCheck.safe) {
      const error = `Dangerous pattern in argument: '${arg}' matches ${argCheck.pattern}`;
      if (logBlocked) {
        debugLog('validateCommand', {
          blocked: true,
          command: executable,
          arg,
          pattern: argCheck.pattern,
          reason: 'dangerous_pattern',
        });
      }
      return {
        ok: false,
        error,
        severity: 'critical',
      };
    }
  }

  // Additional check with sanitizeForShell for the full command
  const fullCmdCheck = sanitizeForShell(trimmed, { context: 'command' });
  if (!fullCmdCheck.ok) {
    if (logBlocked) {
      debugLog('validateCommand', {
        blocked: true,
        command: trimmed.slice(0, 50),
        reason: 'shell_unsafe',
        detected: fullCmdCheck.detected,
      });
    }
    return {
      ok: false,
      error: fullCmdCheck.error,
      severity: 'critical',
    };
  }

  return {
    ok: true,
    data: {
      command: executable,
      args,
    },
  };
}

/**
 * Build a safe command array for spawn()
 * @param {string} cmdString - Command string
 * @param {Object} [options={}] - Options
 * @returns {{ ok: boolean, data?: { file: string, args: string[] }, error?: string }}
 */
function buildSpawnArgs(cmdString, options = {}) {
  const validation = validateCommand(cmdString, options);

  if (!validation.ok) {
    return validation;
  }

  return {
    ok: true,
    data: {
      file: validation.data.command,
      args: validation.data.args,
    },
  };
}

/**
 * Check if a command would be allowed (without modifying)
 * @param {string} cmdString - Command to check
 * @returns {boolean}
 */
function isAllowedCommand(cmdString) {
  return validateCommand(cmdString, { logBlocked: false }).ok;
}

/**
 * Get a list of all allowed command patterns
 * @returns {string[]}
 */
function getAllowedCommandList() {
  const list = [];

  for (const [exe, subcommands] of Object.entries(ALLOWED_COMMANDS)) {
    if (subcommands === true) {
      list.push(`${exe} *`);
    } else if (Array.isArray(subcommands)) {
      for (const sub of subcommands) {
        list.push(`${exe} ${sub}`);
      }
    }
  }

  return list;
}

module.exports = {
  ALLOWED_COMMANDS,
  DANGEROUS_PATTERNS,
  validateCommand,
  buildSpawnArgs,
  isAllowedCommand,
  getAllowedCommandList,
  parseCommand,
  checkArgSafety,
};
