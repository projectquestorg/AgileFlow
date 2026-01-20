/**
 * AgileFlow CLI - IDE Error Factory
 *
 * Abstract Factory pattern for IDE-specific error handling strategies.
 * Centralizes recovery patterns across all IDE installers.
 *
 * Strategy Types:
 * - RetryStrategy: Retry with exponential backoff
 * - FallbackStrategy: Try alternative approach
 * - AbortStrategy: Fail with helpful message
 * - SilentStrategy: Swallow error and continue
 */

/**
 * Base error strategy interface
 */
class ErrorStrategy {
  /**
   * @param {string} name - Strategy name
   * @param {Object} options - Strategy options
   */
  constructor(name, options = {}) {
    this.name = name;
    this.options = options;
  }

  /**
   * Handle an error
   * @param {Error} error - The error to handle
   * @param {Object} context - Execution context
   * @returns {Promise<{ recovered: boolean, result: any, error: Error | null }>}
   */
  async handle(error, context = {}) {
    throw new Error('Strategy.handle() must be implemented');
  }
}

/**
 * Retry strategy with exponential backoff
 */
class RetryStrategy extends ErrorStrategy {
  constructor(options = {}) {
    super('retry', options);
    this.maxRetries = options.maxRetries || 3;
    this.baseDelayMs = options.baseDelayMs || 1000;
    this.maxDelayMs = options.maxDelayMs || 30000;
    this.backoffMultiplier = options.backoffMultiplier || 2;
    this.retryCondition = options.retryCondition || (() => true);
  }

  async handle(error, context = {}) {
    const { operation, attempt = 0 } = context;

    // Check if we should retry
    if (attempt >= this.maxRetries) {
      return { recovered: false, result: null, error };
    }

    if (!this.retryCondition(error, context)) {
      return { recovered: false, result: null, error };
    }

    // Calculate delay with exponential backoff
    const delay = Math.min(
      this.baseDelayMs * Math.pow(this.backoffMultiplier, attempt),
      this.maxDelayMs
    );

    // Wait before retry
    await new Promise(resolve => setTimeout(resolve, delay));

    // Retry the operation
    if (typeof operation === 'function') {
      try {
        const result = await operation();
        return { recovered: true, result, error: null };
      } catch (retryError) {
        // Recursively retry
        return this.handle(retryError, { ...context, attempt: attempt + 1 });
      }
    }

    return { recovered: false, result: null, error };
  }
}

/**
 * Fallback strategy - try alternative approach
 */
class FallbackStrategy extends ErrorStrategy {
  constructor(options = {}) {
    super('fallback', options);
    this.fallbackFn = options.fallbackFn;
    this.fallbackCondition = options.fallbackCondition || (() => true);
  }

  async handle(error, context = {}) {
    if (!this.fallbackCondition(error, context)) {
      return { recovered: false, result: null, error };
    }

    if (typeof this.fallbackFn !== 'function') {
      return { recovered: false, result: null, error };
    }

    try {
      const result = await this.fallbackFn(error, context);
      return { recovered: true, result, error: null };
    } catch (fallbackError) {
      return {
        recovered: false,
        result: null,
        error: new AggregateError([error, fallbackError], 'Fallback also failed'),
      };
    }
  }
}

/**
 * Abort strategy - fail with helpful message
 */
class AbortStrategy extends ErrorStrategy {
  constructor(options = {}) {
    super('abort', options);
    this.messageFormatter = options.messageFormatter || (e => e.message);
    this.exitCode = options.exitCode || 1;
  }

  async handle(error, context = {}) {
    const message = this.messageFormatter(error, context);
    const enhancedError = new Error(message);
    enhancedError.originalError = error;
    enhancedError.exitCode = this.exitCode;
    enhancedError.context = context;

    return { recovered: false, result: null, error: enhancedError };
  }
}

/**
 * Silent strategy - swallow error and continue
 */
class SilentStrategy extends ErrorStrategy {
  constructor(options = {}) {
    super('silent', options);
    this.defaultValue = options.defaultValue;
    this.logFn = options.logFn;
  }

  async handle(error, context = {}) {
    if (typeof this.logFn === 'function') {
      this.logFn(error, context);
    }
    return { recovered: true, result: this.defaultValue, error: null };
  }
}

/**
 * Composite strategy - try multiple strategies in order
 */
class CompositeStrategy extends ErrorStrategy {
  constructor(strategies = [], options = {}) {
    super('composite', options);
    this.strategies = strategies;
  }

  async handle(error, context = {}) {
    for (const strategy of this.strategies) {
      const result = await strategy.handle(error, context);
      if (result.recovered) {
        return result;
      }
    }
    return { recovered: false, result: null, error };
  }
}

/**
 * IDE-specific error categories
 */
const ErrorCategories = {
  NETWORK: 'network',
  FILESYSTEM: 'filesystem',
  PERMISSION: 'permission',
  VALIDATION: 'validation',
  TIMEOUT: 'timeout',
  UNKNOWN: 'unknown',
};

/**
 * Categorize an error
 * @param {Error} error - Error to categorize
 * @returns {string} Error category
 */
function categorizeError(error) {
  const message = (error.message || '').toLowerCase();
  const code = error.code || '';

  // Check timeout first (before network, since ETIMEDOUT could be either)
  if (code === 'ETIMEDOUT' || message.includes('timeout') || message.includes('timed out')) {
    return ErrorCategories.TIMEOUT;
  }

  if (
    code === 'ENOTFOUND' ||
    code === 'ECONNREFUSED' ||
    message.includes('network') ||
    message.includes('fetch')
  ) {
    return ErrorCategories.NETWORK;
  }

  if (
    code === 'ENOENT' ||
    code === 'EISDIR' ||
    code === 'ENOTDIR' ||
    message.includes('no such file') ||
    message.includes('directory')
  ) {
    return ErrorCategories.FILESYSTEM;
  }

  if (code === 'EACCES' || code === 'EPERM' || message.includes('permission')) {
    return ErrorCategories.PERMISSION;
  }

  if (message.includes('valid') || message.includes('invalid') || message.includes('expected')) {
    return ErrorCategories.VALIDATION;
  }

  return ErrorCategories.UNKNOWN;
}

/**
 * IDE Error Factory - produces IDE-specific error strategies
 */
class IdeErrorFactory {
  constructor(ideName, options = {}) {
    this.ideName = ideName;
    this.options = options;
    this.strategies = new Map();

    // Register default strategies
    this.registerDefaults();
  }

  /**
   * Register default strategies for common error categories
   */
  registerDefaults() {
    // Network errors - retry with backoff
    this.register(
      ErrorCategories.NETWORK,
      () =>
        new CompositeStrategy([
          new RetryStrategy({
            maxRetries: 3,
            baseDelayMs: 1000,
            retryCondition: e => categorizeError(e) === ErrorCategories.NETWORK,
          }),
          new AbortStrategy({
            messageFormatter: e =>
              `Network error while installing ${this.ideName}: ${e.message}\n` +
              'Please check your internet connection and try again.',
          }),
        ])
    );

    // Filesystem errors - try with fallback
    this.register(
      ErrorCategories.FILESYSTEM,
      () =>
        new AbortStrategy({
          messageFormatter: e =>
            `File system error while installing ${this.ideName}: ${e.message}\n` +
            'Please check that the path exists and is writable.',
        })
    );

    // Permission errors - abort with help
    this.register(
      ErrorCategories.PERMISSION,
      () =>
        new AbortStrategy({
          messageFormatter: e =>
            `Permission denied while installing ${this.ideName}: ${e.message}\n` +
            'Please check file permissions or run with appropriate privileges.',
        })
    );

    // Validation errors - abort
    this.register(
      ErrorCategories.VALIDATION,
      () =>
        new AbortStrategy({
          messageFormatter: e => `Validation error while installing ${this.ideName}: ${e.message}`,
        })
    );

    // Timeout errors - retry once
    this.register(
      ErrorCategories.TIMEOUT,
      () =>
        new CompositeStrategy([
          new RetryStrategy({
            maxRetries: 1,
            baseDelayMs: 5000,
          }),
          new AbortStrategy({
            messageFormatter: e =>
              `Operation timed out while installing ${this.ideName}: ${e.message}\n` +
              'Please try again later.',
          }),
        ])
    );

    // Unknown errors - abort
    this.register(
      ErrorCategories.UNKNOWN,
      () =>
        new AbortStrategy({
          messageFormatter: e => `Unexpected error while installing ${this.ideName}: ${e.message}`,
        })
    );
  }

  /**
   * Register a strategy factory for an error category
   * @param {string} category - Error category
   * @param {Function} factory - Factory function returning a strategy
   */
  register(category, factory) {
    this.strategies.set(category, factory);
  }

  /**
   * Get strategy for an error
   * @param {Error} error - Error to handle
   * @returns {ErrorStrategy} Appropriate strategy
   */
  getStrategy(error) {
    const category = categorizeError(error);
    const factory = this.strategies.get(category) || this.strategies.get(ErrorCategories.UNKNOWN);
    return factory ? factory() : new AbortStrategy();
  }

  /**
   * Handle an error using the appropriate strategy
   * @param {Error} error - Error to handle
   * @param {Object} context - Execution context
   * @returns {Promise<{ recovered: boolean, result: any, error: Error | null }>}
   */
  async handleError(error, context = {}) {
    const strategy = this.getStrategy(error);
    return strategy.handle(error, { ...context, ideName: this.ideName });
  }

  /**
   * Create a wrapped function with error handling
   * @param {Function} fn - Function to wrap
   * @param {Object} context - Default context
   * @returns {Function} Wrapped function
   */
  wrap(fn, context = {}) {
    return async (...args) => {
      try {
        return await fn(...args);
      } catch (error) {
        const result = await this.handleError(error, { ...context, operation: () => fn(...args) });
        if (result.recovered) {
          return result.result;
        }
        throw result.error;
      }
    };
  }
}

/**
 * Factory registry for all IDEs
 */
const factoryRegistry = new Map();

/**
 * Get or create factory for an IDE
 * @param {string} ideName - IDE identifier
 * @param {Object} options - Factory options
 * @returns {IdeErrorFactory}
 */
function getFactory(ideName, options = {}) {
  if (!factoryRegistry.has(ideName)) {
    factoryRegistry.set(ideName, new IdeErrorFactory(ideName, options));
  }
  return factoryRegistry.get(ideName);
}

/**
 * Reset factory registry (for testing)
 */
function resetFactories() {
  factoryRegistry.clear();
}

module.exports = {
  // Strategy classes
  ErrorStrategy,
  RetryStrategy,
  FallbackStrategy,
  AbortStrategy,
  SilentStrategy,
  CompositeStrategy,

  // Error categorization
  ErrorCategories,
  categorizeError,

  // Factory
  IdeErrorFactory,
  getFactory,
  resetFactories,
};
