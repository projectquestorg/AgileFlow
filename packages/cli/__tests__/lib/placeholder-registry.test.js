'use strict';

/**
 * Tests for PlaceholderRegistry - Content Injection Security & Extensibility
 */

const path = require('path');
const fs = require('fs');

describe('PlaceholderRegistry', () => {
  const modulePath = path.join(__dirname, '../../lib/placeholder-registry.js');

  describe('File Structure', () => {
    test('placeholder-registry.js exists', () => {
      expect(fs.existsSync(modulePath)).toBe(true);
    });
  });

  describe('Module Exports', () => {
    let module;

    beforeAll(() => {
      module = require('../../lib/placeholder-registry');
    });

    test('exports PlaceholderRegistry class', () => {
      expect(typeof module.PlaceholderRegistry).toBe('function');
    });

    test('exports RESOLVER_TYPES constant', () => {
      expect(typeof module.RESOLVER_TYPES).toBe('object');
    });

    test('exports createCountResolver function', () => {
      expect(typeof module.createCountResolver).toBe('function');
    });

    test('exports createListResolver function', () => {
      expect(typeof module.createListResolver).toBe('function');
    });

    test('exports createStaticResolver function', () => {
      expect(typeof module.createStaticResolver).toBe('function');
    });

    test('exports createDefaultRegistry function', () => {
      expect(typeof module.createDefaultRegistry).toBe('function');
    });

    test('exports getRegistry function', () => {
      expect(typeof module.getRegistry).toBe('function');
    });

    test('exports resetRegistry function', () => {
      expect(typeof module.resetRegistry).toBe('function');
    });
  });

  describe('RESOLVER_TYPES', () => {
    let RESOLVER_TYPES;

    beforeAll(() => {
      RESOLVER_TYPES = require('../../lib/placeholder-registry').RESOLVER_TYPES;
    });

    test('has count type', () => {
      expect(RESOLVER_TYPES.count).toBeDefined();
      expect(typeof RESOLVER_TYPES.count.sanitizer).toBe('function');
    });

    test('has string type', () => {
      expect(RESOLVER_TYPES.string).toBeDefined();
      expect(typeof RESOLVER_TYPES.string.sanitizer).toBe('function');
    });

    test('has list type', () => {
      expect(RESOLVER_TYPES.list).toBeDefined();
      expect(typeof RESOLVER_TYPES.list.sanitizer).toBe('function');
    });

    test('has date type', () => {
      expect(RESOLVER_TYPES.date).toBeDefined();
      expect(typeof RESOLVER_TYPES.date.sanitizer).toBe('function');
    });

    test('has version type', () => {
      expect(RESOLVER_TYPES.version).toBeDefined();
      expect(typeof RESOLVER_TYPES.version.sanitizer).toBe('function');
    });

    test('has markdown type', () => {
      expect(RESOLVER_TYPES.markdown).toBeDefined();
      expect(typeof RESOLVER_TYPES.markdown.sanitizer).toBe('function');
    });

    test('has folderName type', () => {
      expect(RESOLVER_TYPES.folderName).toBeDefined();
      expect(typeof RESOLVER_TYPES.folderName.sanitizer).toBe('function');
    });
  });

  describe('PlaceholderRegistry Class', () => {
    let PlaceholderRegistry;
    let registry;

    beforeAll(() => {
      PlaceholderRegistry = require('../../lib/placeholder-registry').PlaceholderRegistry;
    });

    beforeEach(() => {
      registry = new PlaceholderRegistry();
    });

    test('inherits from EventEmitter', () => {
      const EventEmitter = require('events');
      expect(registry instanceof EventEmitter).toBe(true);
    });

    test('creates with default options', () => {
      expect(registry.cacheEnabled).toBe(true);
      expect(registry.strictMode).toBe(true);
      expect(registry.secureByDefault).toBe(true);
    });

    test('creates with custom options', () => {
      const r = new PlaceholderRegistry({
        cache: false,
        strict: false,
        secure: false,
      });

      expect(r.cacheEnabled).toBe(false);
      expect(r.strictMode).toBe(false);
      expect(r.secureByDefault).toBe(false);
    });
  });

  describe('Placeholder Registration', () => {
    let PlaceholderRegistry;
    let registry;

    beforeAll(() => {
      PlaceholderRegistry = require('../../lib/placeholder-registry').PlaceholderRegistry;
    });

    beforeEach(() => {
      registry = new PlaceholderRegistry();
    });

    test('register adds placeholder', () => {
      registry.register('TEST_PLACEHOLDER', () => 'value');

      expect(registry.has('TEST_PLACEHOLDER')).toBe(true);
    });

    test('register returns registry for chaining', () => {
      const result = registry.register('TEST', () => 'value');

      expect(result).toBe(registry);
    });

    test('register throws on invalid name', () => {
      expect(() => registry.register('', () => 'value')).toThrow();
      expect(() => registry.register(123, () => 'value')).toThrow();
    });

    test('register throws on invalid resolver', () => {
      expect(() => registry.register('TEST', 'not a function')).toThrow();
      expect(() => registry.register('TEST', null)).toThrow();
    });

    test('register validates name format', () => {
      // Valid formats
      expect(() => registry.register('UPPER_CASE', () => '')).not.toThrow();
      expect(() => registry.register('lower-case', () => '')).not.toThrow();

      // Invalid formats
      expect(() => registry.register('Mixed_Case', () => '')).toThrow();
    });

    test('register with configuration', () => {
      registry.register('TEST', () => 42, {
        type: 'count',
        description: 'Test counter',
        secure: false,
        cacheable: false,
      });

      const config = registry.getConfig('TEST');

      expect(config.type).toBe('count');
      expect(config.description).toBe('Test counter');
      expect(config.secure).toBe(false);
      expect(config.cacheable).toBe(false);
    });

    test('register emits registered event', done => {
      registry.once('registered', event => {
        expect(event.name).toBe('MY_PLACEHOLDER');
        done();
      });

      registry.register('MY_PLACEHOLDER', () => 'value');
    });
  });

  describe('Placeholder Unregistration', () => {
    let PlaceholderRegistry;
    let registry;

    beforeAll(() => {
      PlaceholderRegistry = require('../../lib/placeholder-registry').PlaceholderRegistry;
    });

    beforeEach(() => {
      registry = new PlaceholderRegistry({ strict: false });
      registry.register('TEST', () => 'value', { source: 'plugin' });
    });

    test('unregister removes placeholder', () => {
      expect(registry.has('TEST')).toBe(true);

      const result = registry.unregister('TEST');

      expect(result).toBe(true);
      expect(registry.has('TEST')).toBe(false);
    });

    test('unregister returns false for unknown', () => {
      const result = registry.unregister('NONEXISTENT');
      expect(result).toBe(false);
    });

    test('unregister emits unregistered event', done => {
      registry.once('unregistered', event => {
        expect(event.name).toBe('TEST');
        done();
      });

      registry.unregister('TEST');
    });

    test('unregister prevents removal of builtin in strict mode', () => {
      const strictRegistry = new PlaceholderRegistry({ strict: true });
      strictRegistry.register('BUILTIN', () => '', { source: 'builtin' });

      expect(() => strictRegistry.unregister('BUILTIN')).toThrow();
    });
  });

  describe('Placeholder Resolution', () => {
    let PlaceholderRegistry;
    let registry;

    beforeAll(() => {
      PlaceholderRegistry = require('../../lib/placeholder-registry').PlaceholderRegistry;
    });

    beforeEach(() => {
      registry = new PlaceholderRegistry();
    });

    test('resolve returns resolver result', () => {
      registry.register('TEST', () => 'hello');

      const result = registry.resolve('TEST');

      expect(result).toBe('hello');
    });

    test('resolve passes context to resolver', () => {
      registry.register('CONTEXTUAL', ctx => ctx.value, { type: 'count' });

      const result = registry.resolve('CONTEXTUAL', { value: 42 });

      expect(result).toBe(42);
    });

    test('resolve merges global and local context', () => {
      registry.setContext({ global: 'g' });
      registry.register('MERGED', ctx => `${ctx.global}-${ctx.local}`);

      const result = registry.resolve('MERGED', { local: 'l' });

      expect(result).toBe('g-l');
    });

    test('resolve throws on unknown in strict mode', () => {
      expect(() => registry.resolve('UNKNOWN')).toThrow();
    });

    test('resolve returns empty on unknown in non-strict mode', () => {
      const r = new PlaceholderRegistry({ strict: false });
      const result = r.resolve('UNKNOWN');

      expect(result).toBe('');
    });

    test('resolve caches results', () => {
      let callCount = 0;
      registry.register('CACHED', () => {
        callCount++;
        return 'value';
      });

      registry.resolve('CACHED');
      registry.resolve('CACHED');

      expect(callCount).toBe(1);
    });

    test('resolve skips cache when disabled', () => {
      let callCount = 0;
      const r = new PlaceholderRegistry({ cache: false });
      r.register('UNCACHED', () => {
        callCount++;
        return 'value';
      });

      r.resolve('UNCACHED');
      r.resolve('UNCACHED');

      expect(callCount).toBe(2);
    });

    test('resolve applies sanitization', () => {
      registry.register('COUNT', () => '42invalid', { type: 'count' });

      const result = registry.resolve('COUNT');

      expect(result).toBe(42); // Sanitized to number
    });

    test('resolve emits resolved event', done => {
      registry.register('EVENT_TEST', () => 'value');

      registry.once('resolved', event => {
        expect(event.name).toBe('EVENT_TEST');
        expect(event.value).toBe('value');
        done();
      });

      registry.resolve('EVENT_TEST');
    });

    test('resolve handles resolver errors', () => {
      registry.register(
        'ERROR_TEST',
        () => {
          throw new Error('Test error');
        },
        { type: 'count' }
      );

      const result = registry.resolve('ERROR_TEST');

      expect(result).toBe(0); // Default value for count type
    });
  });

  describe('Content Injection', () => {
    let PlaceholderRegistry;
    let registry;

    beforeAll(() => {
      PlaceholderRegistry = require('../../lib/placeholder-registry').PlaceholderRegistry;
    });

    beforeEach(() => {
      registry = new PlaceholderRegistry();
      registry.register('NAME', () => 'World');
      registry.register('COUNT', () => 42, { type: 'count' });
      registry.register('lower-case', () => 'lowercase');
    });

    test('inject replaces {{PLACEHOLDER}} format', () => {
      const result = registry.inject('Hello {{NAME}}!');
      expect(result).toBe('Hello World!');
    });

    test('inject replaces <!-- {{PLACEHOLDER}} --> format', () => {
      const result = registry.inject('<!-- {{NAME}} -->');
      expect(result).toBe('World');
    });

    test('inject replaces {placeholder} format', () => {
      const result = registry.inject('Value: {lower-case}');
      expect(result).toBe('Value: lowercase');
    });

    test('inject handles multiple placeholders', () => {
      const result = registry.inject('{{NAME}} = {{COUNT}}');
      expect(result).toBe('World = 42');
    });

    test('inject keeps unknown placeholders', () => {
      const result = registry.inject('{{UNKNOWN}}');
      expect(result).toBe('{{UNKNOWN}}');
    });

    test('inject returns empty for null content', () => {
      expect(registry.inject(null)).toBe('');
      expect(registry.inject(undefined)).toBe('');
    });
  });

  describe('Plugin System', () => {
    let PlaceholderRegistry;
    let registry;

    beforeAll(() => {
      PlaceholderRegistry = require('../../lib/placeholder-registry').PlaceholderRegistry;
    });

    beforeEach(() => {
      registry = new PlaceholderRegistry({ strict: false });
    });

    test('extend loads plugin', () => {
      const plugin = {
        register: api => {
          api.register('TEST', () => 'plugin value');
        },
      };

      registry.extend('myplugin', plugin);

      expect(registry.has('myplugin_TEST')).toBe(true);
    });

    test('extend prefixes plugin placeholders', () => {
      const plugin = {
        register: api => {
          api.register('VALUE', () => 'test');
        },
      };

      registry.extend('prefix', plugin);

      expect(registry.has('prefix_VALUE')).toBe(true);
      expect(registry.has('VALUE')).toBe(false);
    });

    test('extend marks placeholders as plugin source', () => {
      const plugin = {
        register: api => {
          api.register('ITEM', () => 'test');
        },
      };

      registry.extend('src', plugin);

      const config = registry.getConfig('src_ITEM');
      expect(config.source).toBe('plugin');
    });

    test('extend throws on duplicate plugin', () => {
      const plugin = { register: () => {} };

      registry.extend('dup', plugin);

      expect(() => registry.extend('dup', plugin)).toThrow();
    });

    test('extend throws on invalid plugin', () => {
      expect(() => registry.extend('bad', {})).toThrow();
      expect(() => registry.extend('bad', null)).toThrow();
    });

    test('extend emits pluginLoaded event', done => {
      const plugin = { register: () => {} };

      registry.once('pluginLoaded', event => {
        expect(event.pluginName).toBe('event-test');
        done();
      });

      registry.extend('event-test', plugin);
    });

    test('removePlugin removes plugin placeholders', () => {
      const plugin = {
        register: api => {
          api.register('A', () => 'a');
          api.register('B', () => 'b');
        },
      };

      registry.extend('removetest', plugin);
      expect(registry.has('removetest_A')).toBe(true);
      expect(registry.has('removetest_B')).toBe(true);

      const result = registry.removePlugin('removetest');

      expect(result).toBe(true);
      expect(registry.has('removetest_A')).toBe(false);
      expect(registry.has('removetest_B')).toBe(false);
    });

    test('removePlugin returns false for unknown plugin', () => {
      const result = registry.removePlugin('nonexistent');
      expect(result).toBe(false);
    });
  });

  describe('Cache Management', () => {
    let PlaceholderRegistry;
    let registry;

    beforeAll(() => {
      PlaceholderRegistry = require('../../lib/placeholder-registry').PlaceholderRegistry;
    });

    beforeEach(() => {
      registry = new PlaceholderRegistry();
    });

    test('clearCache clears all cache', () => {
      let callCount = 0;
      registry.register('TEST', () => ++callCount);

      registry.resolve('TEST');
      expect(callCount).toBe(1);

      registry.clearCache();
      registry.resolve('TEST');
      expect(callCount).toBe(2);
    });

    test('clearCache clears specific placeholder', () => {
      let count1 = 0,
        count2 = 0;
      registry.register('ONE', () => ++count1);
      registry.register('TWO', () => ++count2);

      registry.resolve('ONE');
      registry.resolve('TWO');

      registry.clearCache('ONE');

      registry.resolve('ONE');
      registry.resolve('TWO');

      expect(count1).toBe(2); // Cleared
      expect(count2).toBe(1); // Still cached
    });

    test('setContext clears cache', () => {
      let callCount = 0;
      registry.register('CONTEXT', ctx => {
        callCount++;
        return ctx.val;
      });

      registry.resolve('CONTEXT', { val: 1 });
      expect(callCount).toBe(1);

      registry.setContext({ val: 2 });
      registry.resolve('CONTEXT', { val: 2 });
      expect(callCount).toBe(2);
    });
  });

  describe('Query Methods', () => {
    let PlaceholderRegistry;
    let registry;

    beforeAll(() => {
      PlaceholderRegistry = require('../../lib/placeholder-registry').PlaceholderRegistry;
    });

    beforeEach(() => {
      registry = new PlaceholderRegistry();
      registry.register('A', () => '', { description: 'Placeholder A' });
      registry.register('B', () => '', { description: 'Placeholder B' });
    });

    test('has returns true for registered', () => {
      expect(registry.has('A')).toBe(true);
    });

    test('has returns false for unregistered', () => {
      expect(registry.has('UNKNOWN')).toBe(false);
    });

    test('getConfig returns configuration', () => {
      const config = registry.getConfig('A');

      expect(config.name).toBe('A');
      expect(config.description).toBe('Placeholder A');
    });

    test('getConfig returns null for unknown', () => {
      const config = registry.getConfig('UNKNOWN');
      expect(config).toBeNull();
    });

    test('getNames returns all names', () => {
      const names = registry.getNames();

      expect(names).toContain('A');
      expect(names).toContain('B');
    });

    test('getDocs returns documentation', () => {
      const docs = registry.getDocs();

      expect(docs.A).toBeDefined();
      expect(docs.A.description).toBe('Placeholder A');
      expect(docs.B).toBeDefined();
    });
  });

  describe('Default Registry', () => {
    let createDefaultRegistry, resetRegistry;

    beforeAll(() => {
      const mod = require('../../lib/placeholder-registry');
      createDefaultRegistry = mod.createDefaultRegistry;
      resetRegistry = mod.resetRegistry;
    });

    beforeEach(() => {
      resetRegistry();
    });

    test('creates registry with built-in placeholders', () => {
      const registry = createDefaultRegistry();

      expect(registry.has('COMMAND_COUNT')).toBe(true);
      expect(registry.has('AGENT_COUNT')).toBe(true);
      expect(registry.has('SKILL_COUNT')).toBe(true);
      expect(registry.has('VERSION')).toBe(true);
      expect(registry.has('INSTALL_DATE')).toBe(true);
      expect(registry.has('AGENT_LIST')).toBe(true);
      expect(registry.has('COMMAND_LIST')).toBe(true);
      expect(registry.has('agileflow_folder')).toBe(true);
      expect(registry.has('project-root')).toBe(true);
    });

    test('built-in resolvers use context', () => {
      const registry = createDefaultRegistry();

      const count = registry.resolve('COMMAND_COUNT', { commandCount: 42 });
      expect(count).toBe(42);

      const version = registry.resolve('VERSION', { version: '1.2.3' });
      expect(version).toBe('1.2.3');
    });
  });

  describe('Singleton Pattern', () => {
    let getRegistry, resetRegistry;

    beforeAll(() => {
      const mod = require('../../lib/placeholder-registry');
      getRegistry = mod.getRegistry;
      resetRegistry = mod.resetRegistry;
    });

    beforeEach(() => {
      resetRegistry();
    });

    test('getRegistry returns same instance', () => {
      const r1 = getRegistry();
      const r2 = getRegistry();

      expect(r1).toBe(r2);
    });

    test('getRegistry with forceNew creates new instance', () => {
      const r1 = getRegistry();
      const r2 = getRegistry({ forceNew: true });

      expect(r1).not.toBe(r2);
    });

    test('resetRegistry clears singleton', () => {
      const r1 = getRegistry();
      resetRegistry();
      const r2 = getRegistry();

      expect(r1).not.toBe(r2);
    });
  });

  describe('Helper Functions', () => {
    let createCountResolver, createListResolver, createStaticResolver;

    beforeAll(() => {
      const mod = require('../../lib/placeholder-registry');
      createCountResolver = mod.createCountResolver;
      createListResolver = mod.createListResolver;
      createStaticResolver = mod.createStaticResolver;
    });

    test('createCountResolver creates count resolver', () => {
      const resolver = createCountResolver(() => 5);
      expect(resolver({})).toBe(5);
    });

    test('createCountResolver handles errors', () => {
      const resolver = createCountResolver(() => {
        throw new Error('fail');
      });
      expect(resolver({})).toBe(0);
    });

    test('createListResolver creates list resolver', () => {
      const resolver = createListResolver(() => 'list content');
      expect(resolver({})).toBe('list content');
    });

    test('createListResolver handles errors', () => {
      const resolver = createListResolver(() => {
        throw new Error('fail');
      });
      expect(resolver({})).toBe('');
    });

    test('createStaticResolver creates static resolver', () => {
      const resolver = createStaticResolver('static value');
      expect(resolver()).toBe('static value');
    });
  });

  describe('Security', () => {
    let PlaceholderRegistry;
    let registry;

    beforeAll(() => {
      PlaceholderRegistry = require('../../lib/placeholder-registry').PlaceholderRegistry;
    });

    beforeEach(() => {
      registry = new PlaceholderRegistry();
    });

    test('detects injection attempts in resolved values', done => {
      registry.register('INJECT_TEST', () => '$(dangerous command)', {
        type: 'string',
      });

      registry.once('injectionAttempt', event => {
        expect(event.name).toBe('INJECT_TEST');
        done();
      });

      registry.resolve('INJECT_TEST');
    });

    test('returns default value on injection detection', () => {
      registry.register('INJECT_TEST', () => '$(dangerous)', {
        type: 'string',
      });

      const result = registry.resolve('INJECT_TEST');

      expect(result).toBe(''); // Default for string type
    });

    test('skips security check when secure=false', () => {
      registry.register('UNSAFE', () => '$(command)', {
        type: 'string',
        secure: false,
      });

      const result = registry.resolve('UNSAFE');

      expect(result).toBe('$(command)');
    });
  });

  describe('Module Structure', () => {
    test('placeholder-registry.js contains required elements', () => {
      const content = fs.readFileSync(modulePath, 'utf8');

      // Check for class definition
      expect(content).toContain('class PlaceholderRegistry extends EventEmitter');

      // Check for registration methods
      expect(content).toContain('register(name, resolver, config');
      expect(content).toContain('unregister(name)');

      // Check for resolution methods
      expect(content).toContain('resolve(name, context');
      expect(content).toContain('inject(content, context');

      // Check for plugin system
      expect(content).toContain('extend(pluginName, plugin');
      expect(content).toContain('removePlugin(pluginName)');

      // Check for cache management
      expect(content).toContain('clearCache(');
      expect(content).toContain('setContext(');

      // Check for security
      expect(content).toContain('detectInjectionAttempt');
      expect(content).toContain('sanitize');

      // Check for events
      expect(content).toContain("emit('registered'");
      expect(content).toContain("emit('unregistered'");
      expect(content).toContain("emit('resolved'");
      expect(content).toContain("emit('pluginLoaded'");
    });
  });
});
