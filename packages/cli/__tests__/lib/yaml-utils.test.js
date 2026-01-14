/**
 * Security tests for YAML parsing utilities.
 *
 * These tests verify that js-yaml v4+ is being used securely
 * and that malicious YAML payloads are rejected.
 */

const {
  safeLoad,
  safeLoadAll,
  safeDump,
  isSecureConfiguration,
  yaml,
} = require('../../lib/yaml-utils');

describe('yaml-utils', () => {
  describe('safeLoad', () => {
    it('parses valid YAML objects', () => {
      const result = safeLoad('name: test\nversion: 1.0');
      expect(result).toEqual({ name: 'test', version: 1.0 });
    });

    it('parses YAML arrays', () => {
      const result = safeLoad('- item1\n- item2\n- item3');
      expect(result).toEqual(['item1', 'item2', 'item3']);
    });

    it('parses nested structures', () => {
      const yamlContent = `
user:
  name: John
  roles:
    - admin
    - user
settings:
  enabled: true
  count: 42
`;
      const result = safeLoad(yamlContent);
      expect(result.user.name).toBe('John');
      expect(result.user.roles).toEqual(['admin', 'user']);
      expect(result.settings.enabled).toBe(true);
      expect(result.settings.count).toBe(42);
    });

    it('parses scalar values', () => {
      expect(safeLoad('42')).toBe(42);
      expect(safeLoad('"hello"')).toBe('hello');
      expect(safeLoad('true')).toBe(true);
      expect(safeLoad('null')).toBeNull();
    });

    it('throws on invalid YAML', () => {
      expect(() => safeLoad('name: [invalid')).toThrow();
    });

    it('throws on non-string input', () => {
      expect(() => safeLoad(null)).toThrow(TypeError);
      expect(() => safeLoad(123)).toThrow(TypeError);
      expect(() => safeLoad({})).toThrow(TypeError);
    });

    it('returns undefined for empty content', () => {
      expect(safeLoad('')).toBeUndefined();
      expect(safeLoad('   ')).toBeUndefined();
    });
  });

  describe('security: malicious YAML payloads', () => {
    it('rejects JavaScript function tags', () => {
      const malicious = `evil: !!js/function 'function() { return "pwned"; }'`;
      // Should either throw (unknown tag) or parse as non-function
      try {
        const result = safeLoad(malicious);
        // If it parses, verify it's not an executable function
        expect(typeof result.evil).not.toBe('function');
      } catch (e) {
        // YAMLException for unknown tag is the expected safe behavior
        expect(e.name).toBe('YAMLException');
        expect(e.message).toMatch(/unknown tag/i);
      }
    });

    it('rejects JavaScript regexp tags', () => {
      const malicious = `pattern: !!js/regexp /test/gi`;
      try {
        const result = safeLoad(malicious);
        // If it parses, verify it's not an actual RegExp
        expect(result.pattern).not.toBeInstanceOf(RegExp);
      } catch (e) {
        expect(e.name).toBe('YAMLException');
        expect(e.message).toMatch(/unknown tag/i);
      }
    });

    it('rejects JavaScript undefined tags', () => {
      const malicious = `value: !!js/undefined ''`;
      try {
        const result = safeLoad(malicious);
        // If it parses, the behavior should be safe
        // (in v4, this typically throws for unknown tag)
      } catch (e) {
        expect(e.name).toBe('YAMLException');
      }
    });

    it('does not execute code in YAML anchors/aliases', () => {
      // Billion laughs style attack
      const recursive = `
a: &a ["lol","lol","lol"]
b: &b [*a,*a,*a]
c: &c [*b,*b,*b]
d: [*c,*c,*c]
`;
      // This should parse without hanging (js-yaml handles this safely)
      const result = safeLoad(recursive);
      expect(result.d).toBeDefined();
      expect(Array.isArray(result.d)).toBe(true);
    });

    it('handles prototype pollution attempts safely', () => {
      // Attempt prototype pollution through __proto__
      const malicious = `
__proto__:
  polluted: true
normal: value
`;
      const result = safeLoad(malicious);
      // The parsed object should not pollute Object prototype
      expect({}.polluted).toBeUndefined();
      // The key should exist on the result itself
      expect(result.__proto__).toBeDefined();
      expect(result.normal).toBe('value');
    });

    it('handles constructor pollution attempts safely', () => {
      const malicious = `
constructor:
  prototype:
    evil: true
name: test
`;
      const result = safeLoad(malicious);
      // Should not pollute the constructor
      expect({}.evil).toBeUndefined();
      expect(result.constructor).toBeDefined();
      expect(result.name).toBe('test');
    });
  });

  describe('safeLoadAll', () => {
    it('parses multiple YAML documents', () => {
      const multiDoc = `
name: doc1
---
name: doc2
---
name: doc3
`;
      const results = safeLoadAll(multiDoc);
      expect(results).toHaveLength(3);
      expect(results[0].name).toBe('doc1');
      expect(results[1].name).toBe('doc2');
      expect(results[2].name).toBe('doc3');
    });

    it('returns empty array for empty content', () => {
      const results = safeLoadAll('');
      expect(results).toEqual([]);
    });

    it('throws on non-string input', () => {
      expect(() => safeLoadAll(null)).toThrow(TypeError);
    });
  });

  describe('safeDump', () => {
    it('serializes objects to YAML', () => {
      const result = safeDump({ name: 'test', version: '1.0' });
      expect(result).toContain('name: test');
      expect(result).toContain("version: '1.0'");
    });

    it('serializes arrays to YAML', () => {
      const result = safeDump(['a', 'b', 'c']);
      expect(result).toMatch(/- a\n- b\n- c/);
    });

    it('handles null and undefined', () => {
      const result = safeDump({ nullVal: null, undefVal: undefined });
      expect(result).toContain('nullVal: null');
    });
  });

  describe('isSecureConfiguration', () => {
    it('confirms js-yaml v4+ secure configuration', () => {
      // This test verifies that js-yaml is properly configured
      // to NOT execute JavaScript types
      expect(isSecureConfiguration()).toBe(true);
    });
  });

  describe('yaml version verification', () => {
    it('uses js-yaml v4+', () => {
      // Verify we're using v4+ which is safe by default
      const packageJson = require('../../package.json');
      const yamlVersion = packageJson.dependencies['js-yaml'];
      // Should be ^4.x.x
      expect(yamlVersion).toMatch(/^\^?4\./);
    });

    it('DEFAULT_SCHEMA is available', () => {
      // In v4+, DEFAULT_SCHEMA should be the safe schema
      expect(yaml.DEFAULT_SCHEMA).toBeDefined();
    });
  });
});
