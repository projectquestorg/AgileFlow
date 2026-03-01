/**
 * Tests for audit-registry.js
 */

const {
  AUDIT_TYPES,
  getAuditType,
  getAuditTypeKeys,
  getAnalyzersForAudit,
  getAnalyzerCounts,
} = require('../../../scripts/lib/audit-registry');

describe('audit-registry', () => {
  describe('AUDIT_TYPES', () => {
    it('defines all 8 audit types', () => {
      const keys = Object.keys(AUDIT_TYPES);
      expect(keys).toContain('logic');
      expect(keys).toContain('security');
      expect(keys).toContain('performance');
      expect(keys).toContain('test');
      expect(keys).toContain('completeness');
      expect(keys).toContain('brainstorm');
      expect(keys).toContain('ideate');
      expect(keys).toContain('legal');
      expect(keys).toHaveLength(8);
    });

    it('each type has required fields', () => {
      for (const [key, type] of Object.entries(AUDIT_TYPES)) {
        expect(type.name).toBeTruthy();
        expect(type.prefix).toBeTruthy();
        expect(type.color).toMatch(/^#[0-9a-f]{6}$/i);
        expect(type.command).toBeTruthy();
        expect(type.analyzers).toBeTruthy();
        // ideate has no consensus coordinator (synthesis is done inline)
        if (key !== 'ideate') {
          expect(type.consensus).toBeTruthy();
          expect(type.consensus.subagent_type).toBeTruthy();
        }
        expect(Array.isArray(type.quick_analyzers)).toBe(true);
        expect(Array.isArray(type.deep_analyzers)).toBe(true);
      }
    });

    it('quick analyzers are subset of deep analyzers', () => {
      for (const [key, type] of Object.entries(AUDIT_TYPES)) {
        for (const qa of type.quick_analyzers) {
          expect(type.deep_analyzers).toContain(qa);
        }
      }
    });

    it('all analyzer keys exist in analyzers map', () => {
      for (const [key, type] of Object.entries(AUDIT_TYPES)) {
        const allKeys = [...new Set([...type.quick_analyzers, ...type.deep_analyzers])];
        for (const ak of allKeys) {
          expect(type.analyzers[ak]).toBeTruthy();
          expect(type.analyzers[ak].subagent_type).toBeTruthy();
          expect(type.analyzers[ak].label).toBeTruthy();
        }
      }
    });
  });

  describe('getAuditType', () => {
    it('returns config for valid type', () => {
      const security = getAuditType('security');
      expect(security).toBeTruthy();
      expect(security.name).toBe('Security Vulnerability');
      expect(security.prefix).toBe('Sec');
    });

    it('returns null for invalid type', () => {
      expect(getAuditType('invalid')).toBeNull();
      expect(getAuditType('')).toBeNull();
    });
  });

  describe('getAuditTypeKeys', () => {
    it('returns all 8 type keys', () => {
      const keys = getAuditTypeKeys();
      expect(keys).toHaveLength(8);
      expect(keys).toContain('logic');
      expect(keys).toContain('security');
      expect(keys).toContain('brainstorm');
      expect(keys).toContain('ideate');
    });
  });

  describe('getAnalyzersForAudit', () => {
    it('returns quick analyzers by default', () => {
      const result = getAnalyzersForAudit('security', 'quick');
      expect(result.analyzers).toHaveLength(5);
      expect(result.analyzers.map(a => a.key)).toContain('injection');
    });

    it('returns all analyzers for deep depth', () => {
      const result = getAnalyzersForAudit('security', 'deep');
      expect(result.analyzers).toHaveLength(8);
      expect(result.analyzers.map(a => a.key)).toContain('deps');
    });

    it('ultradeep returns same analyzers as deep', () => {
      const deep = getAnalyzersForAudit('security', 'deep');
      const ultradeep = getAnalyzersForAudit('security', 'ultradeep');
      expect(ultradeep.analyzers).toHaveLength(deep.analyzers.length);
    });

    it('filters by focus', () => {
      const result = getAnalyzersForAudit('security', 'deep', ['injection', 'auth']);
      expect(result.analyzers).toHaveLength(2);
      expect(result.analyzers[0].key).toBe('injection');
      expect(result.analyzers[1].key).toBe('auth');
    });

    it('focus=all returns all for depth', () => {
      const result = getAnalyzersForAudit('security', 'deep', ['all']);
      expect(result.analyzers).toHaveLength(8);
    });

    it('includes consensus coordinator', () => {
      const result = getAnalyzersForAudit('security', 'quick');
      expect(result.consensus.subagent_type).toBe('security-consensus');
    });

    it('returns null for invalid type', () => {
      expect(getAnalyzersForAudit('invalid', 'quick')).toBeNull();
    });

    it('includes deep-only analyzers when explicitly focused', () => {
      const result = getAnalyzersForAudit('security', 'quick', ['deps']);
      expect(result.analyzers.map(a => a.key)).toContain('deps');
    });

    it('each analyzer has subagent_type and label', () => {
      const result = getAnalyzersForAudit('logic', 'deep');
      for (const analyzer of result.analyzers) {
        expect(analyzer.key).toBeTruthy();
        expect(analyzer.subagent_type).toBeTruthy();
        expect(analyzer.label).toBeTruthy();
      }
    });
  });

  describe('getAnalyzerCounts', () => {
    it('returns counts for logic', () => {
      const counts = getAnalyzerCounts('logic');
      expect(counts.quick).toBe(5);
      expect(counts.deep).toBe(5);
      expect(counts.total).toBe(5);
    });

    it('returns counts for security', () => {
      const counts = getAnalyzerCounts('security');
      expect(counts.quick).toBe(5);
      expect(counts.deep).toBe(8);
      expect(counts.total).toBe(8);
    });

    it('returns counts for legal', () => {
      const counts = getAnalyzerCounts('legal');
      expect(counts.quick).toBe(5);
      expect(counts.deep).toBe(9);
      expect(counts.total).toBe(9);
    });

    it('returns null for invalid type', () => {
      expect(getAnalyzerCounts('invalid')).toBeNull();
    });
  });

  describe('agent name validation', () => {
    it('audit analyzer subagent_types follow naming convention', () => {
      for (const [typeKey, type] of Object.entries(AUDIT_TYPES)) {
        if (typeKey === 'ideate') continue; // ideate uses agileflow-* domain experts
        for (const [key, analyzer] of Object.entries(type.analyzers)) {
          // Should match pattern: type-analyzer-name (allows alphanumeric in name)
          expect(analyzer.subagent_type).toMatch(/^[a-z]+-[a-z]+-[a-z0-9]+$/);
        }
        // Consensus should match pattern
        expect(type.consensus.subagent_type).toMatch(/^[a-z]+-consensus$/);
      }
    });

    it('ideate subagent_types follow agileflow-* convention', () => {
      const ideate = AUDIT_TYPES.ideate;
      for (const [key, analyzer] of Object.entries(ideate.analyzers)) {
        expect(analyzer.subagent_type).toMatch(/^agileflow-[a-z]+$/);
      }
      // ideate has no consensus coordinator
      expect(ideate.consensus).toBeNull();
    });
  });

  describe('brainstorm audit type', () => {
    it('has 3 quick and 5 deep analyzers', () => {
      const counts = getAnalyzerCounts('brainstorm');
      expect(counts.quick).toBe(3);
      expect(counts.deep).toBe(5);
      expect(counts.total).toBe(5);
    });

    it('returns correct analyzers for brainstorm', () => {
      const result = getAnalyzersForAudit('brainstorm', 'quick');
      expect(result.analyzers).toHaveLength(3);
      expect(result.analyzers.map(a => a.key)).toContain('features');
      expect(result.analyzers.map(a => a.key)).toContain('ux');
      expect(result.analyzers.map(a => a.key)).toContain('market');
    });

    it('has brainstorm-consensus coordinator', () => {
      const result = getAnalyzersForAudit('brainstorm', 'quick');
      expect(result.consensus.subagent_type).toBe('brainstorm-consensus');
    });
  });

  describe('ideate audit type', () => {
    it('has 6 quick and 13 deep analyzers', () => {
      const counts = getAnalyzerCounts('ideate');
      expect(counts.quick).toBe(6);
      expect(counts.deep).toBe(13);
      expect(counts.total).toBe(13);
    });

    it('returns correct experts for ideation', () => {
      const result = getAnalyzersForAudit('ideate', 'quick');
      expect(result.analyzers).toHaveLength(6);
      expect(result.analyzers.map(a => a.key)).toContain('security');
      expect(result.analyzers.map(a => a.key)).toContain('performance');
    });

    it('ultradeep returns all 13 experts', () => {
      const result = getAnalyzersForAudit('ideate', 'ultradeep');
      expect(result.analyzers).toHaveLength(13);
      expect(result.analyzers.map(a => a.key)).toContain('accessibility');
      expect(result.analyzers.map(a => a.key)).toContain('documentation');
    });

    it('supports focus filtering', () => {
      const result = getAnalyzersForAudit('ideate', 'deep', ['security', 'api', 'testing']);
      expect(result.analyzers).toHaveLength(3);
    });
  });
});
