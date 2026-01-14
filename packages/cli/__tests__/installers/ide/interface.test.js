/**
 * Tests for IDE Handler Interface
 */

const {
  validateHandler,
  getInterfaceSummary,
  IdeHandlerInterface,
  REQUIRED_METHODS,
  REQUIRED_PROPERTIES,
} = require('../../../tools/cli/installers/ide/_interface');

describe('IDE Handler Interface', () => {
  describe('validateHandler', () => {
    it('returns invalid for null handler', () => {
      const result = validateHandler(null);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Handler is null or undefined');
    });

    it('returns invalid for undefined handler', () => {
      const result = validateHandler(undefined);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Handler is null or undefined');
    });

    it('validates required properties', () => {
      const handler = {};
      const result = validateHandler(handler);

      expect(result.valid).toBe(false);
      expect(result.errors.join(',')).toContain('Missing required property: name');
      expect(result.errors.join(',')).toContain('Missing required property: displayName');
      expect(result.errors.join(',')).toContain('Missing required property: configDir');
    });

    it('validates property types', () => {
      const handler = {
        name: 123, // Should be string
        displayName: 'Test',
        configDir: '.test',
        setup: async () => {},
        cleanup: async () => {},
        detect: async () => {},
      };
      const result = validateHandler(handler);

      expect(result.valid).toBe(false);
      expect(result.errors.join(',')).toContain('must be of type string');
    });

    it('validates required methods', () => {
      const handler = {
        name: 'test',
        displayName: 'Test IDE',
        configDir: '.test',
        // Missing setup, cleanup, detect
      };
      const result = validateHandler(handler);

      expect(result.valid).toBe(false);
      expect(result.errors.join(',')).toContain('Missing required method: setup');
      expect(result.errors.join(',')).toContain('Missing required method: cleanup');
      expect(result.errors.join(',')).toContain('Missing required method: detect');
    });

    it('passes valid handler', () => {
      const handler = {
        name: 'test',
        displayName: 'Test IDE',
        configDir: '.test',
        setup: async () => ({ success: true }),
        cleanup: async () => {},
        detect: async () => true,
      };
      const result = validateHandler(handler);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('provides warnings for optional methods', () => {
      const handler = {
        name: 'test',
        displayName: 'Test IDE',
        configDir: '.test',
        setup: async () => ({ success: true }),
        cleanup: async () => {},
        detect: async () => true,
        // Missing optional setAgileflowFolder and setDocsFolder
      };
      const result = validateHandler(handler);

      expect(result.valid).toBe(true);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings.join(',')).toContain('setAgileflowFolder');
    });

    it('accepts handler with all methods', () => {
      const handler = {
        name: 'test',
        displayName: 'Test IDE',
        configDir: '.test',
        setup: async () => ({ success: true }),
        cleanup: async () => {},
        detect: async () => true,
        setAgileflowFolder: () => {},
        setDocsFolder: () => {},
      };
      const result = validateHandler(handler);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
    });
  });

  describe('getInterfaceSummary', () => {
    it('returns human-readable summary', () => {
      const summary = getInterfaceSummary();

      expect(summary).toContain('IDE Handler Interface Requirements');
      expect(summary).toContain('Required Properties');
      expect(summary).toContain('name');
      expect(summary).toContain('Required Methods');
      expect(summary).toContain('setup()');
      expect(summary).toContain('cleanup()');
      expect(summary).toContain('detect()');
    });
  });

  describe('IdeHandlerInterface', () => {
    it('cannot be instantiated directly', () => {
      expect(() => new IdeHandlerInterface('test', 'Test', '.test')).toThrow(
        'IdeHandlerInterface is abstract'
      );
    });

    it('can be extended', () => {
      class TestHandler extends IdeHandlerInterface {
        constructor() {
          super('test', 'Test IDE', '.test');
        }
      }

      const handler = new TestHandler();
      expect(handler.name).toBe('test');
      expect(handler.displayName).toBe('Test IDE');
      expect(handler.configDir).toBe('.test');
    });

    it('throws on abstract methods', async () => {
      class TestHandler extends IdeHandlerInterface {
        constructor() {
          super('test', 'Test IDE', '.test');
        }
      }

      const handler = new TestHandler();

      await expect(handler.setup()).rejects.toThrow('must be implemented');
      await expect(handler.cleanup()).rejects.toThrow('must be implemented');
      await expect(handler.detect()).rejects.toThrow('must be implemented');
    });
  });

  describe('REQUIRED_METHODS', () => {
    it('defines setup method', () => {
      expect(REQUIRED_METHODS.setup).toBeDefined();
      expect(REQUIRED_METHODS.setup.required).toBe(true);
      expect(REQUIRED_METHODS.setup.description).toBeDefined();
    });

    it('defines cleanup method', () => {
      expect(REQUIRED_METHODS.cleanup).toBeDefined();
      expect(REQUIRED_METHODS.cleanup.required).toBe(true);
    });

    it('defines detect method', () => {
      expect(REQUIRED_METHODS.detect).toBeDefined();
      expect(REQUIRED_METHODS.detect.required).toBe(true);
    });
  });

  describe('REQUIRED_PROPERTIES', () => {
    it('defines name property', () => {
      expect(REQUIRED_PROPERTIES.name).toBeDefined();
      expect(REQUIRED_PROPERTIES.name.required).toBe(true);
      expect(REQUIRED_PROPERTIES.name.type).toBe('string');
    });

    it('defines displayName property', () => {
      expect(REQUIRED_PROPERTIES.displayName).toBeDefined();
      expect(REQUIRED_PROPERTIES.displayName.required).toBe(true);
    });

    it('defines configDir property', () => {
      expect(REQUIRED_PROPERTIES.configDir).toBeDefined();
      expect(REQUIRED_PROPERTIES.configDir.required).toBe(true);
    });
  });
});

describe('Real IDE Handlers', () => {
  const { BaseIdeSetup } = require('../../../tools/cli/installers/ide/_base-ide');
  const { CursorSetup } = require('../../../tools/cli/installers/ide/cursor');
  const { WindsurfSetup } = require('../../../tools/cli/installers/ide/windsurf');

  describe('BaseIdeSetup', () => {
    it('has all required properties', () => {
      const handler = new BaseIdeSetup('test', 'Test', false);
      handler.configDir = '.test';

      const result = validateHandler(handler);
      expect(result.valid).toBe(true);
    });
  });

  describe('CursorSetup', () => {
    it('passes interface validation', () => {
      const handler = new CursorSetup();
      const result = validateHandler(handler);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('has correct name and configDir', () => {
      const handler = new CursorSetup();

      expect(handler.name).toBe('cursor');
      expect(handler.displayName).toBe('Cursor');
      expect(handler.configDir).toBe('.cursor');
    });
  });

  describe('WindsurfSetup', () => {
    it('passes interface validation', () => {
      const handler = new WindsurfSetup();
      const result = validateHandler(handler);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('has correct name and configDir', () => {
      const handler = new WindsurfSetup();

      expect(handler.name).toBe('windsurf');
      expect(handler.displayName).toBe('Windsurf');
      expect(handler.configDir).toBe('.windsurf');
    });
  });
});
