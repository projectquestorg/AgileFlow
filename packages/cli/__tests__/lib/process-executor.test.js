/**
 * Tests for process-executor.js (US-0310)
 *
 * Uses real commands (echo, true, false, git --version) to verify behavior.
 */

const path = require('path');
const { executeCommandSync, executeCommand, spawnBackground, git, gitAsync } = require('../../lib/process-executor');

describe('process-executor', () => {
  // =========================================================================
  // executeCommandSync
  // =========================================================================
  describe('executeCommandSync', () => {
    it('returns ok:true with trimmed stdout on success', () => {
      const result = executeCommandSync('echo', ['hello world']);
      expect(result.ok).toBe(true);
      expect(result.data).toBe('hello world');
    });

    it('trims whitespace by default', () => {
      const result = executeCommandSync('echo', ['  padded  ']);
      expect(result.ok).toBe(true);
      expect(result.data).toBe('padded');
    });

    it('preserves whitespace when trim=false', () => {
      const result = executeCommandSync('echo', ['hello'], { trim: false });
      expect(result.ok).toBe(true);
      expect(result.data).toContain('hello');
      // echo adds a newline
      expect(result.data).toBe('hello\n');
    });

    it('respects cwd option', () => {
      const result = executeCommandSync('pwd', [], { cwd: '/tmp' });
      expect(result.ok).toBe(true);
      // Could be /tmp or /private/tmp on macOS
      expect(result.data).toMatch(/\/tmp/);
    });

    it('returns ok:false with exitCode on command failure', () => {
      const result = executeCommandSync('false', []);
      expect(result.ok).toBe(false);
      expect(result.exitCode).toBeGreaterThan(0);
      expect(result.error).toContain('Command failed');
    });

    it('captures stderr when captureStderr=true', () => {
      const result = executeCommandSync('ls', ['--nonexistent-flag-xyz'], { captureStderr: true });
      expect(result.ok).toBe(false);
      expect(result.stderr).toBeDefined();
    });

    it('does not include stderr by default', () => {
      const result = executeCommandSync('ls', ['--nonexistent-flag-xyz']);
      expect(result.ok).toBe(false);
      expect(result.stderr).toBeUndefined();
    });

    it('returns fallback value on failure when fallback is set', () => {
      const result = executeCommandSync('false', [], { fallback: 'default' });
      expect(result.ok).toBe(true);
      expect(result.data).toBe('default');
    });

    it('returns fallback=0 (falsy) on failure', () => {
      const result = executeCommandSync('false', [], { fallback: '0' });
      expect(result.ok).toBe(true);
      expect(result.data).toBe('0');
    });

    it('returns fallback=null on failure', () => {
      const result = executeCommandSync('false', [], { fallback: null });
      expect(result.ok).toBe(true);
      expect(result.data).toBeNull();
    });

    it('does not invoke a shell (security: metacharacters are literal)', () => {
      // If a shell were invoked, this would execute `echo injected`
      // With execFileSync (no shell), the semicolon is just a literal argument
      const result = executeCommandSync('echo', ['safe; echo injected']);
      expect(result.ok).toBe(true);
      expect(result.data).toBe('safe; echo injected');
      expect(result.data).not.toBe('safe');
    });

    it('handles timeout', () => {
      const result = executeCommandSync('sleep', ['10'], { timeout: 100 });
      expect(result.ok).toBe(false);
      expect(result.error).toContain('Command failed');
    });

    it('handles command not found', () => {
      const result = executeCommandSync('nonexistent-command-xyz', []);
      expect(result.ok).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  // =========================================================================
  // executeCommand (async)
  // =========================================================================
  describe('executeCommand', () => {
    it('resolves with ok:true on success', async () => {
      const result = await executeCommand('echo', ['async hello']);
      expect(result.ok).toBe(true);
      expect(result.data).toBe('async hello');
    });

    it('resolves (never rejects) on failure', async () => {
      const result = await executeCommand('false', []);
      expect(result.ok).toBe(false);
      expect(result.exitCode).toBeGreaterThan(0);
    });

    it('uses fallback on failure', async () => {
      const result = await executeCommand('false', [], { fallback: 'async-default' });
      expect(result.ok).toBe(true);
      expect(result.data).toBe('async-default');
    });

    it('handles timeout with SIGTERM', async () => {
      const result = await executeCommand('sleep', ['10'], { timeout: 200 });
      expect(result.ok).toBe(false);
      expect(result.error).toContain('timed out');
    });

    it('uses fallback on timeout', async () => {
      const result = await executeCommand('sleep', ['10'], { timeout: 200, fallback: 'timed-out' });
      expect(result.ok).toBe(true);
      expect(result.data).toBe('timed-out');
    });

    it('captures stderr when captureStderr=true', async () => {
      const result = await executeCommand('ls', ['--nonexistent-flag-xyz'], { captureStderr: true });
      expect(result.ok).toBe(false);
      if (result.stderr) {
        expect(typeof result.stderr).toBe('string');
      }
    });

    it('resolves on spawn error (command not found)', async () => {
      const result = await executeCommand('nonexistent-command-xyz', []);
      expect(result.ok).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  // =========================================================================
  // git / gitAsync shortcuts
  // =========================================================================
  describe('git', () => {
    it('executes git commands', () => {
      const result = git(['--version']);
      expect(result.ok).toBe(true);
      expect(result.data).toMatch(/git version/);
    });

    it('passes options through', () => {
      const result = git(['log', '--oneline', '-1'], { cwd: process.cwd() });
      // May fail in non-git dirs, but should return a structured result
      expect(typeof result.ok).toBe('boolean');
    });

    it('uses fallback for failed git commands', () => {
      const result = git(['rev-list', '--count', 'nonexistent-ref'], { fallback: '0' });
      expect(result.ok).toBe(true);
      expect(result.data).toBe('0');
    });
  });

  describe('gitAsync', () => {
    it('executes git commands asynchronously', async () => {
      const result = await gitAsync(['--version']);
      expect(result.ok).toBe(true);
      expect(result.data).toMatch(/git version/);
    });

    it('uses fallback for failed async git commands', async () => {
      const result = await gitAsync(['rev-list', '--count', 'nonexistent-ref'], { fallback: '0' });
      expect(result.ok).toBe(true);
      expect(result.data).toBe('0');
    });
  });

  // =========================================================================
  // spawnBackground
  // =========================================================================
  describe('spawnBackground', () => {
    it('spawns a detached process and returns pid', () => {
      const result = spawnBackground('sleep', ['0.1']);
      expect(result.ok).toBe(true);
      expect(typeof result.pid).toBe('number');
      expect(result.pid).toBeGreaterThan(0);
    });

    it('returns error for invalid command', () => {
      const result = spawnBackground('nonexistent-command-xyz', []);
      // spawn may not fail immediately for all platforms, but the structure should be consistent
      expect(typeof result.ok).toBe('boolean');
      if (!result.ok) {
        expect(result.error).toBeDefined();
      }
    });
  });
});
