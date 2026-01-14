/**
 * Tests for PathResolver - Unified Path Resolution Service
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const yaml = require('js-yaml');
const {
  PathResolver,
  getDefaultResolver,
  getAllPaths,
  getProjectRoot,
  getAgileflowDir,
  getDocsDir,
} = require('../../lib/path-resolver');

describe('PathResolver', () => {
  let testDir;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'path-resolver-test-'));
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  describe('constructor', () => {
    it('accepts explicit project root', () => {
      const resolver = new PathResolver(testDir);
      expect(resolver.getProjectRoot()).toBe(testDir);
    });

    it('uses defaults when no manifest exists', () => {
      const resolver = new PathResolver(testDir, { autoDetect: false });
      expect(resolver.getAgileflowDir()).toBe(path.join(testDir, '.agileflow'));
      expect(resolver.getDocsDir()).toBe(path.join(testDir, 'docs'));
    });

    it('accepts custom default folder names', () => {
      const resolver = new PathResolver(testDir, {
        autoDetect: false,
        agileflowFolder: 'custom-agileflow',
        docsFolder: 'custom-docs',
      });
      expect(resolver.getAgileflowDir()).toBe(path.join(testDir, 'custom-agileflow'));
      expect(resolver.getDocsDir()).toBe(path.join(testDir, 'custom-docs'));
    });
  });

  describe('manifest loading', () => {
    it('loads folder names from manifest.yaml', () => {
      // Create .agileflow/_cfg/manifest.yaml
      const manifestDir = path.join(testDir, '.agileflow', '_cfg');
      fs.mkdirSync(manifestDir, { recursive: true });
      fs.writeFileSync(
        path.join(manifestDir, 'manifest.yaml'),
        yaml.dump({
          version: '2.89.0',
          agileflow_folder: '.agileflow',
          docs_folder: 'documentation',
        })
      );

      const resolver = new PathResolver(testDir, { autoDetect: false });
      expect(resolver.getDocsDir()).toBe(path.join(testDir, 'documentation'));
    });

    it('caches manifest data', () => {
      const manifestDir = path.join(testDir, '.agileflow', '_cfg');
      fs.mkdirSync(manifestDir, { recursive: true });
      fs.writeFileSync(
        path.join(manifestDir, 'manifest.yaml'),
        yaml.dump({ docs_folder: 'cached-docs' })
      );

      const resolver = new PathResolver(testDir, { autoDetect: false });

      // First call
      const docs1 = resolver.getDocsDir();

      // Modify manifest
      fs.writeFileSync(
        path.join(manifestDir, 'manifest.yaml'),
        yaml.dump({ docs_folder: 'new-docs' })
      );

      // Second call should use cache
      const docs2 = resolver.getDocsDir();
      expect(docs2).toBe(docs1);

      // Clear cache and verify new value
      resolver.clearCache();
      const docs3 = resolver.getDocsDir();
      expect(docs3).toBe(path.join(testDir, 'new-docs'));
    });

    it('handles invalid manifest gracefully', () => {
      const manifestDir = path.join(testDir, '.agileflow', '_cfg');
      fs.mkdirSync(manifestDir, { recursive: true });
      fs.writeFileSync(path.join(manifestDir, 'manifest.yaml'), 'not: valid: yaml: {{');

      const resolver = new PathResolver(testDir, { autoDetect: false });
      // Should use defaults instead of throwing
      expect(resolver.getDocsDir()).toBe(path.join(testDir, 'docs'));
    });
  });

  describe('path getters', () => {
    let resolver;

    beforeEach(() => {
      resolver = new PathResolver(testDir, { autoDetect: false });
    });

    it('getProjectRoot returns project root', () => {
      expect(resolver.getProjectRoot()).toBe(testDir);
    });

    it('getAgileflowDir returns agileflow directory', () => {
      expect(resolver.getAgileflowDir()).toBe(path.join(testDir, '.agileflow'));
    });

    it('getDocsDir returns docs directory', () => {
      expect(resolver.getDocsDir()).toBe(path.join(testDir, 'docs'));
    });

    it('getClaudeDir returns .claude directory', () => {
      expect(resolver.getClaudeDir()).toBe(path.join(testDir, '.claude'));
    });

    it('getStatusPath returns status.json path', () => {
      expect(resolver.getStatusPath()).toBe(path.join(testDir, 'docs', '09-agents', 'status.json'));
    });

    it('getSessionStatePath returns session-state.json path', () => {
      expect(resolver.getSessionStatePath()).toBe(
        path.join(testDir, 'docs', '09-agents', 'session-state.json')
      );
    });

    it('getMetadataPath returns metadata.json path', () => {
      expect(resolver.getMetadataPath()).toBe(
        path.join(testDir, 'docs', '00-meta', 'agileflow-metadata.json')
      );
    });

    it('getConfigPath returns config.yaml path', () => {
      expect(resolver.getConfigPath()).toBe(path.join(testDir, '.agileflow', 'config.yaml'));
    });

    it('getManifestPath returns manifest.yaml path', () => {
      expect(resolver.getManifestPath()).toBe(
        path.join(testDir, '.agileflow', '_cfg', 'manifest.yaml')
      );
    });

    it('getScriptsDir returns scripts directory', () => {
      expect(resolver.getScriptsDir()).toBe(path.join(testDir, '.agileflow', 'scripts'));
    });

    it('getCommandsDir returns commands directory', () => {
      expect(resolver.getCommandsDir()).toBe(path.join(testDir, '.agileflow', 'commands'));
    });

    it('getAgentsDir returns agents directory', () => {
      expect(resolver.getAgentsDir()).toBe(path.join(testDir, '.agileflow', 'agents'));
    });
  });

  describe('getAllPaths', () => {
    it('returns all paths in one call', () => {
      const resolver = new PathResolver(testDir, { autoDetect: false });
      const paths = resolver.getAllPaths();

      expect(paths.projectRoot).toBe(testDir);
      expect(paths.agileflowDir).toBe(path.join(testDir, '.agileflow'));
      expect(paths.docsDir).toBe(path.join(testDir, 'docs'));
      expect(paths.claudeDir).toBe(path.join(testDir, '.claude'));
      expect(paths.statusPath).toBeDefined();
      expect(paths.sessionStatePath).toBeDefined();
      expect(paths.metadataPath).toBeDefined();
      expect(paths.configPath).toBeDefined();
      expect(paths.manifestPath).toBeDefined();
      expect(paths.scriptsDir).toBeDefined();
      expect(paths.commandsDir).toBeDefined();
      expect(paths.agentsDir).toBeDefined();
    });
  });

  describe('isAgileflowProject', () => {
    it('returns false when no agileflow directory exists', () => {
      const resolver = new PathResolver(testDir, { autoDetect: false });
      expect(resolver.isAgileflowProject()).toBe(false);
    });

    it('returns true when agileflow directory exists', () => {
      fs.mkdirSync(path.join(testDir, '.agileflow'), { recursive: true });
      const resolver = new PathResolver(testDir, { autoDetect: false });
      expect(resolver.isAgileflowProject()).toBe(true);
    });
  });

  describe('validatePath', () => {
    it('validates paths within project root', () => {
      const resolver = new PathResolver(testDir, { autoDetect: false });
      const result = resolver.validatePath(path.join(testDir, 'subdir', 'file.txt'));

      expect(result.ok).toBe(true);
    });

    it('rejects paths outside project root', () => {
      const resolver = new PathResolver(testDir, { autoDetect: false });
      const result = resolver.validatePath(path.join(testDir, '..', 'outside.txt'));

      expect(result.ok).toBe(false);
    });
  });

  describe('resolve', () => {
    it('resolves relative paths within project', () => {
      const resolver = new PathResolver(testDir, { autoDetect: false });
      expect(resolver.resolve('src', 'index.js')).toBe(path.join(testDir, 'src', 'index.js'));
    });
  });

  describe('relative', () => {
    it('returns path relative to project root', () => {
      const resolver = new PathResolver(testDir, { autoDetect: false });
      const absolutePath = path.join(testDir, 'src', 'index.js');
      expect(resolver.relative(absolutePath)).toBe(path.join('src', 'index.js'));
    });
  });

  describe('getFolderNames', () => {
    it('returns folder names from configuration', () => {
      const manifestDir = path.join(testDir, '.agileflow', '_cfg');
      fs.mkdirSync(manifestDir, { recursive: true });
      fs.writeFileSync(
        path.join(manifestDir, 'manifest.yaml'),
        yaml.dump({
          agileflow_folder: '.agileflow',
          docs_folder: 'my-docs',
        })
      );

      const resolver = new PathResolver(testDir, { autoDetect: false });
      const names = resolver.getFolderNames();

      expect(names.agileflowFolder).toBe('.agileflow');
      expect(names.docsFolder).toBe('my-docs');
    });
  });
});

describe('Module exports', () => {
  describe('getDefaultResolver', () => {
    it('returns singleton instance', () => {
      const resolver1 = getDefaultResolver();
      const resolver2 = getDefaultResolver();
      expect(resolver1).toBe(resolver2);
    });

    it('creates new instance when forceNew is true', () => {
      const resolver1 = getDefaultResolver();
      const resolver2 = getDefaultResolver(true);
      expect(resolver1).not.toBe(resolver2);
    });
  });

  describe('convenience functions', () => {
    it('getAllPaths returns paths object', () => {
      const paths = getAllPaths();
      expect(paths.projectRoot).toBeDefined();
      expect(paths.agileflowDir).toBeDefined();
      expect(paths.docsDir).toBeDefined();
    });

    it('getProjectRoot returns string', () => {
      expect(typeof getProjectRoot()).toBe('string');
    });

    it('getAgileflowDir returns string', () => {
      expect(typeof getAgileflowDir()).toBe('string');
    });

    it('getDocsDir returns string', () => {
      expect(typeof getDocsDir()).toBe('string');
    });
  });
});
