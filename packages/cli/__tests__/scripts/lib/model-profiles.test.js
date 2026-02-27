/**
 * Tests for model-profiles.js
 */

const {
  resolveModel,
  isValidModel,
  estimateCost,
  VALID_MODELS,
} = require('../../../scripts/lib/model-profiles');

describe('model-profiles', () => {
  describe('VALID_MODELS', () => {
    it('contains haiku, sonnet, opus', () => {
      expect(VALID_MODELS).toContain('haiku');
      expect(VALID_MODELS).toContain('sonnet');
      expect(VALID_MODELS).toContain('opus');
      expect(VALID_MODELS).toHaveLength(3);
    });
  });

  describe('resolveModel', () => {
    it('returns explicit model when provided', () => {
      expect(resolveModel('opus', 'haiku')).toBe('opus');
    });

    it('returns frontmatter model when no explicit model', () => {
      expect(resolveModel(null, 'sonnet')).toBe('sonnet');
    });

    it('returns haiku fallback when nothing provided', () => {
      expect(resolveModel(null, null)).toBe('haiku');
      expect(resolveModel(undefined, undefined)).toBe('haiku');
    });

    it('explicit model takes precedence over frontmatter', () => {
      expect(resolveModel('opus', 'sonnet')).toBe('opus');
    });

    it('is case-insensitive', () => {
      expect(resolveModel('OPUS', 'haiku')).toBe('opus');
      expect(resolveModel('Sonnet', null)).toBe('sonnet');
    });

    it('ignores invalid explicit model', () => {
      expect(resolveModel('gpt4', 'sonnet')).toBe('sonnet');
    });

    it('ignores invalid frontmatter model', () => {
      expect(resolveModel(null, 'claude-3')).toBe('haiku');
    });

    it('ignores invalid both and falls back to haiku', () => {
      expect(resolveModel('invalid', 'also-invalid')).toBe('haiku');
    });

    it('handles empty strings', () => {
      expect(resolveModel('', '')).toBe('haiku');
      expect(resolveModel('', 'sonnet')).toBe('sonnet');
    });
  });

  describe('isValidModel', () => {
    it('returns true for valid models', () => {
      expect(isValidModel('haiku')).toBe(true);
      expect(isValidModel('sonnet')).toBe(true);
      expect(isValidModel('opus')).toBe(true);
    });

    it('is case-insensitive', () => {
      expect(isValidModel('HAIKU')).toBe(true);
      expect(isValidModel('Sonnet')).toBe(true);
    });

    it('returns false for invalid models', () => {
      expect(isValidModel('gpt4')).toBe(false);
      expect(isValidModel('')).toBe(false);
      expect(isValidModel(null)).toBe(false);
      expect(isValidModel(undefined)).toBe(false);
    });
  });

  describe('estimateCost', () => {
    it('returns 1x multiplier for haiku', () => {
      const result = estimateCost('haiku', 5);
      expect(result.multiplier).toBe(1);
      expect(result.model).toBe('haiku');
    });

    it('returns higher multiplier for sonnet', () => {
      const result = estimateCost('sonnet', 5);
      expect(result.multiplier).toBeGreaterThan(1);
      expect(result.model).toBe('sonnet');
    });

    it('returns highest multiplier for opus', () => {
      const result = estimateCost('opus', 5);
      expect(result.multiplier).toBeGreaterThan(10);
      expect(result.model).toBe('opus');
    });

    it('resolves invalid model to haiku', () => {
      const result = estimateCost('invalid', 5);
      expect(result.multiplier).toBe(1);
      expect(result.model).toBe('haiku');
    });

    it('includes perAnalyzerCost and totalEstimate strings', () => {
      const result = estimateCost('sonnet', 8);
      expect(result.perAnalyzerCost).toMatch(/^\$/);
      expect(result.totalEstimate).toMatch(/^~\$/);
    });

    it('defaults to 5 analyzers', () => {
      const result5 = estimateCost('haiku', 5);
      const resultDefault = estimateCost('haiku');
      expect(result5.totalEstimate).toBe(resultDefault.totalEstimate);
    });
  });
});
