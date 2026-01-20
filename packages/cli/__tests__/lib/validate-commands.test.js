/**
 * Tests for validate-commands.js - Command validation for shell execution
 */

const {
  ALLOWED_COMMANDS,
  DANGEROUS_PATTERNS,
  validateCommand,
  buildSpawnArgs,
  isAllowedCommand,
  getAllowedCommandList,
  parseCommand,
  checkArgSafety,
} = require('../../lib/validate-commands');

describe('validate-commands', () => {
  describe('ALLOWED_COMMANDS', () => {
    it('contains npm with expected subcommands', () => {
      expect(ALLOWED_COMMANDS.npm).toContain('test');
      expect(ALLOWED_COMMANDS.npm).toContain('run');
    });

    it('contains npx with expected subcommands', () => {
      expect(ALLOWED_COMMANDS.npx).toContain('jest');
      expect(ALLOWED_COMMANDS.npx).toContain('tsc');
      expect(ALLOWED_COMMANDS.npx).toContain('eslint');
    });

    it('allows all arguments for certain commands', () => {
      expect(ALLOWED_COMMANDS.jest).toBe(true);
      expect(ALLOWED_COMMANDS.eslint).toBe(true);
    });
  });

  describe('parseCommand', () => {
    it('parses simple command', () => {
      const result = parseCommand('npm test');
      expect(result.executable).toBe('npm');
      expect(result.args).toEqual(['test']);
    });

    it('parses command with multiple arguments', () => {
      const result = parseCommand('npm run test:unit');
      expect(result.executable).toBe('npm');
      expect(result.args).toEqual(['run', 'test:unit']);
    });

    it('handles quoted arguments', () => {
      const result = parseCommand('npm test "path with spaces"');
      expect(result.executable).toBe('npm');
      expect(result.args).toEqual(['test', 'path with spaces']);
    });

    it('handles single-quoted arguments', () => {
      const result = parseCommand("npm test 'another path'");
      expect(result.executable).toBe('npm');
      expect(result.args).toEqual(['test', 'another path']);
    });

    it('handles empty input', () => {
      const result = parseCommand('');
      expect(result.executable).toBe('');
      expect(result.args).toEqual([]);
    });

    it('handles multiple spaces', () => {
      const result = parseCommand('npm    run    test');
      expect(result.executable).toBe('npm');
      expect(result.args).toEqual(['run', 'test']);
    });
  });

  describe('checkArgSafety', () => {
    it('allows safe arguments', () => {
      expect(checkArgSafety('test').safe).toBe(true);
      expect(checkArgSafety('--coverage').safe).toBe(true);
      expect(checkArgSafety('path/to/file.js').safe).toBe(true);
    });

    it('rejects semicolon', () => {
      const result = checkArgSafety('test; rm -rf /');
      expect(result.safe).toBe(false);
    });

    it('rejects pipe', () => {
      const result = checkArgSafety('test | cat');
      expect(result.safe).toBe(false);
    });

    it('rejects command substitution with backticks', () => {
      const result = checkArgSafety('`whoami`');
      expect(result.safe).toBe(false);
    });

    it('rejects command substitution with $()', () => {
      const result = checkArgSafety('$(id)');
      expect(result.safe).toBe(false);
    });

    it('rejects variable expansion', () => {
      const result = checkArgSafety('${PATH}');
      expect(result.safe).toBe(false);
    });

    it('rejects ampersand', () => {
      const result = checkArgSafety('test && whoami');
      expect(result.safe).toBe(false);
    });

    it('rejects redirection', () => {
      const result = checkArgSafety('test > /etc/passwd');
      expect(result.safe).toBe(false);
    });
  });

  describe('validateCommand', () => {
    describe('valid commands', () => {
      it('accepts npm test', () => {
        const result = validateCommand('npm test');
        expect(result.ok).toBe(true);
        expect(result.data.command).toBe('npm');
        expect(result.data.args).toEqual(['test']);
      });

      it('accepts npm run with script name', () => {
        const result = validateCommand('npm run lint');
        expect(result.ok).toBe(true);
        expect(result.data.command).toBe('npm');
        expect(result.data.args).toEqual(['run', 'lint']);
      });

      it('accepts npx jest', () => {
        const result = validateCommand('npx jest');
        expect(result.ok).toBe(true);
        expect(result.data.command).toBe('npx');
        expect(result.data.args).toEqual(['jest']);
      });

      it('accepts npx jest with args', () => {
        const result = validateCommand('npx jest --coverage --verbose');
        expect(result.ok).toBe(true);
        expect(result.data.args).toEqual(['jest', '--coverage', '--verbose']);
      });

      it('accepts npx tsc --noEmit', () => {
        const result = validateCommand('npx tsc --noEmit');
        expect(result.ok).toBe(true);
      });

      it('accepts direct jest command', () => {
        const result = validateCommand('jest --watch');
        expect(result.ok).toBe(true);
        expect(result.data.command).toBe('jest');
      });
    });

    describe('blocked commands', () => {
      it('rejects unknown executable', () => {
        const result = validateCommand('rm -rf /', { logBlocked: false });
        expect(result.ok).toBe(false);
        expect(result.error).toContain('not in allowlist');
        expect(result.severity).toBe('high');
      });

      it('rejects curl (not in allowlist)', () => {
        const result = validateCommand('curl http://evil.com', { logBlocked: false });
        expect(result.ok).toBe(false);
      });

      it('rejects bash (not in allowlist)', () => {
        const result = validateCommand('bash -c "echo hack"', { logBlocked: false });
        expect(result.ok).toBe(false);
      });

      it('rejects npm with unknown subcommand', () => {
        const result = validateCommand('npm publish', { logBlocked: false });
        expect(result.ok).toBe(false);
        expect(result.error).toContain('Subcommand');
      });

      it('rejects command with semicolon injection', () => {
        const result = validateCommand('npm test; rm -rf /', { logBlocked: false });
        expect(result.ok).toBe(false);
        // Severity is 'high' (subcommand not allowed) or 'critical' (dangerous pattern)
        // The exact value depends on which check fails first
        expect(['high', 'critical']).toContain(result.severity);
      });

      it('rejects command with pipe injection', () => {
        const result = validateCommand('npm test | tee /tmp/output', { logBlocked: false });
        expect(result.ok).toBe(false);
      });

      it('rejects command with backtick substitution', () => {
        const result = validateCommand('npm test `whoami`', { logBlocked: false });
        expect(result.ok).toBe(false);
      });

      it('rejects command with $() substitution', () => {
        const result = validateCommand('npm test $(id)', { logBlocked: false });
        expect(result.ok).toBe(false);
      });

      it('rejects command with && chaining', () => {
        const result = validateCommand('npm test && cat /etc/passwd', { logBlocked: false });
        expect(result.ok).toBe(false);
      });

      it('rejects command with output redirection', () => {
        const result = validateCommand('npm test > /tmp/output', { logBlocked: false });
        expect(result.ok).toBe(false);
      });
    });

    describe('edge cases', () => {
      it('rejects non-string input', () => {
        const result = validateCommand(123);
        expect(result.ok).toBe(false);
        expect(result.error).toContain('must be a string');
      });

      it('rejects empty string', () => {
        const result = validateCommand('');
        expect(result.ok).toBe(false);
        expect(result.error).toContain('cannot be empty');
      });

      it('rejects whitespace-only string', () => {
        const result = validateCommand('   ');
        expect(result.ok).toBe(false);
      });

      it('allows commands with strict=false', () => {
        const result = validateCommand('custom-command arg', {
          strict: false,
          logBlocked: false,
        });
        expect(result.ok).toBe(true);
      });
    });
  });

  describe('buildSpawnArgs', () => {
    it('returns spawn-compatible format', () => {
      const result = buildSpawnArgs('npm test');
      expect(result.ok).toBe(true);
      expect(result.data.file).toBe('npm');
      expect(result.data.args).toEqual(['test']);
    });

    it('propagates validation errors', () => {
      const result = buildSpawnArgs('rm -rf /', { logBlocked: false });
      expect(result.ok).toBe(false);
    });
  });

  describe('isAllowedCommand', () => {
    it('returns true for allowed commands', () => {
      expect(isAllowedCommand('npm test')).toBe(true);
      expect(isAllowedCommand('npx jest')).toBe(true);
    });

    it('returns false for blocked commands', () => {
      expect(isAllowedCommand('rm -rf /')).toBe(false);
      expect(isAllowedCommand('npm test; whoami')).toBe(false);
    });
  });

  describe('getAllowedCommandList', () => {
    it('returns list of allowed command patterns', () => {
      const list = getAllowedCommandList();
      expect(Array.isArray(list)).toBe(true);
      expect(list.length).toBeGreaterThan(0);
      expect(list).toContain('npm test');
      expect(list).toContain('jest *');
    });
  });

  describe('injection attack scenarios', () => {
    const attacks = [
      // Basic injection
      'npm test; cat /etc/passwd',
      'npm test && rm -rf /',
      'npm test || malicious',
      'npm test | tee /tmp/hack',

      // Command substitution
      'npm test `id`',
      'npm test $(whoami)',
      'npm test $(cat /etc/shadow)',

      // Variable expansion
      'npm test ${PATH}',
      'npm test $HOME',

      // Newline injection
      'npm test\nrm -rf /',
      'npm test\rwhoami',

      // Redirection
      'npm test > /etc/cron.d/hack',
      'npm test < /dev/random',
      'npm test 2>&1',

      // Subshell
      'npm test (sleep 10)',
      'npm test {echo,hack}',
    ];

    attacks.forEach(attack => {
      it(`blocks: ${attack.slice(0, 40)}...`, () => {
        const result = validateCommand(attack, { logBlocked: false });
        expect(result.ok).toBe(false);
      });
    });
  });

  describe('real-world safe commands', () => {
    const safeCommands = [
      'npm test',
      'npm run build',
      'npm run lint',
      'npx jest --coverage',
      'npx jest --watch',
      'npx tsc --noEmit',
      'npx eslint src/',
      'npx prettier --check .',
      'jest --runInBand',
      'vitest run',
      'yarn test',
      'pnpm test',
    ];

    safeCommands.forEach(cmd => {
      it(`allows: ${cmd}`, () => {
        const result = validateCommand(cmd, { logBlocked: false });
        expect(result.ok).toBe(true);
      });
    });
  });
});
