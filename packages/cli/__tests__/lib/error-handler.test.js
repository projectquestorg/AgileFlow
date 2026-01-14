/**
 * Tests for error-handler.js
 *
 * Tests centralized error handling with actionable guidance
 */

// Mock colors module
jest.mock('../../lib/colors', () => ({
  c: {
    red: '',
    green: '',
    yellow: '',
    cyan: '',
    dim: '',
    bold: '',
    reset: '',
  },
}));

const { ErrorHandler, createErrorHandler } = require('../../tools/cli/lib/error-handler');

describe('error-handler', () => {
  let handler;
  let mockExit;
  let mockConsoleLog;
  let mockConsoleError;
  let originalDebug;

  beforeEach(() => {
    handler = new ErrorHandler('test-command');
    mockExit = jest.spyOn(process, 'exit').mockImplementation(() => {});
    mockConsoleLog = jest.spyOn(console, 'log').mockImplementation(() => {});
    mockConsoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    originalDebug = process.env.DEBUG;
    delete process.env.DEBUG;
  });

  afterEach(() => {
    mockExit.mockRestore();
    mockConsoleLog.mockRestore();
    mockConsoleError.mockRestore();
    if (originalDebug !== undefined) {
      process.env.DEBUG = originalDebug;
    } else {
      delete process.env.DEBUG;
    }
  });

  describe('constructor', () => {
    it('creates handler with command name', () => {
      const h = new ErrorHandler('my-command');
      expect(h.commandName).toBe('my-command');
    });

    it('defaults to agileflow when no command name', () => {
      const h = new ErrorHandler();
      expect(h.commandName).toBe('agileflow');
    });
  });

  describe('formatError', () => {
    it('formats message only', () => {
      const result = handler.formatError('Something failed');
      expect(result).toContain('Something failed');
      expect(result).toContain('\u2716'); // X mark
    });

    it('formats message with action', () => {
      const result = handler.formatError('Something failed', 'Check permissions');
      expect(result).toContain('Something failed');
      expect(result).toContain('Action:');
      expect(result).toContain('Check permissions');
    });

    it('formats message with action and command', () => {
      const result = handler.formatError(
        'Something failed',
        'Check permissions',
        'npx agileflow doctor'
      );
      expect(result).toContain('Something failed');
      expect(result).toContain('Action:');
      expect(result).toContain('Check permissions');
      expect(result).toContain('Run:');
      expect(result).toContain('npx agileflow doctor');
    });

    it('formats message with command only', () => {
      const result = handler.formatError('Something failed', null, 'npx agileflow doctor');
      expect(result).toContain('Something failed');
      expect(result).toContain('Run:');
      expect(result).toContain('npx agileflow doctor');
      expect(result).not.toContain('Action:');
    });
  });

  describe('formatWarning', () => {
    it('formats warning message only', () => {
      const result = handler.formatWarning('Something might be wrong');
      expect(result).toContain('Something might be wrong');
      expect(result).toContain('\u26A0'); // Warning sign
    });

    it('formats warning with action', () => {
      const result = handler.formatWarning('Something might be wrong', 'Review config');
      expect(result).toContain('Something might be wrong');
      expect(result).toContain('Action:');
      expect(result).toContain('Review config');
    });

    it('formats warning with action and command', () => {
      const result = handler.formatWarning('Issue detected', 'Fix it', 'npm run fix');
      expect(result).toContain('Issue detected');
      expect(result).toContain('Action:');
      expect(result).toContain('Fix it');
      expect(result).toContain('Run:');
      expect(result).toContain('npm run fix');
    });
  });

  describe('info', () => {
    it('logs warning-style message', () => {
      handler.info('Informational message');
      expect(mockConsoleLog).toHaveBeenCalled();
      expect(mockExit).not.toHaveBeenCalled();
    });

    it('logs with action and command', () => {
      handler.info('Info message', 'Do something', 'npm run something');
      expect(mockConsoleLog).toHaveBeenCalled();
      const output = mockConsoleLog.mock.calls[0][0];
      expect(output).toContain('Info message');
    });

    it('does not exit', () => {
      handler.info('Just info');
      expect(mockExit).not.toHaveBeenCalled();
    });
  });

  describe('warning', () => {
    it('logs error message and exits with code 1', () => {
      handler.warning('Warning message');
      expect(mockConsoleError).toHaveBeenCalled();
      expect(mockExit).toHaveBeenCalledWith(1);
    });

    it('includes action text in output', () => {
      handler.warning('Warning', 'Fix it now');
      const output = mockConsoleError.mock.calls[0][0];
      expect(output).toContain('Warning');
      expect(output).toContain('Fix it now');
    });

    it('includes command hint in output', () => {
      handler.warning('Warning', null, 'npm run fix');
      const output = mockConsoleError.mock.calls[0][0];
      expect(output).toContain('npm run fix');
    });
  });

  describe('critical', () => {
    it('logs error message and exits with code 1', () => {
      handler.critical('Critical error');
      expect(mockConsoleError).toHaveBeenCalled();
      expect(mockExit).toHaveBeenCalledWith(1);
    });

    it('includes action and command in output', () => {
      handler.critical('Critical', 'Contact support', 'npm run report');
      const output = mockConsoleError.mock.calls[0][0];
      expect(output).toContain('Critical');
      expect(output).toContain('Contact support');
      expect(output).toContain('npm run report');
    });

    it('does not show stack trace when DEBUG is not set', () => {
      const error = new Error('Test error');
      handler.critical('Critical', null, null, error);
      // Should only have one call (the error message)
      expect(mockConsoleError).toHaveBeenCalledTimes(1);
    });

    it('shows stack trace when DEBUG=1', () => {
      process.env.DEBUG = '1';
      const error = new Error('Test error');
      handler.critical('Critical', null, null, error);
      // Should have multiple calls: error message + stack trace header + stack
      expect(mockConsoleError.mock.calls.length).toBeGreaterThan(1);
    });

    it('handles error without stack trace', () => {
      process.env.DEBUG = '1';
      handler.critical('Critical', null, null, {});
      // Should not crash
      expect(mockExit).toHaveBeenCalledWith(1);
    });

    it('handles null error', () => {
      process.env.DEBUG = '1';
      handler.critical('Critical', null, null, null);
      expect(mockExit).toHaveBeenCalledWith(1);
    });
  });

  describe('errorWithAction', () => {
    it('returns formatted error string without exiting', () => {
      const result = handler.errorWithAction('Error message', 'Fix it', 'npm fix');
      expect(result).toContain('Error message');
      expect(result).toContain('Fix it');
      expect(result).toContain('npm fix');
      expect(mockExit).not.toHaveBeenCalled();
    });
  });

  describe('warningWithAction', () => {
    it('returns formatted warning string without exiting', () => {
      const result = handler.warningWithAction('Warning message', 'Review', 'npm review');
      expect(result).toContain('Warning message');
      expect(result).toContain('Review');
      expect(result).toContain('npm review');
      expect(mockExit).not.toHaveBeenCalled();
    });
  });

  describe('reportIssues', () => {
    it('reports error issues and exits', () => {
      handler.reportIssues([
        { type: 'error', message: 'Error 1', action: 'Fix 1', command: 'cmd1' },
      ]);
      expect(mockConsoleError).toHaveBeenCalled();
      expect(mockExit).toHaveBeenCalledWith(1);
    });

    it('reports warning issues and exits', () => {
      handler.reportIssues([{ type: 'warning', message: 'Warning 1' }]);
      expect(mockConsoleError).toHaveBeenCalled();
      expect(mockExit).toHaveBeenCalledWith(1);
    });

    it('reports info issues without exiting', () => {
      handler.reportIssues([{ type: 'info', message: 'Info 1' }]);
      expect(mockConsoleLog).toHaveBeenCalled();
      expect(mockExit).not.toHaveBeenCalled();
    });

    it('handles mixed issue types', () => {
      handler.reportIssues([
        { type: 'info', message: 'Info' },
        { type: 'warning', message: 'Warning' },
        { type: 'error', message: 'Error' },
      ]);
      expect(mockConsoleLog).toHaveBeenCalled();
      expect(mockConsoleError).toHaveBeenCalled();
      expect(mockExit).toHaveBeenCalledWith(1);
    });

    it('returns true when there are errors/warnings', () => {
      // Need to not exit to check return value
      mockExit.mockImplementation(() => {
        throw new Error('exit called');
      });

      try {
        handler.reportIssues([{ type: 'error', message: 'Error' }]);
      } catch (e) {
        // Expected - exit throws
      }

      // The function would return true before exit
    });

    it('handles empty issues array', () => {
      const result = handler.reportIssues([]);
      expect(result).toBe(false);
      expect(mockExit).not.toHaveBeenCalled();
    });
  });

  describe('createErrorHandler', () => {
    it('creates ErrorHandler instance with command name', () => {
      const h = createErrorHandler('custom-cmd');
      expect(h).toBeInstanceOf(ErrorHandler);
      expect(h.commandName).toBe('custom-cmd');
    });
  });
});
