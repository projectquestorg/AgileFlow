/**
 * _interface.js - IDE Handler Interface
 *
 * Defines the formal contract that all IDE handlers must implement.
 * This interface ensures consistency across IDE installers and
 * enables validation at registration time.
 *
 * Usage:
 *   const { IdeHandlerInterface, validateHandler } = require('./_interface');
 *
 *   class MyIdeSetup extends BaseIdeSetup {
 *     // Implement required methods
 *   }
 *
 *   // In IdeManager.loadHandlers():
 *   const validationResult = validateHandler(handler);
 *   if (!validationResult.valid) {
 *     throw new Error(`Invalid handler: ${validationResult.errors.join(', ')}`);
 *   }
 */

/**
 * Required methods that every IDE handler must implement
 * @type {Object.<string, {required: boolean, description: string, signature: string}>}
 */
const REQUIRED_METHODS = {
  setup: {
    required: true,
    description: 'Main setup method to configure the IDE',
    signature:
      'async setup(projectDir: string, agileflowDir: string, options?: object): Promise<object>',
  },
  cleanup: {
    required: true,
    description: 'Cleanup old IDE configuration',
    signature: 'async cleanup(projectDir: string): Promise<void>',
  },
  detect: {
    required: true,
    description: 'Detect if this IDE is configured in the project',
    signature: 'async detect(projectDir: string): Promise<boolean>',
  },
};

/**
 * Required properties that every IDE handler must have
 * @type {Object.<string, {required: boolean, description: string, type: string}>}
 */
const REQUIRED_PROPERTIES = {
  name: {
    required: true,
    description: 'Unique identifier for the IDE (lowercase)',
    type: 'string',
  },
  displayName: {
    required: true,
    description: 'Human-readable name for display',
    type: 'string',
  },
  configDir: {
    required: true,
    description: 'Configuration directory name (e.g., ".cursor", ".claude")',
    type: 'string',
  },
};

/**
 * Optional methods that handlers may implement
 * @type {Object.<string, {description: string, signature: string}>}
 */
const OPTIONAL_METHODS = {
  setAgileflowFolder: {
    description: 'Set the AgileFlow folder name',
    signature: 'setAgileflowFolder(folderName: string): void',
  },
  setDocsFolder: {
    description: 'Set the docs folder name',
    signature: 'setDocsFolder(folderName: string): void',
  },
};

/**
 * Validate that a handler implements all required methods and properties
 * @param {object} handler - IDE handler instance to validate
 * @returns {{valid: boolean, errors: string[], warnings: string[]}}
 */
function validateHandler(handler) {
  const errors = [];
  const warnings = [];

  if (!handler) {
    return { valid: false, errors: ['Handler is null or undefined'], warnings: [] };
  }

  // Check required properties
  for (const [propName, propDef] of Object.entries(REQUIRED_PROPERTIES)) {
    if (propDef.required) {
      const value = handler[propName];

      if (value === undefined || value === null) {
        errors.push(`Missing required property: ${propName} (${propDef.description})`);
      } else if (propDef.type && typeof value !== propDef.type) {
        errors.push(`Property ${propName} must be of type ${propDef.type}, got ${typeof value}`);
      }
    }
  }

  // Check required methods
  for (const [methodName, methodDef] of Object.entries(REQUIRED_METHODS)) {
    if (methodDef.required) {
      const method = handler[methodName];

      if (typeof method !== 'function') {
        errors.push(`Missing required method: ${methodName}() - ${methodDef.description}`);
      }
    }
  }

  // Check for optional methods (just warnings)
  for (const [methodName, methodDef] of Object.entries(OPTIONAL_METHODS)) {
    if (typeof handler[methodName] !== 'function') {
      warnings.push(`Optional method not implemented: ${methodName}() - ${methodDef.description}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Get a summary of the interface requirements
 * @returns {string} Human-readable summary
 */
function getInterfaceSummary() {
  const lines = ['IDE Handler Interface Requirements:', ''];

  lines.push('Required Properties:');
  for (const [name, def] of Object.entries(REQUIRED_PROPERTIES)) {
    lines.push(`  - ${name}: ${def.type} - ${def.description}`);
  }

  lines.push('');
  lines.push('Required Methods:');
  for (const [name, def] of Object.entries(REQUIRED_METHODS)) {
    lines.push(`  - ${name}()`);
    lines.push(`    Signature: ${def.signature}`);
    lines.push(`    Purpose: ${def.description}`);
    lines.push('');
  }

  lines.push('Optional Methods:');
  for (const [name, def] of Object.entries(OPTIONAL_METHODS)) {
    lines.push(`  - ${name}(): ${def.description}`);
  }

  return lines.join('\n');
}

/**
 * IDE Handler Interface - Abstract base that defines the contract
 * This is for documentation purposes; actual handlers extend BaseIdeSetup
 */
class IdeHandlerInterface {
  /**
   * @param {string} name - Unique identifier (lowercase)
   * @param {string} displayName - Human-readable name
   * @param {string} configDir - Configuration directory name
   */
  constructor(name, displayName, configDir) {
    if (this.constructor === IdeHandlerInterface) {
      throw new Error('IdeHandlerInterface is abstract and cannot be instantiated directly');
    }

    this.name = name;
    this.displayName = displayName;
    this.configDir = configDir;
  }

  /**
   * Main setup method - MUST be implemented
   * @param {string} projectDir - Project directory
   * @param {string} agileflowDir - AgileFlow installation directory
   * @param {Object} [options] - Setup options
   * @returns {Promise<{success: boolean, commands?: number, agents?: number}>}
   * @abstract
   */
  async setup(projectDir, agileflowDir, options = {}) {
    throw new Error('setup() must be implemented by subclass');
  }

  /**
   * Cleanup IDE configuration - MUST be implemented
   * @param {string} projectDir - Project directory
   * @returns {Promise<void>}
   * @abstract
   */
  async cleanup(projectDir) {
    throw new Error('cleanup() must be implemented by subclass');
  }

  /**
   * Detect if IDE is configured - MUST be implemented
   * @param {string} projectDir - Project directory
   * @returns {Promise<boolean>}
   * @abstract
   */
  async detect(projectDir) {
    throw new Error('detect() must be implemented by subclass');
  }

  /**
   * Set AgileFlow folder name - OPTIONAL
   * @param {string} folderName - Folder name
   */
  setAgileflowFolder(folderName) {
    // Optional - implement if needed
  }

  /**
   * Set docs folder name - OPTIONAL
   * @param {string} folderName - Folder name
   */
  setDocsFolder(folderName) {
    // Optional - implement if needed
  }
}

module.exports = {
  IdeHandlerInterface,
  validateHandler,
  getInterfaceSummary,
  REQUIRED_METHODS,
  REQUIRED_PROPERTIES,
  OPTIONAL_METHODS,
};
