/**
 * Tests for version-checker.js
 *
 * Tests npm version checking functionality.
 * getLatestVersion is tested in npm-utils.test.js.
 */

// Mock npm-utils before requiring version-checker
jest.mock('../../tools/cli/lib/npm-utils', () => ({
  getLatestVersion: jest.fn(),
}));

const { getLatestVersion } = require('../../tools/cli/lib/npm-utils');
const { checkForUpdate, getCurrentVersion } = require('../../tools/cli/lib/version-checker');

describe('version-checker', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getCurrentVersion', () => {
    it('returns the current package version', () => {
      const version = getCurrentVersion();

      expect(version).toBeDefined();
      expect(typeof version).toBe('string');
      // Should be a valid semver
      expect(version).toMatch(/^\d+\.\d+\.\d+/);
    });
  });

  describe('checkForUpdate', () => {
    it('returns updateAvailable true when newer version exists', async () => {
      getLatestVersion.mockResolvedValue('999.0.0');

      const result = await checkForUpdate();

      expect(result.updateAvailable).toBe(true);
      expect(result.latest).toBe('999.0.0');
      expect(result.current).toBe(getCurrentVersion());
      expect(result.error).toBeNull();
    });

    it('returns updateAvailable false when on latest version', async () => {
      const currentVersion = getCurrentVersion();
      getLatestVersion.mockResolvedValue(currentVersion);

      const result = await checkForUpdate();

      expect(result.updateAvailable).toBe(false);
      expect(result.latest).toBe(currentVersion);
      expect(result.current).toBe(currentVersion);
      expect(result.error).toBeNull();
    });

    it('returns updateAvailable false when on newer version than registry', async () => {
      getLatestVersion.mockResolvedValue('0.0.1');

      const result = await checkForUpdate();

      expect(result.updateAvailable).toBe(false);
      expect(result.latest).toBe('0.0.1');
    });

    it('returns error when version check fails', async () => {
      getLatestVersion.mockResolvedValue(null);

      const result = await checkForUpdate();

      expect(result.updateAvailable).toBe(false);
      expect(result.latest).toBeNull();
      expect(result.error).toBe('Could not check for updates');
      expect(result.current).toBe(getCurrentVersion());
    });
  });
});
