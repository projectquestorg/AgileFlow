/**
 * Tests for logger.js - Centralized logger with level control
 */

const { createLogger, LEVELS } = require('../../lib/logger');

describe('logger', () => {
  let stderrSpy;
  const originalEnv = {};

  beforeEach(() => {
    stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
    // Save and clear relevant env vars
    for (const key of ['AGILEFLOW_LOG_LEVEL', 'AGILEFLOW_VERBOSE', 'AGILEFLOW_DEBUG']) {
      originalEnv[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    stderrSpy.mockRestore();
    // Restore env vars
    for (const [key, val] of Object.entries(originalEnv)) {
      if (val === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = val;
      }
    }
  });

  describe('LEVELS', () => {
    it('exports ordered log levels', () => {
      expect(LEVELS.debug).toBeLessThan(LEVELS.info);
      expect(LEVELS.info).toBeLessThan(LEVELS.warn);
      expect(LEVELS.warn).toBeLessThan(LEVELS.error);
      expect(LEVELS.error).toBeLessThan(LEVELS.silent);
    });
  });

  describe('createLogger', () => {
    it('creates a logger with all four methods', () => {
      const log = createLogger('test');
      expect(typeof log.debug).toBe('function');
      expect(typeof log.info).toBe('function');
      expect(typeof log.warn).toBe('function');
      expect(typeof log.error).toBe('function');
    });

    it('creates a logger without module name', () => {
      const log = createLogger();
      log.info('hello');
      expect(stderrSpy).toHaveBeenCalledTimes(1);
      const output = stderrSpy.mock.calls[0][0];
      expect(output).toContain('[INFO]');
      expect(output).toContain('hello');
      // Should NOT have a module prefix
      expect(output).not.toMatch(/\[test\]/);
    });
  });

  describe('log output', () => {
    it('includes module name in output', () => {
      const log = createLogger('mymod', { level: 'debug' });
      log.debug('test message');
      const output = stderrSpy.mock.calls[0][0];
      expect(output).toContain('[mymod]');
      expect(output).toContain('[DEBUG]');
      expect(output).toContain('test message');
    });

    it('outputs info messages with INFO prefix', () => {
      const log = createLogger('mod', { level: 'info' });
      log.info('server started');
      const output = stderrSpy.mock.calls[0][0];
      expect(output).toContain('[INFO]');
      expect(output).toContain('server started');
    });

    it('outputs warn messages with WARN prefix', () => {
      const log = createLogger('mod', { level: 'warn' });
      log.warn('deprecated API');
      const output = stderrSpy.mock.calls[0][0];
      expect(output).toContain('[WARN]');
      expect(output).toContain('deprecated API');
    });

    it('outputs error messages with ERROR prefix', () => {
      const log = createLogger('mod', { level: 'error' });
      log.error('connection failed');
      const output = stderrSpy.mock.calls[0][0];
      expect(output).toContain('[ERROR]');
      expect(output).toContain('connection failed');
    });

    it('writes all output to stderr', () => {
      const stdoutSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
      const log = createLogger('mod', { level: 'debug' });
      log.debug('d');
      log.info('i');
      log.warn('w');
      log.error('e');
      expect(stderrSpy).toHaveBeenCalledTimes(4);
      expect(stdoutSpy).not.toHaveBeenCalled();
      stdoutSpy.mockRestore();
    });

    it('joins multiple args with spaces', () => {
      const log = createLogger('mod', { level: 'info' });
      log.info('hello', 'world', '123');
      const output = stderrSpy.mock.calls[0][0];
      expect(output).toContain('hello world 123');
    });
  });

  describe('level filtering', () => {
    it('filters debug messages at info level', () => {
      const log = createLogger('mod', { level: 'info' });
      log.debug('should not appear');
      expect(stderrSpy).not.toHaveBeenCalled();
    });

    it('allows info messages at info level', () => {
      const log = createLogger('mod', { level: 'info' });
      log.info('should appear');
      expect(stderrSpy).toHaveBeenCalledTimes(1);
    });

    it('filters debug and info at warn level', () => {
      const log = createLogger('mod', { level: 'warn' });
      log.debug('nope');
      log.info('nope');
      expect(stderrSpy).not.toHaveBeenCalled();
      log.warn('yes');
      expect(stderrSpy).toHaveBeenCalledTimes(1);
    });

    it('only allows error at error level', () => {
      const log = createLogger('mod', { level: 'error' });
      log.debug('nope');
      log.info('nope');
      log.warn('nope');
      expect(stderrSpy).not.toHaveBeenCalled();
      log.error('yes');
      expect(stderrSpy).toHaveBeenCalledTimes(1);
    });

    it('suppresses all output at silent level', () => {
      const log = createLogger('mod', { level: 'silent' });
      log.debug('nope');
      log.info('nope');
      log.warn('nope');
      log.error('nope');
      expect(stderrSpy).not.toHaveBeenCalled();
    });

    it('shows all messages at debug level', () => {
      const log = createLogger('mod', { level: 'debug' });
      log.debug('d');
      log.info('i');
      log.warn('w');
      log.error('e');
      expect(stderrSpy).toHaveBeenCalledTimes(4);
    });
  });

  describe('environment variables', () => {
    it('AGILEFLOW_LOG_LEVEL sets the level', () => {
      process.env.AGILEFLOW_LOG_LEVEL = 'warn';
      const log = createLogger('mod');
      log.info('nope');
      expect(stderrSpy).not.toHaveBeenCalled();
      log.warn('yes');
      expect(stderrSpy).toHaveBeenCalledTimes(1);
    });

    it('AGILEFLOW_VERBOSE=1 enables debug level', () => {
      process.env.AGILEFLOW_VERBOSE = '1';
      const log = createLogger('mod');
      log.debug('should appear');
      expect(stderrSpy).toHaveBeenCalledTimes(1);
    });

    it('AGILEFLOW_VERBOSE=true enables debug level', () => {
      process.env.AGILEFLOW_VERBOSE = 'true';
      const log = createLogger('mod');
      log.debug('should appear');
      expect(stderrSpy).toHaveBeenCalledTimes(1);
    });

    it('AGILEFLOW_DEBUG=1 enables debug level (backward compat)', () => {
      process.env.AGILEFLOW_DEBUG = '1';
      const log = createLogger('mod');
      log.debug('should appear');
      expect(stderrSpy).toHaveBeenCalledTimes(1);
    });

    it('AGILEFLOW_LOG_LEVEL takes priority over AGILEFLOW_VERBOSE', () => {
      process.env.AGILEFLOW_LOG_LEVEL = 'error';
      process.env.AGILEFLOW_VERBOSE = '1';
      const log = createLogger('mod');
      log.debug('nope');
      log.info('nope');
      log.warn('nope');
      expect(stderrSpy).not.toHaveBeenCalled();
      log.error('yes');
      expect(stderrSpy).toHaveBeenCalledTimes(1);
    });

    it('defaults to info when no env vars set', () => {
      const log = createLogger('mod');
      log.debug('nope');
      expect(stderrSpy).not.toHaveBeenCalled();
      log.info('yes');
      expect(stderrSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('secret redaction', () => {
    it('redacts secrets in debug messages', () => {
      const log = createLogger('mod', { level: 'debug' });
      log.debug('token=ghp_abc123def456ghi789jkl012mno345pqr678');
      const output = stderrSpy.mock.calls[0][0];
      expect(output).not.toContain('ghp_abc123def456ghi789jkl012mno345pqr678');
      expect(output).toContain('REDACTED');
    });

    it('does not redact in info/warn/error messages', () => {
      const log = createLogger('mod', { level: 'info' });
      log.info('safe message with no secrets');
      const output = stderrSpy.mock.calls[0][0];
      expect(output).toContain('safe message with no secrets');
    });
  });

  describe('timestamps option', () => {
    it('omits timestamps by default', () => {
      const log = createLogger('mod', { level: 'info' });
      log.info('hello');
      const output = stderrSpy.mock.calls[0][0];
      // ISO timestamp pattern: YYYY-MM-DDTHH:MM:SS
      expect(output).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    it('includes timestamps when enabled', () => {
      const log = createLogger('mod', { level: 'info', timestamps: true });
      log.info('hello');
      const output = stderrSpy.mock.calls[0][0];
      expect(output).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });
  });

  describe('options.level override', () => {
    it('overrides env var when provided', () => {
      process.env.AGILEFLOW_LOG_LEVEL = 'error';
      const log = createLogger('mod', { level: 'debug' });
      log.debug('should appear despite env');
      expect(stderrSpy).toHaveBeenCalledTimes(1);
    });
  });
});
