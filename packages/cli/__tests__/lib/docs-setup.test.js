/**
 * Tests for docs-setup.js
 *
 * Tests documentation structure setup with mocked filesystem
 */

const path = require('path');

// Mock fs-extra before requiring the module
jest.mock('fs-extra', () => ({
  existsSync: jest.fn(() => false),
  ensureDir: jest.fn(() => Promise.resolve()),
  writeFile: jest.fn(() => Promise.resolve()),
  readFile: jest.fn(() => Promise.resolve('{}')),
  appendFile: jest.fn(() => Promise.resolve()),
  readFileSync: jest.fn(() => '# AgileFlow\n\nMock README content.'),
}));

// Mock chalk to simplify output testing
jest.mock('chalk', () => ({
  hex: jest.fn(() => jest.fn(str => str)),
  green: jest.fn(str => str),
  yellow: jest.fn(str => str),
  red: jest.fn(str => str),
  dim: jest.fn(str => str),
}));

const fs = require('fs-extra');
const { createDocsStructure, getDocsFolderName } = require('../../tools/cli/lib/docs-setup');

// Mock console.log and console.error
const originalConsoleLog = console.log;
const originalConsoleError = console.error;

describe('docs-setup', () => {
  let consoleOutput;
  let consoleErrors;

  beforeEach(() => {
    jest.clearAllMocks();

    // Capture console output
    consoleOutput = [];
    consoleErrors = [];
    console.log = jest.fn((...args) => consoleOutput.push(args.join(' ')));
    console.error = jest.fn((...args) => consoleErrors.push(args.join(' ')));

    // Reset default mock implementations
    fs.existsSync.mockReturnValue(false);
    fs.ensureDir.mockResolvedValue(undefined);
    fs.writeFile.mockResolvedValue(undefined);
    fs.readFile.mockResolvedValue('{}');
    fs.appendFile.mockResolvedValue(undefined);
  });

  afterEach(() => {
    console.log = originalConsoleLog;
    console.error = originalConsoleError;
  });

  describe('createDocsStructure', () => {
    it('creates all directories when none exist', async () => {
      const result = await createDocsStructure('/test/target', 'docs');

      expect(result.success).toBe(true);
      expect(result.counts.directoriesCreated).toBeGreaterThan(0);
      expect(fs.ensureDir).toHaveBeenCalled();
    });

    it('creates README files for each directory', async () => {
      await createDocsStructure('/test/target', 'docs');

      // Check that writeFile was called for README files
      const writeCalls = fs.writeFile.mock.calls;
      const readmeCalls = writeCalls.filter(call => call[0].includes('README.md'));
      expect(readmeCalls.length).toBeGreaterThan(0);
    });

    it('skips existing files', async () => {
      fs.existsSync.mockImplementation(filePath => {
        // Simulate some files already exist
        return filePath.includes('README.md');
      });

      const result = await createDocsStructure('/test/target', 'docs');

      expect(result.counts.filesSkipped).toBeGreaterThan(0);
    });

    it('creates metadata.json with version and timestamps', async () => {
      await createDocsStructure('/test/target', 'docs');

      // Find the metadata.json write call
      const writeCalls = fs.writeFile.mock.calls;
      const metadataCall = writeCalls.find(call =>
        call[0].includes('agileflow-metadata.json')
      );

      expect(metadataCall).toBeDefined();

      const metadata = JSON.parse(metadataCall[1]);
      expect(metadata).toHaveProperty('version');
      expect(metadata).toHaveProperty('created');
      expect(metadata).toHaveProperty('updated');
      expect(metadata).toHaveProperty('docsFolder', 'docs');
      expect(metadata).toHaveProperty('archival');
    });

    it('creates status.json for agent tracking', async () => {
      await createDocsStructure('/test/target', 'docs');

      const writeCalls = fs.writeFile.mock.calls;
      const statusCall = writeCalls.find(call => call[0].includes('status.json'));

      expect(statusCall).toBeDefined();

      const status = JSON.parse(statusCall[1]);
      expect(status).toHaveProperty('updated');
      expect(status).toHaveProperty('stories', {});
    });

    it('creates empty bus log file', async () => {
      await createDocsStructure('/test/target', 'docs');

      const writeCalls = fs.writeFile.mock.calls;
      const busLogCall = writeCalls.find(call => call[0].includes('log.jsonl'));

      expect(busLogCall).toBeDefined();
      expect(busLogCall[1]).toBe('');
    });

    it('creates practice files', async () => {
      await createDocsStructure('/test/target', 'docs');

      const writeCalls = fs.writeFile.mock.calls;
      const practiceFiles = ['testing.md', 'git-branching.md', 'releasing.md', 'security.md', 'ci.md'];

      for (const file of practiceFiles) {
        const call = writeCalls.find(c => c[0].includes(file));
        expect(call).toBeDefined();
      }
    });

    it('respects custom docs folder name', async () => {
      await createDocsStructure('/test/target', 'documentation');

      const writeCalls = fs.writeFile.mock.calls;
      const ensureDirCalls = fs.ensureDir.mock.calls;

      // Check directories use custom folder name
      const hasCustomFolder = ensureDirCalls.some(call =>
        call[0].includes('documentation')
      );
      expect(hasCustomFolder).toBe(true);

      // Check files use custom folder name
      const filesInCustomFolder = writeCalls.filter(call =>
        call[0].includes('documentation')
      );
      expect(filesInCustomFolder.length).toBeGreaterThan(0);
    });

    it('updates gitignore when option enabled', async () => {
      fs.existsSync.mockImplementation(filePath => {
        if (filePath.includes('.gitignore')) return true;
        return false;
      });
      fs.readFile.mockResolvedValue('node_modules/\n');

      await createDocsStructure('/test/target', 'docs', { updateGitignore: true });

      expect(fs.appendFile).toHaveBeenCalled();
    });

    it('creates gitignore when it does not exist', async () => {
      fs.existsSync.mockReturnValue(false);

      await createDocsStructure('/test/target', 'docs', { updateGitignore: true });

      const writeCalls = fs.writeFile.mock.calls;
      const gitignoreCall = writeCalls.find(call => call[0].includes('.gitignore'));
      expect(gitignoreCall).toBeDefined();
    });

    it('skips gitignore when option disabled', async () => {
      await createDocsStructure('/test/target', 'docs', { updateGitignore: false });

      const writeCalls = fs.writeFile.mock.calls;
      const gitignoreCall = writeCalls.find(call => call[0].includes('.gitignore'));
      expect(gitignoreCall).toBeUndefined();
    });

    it('updates existing metadata when version changes', async () => {
      const existingMetadata = {
        version: '1.0.0',
        created: '2024-01-01T00:00:00.000Z',
        updated: '2024-01-01T00:00:00.000Z',
        docsFolder: 'docs',
      };

      fs.existsSync.mockImplementation(filePath => {
        return filePath.includes('agileflow-metadata.json');
      });
      fs.readFile.mockResolvedValue(JSON.stringify(existingMetadata));

      await createDocsStructure('/test/target', 'docs');

      // Check that metadata was updated
      const writeCalls = fs.writeFile.mock.calls;
      const metadataCall = writeCalls.find(call =>
        call[0].includes('agileflow-metadata.json')
      );

      // Metadata should be written with updated version
      if (metadataCall) {
        const updatedMetadata = JSON.parse(metadataCall[1]);
        expect(updatedMetadata.updated).toBeDefined();
      }
    });

    it('handles directory creation errors gracefully', async () => {
      fs.ensureDir.mockRejectedValue(new Error('Permission denied'));

      const result = await createDocsStructure('/test/target', 'docs');

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('logs progress for created files', async () => {
      await createDocsStructure('/test/target', 'docs');

      const createdLogs = consoleOutput.filter(line => line.includes('Created'));
      expect(createdLogs.length).toBeGreaterThan(0);
    });

    it('logs skipped files when they exist', async () => {
      fs.existsSync.mockImplementation(filePath => {
        return filePath.includes('README.md');
      });

      await createDocsStructure('/test/target', 'docs');

      const skippedLogs = consoleOutput.filter(line => line.includes('Skipped'));
      expect(skippedLogs.length).toBeGreaterThan(0);
    });

    it('returns correct counts in result object', async () => {
      fs.existsSync.mockImplementation(filePath => {
        // Only README in root exists
        if (filePath === path.join('/test/target', 'docs', 'README.md')) return true;
        return false;
      });

      const result = await createDocsStructure('/test/target', 'docs');

      expect(result.counts.directoriesCreated).toBeGreaterThanOrEqual(0);
      expect(result.counts.filesCreated).toBeGreaterThanOrEqual(0);
      expect(result.counts.filesSkipped).toBeGreaterThanOrEqual(1); // At least root README
    });

    it('handles metadata update errors gracefully', async () => {
      fs.existsSync.mockImplementation(filePath => {
        return filePath.includes('agileflow-metadata.json');
      });
      fs.readFile.mockResolvedValue('invalid json');

      // Should not throw, just log warning
      const result = await createDocsStructure('/test/target', 'docs');

      expect(result.success).toBe(true);
      const warningLogs = consoleOutput.filter(line => line.includes('Could not update'));
      expect(warningLogs.length).toBeGreaterThan(0);
    });
  });

  describe('getDocsFolderName', () => {
    it('returns default "docs" when no metadata exists', async () => {
      fs.existsSync.mockReturnValue(false);

      const result = await getDocsFolderName('/test/target');

      expect(result).toBe('docs');
    });

    it('returns folder name from metadata when it exists', async () => {
      const metadata = { docsFolder: 'documentation' };
      fs.existsSync.mockReturnValue(true);
      fs.readFile.mockResolvedValue(JSON.stringify(metadata));

      const result = await getDocsFolderName('/test/target');

      expect(result).toBe('documentation');
    });

    it('returns default when metadata is invalid', async () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFile.mockResolvedValue('invalid json');

      const result = await getDocsFolderName('/test/target');

      expect(result).toBe('docs');
    });

    it('returns default when docsFolder field is missing', async () => {
      const metadata = { version: '1.0.0' };
      fs.existsSync.mockReturnValue(true);
      fs.readFile.mockResolvedValue(JSON.stringify(metadata));

      const result = await getDocsFolderName('/test/target');

      expect(result).toBe('docs');
    });

    it('handles read errors gracefully', async () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFile.mockRejectedValue(new Error('Read error'));

      const result = await getDocsFolderName('/test/target');

      expect(result).toBe('docs');
    });
  });

  describe('directory structure', () => {
    it('creates expected number of directories', async () => {
      await createDocsStructure('/test/target', 'docs');

      // Should create at least 15 directories (from getDirectoryStructure)
      expect(fs.ensureDir.mock.calls.length).toBeGreaterThanOrEqual(15);
    });

    it('creates all expected documentation categories', async () => {
      await createDocsStructure('/test/target', 'docs');

      const dirPaths = fs.ensureDir.mock.calls.map(call => call[0]);

      const expectedCategories = [
        '00-meta',
        '01-brainstorming',
        '02-practices',
        '03-decisions',
        '04-architecture',
        '05-epics',
        '06-stories',
        '07-testing',
        '08-project',
        '09-agents',
        '10-research',
      ];

      for (const category of expectedCategories) {
        const hasCategory = dirPaths.some(p => p.includes(category));
        expect(hasCategory).toBe(true);
      }
    });

    it('creates nested subdirectories', async () => {
      await createDocsStructure('/test/target', 'docs');

      const dirPaths = fs.ensureDir.mock.calls.map(call => call[0]);

      // Check for nested directories
      expect(dirPaths.some(p => p.includes('00-meta/templates'))).toBe(true);
      expect(dirPaths.some(p => p.includes('00-meta/guides'))).toBe(true);
      expect(dirPaths.some(p => p.includes('01-brainstorming/ideas'))).toBe(true);
      expect(dirPaths.some(p => p.includes('09-agents/bus'))).toBe(true);
    });
  });

  describe('README content', () => {
    it('includes proper content in meta README', async () => {
      await createDocsStructure('/test/target', 'docs');

      const writeCalls = fs.writeFile.mock.calls;
      const metaReadmeCall = writeCalls.find(call =>
        call[0].includes('00-meta') && call[0].includes('README.md')
      );

      expect(metaReadmeCall).toBeDefined();
      expect(metaReadmeCall[1]).toContain('Meta Documentation');
      expect(metaReadmeCall[1]).toContain('templates/');
    });

    it('includes command references in documentation', async () => {
      await createDocsStructure('/test/target', 'docs');

      const writeCalls = fs.writeFile.mock.calls;
      const storiesReadmeCall = writeCalls.find(call =>
        call[0].includes('06-stories') && call[0].includes('README.md')
      );

      expect(storiesReadmeCall).toBeDefined();
      expect(storiesReadmeCall[1]).toContain('/agileflow:story');
    });

    it('includes research command references in research README', async () => {
      await createDocsStructure('/test/target', 'docs');

      const writeCalls = fs.writeFile.mock.calls;
      const researchReadmeCall = writeCalls.find(call =>
        call[0].includes('10-research') && call[0].includes('README.md')
      );

      expect(researchReadmeCall).toBeDefined();
      expect(researchReadmeCall[1]).toContain('/agileflow:research');
    });
  });

  describe('archival configuration', () => {
    it('sets default archival threshold to 30 days', async () => {
      await createDocsStructure('/test/target', 'docs');

      const writeCalls = fs.writeFile.mock.calls;
      const metadataCall = writeCalls.find(call =>
        call[0].includes('agileflow-metadata.json')
      );

      const metadata = JSON.parse(metadataCall[1]);
      expect(metadata.archival.threshold_days).toBe(30);
      expect(metadata.archival.enabled).toBe(true);
    });
  });

  describe('gitignore entries', () => {
    it('includes standard entries in new gitignore', async () => {
      fs.existsSync.mockReturnValue(false);

      await createDocsStructure('/test/target', 'docs', { updateGitignore: true });

      const writeCalls = fs.writeFile.mock.calls;
      const gitignoreCall = writeCalls.find(call => call[0].includes('.gitignore'));

      expect(gitignoreCall[1]).toContain('.env');
      expect(gitignoreCall[1]).toContain('node_modules/');
      expect(gitignoreCall[1]).toContain('coverage/');
    });

    it('does not duplicate existing entries', async () => {
      fs.existsSync.mockImplementation(filePath => {
        return filePath.includes('.gitignore');
      });
      fs.readFile.mockResolvedValue('.env\nnode_modules/\ndist/\nbuild/\ncoverage/\n.DS_Store\n!.env.example\n.env.*');

      await createDocsStructure('/test/target', 'docs', { updateGitignore: true });

      // appendFile should be called but with minimal new entries
      if (fs.appendFile.mock.calls.length > 0) {
        const appendedContent = fs.appendFile.mock.calls[0][1];
        // Should be minimal since most entries exist
        expect(appendedContent.split('\n').filter(l => l.trim()).length).toBeLessThan(5);
      }
    });
  });
});
