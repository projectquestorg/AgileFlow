#!/usr/bin/env node

/**
 * tmux-audit-monitor.js - Monitor and manage ULTRADEEP audit sessions
 *
 * Provides 6 subcommands for the AI to call during ultradeep audits:
 *   status  <trace_id>                   - One-shot state check
 *   wait    <trace_id> [--timeout=1800]  - Block until complete or timeout
 *   collect <trace_id>                   - Collect whatever results are done
 *   retry   <trace_id> [--analyzer=key]  - Re-spawn stalled analyzers
 *   kill    <trace_id> [--keep-files]    - Clean shutdown
 *   list                                 - Discover all active traces
 *
 * All output is JSON to stdout. Progress goes to stderr.
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// --- Helpers ---

function jsonOut(obj) {
  console.log(JSON.stringify(obj));
}

function progress(msg) {
  process.stderr.write(msg + '\n');
}

function getSentinelDir(rootDir, traceId) {
  return path.join(rootDir, 'docs', '09-agents', 'ultradeep', traceId);
}

function readStatusFile(sentinelDir) {
  const statusPath = path.join(sentinelDir, '_status.json');
  if (!fs.existsSync(statusPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(statusPath, 'utf8'));
  } catch (_) {
    return null;
  }
}

/**
 * Determine the state of a single analyzer.
 * @param {string} key - Analyzer key
 * @param {string} sentinelDir - Sentinel directory path
 * @param {string} sessionName - tmux session name
 * @param {string} prefix - Audit type prefix (e.g. 'Logic', 'Sec')
 * @returns {'done'|'running'|'stalled'}
 */
function getAnalyzerState(key, sentinelDir, sessionName, prefix) {
  if (fs.existsSync(path.join(sentinelDir, `${key}.findings.json`))) return 'done';
  try {
    const windows = execFileSync(
      'tmux',
      ['list-windows', '-t', sessionName, '-F', '#{window_name}'],
      {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      }
    )
      .trim()
      .split('\n');
    return windows.includes(`${prefix}:${key}`) ? 'running' : 'stalled';
  } catch (_) {
    return 'stalled';
  }
}

function readFindings(sentinelDir, key) {
  const findingsFile = path.join(sentinelDir, `${key}.findings.json`);
  try {
    if (fs.existsSync(findingsFile)) {
      return JSON.parse(fs.readFileSync(findingsFile, 'utf8'));
    }
  } catch (err) {
    return { analyzer: key, error: `Failed to parse: ${err.message}`, findings: [] };
  }
  return null;
}

function collectResults(sentinelDir, analyzerKeys) {
  const results = [];
  for (const key of analyzerKeys) {
    const data = readFindings(sentinelDir, key);
    if (data) results.push(data);
  }
  return results;
}

function deriveSessionName(status, traceId) {
  const auditType = status.audit_type || 'unknown';
  return `audit-${auditType}-${traceId.slice(0, 8)}`;
}

function getAuditPrefix(auditType) {
  try {
    const { getAuditType: getType } = require('./audit-registry');
    const typeConfig = getType(auditType);
    if (typeConfig && typeConfig.prefix) return typeConfig.prefix;
  } catch (_) {
    // Fallback if audit-registry not available
  }
  return auditType;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// --- Subcommands ---

/**
 * status <trace_id> - One-shot state check
 */
function cmdStatus(rootDir, traceId) {
  const sentinelDir = getSentinelDir(rootDir, traceId);
  const status = readStatusFile(sentinelDir);

  if (!status) {
    jsonOut({ ok: false, error: `No trace found: ${traceId}`, traceId });
    return;
  }

  const sessionName = deriveSessionName(status, traceId);
  const prefix = getAuditPrefix(status.audit_type);
  const startedAt = new Date(status.started_at).getTime();
  const elapsedSeconds = Math.round((Date.now() - startedAt) / 1000);

  const analyzers = [];
  let doneCount = 0;
  let runningCount = 0;
  let stalledCount = 0;

  for (const key of status.analyzers) {
    const state = getAnalyzerState(key, sentinelDir, sessionName, prefix);
    const entry = { key, state };
    if (state === 'done') {
      doneCount++;
      const findings = readFindings(sentinelDir, key);
      if (findings && findings.findings) {
        entry.findingsCount = findings.findings.length;
      }
    } else if (state === 'running') {
      runningCount++;
    } else {
      stalledCount++;
    }
    analyzers.push(entry);
  }

  jsonOut({
    ok: true,
    traceId,
    auditType: status.audit_type,
    elapsedSeconds,
    progress: {
      total: status.analyzers.length,
      done: doneCount,
      running: runningCount,
      stalled: stalledCount,
    },
    analyzers,
  });
}

/**
 * wait <trace_id> [--timeout=1800] [--poll=5] - Block until complete or timeout
 */
async function cmdWait(rootDir, traceId, timeoutSeconds, pollSeconds) {
  const sentinelDir = getSentinelDir(rootDir, traceId);
  const status = readStatusFile(sentinelDir);

  if (!status) {
    jsonOut({
      ok: false,
      complete: false,
      error: `No trace found: ${traceId}`,
      traceId,
      elapsedSeconds: 0,
      results: [],
      missing: [],
    });
    process.exitCode = 1;
    return;
  }

  const sessionName = deriveSessionName(status, traceId);
  const prefix = getAuditPrefix(status.audit_type);
  const expected = status.analyzers;
  const startTime = Date.now();
  const timeoutMs = timeoutSeconds * 1000;
  const pollMs = pollSeconds * 1000;

  while (Date.now() - startTime < timeoutMs) {
    const done = [];
    const missing = [];
    const stalled = [];

    for (const key of expected) {
      const state = getAnalyzerState(key, sentinelDir, sessionName, prefix);
      if (state === 'done') done.push(key);
      else if (state === 'stalled') stalled.push(key);
      else missing.push(key);
    }

    const elapsed = Math.round((Date.now() - startTime) / 1000);
    progress(
      `[${elapsed}s] ${done.length}/${expected.length} done, ${missing.length} running, ${stalled.length} stalled`
    );

    if (done.length === expected.length) {
      const results = collectResults(sentinelDir, expected);
      jsonOut({ ok: true, complete: true, traceId, elapsedSeconds: elapsed, results, missing: [] });
      return;
    }

    // If all remaining are stalled (no running), no point waiting
    if (missing.length === 0 && stalled.length > 0) {
      progress(`All remaining analyzers stalled: ${stalled.join(', ')}`);
      const results = collectResults(sentinelDir, expected);
      jsonOut({
        ok: false,
        complete: false,
        traceId,
        elapsedSeconds: elapsed,
        results,
        missing: [],
        stalled,
      });
      process.exitCode = 1;
      return;
    }

    await sleep(pollMs);
  }

  // Timeout
  const elapsed = Math.round((Date.now() - startTime) / 1000);
  const results = collectResults(sentinelDir, expected);
  const completedKeys = results.map(r => r.analyzer);
  const missing = expected.filter(k => !completedKeys.includes(k));
  progress(`Timeout after ${elapsed}s. ${results.length}/${expected.length} completed.`);
  jsonOut({ ok: false, complete: false, traceId, elapsedSeconds: elapsed, results, missing });
  process.exitCode = 1;
}

/**
 * collect <trace_id> - One-shot collection
 */
function cmdCollect(rootDir, traceId) {
  const sentinelDir = getSentinelDir(rootDir, traceId);
  const status = readStatusFile(sentinelDir);

  if (!status) {
    jsonOut({
      ok: false,
      error: `No trace found: ${traceId}`,
      traceId,
      complete: false,
      found: 0,
      expected: 0,
      results: [],
      missing: [],
    });
    return;
  }

  const expected = status.analyzers;
  const results = collectResults(sentinelDir, expected);
  const foundKeys = results.map(r => r.analyzer).filter(Boolean);
  const missing = expected.filter(k => !foundKeys.includes(k));

  jsonOut({
    ok: true,
    traceId,
    complete: missing.length === 0,
    found: results.length,
    expected: expected.length,
    results,
    missing,
  });
}

/**
 * retry <trace_id> [--analyzer=key] [--model=M] - Re-spawn failed/stalled analyzers
 */
function cmdRetry(rootDir, traceId, analyzerFilter, modelOverride) {
  const sentinelDir = getSentinelDir(rootDir, traceId);
  const status = readStatusFile(sentinelDir);

  if (!status) {
    jsonOut({ ok: false, error: `No trace found: ${traceId}`, traceId, retried: [], errors: [] });
    return;
  }

  // Determine which analyzers to retry
  const sessionName = deriveSessionName(status, traceId);
  const prefix = getAuditPrefix(status.audit_type);
  const toRetry = [];

  for (const key of status.analyzers) {
    if (analyzerFilter && analyzerFilter !== key) continue;
    const state = getAnalyzerState(key, sentinelDir, sessionName, prefix);
    if (state !== 'done') {
      toRetry.push(key);
    }
  }

  if (toRetry.length === 0) {
    jsonOut({
      ok: true,
      traceId,
      retried: [],
      errors: [],
      message: 'Nothing to retry - all analyzers complete',
    });
    return;
  }

  // Load audit registry for analyzer configs
  let getAuditType, spawnOneSession, resolveModel, getColorForAudit;
  try {
    ({ getAuditType } = require('./audit-registry'));
    ({ spawnOneSession } = require('../spawn-audit-sessions'));
    ({ resolveModel } = require('./model-profiles'));
    ({ getColorForAudit } = require('./tmux-group-colors'));
  } catch (err) {
    jsonOut({
      ok: false,
      error: `Failed to load dependencies: ${err.message}`,
      traceId,
      retried: [],
      errors: [err.message],
    });
    return;
  }

  const auditType = getAuditType(status.audit_type);
  if (!auditType) {
    jsonOut({
      ok: false,
      error: `Unknown audit type: ${status.audit_type}`,
      traceId,
      retried: [],
      errors: [],
    });
    return;
  }

  const model = modelOverride || status.model || 'haiku';
  const target = status.target || '.';
  const groupColor = getColorForAudit(status.audit_type);
  const retried = [];
  const errors = [];

  // Count existing windows to determine spawn index
  let existingWindows = 0;
  try {
    const output = execFileSync(
      'tmux',
      ['list-windows', '-t', sessionName, '-F', '#{window_name}'],
      {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      }
    ).trim();
    existingWindows = output ? output.split('\n').length : 0;
  } catch (_) {
    // Session may not exist; first spawn will create it
  }

  for (const key of toRetry) {
    const analyzerConfig = auditType.analyzers[key];
    if (!analyzerConfig) {
      errors.push(`Unknown analyzer: ${key}`);
      continue;
    }

    const analyzer = {
      key,
      subagent_type: analyzerConfig.subagent_type,
      label: analyzerConfig.label,
    };
    try {
      const windowName = spawnOneSession({
        analyzer,
        index: existingWindows,
        sessionName,
        rootDir,
        options: { audit: status.audit_type, target, model, traceId },
        sentinelDir,
        auditType,
        groupColor,
      });
      if (windowName) {
        retried.push(key);
        existingWindows++;
      } else {
        errors.push(`Failed to spawn window for ${key}`);
      }
    } catch (err) {
      errors.push(`${key}: ${err.message}`);
    }
  }

  jsonOut({ ok: errors.length === 0, traceId, retried, errors });
}

/**
 * kill <trace_id> [--keep-files] - Clean shutdown
 */
function cmdKill(rootDir, traceId, keepFiles) {
  const sentinelDir = getSentinelDir(rootDir, traceId);
  const status = readStatusFile(sentinelDir);

  if (!status) {
    jsonOut({
      ok: false,
      error: `No trace found: ${traceId}`,
      traceId,
      sessionKilled: false,
      filesRemoved: false,
    });
    return;
  }

  const sessionName = deriveSessionName(status, traceId);

  // Kill tmux session
  let sessionKilled = false;
  try {
    execFileSync('tmux', ['kill-session', '-t', sessionName], { stdio: 'pipe' });
    sessionKilled = true;
  } catch (_) {
    // Session may already be dead
  }

  // Remove files
  let filesRemoved = false;
  if (!keepFiles) {
    try {
      fs.rmSync(sentinelDir, { recursive: true, force: true });
      filesRemoved = true;
    } catch (_) {
      // Non-critical
    }
  }

  jsonOut({ ok: sessionKilled || filesRemoved || keepFiles, traceId, sessionKilled, filesRemoved });
}

/**
 * list - Discover all active traces
 */
function cmdList(rootDir) {
  const ultradeepDir = path.join(rootDir, 'docs', '09-agents', 'ultradeep');

  if (!fs.existsSync(ultradeepDir)) {
    jsonOut({ ok: true, traces: [] });
    return;
  }

  const traces = [];
  try {
    const entries = fs.readdirSync(ultradeepDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const traceDir = path.join(ultradeepDir, entry.name);
      const status = readStatusFile(traceDir);
      if (!status) continue;

      const traceId = entry.name;
      const sessionName = deriveSessionName(status, traceId);

      // Check how many are done
      const doneCount = status.analyzers.filter(key =>
        fs.existsSync(path.join(traceDir, `${key}.findings.json`))
      ).length;

      // Check if tmux session is alive
      let sessionActive = false;
      try {
        execFileSync('tmux', ['has-session', '-t', sessionName], { stdio: 'pipe' });
        sessionActive = true;
      } catch (_) {
        // Session not found
      }

      traces.push({
        traceId,
        auditType: status.audit_type,
        progress: { total: status.analyzers.length, done: doneCount },
        sessionActive,
      });
    }
  } catch (err) {
    jsonOut({ ok: false, error: `Failed to read ultradeep dir: ${err.message}`, traces });
    return;
  }

  jsonOut({ ok: true, traces });
}

// --- Arg parsing and dispatch ---

function parseSubcommandArgs(args) {
  const parsed = { timeout: 1800, poll: 5, analyzer: null, model: null, keepFiles: false };
  for (const arg of args) {
    if (arg.startsWith('--timeout=')) {
      const v = parseInt(arg.split('=')[1], 10);
      parsed.timeout = isNaN(v) ? 1800 : v;
    } else if (arg.startsWith('--poll=')) {
      const v = parseInt(arg.split('=')[1], 10);
      parsed.poll = isNaN(v) ? 5 : v;
    } else if (arg.startsWith('--analyzer=')) {
      const val = arg.split('=')[1];
      if (val) parsed.analyzer = val;
    } else if (arg.startsWith('--model=')) {
      parsed.model = arg.split('=')[1];
    } else if (arg === '--keep-files') {
      parsed.keepFiles = true;
    }
  }
  return parsed;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const subcommand = args[0];
  const traceId = args[1];
  const restArgs = args.slice(2);
  const rootDir = process.cwd();

  if (!subcommand || subcommand === '--help') {
    console.error('Usage: tmux-audit-monitor.js <subcommand> [trace_id] [options]');
    console.error('Subcommands: status, wait, collect, retry, kill, list');
    process.exit(1);
  }

  const opts = parseSubcommandArgs(restArgs);

  switch (subcommand) {
    case 'status':
      if (!traceId) {
        jsonOut({ ok: false, error: 'trace_id required' });
        process.exit(1);
      }
      cmdStatus(rootDir, traceId);
      break;

    case 'wait':
      if (!traceId) {
        jsonOut({ ok: false, error: 'trace_id required' });
        process.exit(1);
      }
      cmdWait(rootDir, traceId, opts.timeout, opts.poll).catch(err => {
        jsonOut({ ok: false, error: err.message });
        process.exit(1);
      });
      break;

    case 'collect':
      if (!traceId) {
        jsonOut({ ok: false, error: 'trace_id required' });
        process.exit(1);
      }
      cmdCollect(rootDir, traceId);
      break;

    case 'retry':
      if (!traceId) {
        jsonOut({ ok: false, error: 'trace_id required' });
        process.exit(1);
      }
      cmdRetry(rootDir, traceId, opts.analyzer, opts.model);
      break;

    case 'kill':
      if (!traceId) {
        jsonOut({ ok: false, error: 'trace_id required' });
        process.exit(1);
      }
      cmdKill(rootDir, traceId, opts.keepFiles);
      break;

    case 'list':
      cmdList(rootDir);
      break;

    default:
      jsonOut({ ok: false, error: `Unknown subcommand: ${subcommand}` });
      process.exit(1);
  }
}

module.exports = {
  getAnalyzerState,
  readStatusFile,
  collectResults,
  parseSubcommandArgs,
  cmdStatus,
  cmdWait,
  cmdCollect,
  cmdRetry,
  cmdKill,
  cmdList,
};
