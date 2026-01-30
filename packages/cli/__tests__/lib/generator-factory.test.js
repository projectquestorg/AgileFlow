/**
 * Tests for lib/generator-factory.js
 *
 * Tests the GeneratorFactory dependency injection pattern for content generators.
 */

'use strict';

describe('generator-factory', () => {
  let GeneratorFactory;
  let BaseGenerator;
  let createGeneratorFactory;
  let getGeneratorFactory;
  let resetGeneratorFactory;

  beforeAll(() => {
    const mod = require('../../lib/generator-factory');
    GeneratorFactory = mod.GeneratorFactory;
    BaseGenerator = mod.BaseGenerator;
    createGeneratorFactory = mod.createGeneratorFactory;
    getGeneratorFactory = mod.getGeneratorFactory;
    resetGeneratorFactory = mod.resetGeneratorFactory;
  });

  afterEach(() => {
    resetGeneratorFactory();
  });

  describe('GeneratorFactory', () => {
    describe('constructor', () => {
      test('creates factory with default options', () => {
        const factory = new GeneratorFactory();
        expect(factory).toBeInstanceOf(GeneratorFactory);
        expect(factory.getGeneratorNames()).toHaveLength(0);
      });

      test('accepts custom container', () => {
        const mockContainer = { fs: {}, path: {} };
        const factory = new GeneratorFactory({ container: mockContainer });
        expect(factory.getContainer()).toBe(mockContainer);
      });

      test('accepts custom registry', () => {
        const { PlaceholderRegistry } = require('../../lib/placeholder-registry');
        const registry = new PlaceholderRegistry();
        const factory = new GeneratorFactory({ registry });
        expect(factory.getRegistry()).toBe(registry);
      });
    });

    describe('registerGenerator', () => {
      let factory;

      beforeEach(() => {
        factory = new GeneratorFactory();
      });

      test('registers generator with name', () => {
        const generator = {
          register: jest.fn(),
          generate: jest.fn(),
        };

        factory.registerGenerator('test', generator);
        expect(factory.hasGenerator('test')).toBe(true);
        expect(factory.getGeneratorNames()).toContain('test');
      });

      test('throws on empty name', () => {
        const generator = { register: jest.fn(), generate: jest.fn() };
        expect(() => factory.registerGenerator('', generator)).toThrow('non-empty string');
      });

      test('throws on missing register method', () => {
        const generator = { generate: jest.fn() };
        expect(() => factory.registerGenerator('test', generator)).toThrow(
          'register(registry) method'
        );
      });

      test('throws on missing generate method', () => {
        const generator = { register: jest.fn() };
        expect(() => factory.registerGenerator('test', generator)).toThrow(
          'generate(context) method'
        );
      });

      test('supports generator classes', () => {
        class TestGenerator {
          register() {}
          generate() {}
        }

        factory.registerGenerator('test', TestGenerator);
        expect(factory.hasGenerator('test')).toBe(true);
      });

      test('returns factory for chaining', () => {
        const generator = { register: jest.fn(), generate: jest.fn() };
        const result = factory.registerGenerator('test', generator);
        expect(result).toBe(factory);
      });
    });

    describe('unregisterGenerator', () => {
      let factory;

      beforeEach(() => {
        factory = new GeneratorFactory();
        factory.registerGenerator('test', { register: jest.fn(), generate: jest.fn() });
      });

      test('removes registered generator', () => {
        expect(factory.hasGenerator('test')).toBe(true);
        const result = factory.unregisterGenerator('test');
        expect(result).toBe(true);
        expect(factory.hasGenerator('test')).toBe(false);
      });

      test('returns false for non-existent generator', () => {
        const result = factory.unregisterGenerator('nonexistent');
        expect(result).toBe(false);
      });
    });

    describe('getRegistry', () => {
      test('creates default registry if none provided', () => {
        const factory = new GeneratorFactory();
        const registry = factory.getRegistry();
        expect(registry).toBeDefined();
        expect(registry.has('VERSION')).toBe(true); // Built-in placeholder
      });

      test('returns same registry on multiple calls', () => {
        const factory = new GeneratorFactory();
        const r1 = factory.getRegistry();
        const r2 = factory.getRegistry();
        expect(r1).toBe(r2);
      });
    });

    describe('buildContext', () => {
      let factory;

      beforeEach(() => {
        factory = new GeneratorFactory();
      });

      test('builds context with registry', () => {
        const context = factory.buildContext();
        expect(context.registry).toBeDefined();
        expect(context.container).toBeDefined();
        expect(context.scanner).toBeDefined();
      });

      test('calls register on each generator', () => {
        const registerFn = jest.fn();
        factory.registerGenerator('test', {
          register: registerFn,
          generate: jest.fn(),
        });

        factory.buildContext();
        expect(registerFn).toHaveBeenCalledWith(factory.getRegistry());
      });

      test('merges base context', () => {
        const context = factory.buildContext({ custom: 'value' });
        expect(context.custom).toBe('value');
      });

      test('caches built context', () => {
        const registerFn = jest.fn();
        factory.registerGenerator('test', {
          register: registerFn,
          generate: jest.fn(),
        });

        factory.buildContext();
        factory.buildContext();

        // Should only call register once
        expect(registerFn).toHaveBeenCalledTimes(1);
      });

      test('resets cache when new generator added', () => {
        const register1 = jest.fn();
        const register2 = jest.fn();

        factory.registerGenerator('test1', {
          register: register1,
          generate: jest.fn(),
        });

        factory.buildContext();
        expect(register1).toHaveBeenCalledTimes(1);

        // Add new generator - should reset cache
        factory.registerGenerator('test2', {
          register: register2,
          generate: jest.fn(),
        });

        factory.buildContext();
        expect(register1).toHaveBeenCalledTimes(2);
        expect(register2).toHaveBeenCalledTimes(1);
      });
    });

    describe('runGenerator', () => {
      let factory;

      beforeEach(() => {
        factory = new GeneratorFactory();
      });

      test('runs specified generator', async () => {
        const generateFn = jest.fn();
        factory.registerGenerator('test', {
          register: jest.fn(),
          generate: generateFn,
        });

        const result = await factory.runGenerator('test');
        expect(result.success).toBe(true);
        expect(generateFn).toHaveBeenCalled();
      });

      test('returns error for non-existent generator', async () => {
        const result = await factory.runGenerator('nonexistent');
        expect(result.success).toBe(false);
        expect(result.error.message).toContain('Generator not found');
      });

      test('catches generator errors', async () => {
        factory.registerGenerator('test', {
          register: jest.fn(),
          generate: () => {
            throw new Error('Test error');
          },
        });

        const result = await factory.runGenerator('test');
        expect(result.success).toBe(false);
        expect(result.error.message).toBe('Test error');
      });

      test('passes context to generator', async () => {
        const generateFn = jest.fn();
        factory.registerGenerator('test', {
          register: jest.fn(),
          generate: generateFn,
        });

        const context = factory.buildContext({ custom: 'value' });
        await factory.runGenerator('test', context);

        expect(generateFn).toHaveBeenCalledWith(expect.objectContaining({ custom: 'value' }));
      });
    });

    describe('runAll', () => {
      let factory;

      beforeEach(() => {
        factory = new GeneratorFactory();
      });

      test('runs all registered generators', async () => {
        const gen1 = jest.fn();
        const gen2 = jest.fn();

        factory.registerGenerator('gen1', { register: jest.fn(), generate: gen1 });
        factory.registerGenerator('gen2', { register: jest.fn(), generate: gen2 });

        const results = await factory.runAll();

        expect(gen1).toHaveBeenCalled();
        expect(gen2).toHaveBeenCalled();
        expect(results.get('gen1').success).toBe(true);
        expect(results.get('gen2').success).toBe(true);
      });

      test('returns results for each generator', async () => {
        factory.registerGenerator('success', {
          register: jest.fn(),
          generate: jest.fn(),
        });
        factory.registerGenerator('fail', {
          register: jest.fn(),
          generate: () => {
            throw new Error('Failed');
          },
        });

        const results = await factory.runAll();

        expect(results.get('success').success).toBe(true);
        expect(results.get('fail').success).toBe(false);
      });
    });

    describe('runParallel', () => {
      test('runs generators in parallel', async () => {
        const factory = new GeneratorFactory();
        const order = [];

        factory.registerGenerator('slow', {
          register: jest.fn(),
          generate: async () => {
            await new Promise(r => setTimeout(r, 50));
            order.push('slow');
          },
        });

        factory.registerGenerator('fast', {
          register: jest.fn(),
          generate: async () => {
            await new Promise(r => setTimeout(r, 10));
            order.push('fast');
          },
        });

        const results = await factory.runParallel();

        // Fast should complete before slow
        expect(order[0]).toBe('fast');
        expect(order[1]).toBe('slow');
        expect(results.get('slow').success).toBe(true);
        expect(results.get('fast').success).toBe(true);
      });
    });

    describe('reset', () => {
      test('resets factory state', () => {
        const factory = new GeneratorFactory();
        factory.registerGenerator('test', { register: jest.fn(), generate: jest.fn() });
        factory.buildContext();

        factory.reset();

        // Registry should be recreated on next getRegistry call
        const r1 = factory.getRegistry();
        factory.reset();
        const r2 = factory.getRegistry();

        expect(r1).not.toBe(r2);
      });
    });
  });

  describe('BaseGenerator', () => {
    test('has default name from constructor', () => {
      class TestGenerator extends BaseGenerator {}
      const gen = new TestGenerator();
      expect(gen.name).toBe('TestGenerator');
    });

    test('accepts custom name', () => {
      const gen = new BaseGenerator({ name: 'CustomName' });
      expect(gen.name).toBe('CustomName');
    });

    test('addPlaceholder adds to list', () => {
      const gen = new BaseGenerator();
      const resolver = () => 'value';

      gen.addPlaceholder('TEST', resolver, { type: 'string' });

      expect(gen.placeholders).toHaveLength(1);
      expect(gen.placeholders[0].name).toBe('TEST');
    });

    test('register adds placeholders to registry', () => {
      const gen = new BaseGenerator();
      gen.addPlaceholder('TEST', () => 'value', { type: 'string' });

      const { PlaceholderRegistry } = require('../../lib/placeholder-registry');
      const registry = new PlaceholderRegistry();

      gen.register(registry);

      expect(registry.has('TEST')).toBe(true);
      expect(registry.resolve('TEST')).toBe('value');
    });

    test('generate throws by default', async () => {
      const gen = new BaseGenerator();
      await expect(gen.generate({})).rejects.toThrow('Subclass must implement');
    });
  });

  describe('createGeneratorFactory', () => {
    test('creates factory with options', () => {
      const factory = createGeneratorFactory();
      expect(factory).toBeInstanceOf(GeneratorFactory);
    });

    test('registers provided generators', () => {
      const factory = createGeneratorFactory({
        generators: {
          test: { register: jest.fn(), generate: jest.fn() },
        },
      });

      expect(factory.hasGenerator('test')).toBe(true);
    });
  });

  describe('getGeneratorFactory (singleton)', () => {
    test('returns same instance', () => {
      const f1 = getGeneratorFactory();
      const f2 = getGeneratorFactory();
      expect(f1).toBe(f2);
    });

    test('forceNew creates new instance', () => {
      const f1 = getGeneratorFactory();
      const f2 = getGeneratorFactory({ forceNew: true });
      expect(f1).not.toBe(f2);
    });
  });

  describe('integration: registry built once and passed', () => {
    test('all generators share same registry instance', () => {
      const factory = new GeneratorFactory();
      const registries = [];

      factory.registerGenerator('gen1', {
        register: registry => registries.push(registry),
        generate: jest.fn(),
      });

      factory.registerGenerator('gen2', {
        register: registry => registries.push(registry),
        generate: jest.fn(),
      });

      factory.buildContext();

      expect(registries).toHaveLength(2);
      expect(registries[0]).toBe(registries[1]);
    });

    test('generators can use each others placeholders', async () => {
      const factory = new GeneratorFactory();

      factory.registerGenerator('provider', {
        register: registry => {
          registry.register('SHARED_VALUE', () => 42, { type: 'count' });
        },
        generate: jest.fn(),
      });

      let capturedValue;
      factory.registerGenerator('consumer', {
        register: () => {},
        generate: ctx => {
          capturedValue = ctx.registry.resolve('SHARED_VALUE');
        },
      });

      await factory.runAll();

      expect(capturedValue).toBe(42);
    });
  });

  describe('integration: only factory needs modification for new types', () => {
    test('new placeholder types added via generator registration', () => {
      const factory = new GeneratorFactory();

      // Generator A adds command-related placeholders
      factory.registerGenerator('commands', {
        register: registry => {
          registry.register('CMD_COUNT', () => 10, {
            type: 'count',
            description: 'Command count',
          });
        },
        generate: jest.fn(),
      });

      // Generator B adds agent-related placeholders
      factory.registerGenerator('agents', {
        register: registry => {
          registry.register('AGENT_COUNT', () => 5, {
            type: 'count',
            description: 'Agent count',
          });
        },
        generate: jest.fn(),
      });

      // Building context triggers all registrations
      const context = factory.buildContext();

      // Both placeholders available
      expect(context.registry.resolve('CMD_COUNT')).toBe(10);
      expect(context.registry.resolve('AGENT_COUNT')).toBe(5);
    });
  });
});
