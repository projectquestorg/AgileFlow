/**
 * Tests for lib/feature-flags.js
 *
 * Feature flag detection for Agent Teams and other experimental features.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

jest.mock('../../lib/paths', () => ({
  getProjectRoot: jest.fn(() => '/test/project'),
  getStatusPath: jest.fn(root => `${root || '/test/project'}/docs/09-agents/status.json`),
  getSessionStatePath: jest.fn(
    root => `${root || '/test/project'}/docs/09-agents/session-state.json`
  ),
  getMetadataPath: jest.fn(
    root => `${root || '/test/project'}/docs/00-meta/agileflow-metadata.json`
  ),
}));

// Must clear the require cache between tests to reset lazy-loaded modules
delete require.cache[require.resolve('../../lib/feature-flags')];

describe('feature-flags.js', () => {
  let testDir;
  let originalEnv;

  beforeEach(() => {
    // Save original environment
    originalEnv = process.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS;
    delete process.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS;

    // Create temp directory
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agileflow-feature-flags-test-'));

    // Create metadata directory structure
    fs.mkdirSync(path.join(testDir, 'docs', '00-meta'), { recursive: true });

    // Reset require cache to get fresh module
    delete require.cache[require.resolve('../../lib/feature-flags')];
  });

  afterEach(() => {
    // Restore environment
    if (originalEnv !== undefined) {
      process.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS = originalEnv;
    } else {
      delete process.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS;
    }

    // Clean up test directory
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }

    // Reset require cache
    delete require.cache[require.resolve('../../lib/feature-flags')];
  });

  describe('isAgentTeamsEnabled()', () => {
    test('returns false when env var not set and metadata not present', () => {
      const featureFlags = require('../../lib/feature-flags');
      const result = featureFlags.isAgentTeamsEnabled({ rootDir: testDir });
      expect(result).toBe(false);
    });

    test('returns true when CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1', () => {
      process.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS = '1';
      delete require.cache[require.resolve('../../lib/feature-flags')];

      const featureFlags = require('../../lib/feature-flags');
      const result = featureFlags.isAgentTeamsEnabled();
      expect(result).toBe(true);
    });

    test('returns true when CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=true', () => {
      process.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS = 'true';
      delete require.cache[require.resolve('../../lib/feature-flags')];

      const featureFlags = require('../../lib/feature-flags');
      const result = featureFlags.isAgentTeamsEnabled();
      expect(result).toBe(true);
    });

    test('returns true when CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=yes', () => {
      process.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS = 'yes';
      delete require.cache[require.resolve('../../lib/feature-flags')];

      const featureFlags = require('../../lib/feature-flags');
      const result = featureFlags.isAgentTeamsEnabled();
      expect(result).toBe(true);
    });

    test('returns false when CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=0', () => {
      process.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS = '0';
      delete require.cache[require.resolve('../../lib/feature-flags')];

      const featureFlags = require('../../lib/feature-flags');
      const result = featureFlags.isAgentTeamsEnabled();
      expect(result).toBe(false);
    });

    test('returns false when CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=false', () => {
      process.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS = 'false';
      delete require.cache[require.resolve('../../lib/feature-flags')];

      const featureFlags = require('../../lib/feature-flags');
      const result = featureFlags.isAgentTeamsEnabled();
      expect(result).toBe(false);
    });

    test('reads from agileflow-metadata.json as fallback', () => {
      const metadata = {
        features: {
          agentTeams: {
            enabled: true,
          },
        },
      };

      const metadataPath = path.join(testDir, 'docs', '00-meta', 'agileflow-metadata.json');
      fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));

      const featureFlags = require('../../lib/feature-flags');
      const result = featureFlags.isAgentTeamsEnabled({ rootDir: testDir });
      expect(result).toBe(true);
    });

    test('returns false when metadata.features.agentTeams.enabled is false', () => {
      const metadata = {
        features: {
          agentTeams: {
            enabled: false,
          },
        },
      };

      const metadataPath = path.join(testDir, 'docs', '00-meta', 'agileflow-metadata.json');
      fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));

      const featureFlags = require('../../lib/feature-flags');
      const result = featureFlags.isAgentTeamsEnabled({ rootDir: testDir });
      expect(result).toBe(false);
    });

    test('env var takes priority over metadata', () => {
      const metadata = {
        features: {
          agentTeams: {
            enabled: false,
          },
        },
      };

      const metadataPath = path.join(testDir, 'docs', '00-meta', 'agileflow-metadata.json');
      fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));

      process.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS = '1';
      delete require.cache[require.resolve('../../lib/feature-flags')];

      const featureFlags = require('../../lib/feature-flags');
      const result = featureFlags.isAgentTeamsEnabled({ rootDir: testDir });
      expect(result).toBe(true);
    });

    test('accepts pre-loaded metadata to avoid file read', () => {
      const metadata = {
        features: {
          agentTeams: {
            enabled: true,
          },
        },
      };

      const featureFlags = require('../../lib/feature-flags');
      const result = featureFlags.isAgentTeamsEnabled({ metadata });
      expect(result).toBe(true);
    });

    test('handles malformed metadata gracefully', () => {
      const metadataPath = path.join(testDir, 'docs', '00-meta', 'agileflow-metadata.json');
      fs.writeFileSync(metadataPath, 'invalid json {]');

      const featureFlags = require('../../lib/feature-flags');
      const result = featureFlags.isAgentTeamsEnabled({ rootDir: testDir });
      expect(result).toBe(false);
    });

    test('handles missing metadata file gracefully', () => {
      const featureFlags = require('../../lib/feature-flags');
      const result = featureFlags.isAgentTeamsEnabled({ rootDir: testDir });
      expect(result).toBe(false);
    });
  });

  describe('getAgentTeamsMode()', () => {
    test('returns "native" when Agent Teams enabled', () => {
      process.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS = '1';
      delete require.cache[require.resolve('../../lib/feature-flags')];

      const featureFlags = require('../../lib/feature-flags');
      const result = featureFlags.getAgentTeamsMode();
      expect(result).toBe('native');
    });

    test('returns "subagent" when Agent Teams disabled', () => {
      const featureFlags = require('../../lib/feature-flags');
      const result = featureFlags.getAgentTeamsMode({ rootDir: testDir });
      expect(result).toBe('subagent');
    });

    test('returns "subagent" even with metadata when env var is not set', () => {
      const metadata = {
        features: {
          agentTeams: {
            enabled: false,
          },
        },
      };

      const metadataPath = path.join(testDir, 'docs', '00-meta', 'agileflow-metadata.json');
      fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));

      const featureFlags = require('../../lib/feature-flags');
      const result = featureFlags.getAgentTeamsMode({ rootDir: testDir });
      expect(result).toBe('subagent');
    });
  });

  describe('getAgentTeamsDisplayInfo()', () => {
    test('returns display info when enabled', () => {
      process.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS = '1';
      delete require.cache[require.resolve('../../lib/feature-flags')];

      const featureFlags = require('../../lib/feature-flags');
      const result = featureFlags.getAgentTeamsDisplayInfo();

      expect(result).toMatchObject({
        label: 'Agent Teams',
        value: 'ENABLED (native)',
        status: 'enabled',
      });
    });

    test('returns fallback info when disabled', () => {
      const featureFlags = require('../../lib/feature-flags');
      const result = featureFlags.getAgentTeamsDisplayInfo({ rootDir: testDir });

      expect(result).toMatchObject({
        label: 'Agent Teams',
        value: 'subagent mode',
        status: 'fallback',
      });
    });

    test('returns info even with malformed metadata', () => {
      const metadataPath = path.join(testDir, 'docs', '00-meta', 'agileflow-metadata.json');
      fs.writeFileSync(metadataPath, 'invalid json {]');

      const featureFlags = require('../../lib/feature-flags');
      const result = featureFlags.getAgentTeamsDisplayInfo({ rootDir: testDir });

      expect(result).toBeDefined();
      expect(result.label).toBe('Agent Teams');
    });
  });

  describe('getFeatureFlags()', () => {
    test('returns all feature flags', () => {
      process.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS = '1';
      delete require.cache[require.resolve('../../lib/feature-flags')];

      const featureFlags = require('../../lib/feature-flags');
      const result = featureFlags.getFeatureFlags();

      expect(result).toMatchObject({
        agentTeams: true,
        agentTeamsMode: 'native',
      });
    });

    test('returns flags with Agent Teams disabled', () => {
      const featureFlags = require('../../lib/feature-flags');
      const result = featureFlags.getFeatureFlags({ rootDir: testDir });

      expect(result).toMatchObject({
        agentTeams: false,
        agentTeamsMode: 'subagent',
      });
    });

    test('uses pre-loaded metadata', () => {
      const metadata = {
        features: {
          agentTeams: {
            enabled: true,
          },
        },
      };

      const featureFlags = require('../../lib/feature-flags');
      const result = featureFlags.getFeatureFlags({ metadata });

      expect(result.agentTeams).toBe(true);
      expect(result.agentTeamsMode).toBe('native');
    });
  });

  describe('Edge cases', () => {
    test('handles undefined environment variable gracefully', () => {
      delete process.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS;
      delete require.cache[require.resolve('../../lib/feature-flags')];

      const featureFlags = require('../../lib/feature-flags');
      expect(() => {
        featureFlags.isAgentTeamsEnabled();
      }).not.toThrow();
    });

    test('handles empty rootDir option', () => {
      const featureFlags = require('../../lib/feature-flags');
      expect(() => {
        featureFlags.isAgentTeamsEnabled({ rootDir: null });
      }).not.toThrow();
    });

    test('handles metadata with missing nested fields', () => {
      const metadata = {
        features: {},
      };

      const featureFlags = require('../../lib/feature-flags');
      const result = featureFlags.isAgentTeamsEnabled({ metadata });
      expect(result).toBe(false);
    });

    test('handles empty metadata object', () => {
      const featureFlags = require('../../lib/feature-flags');
      const result = featureFlags.isAgentTeamsEnabled({ metadata: {} });
      expect(result).toBe(false);
    });

    test('handles null metadata gracefully', () => {
      const featureFlags = require('../../lib/feature-flags');
      const result = featureFlags.isAgentTeamsEnabled({ metadata: null });
      expect(result).toBe(false);
    });
  });
});
