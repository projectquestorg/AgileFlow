/**
 * Tests for check-sessions.js
 *
 * Verifies the wrapper delegates correctly to tmux-audit-monitor.js
 */

const path = require('path');
const { execFileSync } = require('child_process');

const scriptPath = path.join(__dirname, '..', '..', 'scripts', 'check-sessions.js');

describe('check-sessions.js', () => {
  function run(...args) {
    return execFileSync('node', [scriptPath, ...args], {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: process.cwd(),
      timeout: 10000,
    });
  }

  function runWithStderr(...args) {
    try {
      const result = require('child_process').spawnSync('node', [scriptPath, ...args], {
        encoding: 'utf8',
        cwd: process.cwd(),
        timeout: 10000,
      });
      return {
        stdout: result.stdout || '',
        stderr: result.stderr || '',
        exitCode: result.status,
      };
    } catch (err) {
      return {
        stdout: err.stdout || '',
        stderr: err.stderr || '',
        exitCode: err.status,
      };
    }
  }

  describe('--help', () => {
    it('shows usage text', () => {
      const result = runWithStderr('--help');
      expect(result.exitCode).toBe(0);
      expect(result.stderr).toContain('Usage: check-sessions.js');
      expect(result.stderr).toContain('list');
      expect(result.stderr).toContain('status');
      expect(result.stderr).toContain('wait');
      expect(result.stderr).toContain('collect');
      expect(result.stderr).toContain('retry');
      expect(result.stderr).toContain('kill');
    });
  });

  describe('no arguments', () => {
    it('exits with code 1 and shows usage', () => {
      const result = runWithStderr();
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('Usage: check-sessions.js');
    });
  });

  describe('unknown subcommand', () => {
    it('outputs JSON error', () => {
      const result = runWithStderr('bogus');
      expect(result.exitCode).toBe(1);
      const json = JSON.parse(result.stdout);
      expect(json.ok).toBe(false);
      expect(json.error).toContain('Unknown subcommand: bogus');
    });
  });

  describe('list', () => {
    it('returns JSON with traces array', () => {
      const output = run('list');
      const json = JSON.parse(output);
      expect(json.ok).toBe(true);
      expect(Array.isArray(json.traces)).toBe(true);
    });
  });

  describe('status without trace_id', () => {
    it('exits with error requiring trace_id', () => {
      const result = runWithStderr('status');
      expect(result.exitCode).toBe(1);
      const json = JSON.parse(result.stdout);
      expect(json.ok).toBe(false);
      expect(json.error).toContain('trace_id required');
    });
  });

  describe('status with nonexistent trace', () => {
    it('returns not-found error', () => {
      const output = run('status', 'nonexistent-trace-abc');
      const json = JSON.parse(output);
      expect(json.ok).toBe(false);
      expect(json.error).toContain('No trace found');
    });
  });

  describe('collect without trace_id', () => {
    it('exits with error requiring trace_id', () => {
      const result = runWithStderr('collect');
      expect(result.exitCode).toBe(1);
      const json = JSON.parse(result.stdout);
      expect(json.ok).toBe(false);
      expect(json.error).toContain('trace_id required');
    });
  });

  describe('collect with nonexistent trace', () => {
    it('returns not-found error', () => {
      const output = run('collect', 'nonexistent-trace-xyz');
      const json = JSON.parse(output);
      expect(json.ok).toBe(false);
      expect(json.error).toContain('No trace found');
    });
  });

  describe('module exports', () => {
    it('exports USAGE string', () => {
      const { USAGE } = require('../../scripts/check-sessions');
      expect(typeof USAGE).toBe('string');
      expect(USAGE).toContain('check-sessions.js');
    });
  });
});
