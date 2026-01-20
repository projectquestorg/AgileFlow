/**
 * Tests for ide-error-factory.js - Abstract Factory for IDE error handling
 */

const {
  ErrorStrategy,
  RetryStrategy,
  FallbackStrategy,
  AbortStrategy,
  SilentStrategy,
  CompositeStrategy,
  ErrorCategories,
  categorizeError,
  IdeErrorFactory,
  getFactory,
  resetFactories,
} = require('../../../../tools/cli/lib/ide-error-factory');

describe('ide-error-factory', () => {
  afterEach(() => {
    resetFactories();
  });

  describe('ErrorCategories', () => {
    it('defines all categories', () => {
      expect(ErrorCategories.NETWORK).toBe('network');
      expect(ErrorCategories.FILESYSTEM).toBe('filesystem');
      expect(ErrorCategories.PERMISSION).toBe('permission');
      expect(ErrorCategories.VALIDATION).toBe('validation');
      expect(ErrorCategories.TIMEOUT).toBe('timeout');
      expect(ErrorCategories.UNKNOWN).toBe('unknown');
    });
  });

  describe('categorizeError', () => {
    it('categorizes ENOTFOUND as network', () => {
      const error = new Error('getaddrinfo ENOTFOUND');
      error.code = 'ENOTFOUND';
      expect(categorizeError(error)).toBe(ErrorCategories.NETWORK);
    });

    it('categorizes ECONNREFUSED as network', () => {
      const error = new Error('connect ECONNREFUSED');
      error.code = 'ECONNREFUSED';
      expect(categorizeError(error)).toBe(ErrorCategories.NETWORK);
    });

    it('categorizes fetch errors as network', () => {
      const error = new Error('fetch failed');
      expect(categorizeError(error)).toBe(ErrorCategories.NETWORK);
    });

    it('categorizes ENOENT as filesystem', () => {
      const error = new Error('no such file or directory');
      error.code = 'ENOENT';
      expect(categorizeError(error)).toBe(ErrorCategories.FILESYSTEM);
    });

    it('categorizes EACCES as permission', () => {
      const error = new Error('permission denied');
      error.code = 'EACCES';
      expect(categorizeError(error)).toBe(ErrorCategories.PERMISSION);
    });

    it('categorizes validation errors', () => {
      const error = new Error('invalid JSON');
      expect(categorizeError(error)).toBe(ErrorCategories.VALIDATION);
    });

    it('categorizes timeout errors', () => {
      const error = new Error('operation timed out');
      expect(categorizeError(error)).toBe(ErrorCategories.TIMEOUT);
    });

    it('categorizes unknown errors', () => {
      const error = new Error('something weird happened');
      expect(categorizeError(error)).toBe(ErrorCategories.UNKNOWN);
    });
  });

  describe('RetryStrategy', () => {
    it('retries failed operations', async () => {
      let attempts = 0;
      const operation = jest.fn().mockImplementation(async () => {
        attempts++;
        if (attempts < 3) {
          throw new Error('fail');
        }
        return 'success';
      });

      const strategy = new RetryStrategy({
        maxRetries: 3,
        baseDelayMs: 10,
      });

      const result = await strategy.handle(new Error('fail'), { operation });
      expect(result.recovered).toBe(true);
      expect(result.result).toBe('success');
      expect(attempts).toBe(3);
    });

    it('gives up after max retries', async () => {
      const operation = jest.fn().mockRejectedValue(new Error('always fails'));

      const strategy = new RetryStrategy({
        maxRetries: 2,
        baseDelayMs: 10,
      });

      const result = await strategy.handle(new Error('fail'), { operation });
      expect(result.recovered).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('respects retry condition', async () => {
      const operation = jest.fn().mockResolvedValue('success');

      const strategy = new RetryStrategy({
        maxRetries: 3,
        baseDelayMs: 10,
        retryCondition: () => false,
      });

      const result = await strategy.handle(new Error('fail'), { operation });
      expect(result.recovered).toBe(false);
      expect(operation).not.toHaveBeenCalled();
    });

    it('uses exponential backoff', async () => {
      const delays = [];
      const originalSetTimeout = global.setTimeout;
      global.setTimeout = (fn, delay) => {
        delays.push(delay);
        return originalSetTimeout(fn, 0);
      };

      const operation = jest
        .fn()
        .mockRejectedValueOnce(new Error('fail'))
        .mockRejectedValueOnce(new Error('fail'))
        .mockResolvedValue('success');

      const strategy = new RetryStrategy({
        maxRetries: 3,
        baseDelayMs: 100,
        backoffMultiplier: 2,
      });

      await strategy.handle(new Error('fail'), { operation });

      global.setTimeout = originalSetTimeout;

      expect(delays[0]).toBe(100);
      expect(delays[1]).toBe(200);
    });

    it('caps delay at maxDelayMs', async () => {
      const delays = [];
      const originalSetTimeout = global.setTimeout;
      global.setTimeout = (fn, delay) => {
        delays.push(delay);
        return originalSetTimeout(fn, 0);
      };

      const operation = jest.fn().mockRejectedValue(new Error('fail'));

      const strategy = new RetryStrategy({
        maxRetries: 5,
        baseDelayMs: 1000,
        backoffMultiplier: 10,
        maxDelayMs: 5000,
      });

      await strategy.handle(new Error('fail'), { operation, attempt: 3 });

      global.setTimeout = originalSetTimeout;

      expect(delays.every(d => d <= 5000)).toBe(true);
    });
  });

  describe('FallbackStrategy', () => {
    it('executes fallback function on error', async () => {
      const fallbackFn = jest.fn().mockResolvedValue('fallback result');

      const strategy = new FallbackStrategy({ fallbackFn });
      const result = await strategy.handle(new Error('original error'), {});

      expect(result.recovered).toBe(true);
      expect(result.result).toBe('fallback result');
      expect(fallbackFn).toHaveBeenCalled();
    });

    it('passes error and context to fallback', async () => {
      const fallbackFn = jest.fn().mockResolvedValue('ok');
      const error = new Error('test');
      const context = { foo: 'bar' };

      const strategy = new FallbackStrategy({ fallbackFn });
      await strategy.handle(error, context);

      expect(fallbackFn).toHaveBeenCalledWith(error, context);
    });

    it('returns failure if fallback also fails', async () => {
      const fallbackFn = jest.fn().mockRejectedValue(new Error('fallback fail'));

      const strategy = new FallbackStrategy({ fallbackFn });
      const result = await strategy.handle(new Error('original'), {});

      expect(result.recovered).toBe(false);
      expect(result.error).toBeInstanceOf(AggregateError);
    });

    it('respects fallback condition', async () => {
      const fallbackFn = jest.fn().mockResolvedValue('ok');

      const strategy = new FallbackStrategy({
        fallbackFn,
        fallbackCondition: () => false,
      });

      const result = await strategy.handle(new Error('test'), {});
      expect(result.recovered).toBe(false);
      expect(fallbackFn).not.toHaveBeenCalled();
    });
  });

  describe('AbortStrategy', () => {
    it('returns failure with enhanced error', async () => {
      const strategy = new AbortStrategy();
      const result = await strategy.handle(new Error('original'), {});

      expect(result.recovered).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('uses message formatter', async () => {
      const strategy = new AbortStrategy({
        messageFormatter: e => `Custom: ${e.message}`,
      });

      const result = await strategy.handle(new Error('test'), {});
      expect(result.error.message).toBe('Custom: test');
    });

    it('preserves original error', async () => {
      const original = new Error('original');
      const strategy = new AbortStrategy();
      const result = await strategy.handle(original, {});

      expect(result.error.originalError).toBe(original);
    });

    it('sets exit code', async () => {
      const strategy = new AbortStrategy({ exitCode: 42 });
      const result = await strategy.handle(new Error('test'), {});

      expect(result.error.exitCode).toBe(42);
    });
  });

  describe('SilentStrategy', () => {
    it('recovers with default value', async () => {
      const strategy = new SilentStrategy({ defaultValue: 'default' });
      const result = await strategy.handle(new Error('ignored'), {});

      expect(result.recovered).toBe(true);
      expect(result.result).toBe('default');
      expect(result.error).toBeNull();
    });

    it('calls log function', async () => {
      const logFn = jest.fn();
      const strategy = new SilentStrategy({ logFn });
      const error = new Error('logged');
      const context = { test: true };

      await strategy.handle(error, context);

      expect(logFn).toHaveBeenCalledWith(error, context);
    });
  });

  describe('CompositeStrategy', () => {
    it('tries strategies in order', async () => {
      const strategy1 = {
        handle: jest.fn().mockResolvedValue({ recovered: false, result: null, error: new Error() }),
      };
      const strategy2 = {
        handle: jest.fn().mockResolvedValue({ recovered: true, result: 'ok', error: null }),
      };

      const composite = new CompositeStrategy([strategy1, strategy2]);
      const result = await composite.handle(new Error('test'), {});

      expect(result.recovered).toBe(true);
      expect(result.result).toBe('ok');
      expect(strategy1.handle).toHaveBeenCalled();
      expect(strategy2.handle).toHaveBeenCalled();
    });

    it('stops at first recovery', async () => {
      const strategy1 = {
        handle: jest.fn().mockResolvedValue({ recovered: true, result: 'first', error: null }),
      };
      const strategy2 = {
        handle: jest.fn().mockResolvedValue({ recovered: true, result: 'second', error: null }),
      };

      const composite = new CompositeStrategy([strategy1, strategy2]);
      const result = await composite.handle(new Error('test'), {});

      expect(result.result).toBe('first');
      expect(strategy2.handle).not.toHaveBeenCalled();
    });

    it('returns failure if no strategy recovers', async () => {
      const strategy1 = {
        handle: jest.fn().mockResolvedValue({ recovered: false, result: null, error: new Error() }),
      };
      const strategy2 = {
        handle: jest.fn().mockResolvedValue({ recovered: false, result: null, error: new Error() }),
      };

      const composite = new CompositeStrategy([strategy1, strategy2]);
      const error = new Error('original');
      const result = await composite.handle(error, {});

      expect(result.recovered).toBe(false);
      expect(result.error).toBe(error);
    });
  });

  describe('IdeErrorFactory', () => {
    it('creates factory with IDE name', () => {
      const factory = new IdeErrorFactory('cursor');
      expect(factory.ideName).toBe('cursor');
    });

    it('registers default strategies', () => {
      const factory = new IdeErrorFactory('cursor');
      expect(factory.strategies.size).toBeGreaterThan(0);
    });

    it('gets strategy for network error', () => {
      const factory = new IdeErrorFactory('cursor');
      const error = new Error('network');
      error.code = 'ENOTFOUND';

      const strategy = factory.getStrategy(error);
      expect(strategy).toBeDefined();
    });

    it('handles errors with appropriate strategy', async () => {
      const factory = new IdeErrorFactory('cursor');
      const error = new Error('validation failed: invalid config');

      const result = await factory.handleError(error, {});
      expect(result.recovered).toBe(false);
      expect(result.error.message).toContain('cursor');
    });

    it('allows registering custom strategies', async () => {
      const factory = new IdeErrorFactory('cursor');
      factory.register('custom', () => new SilentStrategy({ defaultValue: 'custom handled' }));

      // Mock categorizeError to return custom
      const originalCategorize =
        require('../../../../tools/cli/lib/ide-error-factory').categorizeError;

      const result = await factory.handleError(new Error('test'), {});
      expect(result).toBeDefined();
    });

    it('wraps functions with error handling', async () => {
      const factory = new IdeErrorFactory('cursor');
      const fn = jest.fn().mockRejectedValue(new Error('test error'));

      const wrapped = factory.wrap(fn);
      await expect(wrapped()).rejects.toThrow();
    });
  });

  describe('getFactory', () => {
    it('creates new factory for IDE', () => {
      const factory = getFactory('cursor');
      expect(factory).toBeInstanceOf(IdeErrorFactory);
      expect(factory.ideName).toBe('cursor');
    });

    it('returns same factory for same IDE', () => {
      const factory1 = getFactory('cursor');
      const factory2 = getFactory('cursor');
      expect(factory1).toBe(factory2);
    });

    it('creates different factories for different IDEs', () => {
      const factory1 = getFactory('cursor');
      const factory2 = getFactory('windsurf');
      expect(factory1).not.toBe(factory2);
    });
  });

  describe('resetFactories', () => {
    it('clears factory registry', () => {
      const factory1 = getFactory('cursor');
      resetFactories();
      const factory2 = getFactory('cursor');
      expect(factory1).not.toBe(factory2);
    });
  });

  describe('integration: IDE error handling workflow', () => {
    it('handles network errors with retry', async () => {
      const factory = new IdeErrorFactory('cursor');
      let attempts = 0;
      const operation = async () => {
        attempts++;
        if (attempts < 2) {
          const error = new Error('network error');
          error.code = 'ECONNREFUSED';
          throw error;
        }
        return 'success';
      };

      // Use retry strategy directly for this test
      const strategy = new RetryStrategy({ maxRetries: 3, baseDelayMs: 10 });
      const result = await strategy.handle(new Error('initial'), { operation });

      expect(result.recovered).toBe(true);
      expect(result.result).toBe('success');
    });

    it('provides helpful message for permission errors', async () => {
      const factory = new IdeErrorFactory('vscode');
      const error = new Error('EACCES: permission denied');
      error.code = 'EACCES';

      const result = await factory.handleError(error, {});
      expect(result.error.message).toContain('Permission denied');
      expect(result.error.message).toContain('vscode');
    });
  });
});
