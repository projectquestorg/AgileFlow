/**
 * Tests for _base-ide.js
 *
 * Tests the BaseIdeSetup class functionality
 */

const fs = require('fs-extra');
const path = require('path');
const os = require('os');

const { BaseIdeSetup } = require('../../../tools/cli/installers/ide/_base-ide');

describe('BaseIdeSetup', () => {
  let tempDir;
  let baseSetup;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'base-ide-test-'));
    baseSetup = new BaseIdeSetup('test-ide', 'Test IDE', false);
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('constructor', () => {
    it('sets name and displayName correctly', () => {
      expect(baseSetup.name).toBe('test-ide');
      expect(baseSetup.displayName).toBe('Test IDE');
      expect(baseSetup.preferred).toBe(false);
    });

    it('uses name as displayName when not provided', () => {
      const setup = new BaseIdeSetup('my-ide');
      expect(setup.displayName).toBe('my-ide');
    });

    it('sets default folder names', () => {
      expect(baseSetup.agileflowFolder).toBe('.agileflow');
      expect(baseSetup.docsFolder).toBe('docs');
    });
  });

  describe('setAgileflowFolder', () => {
    it('updates agileflowFolder', () => {
      baseSetup.setAgileflowFolder('.custom-agileflow');
      expect(baseSetup.agileflowFolder).toBe('.custom-agileflow');
    });
  });

  describe('setDocsFolder', () => {
    it('updates docsFolder', () => {
      baseSetup.setDocsFolder('documentation');
      expect(baseSetup.docsFolder).toBe('documentation');
    });
  });

  describe('replaceDocsReferences', () => {
    it('returns content unchanged when docsFolder is default', () => {
      const content = 'See docs/README.md for more info';
      expect(baseSetup.replaceDocsReferences(content)).toBe(content);
    });

    it('replaces docs/ references with custom folder', () => {
      baseSetup.setDocsFolder('documentation');
      const content = 'See docs/README.md for more info';
      expect(baseSetup.replaceDocsReferences(content)).toBe(
        'See documentation/README.md for more info'
      );
    });

    it('replaces multiple variations', () => {
      baseSetup.setDocsFolder('doc');
      const content = `
        Path: docs/file.md
        Backtick: \`docs/file.md\`
        Quote: "docs/file.md"
        Single: 'docs/file.md'
        Paren: (docs/file.md)
      `;
      const result = baseSetup.replaceDocsReferences(content);
      expect(result).toContain('doc/file.md');
      expect(result).not.toContain('docs/');
    });
  });

  describe('getVersion', () => {
    it('returns version string', () => {
      const version = baseSetup.getVersion();
      expect(typeof version).toBe('string');
      expect(version).not.toBe('');
    });
  });

  describe('setup', () => {
    it('throws error when not implemented', async () => {
      await expect(baseSetup.setup(tempDir, tempDir)).rejects.toThrow(
        'setup() must be implemented by test-ide handler'
      );
    });
  });

  describe('cleanup', () => {
    it('removes agileflow command directories', async () => {
      baseSetup.configDir = '.test-ide';

      // Create old installation directories
      const commandsPath = path.join(tempDir, '.test-ide', 'commands', 'agileflow');
      const commandsPathOld = path.join(tempDir, '.test-ide', 'commands', 'AgileFlow');
      await fs.ensureDir(commandsPath);
      await fs.ensureDir(commandsPathOld);
      await fs.writeFile(path.join(commandsPath, 'test.md'), 'content');
      await fs.writeFile(path.join(commandsPathOld, 'test.md'), 'content');

      await baseSetup.cleanup(tempDir);

      expect(await fs.pathExists(commandsPath)).toBe(false);
      expect(await fs.pathExists(commandsPathOld)).toBe(false);
    });

    it('handles missing directories gracefully', async () => {
      baseSetup.configDir = '.missing';
      // Should not throw
      await expect(baseSetup.cleanup(tempDir)).resolves.not.toThrow();
    });
  });

  describe('detect', () => {
    it('returns true when config directory exists', async () => {
      baseSetup.configDir = '.test-ide';
      await fs.ensureDir(path.join(tempDir, '.test-ide'));

      const detected = await baseSetup.detect(tempDir);
      expect(detected).toBe(true);
    });

    it('returns false when config directory does not exist', async () => {
      baseSetup.configDir = '.test-ide';

      const detected = await baseSetup.detect(tempDir);
      expect(detected).toBe(false);
    });

    it('returns false when configDir is not set', async () => {
      baseSetup.configDir = null;

      const detected = await baseSetup.detect(tempDir);
      expect(detected).toBe(false);
    });
  });

  describe('ensureDir', () => {
    it('creates directory if not exists', async () => {
      const dirPath = path.join(tempDir, 'new', 'nested', 'dir');
      await baseSetup.ensureDir(dirPath);
      expect(await fs.pathExists(dirPath)).toBe(true);
    });

    it('does not fail if directory exists', async () => {
      const dirPath = path.join(tempDir, 'existing');
      await fs.ensureDir(dirPath);
      await expect(baseSetup.ensureDir(dirPath)).resolves.not.toThrow();
    });
  });

  describe('writeFile and readFile', () => {
    it('writes and reads file content', async () => {
      const filePath = path.join(tempDir, 'test.txt');
      const content = 'Hello, World!';

      await baseSetup.writeFile(filePath, content);
      const result = await baseSetup.readFile(filePath);

      expect(result).toBe(content);
    });
  });

  describe('exists', () => {
    it('returns true for existing file', async () => {
      const filePath = path.join(tempDir, 'exists.txt');
      await fs.writeFile(filePath, 'content');

      const result = await baseSetup.exists(filePath);
      expect(result).toBe(true);
    });

    it('returns false for non-existing file', async () => {
      const filePath = path.join(tempDir, 'not-exists.txt');

      const result = await baseSetup.exists(filePath);
      expect(result).toBe(false);
    });
  });

  describe('scanDirectory', () => {
    it('returns files with matching extension', async () => {
      const dirPath = path.join(tempDir, 'scan');
      await fs.ensureDir(dirPath);
      await fs.writeFile(path.join(dirPath, 'file1.md'), 'content');
      await fs.writeFile(path.join(dirPath, 'file2.md'), 'content');
      await fs.writeFile(path.join(dirPath, 'file3.txt'), 'content');

      const results = await baseSetup.scanDirectory(dirPath, '.md');

      expect(results).toHaveLength(2);
      expect(results.map(r => r.name)).toContain('file1');
      expect(results.map(r => r.name)).toContain('file2');
      expect(results.map(r => r.name)).not.toContain('file3');
    });

    it('returns empty array for non-existing directory', async () => {
      const results = await baseSetup.scanDirectory(path.join(tempDir, 'non-existing'), '.md');
      expect(results).toEqual([]);
    });

    it('ignores subdirectories', async () => {
      const dirPath = path.join(tempDir, 'scan2');
      await fs.ensureDir(dirPath);
      await fs.writeFile(path.join(dirPath, 'file.md'), 'content');
      await fs.ensureDir(path.join(dirPath, 'subdir'));

      const results = await baseSetup.scanDirectory(dirPath, '.md');

      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('file');
    });
  });

  describe('installCommandsRecursive', () => {
    it('installs markdown files from source to target', async () => {
      const sourceDir = path.join(tempDir, 'source');
      const targetDir = path.join(tempDir, 'target');
      const agileflowDir = path.join(tempDir, 'agileflow');

      await fs.ensureDir(sourceDir);
      await fs.ensureDir(agileflowDir);
      await fs.writeFile(path.join(sourceDir, 'cmd1.md'), '# Command 1');
      await fs.writeFile(path.join(sourceDir, 'cmd2.md'), '# Command 2');

      const result = await baseSetup.installCommandsRecursive(sourceDir, targetDir, agileflowDir);

      expect(result.commands).toBe(2);
      expect(await fs.pathExists(path.join(targetDir, 'cmd1.md'))).toBe(true);
      expect(await fs.pathExists(path.join(targetDir, 'cmd2.md'))).toBe(true);
    });

    it('recursively processes subdirectories', async () => {
      const sourceDir = path.join(tempDir, 'source');
      const targetDir = path.join(tempDir, 'target');
      const agileflowDir = path.join(tempDir, 'agileflow');

      await fs.ensureDir(path.join(sourceDir, 'subdir'));
      await fs.ensureDir(agileflowDir);
      await fs.writeFile(path.join(sourceDir, 'root.md'), '# Root');
      await fs.writeFile(path.join(sourceDir, 'subdir', 'nested.md'), '# Nested');

      const result = await baseSetup.installCommandsRecursive(sourceDir, targetDir, agileflowDir);

      expect(result.commands).toBe(2);
      expect(result.subdirs).toBe(1);
      expect(await fs.pathExists(path.join(targetDir, 'root.md'))).toBe(true);
      expect(await fs.pathExists(path.join(targetDir, 'subdir', 'nested.md'))).toBe(true);
    });

    it('returns zero counts for non-existing source', async () => {
      const result = await baseSetup.installCommandsRecursive(
        path.join(tempDir, 'non-existing'),
        path.join(tempDir, 'target'),
        tempDir
      );

      expect(result.commands).toBe(0);
      expect(result.subdirs).toBe(0);
    });

    it('replaces docs references in content', async () => {
      const sourceDir = path.join(tempDir, 'source');
      const targetDir = path.join(tempDir, 'target');
      const agileflowDir = path.join(tempDir, 'agileflow');

      await fs.ensureDir(sourceDir);
      await fs.ensureDir(agileflowDir);
      await fs.writeFile(path.join(sourceDir, 'cmd.md'), 'See docs/README.md');

      baseSetup.setDocsFolder('documentation');

      await baseSetup.installCommandsRecursive(sourceDir, targetDir, agileflowDir);

      const content = await fs.readFile(path.join(targetDir, 'cmd.md'), 'utf8');
      expect(content).toBe('See documentation/README.md');
    });

    it('ignores non-markdown files', async () => {
      const sourceDir = path.join(tempDir, 'source');
      const targetDir = path.join(tempDir, 'target');
      const agileflowDir = path.join(tempDir, 'agileflow');

      await fs.ensureDir(sourceDir);
      await fs.ensureDir(agileflowDir);
      await fs.writeFile(path.join(sourceDir, 'cmd.md'), '# Command');
      await fs.writeFile(path.join(sourceDir, 'ignore.txt'), 'ignored');

      const result = await baseSetup.installCommandsRecursive(sourceDir, targetDir, agileflowDir);

      expect(result.commands).toBe(1);
      expect(await fs.pathExists(path.join(targetDir, 'ignore.txt'))).toBe(false);
    });
  });
});
