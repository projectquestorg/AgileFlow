/**
 * Tests for ConfigManager
 */

const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const {
  ConfigManager,
  CONFIG_SCHEMA,
  VALID_CONFIG_KEYS,
  EDITABLE_CONFIG_KEYS,
} = require('../../tools/cli/lib/config-manager');
const { safeDump } = require('../../lib/yaml-utils');

describe('ConfigManager', () => {
  let testDir;

  beforeEach(async () => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'config-manager-test-'));
  });

  afterEach(async () => {
    await fs.remove(testDir);
  });

  describe('constructor', () => {
    it('creates instance with default data', () => {
      const config = new ConfigManager();
      expect(config.get('userName')).toBe('Developer');
      expect(config.get('agileflowFolder')).toBe('.agileflow');
    });

    it('creates instance with provided data', () => {
      const config = new ConfigManager({ userName: 'Test User' });
      expect(config.get('userName')).toBe('Test User');
    });
  });

  describe('load', () => {
    it('loads config from manifest file', async () => {
      const agileflowDir = path.join(testDir, '.agileflow', '_cfg');
      await fs.ensureDir(agileflowDir);
      await fs.writeFile(
        path.join(agileflowDir, 'manifest.yaml'),
        safeDump({
          version: '2.0.0',
          user_name: 'Test User',
          ides: ['claude-code', 'cursor'],
          agileflow_folder: '.agileflow',
          docs_folder: 'docs',
        })
      );

      const config = await ConfigManager.load(testDir);
      expect(config.get('version')).toBe('2.0.0');
      expect(config.get('userName')).toBe('Test User');
      expect(config.get('ides')).toEqual(['claude-code', 'cursor']);
    });

    it('uses defaults when manifest does not exist', async () => {
      const config = await ConfigManager.load(testDir);
      expect(config.get('userName')).toBe('Developer');
      expect(config.get('ides')).toEqual(['claude-code']);
    });

    it('handles corrupted manifest gracefully', async () => {
      const agileflowDir = path.join(testDir, '.agileflow', '_cfg');
      await fs.ensureDir(agileflowDir);
      await fs.writeFile(path.join(agileflowDir, 'manifest.yaml'), 'invalid: yaml: content:');

      const config = await ConfigManager.load(testDir);
      expect(config.get('userName')).toBe('Developer');
    });

    it('supports custom agileflowFolder option', async () => {
      const customDir = path.join(testDir, 'custom-agileflow', '_cfg');
      await fs.ensureDir(customDir);
      await fs.writeFile(
        path.join(customDir, 'manifest.yaml'),
        safeDump({ user_name: 'Custom User' })
      );

      const config = await ConfigManager.load(testDir, { agileflowFolder: 'custom-agileflow' });
      expect(config.get('userName')).toBe('Custom User');
    });
  });

  describe('get', () => {
    it('returns value for valid key', () => {
      const config = new ConfigManager({ userName: 'Test' });
      expect(config.get('userName')).toBe('Test');
    });

    it('returns default for missing value', () => {
      const config = new ConfigManager({});
      expect(config.get('userName')).toBe('Developer');
    });

    it('returns undefined for invalid key', () => {
      const config = new ConfigManager({});
      expect(config.get('invalidKey')).toBeUndefined();
    });
  });

  describe('set', () => {
    it('sets value for editable key', () => {
      const config = new ConfigManager({});
      const result = config.set('userName', 'New Name');
      expect(result.ok).toBe(true);
      expect(config.get('userName')).toBe('New Name');
    });

    it('rejects unknown key', () => {
      const config = new ConfigManager({});
      const result = config.set('unknownKey', 'value');
      expect(result.ok).toBe(false);
      expect(result.error).toContain('Unknown configuration key');
    });

    it('rejects read-only key', () => {
      const config = new ConfigManager({});
      const result = config.set('version', '3.0.0');
      expect(result.ok).toBe(false);
      expect(result.error).toContain('read-only');
    });

    it('validates string type', () => {
      const config = new ConfigManager({});
      const result = config.set('userName', 123);
      expect(result.ok).toBe(false);
      expect(result.error).toContain('must be a string');
    });

    it('validates array type', () => {
      const config = new ConfigManager({});
      const result = config.set('ides', 'not-an-array');
      expect(result.ok).toBe(false);
      expect(result.error).toContain('must be an array');
    });

    it('validates ides array values', () => {
      const config = new ConfigManager({});
      const result = config.set('ides', ['claude-code', 'invalid-ide']);
      expect(result.ok).toBe(false);
      expect(result.error).toContain('Invalid value');
    });

    it('marks config as dirty after set', () => {
      const config = new ConfigManager({});
      expect(config.isDirty()).toBe(false);
      config.set('userName', 'New Name');
      expect(config.isDirty()).toBe(true);
    });
  });

  describe('validate', () => {
    it('returns ok for valid config', () => {
      const config = new ConfigManager({
        version: '1.0.0',
        userName: 'Test',
        ides: ['claude-code'],
        agileflowFolder: '.agileflow',
        docsFolder: 'docs',
      });
      const result = config.validate();
      expect(result.ok).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('returns errors for missing required fields', () => {
      const config = new ConfigManager({});
      // Override the internal data to remove defaults
      config._data = {};
      const result = config.validate();
      expect(result.ok).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('validates path traversal in agileflowFolder', () => {
      const config = new ConfigManager({});
      config._data.agileflowFolder = '../escape';
      const result = config.validate();
      expect(result.ok).toBe(false);
    });
  });

  describe('save', () => {
    it('saves config to manifest file', async () => {
      const manifestPath = path.join(testDir, '.agileflow', '_cfg', 'manifest.yaml');
      const config = new ConfigManager({ userName: 'Test User' }, manifestPath);

      const result = await config.save();
      expect(result.ok).toBe(true);
      expect(await fs.pathExists(manifestPath)).toBe(true);

      const content = await fs.readFile(manifestPath, 'utf8');
      expect(content).toContain('user_name');
    });

    it('creates directory if not exists', async () => {
      const manifestPath = path.join(testDir, 'deep', 'nested', 'manifest.yaml');
      const config = new ConfigManager({ userName: 'Test' }, manifestPath);

      const result = await config.save();
      expect(result.ok).toBe(true);
      expect(await fs.pathExists(manifestPath)).toBe(true);
    });

    it('returns error when no manifest path', async () => {
      const config = new ConfigManager({});
      const result = await config.save();
      expect(result.ok).toBe(false);
      expect(result.error).toContain('No manifest path');
    });

    it('clears dirty flag after save', async () => {
      const manifestPath = path.join(testDir, 'manifest.yaml');
      const config = new ConfigManager({}, manifestPath);
      config.set('userName', 'Test');
      expect(config.isDirty()).toBe(true);

      await config.save();
      expect(config.isDirty()).toBe(false);
    });
  });

  describe('getAll', () => {
    it('returns all config values', () => {
      const config = new ConfigManager({
        userName: 'Test',
        version: '1.0.0',
      });
      const all = config.getAll();
      expect(all).toHaveProperty('userName');
      expect(all).toHaveProperty('version');
      expect(all).toHaveProperty('ides');
      expect(all).toHaveProperty('agileflowFolder');
      expect(all).toHaveProperty('docsFolder');
    });
  });

  describe('getManifestPath', () => {
    it('returns manifest path', () => {
      const manifestPath = '/test/path/manifest.yaml';
      const config = new ConfigManager({}, manifestPath);
      expect(config.getManifestPath()).toBe(manifestPath);
    });

    it('returns null when not set', () => {
      const config = new ConfigManager({});
      expect(config.getManifestPath()).toBeNull();
    });
  });

  describe('migrate', () => {
    it('migrates name to userName', () => {
      const config = new ConfigManager({});
      const result = config.migrate({ name: 'Old Name' });
      expect(result.ok).toBe(true);
      expect(result.migrated).toContain('name → userName');
      expect(config.get('userName')).toBe('Old Name');
    });

    it('normalizes IDE names to lowercase', () => {
      const config = new ConfigManager({ ides: ['Claude-Code', 'CURSOR'] });
      const result = config.migrate({});
      expect(result.ok).toBe(true);
      expect(config.get('ides')).toEqual(['claude-code', 'cursor']);
    });

    it('marks config as dirty after migration', () => {
      const config = new ConfigManager({});
      expect(config.isDirty()).toBe(false);
      config.migrate({ name: 'Test' });
      expect(config.isDirty()).toBe(true);
    });
  });

  describe('key normalization', () => {
    it('normalizes snake_case to camelCase', () => {
      const normalized = ConfigManager._normalizeKeys({
        user_name: 'Test',
        agileflow_folder: '.agileflow',
        docs_folder: 'docs',
        installed_at: '2024-01-01',
        updated_at: '2024-01-02',
      });
      expect(normalized.userName).toBe('Test');
      expect(normalized.agileflowFolder).toBe('.agileflow');
      expect(normalized.docsFolder).toBe('docs');
      expect(normalized.installedAt).toBe('2024-01-01');
      expect(normalized.updatedAt).toBe('2024-01-02');
    });

    it('denormalizes camelCase to snake_case', () => {
      const denormalized = ConfigManager._denormalizeKeys({
        userName: 'Test',
        agileflowFolder: '.agileflow',
        docsFolder: 'docs',
        installedAt: '2024-01-01',
        updatedAt: '2024-01-02',
      });
      expect(denormalized.user_name).toBe('Test');
      expect(denormalized.agileflow_folder).toBe('.agileflow');
      expect(denormalized.docs_folder).toBe('docs');
      expect(denormalized.installed_at).toBe('2024-01-01');
      expect(denormalized.updated_at).toBe('2024-01-02');
    });
  });

  describe('exports', () => {
    it('exports CONFIG_SCHEMA', () => {
      expect(CONFIG_SCHEMA).toHaveProperty('version');
      expect(CONFIG_SCHEMA).toHaveProperty('userName');
      expect(CONFIG_SCHEMA).toHaveProperty('ides');
    });

    it('exports VALID_CONFIG_KEYS', () => {
      expect(VALID_CONFIG_KEYS).toContain('version');
      expect(VALID_CONFIG_KEYS).toContain('userName');
      expect(VALID_CONFIG_KEYS).toContain('ides');
    });

    it('exports EDITABLE_CONFIG_KEYS', () => {
      expect(EDITABLE_CONFIG_KEYS).toContain('userName');
      expect(EDITABLE_CONFIG_KEYS).toContain('ides');
      expect(EDITABLE_CONFIG_KEYS).not.toContain('version');
      expect(EDITABLE_CONFIG_KEYS).not.toContain('installedAt');
    });
  });
});
