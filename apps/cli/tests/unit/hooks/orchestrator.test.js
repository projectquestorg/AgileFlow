/**
 * Unit tests for the hook orchestrator.
 *
 * The orchestrator is tested with a stubbed `runHook` to avoid spawning
 * real child processes. The default child-process runner is exercised
 * by the integration tests later.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import yaml from 'js-yaml';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import orchestratorModule from '../../../src/runtime/hooks/orchestrator.js';

const { runEvent, applyOverride, resolveScriptPath } = orchestratorModule;

/**
 * Build a manifest YAML on disk and return the agileflowDir for runEvent.
 * @param {string} scratch
 * @param {object} manifest
 */
function writeManifest(scratch, manifest) {
  const agileflowDir = path.join(scratch, '.agileflow');
  fs.mkdirSync(agileflowDir, { recursive: true });
  fs.writeFileSync(
    path.join(agileflowDir, 'hook-manifest.yaml'),
    yaml.dump(manifest),
    'utf8',
  );
  return agileflowDir;
}

/**
 * @param {Record<string, { exitCode?: number, stdout?: string, stderr?: string, timedOut?: boolean, durationMs?: number, throws?: Error }>} byId
 */
function makeRunHook(byId) {
  return async (hook) => {
    const cfg = byId[hook.id];
    if (cfg && cfg.throws) throw cfg.throws;
    return {
      // Use 'in' check so a test can explicitly set `exitCode: null`
      // (real timeout case) without it getting coerced to 0.
      exitCode: cfg && 'exitCode' in cfg ? cfg.exitCode : 0,
      stdout: (cfg && cfg.stdout) || '',
      stderr: (cfg && cfg.stderr) || '',
      durationMs: (cfg && cfg.durationMs) || 1,
      timedOut: Boolean(cfg && cfg.timedOut),
    };
  };
}

describe('runEvent', () => {
  /** @type {string} */
  let scratch;

  beforeEach(() => {
    scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'af-orch-'));
  });

  afterEach(() => {
    fs.rmSync(scratch, { recursive: true, force: true });
  });

  it('returns exitCode 0 with no steps when manifest is missing', async () => {
    const agileflowDir = path.join(scratch, '.agileflow');
    const result = await runEvent({ event: 'SessionStart', agileflowDir });
    expect(result.exitCode).toBe(0);
    expect(result.steps).toEqual([]);
  });

  it('runs a single hook in declaration order', async () => {
    const agileflowDir = writeManifest(scratch, {
      version: 1,
      hooks: [{ id: 'welcome', event: 'SessionStart', script: 'plugins/core/hooks/welcome.js' }],
    });
    const calls = [];
    const result = await runEvent({
      event: 'SessionStart',
      agileflowDir,
      runHook: async (h) => {
        calls.push(h.id);
        return { exitCode: 0, stdout: '', stderr: '', durationMs: 1, timedOut: false };
      },
    });
    expect(calls).toEqual(['welcome']);
    expect(result.exitCode).toBe(0);
    expect(result.steps).toHaveLength(1);
    expect(result.steps[0].status).toBe('ok');
  });

  it('orders the chain by runAfter', async () => {
    const agileflowDir = writeManifest(scratch, {
      version: 1,
      hooks: [
        { id: 'second', event: 'SessionStart', script: 's.js', runAfter: ['first'] },
        { id: 'first', event: 'SessionStart', script: 'f.js' },
      ],
    });
    const calls = [];
    await runEvent({
      event: 'SessionStart',
      agileflowDir,
      runHook: async (h) => {
        calls.push(h.id);
        return { exitCode: 0, stdout: '', stderr: '', durationMs: 0, timedOut: false };
      },
    });
    expect(calls).toEqual(['first', 'second']);
  });

  it('continues the chain when a skipOnError hook fails', async () => {
    const agileflowDir = writeManifest(scratch, {
      version: 1,
      hooks: [
        { id: 'flaky', event: 'SessionStart', script: 'f.js', skipOnError: true },
        { id: 'after-flaky', event: 'SessionStart', script: 'a.js', runAfter: ['flaky'] },
      ],
    });
    const result = await runEvent({
      event: 'SessionStart',
      agileflowDir,
      runHook: makeRunHook({ flaky: { exitCode: 1, stderr: 'boom' } }),
    });
    expect(result.exitCode).toBe(0);
    expect(result.steps.map((s) => `${s.hook.id}=${s.status}`)).toEqual([
      'flaky=error',
      'after-flaky=ok',
    ]);
  });

  it('aborts the chain and returns exitCode 1 when a non-skipOnError hook fails', async () => {
    const agileflowDir = writeManifest(scratch, {
      version: 1,
      hooks: [
        { id: 'critical', event: 'PreToolUse:Bash', script: 'c.js', skipOnError: false },
        { id: 'never-runs', event: 'PreToolUse:Bash', script: 'n.js', runAfter: ['critical'] },
      ],
    });
    const calls = [];
    const result = await runEvent({
      event: 'PreToolUse:Bash',
      agileflowDir,
      runHook: async (h) => {
        calls.push(h.id);
        return { exitCode: h.id === 'critical' ? 2 : 0, stdout: '', stderr: '', durationMs: 0, timedOut: false };
      },
    });
    expect(result.exitCode).toBe(1);
    expect(calls).toEqual(['critical']);
    expect(result.steps).toHaveLength(1);
  });

  it('ignores hooks for other events', async () => {
    const agileflowDir = writeManifest(scratch, {
      version: 1,
      hooks: [
        { id: 'on-start', event: 'SessionStart', script: 'a.js' },
        { id: 'on-stop', event: 'Stop', script: 'b.js' },
      ],
    });
    const calls = [];
    await runEvent({
      event: 'SessionStart',
      agileflowDir,
      runHook: async (h) => {
        calls.push(h.id);
        return { exitCode: 0, stdout: '', stderr: '', durationMs: 0, timedOut: false };
      },
    });
    expect(calls).toEqual(['on-start']);
  });

  it('respects per-hook user overrides (enabled=false)', async () => {
    const agileflowDir = writeManifest(scratch, {
      version: 1,
      hooks: [{ id: 'optional', event: 'SessionStart', script: 'o.js' }],
    });
    const calls = [];
    await runEvent({
      event: 'SessionStart',
      agileflowDir,
      overrides: { optional: { enabled: false } },
      runHook: async (h) => {
        calls.push(h.id);
        return { exitCode: 0, stdout: '', stderr: '', durationMs: 0, timedOut: false };
      },
    });
    expect(calls).toEqual([]);
  });

  it('writes one JSONL log line per executed hook', async () => {
    const agileflowDir = writeManifest(scratch, {
      version: 1,
      hooks: [
        { id: 'a', event: 'SessionStart', script: 'a.js' },
        { id: 'b', event: 'SessionStart', script: 'b.js' },
      ],
    });
    await runEvent({
      event: 'SessionStart',
      agileflowDir,
      runHook: makeRunHook({ a: { exitCode: 0 }, b: { exitCode: 0 } }),
    });
    const log = fs.readFileSync(
      path.join(agileflowDir, 'logs', 'hook-execution.jsonl'),
      'utf8',
    );
    const lines = log.trim().split('\n').map((l) => JSON.parse(l));
    expect(lines.map((l) => l.hookId)).toEqual(['a', 'b']);
    expect(lines.every((l) => l.status === 'ok')).toBe(true);
  });

  it('records timeout status when runHook reports timedOut: true', async () => {
    const agileflowDir = writeManifest(scratch, {
      version: 1,
      hooks: [{ id: 'slow', event: 'SessionStart', script: 's.js', timeout: 100 }],
    });
    const result = await runEvent({
      event: 'SessionStart',
      agileflowDir,
      runHook: makeRunHook({ slow: { exitCode: null, timedOut: true } }),
    });
    expect(result.steps[0].status).toBe('timeout');
  });

  it('treats runHook throws as errors (status=error, exitCode=null)', async () => {
    const agileflowDir = writeManifest(scratch, {
      version: 1,
      hooks: [{ id: 'crashy', event: 'SessionStart', script: 'c.js' }],
    });
    const result = await runEvent({
      event: 'SessionStart',
      agileflowDir,
      runHook: makeRunHook({ crashy: { throws: new Error('spawn ENOENT') } }),
    });
    expect(result.steps[0].status).toBe('error');
    expect(result.steps[0].exitCode).toBeNull();
    // skipOnError defaults true, so chain still exits 0
    expect(result.exitCode).toBe(0);
  });
});

describe('applyOverride', () => {
  const base = {
    id: 'a',
    event: 'SessionStart',
    script: 'a.js',
    runAfter: [],
    timeout: 5000,
    skipOnError: true,
    enabled: true,
  };

  it('returns the input unchanged when override is undefined', () => {
    expect(applyOverride(base, undefined)).toEqual(base);
  });

  it('overrides individual fields', () => {
    const out = applyOverride(base, { timeout: 9999, enabled: false });
    expect(out.timeout).toBe(9999);
    expect(out.enabled).toBe(false);
    expect(out.skipOnError).toBe(true); // untouched
  });
});

describe('resolveScriptPath', () => {
  it('joins relative scripts against the project root (parent of agileflowDir)', () => {
    const projectRoot = '/tmp/proj';
    const agileflowDir = '/tmp/proj/.agileflow';
    const out = resolveScriptPath(
      {
        id: 'a',
        event: 'SessionStart',
        script: '.agileflow/plugins/core/hooks/welcome.js',
        runAfter: [], timeout: 5000, skipOnError: true, enabled: true,
      },
      agileflowDir,
    );
    expect(out.script).toBe(path.join(projectRoot, '.agileflow/plugins/core/hooks/welcome.js'));
  });

  it('leaves absolute scripts alone', () => {
    const out = resolveScriptPath(
      { id: 'a', event: 'SessionStart', script: '/abs/path/h.js', runAfter: [], timeout: 0, skipOnError: true, enabled: true },
      '/tmp/proj/.agileflow',
    );
    expect(out.script).toBe('/abs/path/h.js');
  });
});
