/**
 * Tests for Self-Update Module
 */

const path = require('path');
const {
  getLocalVersion,
  checkSelfUpdate,
} = require('../../tools/cli/lib/self-update');

// Mock dependencies
jest.mock('../../tools/cli/lib/npm-utils', () => ({
  getLatestVersion: jest.fn(),
}));

jest.mock('../../tools/cli/lib/ui', () => ({
  info: jest.fn(),
}));

const { getLatestVersion } = require('../../tools/cli/lib/npm-utils');

describe('SelfUpdate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getLocalVersion', () => {
    it('returns version string', () => {
      const version = getLocalVersion();
      expect(typeof version).toBe('string');
      expect(version).toMatch(/^\d+\.\d+\.\d+/);
    });
  });

  describe('checkSelfUpdate', () => {
    it('returns not needed when selfUpdate is false', async () => {
      const result = await checkSelfUpdate({ selfUpdate: false });

      expect(result.needed).toBe(false);
      expect(result.latestVersion).toBeNull();
      expect(getLatestVersion).not.toHaveBeenCalled();
    });

    it('returns not needed when selfUpdated is true', async () => {
      const result = await checkSelfUpdate({ selfUpdated: true });

      expect(result.needed).toBe(false);
      expect(getLatestVersion).not.toHaveBeenCalled();
    });

    it('returns not needed when latest version fetch fails', async () => {
      getLatestVersion.mockResolvedValue(null);

      const result = await checkSelfUpdate({});

      expect(result.needed).toBe(false);
      expect(result.latestVersion).toBeNull();
    });

    it('returns not needed when on latest version', async () => {
      const localVersion = getLocalVersion();
      getLatestVersion.mockResolvedValue(localVersion);

      const result = await checkSelfUpdate({});

      expect(result.needed).toBe(false);
      expect(result.latestVersion).toBe(localVersion);
    });

    it('returns needed when newer version available', async () => {
      getLatestVersion.mockResolvedValue('99.0.0');

      const result = await checkSelfUpdate({});

      expect(result.needed).toBe(true);
      expect(result.latestVersion).toBe('99.0.0');
    });

    it('returns not needed when local version is newer', async () => {
      getLatestVersion.mockResolvedValue('0.0.1');

      const result = await checkSelfUpdate({});

      expect(result.needed).toBe(false);
    });

    it('includes local version in result', async () => {
      getLatestVersion.mockResolvedValue(null);

      const result = await checkSelfUpdate({});

      expect(result.localVersion).toBe(getLocalVersion());
    });
  });

  describe('selfUpdateMiddleware', () => {
    // Note: Full integration test would require mocking child_process.spawnSync
    // and process.exit, which is complex. The basic checkSelfUpdate tests
    // cover the main logic.
  });
});
