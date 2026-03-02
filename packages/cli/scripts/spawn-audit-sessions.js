#!/usr/bin/env node

/**
 * spawn-audit-sessions.js - Spawn ULTRADEEP audit analyzer sessions in tmux
 *
 * Spawns each analyzer as a separate Claude Code session in tmux,
 * with sentinel files for coordination and tab grouping for visual organization.
 *
 * Key differences from spawn-parallel.js:
 *   - No worktrees: audits are read-only, all sessions share the same repo
 *   - Piped prompts: each session gets analyzer-specific prompt via echo | claude
 *   - Sentinel files: each writes findings to docs/09-agents/ultradeep/{trace_id}/
 *   - Tab grouping: applies colors from tmux-group-colors.js
 *
 * Usage:
 *   node scripts/spawn-audit-sessions.js --audit=security --target=src/ --focus=all --trace-id=abc123
 *   node scripts/spawn-audit-sessions.js --audit=logic --target=. --depth=ultradeep
 *
 * Options:
 *   --audit=TYPE       Audit type: logic|security|performance|test|completeness|legal
 *   --target=PATH      Target file or directory to analyze
 *   --focus=AREAS      Comma-separated focus areas, or 'all'
 *   --trace-id=ID      Unique trace ID (auto-generated if not provided)
 *   --timeout=MINUTES  Completion timeout (default: 30)
 *   --dry-run          Show what would be spawned without executing
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const { getAuditType, getAnalyzersForAudit } = require('./lib/audit-registry');
const { getColorForAudit } = require('./lib/tmux-group-colors');
const { resolveModel, estimateCost } = require('./lib/model-profiles');

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Read ultradeep config from agileflow-metadata.json.
 * @returns {{ stagger_seconds: number, max_concurrent: number }}
 */
function getUltradeepConfig() {
  const defaults = { stagger_seconds: 3, max_concurrent: 0 };
  try {
    const metaPath = path.join(process.cwd(), 'docs', '00-meta', 'agileflow-metadata.json');
    if (fs.existsSync(metaPath)) {
      const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
      const ud = meta.ultradeep || {};
      if (typeof ud.stagger_seconds === 'number') defaults.stagger_seconds = ud.stagger_seconds;
      if (typeof ud.max_concurrent === 'number') defaults.max_concurrent = ud.max_concurrent;
    }
  } catch (_) {
    /* use defaults */
  }
  return defaults;
}

/**
 * Parse CLI arguments.
 * @returns {object} Parsed options
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    audit: null,
    target: '.',
    focus: ['all'],
    model: null,
    traceId: null,
    timeout: 30,
    dryRun: false,
    json: false,
    stagger: null,
    concurrency: null,
  };

  for (const arg of args) {
    if (arg.startsWith('--audit=')) options.audit = arg.split('=')[1];
    else if (arg.startsWith('--target=')) options.target = arg.split('=')[1];
    else if (arg.startsWith('--focus=')) options.focus = arg.split('=')[1].split(',');
    else if (arg.startsWith('--model=')) options.model = arg.split('=')[1];
    else if (arg.startsWith('--trace-id=')) options.traceId = arg.split('=')[1];
    else if (arg.startsWith('--timeout=')) {
      const parsed = parseInt(arg.split('=')[1], 10);
      options.timeout = isNaN(parsed) ? 30 : parsed;
    } else if (arg.startsWith('--stagger=')) {
      const parsed = parseFloat(arg.split('=')[1]);
      options.stagger = isNaN(parsed) ? null : parsed;
    } else if (arg.startsWith('--concurrency=')) {
      const parsed = parseInt(arg.split('=')[1], 10);
      options.concurrency = isNaN(parsed) ? null : parsed;
    } else if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--json') options.json = true;
  }

  if (!options.traceId) {
    options.traceId = crypto.randomBytes(6).toString('hex');
  }

  return options;
}

/**
 * Check if tmux is available and we're in a tmux session.
 * @returns {{ available: boolean, inSession: boolean }}
 */
function checkTmux() {
  try {
    execFileSync('which', ['tmux'], { stdio: 'pipe' });
    const inSession = !!process.env.TMUX;
    return { available: true, inSession };
  } catch (_) {
    return { available: false, inSession: false };
  }
}

/**
 * Create the sentinel directory for a trace.
 * @param {string} rootDir - Project root
 * @param {string} traceId - Unique trace ID
 * @returns {string} Path to sentinel directory
 */
function createSentinelDir(rootDir, traceId) {
  const sentinelDir = path.join(rootDir, 'docs', '09-agents', 'ultradeep', traceId);
  fs.mkdirSync(sentinelDir, { recursive: true });
  return sentinelDir;
}

/**
 * Write initial status file for the trace.
 * @param {string} sentinelDir - Sentinel directory path
 * @param {string} auditType - Audit type key
 * @param {Array} analyzers - Array of analyzer configs
 * @param {number} [staggerMs] - Stagger delay in milliseconds
 * @param {number} [maxConcurrent] - Max concurrent sessions (0 = unlimited)
 */
function writeStatusFile(sentinelDir, auditType, analyzers, staggerMs, maxConcurrent, extra) {
  const status = {
    started_at: new Date().toISOString(),
    audit_type: auditType,
    analyzers: analyzers.map(a => a.key),
    completed: [],
    failed: [],
    stagger_ms: staggerMs != null ? staggerMs : null,
    max_concurrent: maxConcurrent || null,
  };
  // Store extra fields for retry support
  if (extra) {
    if (extra.target != null) status.target = extra.target;
    if (extra.model != null) status.model = extra.model;
    if (extra.timeout_minutes != null) status.timeout_minutes = extra.timeout_minutes;
  }
  fs.writeFileSync(path.join(sentinelDir, '_status.json'), JSON.stringify(status, null, 2) + '\n');
}

/**
 * Build the prompt for an individual analyzer session.
 * @param {object} analyzer - Analyzer config { key, subagent_type, label }
 * @param {string} target - Target path to analyze
 * @param {string} traceId - Trace ID
 * @param {string} sentinelDir - Sentinel directory for output
 * @param {string} auditType - Audit type key
 * @param {string} [model] - Resolved model name for sub-agent
 * @returns {string} Prompt text
 */
function buildAnalyzerPrompt(analyzer, target, traceId, sentinelDir, auditType, model) {
  const findingsFile = path.join(sentinelDir, `${analyzer.key}.findings.json`);

  // Sanitize fields that get interpolated into double-quoted prompt sections
  const safeLabel = String(analyzer.label || '').replace(/["\\]/g, '');
  const safeTarget = String(target || '').replace(/["\\]/g, '');
  const safeSubagentType = String(analyzer.subagent_type || '').replace(/["\\]/g, '');

  return `You are an ULTRADEEP audit session coordinator.

## Task

1. Use the Agent tool to spawn a sub-agent for analysis
2. After the sub-agent completes, parse its output and write findings as JSON to the sentinel file

## Agent Configuration

Use the Agent tool with these parameters:
- subagent_type: "${safeSubagentType}"
- description: "${safeLabel} analysis of ${safeTarget}"${model ? `\n- model: "${model}"` : ''}
- prompt: |
    Analyze the target path ${safeTarget} thoroughly for ${safeLabel}-related issues.
    Search all relevant files recursively. Be thorough.
    Return a JSON object with this structure:
    {"findings": [{"id": "${analyzer.key}-NNN", "severity": "P0|P1|P2|P3", "title": "Short description", "file": "path/to/file.js", "line": 42, "description": "Detailed explanation", "evidence": "Code snippet or reasoning", "recommendation": "How to fix"}], "summary": {"files_scanned": 0, "total_findings": 0, "by_severity": {"P0": 0, "P1": 0, "P2": 0, "P3": 0}}}
    TRACE_ID: ${traceId}
    ANALYZER: ${analyzer.key}

## Output

After the Agent tool returns its analysis, write a JSON file to: ${findingsFile}

Use this structure:
{
  "analyzer": "${analyzer.key}",
  "audit_type": "${auditType}",
  "trace_id": "${traceId}",
  "target": "${safeTarget}",
  "completed_at": "<ISO timestamp>",
  "findings": [
    {
      "id": "${analyzer.key}-001",
      "severity": "P0|P1|P2|P3",
      "title": "Short description",
      "file": "path/to/file.js",
      "line": 42,
      "description": "Detailed explanation",
      "evidence": "Code snippet or reasoning",
      "recommendation": "How to fix"
    }
  ],
  "summary": {
    "files_scanned": 0,
    "total_findings": 0,
    "by_severity": { "P0": 0, "P1": 0, "P2": 0, "P3": 0 }
  }
}

IMPORTANT: You MUST write the findings JSON file when complete. This is how the orchestrator knows you're done.
If the Agent tool is unavailable or returns an error, perform the analysis directly using Read, Glob, and Grep tools.
Start by spawning the Agent now.`;
}

/**
 * Spawn a single analyzer session in tmux.
 * @param {object} params - Session parameters
 * @returns {string|null} Window name if successful, null on failure
 */
function spawnOneSession({
  analyzer,
  index,
  sessionName,
  rootDir,
  options,
  sentinelDir,
  auditType,
  groupColor,
}) {
  const windowName = `${auditType.prefix}:${analyzer.key}`;
  const model = resolveModel(options.model, 'haiku');
  const prompt = buildAnalyzerPrompt(
    analyzer,
    options.target,
    options.traceId,
    sentinelDir,
    options.audit,
    model
  );
  const escapedPrompt = prompt.replace(/'/g, "'\\''");

  try {
    if (index === 0) {
      execFileSync(
        'tmux',
        ['new-session', '-d', '-s', sessionName, '-n', windowName, '-c', rootDir],
        { stdio: 'pipe' }
      );
    } else {
      execFileSync('tmux', ['new-window', '-t', sessionName, '-n', windowName, '-c', rootDir], {
        stdio: 'pipe',
      });
    }

    execFileSync(
      'tmux',
      ['set-option', '-w', '-t', `${sessionName}:${windowName}`, '@group_color', groupColor],
      { stdio: 'pipe' }
    );

    const claudeCmd = `echo '${escapedPrompt}' | claude --model ${model} --allowedTools 'Read Glob Grep Write Agent' 2>&1; echo "AUDIT_COMPLETE: ${analyzer.key}"`;
    execFileSync('tmux', ['send-keys', '-t', `${sessionName}:${windowName}`, claudeCmd, 'Enter'], {
      stdio: 'pipe',
    });

    return windowName;
  } catch (err) {
    console.error(`Failed to spawn ${windowName}: ${err.message}`);
    return null;
  }
}

/**
 * Poll sentinel directory for wave completion.
 * @param {string} sentinelDir - Sentinel directory path
 * @param {string[]} keys - Analyzer keys to wait for
 * @param {number} timeoutMinutes - Timeout in minutes
 * @returns {Promise<boolean>} true if all completed, false on timeout
 */
async function pollWaveCompletion(sentinelDir, keys, timeoutMinutes) {
  const timeoutMs = (timeoutMinutes || 30) * 60 * 1000;
  const startTime = Date.now();
  while (Date.now() - startTime < timeoutMs) {
    const allDone = keys.every(key =>
      fs.existsSync(path.join(sentinelDir, `${key}.findings.json`))
    );
    if (allDone) return true;
    await sleep(3000);
  }
  return false;
}

/**
 * Spawn audit analyzer sessions in tmux with staggered launching.
 * @param {object} options - Parsed CLI options
 * @returns {Promise<{ ok: boolean, traceId: string, sentinelDir: string, sessions: string[] }>}
 */
async function spawnAuditInTmux(options) {
  const rootDir = process.cwd();
  const auditType = getAuditType(options.audit);

  if (!auditType) {
    console.error(`Unknown audit type: ${options.audit}`);
    console.error(`Valid types: logic, security, performance, test, completeness, legal`);
    process.exit(1);
  }

  const result = getAnalyzersForAudit(options.audit, 'ultradeep', options.focus);
  if (!result || result.analyzers.length === 0) {
    console.error(`No analyzers found for ${options.audit} with focus: ${options.focus.join(',')}`);
    process.exit(1);
  }

  // Enforce session limit
  if (result.analyzers.length > 20) {
    console.error(`Too many analyzers (${result.analyzers.length}). Maximum is 20.`);
    process.exit(1);
  }

  const sentinelDir = createSentinelDir(rootDir, options.traceId);

  // Resolve stagger and concurrency from CLI flags or config
  const config = getUltradeepConfig();
  const staggerMs =
    ((options.stagger != null ? options.stagger : config.stagger_seconds) || 0) * 1000;
  const maxConcurrent = options.concurrency != null ? options.concurrency : config.max_concurrent;

  writeStatusFile(sentinelDir, options.audit, result.analyzers, staggerMs, maxConcurrent, {
    target: options.target,
    model: options.model,
    timeout_minutes: options.timeout,
  });

  const groupColor = getColorForAudit(options.audit);
  const sessions = [];

  // Use stderr for human output when --json mode is active
  const log = options.json ? console.error : console.log;

  if (options.dryRun) {
    log(`\nDry run - would spawn ${result.analyzers.length} sessions:`);
    log(`  Stagger: ${staggerMs / 1000}s between launches`);
    if (maxConcurrent > 0) {
      const waveCount = Math.ceil(result.analyzers.length / maxConcurrent);
      log(`  Concurrency: ${maxConcurrent}/wave (${waveCount} waves)`);
    }
    for (const analyzer of result.analyzers) {
      const model = resolveModel(options.model, 'haiku');
      log(`  ${auditType.prefix}:${analyzer.key} (${model}) → ${analyzer.label}`);
    }
    log(`\nSentinel dir: ${sentinelDir}`);
    log(`Group color: ${groupColor}`);
    return { ok: true, traceId: options.traceId, sentinelDir, sessions: [], dryRun: true };
  }

  const tmux = checkTmux();
  if (!tmux.available) {
    console.error('tmux is not available. ULTRADEEP mode requires tmux.');
    console.error('Falling back to DEPTH=deep mode.');
    return { ok: false, traceId: options.traceId, sentinelDir, sessions: [], fallback: 'deep' };
  }

  // Create dedicated tmux session for this audit
  const sessionName = `audit-${options.audit}-${options.traceId.slice(0, 8)}`;
  let sessionIndex = 0;

  if (maxConcurrent > 0 && result.analyzers.length > maxConcurrent) {
    // Wave-based spawning
    const waves = [];
    for (let i = 0; i < result.analyzers.length; i += maxConcurrent) {
      waves.push(result.analyzers.slice(i, i + maxConcurrent));
    }
    for (let w = 0; w < waves.length; w++) {
      if (w > 0) {
        const prevKeys = waves[w - 1].map(a => a.key);
        await pollWaveCompletion(sentinelDir, prevKeys, options.timeout);
      }
      for (let i = 0; i < waves[w].length; i++) {
        if (sessionIndex > 0 && staggerMs > 0) await sleep(staggerMs);
        const name = spawnOneSession({
          analyzer: waves[w][i],
          index: sessionIndex,
          sessionName,
          rootDir,
          options,
          sentinelDir,
          auditType,
          groupColor,
        });
        if (name) sessions.push(name);
        sessionIndex++;
      }
    }
  } else {
    // Simple staggered spawning (no wave limit)
    for (let i = 0; i < result.analyzers.length; i++) {
      if (i > 0 && staggerMs > 0) await sleep(staggerMs);
      const name = spawnOneSession({
        analyzer: result.analyzers[i],
        index: i,
        sessionName,
        rootDir,
        options,
        sentinelDir,
        auditType,
        groupColor,
      });
      if (name) sessions.push(name);
    }
  }

  // Apply the same status bar theme as normal Claude sessions
  try {
    const tmuxScript = path.join(__dirname, 'claude-tmux.sh');
    execFileSync(tmuxScript, [`--configure-session=${sessionName}`], { stdio: 'pipe' });
  } catch (_) {
    // Non-critical styling failure — audit session still works with default theme
  }

  log(`\nSpawned ${sessions.length} analyzer sessions in tmux session: ${sessionName}`);
  log(`Sentinel dir: ${sentinelDir}`);
  log(`Attach with: tmux attach -t ${sessionName}`);

  return { ok: true, traceId: options.traceId, sentinelDir, sessions, sessionName };
}

/**
 * Poll sentinel directory for completion.
 * @param {string} sentinelDir - Sentinel directory path
 * @param {string[]} expected - Expected analyzer keys
 * @param {number} timeoutMinutes - Timeout in minutes
 * @returns {Promise<{ complete: boolean, results: object[], missing: string[] }>}
 */
async function pollForCompletion(sentinelDir, expected, timeoutMinutes) {
  const timeoutMs = timeoutMinutes * 60 * 1000;
  const startTime = Date.now();
  const pollIntervalMs = 5000;

  while (Date.now() - startTime < timeoutMs) {
    const completed = [];
    const missing = [];

    for (const key of expected) {
      const findingsFile = path.join(sentinelDir, `${key}.findings.json`);
      if (fs.existsSync(findingsFile)) {
        completed.push(key);
      } else {
        missing.push(key);
      }
    }

    // Update status file
    try {
      const statusPath = path.join(sentinelDir, '_status.json');
      const status = JSON.parse(fs.readFileSync(statusPath, 'utf8'));
      status.completed = completed;
      status.last_checked = new Date().toISOString();
      fs.writeFileSync(statusPath, JSON.stringify(status, null, 2) + '\n');
    } catch (_) {
      // Non-critical
    }

    if (missing.length === 0) {
      return { complete: true, results: collectResults(sentinelDir, expected), missing: [] };
    }

    await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
  }

  // Timeout
  const results = collectResults(sentinelDir, expected);
  const completedKeys = results.map(r => r.analyzer);
  const missing = expected.filter(k => !completedKeys.includes(k));
  return { complete: false, results, missing };
}

/**
 * Collect all findings from sentinel directory.
 * @param {string} sentinelDir - Sentinel directory path
 * @param {string[]} expected - Expected analyzer keys
 * @returns {object[]} Array of parsed findings
 */
function collectResults(sentinelDir, expected) {
  const results = [];

  for (const key of expected) {
    const findingsFile = path.join(sentinelDir, `${key}.findings.json`);
    try {
      if (fs.existsSync(findingsFile)) {
        const data = JSON.parse(fs.readFileSync(findingsFile, 'utf8'));
        results.push(data);
      }
    } catch (err) {
      results.push({
        analyzer: key,
        error: `Failed to parse findings: ${err.message}`,
        findings: [],
      });
    }
  }

  return results;
}

/**
 * Show cost estimation before launching.
 * @param {string} auditType - Audit type key
 * @param {number} analyzerCount - Number of analyzers to spawn
 * @param {string} [model] - Explicit model override
 * @param {object} [opts] - Options
 * @param {boolean} [opts.json] - If true, route output to stderr to keep stdout clean for JSON
 */
function showCostEstimate(auditType, analyzerCount, model, opts) {
  const resolved = resolveModel(model, 'haiku');
  const estimate = estimateCost(resolved, analyzerCount);
  const log = opts && opts.json ? console.error : console.log;

  log(`\nCost estimate for ULTRADEEP ${auditType} audit:`);
  log(`  Model: ${estimate.model}`);
  log(`  Analyzers: ${analyzerCount}`);
  log(`  Cost multiplier vs haiku: ${estimate.multiplier}x`);
  log(`  Per-analyzer estimate: ${estimate.perAnalyzerCost}`);
  log(`  Total estimate: ${estimate.totalEstimate}`);
  log(`  Each analyzer runs as a full Claude Code session`);
}

// Main
if (require.main === module) {
  (async () => {
    const options = parseArgs();

    if (!options.audit) {
      console.error(
        'Usage: node spawn-audit-sessions.js --audit=TYPE --target=PATH [--focus=AREAS] [--model=MODEL] [--trace-id=ID] [--stagger=SECONDS] [--concurrency=N]'
      );
      console.error('Types: logic, security, performance, test, completeness, legal');
      process.exit(1);
    }

    const result = getAnalyzersForAudit(options.audit, 'ultradeep', options.focus);
    if (result) {
      showCostEstimate(options.audit, result.analyzers.length, options.model, {
        json: options.json,
      });
    }

    const spawnResult = await spawnAuditInTmux(options);

    if (options.json) {
      const jsonOut = {
        ok: spawnResult.ok,
        traceId: spawnResult.traceId,
        sentinelDir: spawnResult.sentinelDir,
        sessionName: spawnResult.sessionName || null,
        sessions: spawnResult.sessions,
        dryRun: spawnResult.dryRun || false,
        fallback: spawnResult.fallback || null,
      };
      console.log(JSON.stringify(jsonOut));
    }

    if (!spawnResult.ok && spawnResult.fallback) {
      process.exit(2); // Signal fallback to caller
    }
  })().catch(err => {
    console.error(err.message);
    process.exit(1);
  });
}

module.exports = {
  parseArgs,
  checkTmux,
  createSentinelDir,
  writeStatusFile,
  buildAnalyzerPrompt,
  spawnOneSession,
  spawnAuditInTmux,
  pollForCompletion,
  pollWaveCompletion,
  collectResults,
  showCostEstimate,
  getUltradeepConfig,
  sleep,
};
