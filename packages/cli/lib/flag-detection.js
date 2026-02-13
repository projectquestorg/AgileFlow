/**
 * flag-detection.js - Detect parent Claude session flags for propagation
 *
 * Detects the current Claude session's flags (like --dangerously-skip-permissions)
 * so they can be propagated to new sessions created via /session:new, /session:spawn, etc.
 *
 * Detection priority:
 * 1. Environment variable CLAUDE_SESSION_FLAGS (explicit, cross-platform)
 * 2. Linux /proc introspection (/proc/<ppid>/cmdline)
 * 3. ps command fallback (macOS/Linux)
 */

const fs = require('fs');
const { executeCommandSync } = require('./process-executor');

/**
 * Known Claude flags that should be propagated to child sessions
 */
const PROPAGATABLE_FLAGS = [
  '--dangerously-skip-permissions',
  '--permission-mode',
  '--model',
  '--verbose',
];

/**
 * Map of flags to startup mode names (for display purposes)
 */
const FLAG_TO_MODE = {
  '--dangerously-skip-permissions': 'Trust mode (skip permissions)',
};

/**
 * Extract Claude-specific flags from a command line argument array
 * @param {string[]} args - Command line arguments
 * @returns {string[]} Array of Claude flags found
 */
function extractClaudeFlags(args) {
  const flags = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    // Check for exact flag matches
    if (arg === '--dangerously-skip-permissions') {
      flags.push(arg);
    }

    // Check for flags with values (--permission-mode acceptEdits)
    else if (arg === '--permission-mode' && args[i + 1]) {
      flags.push(`${arg} ${args[i + 1]}`);
      i++; // Skip the value
    }

    // Check for combined flags (--permission-mode=acceptEdits)
    else if (arg.startsWith('--permission-mode=')) {
      flags.push(arg);
    }

    // Check for model override
    else if (arg === '--model' && args[i + 1]) {
      flags.push(`${arg} ${args[i + 1]}`);
      i++;
    } else if (arg.startsWith('--model=')) {
      flags.push(arg);
    }

    // Check for verbose
    else if (arg === '--verbose' || arg === '-v') {
      flags.push('--verbose');
    }
  }

  return flags;
}

/**
 * Parse command line string into arguments array
 * Handles quoted strings and null-separated /proc/cmdline format
 * @param {string} cmdline - Command line string
 * @param {boolean} isNullSeparated - Whether args are null-separated (Linux /proc)
 * @returns {string[]} Array of arguments
 */
function parseCmdline(cmdline, isNullSeparated = false) {
  if (isNullSeparated) {
    // /proc/*/cmdline uses null bytes to separate args
    return cmdline.split('\0').filter(Boolean);
  }

  // Simple argument parsing (handles basic quoting)
  const args = [];
  let current = '';
  let inQuote = false;
  let quoteChar = '';

  for (const char of cmdline) {
    if (!inQuote && (char === '"' || char === "'")) {
      inQuote = true;
      quoteChar = char;
    } else if (inQuote && char === quoteChar) {
      inQuote = false;
      quoteChar = '';
    } else if (!inQuote && char === ' ') {
      if (current) {
        args.push(current);
        current = '';
      }
    } else {
      current += char;
    }
  }

  if (current) {
    args.push(current);
  }

  return args;
}

/**
 * Check if a process is a Claude process based on command line
 * @param {string[]} args - Command line arguments
 * @returns {boolean}
 */
function isClaudeProcess(args) {
  if (!args || args.length === 0) return false;

  // Check if any arg contains 'claude' (handles various ways claude can be invoked)
  for (const arg of args.slice(0, 3)) {
    // Only check first few args
    if (
      arg &&
      (arg.endsWith('/claude') ||
        arg === 'claude' ||
        arg.includes('claude-code') ||
        arg.includes('@anthropic'))
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Try to detect flags from environment variable
 * @returns {string|null} Flags string or null
 */
function detectFromEnv() {
  const envFlags = process.env.CLAUDE_SESSION_FLAGS;
  if (envFlags && envFlags.trim()) {
    return envFlags.trim();
  }
  return null;
}

/**
 * Try to detect flags from Linux /proc filesystem
 * @returns {string|null} Flags string or null
 */
function detectFromProc() {
  // Only works on Linux
  if (process.platform !== 'linux') {
    return null;
  }

  try {
    // Walk up the process tree looking for a Claude process
    let pid = process.ppid;
    const visited = new Set();

    while (pid && pid > 1 && !visited.has(pid)) {
      visited.add(pid);

      const cmdlinePath = `/proc/${pid}/cmdline`;
      if (!fs.existsSync(cmdlinePath)) break;

      const cmdline = fs.readFileSync(cmdlinePath, 'utf8');
      const args = parseCmdline(cmdline, true);

      if (isClaudeProcess(args)) {
        const flags = extractClaudeFlags(args);
        if (flags.length > 0) {
          return flags.join(' ');
        }
        // Found Claude but no flags - return empty string to indicate detection worked
        return '';
      }

      // Get parent PID
      const statPath = `/proc/${pid}/stat`;
      if (!fs.existsSync(statPath)) break;

      const stat = fs.readFileSync(statPath, 'utf8');
      // Format: pid (comm) state ppid ...
      const ppidMatch = stat.match(/\)\s+\S+\s+(\d+)/);
      pid = ppidMatch ? parseInt(ppidMatch[1], 10) : null;
    }
  } catch (e) {
    // Ignore errors - /proc introspection is best-effort
  }

  return null;
}

/**
 * Try to detect flags using ps command (macOS/Linux fallback)
 * @returns {string|null} Flags string or null
 */
function detectFromPs() {
  try {
    // Walk up process tree looking for Claude
    let pid = process.ppid;
    const visited = new Set();

    while (pid && pid > 1 && !visited.has(pid)) {
      visited.add(pid);

      // Get command line for this PID
      let cmdline;
      const cmdResult = executeCommandSync('ps', ['-p', String(pid), '-o', 'args='], {
        timeout: 1000, fallback: null,
      });
      if (!cmdResult.ok || cmdResult.data === null) break;
      cmdline = cmdResult.data;

      if (!cmdline) break;

      const args = parseCmdline(cmdline, false);

      if (isClaudeProcess(args)) {
        const flags = extractClaudeFlags(args);
        if (flags.length > 0) {
          return flags.join(' ');
        }
        // Found Claude but no flags
        return '';
      }

      // Get parent PID
      const ppidResult = executeCommandSync('ps', ['-p', String(pid), '-o', 'ppid='], {
        timeout: 1000, fallback: null,
      });
      if (!ppidResult.ok || ppidResult.data === null) break;
      pid = parseInt(ppidResult.data, 10);
    }
  } catch (e) {
    // ps command failed - ignore
  }

  return null;
}

/**
 * Detect parent Claude session flags
 * Returns the flags that should be propagated to child sessions
 *
 * @returns {{flags: string|null, source: string, mode: string|null}}
 *   - flags: The flags string to pass to claude (null if none detected)
 *   - source: Where the flags were detected from ('env', 'proc', 'ps', 'none')
 *   - mode: Human-readable mode name if applicable
 */
function detectParentSessionFlags() {
  // Priority 1: Environment variable (explicit, cross-platform)
  const envFlags = detectFromEnv();
  if (envFlags !== null) {
    return {
      flags: envFlags || null,
      source: 'env',
      mode: envFlags ? flagsToStartupMode(envFlags) : null,
    };
  }

  // Priority 2: Linux /proc introspection
  const procFlags = detectFromProc();
  if (procFlags !== null) {
    return {
      flags: procFlags || null,
      source: 'proc',
      mode: procFlags ? flagsToStartupMode(procFlags) : null,
    };
  }

  // Priority 3: ps command fallback
  const psFlags = detectFromPs();
  if (psFlags !== null) {
    return {
      flags: psFlags || null,
      source: 'ps',
      mode: psFlags ? flagsToStartupMode(psFlags) : null,
    };
  }

  // No Claude parent found or detection failed
  return {
    flags: null,
    source: 'none',
    mode: null,
  };
}

/**
 * Map a flags string back to a human-readable startup mode name
 * @param {string} flags - Flags string
 * @returns {string|null} Mode name or null
 */
function flagsToStartupMode(flags) {
  if (!flags) return null;

  if (flags.includes('--dangerously-skip-permissions')) {
    return 'Trust mode (skip permissions)';
  }

  if (flags.includes('--permission-mode')) {
    const match = flags.match(/--permission-mode[=\s]+(\S+)/);
    if (match) {
      return `Permission mode: ${match[1]}`;
    }
  }

  return null;
}

/**
 * Get the inherited flags string suitable for appending to a claude command
 * @returns {string} Flags string (may be empty)
 */
function getInheritedFlags() {
  const result = detectParentSessionFlags();
  return result.flags || '';
}

module.exports = {
  detectParentSessionFlags,
  extractClaudeFlags,
  parseCmdline,
  isClaudeProcess,
  flagsToStartupMode,
  getInheritedFlags,
  PROPAGATABLE_FLAGS,
  FLAG_TO_MODE,
};
