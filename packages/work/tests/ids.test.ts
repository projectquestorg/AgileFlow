import { describe, expect, it } from 'vitest';
import {
  CROCKFORD_ALPHABET,
  createDecisionId,
  createEpicId,
  createId,
  createStoryId,
  DECISION_ID_RE,
  EPIC_ID_RE,
  normalizeIdInput,
  randomSuffix,
  resolvePartialId,
  STORY_ID_RE,
} from '@agileflow/work';

describe('collision-resistant IDs', () => {
  it('creates TYPE-XXXXXXXX with 8 Crockford Base32 characters', () => {
    expect(createEpicId()).toMatch(EPIC_ID_RE);
    expect(createStoryId()).toMatch(STORY_ID_RE);
    expect(createDecisionId()).toMatch(DECISION_ID_RE);
    for (let i = 0; i < 2000; i++) {
      const s = randomSuffix();
      expect(s).toHaveLength(8);
      for (const ch of s) expect(CROCKFORD_ALPHABET).toContain(ch);
      expect(s).not.toMatch(/[ILOU]/);
    }
  });

  it('encodes exactly 40 random bits', () => {
    expect(randomSuffix(() => Buffer.alloc(5, 0))).toBe('00000000');
    expect(randomSuffix(() => Buffer.alloc(5, 0xff))).toBe('ZZZZZZZZ');
    expect(randomSuffix(() => Buffer.from([0, 0, 0, 0, 1]))).toBe('00000001');
  });

  it('generates large sets without collisions and never reuses an existing id', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 50_000; i++) {
      const id = createId('story', seen);
      expect(seen.has(id)).toBe(false);
      seen.add(id);
    }
    expect(seen.size).toBe(50_000);
  });

  it('no counter: independent generators (branches, worktrees, agents) do not produce sequences', () => {
    const a = Array.from({ length: 200 }, () => createStoryId());
    const b = Array.from({ length: 200 }, () => createStoryId());
    expect(new Set([...a, ...b]).size).toBe(400);
    expect(a.some((id) => /STORY-0+\d{1,3}$/.test(id))).toBe(false);
  });
});

describe('partial IDs', () => {
  const ids = ['STORY-3Q7MX2PK', 'STORY-3Q8AAAAA', 'EPIC-7M4K2P9Q', 'DEC-4C8M2Q7K', 'STORY-H5D2V8NA'];

  it('resolves a unique prefix of the random part, with or without the type prefix', () => {
    expect(resolvePartialId('3Q7M', ids)).toBe('STORY-3Q7MX2PK');
    expect(resolvePartialId('STORY-3Q7', ids)).toBe('STORY-3Q7MX2PK');
    expect(resolvePartialId('7m4k', ids)).toBe('EPIC-7M4K2P9Q');
    expect(resolvePartialId('STORY-3Q7MX2PK', ids)).toBe('STORY-3Q7MX2PK');
    expect(resolvePartialId('dec-4c', ids)).toBe('DEC-4C8M2Q7K');
  });

  it('only resolves when unique', () => {
    expect(() => resolvePartialId('3Q', ids)).toThrow(/ambiguous: it matches 2/);
    expect(() => resolvePartialId('ZZZZ', ids)).toThrow(/No work item matches/);
    expect(() => resolvePartialId('', ids)).toThrow(/required/);
    // A bare type prefix never selects "the only epic".
    expect(() => resolvePartialId('EPIC-', ids)).toThrow(/only a type prefix/);
    expect(() => resolvePartialId('dec-', ids, 'decision')).toThrow(/only a type prefix/);
  });

  it('can be restricted to one type', () => {
    expect(() => resolvePartialId('7M4K', ids, 'story')).toThrow(/No story work item/);
    expect(resolvePartialId('7M4K', ids, 'epic')).toBe('EPIC-7M4K2P9Q');
  });

  it('maps Crockford look-alikes typed by humans', () => {
    expect(normalizeIdInput('h5d2v8na')).toBe('H5D2V8NA');
    expect(normalizeIdInput('story-io1l')).toBe('STORY-1011');
    expect(resolvePartialId('H5D2V8NA', ids)).toBe('STORY-H5D2V8NA');
  });
});
