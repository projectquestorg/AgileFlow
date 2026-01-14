/**
 * Integration tests for core installer
 *
 * Tests the Installer class: complete install lifecycle, error recovery,
 * cleanup idempotency, and file hash tracking.
 */

const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const { safeLoad, safeDump } = require('../../../lib/yaml-utils');

const {
  Installer,
  getSourcePath,
  getPackageRoot,
} = require('../../../tools/cli/installers/core/installer');

describe('Installer', () => {
  let tempDir;
  let installer;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'installer-test-'));
    installer = new Installer();
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('constructor', () => {
    it('initializes with correct paths', () => {
      expect(installer.sourcePath).toBeDefined();
      expect(installer.packageRoot).toBeDefined();
      expect(installer.coreDir).toBeDefined();
    });

    it('loads version from package.json', () => {
      expect(installer.version).toBeDefined();
      expect(typeof installer.version).toBe('string');
      expect(installer.version).toMatch(/^\d+\.\d+\.\d+/);
    });
  });

  describe('getSourcePath', () => {
    it('returns src directory path', () => {
      const srcPath = getSourcePath();
      expect(srcPath).toContain('src');
    });
  });

  describe('getPackageRoot', () => {
    it('returns package root directory', () => {
      const root = getPackageRoot();
      expect(root).toContain('packages');
    });
  });

  describe('cleanup', () => {
    it('removes standard content directories', async () => {
      const agileflowDir = path.join(tempDir, '.agileflow');

      // Create directories to remove
      await fs.ensureDir(path.join(agileflowDir, 'agents'));
      await fs.ensureDir(path.join(agileflowDir, 'commands'));
      await fs.ensureDir(path.join(agileflowDir, 'skills'));
      await fs.ensureDir(path.join(agileflowDir, 'scripts'));
      await fs.ensureDir(path.join(agileflowDir, 'templates'));

      // Create files inside them
      await fs.writeFile(path.join(agileflowDir, 'agents', 'test.md'), 'content');
      await fs.writeFile(path.join(agileflowDir, 'commands', 'test.md'), 'content');

      await installer.cleanup(agileflowDir);

      expect(await fs.pathExists(path.join(agileflowDir, 'agents'))).toBe(false);
      expect(await fs.pathExists(path.join(agileflowDir, 'commands'))).toBe(false);
      expect(await fs.pathExists(path.join(agileflowDir, 'skills'))).toBe(false);
      expect(await fs.pathExists(path.join(agileflowDir, 'scripts'))).toBe(false);
      expect(await fs.pathExists(path.join(agileflowDir, 'templates'))).toBe(false);
    });

    it('preserves _cfg directory', async () => {
      const agileflowDir = path.join(tempDir, '.agileflow');
      const cfgDir = path.join(agileflowDir, '_cfg');

      await fs.ensureDir(cfgDir);
      await fs.writeFile(path.join(cfgDir, 'manifest.yaml'), 'version: 1.0.0');

      await installer.cleanup(agileflowDir);

      expect(await fs.pathExists(cfgDir)).toBe(true);
      expect(await fs.pathExists(path.join(cfgDir, 'manifest.yaml'))).toBe(true);
    });

    it('preserves config.yaml', async () => {
      const agileflowDir = path.join(tempDir, '.agileflow');
      const configPath = path.join(agileflowDir, 'config.yaml');

      await fs.ensureDir(agileflowDir);
      await fs.writeFile(configPath, 'user: test');

      await installer.cleanup(agileflowDir);

      expect(await fs.pathExists(configPath)).toBe(true);
    });

    it('handles non-existent directories gracefully', async () => {
      const agileflowDir = path.join(tempDir, '.nonexistent');
      await expect(installer.cleanup(agileflowDir)).resolves.not.toThrow();
    });

    it('is idempotent - can be called multiple times', async () => {
      const agileflowDir = path.join(tempDir, '.agileflow');
      await fs.ensureDir(path.join(agileflowDir, 'agents'));

      await installer.cleanup(agileflowDir);
      await installer.cleanup(agileflowDir); // Second call

      expect(await fs.pathExists(path.join(agileflowDir, 'agents'))).toBe(false);
    });
  });

  describe('validateInstallPath', () => {
    it('accepts valid paths within base directory', () => {
      const baseDir = path.join(tempDir, '.agileflow');
      const filePath = path.join(baseDir, 'agents', 'test.md');

      const result = installer.validateInstallPath(filePath, baseDir);
      expect(result).toBe(path.resolve(filePath));
    });

    it('rejects paths that escape base directory', () => {
      const baseDir = path.join(tempDir, '.agileflow');
      const filePath = path.join(baseDir, '..', '..', 'etc', 'passwd');

      expect(() => {
        installer.validateInstallPath(filePath, baseDir);
      }).toThrow();
    });

    it('rejects paths with traversal attempts', () => {
      const baseDir = path.join(tempDir, '.agileflow');
      const filePath = path.join(baseDir, 'agents', '..', '..', '..', 'secret');

      expect(() => {
        installer.validateInstallPath(filePath, baseDir);
      }).toThrow();
    });
  });

  describe('createConfig', () => {
    it('creates new config file with correct structure', async () => {
      const agileflowDir = path.join(tempDir, '.agileflow');
      await fs.ensureDir(agileflowDir);

      await installer.createConfig(agileflowDir, 'TestUser', '.agileflow');

      const configPath = path.join(agileflowDir, 'config.yaml');
      expect(await fs.pathExists(configPath)).toBe(true);

      const content = await fs.readFile(configPath, 'utf8');
      const config = safeLoad(content);

      expect(config.user_name).toBe('TestUser');
      expect(config.agileflow_folder).toBe('.agileflow');
      expect(config.version).toBe(installer.version);
      expect(config.communication_language).toBe('English');
      expect(config.created_at).toBeDefined();
    });

    it('updates existing config without losing user changes', async () => {
      const agileflowDir = path.join(tempDir, '.agileflow');
      await fs.ensureDir(agileflowDir);

      // Create existing config with custom settings
      const existingConfig = {
        version: '1.0.0',
        user_name: 'OldUser',
        custom_setting: 'preserve_me',
        created_at: '2024-01-01T00:00:00.000Z',
      };
      await fs.writeFile(path.join(agileflowDir, 'config.yaml'), safeDump(existingConfig));

      await installer.createConfig(agileflowDir, 'NewUser', '.agileflow');

      const content = await fs.readFile(path.join(agileflowDir, 'config.yaml'), 'utf8');
      const config = safeLoad(content);

      expect(config.user_name).toBe('NewUser');
      expect(config.custom_setting).toBe('preserve_me');
      expect(config.created_at).toBe('2024-01-01T00:00:00.000Z'); // Original preserved
      expect(config.updated_at).toBeDefined();
    });
  });

  describe('createManifest', () => {
    it('creates new manifest with correct structure', async () => {
      const cfgDir = path.join(tempDir, '.agileflow', '_cfg');
      await fs.ensureDir(cfgDir);

      await installer.createManifest(cfgDir, {
        ides: ['claude-code'],
        userName: 'TestUser',
        agileflowFolder: '.agileflow',
        docsFolder: 'docs',
      });

      const manifestPath = path.join(cfgDir, 'manifest.yaml');
      expect(await fs.pathExists(manifestPath)).toBe(true);

      const content = await fs.readFile(manifestPath, 'utf8');
      const manifest = safeLoad(content);

      expect(manifest.version).toBe(installer.version);
      expect(manifest.ides).toEqual(['claude-code']);
      expect(manifest.modules).toEqual(['core']);
      expect(manifest.user_name).toBe('TestUser');
      expect(manifest.installed_at).toBeDefined();
    });

    it('updates existing manifest preserving installed_at', async () => {
      const cfgDir = path.join(tempDir, '.agileflow', '_cfg');
      await fs.ensureDir(cfgDir);

      // Create existing manifest
      const existingManifest = {
        version: '1.0.0',
        installed_at: '2024-01-01T00:00:00.000Z',
        ides: ['cursor'],
        modules: ['core', 'custom'],
      };
      await fs.writeFile(path.join(cfgDir, 'manifest.yaml'), safeDump(existingManifest));

      await installer.createManifest(cfgDir, {
        ides: ['claude-code'],
        userName: 'NewUser',
        agileflowFolder: '.agileflow',
        docsFolder: 'docs',
      });

      const content = await fs.readFile(path.join(cfgDir, 'manifest.yaml'), 'utf8');
      const manifest = safeLoad(content);

      expect(manifest.installed_at).toBe('2024-01-01T00:00:00.000Z');
      expect(manifest.updated_at).toBeDefined();
      expect(manifest.modules).toEqual(['core', 'custom']); // Preserved
    });
  });

  describe('readFileIndex and writeFileIndex', () => {
    it('returns null for non-existent file', async () => {
      const result = await installer.readFileIndex(path.join(tempDir, 'nonexistent.json'));
      expect(result).toBeNull();
    });

    it('returns null for invalid JSON', async () => {
      const indexPath = path.join(tempDir, 'invalid.json');
      await fs.writeFile(indexPath, 'not valid json');

      const result = await installer.readFileIndex(indexPath);
      expect(result).toBeNull();
    });

    it('returns null for wrong schema version', async () => {
      const indexPath = path.join(tempDir, 'old-schema.json');
      await fs.writeJson(indexPath, { schema: 99, files: {} });

      const result = await installer.readFileIndex(indexPath);
      expect(result).toBeNull();
    });

    it('writes and reads file index correctly', async () => {
      const indexPath = path.join(tempDir, 'files.json');
      const fileIndex = {
        schema: 1,
        files: {
          'agents/test.md': { sha256: 'abc123', protected: false },
          'commands/cmd.md': { sha256: 'def456', protected: true },
        },
      };

      await installer.writeFileIndex(indexPath, fileIndex);
      const result = await installer.readFileIndex(indexPath);

      expect(result).not.toBeNull();
      expect(result.schema).toBe(1);
      expect(result.files['agents/test.md']).toEqual({ sha256: 'abc123', protected: false });
      expect(result.version).toBe(installer.version);
      expect(result.generated_at).toBeDefined();
    });
  });

  describe('hashFile', () => {
    it('returns consistent hash for same content', async () => {
      const filePath = path.join(tempDir, 'test.txt');
      await fs.writeFile(filePath, 'Hello, World!');

      const hash1 = await installer.hashFile(filePath);
      const hash2 = await installer.hashFile(filePath);

      expect(hash1).toBe(hash2);
      expect(typeof hash1).toBe('string');
      expect(hash1.length).toBe(64); // SHA256 hex length
    });

    it('returns different hash for different content', async () => {
      const file1 = path.join(tempDir, 'file1.txt');
      const file2 = path.join(tempDir, 'file2.txt');
      await fs.writeFile(file1, 'Content A');
      await fs.writeFile(file2, 'Content B');

      const hash1 = await installer.hashFile(file1);
      const hash2 = await installer.hashFile(file2);

      expect(hash1).not.toBe(hash2);
    });
  });

  describe('countInstalledItems', () => {
    it('counts agents correctly', async () => {
      const agileflowDir = path.join(tempDir, '.agileflow');
      const agentsDir = path.join(agileflowDir, 'agents');
      await fs.ensureDir(agentsDir);

      await fs.writeFile(path.join(agentsDir, 'agent1.md'), '# Agent 1');
      await fs.writeFile(path.join(agentsDir, 'agent2.md'), '# Agent 2');
      await fs.writeFile(path.join(agentsDir, 'ignore.txt'), 'not counted');

      const counts = await installer.countInstalledItems(agileflowDir);

      expect(counts.agents).toBe(2);
    });

    it('counts commands correctly', async () => {
      const agileflowDir = path.join(tempDir, '.agileflow');
      const commandsDir = path.join(agileflowDir, 'commands');
      await fs.ensureDir(commandsDir);

      await fs.writeFile(path.join(commandsDir, 'cmd1.md'), '# Command 1');
      await fs.writeFile(path.join(commandsDir, 'cmd2.md'), '# Command 2');
      await fs.writeFile(path.join(commandsDir, 'cmd3.md'), '# Command 3');

      const counts = await installer.countInstalledItems(agileflowDir);

      expect(counts.commands).toBe(3);
    });

    it('counts skill directories correctly', async () => {
      const agileflowDir = path.join(tempDir, '.agileflow');
      const skillsDir = path.join(agileflowDir, 'skills');
      await fs.ensureDir(skillsDir);

      await fs.ensureDir(path.join(skillsDir, 'skill1'));
      await fs.ensureDir(path.join(skillsDir, 'skill2'));
      await fs.writeFile(path.join(skillsDir, 'README.md'), '# Skills'); // Not counted

      const counts = await installer.countInstalledItems(agileflowDir);

      expect(counts.skills).toBe(2);
    });

    it('returns zeros for empty installation', async () => {
      const agileflowDir = path.join(tempDir, '.agileflow');
      await fs.ensureDir(agileflowDir);

      const counts = await installer.countInstalledItems(agileflowDir);

      expect(counts.agents).toBe(0);
      expect(counts.commands).toBe(0);
      expect(counts.skills).toBe(0);
    });
  });

  describe('createBackup', () => {
    it('backs up existing content', async () => {
      const agileflowDir = path.join(tempDir, '.agileflow');
      const cfgDir = path.join(agileflowDir, '_cfg');
      await fs.ensureDir(cfgDir);

      // Create content to backup
      await fs.ensureDir(path.join(agileflowDir, 'agents'));
      await fs.writeFile(path.join(agileflowDir, 'agents', 'test.md'), 'agent content');
      await fs.writeFile(path.join(agileflowDir, 'config.yaml'), 'version: 1.0.0');

      const backupPath = await installer.createBackup(agileflowDir, cfgDir, '2024-01-01T12-00-00');

      expect(backupPath).toContain('backups');
      expect(await fs.pathExists(path.join(backupPath, 'agents', 'test.md'))).toBe(true);
      expect(await fs.pathExists(path.join(backupPath, 'config.yaml'))).toBe(true);
    });

    it('handles missing directories gracefully', async () => {
      const agileflowDir = path.join(tempDir, '.agileflow');
      const cfgDir = path.join(agileflowDir, '_cfg');
      await fs.ensureDir(cfgDir);

      const backupPath = await installer.createBackup(agileflowDir, cfgDir, '2024-01-01T12-00-00');

      expect(backupPath).toBeDefined();
      expect(await fs.pathExists(backupPath)).toBe(true);
    });
  });

  describe('getStatus', () => {
    it('returns not installed for empty directory', async () => {
      const status = await installer.getStatus(tempDir);

      expect(status.installed).toBe(false);
      expect(status.path).toBeNull();
    });

    it('detects installation in .agileflow', async () => {
      const agileflowDir = path.join(tempDir, '.agileflow');
      const cfgDir = path.join(agileflowDir, '_cfg');
      await fs.ensureDir(cfgDir);

      const manifest = {
        version: '2.50.0',
        ides: ['claude-code'],
        modules: ['core'],
        user_name: 'TestUser',
        agileflow_folder: '.agileflow',
        docs_folder: 'docs',
        installed_at: '2024-01-01T00:00:00.000Z',
        updated_at: '2024-01-02T00:00:00.000Z',
      };
      await fs.writeFile(path.join(cfgDir, 'manifest.yaml'), safeDump(manifest));

      const status = await installer.getStatus(tempDir);

      expect(status.installed).toBe(true);
      expect(status.path).toBe(agileflowDir);
      expect(status.version).toBe('2.50.0');
      expect(status.ides).toEqual(['claude-code']);
      expect(status.userName).toBe('TestUser');
    });

    it('detects installation in alternative folders', async () => {
      const agileflowDir = path.join(tempDir, 'agileflow');
      const cfgDir = path.join(agileflowDir, '_cfg');
      await fs.ensureDir(cfgDir);

      const manifest = {
        version: '2.50.0',
        ides: ['cursor'],
        agileflow_folder: 'agileflow',
      };
      await fs.writeFile(path.join(cfgDir, 'manifest.yaml'), safeDump(manifest));

      const status = await installer.getStatus(tempDir);

      expect(status.installed).toBe(true);
      expect(status.agileflowFolder).toBe('agileflow');
    });
  });

  describe('copyFileWithReplacements', () => {
    it('copies text files with placeholder replacements', async () => {
      const sourceFile = path.join(tempDir, 'source.md');
      const destFile = path.join(tempDir, 'dest.md');

      await fs.writeFile(sourceFile, 'Version: {{VERSION}}');

      await installer.copyFileWithReplacements(sourceFile, destFile, '.agileflow');

      const content = await fs.readFile(destFile, 'utf8');
      expect(content).toContain(installer.version);
      expect(content).not.toContain('{{VERSION}}');
    });

    it('copies binary files unchanged', async () => {
      const sourceFile = path.join(tempDir, 'source.bin');
      const destFile = path.join(tempDir, 'dest.bin');

      const binaryData = Buffer.from([0x00, 0x01, 0x02, 0x03]);
      await fs.writeFile(sourceFile, binaryData);

      await installer.copyFileWithReplacements(sourceFile, destFile, '.agileflow');

      const content = await fs.readFile(destFile);
      expect(content).toEqual(binaryData);
    });
  });

  describe('copyContent', () => {
    it('copies directory structure recursively', async () => {
      const sourceDir = path.join(tempDir, 'source');
      const destDir = path.join(tempDir, 'dest');

      await fs.ensureDir(path.join(sourceDir, 'subdir'));
      await fs.ensureDir(destDir); // Destination must exist before copyContent
      await fs.writeFile(path.join(sourceDir, 'file1.md'), '# File 1');
      await fs.writeFile(path.join(sourceDir, 'subdir', 'file2.md'), '# File 2');

      await installer.copyContent(sourceDir, destDir, '.agileflow');

      expect(await fs.pathExists(path.join(destDir, 'file1.md'))).toBe(true);
      expect(await fs.pathExists(path.join(destDir, 'subdir', 'file2.md'))).toBe(true);
    });

    it('rejects path traversal in filenames', async () => {
      const sourceDir = path.join(tempDir, 'source');
      const destDir = path.join(tempDir, 'dest');

      await fs.ensureDir(sourceDir);
      // Create file with traversal attempt in name
      await fs.writeFile(path.join(sourceDir, '..%2F..%2Fetc%2Fpasswd'), 'malicious');

      // This should work because the filename gets resolved safely
      await installer.copyContent(sourceDir, destDir, '.agileflow');

      // The traversal attempt should be neutralized
      expect(await fs.pathExists(path.join(tempDir, 'etc', 'passwd'))).toBe(false);
    });
  });

  describe('copyFileWithPolicy', () => {
    it('creates new file when destination does not exist', async () => {
      const sourceFile = path.join(tempDir, 'source.md');
      const agileflowDir = path.join(tempDir, '.agileflow');
      const cfgDir = path.join(agileflowDir, '_cfg');
      const destFile = path.join(agileflowDir, 'agents', 'test.md');

      await fs.ensureDir(cfgDir);
      await fs.writeFile(sourceFile, '# Agent');

      const fileIndex = { schema: 1, files: {} };
      const fileOps = { created: 0, updated: 0, preserved: 0, stashed: 0 };

      await installer.copyFileWithPolicy(sourceFile, destFile, '.agileflow', {
        agileflowDir,
        cfgDir,
        fileIndex,
        fileOps,
        force: false,
        timestamp: '2024-01-01T12-00-00',
      });

      expect(await fs.pathExists(destFile)).toBe(true);
      expect(fileOps.created).toBe(1);
      expect(fileIndex.files['agents/test.md']).toBeDefined();
    });

    it('overwrites unchanged file with updated content', async () => {
      const sourceFile = path.join(tempDir, 'source.md');
      const agileflowDir = path.join(tempDir, '.agileflow');
      const cfgDir = path.join(agileflowDir, '_cfg');
      const destFile = path.join(agileflowDir, 'agents', 'test.md');

      await fs.ensureDir(path.join(agileflowDir, 'agents'));
      await fs.ensureDir(cfgDir);

      // Create original file
      const originalContent = '# Original';
      await fs.writeFile(sourceFile, '# Updated');
      await fs.writeFile(destFile, originalContent);

      const originalHash = await installer.hashFile(destFile);
      const fileIndex = {
        schema: 1,
        files: {
          'agents/test.md': { sha256: originalHash, protected: false },
        },
      };
      const fileOps = { created: 0, updated: 0, preserved: 0, stashed: 0 };

      await installer.copyFileWithPolicy(sourceFile, destFile, '.agileflow', {
        agileflowDir,
        cfgDir,
        fileIndex,
        fileOps,
        force: false,
        timestamp: '2024-01-01T12-00-00',
      });

      const content = await fs.readFile(destFile, 'utf8');
      expect(content).toBe('# Updated');
      expect(fileOps.updated).toBe(1);
    });

    it('preserves locally modified file and stashes update', async () => {
      const sourceFile = path.join(tempDir, 'source.md');
      const agileflowDir = path.join(tempDir, '.agileflow');
      const cfgDir = path.join(agileflowDir, '_cfg');
      const destFile = path.join(agileflowDir, 'agents', 'test.md');

      await fs.ensureDir(path.join(agileflowDir, 'agents'));
      await fs.ensureDir(cfgDir);

      // Create files with different content
      await fs.writeFile(sourceFile, '# Package Update');
      await fs.writeFile(destFile, '# User Modified');

      // File index has different hash than current file (user modified)
      const fileIndex = {
        schema: 1,
        files: {
          'agents/test.md': { sha256: 'original-hash-before-modification', protected: false },
        },
      };
      const fileOps = { created: 0, updated: 0, preserved: 0, stashed: 0, updatesPath: null };

      await installer.copyFileWithPolicy(sourceFile, destFile, '.agileflow', {
        agileflowDir,
        cfgDir,
        fileIndex,
        fileOps,
        force: false,
        timestamp: '2024-01-01T12-00-00',
      });

      // User file should be preserved
      const content = await fs.readFile(destFile, 'utf8');
      expect(content).toBe('# User Modified');
      expect(fileOps.preserved).toBe(1);
      expect(fileOps.stashed).toBe(1);
      expect(fileOps.updatesPath).toBeDefined();

      // Check stashed file
      const stashFile = path.join(cfgDir, 'updates', '2024-01-01T12-00-00', 'agents', 'test.md');
      expect(await fs.pathExists(stashFile)).toBe(true);
    });

    it('force overwrites even locally modified files', async () => {
      const sourceFile = path.join(tempDir, 'source.md');
      const agileflowDir = path.join(tempDir, '.agileflow');
      const cfgDir = path.join(agileflowDir, '_cfg');
      const destFile = path.join(agileflowDir, 'agents', 'test.md');

      await fs.ensureDir(path.join(agileflowDir, 'agents'));
      await fs.ensureDir(cfgDir);

      await fs.writeFile(sourceFile, '# Force Update');
      await fs.writeFile(destFile, '# User Modified');

      const fileIndex = { schema: 1, files: {} };
      const fileOps = { created: 0, updated: 0, preserved: 0, stashed: 0 };

      await installer.copyFileWithPolicy(sourceFile, destFile, '.agileflow', {
        agileflowDir,
        cfgDir,
        fileIndex,
        fileOps,
        force: true,
        timestamp: '2024-01-01T12-00-00',
      });

      const content = await fs.readFile(destFile, 'utf8');
      expect(content).toBe('# Force Update');
      expect(fileOps.updated).toBe(1);
      expect(fileOps.preserved).toBe(0);
    });
  });

  describe('installChangelog', () => {
    it('copies changelog to agileflow directory', async () => {
      const agileflowDir = path.join(tempDir, '.agileflow');
      await fs.ensureDir(agileflowDir);

      // Only test if changelog exists in package
      const changelogSource = path.join(installer.packageRoot, 'CHANGELOG.md');
      if (await fs.pathExists(changelogSource)) {
        await installer.installChangelog(agileflowDir);

        const changelogDest = path.join(agileflowDir, 'CHANGELOG.md');
        expect(await fs.pathExists(changelogDest)).toBe(true);
      }
    });

    it('skips if source changelog does not exist', async () => {
      const agileflowDir = path.join(tempDir, '.agileflow');
      await fs.ensureDir(agileflowDir);

      // Create installer with mock packageRoot
      const mockInstaller = new Installer();
      mockInstaller.packageRoot = path.join(tempDir, 'fake-package');

      await mockInstaller.installChangelog(agileflowDir);

      expect(await fs.pathExists(path.join(agileflowDir, 'CHANGELOG.md'))).toBe(false);
    });
  });

  describe('install (integration)', () => {
    it('performs complete installation lifecycle', async () => {
      const config = {
        directory: tempDir,
        ides: ['claude-code'],
        userName: 'TestUser',
        agileflowFolder: '.agileflow',
        docsFolder: 'docs',
      };

      const result = await installer.install(config);

      expect(result.success).toBe(true);
      expect(result.path).toBe(path.join(tempDir, '.agileflow'));
      expect(result.projectDir).toBe(tempDir);
      expect(result.counts).toBeDefined();
      expect(result.fileOps).toBeDefined();

      // Verify directory structure
      expect(await fs.pathExists(path.join(tempDir, '.agileflow'))).toBe(true);
      expect(await fs.pathExists(path.join(tempDir, '.agileflow', '_cfg'))).toBe(true);
      expect(await fs.pathExists(path.join(tempDir, '.agileflow', '_cfg', 'manifest.yaml'))).toBe(
        true
      );
      expect(await fs.pathExists(path.join(tempDir, '.agileflow', '_cfg', 'files.json'))).toBe(
        true
      );
      expect(await fs.pathExists(path.join(tempDir, '.agileflow', 'config.yaml'))).toBe(true);
    });

    it('handles reinstallation correctly', async () => {
      const config = {
        directory: tempDir,
        ides: ['claude-code'],
        userName: 'TestUser',
        agileflowFolder: '.agileflow',
        docsFolder: 'docs',
      };

      // First installation
      const result1 = await installer.install(config);
      expect(result1.success).toBe(true);

      // Second installation (update)
      const result2 = await installer.install(config);
      expect(result2.success).toBe(true);

      // Config should have updated_at now
      const configPath = path.join(tempDir, '.agileflow', 'config.yaml');
      const configContent = await fs.readFile(configPath, 'utf8');
      const parsedConfig = safeLoad(configContent);
      expect(parsedConfig.updated_at).toBeDefined();
    });

    it('respects force option', async () => {
      const config = {
        directory: tempDir,
        ides: ['claude-code'],
        userName: 'TestUser',
        agileflowFolder: '.agileflow',
        docsFolder: 'docs',
      };

      // First installation
      await installer.install(config);

      // Modify a file
      const agentPath = path.join(tempDir, '.agileflow', 'agents');
      if (await fs.pathExists(agentPath)) {
        const files = await fs.readdir(agentPath);
        if (files.length > 0) {
          await fs.writeFile(path.join(agentPath, files[0]), '# User modifications');
        }
      }

      // Force reinstall
      const result = await installer.install(config, { force: true });
      expect(result.success).toBe(true);
      expect(result.fileOps.force).toBe(true);
    });
  });
});
