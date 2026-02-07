/**
 * Tests for scripts/lib/validation-registry.js
 *
 * Builder-validator pairing registry for quality gates.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

describe('validation-registry.js', () => {
  let testDir;
  let validationRegistry;

  beforeEach(() => {
    // Create temp directory
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agileflow-validation-registry-test-'));

    // Create metadata directory
    fs.mkdirSync(path.join(testDir, 'docs', '00-meta'), { recursive: true });

    // Reset require cache
    delete require.cache[require.resolve('../../scripts/lib/validation-registry')];
    validationRegistry = require('../../scripts/lib/validation-registry');
  });

  afterEach(() => {
    // Clean up test directory
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('getValidator()', () => {
    test('returns built-in validator for agileflow-api', () => {
      const validator = validationRegistry.getValidator('agileflow-api');

      expect(validator).toBe('agileflow-api-validator');
    });

    test('returns built-in validator for agileflow-ui', () => {
      const validator = validationRegistry.getValidator('agileflow-ui');

      expect(validator).toBe('agileflow-ui-validator');
    });

    test('returns built-in validator for agileflow-database', () => {
      const validator = validationRegistry.getValidator('agileflow-database');

      expect(validator).toBe('agileflow-schema-validator');
    });

    test('returns null for unknown builder', () => {
      const validator = validationRegistry.getValidator('unknown-agent');

      expect(validator).toBeNull();
    });

    test('returns validator from team template', () => {
      const teamTemplate = {
        teammates: [
          {
            agent: 'custom-builder',
            paired_validator: 'custom-validator',
          },
        ],
      };

      const validator = validationRegistry.getValidator('custom-builder', { teamTemplate });

      expect(validator).toBe('custom-validator');
    });

    test('returns validator from metadata overrides', () => {
      const metadataPath = path.join(testDir, 'docs', '00-meta', 'agileflow-metadata.json');
      const metadata = {
        validation_pairs: {
          'custom-builder': 'custom-validator',
        },
      };
      fs.writeFileSync(metadataPath, JSON.stringify(metadata));

      const validator = validationRegistry.getValidator('custom-builder', { rootDir: testDir });

      expect(validator).toBe('custom-validator');
    });

    test('team template takes priority over built-in', () => {
      const teamTemplate = {
        teammates: [
          {
            agent: 'agileflow-api',
            paired_validator: 'custom-api-validator',
          },
        ],
      };

      const validator = validationRegistry.getValidator('agileflow-api', { teamTemplate });

      expect(validator).toBe('custom-api-validator');
    });

    test('team template takes priority over metadata', () => {
      const teamTemplate = {
        teammates: [
          {
            agent: 'agileflow-api',
            paired_validator: 'template-validator',
          },
        ],
      };

      const metadataPath = path.join(testDir, 'docs', '00-meta', 'agileflow-metadata.json');
      const metadata = {
        validation_pairs: {
          'agileflow-api': 'metadata-validator',
        },
      };
      fs.mkdirSync(path.dirname(metadataPath), { recursive: true });
      fs.writeFileSync(metadataPath, JSON.stringify(metadata));

      const validator = validationRegistry.getValidator('agileflow-api', {
        rootDir: testDir,
        teamTemplate,
      });

      expect(validator).toBe('template-validator');
    });

    test('handles malformed metadata gracefully', () => {
      const metadataPath = path.join(testDir, 'docs', '00-meta', 'agileflow-metadata.json');
      fs.writeFileSync(metadataPath, 'invalid json {]');

      const validator = validationRegistry.getValidator('agileflow-api', { rootDir: testDir });

      expect(validator).toBe('agileflow-api-validator');
    });
  });

  describe('requiresValidation()', () => {
    test('returns false when validator not required', () => {
      const result = validationRegistry.requiresValidation('agileflow-api', { rootDir: testDir });

      expect(result).toBe(false);
    });

    test('returns true when team template requires validation', () => {
      const teamTemplate = {
        quality_gates: {
          task_completed: {
            require_validator_approval: true,
          },
        },
        teammates: [
          {
            agent: 'agileflow-api',
            paired_validator: 'agileflow-api-validator',
          },
        ],
      };

      const result = validationRegistry.requiresValidation('agileflow-api', { teamTemplate });

      expect(result).toBe(true);
    });

    test('returns true when metadata requires validation', () => {
      const metadataPath = path.join(testDir, 'docs', '00-meta', 'agileflow-metadata.json');
      const metadata = {
        quality_gates: {
          task_completed: {
            require_validator_approval: true,
          },
        },
      };
      fs.writeFileSync(metadataPath, JSON.stringify(metadata));

      const result = validationRegistry.requiresValidation('agileflow-api', { rootDir: testDir });

      expect(result).toBe(true);
    });

    test('returns false for builder without validator', () => {
      const teamTemplate = {
        quality_gates: {
          task_completed: {
            require_validator_approval: true,
          },
        },
        teammates: [
          {
            agent: 'some-other-agent',
            // No paired_validator
          },
        ],
      };

      const result = validationRegistry.requiresValidation('unknown-agent', { teamTemplate });

      expect(result).toBe(false);
    });

    test('metadata overrides take priority', () => {
      const teamTemplate = {
        quality_gates: {
          task_completed: {
            require_validator_approval: false,
          },
        },
      };

      const metadataPath = path.join(testDir, 'docs', '00-meta', 'agileflow-metadata.json');
      const metadata = {
        quality_gates: {
          task_completed: {
            require_validator_approval: true,
          },
        },
      };
      fs.writeFileSync(metadataPath, JSON.stringify(metadata));

      const result = validationRegistry.requiresValidation('agileflow-api', {
        rootDir: testDir,
        teamTemplate,
      });

      expect(result).toBe(true);
    });
  });

  describe('isValidatorApproved()', () => {
    test('returns true when approval found in bus log', () => {
      const busLogPath = path.join(testDir, 'docs', '09-agents', 'bus', 'log.jsonl');
      fs.mkdirSync(path.dirname(busLogPath), { recursive: true });

      const messages = [
        JSON.stringify({
          from: 'agileflow-api-validator',
          type: 'validation',
          task_id: 'US-0001',
          status: 'approved',
          at: new Date().toISOString(),
        }),
      ];
      fs.writeFileSync(busLogPath, messages.join('\n'));

      const result = validationRegistry.isValidatorApproved('US-0001', 'agileflow-api-validator', {
        rootDir: testDir,
      });

      expect(result).toBe(true);
    });

    test('returns false when approval not found', () => {
      const busLogPath = path.join(testDir, 'docs', '09-agents', 'bus', 'log.jsonl');
      fs.mkdirSync(path.dirname(busLogPath), { recursive: true });

      const messages = [
        JSON.stringify({
          from: 'agileflow-api-validator',
          type: 'validation',
          task_id: 'US-0002',
          status: 'approved',
          at: new Date().toISOString(),
        }),
      ];
      fs.writeFileSync(busLogPath, messages.join('\n'));

      const result = validationRegistry.isValidatorApproved('US-0001', 'agileflow-api-validator', {
        rootDir: testDir,
      });

      expect(result).toBe(false);
    });

    test('returns false when approval is rejection', () => {
      const busLogPath = path.join(testDir, 'docs', '09-agents', 'bus', 'log.jsonl');
      fs.mkdirSync(path.dirname(busLogPath), { recursive: true });

      const messages = [
        JSON.stringify({
          from: 'agileflow-api-validator',
          type: 'validation',
          task_id: 'US-0001',
          status: 'rejected',
          at: new Date().toISOString(),
        }),
      ];
      fs.writeFileSync(busLogPath, messages.join('\n'));

      const result = validationRegistry.isValidatorApproved('US-0001', 'agileflow-api-validator', {
        rootDir: testDir,
      });

      expect(result).toBe(false);
    });

    test('searches from most recent messages first', () => {
      const busLogPath = path.join(testDir, 'docs', '09-agents', 'bus', 'log.jsonl');
      fs.mkdirSync(path.dirname(busLogPath), { recursive: true });

      const messages = [];
      for (let i = 0; i < 150; i++) {
        messages.push(JSON.stringify({
          from: 'some-agent',
          type: 'msg',
          at: new Date().toISOString(),
        }));
      }
      // Add approval at end
      messages.push(JSON.stringify({
        from: 'agileflow-api-validator',
        type: 'validation',
        task_id: 'US-0001',
        status: 'approved',
        at: new Date().toISOString(),
      }));
      fs.writeFileSync(busLogPath, messages.join('\n'));

      const result = validationRegistry.isValidatorApproved('US-0001', 'agileflow-api-validator', {
        rootDir: testDir,
      });

      expect(result).toBe(true);
    });

    test('ignores malformed messages', () => {
      const busLogPath = path.join(testDir, 'docs', '09-agents', 'bus', 'log.jsonl');
      fs.mkdirSync(path.dirname(busLogPath), { recursive: true });

      const lines = [
        'malformed line',
        JSON.stringify({
          from: 'agileflow-api-validator',
          type: 'validation',
          task_id: 'US-0001',
          status: 'approved',
          at: new Date().toISOString(),
        }),
      ];
      fs.writeFileSync(busLogPath, lines.join('\n'));

      const result = validationRegistry.isValidatorApproved('US-0001', 'agileflow-api-validator', {
        rootDir: testDir,
      });

      expect(result).toBe(true);
    });

    test('returns false when bus log missing', () => {
      const result = validationRegistry.isValidatorApproved('US-0001', 'agileflow-api-validator', {
        rootDir: testDir,
      });

      expect(result).toBe(false);
    });

    test('returns false when rootDir not provided', () => {
      const result = validationRegistry.isValidatorApproved('US-0001', 'agileflow-api-validator', {});

      expect(result).toBe(false);
    });
  });

  describe('getAllPairs()', () => {
    test('returns built-in pairs', () => {
      const pairs = validationRegistry.getAllPairs();

      expect(pairs['agileflow-api']).toBe('agileflow-api-validator');
      expect(pairs['agileflow-ui']).toBe('agileflow-ui-validator');
      expect(pairs['agileflow-database']).toBe('agileflow-schema-validator');
    });

    test('merges team template pairs', () => {
      const teamTemplate = {
        teammates: [
          {
            agent: 'custom-builder',
            paired_validator: 'custom-validator',
          },
        ],
      };

      const pairs = validationRegistry.getAllPairs({ teamTemplate });

      expect(pairs['agileflow-api']).toBe('agileflow-api-validator');
      expect(pairs['custom-builder']).toBe('custom-validator');
    });

    test('merges metadata overrides', () => {
      const metadataPath = path.join(testDir, 'docs', '00-meta', 'agileflow-metadata.json');
      const metadata = {
        validation_pairs: {
          'agileflow-api': 'override-api-validator',
          'new-builder': 'new-validator',
        },
      };
      fs.writeFileSync(metadataPath, JSON.stringify(metadata));

      const pairs = validationRegistry.getAllPairs({ rootDir: testDir });

      expect(pairs['agileflow-api']).toBe('override-api-validator');
      expect(pairs['new-builder']).toBe('new-validator');
    });

    test('metadata overrides take priority', () => {
      const teamTemplate = {
        teammates: [
          {
            agent: 'agileflow-api',
            paired_validator: 'template-validator',
          },
        ],
      };

      const metadataPath = path.join(testDir, 'docs', '00-meta', 'agileflow-metadata.json');
      const metadata = {
        validation_pairs: {
          'agileflow-api': 'metadata-validator',
        },
      };
      fs.writeFileSync(metadataPath, JSON.stringify(metadata));

      const pairs = validationRegistry.getAllPairs({ rootDir: testDir, teamTemplate });

      expect(pairs['agileflow-api']).toBe('metadata-validator');
    });

    test('handles malformed metadata gracefully', () => {
      const metadataPath = path.join(testDir, 'docs', '00-meta', 'agileflow-metadata.json');
      fs.writeFileSync(metadataPath, 'invalid json {]');

      const pairs = validationRegistry.getAllPairs({ rootDir: testDir });

      // Should still return built-in pairs
      expect(pairs['agileflow-api']).toBe('agileflow-api-validator');
    });
  });

  describe('BUILT_IN_PAIRS', () => {
    test('is a public constant', () => {
      expect(validationRegistry.BUILT_IN_PAIRS).toBeDefined();
      expect(typeof validationRegistry.BUILT_IN_PAIRS).toBe('object');
    });

    test('contains expected pairs', () => {
      expect(validationRegistry.BUILT_IN_PAIRS['agileflow-api']).toBe('agileflow-api-validator');
      expect(validationRegistry.BUILT_IN_PAIRS['agileflow-ui']).toBe('agileflow-ui-validator');
      expect(validationRegistry.BUILT_IN_PAIRS['agileflow-database']).toBe('agileflow-schema-validator');
    });
  });

  describe('Integration scenarios', () => {
    test('complex validation workflow', () => {
      // Set up metadata with custom pairs and requirements
      const metadataPath = path.join(testDir, 'docs', '00-meta', 'agileflow-metadata.json');
      const metadata = {
        quality_gates: {
          task_completed: {
            require_validator_approval: true,
          },
        },
        validation_pairs: {
          'agileflow-api': 'api-validator-v2',
        },
      };
      fs.writeFileSync(metadataPath, JSON.stringify(metadata));

      // Set up bus log with approval
      const busLogPath = path.join(testDir, 'docs', '09-agents', 'bus', 'log.jsonl');
      fs.mkdirSync(path.dirname(busLogPath), { recursive: true });
      const messages = [
        JSON.stringify({
          from: 'api-validator-v2',
          type: 'validation',
          task_id: 'US-0001',
          status: 'approved',
          at: new Date().toISOString(),
        }),
      ];
      fs.writeFileSync(busLogPath, messages.join('\n'));

      // Verify workflow
      expect(validationRegistry.requiresValidation('agileflow-api', { rootDir: testDir })).toBe(true);
      expect(validationRegistry.getValidator('agileflow-api', { rootDir: testDir })).toBe(
        'api-validator-v2'
      );
      expect(
        validationRegistry.isValidatorApproved('US-0001', 'api-validator-v2', { rootDir: testDir })
      ).toBe(true);
    });

    test('team template with custom validators', () => {
      const teamTemplate = {
        quality_gates: {
          task_completed: {
            require_validator_approval: true,
          },
        },
        teammates: [
          {
            agent: 'agileflow-api',
            role: 'Backend',
            paired_validator: 'team-api-validator',
          },
          {
            agent: 'agileflow-ui',
            role: 'Frontend',
            paired_validator: 'team-ui-validator',
          },
        ],
      };

      expect(validationRegistry.requiresValidation('agileflow-api', { teamTemplate })).toBe(true);
      expect(validationRegistry.getValidator('agileflow-api', { teamTemplate })).toBe(
        'team-api-validator'
      );
      expect(validationRegistry.getValidator('agileflow-ui', { teamTemplate })).toBe(
        'team-ui-validator'
      );
    });
  });
});
