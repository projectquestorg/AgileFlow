/**
 * process-executor.js - Unified shell execution module (US-0310)
 *
 * Centralizes child_process usage with security-by-default:
 * - Uses execFileSync/spawn (no shell) as standard pattern (US-0297)
 * - Consistent Result pattern: { ok, data?, error?, exitCode?, stderr? }
 * - Git shortcuts for the 76% of call sites that are git commands
 *
 * This module coexists with errors.js safeExec() which serves a different
 * purpose (shell command strings via bash -c).
 */

const { execFileSync, spawn: nodeSpawn } = require('child_process');

/**
 * Execute a command synchronously without a shell.
 * Uses execFileSync internally - shell metacharacters are literal, not interpreted.
 *
 * @param {string} cmd - Executable name (e.g., 'git', 'ps', 'node')
 * @param {string[]} args - Arguments array
 * @param {Object} [opts] - Options
 * @param {string} [opts.cwd] - Working directory (default: process.cwd())
 * @param {number} [opts.timeout] - Timeout in ms (default: 30000)
 * @param {string} [opts.encoding] - Output encoding (default: 'utf8')
 * @param {boolean} [opts.trim] - Trim stdout (default: true)
 * @param {boolean} [opts.captureStderr] - Include stderr in result (default: false)
 * @param {*} [opts.fallback] - Value to return as data on failure (makes errors non-fatal)
 * @returns {{ ok: boolean, data?: string, error?: string, exitCode?: number, stderr?: string }}
 */
function executeCommandSync(cmd, args = [], opts = {}) {
  const {
    cwd = process.cwd(),
    timeout = 30000,
    encoding = 'utf8',
    trim = true,
    captureStderr = false,
    fallback,
  } = opts;

  try {
    const result = execFileSync(cmd, args, {
      cwd,
      encoding,
      timeout,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const data = trim ? result.trim() : result;
    return { ok: true, data };
  } catch (err) {
    if (fallback !== undefined) {
      return { ok: true, data: fallback };
    }

    const exitCode = err.status || 1;
    const stderr = err.stderr ? (trim ? err.stderr.trim() : err.stderr) : undefined;
    const error = `Command failed: ${cmd} ${args.join(' ')} (exit ${exitCode})`;
    const result = { ok: false, error, exitCode };
    if (captureStderr && stderr) {
      result.stderr = stderr;
    }
    return result;
  }
}

/**
 * Execute a command asynchronously without a shell.
 * Uses spawn internally. The returned Promise always resolves (never rejects).
 *
 * @param {string} cmd - Executable name
 * @param {string[]} args - Arguments array
 * @param {Object} [opts] - Options (same as executeCommandSync)
 * @returns {Promise<{ ok: boolean, data?: string, error?: string, exitCode?: number, stderr?: string }>}
 */
function executeCommand(cmd, args = [], opts = {}) {
  const {
    cwd = process.cwd(),
    timeout = 30000,
    trim = true,
    captureStderr = false,
    fallback,
  } = opts;

  return new Promise(resolve => {
    const proc = nodeSpawn(cmd, args, {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let timedOut = false;

    const timer =
      timeout > 0
        ? setTimeout(() => {
            timedOut = true;
            proc.kill('SIGTERM');
          }, timeout)
        : null;

    proc.stdout.on('data', chunk => {
      stdout += chunk;
    });
    proc.stderr.on('data', chunk => {
      stderr += chunk;
    });

    proc.on('error', err => {
      if (timer) clearTimeout(timer);
      if (fallback !== undefined) {
        resolve({ ok: true, data: fallback });
      } else {
        resolve({ ok: false, error: `Spawn error: ${err.message}`, exitCode: null });
      }
    });

    proc.on('close', code => {
      if (timer) clearTimeout(timer);

      if (timedOut) {
        if (fallback !== undefined) {
          resolve({ ok: true, data: fallback });
        } else {
          resolve({
            ok: false,
            error: `Command timed out after ${timeout}ms: ${cmd}`,
            exitCode: null,
          });
        }
        return;
      }

      if (code !== 0) {
        if (fallback !== undefined) {
          resolve({ ok: true, data: fallback });
        } else {
          const result = {
            ok: false,
            error: `Command failed: ${cmd} ${args.join(' ')} (exit ${code})`,
            exitCode: code,
          };
          if (captureStderr) {
            result.stderr = trim ? stderr.trim() : stderr;
          }
          resolve(result);
        }
        return;
      }

      const data = trim ? stdout.trim() : stdout;
      resolve({ ok: true, data });
    });
  });
}

/**
 * Spawn a background (detached, fire-and-forget) process.
 *
 * @param {string} cmd - Executable name
 * @param {string[]} args - Arguments array
 * @param {Object} [opts] - Options
 * @param {string} [opts.cwd] - Working directory
 * @returns {{ ok: boolean, pid?: number, error?: string }}
 */
function spawnBackground(cmd, args = [], opts = {}) {
  const { cwd = process.cwd() } = opts;

  try {
    const child = nodeSpawn(cmd, args, {
      cwd,
      detached: true,
      stdio: 'ignore',
    });
    // Suppress unhandled error events (e.g., ENOENT for missing commands)
    child.on('error', () => {});
    child.unref();
    return { ok: true, pid: child.pid };
  } catch (err) {
    return { ok: false, error: `Failed to spawn: ${err.message}` };
  }
}

/**
 * Execute a git command synchronously.
 * Shortcut for executeCommandSync('git', args, opts).
 *
 * @param {string[]} args - Git arguments (e.g., ['branch', '--show-current'])
 * @param {Object} [opts] - Same options as executeCommandSync
 * @returns {{ ok: boolean, data?: string, error?: string, exitCode?: number, stderr?: string }}
 */
function git(args, opts = {}) {
  return executeCommandSync('git', args, opts);
}

/**
 * Execute a git command asynchronously.
 * Shortcut for executeCommand('git', args, opts).
 *
 * @param {string[]} args - Git arguments
 * @param {Object} [opts] - Same options as executeCommand
 * @returns {Promise<{ ok: boolean, data?: string, error?: string, exitCode?: number, stderr?: string }>}
 */
function gitAsync(args, opts = {}) {
  return executeCommand('git', args, opts);
}

module.exports = {
  executeCommandSync,
  executeCommand,
  spawnBackground,
  git,
  gitAsync,
};
