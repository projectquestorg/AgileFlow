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
  let originalChannelsEnv;
  let originalChannelsDisabledEnv;

  beforeEach(() => {
    // Save original environment
    originalEnv = process.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS;
    originalChannelsEnv = process.env.AGILEFLOW_CHANNELS;
    originalChannelsDisabledEnv = process.env.AGILEFLOW_CHANNELS_DISABLED;
    delete process.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS;
    delete process.env.AGILEFLOW_CHANNELS;
    delete process.env.AGILEFLOW_CHANNELS_DISABLED;

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
    if (originalChannelsEnv !== undefined) {
      process.env.AGILEFLOW_CHANNELS = originalChannelsEnv;
    } else {
      delete process.env.AGILEFLOW_CHANNELS;
    }
    if (originalChannelsDisabledEnv !== undefined) {
      process.env.AGILEFLOW_CHANNELS_DISABLED = originalChannelsDisabledEnv;
    } else {
      delete process.env.AGILEFLOW_CHANNELS_DISABLED;
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

  describe('AGENT_TEAMS_TOOLS', () => {
    test('exports expected tool names', () => {
      const featureFlags = require('../../lib/feature-flags');
      expect(featureFlags.AGENT_TEAMS_TOOLS).toEqual(['TeamCreate', 'SendMessage', 'ListTeams']);
    });

    test('is a frozen-length array (not accidentally mutable via getAvailableTools)', () => {
      const featureFlags = require('../../lib/feature-flags');
      const tools = featureFlags.AGENT_TEAMS_TOOLS;
      expect(Array.isArray(tools)).toBe(true);
      expect(tools.length).toBe(3);
    });
  });

  describe('getAvailableTools()', () => {
    test('returns tool names when Agent Teams is enabled', () => {
      process.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS = '1';
      delete require.cache[require.resolve('../../lib/feature-flags')];

      const featureFlags = require('../../lib/feature-flags');
      const result = featureFlags.getAvailableTools();

      expect(result).toEqual(['TeamCreate', 'SendMessage', 'ListTeams']);
    });

    test('returns empty array when Agent Teams is disabled', () => {
      const featureFlags = require('../../lib/feature-flags');
      const result = featureFlags.getAvailableTools({ rootDir: testDir });

      expect(result).toEqual([]);
    });

    test('returns a copy, not the original array', () => {
      process.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS = '1';
      delete require.cache[require.resolve('../../lib/feature-flags')];

      const featureFlags = require('../../lib/feature-flags');
      const result1 = featureFlags.getAvailableTools();
      const result2 = featureFlags.getAvailableTools();

      expect(result1).not.toBe(result2);
      expect(result1).toEqual(result2);
    });

    test('respects metadata-based enablement', () => {
      const metadata = {
        features: {
          agentTeams: {
            enabled: true,
          },
        },
      };

      const featureFlags = require('../../lib/feature-flags');
      const result = featureFlags.getAvailableTools({ metadata });

      expect(result).toEqual(['TeamCreate', 'SendMessage', 'ListTeams']);
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
        value: 'ENABLED (native, 3 tools)',
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
    test('returns all feature flags including availableTools when enabled', () => {
      process.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS = '1';
      delete require.cache[require.resolve('../../lib/feature-flags')];

      const featureFlags = require('../../lib/feature-flags');
      const result = featureFlags.getFeatureFlags();

      expect(result).toMatchObject({
        agentTeams: true,
        agentTeamsMode: 'native',
        availableTools: ['TeamCreate', 'SendMessage', 'ListTeams'],
      });
    });

    test('returns empty availableTools when Agent Teams disabled', () => {
      const featureFlags = require('../../lib/feature-flags');
      const result = featureFlags.getFeatureFlags({ rootDir: testDir });

      expect(result).toMatchObject({
        agentTeams: false,
        agentTeamsMode: 'subagent',
        availableTools: [],
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
      expect(result.availableTools).toEqual(['TeamCreate', 'SendMessage', 'ListTeams']);
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

  // ========================================================================
  // Channels Feature (EP-0049)
  // ========================================================================

  describe('isChannelsEnabled()', () => {
    test('returns false when env var not set and metadata not present', () => {
      const featureFlags = require('../../lib/feature-flags');
      const result = featureFlags.isChannelsEnabled({ rootDir: testDir });
      expect(result).toBe(false);
    });

    test('returns true when AGILEFLOW_CHANNELS=1', () => {
      process.env.AGILEFLOW_CHANNELS = '1';
      delete require.cache[require.resolve('../../lib/feature-flags')];

      const featureFlags = require('../../lib/feature-flags');
      expect(featureFlags.isChannelsEnabled()).toBe(true);
    });

    test('returns true when AGILEFLOW_CHANNELS=true', () => {
      process.env.AGILEFLOW_CHANNELS = 'true';
      delete require.cache[require.resolve('../../lib/feature-flags')];

      const featureFlags = require('../../lib/feature-flags');
      expect(featureFlags.isChannelsEnabled()).toBe(true);
    });

    test('returns false when AGILEFLOW_CHANNELS=0', () => {
      process.env.AGILEFLOW_CHANNELS = '0';
      delete require.cache[require.resolve('../../lib/feature-flags')];

      const featureFlags = require('../../lib/feature-flags');
      expect(featureFlags.isChannelsEnabled()).toBe(false);
    });

    test('kill switch overrides everything', () => {
      process.env.AGILEFLOW_CHANNELS = '1';
      process.env.AGILEFLOW_CHANNELS_DISABLED = 'true';
      delete require.cache[require.resolve('../../lib/feature-flags')];

      const featureFlags = require('../../lib/feature-flags');
      expect(featureFlags.isChannelsEnabled()).toBe(false);
    });

    test('reads from metadata as fallback', () => {
      const metadata = { features: { channels: { enabled: true } } };
      const featureFlags = require('../../lib/feature-flags');
      expect(featureFlags.isChannelsEnabled({ metadata })).toBe(true);
    });

    test('returns false when metadata channels.enabled is false', () => {
      const metadata = { features: { channels: { enabled: false } } };
      const featureFlags = require('../../lib/feature-flags');
      expect(featureFlags.isChannelsEnabled({ metadata })).toBe(false);
    });
  });

  describe('getChannelTrustLevel()', () => {
    test('defaults to observe when no config', () => {
      const featureFlags = require('../../lib/feature-flags');
      expect(featureFlags.getChannelTrustLevel({ rootDir: testDir })).toBe('observe');
    });

    test('reads default trust level from metadata', () => {
      const metadata = { features: { channels: { trustLevel: 'suggest' } } };
      const featureFlags = require('../../lib/feature-flags');
      expect(featureFlags.getChannelTrustLevel({ metadata })).toBe('suggest');
    });

    test('reads per-channel trust level override', () => {
      const metadata = {
        features: {
          channels: {
            trustLevel: 'observe',
            channelConfigs: {
              ci: { trustLevel: 'react' },
            },
          },
        },
      };
      const featureFlags = require('../../lib/feature-flags');
      expect(featureFlags.getChannelTrustLevel({ metadata, channelName: 'ci' })).toBe('react');
    });

    test('falls back to default when channel has no override', () => {
      const metadata = {
        features: {
          channels: {
            trustLevel: 'suggest',
            channelConfigs: {},
          },
        },
      };
      const featureFlags = require('../../lib/feature-flags');
      expect(featureFlags.getChannelTrustLevel({ metadata, channelName: 'telegram' })).toBe(
        'suggest'
      );
    });
  });

  describe('getChannelsDisplayInfo()', () => {
    test('returns disabled when channels not enabled', () => {
      const featureFlags = require('../../lib/feature-flags');
      const info = featureFlags.getChannelsDisplayInfo({ rootDir: testDir });
      expect(info.status).toBe('disabled');
      expect(info.value).toBe('not configured');
    });

    test('returns active when channels with configs exist', () => {
      const metadata = {
        features: {
          channels: {
            enabled: true,
            trustLevel: 'observe',
            channelConfigs: {
              ci: { enabled: true },
              telegram: { enabled: true },
            },
          },
        },
      };

      process.env.AGILEFLOW_CHANNELS = '1';
      delete require.cache[require.resolve('../../lib/feature-flags')];

      const featureFlags = require('../../lib/feature-flags');
      const info = featureFlags.getChannelsDisplayInfo({ metadata });
      expect(info.status).toBe('active');
      expect(info.value).toContain('2 active');
      expect(info.value).toContain('ci');
      expect(info.value).toContain('telegram');
    });
  });

  describe('CHANNEL_TRUST_LEVELS', () => {
    test('exports expected trust levels', () => {
      const featureFlags = require('../../lib/feature-flags');
      expect(featureFlags.CHANNEL_TRUST_LEVELS).toEqual({
        OBSERVE: 'observe',
        SUGGEST: 'suggest',
        REACT: 'react',
      });
    });
  });

  describe('getFeatureFlags() includes channels', () => {
    test('includes channels flag', () => {
      const featureFlags = require('../../lib/feature-flags');
      const flags = featureFlags.getFeatureFlags({ rootDir: testDir });
      expect(flags).toHaveProperty('channels');
      expect(typeof flags.channels).toBe('boolean');
    });
  });
});
