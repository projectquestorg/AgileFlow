/**
 * Unit tests for the hook execution JSONL logger.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import loggerModule from '../../../src/runtime/hooks/logger.js';

const { appendHookLog, truncate, MAX_OUTPUT_BYTES } = loggerModule;

describe('truncate', () => {
  it('returns short strings unchanged', () => {
    expect(truncate('hello')).toBe('hello');
  });

  it('returns empty string for null/undefined/empty inputs', () => {
    expect(truncate(null)).toBe('');
    expect(truncate(undefined)).toBe('');
    expect(truncate('')).toBe('');
  });

  it('truncates oversized strings with a marker', () => {
    const big = 'a'.repeat(MAX_OUTPUT_BYTES + 10);
    const t = truncate(big);
    expect(t.length).toBeGreaterThan(MAX_OUTPUT_BYTES);
    expect(t).toMatch(/…\[truncated\]$/);
  });

  it('handles Buffer inputs', () => {
    expect(truncate(Buffer.from('x'))).toBe('x');
  });
});

describe('appendHookLog', () => {
  /** @type {string} */
  let scratch;
  /** @type {string} */
  let logPath;

  beforeEach(() => {
    scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'af-log-'));
    logPath = path.join(scratch, 'logs', 'hook-execution.jsonl');
  });

  afterEach(() => {
    fs.rmSync(scratch, { recursive: true, force: true });
  });

  it('creates the log file and parent directory on first write', async () => {
    await appendHookLog(logPath, {
      timestamp: '2026-04-26T00:00:00Z',
      event: 'SessionStart',
      hookId: 'welcome',
      status: 'ok',
      exitCode: 0,
      durationMs: 10,
    });
    expect(fs.existsSync(logPath)).toBe(true);
    const content = fs.readFileSync(logPath, 'utf8');
    expect(content.endsWith('\n')).toBe(true);
    const parsed = JSON.parse(content.trim());
    expect(parsed.hookId).toBe('welcome');
    expect(parsed.status).toBe('ok');
  });

  it('appends one JSON object per line', async () => {
    await appendHookLog(logPath, { timestamp: 't1', event: 'SessionStart', hookId: 'a', status: 'ok', exitCode: 0, durationMs: 1 });
    await appendHookLog(logPath, { timestamp: 't2', event: 'SessionStart', hookId: 'b', status: 'error', exitCode: 1, durationMs: 2 });
    const lines = fs.readFileSync(logPath, 'utf8').trim().split('\n');
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]).hookId).toBe('a');
    expect(JSON.parse(lines[1]).hookId).toBe('b');
  });

  it('drops undefined keys (compact lines)', async () => {
    await appendHookLog(logPath, {
      timestamp: 't',
      event: 'SessionStart',
      hookId: 'a',
      status: 'ok',
      exitCode: 0,
      durationMs: 0,
      stdout: undefined,
      stderr: undefined,
    });
    const parsed = JSON.parse(fs.readFileSync(logPath, 'utf8').trim());
    expect('stdout' in parsed).toBe(false);
    expect('stderr' in parsed).toBe(false);
  });

  it('truncates oversized stdout/stderr', async () => {
    const big = 'x'.repeat(MAX_OUTPUT_BYTES + 100);
    await appendHookLog(logPath, {
      timestamp: 't',
      event: 'Stop',
      hookId: 'big',
      status: 'ok',
      exitCode: 0,
      durationMs: 0,
      stdout: big,
    });
    const parsed = JSON.parse(fs.readFileSync(logPath, 'utf8').trim());
    expect(parsed.stdout).toMatch(/…\[truncated\]$/);
  });
});
