/**
 * Tests for Validation Middleware
 */

const path = require('path');
const os = require('os');
const fs = require('fs-extra');
const {
  schemas,
  validateField,
  validateOptions,
  createValidationWrapper,
  withValidation,
  validated,
  validatePathArgument,
  formatValidationErrors,
} = require('../../tools/cli/lib/validation-middleware');

describe('ValidationMiddleware', () => {
  let testDir;

  beforeEach(async () => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'validation-test-'));
  });

  afterEach(async () => {
    await fs.remove(testDir);
  });

  describe('schemas', () => {
    it('exports pre-defined path schema', () => {
      expect(schemas.path).toEqual({
        type: 'path',
        required: false,
        default: '.',
        errorMessage: 'Invalid path',
      });
    });

    it('exports required path schema', () => {
      expect(schemas.pathRequired.required).toBe(true);
    });

    it('exports IDE schemas', () => {
      expect(schemas.ide.type).toBe('ide');
      expect(schemas.ideRequired.required).toBe(true);
    });

    it('exports story ID schemas', () => {
      expect(schemas.storyId.type).toBe('storyId');
      expect(schemas.storyIdRequired.required).toBe(true);
    });

    it('exports epic ID schemas', () => {
      expect(schemas.epicId.type).toBe('epicId');
      expect(schemas.epicIdRequired.required).toBe(true);
    });

    it('creates string schema with options', () => {
      const schema = schemas.string({ minLength: 3, maxLength: 10 });
      expect(schema.type).toBe('string');
      expect(schema.minLength).toBe(3);
      expect(schema.maxLength).toBe(10);
    });

    it('creates number schema with options', () => {
      const schema = schemas.number({ min: 1, max: 100, integer: true });
      expect(schema.type).toBe('number');
      expect(schema.min).toBe(1);
      expect(schema.max).toBe(100);
      expect(schema.integer).toBe(true);
    });

    it('creates enum schema', () => {
      const schema = schemas.enum(['a', 'b', 'c']);
      expect(schema.type).toBe('enum');
      expect(schema.values).toEqual(['a', 'b', 'c']);
    });
  });

  describe('validateField', () => {
    describe('path type', () => {
      it('validates valid path', () => {
        const result = validateField('directory', '.', schemas.path, testDir);
        expect(result.ok).toBe(true);
        expect(result.data).toBeTruthy();
      });

      it('returns default for undefined value', () => {
        const result = validateField('directory', undefined, schemas.path, testDir);
        expect(result.ok).toBe(true);
        expect(result.data).toBe('.');
      });

      it('rejects path traversal attempt', () => {
        const result = validateField('directory', '../../../etc', schemas.path, testDir);
        expect(result.ok).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
      });
    });

    describe('ide type', () => {
      it('validates valid IDE', () => {
        const result = validateField('ide', 'claude-code', schemas.ide, testDir);
        expect(result.ok).toBe(true);
        expect(result.data).toBe('claude-code');
      });

      it('normalizes IDE to lowercase', () => {
        const result = validateField('ide', 'CURSOR', schemas.ide, testDir);
        expect(result.ok).toBe(true);
        expect(result.data).toBe('cursor');
      });

      it('rejects invalid IDE', () => {
        const result = validateField('ide', 'invalid-ide', schemas.ide, testDir);
        expect(result.ok).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
      });
    });

    describe('storyId type', () => {
      it('validates valid story ID', () => {
        const result = validateField('story', 'US-0001', schemas.storyId, testDir);
        expect(result.ok).toBe(true);
        expect(result.data).toBe('US-0001');
      });

      it('normalizes story ID to uppercase', () => {
        const result = validateField('story', 'us-0001', schemas.storyId, testDir);
        expect(result.ok).toBe(true);
        expect(result.data).toBe('US-0001');
      });

      it('rejects invalid story ID', () => {
        const result = validateField('story', 'STORY-001', schemas.storyId, testDir);
        expect(result.ok).toBe(false);
      });
    });

    describe('epicId type', () => {
      it('validates valid epic ID', () => {
        const result = validateField('epic', 'EP-0019', schemas.epicId, testDir);
        expect(result.ok).toBe(true);
        expect(result.data).toBe('EP-0019');
      });

      it('rejects invalid epic ID', () => {
        const result = validateField('epic', 'EPIC-001', schemas.epicId, testDir);
        expect(result.ok).toBe(false);
      });
    });

    describe('string type', () => {
      it('validates string within length bounds', () => {
        const schema = schemas.string({ minLength: 3, maxLength: 10 });
        const result = validateField('name', 'hello', schema, testDir);
        expect(result.ok).toBe(true);
      });

      it('rejects string below minLength', () => {
        const schema = schemas.string({ minLength: 5 });
        const result = validateField('name', 'hi', schema, testDir);
        expect(result.ok).toBe(false);
        expect(result.errors[0]).toContain('at least 5');
      });

      it('rejects string above maxLength', () => {
        const schema = schemas.string({ maxLength: 3 });
        const result = validateField('name', 'hello', schema, testDir);
        expect(result.ok).toBe(false);
        expect(result.errors[0]).toContain('at most 3');
      });

      it('validates pattern', () => {
        const schema = schemas.string({ pattern: /^[a-z]+$/ });
        const result = validateField('name', 'hello123', schema, testDir);
        expect(result.ok).toBe(false);
      });
    });

    describe('number type', () => {
      it('validates number within range', () => {
        const schema = schemas.number({ min: 1, max: 100 });
        const result = validateField('count', '50', schema, testDir);
        expect(result.ok).toBe(true);
        expect(result.data).toBe(50);
      });

      it('rejects number below min', () => {
        const schema = schemas.number({ min: 10 });
        const result = validateField('count', '5', schema, testDir);
        expect(result.ok).toBe(false);
        expect(result.errors[0]).toContain('at least 10');
      });

      it('rejects number above max', () => {
        const schema = schemas.number({ max: 10 });
        const result = validateField('count', '50', schema, testDir);
        expect(result.ok).toBe(false);
        expect(result.errors[0]).toContain('at most 10');
      });

      it('validates integer requirement', () => {
        const schema = schemas.number({ integer: true });
        const result = validateField('count', '5.5', schema, testDir);
        expect(result.ok).toBe(false);
        expect(result.errors[0]).toContain('integer');
      });

      it('rejects non-numeric string', () => {
        const schema = schemas.number();
        const result = validateField('count', 'abc', schema, testDir);
        expect(result.ok).toBe(false);
      });
    });

    describe('boolean type', () => {
      it('converts true string to boolean', () => {
        const result = validateField('flag', 'true', schemas.boolean, testDir);
        expect(result.ok).toBe(true);
        expect(result.data).toBe(true);
      });

      it('converts 1 to boolean true', () => {
        const result = validateField('flag', '1', schemas.boolean, testDir);
        expect(result.ok).toBe(true);
        expect(result.data).toBe(true);
      });

      it('converts other values to false', () => {
        const result = validateField('flag', 'false', schemas.boolean, testDir);
        expect(result.ok).toBe(true);
        expect(result.data).toBe(false);
      });
    });

    describe('enum type', () => {
      it('validates value in enum', () => {
        const schema = schemas.enum(['a', 'b', 'c']);
        const result = validateField('choice', 'b', schema, testDir);
        expect(result.ok).toBe(true);
        expect(result.data).toBe('b');
      });

      it('rejects value not in enum', () => {
        const schema = schemas.enum(['a', 'b', 'c']);
        const result = validateField('choice', 'd', schema, testDir);
        expect(result.ok).toBe(false);
      });
    });

    describe('required fields', () => {
      it('fails when required field is missing', () => {
        const result = validateField('ide', undefined, schemas.ideRequired, testDir);
        expect(result.ok).toBe(false);
        expect(result.errors[0]).toContain('required');
      });

      it('fails when required field is empty string', () => {
        const result = validateField('ide', '', schemas.ideRequired, testDir);
        expect(result.ok).toBe(false);
      });
    });
  });

  describe('validateOptions', () => {
    it('validates multiple fields', () => {
      const validationSchemas = {
        directory: schemas.path,
        ide: schemas.ide,
      };

      const result = validateOptions(
        { directory: '.', ide: 'claude-code' },
        validationSchemas,
        testDir
      );

      expect(result.ok).toBe(true);
      expect(result.data.ide).toBe('claude-code');
    });

    it('collects all errors', () => {
      const validationSchemas = {
        ide: schemas.ideRequired,
        story: schemas.storyIdRequired,
      };

      const result = validateOptions({}, validationSchemas, testDir);

      expect(result.ok).toBe(false);
      expect(result.errors.length).toBe(2);
    });

    it('preserves unvalidated fields', () => {
      const validationSchemas = {
        ide: schemas.ide,
      };

      const result = validateOptions(
        { ide: 'cursor', extra: 'value' },
        validationSchemas,
        testDir
      );

      expect(result.ok).toBe(true);
      expect(result.data.extra).toBe('value');
    });
  });

  describe('createValidationWrapper', () => {
    it('calls original action with validated options', async () => {
      const mockAction = jest.fn();
      const validationSchemas = {
        ide: schemas.ide,
      };

      const wrapped = createValidationWrapper(mockAction, validationSchemas);
      await wrapped({ ide: 'cursor' });

      expect(mockAction).toHaveBeenCalled();
      expect(mockAction.mock.calls[0][0].ide).toBe('cursor');
    });

    it('handles validation failure gracefully', async () => {
      const mockAction = jest.fn();
      const validationSchemas = {
        ide: schemas.ideRequired,
      };

      // Mock ErrorHandler to prevent console output
      jest.mock('../../tools/cli/lib/error-handler', () => ({
        ErrorHandler: jest.fn().mockImplementation(() => ({
          warning: jest.fn(),
        })),
      }));

      const wrapped = createValidationWrapper(mockAction, validationSchemas);
      await wrapped({});

      expect(mockAction).not.toHaveBeenCalled();
    });
  });

  describe('withValidation', () => {
    it('creates a decorator function', () => {
      const validationSchemas = { ide: schemas.ide };
      const decorator = withValidation(validationSchemas);
      expect(typeof decorator).toBe('function');
    });

    it('decorates action function', () => {
      const action = async () => {};
      const validationSchemas = { ide: schemas.ide };
      const decorated = withValidation(validationSchemas)(action);
      expect(typeof decorated).toBe('function');
    });
  });

  describe('validated', () => {
    it('wraps action with validation', async () => {
      const mockAction = jest.fn();
      const wrapped = validated(mockAction, { ide: schemas.ide });

      await wrapped({ ide: 'windsurf' });

      expect(mockAction).toHaveBeenCalled();
    });
  });

  describe('validatePathArgument', () => {
    it('validates path argument', () => {
      const result = validatePathArgument('.');
      expect(result.ok).toBe(true);
    });

    it('uses custom field name', () => {
      const result = validatePathArgument(undefined, 'directory');
      expect(result.ok).toBe(true);
      expect(result.data).toBe('.');
    });
  });

  describe('formatValidationErrors', () => {
    it('formats single error', () => {
      const result = formatValidationErrors(['Single error']);
      expect(result).toBe('Single error');
    });

    it('formats multiple errors with numbers', () => {
      const result = formatValidationErrors(['Error 1', 'Error 2', 'Error 3']);
      expect(result).toContain('1. Error 1');
      expect(result).toContain('2. Error 2');
      expect(result).toContain('3. Error 3');
    });
  });

  describe('edge cases', () => {
    it('handles null values', () => {
      const result = validateField('test', null, schemas.path, testDir);
      expect(result.ok).toBe(true);
      expect(result.data).toBe('.');
    });

    it('handles undefined schema type gracefully', () => {
      const unknownSchema = { type: 'unknown', required: false };
      const result = validateField('test', 'value', unknownSchema, testDir);
      expect(result.ok).toBe(true);
      expect(result.data).toBe('value');
    });

    it('handles non-string path values', () => {
      const result = validateField('path', 123, schemas.pathRequired, testDir);
      // Should handle gracefully, path.resolve can handle numbers
      expect(typeof result.ok).toBe('boolean');
    });
  });
});
