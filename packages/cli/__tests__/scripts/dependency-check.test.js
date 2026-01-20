/**
 * Tests for dependency-check.js - Dependency vulnerability checker
 */

const {
  parseArgs,
  filterBySeverity,
  formatResults,
  SEVERITY_LEVELS,
} = require('../../scripts/dependency-check');

describe('dependency-check', () => {
  describe('SEVERITY_LEVELS', () => {
    it('defines all severity levels in order', () => {
      expect(SEVERITY_LEVELS).toEqual(['low', 'moderate', 'high', 'critical']);
    });
  });

  describe('parseArgs', () => {
    it('returns defaults when no args provided', () => {
      const options = parseArgs([]);
      expect(options).toEqual({
        json: false,
        fix: false,
        force: false,
        severity: 'low',
        quiet: false,
        help: false,
      });
    });

    it('parses --json flag', () => {
      const options = parseArgs(['--json']);
      expect(options.json).toBe(true);
    });

    it('parses --fix flag', () => {
      const options = parseArgs(['--fix']);
      expect(options.fix).toBe(true);
    });

    it('parses --force flag', () => {
      const options = parseArgs(['--force']);
      expect(options.force).toBe(true);
    });

    it('parses --quiet flag', () => {
      const options = parseArgs(['--quiet']);
      expect(options.quiet).toBe(true);
    });

    it('parses --help flag', () => {
      const options = parseArgs(['--help']);
      expect(options.help).toBe(true);
    });

    it('parses -h flag', () => {
      const options = parseArgs(['-h']);
      expect(options.help).toBe(true);
    });

    it('parses --severity=low', () => {
      const options = parseArgs(['--severity=low']);
      expect(options.severity).toBe('low');
    });

    it('parses --severity=moderate', () => {
      const options = parseArgs(['--severity=moderate']);
      expect(options.severity).toBe('moderate');
    });

    it('parses --severity=high', () => {
      const options = parseArgs(['--severity=high']);
      expect(options.severity).toBe('high');
    });

    it('parses --severity=critical', () => {
      const options = parseArgs(['--severity=critical']);
      expect(options.severity).toBe('critical');
    });

    it('ignores invalid severity levels', () => {
      const options = parseArgs(['--severity=invalid']);
      expect(options.severity).toBe('low');
    });

    it('parses multiple flags', () => {
      const options = parseArgs(['--json', '--fix', '--severity=high', '--quiet']);
      expect(options.json).toBe(true);
      expect(options.fix).toBe(true);
      expect(options.severity).toBe('high');
      expect(options.quiet).toBe(true);
    });
  });

  describe('filterBySeverity', () => {
    const mockAudit = {
      metadata: { vulnerabilities: { total: 10 } },
      vulnerabilities: {
        'pkg-low': { severity: 'low', name: 'pkg-low' },
        'pkg-moderate': { severity: 'moderate', name: 'pkg-moderate' },
        'pkg-high': { severity: 'high', name: 'pkg-high' },
        'pkg-critical': { severity: 'critical', name: 'pkg-critical' },
      },
    };

    it('keeps all vulnerabilities when severity is low', () => {
      const filtered = filterBySeverity(mockAudit, 'low');
      expect(Object.keys(filtered.vulnerabilities)).toHaveLength(4);
    });

    it('filters out low when severity is moderate', () => {
      const filtered = filterBySeverity(mockAudit, 'moderate');
      expect(Object.keys(filtered.vulnerabilities)).toHaveLength(3);
      expect(filtered.vulnerabilities['pkg-low']).toBeUndefined();
    });

    it('filters out low and moderate when severity is high', () => {
      const filtered = filterBySeverity(mockAudit, 'high');
      expect(Object.keys(filtered.vulnerabilities)).toHaveLength(2);
      expect(filtered.vulnerabilities['pkg-low']).toBeUndefined();
      expect(filtered.vulnerabilities['pkg-moderate']).toBeUndefined();
    });

    it('keeps only critical when severity is critical', () => {
      const filtered = filterBySeverity(mockAudit, 'critical');
      expect(Object.keys(filtered.vulnerabilities)).toHaveLength(1);
      expect(filtered.vulnerabilities['pkg-critical']).toBeDefined();
    });

    it('handles empty vulnerabilities', () => {
      const audit = { metadata: {}, vulnerabilities: {} };
      const filtered = filterBySeverity(audit, 'low');
      expect(filtered.vulnerabilities).toEqual({});
    });

    it('preserves metadata', () => {
      const filtered = filterBySeverity(mockAudit, 'high');
      expect(filtered.metadata).toEqual(mockAudit.metadata);
    });
  });

  describe('formatResults', () => {
    it('shows success message when no vulnerabilities', () => {
      const audit = {
        metadata: { vulnerabilities: { total: 0 } },
        vulnerabilities: {},
      };
      const output = formatResults(audit, {});
      expect(output).toContain('No vulnerabilities found');
    });

    it('shows total count when vulnerabilities exist', () => {
      const audit = {
        metadata: {
          vulnerabilities: { total: 5, low: 2, moderate: 2, high: 1, critical: 0 },
        },
        vulnerabilities: {},
      };
      const output = formatResults(audit, {});
      expect(output).toContain('Vulnerabilities Found: 5');
    });

    it('shows breakdown by severity', () => {
      const audit = {
        metadata: {
          vulnerabilities: { total: 10, low: 3, moderate: 4, high: 2, critical: 1 },
        },
        vulnerabilities: {},
      };
      const output = formatResults(audit, {});
      expect(output).toContain('Critical: 1');
      expect(output).toContain('High: 2');
      expect(output).toContain('Moderate: 4');
      expect(output).toContain('Low: 3');
    });

    it('shows vulnerability details when not quiet', () => {
      const audit = {
        metadata: { vulnerabilities: { total: 1, high: 1 } },
        vulnerabilities: {
          'test-pkg': {
            severity: 'high',
            via: [{ title: 'Test vulnerability' }],
          },
        },
      };
      const output = formatResults(audit, { quiet: false });
      expect(output).toContain('[HIGH]');
      expect(output).toContain('test-pkg');
      expect(output).toContain('Test vulnerability');
    });

    it('hides details when quiet', () => {
      const audit = {
        metadata: { vulnerabilities: { total: 1, high: 1 } },
        vulnerabilities: {
          'test-pkg': {
            severity: 'high',
            via: [{ title: 'Test vulnerability' }],
          },
        },
      };
      const output = formatResults(audit, { quiet: true });
      expect(output).not.toContain('[HIGH]');
    });

    it('shows recommendations', () => {
      const audit = {
        metadata: { vulnerabilities: { total: 1, low: 1 } },
        vulnerabilities: {},
      };
      const output = formatResults(audit, {});
      expect(output).toContain('npm audit fix');
    });

    it('shows force recommendation for high/critical', () => {
      const audit = {
        metadata: { vulnerabilities: { total: 1, critical: 1 } },
        vulnerabilities: {},
      };
      const output = formatResults(audit, {});
      expect(output).toContain('--force');
    });
  });
});
