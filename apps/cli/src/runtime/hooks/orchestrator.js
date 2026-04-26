/**
 * Hook orchestrator.
 *
 * Each Claude Code hook event has one thin dispatcher binary in
 * `apps/cli/bin/hooks/`. Every dispatcher delegates to `runEvent()`
 * here, which:
 *
 *   1. Loads `.agileflow/hook-manifest.yaml`.
 *   2. Filters to hooks for the requested event whose `enabled !== false`.
 *   3. Applies user overrides from `agileflow.config.json.hooks` (per-hook
 *      enabled / timeout / skipOnError).
 *   4. Topologically orders the chain via runAfter, detecting cycles.
 *   5. Spawns each hook's `script` as a child process, forwarding the
 *      original stdin so Claude Code's payload reaches the hook.
 *   6. Enforces per-hook timeout via AbortController.
 *   7. Logs each step to `.agileflow/logs/hook-execution.jsonl`.
 *   8. Honors `skipOnError`: a non-zero exit becomes a logged WARN that
 *      does not interrupt the chain.
 *   9. Exits 0 unless a hook with `skipOnError: false` failed.
 *
 * The actual child-process spawn is in `runHook` — it's exported and
 * injectable so unit tests can substitute a stub without touching the
 * filesystem.
 */
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const { loadHookManifest } = require('./manifest-loader.js');
const { orderChain } = require('./chain.js');
const { appendHookLog } = require('./logger.js');

/**
 * @typedef {import('./manifest-loader.js').HookEntry} HookEntry
 *
 * @typedef {Object} RunHookResult
 * @property {number|null} exitCode - null when timed out / signal-killed
 * @property {string} stdout
 * @property {string} stderr
 * @property {number} durationMs
 * @property {boolean} timedOut
 *
 * @typedef {Object} HookOverride
 * @property {boolean} [enabled]
 * @property {number} [timeout]
 * @property {boolean} [skipOnError]
 *
 * @typedef {Object} RunEventOptions
 * @property {string} event - e.g. "SessionStart"
 * @property {string} agileflowDir - absolute path to .agileflow/
 * @property {Buffer|string} [stdin] - data forwarded to each hook on stdin
 * @property {Record<string, HookOverride>} [overrides] - from agileflow.config.json.hooks
 * @property {(hook: HookEntry, ctx: { stdin: Buffer|string, agileflowDir: string }) => Promise<RunHookResult>} [runHook]
 *           Injected for tests; defaults to `defaultRunHook`.
 *
 * @typedef {Object} ChainOutcome
 * @property {number} exitCode - 0 unless a non-skipOnError hook failed
 * @property {Array<{ hook: HookEntry, status: string, exitCode: number|null, durationMs: number }>} steps
 */

/**
 * Default child-process runner for hook scripts.
 *
 * Picks an interpreter based on extension:
 *   .js  → `node <script>`
 *   .sh  → `bash <script>`
 *   else → execute directly (must have a shebang and be executable)
 *
 * Times out via AbortController after `hook.timeout` ms.
 *
 * @type {(hook: HookEntry, ctx: { stdin: Buffer|string, agileflowDir: string }) => Promise<RunHookResult>}
 */
async function defaultRunHook(hook, ctx) {
  const ext = path.extname(hook.script).toLowerCase();
  /** @type {string} */
  let cmd;
  /** @type {string[]} */
  let args;
  if (ext === '.js') {
    cmd = process.execPath;
    args = [hook.script];
  } else if (ext === '.sh') {
    cmd = 'bash';
    args = [hook.script];
  } else {
    cmd = hook.script;
    args = [];
  }

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), hook.timeout);

  const start = Date.now();
  return await new Promise((resolve) => {
    const child = spawn(cmd, args, {
      cwd: path.dirname(ctx.agileflowDir),
      stdio: ['pipe', 'pipe', 'pipe'],
      signal: ac.signal,
      env: { ...process.env, AGILEFLOW_DIR: ctx.agileflowDir },
    });
    /** @type {string[]} */
    const out = [];
    /** @type {string[]} */
    const err = [];
    child.stdout.on('data', (d) => out.push(d.toString('utf8')));
    child.stderr.on('data', (d) => err.push(d.toString('utf8')));
    child.on('error', () => {
      // Spawn-level errors (ENOENT for missing script, abort signal) — we
      // surface as exitCode null + timedOut iff we triggered the abort.
    });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      resolve({
        exitCode: code,
        stdout: out.join(''),
        stderr: err.join(''),
        durationMs: Date.now() - start,
        timedOut: signal === 'SIGTERM' && ac.signal.aborted,
      });
    });
    if (ctx.stdin != null) {
      try {
        child.stdin.end(ctx.stdin);
      } catch {
        /* swallow if stdin already closed */
      }
    } else {
      child.stdin.end();
    }
  });
}

/**
 * Apply per-hook overrides from user config to a hook entry. Returns a
 * new normalized HookEntry without mutating the input.
 * @param {HookEntry} hook
 * @param {HookOverride} [override]
 * @returns {HookEntry}
 */
function applyOverride(hook, override) {
  if (!override) return hook;
  return {
    ...hook,
    enabled: override.enabled ?? hook.enabled,
    timeout: override.timeout ?? hook.timeout,
    skipOnError: override.skipOnError ?? hook.skipOnError,
  };
}

/**
 * Resolve the script path against the agileflow-dir parent (the project
 * root). Manifest paths are relative to the project root by convention.
 * @param {HookEntry} hook
 * @param {string} agileflowDir
 * @returns {HookEntry}
 */
function resolveScriptPath(hook, agileflowDir) {
  const projectRoot = path.dirname(agileflowDir);
  const absolute = path.isAbsolute(hook.script)
    ? hook.script
    : path.join(projectRoot, hook.script);
  return { ...hook, script: absolute };
}

/**
 * Run the chain for a given event. Always exits the orchestrator with
 * code 0 unless a non-skipOnError hook fails or the chain itself fails
 * to load (in which case the dispatcher decides whether to fail open).
 *
 * @param {RunEventOptions} options
 * @returns {Promise<ChainOutcome>}
 */
async function runEvent(options) {
  const {
    event,
    agileflowDir,
    stdin = '',
    overrides = {},
    runHook = defaultRunHook,
  } = options;

  const manifestPath = path.join(agileflowDir, 'hook-manifest.yaml');
  const logPath = path.join(agileflowDir, 'logs', 'hook-execution.jsonl');

  let manifest;
  try {
    manifest = await loadHookManifest(manifestPath);
  } catch (err) {
    // Bad manifest is treated as "no hooks" but logged for visibility.
    await appendHookLog(logPath, {
      timestamp: new Date().toISOString(),
      event,
      hookId: '<orchestrator>',
      status: 'error',
      exitCode: null,
      durationMs: 0,
      reason: `manifest load failed: ${err.message}`,
    }).catch(() => {});
    return { exitCode: 0, steps: [] };
  }
  if (!manifest) return { exitCode: 0, steps: [] };

  // Filter to this event, apply user overrides, then enabled gate.
  const eventHooks = manifest.hooks
    .filter((h) => h.event === event)
    .map((h) => applyOverride(h, overrides[h.id]))
    .filter((h) => h.enabled);

  if (!eventHooks.length) return { exitCode: 0, steps: [] };

  // Topo sort within the event (orderChain only sees this event's hooks
  // so cross-event runAfter is rejected as "unknown hook").
  let ordered;
  try {
    ordered = orderChain(eventHooks);
  } catch (err) {
    await appendHookLog(logPath, {
      timestamp: new Date().toISOString(),
      event,
      hookId: '<orchestrator>',
      status: 'error',
      exitCode: null,
      durationMs: 0,
      reason: `chain ordering failed: ${err.message}`,
    }).catch(() => {});
    return { exitCode: 1, steps: [] };
  }

  /** @type {ChainOutcome['steps']} */
  const steps = [];
  let chainExitCode = 0;

  for (const hook of ordered) {
    const resolved = resolveScriptPath(hook, agileflowDir);
    let result;
    let runError = null;
    try {
      result = await runHook(resolved, { stdin, agileflowDir });
    } catch (err) {
      runError = err;
      result = {
        exitCode: null,
        stdout: '',
        stderr: err && err.message ? err.message : String(err),
        durationMs: 0,
        timedOut: false,
      };
    }
    const ok = result.exitCode === 0 && !runError;
    /** @type {'ok'|'error'|'timeout'|'skipped'} */
    const status = ok ? 'ok' : result.timedOut ? 'timeout' : 'error';
    const skippedByOnError = !ok && hook.skipOnError === true;

    await appendHookLog(logPath, {
      timestamp: new Date().toISOString(),
      event,
      hookId: hook.id,
      status,
      exitCode: result.exitCode,
      durationMs: result.durationMs,
      stdout: result.stdout,
      stderr: result.stderr,
      skippedByOnError: skippedByOnError || undefined,
    }).catch(() => {});

    steps.push({
      hook: resolved,
      status,
      exitCode: result.exitCode,
      durationMs: result.durationMs,
    });

    if (!ok && !hook.skipOnError) {
      chainExitCode = 1;
      break;
    }
  }

  return { exitCode: chainExitCode, steps };
}

module.exports = {
  runEvent,
  defaultRunHook,
  applyOverride,
  resolveScriptPath,
};
