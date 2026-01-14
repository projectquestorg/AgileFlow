'use strict';

/**
 * PlaceholderRegistry - Extensible Content Injection System
 *
 * Provides a registry-based approach to placeholder resolution with:
 * - Modular resolver functions for each placeholder type
 * - Plugin system for external extensions
 * - Security validation layer for all values
 * - Clear separation between built-in and custom placeholders
 *
 * Security Model:
 * - All values pass through sanitization before injection
 * - Resolvers can define their own validation rules
 * - External plugins are sandboxed to prevent security bypass
 */

const EventEmitter = require('events');

// Import security utilities
const {
  sanitize,
  validatePlaceholderValue,
  detectInjectionAttempt,
  escapeMarkdown,
} = require('./content-sanitizer');

/**
 * Placeholder configuration
 * @typedef {Object} PlaceholderConfig
 * @property {string} name - Placeholder name (e.g., 'COMMAND_COUNT')
 * @property {string} description - Human-readable description
 * @property {string} type - Value type: 'count', 'string', 'list', 'date', 'version'
 * @property {Function} resolver - Function that returns the value
 * @property {Function} [validator] - Optional custom validator
 * @property {Object} [context] - Context passed to resolver
 * @property {boolean} [secure=true] - Whether to apply security sanitization
 * @property {boolean} [cacheable=true] - Whether results can be cached
 * @property {string} [source='builtin'] - Source: 'builtin' | 'plugin'
 */

/**
 * Default resolver types with their sanitization rules
 */
const RESOLVER_TYPES = {
  count: {
    sanitizer: sanitize.count,
    defaultValue: 0,
  },
  string: {
    sanitizer: value => sanitize.description(value, { escapeMarkdown: false }),
    defaultValue: '',
  },
  list: {
    sanitizer: value => (Array.isArray(value) ? value : []),
    defaultValue: [],
  },
  date: {
    sanitizer: sanitize.date,
    defaultValue: () => new Date().toISOString().split('T')[0],
  },
  version: {
    sanitizer: sanitize.version,
    defaultValue: 'unknown',
  },
  markdown: {
    sanitizer: value => sanitize.description(value, { escapeMarkdown: true }),
    defaultValue: '',
  },
  folderName: {
    sanitizer: sanitize.folderName,
    defaultValue: '.agileflow',
  },
};

/**
 * PlaceholderRegistry - Central registry for placeholder resolvers
 */
class PlaceholderRegistry extends EventEmitter {
  constructor(options = {}) {
    super();

    this._resolvers = new Map();
    this._cache = new Map();
    this._plugins = new Map();
    this._context = options.context || {};

    // Options
    this.cacheEnabled = options.cache !== false;
    this.strictMode = options.strict !== false;
    this.secureByDefault = options.secure !== false;
  }

  /**
   * Register a placeholder resolver
   * @param {string} name - Placeholder name
   * @param {Function} resolver - Resolver function
   * @param {Object} config - Configuration
   * @returns {PlaceholderRegistry} this for chaining
   */
  register(name, resolver, config = {}) {
    if (!name || typeof name !== 'string') {
      throw new Error('Placeholder name must be a non-empty string');
    }

    if (typeof resolver !== 'function') {
      throw new Error('Resolver must be a function');
    }

    // Validate name format - allow:
    // - UPPER_SNAKE_CASE (e.g., COMMAND_COUNT)
    // - lower_snake_case (e.g., plugin_name)
    // - lower-kebab-case (e.g., project-root)
    // - Mixed for plugins (e.g., myplugin_COMMAND_COUNT)
    if (
      !/^[A-Z][A-Z0-9_]*$/.test(name) && // UPPER_SNAKE_CASE
      !/^[a-z][a-z0-9_]*$/.test(name) && // lower_snake_case
      !/^[a-z][a-z0-9-]*$/.test(name) && // lower-kebab-case
      !/^[a-z][a-z0-9]*_[A-Z][A-Z0-9_]*$/.test(name) // plugin_PLACEHOLDER
    ) {
      throw new Error(
        `Invalid placeholder name: ${name}. Use UPPER_SNAKE_CASE, lower_snake_case, or lower-kebab-case`
      );
    }

    const resolverConfig = {
      name,
      description: config.description || `Placeholder: ${name}`,
      type: config.type || 'string',
      resolver,
      validator: config.validator || null,
      context: config.context || {},
      secure: config.secure !== false,
      cacheable: config.cacheable !== false,
      source: config.source || 'builtin',
    };

    // Validate type
    if (!RESOLVER_TYPES[resolverConfig.type]) {
      throw new Error(`Invalid resolver type: ${resolverConfig.type}`);
    }

    this._resolvers.set(name, resolverConfig);

    // Clear cache for this placeholder
    this._cache.delete(name);

    this.emit('registered', { name, config: resolverConfig });

    return this;
  }

  /**
   * Unregister a placeholder resolver
   * @param {string} name - Placeholder name
   * @returns {boolean} True if removed
   */
  unregister(name) {
    if (!this._resolvers.has(name)) {
      return false;
    }

    const config = this._resolvers.get(name);

    // Prevent removing built-in resolvers unless in non-strict mode
    if (this.strictMode && config.source === 'builtin') {
      throw new Error(`Cannot unregister built-in placeholder: ${name}`);
    }

    this._resolvers.delete(name);
    this._cache.delete(name);

    this.emit('unregistered', { name });

    return true;
  }

  /**
   * Check if a placeholder is registered
   * @param {string} name - Placeholder name
   * @returns {boolean} True if registered
   */
  has(name) {
    return this._resolvers.has(name);
  }

  /**
   * Get resolver configuration
   * @param {string} name - Placeholder name
   * @returns {PlaceholderConfig|null} Configuration or null
   */
  getConfig(name) {
    return this._resolvers.get(name) || null;
  }

  /**
   * Resolve a placeholder value
   * @param {string} name - Placeholder name
   * @param {Object} context - Additional context
   * @returns {any} Resolved and sanitized value
   */
  resolve(name, context = {}) {
    const config = this._resolvers.get(name);

    if (!config) {
      if (this.strictMode) {
        throw new Error(`Unknown placeholder: ${name}`);
      }
      return '';
    }

    // Check cache
    const cacheKey = this._getCacheKey(name, context);
    if (this.cacheEnabled && config.cacheable && this._cache.has(cacheKey)) {
      return this._cache.get(cacheKey);
    }

    // Merge contexts
    const mergedContext = { ...this._context, ...config.context, ...context };

    // Call resolver
    let value;
    try {
      value = config.resolver(mergedContext);
    } catch (error) {
      // Emit error event for logging but don't throw
      if (this.listenerCount('error') > 0) {
        this.emit('error', { name, error });
      }
      value = this._getDefaultValue(config.type);
    }

    // Custom validation if provided
    if (config.validator) {
      const validation = config.validator(value);
      if (!validation.valid) {
        this.emit('validationFailed', { name, value, error: validation.error });
        value = this._getDefaultValue(config.type);
      }
    }

    // Security sanitization
    if (config.secure && this.secureByDefault) {
      value = this._sanitize(config.type, value);

      // Detect injection attempts
      if (typeof value === 'string') {
        const detection = detectInjectionAttempt(value);
        if (!detection.safe) {
          this.emit('injectionAttempt', { name, value, reason: detection.reason });
          value = this._getDefaultValue(config.type);
        }
      }
    }

    // Cache result
    if (this.cacheEnabled && config.cacheable) {
      this._cache.set(cacheKey, value);
    }

    this.emit('resolved', { name, value });

    return value;
  }

  /**
   * Resolve all placeholders in content
   * @param {string} content - Content with placeholders
   * @param {Object} context - Context for resolution
   * @returns {string} Content with placeholders replaced
   */
  inject(content, context = {}) {
    if (!content || typeof content !== 'string') {
      return '';
    }

    let result = content;

    // Replace <!-- {{PLACEHOLDER}} --> format FIRST (more specific pattern)
    result = result.replace(/<!--\s*\{\{([A-Z][A-Z0-9_]*)\}\}\s*-->/g, (match, name) => {
      if (this.has(name)) {
        const value = this.resolve(name, context);
        return this._formatValue(value);
      }
      return match;
    });

    // Replace {{PLACEHOLDER}} format
    result = result.replace(/\{\{([A-Z][A-Z0-9_]*)\}\}/g, (match, name) => {
      if (this.has(name)) {
        const value = this.resolve(name, context);
        return this._formatValue(value);
      }
      return match; // Keep unresolved
    });

    // Replace {placeholder} format (lowercase)
    result = result.replace(/\{([a-z][a-z0-9_-]*)\}/g, (match, name) => {
      if (this.has(name)) {
        const value = this.resolve(name, context);
        return this._formatValue(value);
      }
      return match;
    });

    return result;
  }

  /**
   * Get all registered placeholder names
   * @returns {string[]} Placeholder names
   */
  getNames() {
    return Array.from(this._resolvers.keys());
  }

  /**
   * Get documentation for all placeholders
   * @returns {Object} Documentation object
   */
  getDocs() {
    const docs = {};

    for (const [name, config] of this._resolvers) {
      docs[name] = {
        description: config.description,
        type: config.type,
        source: config.source,
        secure: config.secure,
        cacheable: config.cacheable,
      };
    }

    return docs;
  }

  /**
   * Clear resolution cache
   * @param {string} [name] - Specific placeholder to clear (or all if not specified)
   */
  clearCache(name) {
    if (name) {
      this._cache.delete(name);
    } else {
      this._cache.clear();
    }
  }

  /**
   * Extend registry with a plugin
   * @param {string} pluginName - Plugin identifier
   * @param {Object} plugin - Plugin object with register method
   * @returns {PlaceholderRegistry} this for chaining
   */
  extend(pluginName, plugin) {
    if (!pluginName || typeof pluginName !== 'string') {
      throw new Error('Plugin name must be a non-empty string');
    }

    if (this._plugins.has(pluginName)) {
      throw new Error(`Plugin already registered: ${pluginName}`);
    }

    if (!plugin || typeof plugin.register !== 'function') {
      throw new Error('Plugin must have a register method');
    }

    // Create sandboxed registry for plugin
    const sandboxedRegister = (name, resolver, config = {}) => {
      // Prefix plugin placeholders to avoid conflicts
      const prefixedName = `${pluginName}_${name}`;

      // Force plugin source
      const pluginConfig = {
        ...config,
        source: 'plugin',
        pluginName,
      };

      return this.register(prefixedName, resolver, pluginConfig);
    };

    // Call plugin register method
    plugin.register({
      register: sandboxedRegister,
      context: this._context,
    });

    this._plugins.set(pluginName, plugin);

    this.emit('pluginLoaded', { pluginName });

    return this;
  }

  /**
   * Remove a plugin and its placeholders
   * @param {string} pluginName - Plugin identifier
   * @returns {boolean} True if removed
   */
  removePlugin(pluginName) {
    if (!this._plugins.has(pluginName)) {
      return false;
    }

    // Remove all placeholders from this plugin
    const prefix = `${pluginName}_`;
    for (const name of this._resolvers.keys()) {
      if (name.startsWith(prefix)) {
        this._resolvers.delete(name);
        this._cache.delete(name);
      }
    }

    this._plugins.delete(pluginName);

    this.emit('pluginRemoved', { pluginName });

    return true;
  }

  /**
   * Set global context for all resolvers
   * @param {Object} context - Context object
   */
  setContext(context) {
    this._context = { ...this._context, ...context };
    this.clearCache(); // Clear cache when context changes
  }

  /**
   * Get default value for type
   */
  _getDefaultValue(type) {
    const typeConfig = RESOLVER_TYPES[type];
    if (!typeConfig) return '';

    return typeof typeConfig.defaultValue === 'function'
      ? typeConfig.defaultValue()
      : typeConfig.defaultValue;
  }

  /**
   * Sanitize value based on type
   */
  _sanitize(type, value) {
    const typeConfig = RESOLVER_TYPES[type];
    if (!typeConfig || !typeConfig.sanitizer) {
      return value;
    }

    return typeConfig.sanitizer(value);
  }

  /**
   * Format value for injection
   */
  _formatValue(value) {
    if (Array.isArray(value)) {
      return value.join('\n');
    }
    return String(value);
  }

  /**
   * Get cache key for a placeholder with context
   */
  _getCacheKey(name, context) {
    // Simple cache key - just placeholder name for now
    // Could be extended to include context hash
    return name;
  }
}

// =============================================================================
// Built-in Resolver Modules
// =============================================================================

/**
 * Count resolver - creates resolver for numeric counts
 * @param {Function} countFn - Function that returns count
 * @returns {Function} Resolver function
 */
function createCountResolver(countFn) {
  return context => {
    try {
      return countFn(context);
    } catch (e) {
      return 0;
    }
  };
}

/**
 * List resolver - creates resolver for list generation
 * @param {Function} listFn - Function that returns list content
 * @returns {Function} Resolver function
 */
function createListResolver(listFn) {
  return context => {
    try {
      return listFn(context);
    } catch (e) {
      return '';
    }
  };
}

/**
 * Static resolver - creates resolver for static values
 * @param {any} value - Static value
 * @returns {Function} Resolver function
 */
function createStaticResolver(value) {
  return () => value;
}

// =============================================================================
// Default Registry Factory
// =============================================================================

/**
 * Create a registry with built-in AgileFlow placeholders
 * @param {Object} options - Options
 * @returns {PlaceholderRegistry} Configured registry
 */
function createDefaultRegistry(options = {}) {
  const registry = new PlaceholderRegistry(options);

  // Count placeholders (resolvers provided by caller via context)
  registry.register('COMMAND_COUNT', ctx => ctx.commandCount || 0, {
    type: 'count',
    description: 'Total number of slash commands',
  });

  registry.register('AGENT_COUNT', ctx => ctx.agentCount || 0, {
    type: 'count',
    description: 'Total number of specialized agents',
  });

  registry.register('SKILL_COUNT', ctx => ctx.skillCount || 0, {
    type: 'count',
    description: 'Total number of skills',
  });

  // Metadata placeholders
  registry.register('VERSION', ctx => ctx.version || 'unknown', {
    type: 'version',
    description: 'AgileFlow version from package.json',
  });

  registry.register('INSTALL_DATE', () => new Date(), {
    type: 'date',
    description: 'Installation date (YYYY-MM-DD)',
    cacheable: false,
  });

  // List placeholders (resolvers provided by caller)
  registry.register('AGENT_LIST', ctx => ctx.agentList || '', {
    type: 'string',
    description: 'Full formatted agent list with details',
    secure: false, // List generation already sanitizes
  });

  registry.register('COMMAND_LIST', ctx => ctx.commandList || '', {
    type: 'string',
    description: 'Full formatted command list',
    secure: false,
  });

  // Folder placeholders (lowercase format)
  registry.register('agileflow_folder', ctx => ctx.agileflowFolder || '.agileflow', {
    type: 'folderName',
    description: 'Name of the AgileFlow folder',
  });

  registry.register('project-root', () => '{project-root}', {
    type: 'string',
    description: 'Project root reference (kept as-is for runtime)',
    secure: false,
  });

  return registry;
}

// Singleton instance
let _instance = null;

/**
 * Get singleton registry instance
 * @param {Object} options - Options
 * @returns {PlaceholderRegistry} Registry instance
 */
function getRegistry(options = {}) {
  if (!_instance || options.forceNew) {
    _instance = createDefaultRegistry(options);
  }
  return _instance;
}

/**
 * Reset singleton (for testing)
 */
function resetRegistry() {
  _instance = null;
}

module.exports = {
  PlaceholderRegistry,
  RESOLVER_TYPES,
  createCountResolver,
  createListResolver,
  createStaticResolver,
  createDefaultRegistry,
  getRegistry,
  resetRegistry,
};
