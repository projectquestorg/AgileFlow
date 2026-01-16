/**
 * AgileFlow CLI - Command Context & Middleware Pipeline
 *
 * Provides a middleware system for CLI commands to reduce boilerplate
 * and ensure consistent behavior across all commands.
 *
 * Usage:
 *   const { createCommand, middleware } = require('./lib/command-context');
 *   module.exports = createCommand({
 *     name: 'mycommand',
 *     middleware: [middleware.resolveDirectory, middleware.requireInstalled],
 *     action: async (ctx) => { ... }
 *   });
 */

const path = require('path');
const { Installer } = require('../installers/core/installer');
const { displayLogo, displaySection, warning, error } = require('./ui');
const { ErrorHandler } = require('./error-handler');
const { validateOptions, schemas } = require('./validation-middleware');

// Singleton installer instance
let _installer = null;
function getInstaller() {
  if (!_installer) {
    _installer = new Installer();
  }
  return _installer;
}

/**
 * Command context passed to action handlers
 * @typedef {Object} CommandContext
 * @property {Object} options - Parsed command options
 * @property {string} directory - Resolved project directory
 * @property {Object} [status] - Installation status (if requireInstalled middleware used)
 * @property {Installer} installer - Installer instance
 * @property {ErrorHandler} errorHandler - Error handler instance
 * @property {Object} meta - Command metadata
 */

/**
 * Middleware function signature
 * @typedef {Function} MiddlewareFunction
 * @param {CommandContext} ctx - Command context
 * @param {Function} next - Call to continue to next middleware
 * @returns {Promise<void>}
 */

/**
 * Command definition
 * @typedef {Object} CommandDefinition
 * @property {string} name - Command name
 * @property {string} description - Command description
 * @property {Array} [options] - Commander.js options
 * @property {Array} [arguments] - Commander.js arguments
 * @property {MiddlewareFunction[]} [middleware] - Middleware functions
 * @property {Object} [validate] - Validation schemas
 * @property {Function} action - Action handler
 */

/**
 * Built-in middleware functions
 */
const middleware = {
  /**
   * Resolves the directory option to an absolute path
   * @param {CommandContext} ctx
   * @param {Function} next
   */
  async resolveDirectory(ctx, next) {
    ctx.directory = path.resolve(ctx.options.directory || '.');
    await next();
  },

  /**
   * Displays the AgileFlow logo
   * @param {CommandContext} ctx
   * @param {Function} next
   */
  async displayLogo(ctx, next) {
    if (!ctx.options.json && !ctx.options.quiet) {
      displayLogo();
    }
    await next();
  },

  /**
   * Requires AgileFlow to be installed in the directory
   * @param {CommandContext} ctx
   * @param {Function} next
   */
  async requireInstalled(ctx, next) {
    const installer = getInstaller();
    ctx.status = await installer.getStatus(ctx.directory);

    if (!ctx.status.installed) {
      if (ctx.options.json) {
        console.log(JSON.stringify({ error: 'Not installed' }));
        process.exit(1);
      }

      ctx.errorHandler.warning(
        'No AgileFlow installation found',
        'Initialize AgileFlow first',
        'npx agileflow setup'
      );
      return; // Don't continue to next middleware
    }

    await next();
  },

  /**
   * Checks installation status but doesn't require it
   * @param {CommandContext} ctx
   * @param {Function} next
   */
  async checkInstallation(ctx, next) {
    const installer = getInstaller();
    ctx.status = await installer.getStatus(ctx.directory);
    await next();
  },

  /**
   * Adds validation middleware
   * @param {Object} validationSchemas - Schemas to validate against
   * @returns {MiddlewareFunction}
   */
  validate(validationSchemas) {
    return async (ctx, next) => {
      const result = validateOptions(ctx.options, validationSchemas, ctx.directory);

      if (!result.ok) {
        const errorList = result.errors.map(e => `  • ${e}`).join('\n');
        ctx.errorHandler.warning(
          'Input validation failed',
          `Please fix the following:\n${errorList}`,
          'Check command help with --help'
        );
        return;
      }

      // Merge validated data into options
      ctx.options = { ...ctx.options, ...result.data };
      await next();
    };
  },

  /**
   * Displays a section header
   * @param {string} title - Section title
   * @param {Function} [subtitleFn] - Function to generate subtitle from ctx
   * @returns {MiddlewareFunction}
   */
  section(title, subtitleFn) {
    return async (ctx, next) => {
      if (!ctx.options.json && !ctx.options.quiet) {
        const subtitle = subtitleFn ? subtitleFn(ctx) : undefined;
        displaySection(title, subtitle);
      }
      await next();
    };
  },
};

/**
 * Execute middleware pipeline
 * @param {MiddlewareFunction[]} middlewares - Array of middleware functions
 * @param {CommandContext} ctx - Command context
 * @returns {Promise<boolean>} - True if pipeline completed
 */
async function executeMiddleware(middlewares, ctx) {
  let index = 0;
  let completed = false;

  const next = async () => {
    if (index < middlewares.length) {
      const middleware = middlewares[index++];
      await middleware(ctx, next);
    } else {
      completed = true;
    }
  };

  await next();
  return completed;
}

/**
 * Create a command with middleware support
 * @param {CommandDefinition} definition - Command definition
 * @returns {Object} Commander.js compatible command object
 */
function createCommand(definition) {
  const {
    name,
    description,
    options = [],
    arguments: args = [],
    middleware: mw = [],
    validate,
    action,
  } = definition;

  // Build middleware pipeline
  const pipeline = [...mw];

  // Add validation middleware if schemas provided
  if (validate) {
    pipeline.unshift(middleware.validate(validate));
  }

  // Wrapped action with middleware pipeline
  const wrappedAction = async (...actionArgs) => {
    // Extract options from last argument (Commander.js pattern)
    const opts = actionArgs[actionArgs.length - 1];

    // Create context
    const ctx = {
      options: { ...opts },
      directory: opts.directory ? path.resolve(opts.directory) : process.cwd(),
      installer: getInstaller(),
      errorHandler: new ErrorHandler(name),
      meta: {
        name,
        description,
        args: actionArgs.slice(0, -1),
      },
    };

    try {
      // Execute middleware pipeline
      const completed = await executeMiddleware(pipeline, ctx);

      // Only run action if middleware completed
      if (completed) {
        await action(ctx);
      }
    } catch (err) {
      // Handle errors
      if (ctx.options.json) {
        console.log(JSON.stringify({ error: err.message }));
        process.exit(1);
      }

      ctx.errorHandler.critical(
        `${name} failed`,
        'Check error message for details',
        `npx agileflow ${name} --help`,
        err
      );
    }
  };

  return {
    name,
    description,
    options,
    arguments: args,
    action: wrappedAction,
  };
}

/**
 * Hook types for command lifecycle
 * @typedef {Object} Hooks
 * @property {Function[]} beforeAction - Run before action
 * @property {Function[]} afterAction - Run after action
 * @property {Function[]} onError - Run on error
 */

/**
 * Command registry for managing hooks
 */
class CommandRegistry {
  constructor() {
    this.hooks = {
      beforeAction: [],
      afterAction: [],
      onError: [],
    };
  }

  /**
   * Register a beforeAction hook
   * @param {Function} fn - Hook function
   */
  beforeAction(fn) {
    this.hooks.beforeAction.push(fn);
    return this;
  }

  /**
   * Register an afterAction hook
   * @param {Function} fn - Hook function
   */
  afterAction(fn) {
    this.hooks.afterAction.push(fn);
    return this;
  }

  /**
   * Register an error handler hook
   * @param {Function} fn - Hook function
   */
  onError(fn) {
    this.hooks.onError.push(fn);
    return this;
  }

  /**
   * Execute beforeAction hooks
   * @param {CommandContext} ctx
   */
  async runBeforeAction(ctx) {
    for (const hook of this.hooks.beforeAction) {
      await hook(ctx);
    }
  }

  /**
   * Execute afterAction hooks
   * @param {CommandContext} ctx
   * @param {*} result - Action result
   */
  async runAfterAction(ctx, result) {
    for (const hook of this.hooks.afterAction) {
      await hook(ctx, result);
    }
  }

  /**
   * Execute error hooks
   * @param {CommandContext} ctx
   * @param {Error} error
   */
  async runOnError(ctx, error) {
    for (const hook of this.hooks.onError) {
      await hook(ctx, error);
    }
  }
}

// Global registry instance
const registry = new CommandRegistry();

/**
 * Common middleware combinations for different command types
 */
const presets = {
  /**
   * Standard command that requires installation
   */
  standard: [middleware.resolveDirectory, middleware.displayLogo, middleware.requireInstalled],

  /**
   * Command that just needs directory resolution
   */
  simple: [middleware.resolveDirectory, middleware.displayLogo],

  /**
   * Command with JSON output support (no logo)
   */
  json: [middleware.resolveDirectory, middleware.checkInstallation],

  /**
   * Command that doesn't need installation
   */
  setup: [middleware.resolveDirectory, middleware.displayLogo],
};

module.exports = {
  createCommand,
  middleware,
  executeMiddleware,
  CommandRegistry,
  registry,
  presets,
  getInstaller,
  schemas, // Re-export for convenience
};
