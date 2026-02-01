/**
 * Tests for flag-detection.js - Claude session flag detection and propagation
 */

const {
  extractClaudeFlags,
  parseCmdline,
  isClaudeProcess,
  flagsToStartupMode,
  detectParentSessionFlags,
  getInheritedFlags,
  PROPAGATABLE_FLAGS,
} = require('../../lib/flag-detection');

describe('flag-detection', () => {
  describe('extractClaudeFlags', () => {
    it('extracts --dangerously-skip-permissions flag', () => {
      const args = ['claude', '--dangerously-skip-permissions'];
      expect(extractClaudeFlags(args)).toEqual(['--dangerously-skip-permissions']);
    });

    it('extracts --permission-mode with separate value', () => {
      const args = ['claude', '--permission-mode', 'acceptEdits'];
      expect(extractClaudeFlags(args)).toEqual(['--permission-mode acceptEdits']);
    });

    it('extracts --permission-mode with equals syntax', () => {
      const args = ['claude', '--permission-mode=acceptEdits'];
      expect(extractClaudeFlags(args)).toEqual(['--permission-mode=acceptEdits']);
    });

    it('extracts --model with separate value', () => {
      const args = ['claude', '--model', 'claude-3-opus'];
      expect(extractClaudeFlags(args)).toEqual(['--model claude-3-opus']);
    });

    it('extracts --model with equals syntax', () => {
      const args = ['claude', '--model=claude-3-opus'];
      expect(extractClaudeFlags(args)).toEqual(['--model=claude-3-opus']);
    });

    it('extracts --verbose flag', () => {
      const args = ['claude', '--verbose'];
      expect(extractClaudeFlags(args)).toEqual(['--verbose']);
    });

    it('extracts -v short flag as --verbose', () => {
      const args = ['claude', '-v'];
      expect(extractClaudeFlags(args)).toEqual(['--verbose']);
    });

    it('extracts multiple flags', () => {
      const args = ['claude', '--dangerously-skip-permissions', '--verbose', '--model', 'opus'];
      expect(extractClaudeFlags(args)).toEqual([
        '--dangerously-skip-permissions',
        '--verbose',
        '--model opus',
      ]);
    });

    it('returns empty array for no flags', () => {
      const args = ['claude'];
      expect(extractClaudeFlags(args)).toEqual([]);
    });

    it('ignores non-propagatable flags', () => {
      const args = ['claude', '--resume', 'abc123', '--print'];
      expect(extractClaudeFlags(args)).toEqual([]);
    });
  });

  describe('parseCmdline', () => {
    it('parses null-separated format (Linux /proc)', () => {
      const cmdline = 'claude\0--dangerously-skip-permissions\0';
      const result = parseCmdline(cmdline, true);
      expect(result).toEqual(['claude', '--dangerously-skip-permissions']);
    });

    it('parses space-separated format', () => {
      const cmdline = 'claude --dangerously-skip-permissions';
      const result = parseCmdline(cmdline, false);
      expect(result).toEqual(['claude', '--dangerously-skip-permissions']);
    });

    it('handles double-quoted strings', () => {
      const cmdline = 'claude --prompt "hello world"';
      const result = parseCmdline(cmdline, false);
      expect(result).toEqual(['claude', '--prompt', 'hello world']);
    });

    it('handles single-quoted strings', () => {
      const cmdline = "claude --prompt 'hello world'";
      const result = parseCmdline(cmdline, false);
      expect(result).toEqual(['claude', '--prompt', 'hello world']);
    });

    it('handles empty input', () => {
      expect(parseCmdline('', false)).toEqual([]);
      expect(parseCmdline('', true)).toEqual([]);
    });

    it('handles multiple null separators', () => {
      const cmdline = '\0\0claude\0\0--verbose\0\0';
      const result = parseCmdline(cmdline, true);
      expect(result).toEqual(['claude', '--verbose']);
    });
  });

  describe('isClaudeProcess', () => {
    it('detects claude command', () => {
      expect(isClaudeProcess(['claude'])).toBe(true);
      expect(isClaudeProcess(['claude', '--verbose'])).toBe(true);
    });

    it('detects claude with full path', () => {
      expect(isClaudeProcess(['/usr/local/bin/claude'])).toBe(true);
      expect(isClaudeProcess(['/home/user/.npm/bin/claude'])).toBe(true);
    });

    it('detects claude-code variations', () => {
      expect(isClaudeProcess(['claude-code'])).toBe(true);
      expect(isClaudeProcess(['/bin/claude-code'])).toBe(true);
    });

    it('detects @anthropic package', () => {
      expect(isClaudeProcess(['node', '@anthropic/cli'])).toBe(true);
    });

    it('returns false for non-claude processes', () => {
      expect(isClaudeProcess(['node', 'script.js'])).toBe(false);
      expect(isClaudeProcess(['bash'])).toBe(false);
      expect(isClaudeProcess(['vim'])).toBe(false);
    });

    it('returns false for empty input', () => {
      expect(isClaudeProcess([])).toBe(false);
      expect(isClaudeProcess(null)).toBe(false);
      expect(isClaudeProcess(undefined)).toBe(false);
    });
  });

  describe('flagsToStartupMode', () => {
    it('maps --dangerously-skip-permissions to Trust mode', () => {
      const mode = flagsToStartupMode('--dangerously-skip-permissions');
      expect(mode).toBe('Trust mode (skip permissions)');
    });

    it('maps --permission-mode to Permission mode', () => {
      const mode = flagsToStartupMode('--permission-mode acceptEdits');
      expect(mode).toBe('Permission mode: acceptEdits');
    });

    it('maps --permission-mode with equals syntax', () => {
      const mode = flagsToStartupMode('--permission-mode=denyAll');
      expect(mode).toBe('Permission mode: denyAll');
    });

    it('returns null for unknown flags', () => {
      expect(flagsToStartupMode('--verbose')).toBe(null);
      expect(flagsToStartupMode('--model opus')).toBe(null);
    });

    it('returns null for empty or null input', () => {
      expect(flagsToStartupMode('')).toBe(null);
      expect(flagsToStartupMode(null)).toBe(null);
    });
  });

  describe('detectParentSessionFlags', () => {
    const originalEnv = process.env.CLAUDE_SESSION_FLAGS;

    afterEach(() => {
      // Restore original environment
      if (originalEnv === undefined) {
        delete process.env.CLAUDE_SESSION_FLAGS;
      } else {
        process.env.CLAUDE_SESSION_FLAGS = originalEnv;
      }
    });

    it('detects flags from CLAUDE_SESSION_FLAGS env var', () => {
      process.env.CLAUDE_SESSION_FLAGS = '--dangerously-skip-permissions';
      const result = detectParentSessionFlags();
      expect(result.flags).toBe('--dangerously-skip-permissions');
      expect(result.source).toBe('env');
      expect(result.mode).toBe('Trust mode (skip permissions)');
    });

    it('handles empty env var', () => {
      process.env.CLAUDE_SESSION_FLAGS = '';
      const result = detectParentSessionFlags();
      // Empty string means no flags, but env was checked
      expect(result.source).not.toBe('env');
    });

    it('handles whitespace-only env var', () => {
      process.env.CLAUDE_SESSION_FLAGS = '   ';
      const result = detectParentSessionFlags();
      expect(result.source).not.toBe('env');
    });

    it('returns none source when no detection method works', () => {
      delete process.env.CLAUDE_SESSION_FLAGS;
      const result = detectParentSessionFlags();
      // When run outside of a Claude session, should return 'none' or one of the fallbacks
      expect(['env', 'proc', 'ps', 'none']).toContain(result.source);
    });
  });

  describe('getInheritedFlags', () => {
    const originalEnv = process.env.CLAUDE_SESSION_FLAGS;

    afterEach(() => {
      if (originalEnv === undefined) {
        delete process.env.CLAUDE_SESSION_FLAGS;
      } else {
        process.env.CLAUDE_SESSION_FLAGS = originalEnv;
      }
    });

    it('returns flags from environment', () => {
      process.env.CLAUDE_SESSION_FLAGS = '--dangerously-skip-permissions';
      expect(getInheritedFlags()).toBe('--dangerously-skip-permissions');
    });

    it('returns empty string when no flags detected', () => {
      delete process.env.CLAUDE_SESSION_FLAGS;
      const result = getInheritedFlags();
      expect(typeof result).toBe('string');
    });
  });

  describe('PROPAGATABLE_FLAGS', () => {
    it('contains expected flags', () => {
      expect(PROPAGATABLE_FLAGS).toContain('--dangerously-skip-permissions');
      expect(PROPAGATABLE_FLAGS).toContain('--permission-mode');
      expect(PROPAGATABLE_FLAGS).toContain('--model');
      expect(PROPAGATABLE_FLAGS).toContain('--verbose');
    });
  });
});
