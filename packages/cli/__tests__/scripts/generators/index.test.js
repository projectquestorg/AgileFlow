/**
 * Tests for generators/index.js
 *
 * Tests the content generation orchestrator
 */

const path = require('path');

// Mock child_process with execFile as a callback-style function
jest.mock('child_process', () => ({
  execFile: jest.fn((cmd, args, opts, cb) => {
    // If 3 args (no opts), shift callback
    if (typeof opts === 'function') {
      cb = opts;
    }
    if (cb) cb(null, '', '');
  }),
}));

const { execFile } = require('child_process');

// Capture console output
let consoleOutput = [];
const originalConsoleLog = console.log;
const originalConsoleError = console.error;

beforeEach(() => {
  consoleOutput = [];
  console.log = jest.fn((...args) => {
    consoleOutput.push(args.join(' '));
  });
  console.error = jest.fn((...args) => {
    consoleOutput.push(args.join(' '));
  });
  jest.clearAllMocks();
  // Re-setup the default mock (success)
  execFile.mockImplementation((cmd, args, opts, cb) => {
    if (typeof opts === 'function') {
      cb = opts;
    }
    if (cb) cb(null, '', '');
  });
});

afterEach(() => {
  console.log = originalConsoleLog;
  console.error = originalConsoleError;
});

const { runGenerator } = require('../../../scripts/generators/index');

describe('generators/index.js', () => {
  describe('runGenerator', () => {
    it('returns success result on successful execution', async () => {
      const result = await runGenerator('test-generator.js');

      expect(result).toEqual({ generator: 'test-generator.js', success: true });
      expect(execFile).toHaveBeenCalled();
    });

    it('constructs correct script path', async () => {
      await runGenerator('my-script.js');

      expect(execFile).toHaveBeenCalledWith(
        'node',
        expect.arrayContaining([expect.stringContaining('my-script.js')]),
        expect.any(Object),
        expect.any(Function)
      );
    });

    it('returns failure result when script throws error', async () => {
      execFile.mockImplementation((cmd, args, opts, cb) => {
        if (typeof opts === 'function') {
          cb = opts;
        }
        if (cb) cb(new Error('Script failed'));
      });

      const result = await runGenerator('failing-script.js');

      expect(result).toEqual({ generator: 'failing-script.js', success: false });
    });

    it('logs success message on completion', async () => {
      await runGenerator('success-generator.js');

      const output = consoleOutput.join('\n');
      expect(output).toContain('success-generator.js completed successfully');
    });

    it('logs error message on failure', async () => {
      execFile.mockImplementation((cmd, args, opts, cb) => {
        if (typeof opts === 'function') {
          cb = opts;
        }
        if (cb) cb(new Error('Execution failed'));
      });

      await runGenerator('error-generator.js');

      const output = consoleOutput.join('\n');
      expect(output).toContain('error-generator.js failed');
    });

    it('logs script name when running', async () => {
      await runGenerator('my-generator.js');

      const output = consoleOutput.join('\n');
      expect(output).toContain('Running: my-generator.js');
    });
  });

  describe('generator output format', () => {
    it('prints separator lines', async () => {
      await runGenerator('test.js');

      const output = consoleOutput.join('\n');
      expect(output).toContain('='.repeat(60));
    });
  });
});
