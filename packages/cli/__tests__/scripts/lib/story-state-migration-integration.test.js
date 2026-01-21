/**
 * US-0169: Integration tests for story-state-machine + state-migrator
 *
 * Tests the interaction between:
 * - Schema migration (v1.0.0 → v2.0.0)
 * - Status transitions using the state machine
 * - Combined audit trail tracking
 */

const {
  VALID_STATUSES,
  isValidStatus,
  transition,
  batchTransition,
  getAuditTrail,
  clearAuditTrail,
} = require('../../../scripts/lib/story-state-machine');

const {
  migrate,
  detectSchemaVersion,
  needsMigration,
  validateSchema,
  getMigrationLog,
  clearMigrationLog,
  migrate_1_0_0_to_2_0_0,
} = require('../../../scripts/lib/state-migrator');

describe('story-state-migration-integration', () => {
  beforeEach(() => {
    clearAuditTrail();
    clearMigrationLog();
  });

  describe('migrate v1 schema then transition', () => {
    it('migrates v1 data and allows valid transitions', () => {
      // Start with v1.0.0 data (no schema_version, uses "todo" status)
      const v1Data = {
        stories: {
          'US-001': { title: 'Implement feature', status: 'todo' },
          'US-002': { title: 'Write tests', status: 'wip' },
          'US-003': { title: 'Deploy', status: 'done' },
        },
      };

      // Migrate to v2.0.0
      const migrationResult = migrate(v1Data);
      expect(migrationResult.migrated).toBe(true);
      expect(migrationResult.data.schema_version).toBe('2.0.0');

      // Verify status normalization
      expect(migrationResult.data.stories['US-001'].status).toBe('ready');
      expect(migrationResult.data.stories['US-002'].status).toBe('in_progress');
      expect(migrationResult.data.stories['US-003'].status).toBe('completed');

      // Now transition the migrated stories
      const story1 = { id: 'US-001', ...migrationResult.data.stories['US-001'] };
      const transitionResult = transition(story1, 'in_progress', { actor: 'dev1' });

      expect(transitionResult.success).toBe(true);
      expect(transitionResult.story.status).toBe('in_progress');
      expect(transitionResult.auditEntry.from_status).toBe('ready');
      expect(transitionResult.auditEntry.to_status).toBe('in_progress');
    });

    it('handles full workflow: migrate → transition → validate', () => {
      // v1 data with legacy statuses
      const v1Data = {
        stories: {
          'US-001': { title: 'Test story', status: 'pending' },
        },
      };

      // Step 1: Migrate
      const migrated = migrate(v1Data);
      expect(migrated.data.stories['US-001'].status).toBe('ready');

      // Step 2: Transition through workflow
      let story = { id: 'US-001', ...migrated.data.stories['US-001'], history: [] };

      // ready → in_progress
      let result = transition(story, 'in_progress');
      expect(result.success).toBe(true);
      story = result.story;

      // in_progress → in_review
      result = transition(story, 'in_review');
      expect(result.success).toBe(true);
      story = result.story;

      // in_review → completed
      result = transition(story, 'completed');
      expect(result.success).toBe(true);
      story = result.story;

      // Step 3: Validate final state
      expect(story.status).toBe('completed');
      expect(story.history).toHaveLength(3);

      // Verify audit trail
      const trail = getAuditTrail({ storyId: 'US-001' });
      expect(trail).toHaveLength(3);
    });

    it('handles multiple stories with different migration paths', () => {
      const v1Data = {
        stories: {
          'US-001': { title: 'Story 1', status: 'new' },
          'US-002': { title: 'Story 2', status: 'working' },
          'US-003': { title: 'Story 3', status: 'finished' },
          'US-004': { title: 'Story 4', status: 'ready' }, // Already valid
        },
      };

      const migrated = migrate(v1Data);

      // All should have valid statuses now
      Object.values(migrated.data.stories).forEach(story => {
        expect(isValidStatus(story.status)).toBe(true);
      });

      // Batch transition all ready stories to in_progress
      const readyStories = Object.entries(migrated.data.stories)
        .filter(([, s]) => s.status === 'ready')
        .map(([id, s]) => ({ id, ...s }));

      const batchResult = batchTransition(readyStories, 'in_progress');
      expect(batchResult.success).toBe(true);
    });
  });

  describe('audit trail captures both migration and transition', () => {
    it('migration log and transition audit are separate but complementary', () => {
      const v1Data = {
        stories: {
          'US-001': { title: 'Test', status: 'todo' },
        },
      };

      // Migrate
      migrate(v1Data);
      const migrationLog = getMigrationLog();

      // Migration log should have entries
      expect(migrationLog.length).toBeGreaterThan(0);
      expect(migrationLog.some(e => e.message.includes('1.0.0 to 2.0.0'))).toBe(true);

      // Transition audit should be empty (no transitions yet)
      expect(getAuditTrail()).toHaveLength(0);

      // Now transition
      const story = { id: 'US-001', status: 'ready' };
      transition(story, 'in_progress');

      // Transition audit should have one entry
      const auditTrail = getAuditTrail();
      expect(auditTrail).toHaveLength(1);
      expect(auditTrail[0].from_status).toBe('ready');
      expect(auditTrail[0].to_status).toBe('in_progress');
    });

    it('tracks complete history from migration through multiple transitions', () => {
      const v1Data = {
        stories: {
          'US-001': { title: 'Feature', status: 'open' }, // Will become 'ready'
        },
      };

      // Migrate and get migration info
      const migrationResult = migrate(v1Data);
      expect(migrationResult.data.migrated_from).toBe('1.0.0');
      expect(migrationResult.data.migrated_at).toBeDefined();

      // Track migration log count
      const migrationLogCount = getMigrationLog().length;
      expect(migrationLogCount).toBeGreaterThan(0);

      // Multiple transitions
      let story = { id: 'US-001', ...migrationResult.data.stories['US-001'], history: [] };

      transition(story, 'in_progress');
      story.status = 'in_progress';
      transition(story, 'blocked', { reason: 'Blocked by dependency' });
      story.status = 'blocked';
      transition(story, 'in_progress', { reason: 'Unblocked' });
      story.status = 'in_progress';
      transition(story, 'in_review');

      // Total audit entries should match transitions
      expect(getAuditTrail({ storyId: 'US-001' })).toHaveLength(4);

      // Migration log should be unchanged by transitions
      expect(getMigrationLog()).toHaveLength(migrationLogCount);
    });
  });

  describe('edge cases with unexpected states', () => {
    it('handles stories with completely unknown status', () => {
      const v1Data = {
        stories: {
          'US-001': { title: 'Test', status: 'garbage_status' },
        },
      };

      // Migration only normalizes known legacy statuses, unknown stays unchanged
      const migrated = migrate(v1Data);
      expect(migrated.data.stories['US-001'].status).toBe('garbage_status');

      // Validation should flag the invalid status
      const validation = validateSchema(migrated.data);
      expect(validation.valid).toBe(false);
      expect(validation.errors.some(e => e.includes('invalid status'))).toBe(true);
    });

    it('handles stories with null status', () => {
      const v1Data = {
        stories: {
          'US-001': { title: 'Test', status: null },
        },
      };

      const migrated = migrate(v1Data);
      // Null status is preserved (migrator only normalizes known legacy statuses)
      expect(migrated.data.stories['US-001'].status).toBe(null);

      // Validation should flag missing status
      const validation = validateSchema(migrated.data);
      expect(validation.valid).toBe(false);
    });

    it('handles stories with undefined status', () => {
      const v1Data = {
        stories: {
          'US-001': { title: 'Test' }, // status is undefined
        },
      };

      const migrated = migrate(v1Data);
      // Undefined status stays undefined (migrator only normalizes known legacy statuses)
      expect(migrated.data.stories['US-001'].status).toBeUndefined();

      // Validation should flag missing status
      const validation = validateSchema(migrated.data);
      expect(validation.valid).toBe(false);
    });

    it('handles empty stories object', () => {
      const v1Data = {
        stories: {},
      };

      const migrated = migrate(v1Data);
      expect(migrated.migrated).toBe(true);
      expect(migrated.data.schema_version).toBe('2.0.0');
      expect(Object.keys(migrated.data.stories)).toHaveLength(0);
    });

    it('handles mixed valid and invalid statuses', () => {
      const v1Data = {
        stories: {
          'US-001': { title: 'Test 1', status: 'ready' }, // Already valid
          'US-002': { title: 'Test 2', status: 'in_progress' }, // Already valid
          'US-003': { title: 'Test 3', status: 'wip' }, // Legacy - will be normalized
          'US-004': { title: 'Test 4', status: 'unknown' }, // Unknown - stays unchanged
        },
      };

      const migrated = migrate(v1Data);

      expect(migrated.data.stories['US-001'].status).toBe('ready');
      expect(migrated.data.stories['US-002'].status).toBe('in_progress');
      expect(migrated.data.stories['US-003'].status).toBe('in_progress'); // Normalized from 'wip'
      expect(migrated.data.stories['US-004'].status).toBe('unknown'); // Unknown stays unchanged

      // Validation should flag the invalid status
      const validation = validateSchema(migrated.data);
      expect(validation.valid).toBe(false);
      expect(validation.errors.some(e => e.includes('US-004') && e.includes('invalid status'))).toBe(true);
    });

    it('preserves story data through migration and transition', () => {
      const v1Data = {
        stories: {
          'US-001': {
            title: 'Complex Story',
            status: 'todo',
            epic: 'EP-001',
            priority: 'P1',
            estimate: '5d',
            depends_on: ['US-000'],
            custom_field: 'custom_value',
          },
        },
      };

      // Migrate
      const migrated = migrate(v1Data);

      // All fields preserved (except status which was normalized)
      const migratedStory = migrated.data.stories['US-001'];
      expect(migratedStory.title).toBe('Complex Story');
      expect(migratedStory.status).toBe('ready');
      expect(migratedStory.epic).toBe('EP-001');
      expect(migratedStory.priority).toBe('P1');
      expect(migratedStory.estimate).toBe('5d');
      expect(migratedStory.depends_on).toEqual(['US-000']);
      expect(migratedStory.custom_field).toBe('custom_value');

      // Transition
      const story = { id: 'US-001', ...migratedStory };
      const result = transition(story, 'in_progress');

      // All fields still preserved
      expect(result.story.title).toBe('Complex Story');
      expect(result.story.epic).toBe('EP-001');
      expect(result.story.priority).toBe('P1');
      expect(result.story.custom_field).toBe('custom_value');
    });

    it('handles transition after failed transition attempt', () => {
      const v1Data = {
        stories: {
          'US-001': { title: 'Test', status: 'todo' },
        },
      };

      const migrated = migrate(v1Data);
      const story = { id: 'US-001', ...migrated.data.stories['US-001'] };

      // Try invalid transition (ready → completed is not allowed)
      const failedResult = transition(story, 'completed');
      expect(failedResult.success).toBe(false);
      expect(failedResult.error).toContain('Invalid transition');

      // Should still be able to do valid transition
      const validResult = transition(story, 'in_progress');
      expect(validResult.success).toBe(true);
    });
  });

  describe('schema validation after migration and transition', () => {
    it('validates schema after migration', () => {
      const v1Data = {
        stories: {
          'US-001': { title: 'Test', status: 'todo' },
        },
        epics: {
          'EP-001': { title: 'Epic 1', stories: ['US-001'] },
        },
      };

      const migrated = migrate(v1Data);
      const validation = validateSchema(migrated.data);

      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it('validates schema with transitioned stories', () => {
      const v1Data = {
        stories: {
          'US-001': { title: 'Test', status: 'todo' },
        },
      };

      const migrated = migrate(v1Data);

      // Transition the story
      const story = { id: 'US-001', ...migrated.data.stories['US-001'] };
      const result = transition(story, 'in_progress');

      // Update the data with transitioned story
      migrated.data.stories['US-001'] = result.story;

      // Should still be valid
      const validation = validateSchema(migrated.data);
      expect(validation.valid).toBe(true);
    });

    it('detects invalid status after forced transition', () => {
      const data = {
        schema_version: '2.0.0',
        stories: {
          'US-001': { title: 'Test', status: 'ready' },
        },
      };

      // Force an invalid status (simulate bug or manual edit)
      data.stories['US-001'].status = 'invalid_status';

      const validation = validateSchema(data);
      expect(validation.valid).toBe(false);
      expect(validation.errors.some(e => e.includes('invalid status'))).toBe(true);
    });
  });
});
