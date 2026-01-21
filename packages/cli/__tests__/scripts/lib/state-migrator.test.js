/**
 * Tests for state-migrator.js - Schema versioning and migrations
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  CURRENT_SCHEMA_VERSION,
  parseVersion,
  compareVersions,
  detectSchemaVersion,
  migrate,
  loadWithMigration,
  needsMigration,
  validateSchema,
  getMigrationLog,
  clearMigrationLog,
  migrate_1_0_0_to_2_0_0,
  getMigrationPath,
} = require('../../../scripts/lib/state-migrator');

describe('state-migrator', () => {
  describe('CURRENT_SCHEMA_VERSION', () => {
    it('is defined and follows semver format', () => {
      expect(CURRENT_SCHEMA_VERSION).toBeDefined();
      expect(CURRENT_SCHEMA_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
    });

    it('is currently 2.0.0', () => {
      expect(CURRENT_SCHEMA_VERSION).toBe('2.0.0');
    });
  });

  describe('parseVersion', () => {
    it('parses standard semver', () => {
      expect(parseVersion('1.2.3')).toEqual({ major: 1, minor: 2, patch: 3 });
    });

    it('parses version with zeros', () => {
      expect(parseVersion('0.0.0')).toEqual({ major: 0, minor: 0, patch: 0 });
    });

    it('handles major version only', () => {
      expect(parseVersion('1')).toEqual({ major: 1, minor: 0, patch: 0 });
    });

    it('handles major.minor only', () => {
      expect(parseVersion('1.2')).toEqual({ major: 1, minor: 2, patch: 0 });
    });

    it('handles null/undefined', () => {
      expect(parseVersion(null)).toEqual({ major: 1, minor: 0, patch: 0 });
      expect(parseVersion(undefined)).toEqual({ major: 1, minor: 0, patch: 0 });
    });

    it('handles "unknown" version', () => {
      expect(parseVersion('unknown')).toEqual({ major: 1, minor: 0, patch: 0 });
    });
  });

  describe('compareVersions', () => {
    it('returns 0 for equal versions', () => {
      expect(compareVersions('1.0.0', '1.0.0')).toBe(0);
      expect(compareVersions('2.3.4', '2.3.4')).toBe(0);
    });

    it('returns -1 when v1 < v2', () => {
      expect(compareVersions('1.0.0', '2.0.0')).toBe(-1);
      expect(compareVersions('1.0.0', '1.1.0')).toBe(-1);
      expect(compareVersions('1.0.0', '1.0.1')).toBe(-1);
    });

    it('returns 1 when v1 > v2', () => {
      expect(compareVersions('2.0.0', '1.0.0')).toBe(1);
      expect(compareVersions('1.1.0', '1.0.0')).toBe(1);
      expect(compareVersions('1.0.1', '1.0.0')).toBe(1);
    });

    it('compares major version first', () => {
      expect(compareVersions('2.0.0', '1.9.9')).toBe(1);
    });

    it('compares minor version second', () => {
      expect(compareVersions('1.2.0', '1.1.9')).toBe(1);
    });

    it('compares patch version last', () => {
      expect(compareVersions('1.0.2', '1.0.1')).toBe(1);
    });
  });

  describe('detectSchemaVersion', () => {
    it('returns explicit schema_version if present', () => {
      expect(detectSchemaVersion({ schema_version: '2.0.0' })).toBe('2.0.0');
      expect(detectSchemaVersion({ schema_version: '1.5.0' })).toBe('1.5.0');
    });

    it('returns 1.0.0 for data without schema_version', () => {
      expect(detectSchemaVersion({})).toBe('1.0.0');
      expect(detectSchemaVersion({ stories: {} })).toBe('1.0.0');
    });
  });

  describe('getMigrationPath', () => {
    it('returns path from 1.0.0 to 2.0.0', () => {
      const path = getMigrationPath('1.0.0', '2.0.0');
      expect(path).toContain('1.0.0->2.0.0');
    });

    it('returns empty path when already at target', () => {
      const path = getMigrationPath('2.0.0', '2.0.0');
      expect(path).toHaveLength(0);
    });

    it('returns empty path when above target', () => {
      const path = getMigrationPath('3.0.0', '2.0.0');
      expect(path).toHaveLength(0);
    });
  });

  describe('migrate_1_0_0_to_2_0_0', () => {
    beforeEach(() => {
      clearMigrationLog();
    });

    it('adds schema_version field', () => {
      const data = { stories: {} };
      const result = migrate_1_0_0_to_2_0_0(data);
      expect(result.schema_version).toBe('2.0.0');
    });

    it('adds migrated_at timestamp', () => {
      const data = { stories: {} };
      const result = migrate_1_0_0_to_2_0_0(data);
      expect(result.migrated_at).toBeDefined();
      expect(new Date(result.migrated_at)).toBeInstanceOf(Date);
    });

    it('adds migrated_from field', () => {
      const data = { stories: {} };
      const result = migrate_1_0_0_to_2_0_0(data);
      expect(result.migrated_from).toBe('1.0.0');
    });

    it('normalizes "todo" status to "ready"', () => {
      const data = {
        stories: { 'US-001': { title: 'Test', status: 'todo' } },
      };
      const result = migrate_1_0_0_to_2_0_0(data);
      expect(result.stories['US-001'].status).toBe('ready');
    });

    it('normalizes "wip" status to "in_progress"', () => {
      const data = {
        stories: { 'US-001': { title: 'Test', status: 'wip' } },
      };
      const result = migrate_1_0_0_to_2_0_0(data);
      expect(result.stories['US-001'].status).toBe('in_progress');
    });

    it('normalizes "done" status to "completed"', () => {
      const data = {
        stories: { 'US-001': { title: 'Test', status: 'done' } },
      };
      const result = migrate_1_0_0_to_2_0_0(data);
      expect(result.stories['US-001'].status).toBe('completed');
    });

    it.each([
      ['new', 'ready'],
      ['pending', 'ready'],
      ['open', 'ready'],
      ['working', 'in_progress'],
      ['in_review', 'in_progress'],
      ['closed', 'completed'],
      ['finished', 'completed'],
      ['resolved', 'completed'],
    ])('normalizes "%s" status to "%s"', (oldStatus, expectedStatus) => {
      const data = {
        stories: { 'US-001': { title: 'Test', status: oldStatus } },
      };
      const result = migrate_1_0_0_to_2_0_0(data);
      expect(result.stories['US-001'].status).toBe(expectedStatus);
    });

    it('preserves already-valid statuses', () => {
      const data = {
        stories: {
          'US-001': { title: 'Test', status: 'ready' },
          'US-002': { title: 'Test', status: 'in_progress' },
          'US-003': { title: 'Test', status: 'completed' },
        },
      };
      const result = migrate_1_0_0_to_2_0_0(data);
      expect(result.stories['US-001'].status).toBe('ready');
      expect(result.stories['US-002'].status).toBe('in_progress');
      expect(result.stories['US-003'].status).toBe('completed');
    });

    it('preserves other story fields', () => {
      const data = {
        stories: {
          'US-001': {
            title: 'Test Story',
            status: 'todo',
            epic: 'EP-001',
            priority: 'high',
            estimate: '2d',
          },
        },
      };
      const result = migrate_1_0_0_to_2_0_0(data);
      expect(result.stories['US-001'].title).toBe('Test Story');
      expect(result.stories['US-001'].epic).toBe('EP-001');
      expect(result.stories['US-001'].priority).toBe('high');
      expect(result.stories['US-001'].estimate).toBe('2d');
    });

    it('preserves epics unchanged', () => {
      const data = {
        epics: {
          'EP-001': { title: 'Test Epic', stories: ['US-001'] },
        },
        stories: {},
      };
      const result = migrate_1_0_0_to_2_0_0(data);
      expect(result.epics['EP-001']).toEqual({ title: 'Test Epic', stories: ['US-001'] });
    });

    it('logs migration actions', () => {
      const data = {
        stories: { 'US-001': { title: 'Test', status: 'todo' } },
      };
      migrate_1_0_0_to_2_0_0(data);
      const log = getMigrationLog();
      expect(log.length).toBeGreaterThan(0);
      expect(log.some(entry => entry.message.includes('1.0.0 to 2.0.0'))).toBe(true);
    });
  });

  describe('migrate', () => {
    beforeEach(() => {
      clearMigrationLog();
    });

    it('returns migrated=false when already at current version', () => {
      const data = { schema_version: '2.0.0', stories: {} };
      const result = migrate(data);
      expect(result.migrated).toBe(false);
      expect(result.fromVersion).toBe('2.0.0');
      expect(result.toVersion).toBe('2.0.0');
    });

    it('returns migrated=false when above current version', () => {
      const data = { schema_version: '3.0.0', stories: {} };
      const result = migrate(data);
      expect(result.migrated).toBe(false);
    });

    it('migrates from v1.0.0 to current version', () => {
      const data = { stories: { 'US-001': { title: 'Test', status: 'todo' } } };
      const result = migrate(data);
      expect(result.migrated).toBe(true);
      expect(result.fromVersion).toBe('1.0.0');
      expect(result.toVersion).toBe('2.0.0');
      expect(result.data.schema_version).toBe('2.0.0');
    });

    it('includes migration log in result', () => {
      const data = { stories: {} };
      const result = migrate(data);
      expect(Array.isArray(result.log)).toBe(true);
      expect(result.log.length).toBeGreaterThan(0);
    });

    it('respects dryRun option', () => {
      const data = { stories: { 'US-001': { title: 'Test', status: 'todo' } } };
      const result = migrate(data, { dryRun: true });

      // Original data should be unchanged
      expect(data.schema_version).toBeUndefined();
      expect(data.stories['US-001'].status).toBe('todo');

      // Result should have migrated data
      expect(result.data.schema_version).toBe('2.0.0');
      expect(result.data.stories['US-001'].status).toBe('ready');
    });
  });

  describe('needsMigration', () => {
    it('returns true for data without schema_version', () => {
      const data = { stories: {} };
      const result = needsMigration(data);
      expect(result.needsMigration).toBe(true);
      expect(result.currentVersion).toBe('1.0.0');
      expect(result.targetVersion).toBe('2.0.0');
    });

    it('returns false for data at current version', () => {
      const data = { schema_version: '2.0.0', stories: {} };
      const result = needsMigration(data);
      expect(result.needsMigration).toBe(false);
    });

    it('returns false for data above current version', () => {
      const data = { schema_version: '3.0.0', stories: {} };
      const result = needsMigration(data);
      expect(result.needsMigration).toBe(false);
    });
  });

  describe('validateSchema', () => {
    it('returns valid=true for valid v2.0.0 data', () => {
      const data = {
        schema_version: '2.0.0',
        stories: {
          'US-001': { title: 'Test', status: 'ready' },
        },
        epics: {
          'EP-001': { title: 'Epic' },
        },
      };
      const result = validateSchema(data);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('returns error for missing schema_version', () => {
      const data = { stories: {} };
      const result = validateSchema(data);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing required field: schema_version');
    });

    it('returns error for story missing title', () => {
      const data = {
        schema_version: '2.0.0',
        stories: { 'US-001': { status: 'ready' } },
      };
      const result = validateSchema(data);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('US-001') && e.includes('title'))).toBe(true);
    });

    it('returns error for story missing status', () => {
      const data = {
        schema_version: '2.0.0',
        stories: { 'US-001': { title: 'Test' } },
      };
      const result = validateSchema(data);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('US-001') && e.includes('status'))).toBe(true);
    });

    it('returns error for invalid story status', () => {
      const data = {
        schema_version: '2.0.0',
        stories: { 'US-001': { title: 'Test', status: 'invalid_status' } },
      };
      const result = validateSchema(data);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('invalid status'))).toBe(true);
    });

    it('accepts all valid story statuses', () => {
      // Import VALID_STATUSES from story-state-machine (single source of truth)
      const { VALID_STATUSES } = require('../../../scripts/lib/story-state-machine');
      VALID_STATUSES.forEach(status => {
        const data = {
          schema_version: '2.0.0',
          stories: { 'US-001': { title: 'Test', status } },
        };
        const result = validateSchema(data);
        expect(result.valid).toBe(true);
      });
    });

    it('returns error for epic missing title', () => {
      const data = {
        schema_version: '2.0.0',
        stories: {},
        epics: { 'EP-001': { stories: [] } },
      };
      const result = validateSchema(data);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('EP-001') && e.includes('title'))).toBe(true);
    });
  });

  describe('loadWithMigration', () => {
    let tempDir;
    let testFile;

    beforeEach(() => {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'state-migrator-test-'));
      testFile = path.join(tempDir, 'status.json');
      clearMigrationLog();
    });

    afterEach(() => {
      fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it('throws error for non-existent file', () => {
      expect(() => loadWithMigration('/nonexistent/path.json')).toThrow('File not found');
    });

    it('throws error for invalid JSON', () => {
      fs.writeFileSync(testFile, 'not valid json');
      expect(() => loadWithMigration(testFile)).toThrow('Invalid JSON');
    });

    it('loads and migrates v1.0.0 data', () => {
      const v1Data = {
        stories: { 'US-001': { title: 'Test', status: 'todo' } },
      };
      fs.writeFileSync(testFile, JSON.stringify(v1Data));

      const result = loadWithMigration(testFile);
      expect(result.migrated).toBe(true);
      expect(result.data.schema_version).toBe('2.0.0');
    });

    it('creates backup when migrating', () => {
      const v1Data = { stories: {} };
      fs.writeFileSync(testFile, JSON.stringify(v1Data));

      loadWithMigration(testFile);

      const files = fs.readdirSync(tempDir);
      const backupFile = files.find(f => f.includes('.backup.'));
      expect(backupFile).toBeDefined();
    });

    it('saves migrated data to original file', () => {
      const v1Data = {
        stories: { 'US-001': { title: 'Test', status: 'todo' } },
      };
      fs.writeFileSync(testFile, JSON.stringify(v1Data));

      loadWithMigration(testFile);

      const savedData = JSON.parse(fs.readFileSync(testFile, 'utf8'));
      expect(savedData.schema_version).toBe('2.0.0');
      expect(savedData.stories['US-001'].status).toBe('ready');
    });

    it('respects autoSave=false option', () => {
      const v1Data = {
        stories: { 'US-001': { title: 'Test', status: 'todo' } },
      };
      fs.writeFileSync(testFile, JSON.stringify(v1Data));

      loadWithMigration(testFile, { autoSave: false });

      // Original file should be unchanged
      const savedData = JSON.parse(fs.readFileSync(testFile, 'utf8'));
      expect(savedData.schema_version).toBeUndefined();
    });

    it('does not modify v2.0.0 data', () => {
      const v2Data = {
        schema_version: '2.0.0',
        stories: { 'US-001': { title: 'Test', status: 'ready' } },
      };
      fs.writeFileSync(testFile, JSON.stringify(v2Data));

      const result = loadWithMigration(testFile);
      expect(result.migrated).toBe(false);

      // No backup should be created
      const files = fs.readdirSync(tempDir);
      expect(files.filter(f => f.includes('.backup.')).length).toBe(0);
    });
  });

  describe('getMigrationLog / clearMigrationLog', () => {
    it('returns empty log initially', () => {
      clearMigrationLog();
      expect(getMigrationLog()).toHaveLength(0);
    });

    it('returns copy of log', () => {
      const data = { stories: {} };
      migrate(data);
      const log1 = getMigrationLog();
      const log2 = getMigrationLog();
      expect(log1).not.toBe(log2);
      expect(log1).toEqual(log2);
    });

    it('clears log properly', () => {
      const data = { stories: {} };
      migrate(data);
      expect(getMigrationLog().length).toBeGreaterThan(0);
      clearMigrationLog();
      expect(getMigrationLog()).toHaveLength(0);
    });
  });
});
