/**
 * GeneratorFactory - Dependency Injection for Content Generators
 *
 * Provides a centralized factory for creating content generators with:
 * - Shared PlaceholderRegistry built once
 * - Dependency injection for testability
 * - Generator registration pattern
 *
 * Usage:
 *   const factory = new GeneratorFactory();
 *   factory.registerGenerator('help', HelpGenerator);
 *   factory.registerGenerator('readme', ReadmeGenerator);
 *
 *   // Build registry once, pass to all generators
 *   const context = await factory.buildContext();
 *   await factory.runAll(context);
 */

'use strict';

const { PlaceholderRegistry, createDefaultRegistry } = require('./placeholder-registry');
const { createContainer, createScannerFactory } = require('./registry-di');

/**
 * Generator interface
 * @typedef {Object} IGenerator
 * @property {string} name - Generator name
 * @property {Function} register - Register placeholders: (registry) => void
 * @property {Function} generate - Generate content: (context) => Promise<void>
 */

/**
 * GeneratorFactory - Factory for creating and running generators
 */
class GeneratorFactory {
  /**
   * Create a new GeneratorFactory
   * @param {Object} options - Factory options
   * @param {Object} [options.container] - DI container (from registry-di.js)
   * @param {PlaceholderRegistry} [options.registry] - Pre-built registry
   * @param {Object} [options.paths] - Path configuration
   */
  constructor(options = {}) {
    this._generators = new Map();
    this._container = options.container || createContainer();
    this._registry = options.registry || null;
    this._paths = options.paths || {};
    this._built = false;
    this._context = null;
  }

  /**
   * Register a generator with the factory
   * @param {string} name - Generator name
   * @param {IGenerator|Function} generator - Generator instance or class
   * @returns {GeneratorFactory} this for chaining
   */
  registerGenerator(name, generator) {
    if (!name || typeof name !== 'string') {
      throw new Error('Generator name must be a non-empty string');
    }

    // Support both instances and classes
    const instance = typeof generator === 'function' ? new generator() : generator;

    if (!instance.register || typeof instance.register !== 'function') {
      throw new Error(`Generator "${name}" must have a register(registry) method`);
    }

    if (!instance.generate || typeof instance.generate !== 'function') {
      throw new Error(`Generator "${name}" must have a generate(context) method`);
    }

    this._generators.set(name, instance);

    // Reset built state when new generator is added
    this._built = false;
    this._context = null;

    return this;
  }

  /**
   * Unregister a generator
   * @param {string} name - Generator name
   * @returns {boolean} True if removed
   */
  unregisterGenerator(name) {
    const result = this._generators.delete(name);
    if (result) {
      this._built = false;
      this._context = null;
    }
    return result;
  }

  /**
   * Get list of registered generator names
   * @returns {string[]}
   */
  getGeneratorNames() {
    return Array.from(this._generators.keys());
  }

  /**
   * Check if a generator is registered
   * @param {string} name - Generator name
   * @returns {boolean}
   */
  hasGenerator(name) {
    return this._generators.has(name);
  }

  /**
   * Get the shared registry instance
   * @returns {PlaceholderRegistry}
   */
  getRegistry() {
    if (!this._registry) {
      this._registry = createDefaultRegistry();
    }
    return this._registry;
  }

  /**
   * Build context by registering all generator placeholders
   * Registry is built once and shared across all generators
   * @param {Object} [baseContext={}] - Base context to merge
   * @returns {Object} Built context
   */
  buildContext(baseContext = {}) {
    if (this._built && this._context) {
      return { ...this._context, ...baseContext };
    }

    const registry = this.getRegistry();

    // Let each generator register its placeholders
    for (const [name, generator] of this._generators) {
      try {
        generator.register(registry);
      } catch (error) {
        console.error(`Failed to register placeholders for "${name}":`, error.message);
      }
    }

    // Build context with resolved values
    this._context = {
      registry,
      container: this._container,
      paths: this._paths,
      scanner: createScannerFactory(this._container),
      ...baseContext,
    };

    this._built = true;

    return this._context;
  }

  /**
   * Run a specific generator
   * @param {string} name - Generator name
   * @param {Object} [context] - Context override
   * @returns {Promise<{success: boolean, error?: Error}>}
   */
  async runGenerator(name, context) {
    const generator = this._generators.get(name);

    if (!generator) {
      return { success: false, error: new Error(`Generator not found: ${name}`) };
    }

    const ctx = context || this.buildContext();

    try {
      await generator.generate(ctx);
      return { success: true };
    } catch (error) {
      return { success: false, error };
    }
  }

  /**
   * Run all registered generators
   * @param {Object} [context] - Context override
   * @returns {Promise<Map<string, {success: boolean, error?: Error}>>}
   */
  async runAll(context) {
    const ctx = context || this.buildContext();
    const results = new Map();

    for (const name of this._generators.keys()) {
      results.set(name, await this.runGenerator(name, ctx));
    }

    return results;
  }

  /**
   * Run generators in parallel
   * @param {Object} [context] - Context override
   * @returns {Promise<Map<string, {success: boolean, error?: Error}>>}
   */
  async runParallel(context) {
    const ctx = context || this.buildContext();
    const results = new Map();

    const promises = Array.from(this._generators.keys()).map(async name => {
      const result = await this.runGenerator(name, ctx);
      return { name, result };
    });

    const settled = await Promise.allSettled(promises);

    for (const item of settled) {
      if (item.status === 'fulfilled') {
        results.set(item.value.name, item.value.result);
      } else {
        // Shouldn't happen since runGenerator catches errors
        const name = 'unknown';
        results.set(name, { success: false, error: item.reason });
      }
    }

    return results;
  }

  /**
   * Reset the factory state
   */
  reset() {
    this._built = false;
    this._context = null;
    this._registry = null;
  }

  /**
   * Get container (for testing)
   * @returns {Object}
   */
  getContainer() {
    return this._container;
  }
}

/**
 * Base generator class with common utilities
 */
class BaseGenerator {
  constructor(options = {}) {
    this.name = options.name || this.constructor.name;
    this.placeholders = [];
  }

  /**
   * Register placeholders - override in subclass
   * @param {PlaceholderRegistry} registry
   */
  register(registry) {
    // Subclasses should override this method
    for (const placeholder of this.placeholders) {
      registry.register(placeholder.name, placeholder.resolver, placeholder.config);
    }
  }

  /**
   * Generate content - override in subclass
   * @param {Object} context
   * @returns {Promise<void>}
   */
  async generate(context) {
    throw new Error('Subclass must implement generate(context)');
  }

  /**
   * Helper to add a placeholder definition
   * @param {string} name - Placeholder name
   * @param {Function} resolver - Resolver function
   * @param {Object} [config] - Configuration
   */
  addPlaceholder(name, resolver, config = {}) {
    this.placeholders.push({ name, resolver, config });
  }
}

/**
 * Create a factory with standard generators
 * @param {Object} options - Factory options
 * @returns {GeneratorFactory}
 */
function createGeneratorFactory(options = {}) {
  const factory = new GeneratorFactory(options);

  // Register standard generators if provided
  if (options.generators) {
    for (const [name, generator] of Object.entries(options.generators)) {
      factory.registerGenerator(name, generator);
    }
  }

  return factory;
}

// Singleton instance
let _factoryInstance = null;

/**
 * Get singleton factory instance
 * @param {Object} [options] - Factory options
 * @returns {GeneratorFactory}
 */
function getGeneratorFactory(options = {}) {
  if (!_factoryInstance || options.forceNew) {
    _factoryInstance = createGeneratorFactory(options);
  }
  return _factoryInstance;
}

/**
 * Reset singleton (for testing)
 */
function resetGeneratorFactory() {
  _factoryInstance = null;
}

module.exports = {
  GeneratorFactory,
  BaseGenerator,
  createGeneratorFactory,
  getGeneratorFactory,
  resetGeneratorFactory,
};
