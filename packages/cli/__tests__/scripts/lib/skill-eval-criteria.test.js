/**
 * Tests for skill-eval-criteria.js
 *
 * Tests cover:
 * - DEFAULT_CRITERIA structure and validity
 * - getCriteria() - merging defaults with custom, override behavior
 * - validateCriteria() - normalization, filtering invalid entries
 * - scoreOutput() - binary scoring, weight handling, edge cases
 * - identifyWeaknesses() - failure rate computation, sorting
 * - generateEvalPrompt() - prompt generation structure
 */

const {
  DEFAULT_CRITERIA,
  VALID_CATEGORIES,
  getCriteria,
  validateCriteria,
  scoreOutput,
  identifyWeaknesses,
  generateEvalPrompt,
} = require('../../../scripts/lib/skill-eval-criteria');

describe('skill-eval-criteria', () => {
  describe('DEFAULT_CRITERIA', () => {
    it('has at least 5 default criteria', () => {
      expect(DEFAULT_CRITERIA.length).toBeGreaterThanOrEqual(5);
    });

    it('each criterion has required fields', () => {
      for (const c of DEFAULT_CRITERIA) {
        expect(c).toHaveProperty('id');
        expect(c).toHaveProperty('question');
        expect(c).toHaveProperty('weight');
        expect(c).toHaveProperty('category');
        expect(typeof c.id).toBe('string');
        expect(typeof c.question).toBe('string');
        expect(c.weight).toBeGreaterThanOrEqual(1);
        expect(c.weight).toBeLessThanOrEqual(5);
        expect(VALID_CATEGORIES).toContain(c.category);
      }
    });

    it('has unique IDs', () => {
      const ids = DEFAULT_CRITERIA.map(c => c.id);
      expect(new Set(ids).size).toBe(ids.length);
    });
  });

  describe('getCriteria', () => {
    it('returns default criteria when no options', () => {
      const criteria = getCriteria();
      expect(criteria.length).toBe(DEFAULT_CRITERIA.length);
    });

    it('merges custom criteria with defaults', () => {
      const custom = [
        { id: 'my-criterion', question: 'Is it good?', weight: 2, category: 'custom' },
      ];
      const criteria = getCriteria({ customCriteria: custom });
      expect(criteria.length).toBe(DEFAULT_CRITERIA.length + 1);
      expect(criteria.find(c => c.id === 'my-criterion')).toBeDefined();
    });

    it('custom criteria can override defaults by ID', () => {
      const custom = [
        { id: 'addresses-task', question: 'Custom override?', weight: 5, category: 'custom' },
      ];
      const criteria = getCriteria({ customCriteria: custom });
      expect(criteria.length).toBe(DEFAULT_CRITERIA.length);
      const overridden = criteria.find(c => c.id === 'addresses-task');
      expect(overridden.question).toBe('Custom override?');
      expect(overridden.weight).toBe(5);
    });

    it('excludes defaults when includeDefaults is false', () => {
      const custom = [{ id: 'only-this', question: 'Only?', weight: 1, category: 'custom' }];
      const criteria = getCriteria({ customCriteria: custom, includeDefaults: false });
      expect(criteria.length).toBe(1);
      expect(criteria[0].id).toBe('only-this');
    });

    it('returns empty array when includeDefaults is false and no custom', () => {
      const criteria = getCriteria({ includeDefaults: false });
      expect(criteria).toEqual([]);
    });
  });

  describe('validateCriteria', () => {
    it('filters out invalid entries', () => {
      const input = [
        null,
        undefined,
        { id: 'valid', question: 'Ok?' },
        { id: '', question: 'No id' },
        { question: 'No id field' },
        { id: 'no-question' },
        42,
      ];
      const result = validateCriteria(input);
      expect(result.length).toBe(1);
      expect(result[0].id).toBe('valid');
    });

    it('normalizes IDs to lowercase kebab-case', () => {
      const result = validateCriteria([{ id: 'My Criterion!', question: 'Q?' }]);
      expect(result[0].id).toBe('my-criterion-');
    });

    it('clamps weights to 1-5', () => {
      const result = validateCriteria([
        { id: 'low', question: 'Q?', weight: 0 },
        { id: 'high', question: 'Q?', weight: 10 },
        { id: 'normal', question: 'Q?', weight: 3 },
      ]);
      expect(result.find(c => c.id === 'low').weight).toBe(1);
      expect(result.find(c => c.id === 'high').weight).toBe(5);
      expect(result.find(c => c.id === 'normal').weight).toBe(3);
    });

    it('defaults invalid categories to custom', () => {
      const result = validateCriteria([{ id: 'x', question: 'Q?', category: 'invalid' }]);
      expect(result[0].category).toBe('custom');
    });

    it('returns empty for non-array input', () => {
      expect(validateCriteria(null)).toEqual([]);
      expect(validateCriteria('string')).toEqual([]);
      expect(validateCriteria(42)).toEqual([]);
    });
  });

  describe('scoreOutput', () => {
    const criteria = [
      { id: 'a', question: 'A?', weight: 2, category: 'quality' },
      { id: 'b', question: 'B?', weight: 1, category: 'quality' },
      { id: 'c', question: 'C?', weight: 3, category: 'quality' },
    ];

    it('scores all-yes as 100', () => {
      const answers = [
        { id: 'a', answer: true },
        { id: 'b', answer: true },
        { id: 'c', answer: true },
      ];
      const result = scoreOutput(answers, criteria);
      expect(result.score).toBe(100);
      expect(result.earned_weight).toBe(6);
      expect(result.total_weight).toBe(6);
    });

    it('scores all-no as 0', () => {
      const answers = [
        { id: 'a', answer: false },
        { id: 'b', answer: false },
        { id: 'c', answer: false },
      ];
      const result = scoreOutput(answers, criteria);
      expect(result.score).toBe(0);
      expect(result.earned_weight).toBe(0);
    });

    it('weights scores correctly', () => {
      // Only 'c' (weight 3) passes: 3/6 = 50%
      const answers = [
        { id: 'a', answer: false },
        { id: 'b', answer: false },
        { id: 'c', answer: true },
      ];
      const result = scoreOutput(answers, criteria);
      expect(result.score).toBe(50);
    });

    it('handles missing answers as unanswered (null)', () => {
      const answers = [{ id: 'a', answer: true }];
      const result = scoreOutput(answers, criteria);
      // 2/6 ≈ 33%
      expect(result.score).toBe(33);
      expect(result.answers.find(a => a.id === 'b').answer).toBeNull();
    });

    it('returns 0 for empty inputs', () => {
      expect(scoreOutput([], criteria).score).toBe(0);
      expect(scoreOutput([], []).score).toBe(0);
      expect(scoreOutput(null, null).score).toBe(0);
    });

    it('includes all criterion details in answers', () => {
      const answers = [{ id: 'a', answer: true }];
      const result = scoreOutput(answers, criteria);
      expect(result.answers).toHaveLength(3);
      expect(result.answers[0]).toHaveProperty('question');
      expect(result.answers[0]).toHaveProperty('weight');
      expect(result.answers[0]).toHaveProperty('category');
    });
  });

  describe('identifyWeaknesses', () => {
    it('identifies criteria with high failure rates', () => {
      const history = [
        {
          answers: [
            { id: 'a', answer: true },
            { id: 'b', answer: false },
          ],
        },
        {
          answers: [
            { id: 'a', answer: true },
            { id: 'b', answer: false },
          ],
        },
        {
          answers: [
            { id: 'a', answer: false },
            { id: 'b', answer: false },
          ],
        },
      ];
      const weaknesses = identifyWeaknesses(history);
      expect(weaknesses.length).toBe(2);
      // 'b' fails 100% of the time
      expect(weaknesses[0].id).toBe('b');
      expect(weaknesses[0].fail_rate).toBe(1);
      // 'a' fails 33% of the time
      expect(weaknesses[1].id).toBe('a');
      expect(weaknesses[1].fail_rate).toBeCloseTo(0.33, 1);
    });

    it('sorts by failure rate descending', () => {
      const history = [
        {
          answers: [
            { id: 'x', answer: false },
            { id: 'y', answer: true },
            { id: 'z', answer: false },
          ],
        },
        {
          answers: [
            { id: 'x', answer: true },
            { id: 'y', answer: false },
            { id: 'z', answer: false },
          ],
        },
      ];
      const weaknesses = identifyWeaknesses(history);
      expect(weaknesses[0].id).toBe('z'); // 100% fail
      expect(weaknesses[1].id).toBe('x'); // 50% fail
      expect(weaknesses[2].id).toBe('y'); // 50% fail
    });

    it('returns empty for empty history', () => {
      expect(identifyWeaknesses([])).toEqual([]);
      expect(identifyWeaknesses(null)).toEqual([]);
    });

    it('skips null answers', () => {
      const history = [
        {
          answers: [
            { id: 'a', answer: null },
            { id: 'b', answer: true },
          ],
        },
      ];
      const weaknesses = identifyWeaknesses(history);
      expect(weaknesses.length).toBe(1);
      expect(weaknesses[0].id).toBe('b');
    });
  });

  describe('generateEvalPrompt', () => {
    it('includes task, output, and criteria in prompt', () => {
      const criteria = [
        { id: 'test-1', question: 'Is it correct?', weight: 1, category: 'quality' },
      ];
      const prompt = generateEvalPrompt('Write a function', 'function foo() {}', criteria);
      expect(prompt).toContain('Write a function');
      expect(prompt).toContain('function foo() {}');
      expect(prompt).toContain('Is it correct?');
      expect(prompt).toContain('test-1');
      expect(prompt).toContain('yes');
      expect(prompt).toContain('no');
    });

    it('numbers criteria sequentially', () => {
      const criteria = [
        { id: 'a', question: 'Q1?', weight: 1, category: 'quality' },
        { id: 'b', question: 'Q2?', weight: 1, category: 'quality' },
      ];
      const prompt = generateEvalPrompt('task', 'output', criteria);
      expect(prompt).toContain('1. [a]');
      expect(prompt).toContain('2. [b]');
    });
  });
});
