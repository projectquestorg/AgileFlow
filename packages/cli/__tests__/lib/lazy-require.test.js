/**
 * Tests for lazy-require utility
 */

const { lazyRequire } = require('../../lib/lazy-require');

describe('lazyRequire', () => {
  it('returns a function', () => {
    const getter = lazyRequire('path');
    expect(typeof getter).toBe('function');
  });

  it('resolves a built-in module on first call', () => {
    const getPath = lazyRequire('path');
    const result = getPath();
    expect(result).toBe(require('path'));
  });

  it('caches the result across calls', () => {
    const getPath = lazyRequire('path');
    const first = getPath();
    const second = getPath();
    expect(first).toBe(second);
  });

  it('tries fallback paths when primary fails', () => {
    // 'nonexistent-primary' will fail, but 'fs' should resolve
    const getFs = lazyRequire('nonexistent-primary-xyz-999', 'fs');
    const result = getFs();
    expect(result).toBe(require('fs'));
  });

  it('throws descriptive error when all paths fail', () => {
    const getBogus = lazyRequire('totally-nonexistent-pkg-xyz-999');
    expect(() => getBogus()).toThrow('totally-nonexistent-pkg-xyz-999 not found');
    expect(() => getBogus()).toThrow('npm install');
  });

  it('does not call require() at creation time', () => {
    // If this threw, it would mean require() happened eagerly
    const getter = lazyRequire('nonexistent-at-creation-time-xyz-999');
    expect(typeof getter).toBe('function');
    // Only throws when actually invoked
    expect(() => getter()).toThrow();
  });

  it('each getter has independent cache', () => {
    const getPath = lazyRequire('path');
    const getFs = lazyRequire('fs');
    expect(getPath()).toBe(require('path'));
    expect(getFs()).toBe(require('fs'));
    expect(getPath()).not.toBe(getFs());
  });
});
