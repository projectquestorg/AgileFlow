/**
 * Unit tests for the hook chain ordering.
 */
import { describe, it, expect } from 'vitest';

import chainModule from '../../../src/runtime/hooks/chain.js';

const { orderChain } = chainModule;

/**
 * @param {string} id
 * @param {string[]} [runAfter]
 */
function h(id, runAfter = []) {
  return {
    id,
    event: 'SessionStart',
    script: `hooks/${id}.js`,
    runAfter,
    timeout: 5000,
    skipOnError: true,
    enabled: true,
  };
}

describe('orderChain', () => {
  it('preserves declaration order when there are no runAfter constraints', () => {
    const ordered = orderChain([h('a'), h('b'), h('c')]);
    expect(ordered.map((x) => x.id)).toEqual(['a', 'b', 'c']);
  });

  it('places dependencies before dependents', () => {
    const ordered = orderChain([h('end', ['middle']), h('middle', ['start']), h('start')]);
    expect(ordered.map((x) => x.id)).toEqual(['start', 'middle', 'end']);
  });

  it('handles a diamond dependency (D after B and C; both after A)', () => {
    const ordered = orderChain([
      h('A'),
      h('B', ['A']),
      h('C', ['A']),
      h('D', ['B', 'C']),
    ]);
    const idx = (id) => ordered.findIndex((x) => x.id === id);
    expect(idx('A')).toBeLessThan(idx('B'));
    expect(idx('A')).toBeLessThan(idx('C'));
    expect(idx('B')).toBeLessThan(idx('D'));
    expect(idx('C')).toBeLessThan(idx('D'));
  });

  it('throws on a 2-node cycle with the full path', () => {
    expect(() => orderChain([h('a', ['b']), h('b', ['a'])])).toThrow(
      /cycle detected: a -> b -> a/,
    );
  });

  it('throws on a 3-node cycle', () => {
    expect(() =>
      orderChain([h('a', ['b']), h('b', ['c']), h('c', ['a'])]),
    ).toThrow(/cycle detected: a -> b -> c -> a/);
  });

  it('throws on direct self-reference', () => {
    expect(() => orderChain([h('a', ['a'])])).toThrow(/cycle detected: a -> a/);
  });

  it('throws when runAfter references a hook that does not exist in this chain', () => {
    expect(() => orderChain([h('a', ['phantom'])])).toThrow(
      /runAfter references unknown hook "phantom"/,
    );
  });

  it('returns an empty array for an empty input', () => {
    expect(orderChain([])).toEqual([]);
  });

  it('handles a single hook with empty runAfter', () => {
    const ordered = orderChain([h('only')]);
    expect(ordered.map((x) => x.id)).toEqual(['only']);
  });
});
