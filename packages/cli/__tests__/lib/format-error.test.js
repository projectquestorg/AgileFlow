/**
 * format-error.test.js - Tests for error formatting helpers
 */

const {
  formatError,
  formatWarning,
  formatSuccess,
  formatInfo,
  formatIssues,
  formatErrorWithStack,
  formatMessage,
  SYMBOLS,
} = require('../../lib/format-error');

describe('format-error module', () => {
  describe('SYMBOLS', () => {
    it('exports expected symbols', () => {
      expect(SYMBOLS.error).toBe('\u2716');
      expect(SYMBOLS.warning).toBe('\u26A0');
      expect(SYMBOLS.success).toBe('\u2714');
      expect(SYMBOLS.info).toBe('\u2139');
    });
  });

  describe('formatError()', () => {
    it('formats basic error message', () => {
      const result = formatError('Something went wrong');
      expect(result).toContain('\u2716');
      expect(result).toContain('Something went wrong');
    });

    it('includes action when provided', () => {
      const result = formatError('Failed', 'Check config');
      expect(result).toContain('Action:');
      expect(result).toContain('Check config');
    });

    it('includes command when provided', () => {
      const result = formatError('Failed', null, 'npm run setup');
      expect(result).toContain('Run:');
      expect(result).toContain('npm run setup');
    });

    it('includes both action and command', () => {
      const result = formatError('Error', 'Fix it', 'npm run fix');
      expect(result).toContain('Action:');
      expect(result).toContain('Fix it');
      expect(result).toContain('Run:');
      expect(result).toContain('npm run fix');
    });
  });

  describe('formatWarning()', () => {
    it('formats basic warning message', () => {
      const result = formatWarning('Deprecation notice');
      expect(result).toContain('\u26A0');
      expect(result).toContain('Deprecation notice');
    });

    it('includes action when provided', () => {
      const result = formatWarning('Old API', 'Migrate to v2');
      expect(result).toContain('Action:');
      expect(result).toContain('Migrate to v2');
    });
  });

  describe('formatSuccess()', () => {
    it('formats basic success message', () => {
      const result = formatSuccess('Installation complete');
      expect(result).toContain('\u2714');
      expect(result).toContain('Installation complete');
    });

    it('includes detail when provided', () => {
      const result = formatSuccess('Saved', 'File written to /path/to/file');
      expect(result).toContain('File written to /path/to/file');
    });
  });

  describe('formatInfo()', () => {
    it('formats basic info message', () => {
      const result = formatInfo('Version 1.0.0');
      expect(result).toContain('\u2139');
      expect(result).toContain('Version 1.0.0');
    });

    it('includes detail when provided', () => {
      const result = formatInfo('Tip', 'Use --verbose for more output');
      expect(result).toContain('Use --verbose for more output');
    });
  });

  describe('formatIssues()', () => {
    it('formats array of issues', () => {
      const issues = [
        { type: 'error', message: 'Error 1' },
        { type: 'warning', message: 'Warning 1' },
        { type: 'success', message: 'Success 1' },
        { type: 'info', message: 'Info 1' },
      ];
      const results = formatIssues(issues);
      expect(results).toHaveLength(4);
      expect(results[0]).toContain('\u2716');
      expect(results[1]).toContain('\u26A0');
      expect(results[2]).toContain('\u2714');
      expect(results[3]).toContain('\u2139');
    });

    it('includes action and command in issues', () => {
      const issues = [{ type: 'error', message: 'Failed', action: 'Fix it', command: 'npm fix' }];
      const results = formatIssues(issues);
      expect(results[0]).toContain('Action:');
      expect(results[0]).toContain('Fix it');
      expect(results[0]).toContain('Run:');
      expect(results[0]).toContain('npm fix');
    });

    it('handles unknown type as info', () => {
      const issues = [{ type: 'unknown', message: 'Unknown type' }];
      const results = formatIssues(issues);
      expect(results[0]).toContain('\u2139');
    });
  });

  describe('formatErrorWithStack()', () => {
    it('formats error without stack when DEBUG not set', () => {
      const originalDebug = process.env.DEBUG;
      delete process.env.DEBUG;

      const error = new Error('Test error');
      const result = formatErrorWithStack('Error occurred', error);

      expect(result).toContain('Error occurred');
      expect(result).not.toContain('Stack trace');

      if (originalDebug !== undefined) {
        process.env.DEBUG = originalDebug;
      }
    });

    it('formats error with stack when DEBUG=1', () => {
      const originalDebug = process.env.DEBUG;
      process.env.DEBUG = '1';

      const error = new Error('Test error');
      const result = formatErrorWithStack('Error occurred', error);

      expect(result).toContain('Error occurred');
      expect(result).toContain('Stack trace');

      if (originalDebug !== undefined) {
        process.env.DEBUG = originalDebug;
      } else {
        delete process.env.DEBUG;
      }
    });

    it('includes action and command options', () => {
      const result = formatErrorWithStack('Error', null, {
        action: 'Fix it',
        command: 'npm fix',
      });
      expect(result).toContain('Action:');
      expect(result).toContain('Fix it');
      expect(result).toContain('Run:');
      expect(result).toContain('npm fix');
    });
  });

  describe('formatMessage()', () => {
    it('formats message with custom symbol and color', () => {
      const result = formatMessage('>', '\x1b[35m', 'Custom message');
      expect(result).toContain('>');
      expect(result).toContain('Custom message');
    });

    it('handles all options', () => {
      const result = formatMessage('*', '\x1b[36m', 'Message', {
        action: 'Do something',
        command: 'run cmd',
        detail: 'Extra detail',
      });
      expect(result).toContain('Action:');
      expect(result).toContain('Do something');
      expect(result).toContain('Run:');
      expect(result).toContain('run cmd');
      expect(result).toContain('Extra detail');
    });
  });
});
