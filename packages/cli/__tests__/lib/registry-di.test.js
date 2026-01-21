/**
 * Tests for registry-di.js - Dependency Injection for Registry Layer
 */

const path = require('path');

const {
  createContainer,
  createTestContainer,
  createScannerFactory,
  createPathResolver,
  noopLogger,
  consoleLogger,
  loadDefaultSanitizer,
} = require('../../lib/registry-di');

describe('registry-di', () => {
  describe('createContainer', () => {
    it('creates container with default dependencies', () => {
      const container = createContainer();

      expect(container.fs).toBeDefined();
      expect(container.path).toBeDefined();
      expect(container.sanitizer).toBeDefined();
      expect(container.logger).toBeDefined();
    });

    it('allows overriding fs dependency', () => {
      const mockFs = { readFileSync: jest.fn() };
      const container = createContainer({ fs: mockFs });

      expect(container.fs).toBe(mockFs);
    });

    it('allows overriding path dependency', () => {
      const mockPath = { join: jest.fn() };
      const container = createContainer({ path: mockPath });

      expect(container.path).toBe(mockPath);
    });

    it('allows overriding sanitizer dependency', () => {
      const mockSanitizer = { sanitize: { count: jest.fn() } };
      const container = createContainer({ sanitizer: mockSanitizer });

      expect(container.sanitizer).toBe(mockSanitizer);
    });

    it('allows overriding logger dependency', () => {
      const mockLogger = { debug: jest.fn() };
      const container = createContainer({ logger: mockLogger });

      expect(container.logger).toBe(mockLogger);
    });

    it('uses default sanitizer with working methods', () => {
      const container = createContainer();

      expect(typeof container.sanitizer.sanitize.count).toBe('function');
      expect(typeof container.sanitizer.sanitize.description).toBe('function');
      expect(typeof container.sanitizer.detectInjectionAttempt).toBe('function');
    });
  });

  describe('createTestContainer', () => {
    it('creates container with mock-friendly defaults', () => {
      const container = createTestContainer();

      expect(container.fs.readdirSync()).toEqual([]);
      expect(container.fs.existsSync()).toBe(false);
    });

    it('allows overriding mock fs methods', () => {
      const container = createTestContainer({
        fs: { existsSync: () => true },
      });

      expect(container.fs.existsSync()).toBe(true);
    });

    it('provides pass-through sanitizer', () => {
      const container = createTestContainer();

      expect(container.sanitizer.sanitize.count(42)).toBe(42);
      expect(container.sanitizer.sanitize.description('test')).toBe('test');
    });

    it('provides safe injection detection by default', () => {
      const container = createTestContainer();

      expect(container.sanitizer.detectInjectionAttempt('test').safe).toBe(true);
    });
  });

  describe('noopLogger', () => {
    it('has all required methods', () => {
      expect(typeof noopLogger.debug).toBe('function');
      expect(typeof noopLogger.info).toBe('function');
      expect(typeof noopLogger.warn).toBe('function');
      expect(typeof noopLogger.error).toBe('function');
    });

    it('methods do nothing', () => {
      // Should not throw
      expect(() => noopLogger.debug('test')).not.toThrow();
      expect(() => noopLogger.info('test')).not.toThrow();
      expect(() => noopLogger.warn('test')).not.toThrow();
      expect(() => noopLogger.error('test')).not.toThrow();
    });
  });

  describe('consoleLogger', () => {
    it('has all required methods', () => {
      expect(typeof consoleLogger.debug).toBe('function');
      expect(typeof consoleLogger.info).toBe('function');
      expect(typeof consoleLogger.warn).toBe('function');
      expect(typeof consoleLogger.error).toBe('function');
    });
  });

  describe('loadDefaultSanitizer', () => {
    it('returns sanitizer with required methods', () => {
      const sanitizer = loadDefaultSanitizer();

      expect(sanitizer.sanitize).toBeDefined();
      expect(typeof sanitizer.sanitize.count).toBe('function');
      expect(typeof sanitizer.sanitize.description).toBe('function');
      expect(typeof sanitizer.validatePlaceholderValue).toBe('function');
      expect(typeof sanitizer.detectInjectionAttempt).toBe('function');
    });

    it('sanitize.count returns valid number', () => {
      const sanitizer = loadDefaultSanitizer();

      expect(sanitizer.sanitize.count(42)).toBe(42);
      expect(sanitizer.sanitize.count(-5)).toBe(0);
    });
  });

  describe('createScannerFactory', () => {
    it('returns scanner with scanDirectory method', () => {
      const container = createTestContainer();
      const scanner = createScannerFactory(container);

      expect(typeof scanner.scanDirectory).toBe('function');
    });

    it('returns scanner with scanCommands method', () => {
      const container = createTestContainer();
      const scanner = createScannerFactory(container);

      expect(typeof scanner.scanCommands).toBe('function');
    });

    it('returns scanner with scanAgents method', () => {
      const container = createTestContainer();
      const scanner = createScannerFactory(container);

      expect(typeof scanner.scanAgents).toBe('function');
    });

    describe('scanDirectory', () => {
      it('returns empty array for non-existent directory', () => {
        const container = createTestContainer();
        const scanner = createScannerFactory(container);

        const result = scanner.scanDirectory('/nonexistent', '.md', () => ({}));

        expect(result).toEqual([]);
      });

      it('scans existing directory and parses files', () => {
        const container = createTestContainer({
          fs: {
            existsSync: () => true,
            readdirSync: () => ['file1.md', 'file2.md', 'ignored.txt'],
            readFileSync: () => 'content',
          },
        });
        const scanner = createScannerFactory(container);

        const result = scanner.scanDirectory('/test', '.md', (content, file) => ({ name: file }));

        expect(result).toHaveLength(2);
        expect(result[0].name).toBe('file1.md');
        expect(result[1].name).toBe('file2.md');
      });

      it('filters out null parser results', () => {
        const container = createTestContainer({
          fs: {
            existsSync: () => true,
            readdirSync: () => ['valid.md', 'invalid.md'],
            readFileSync: () => 'content',
          },
        });
        const scanner = createScannerFactory(container);

        const result = scanner.scanDirectory('/test', '.md', (content, file) =>
          file === 'valid.md' ? { name: file } : null
        );

        expect(result).toHaveLength(1);
        expect(result[0].name).toBe('valid.md');
      });

      it('handles read errors gracefully', () => {
        const container = createTestContainer({
          fs: {
            existsSync: () => true,
            readdirSync: () => ['file.md'],
            readFileSync: () => {
              throw new Error('Read error');
            },
          },
        });
        const scanner = createScannerFactory(container);

        const result = scanner.scanDirectory('/test', '.md', () => ({}));

        expect(result).toEqual([]);
      });
    });

    describe('scanCommands', () => {
      it('scans commands with frontmatter', () => {
        const container = createTestContainer({
          fs: {
            existsSync: () => true,
            readdirSync: () => ['help.md'],
            readFileSync: () => '',
          },
        });
        const scanner = createScannerFactory(container);

        const mockExtractFrontmatter = () => ({
          description: 'Help command',
          'argument-hint': '[topic]',
        });

        const result = scanner.scanCommands('/commands', mockExtractFrontmatter);

        expect(result).toHaveLength(1);
        expect(result[0].name).toBe('help');
        expect(result[0].description).toBe('Help command');
        expect(result[0].argumentHint).toBe('[topic]');
      });

      it('skips files without frontmatter', () => {
        const container = createTestContainer({
          fs: {
            existsSync: () => true,
            readdirSync: () => ['no-frontmatter.md'],
            readFileSync: () => '',
          },
        });
        const scanner = createScannerFactory(container);

        const result = scanner.scanCommands('/commands', () => ({}));

        expect(result).toHaveLength(0);
      });
    });

    describe('scanAgents', () => {
      it('scans agents with frontmatter', () => {
        const container = createTestContainer({
          fs: {
            existsSync: () => true,
            readdirSync: () => ['ui.md'],
            readFileSync: () => '',
          },
        });
        const scanner = createScannerFactory(container);

        const mockExtractFrontmatter = () => ({
          name: 'UI Agent',
          description: 'UI specialist',
          tools: 'Read, Write',
          model: 'sonnet',
          color: 'green',
        });

        const mockNormalizeTools = () => ['Read', 'Write'];

        const result = scanner.scanAgents('/agents', mockExtractFrontmatter, mockNormalizeTools);

        expect(result).toHaveLength(1);
        expect(result[0].name).toBe('ui');
        expect(result[0].displayName).toBe('UI Agent');
        expect(result[0].tools).toEqual(['Read', 'Write']);
        expect(result[0].model).toBe('sonnet');
      });

      it('uses defaults for missing frontmatter fields', () => {
        const container = createTestContainer({
          fs: {
            existsSync: () => true,
            readdirSync: () => ['basic.md'],
            readFileSync: () => '',
          },
        });
        const scanner = createScannerFactory(container);

        const result = scanner.scanAgents('/agents', () => ({ name: 'Basic' }), null);

        expect(result).toHaveLength(1);
        expect(result[0].model).toBe('haiku');
        expect(result[0].color).toBe('blue');
      });
    });
  });

  describe('createPathResolver', () => {
    it('creates resolver with base directory', () => {
      const container = createContainer();
      const resolver = createPathResolver(container, '/base');

      expect(resolver.getBaseDir()).toBe('/base');
    });

    it('defaults to process.cwd() if no baseDir provided', () => {
      const container = createContainer();
      const resolver = createPathResolver(container);

      expect(resolver.getBaseDir()).toBe(process.cwd());
    });

    it('resolve() joins paths with base directory', () => {
      const container = createContainer();
      const resolver = createPathResolver(container, '/base');

      const result = resolver.resolve('sub', 'path');

      expect(result).toBe(path.resolve('/base', 'sub', 'path'));
    });

    it('join() joins path segments', () => {
      const container = createContainer();
      const resolver = createPathResolver(container, '/base');

      const result = resolver.join('a', 'b', 'c');

      expect(result).toBe(path.join('a', 'b', 'c'));
    });

    it('exists() checks path existence', () => {
      const container = createTestContainer({
        fs: {
          existsSync: p => p === '/exists',
        },
      });
      const resolver = createPathResolver(container, '/base');

      expect(resolver.exists('/exists')).toBe(true);
      expect(resolver.exists('/not-exists')).toBe(false);
    });
  });

  describe('integration', () => {
    it('container can be used with scanner factory', () => {
      const container = createTestContainer({
        fs: {
          existsSync: () => true,
          readdirSync: () => ['test.md'],
          readFileSync: () => 'content',
        },
      });

      const scanner = createScannerFactory(container);
      const resolver = createPathResolver(container, '/project');

      const commandsDir = resolver.resolve('src', 'commands');
      const commands = scanner.scanCommands(commandsDir, () => ({
        description: 'Test',
      }));

      expect(commands).toHaveLength(1);
    });

    it('test container provides isolation', () => {
      const container1 = createTestContainer({ fs: { existsSync: () => true } });
      const container2 = createTestContainer({ fs: { existsSync: () => false } });

      expect(container1.fs.existsSync()).toBe(true);
      expect(container2.fs.existsSync()).toBe(false);
    });
  });
});
