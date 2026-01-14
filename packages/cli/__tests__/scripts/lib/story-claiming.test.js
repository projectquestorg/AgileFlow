/**
 * Tests for story-claiming.js
 *
 * Tests cover:
 * - isPidAlive() - PID liveness checking
 * - isClaimValid() - Claim validity (PID + TTL)
 * - isStoryClaimed() - Story claim checking
 * - claimStory() - Claiming workflow
 * - releaseStory() - Release workflow
 * - cleanupStaleClaims() - Stale claim cleanup
 * - getClaimedStoriesForSession() - Query claimed stories
 * - getStoriesClaimedByOthers() - Query others' claims
 */

const path = require('path');

// Mock dependencies before requiring the module
jest.mock('../../../lib/paths', () => ({
  getProjectRoot: jest.fn(() => '/test/project'),
  getStatusPath: jest.fn(root => `${root || '/test/project'}/docs/09-agents/status.json`),
}));

jest.mock('../../../lib/errors', () => ({
  safeReadJSON: jest.fn(),
  safeWriteJSON: jest.fn(),
}));

jest.mock('../../../lib/colors', () => ({
  c: {
    amber: '',
    lavender: '',
    dim: '',
    reset: '',
    brand: '',
    bold: '',
    cyan: '',
  },
}));

jest.mock('fs', () => ({
  existsSync: jest.fn(),
  readFileSync: jest.fn(),
  mkdirSync: jest.fn(),
  writeFileSync: jest.fn(),
}));

const fs = require('fs');
const { safeReadJSON, safeWriteJSON } = require('../../../lib/errors');
const { getProjectRoot, getStatusPath } = require('../../../lib/paths');

const {
  isPidAlive,
  isClaimValid,
  isStoryClaimed,
  claimStory,
  releaseStory,
  cleanupStaleClaims,
  getClaimedStoriesForSession,
  getStoriesClaimedByOthers,
  getCurrentSession,
  formatClaimedStories,
  DEFAULT_CLAIM_TTL_HOURS,
} = require('../../../scripts/lib/story-claiming');

describe('story-claiming', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default mock implementations
    safeReadJSON.mockReturnValue({ ok: true, data: { stories: {} } });
    safeWriteJSON.mockReturnValue({ ok: true });
    fs.existsSync.mockReturnValue(false);
  });

  describe('isPidAlive', () => {
    it('returns true for current process PID', () => {
      expect(isPidAlive(process.pid)).toBe(true);
    });

    it('returns false for invalid PID', () => {
      expect(isPidAlive(null)).toBe(false);
      expect(isPidAlive(undefined)).toBe(false);
      expect(isPidAlive('not-a-number')).toBe(false);
    });

    it('returns false for non-existent PID', () => {
      // Use a very high PID that is unlikely to exist
      expect(isPidAlive(9999999)).toBe(false);
    });

    it('returns false for PID 0', () => {
      expect(isPidAlive(0)).toBe(false);
    });

    // Note: On Linux, process.kill(-1, 0) doesn't throw because -1 is a valid
    // signal target (all processes in process group). This is platform-specific.
    it('handles negative PID based on platform behavior', () => {
      // Just verify it doesn't throw - behavior varies by platform
      expect(() => isPidAlive(-1)).not.toThrow();
    });
  });

  describe('isClaimValid', () => {
    it('returns false for null/undefined claim', () => {
      expect(isClaimValid(null)).toBe(false);
      expect(isClaimValid(undefined)).toBe(false);
    });

    it('returns true for claim with alive PID', () => {
      const claim = {
        pid: process.pid,
        claimed_at: new Date().toISOString(),
      };
      expect(isClaimValid(claim)).toBe(true);
    });

    it('returns false for claim with dead PID', () => {
      const claim = {
        pid: 9999999, // Non-existent PID
        claimed_at: new Date().toISOString(),
      };
      expect(isClaimValid(claim)).toBe(false);
    });

    it('returns false for expired claim (TTL exceeded)', () => {
      const expiredDate = new Date();
      expiredDate.setHours(expiredDate.getHours() - DEFAULT_CLAIM_TTL_HOURS - 1);

      const claim = {
        pid: process.pid,
        claimed_at: expiredDate.toISOString(),
      };
      expect(isClaimValid(claim)).toBe(false);
    });

    it('returns true for claim within TTL', () => {
      const validDate = new Date();
      validDate.setHours(validDate.getHours() - 1); // 1 hour ago

      const claim = {
        pid: process.pid,
        claimed_at: validDate.toISOString(),
      };
      expect(isClaimValid(claim)).toBe(true);
    });

    it('returns true for claim without pid (legacy support)', () => {
      const claim = {
        claimed_at: new Date().toISOString(),
      };
      expect(isClaimValid(claim)).toBe(true);
    });
  });

  describe('isStoryClaimed', () => {
    it('returns claimed=false for story without claim', () => {
      const story = { title: 'Test Story' };
      const result = isStoryClaimed(story);
      expect(result.claimed).toBe(false);
      expect(result.stale).toBe(false);
    });

    it('returns claimed=false for null story', () => {
      const result = isStoryClaimed(null);
      expect(result.claimed).toBe(false);
    });

    it('returns claimed=false for own claim', () => {
      // Mock getCurrentSession to return our session
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(`pid=${process.pid}`);
      safeReadJSON.mockReturnValue({
        ok: true,
        data: {
          sessions: {
            1: { path: process.cwd() },
          },
        },
      });

      const story = {
        title: 'Test Story',
        claimed_by: {
          session_id: '1',
          pid: process.pid,
          claimed_at: new Date().toISOString(),
        },
      };

      const result = isStoryClaimed(story, '1');
      expect(result.claimed).toBe(false); // Our own claim doesn't block us
    });

    it('returns claimed=true for valid claim by another session', () => {
      const story = {
        title: 'Test Story',
        claimed_by: {
          session_id: 'other-session',
          pid: process.pid, // Using current process to make it "alive"
          claimed_at: new Date().toISOString(),
        },
      };

      // Current session is different
      fs.existsSync.mockReturnValue(false);

      const result = isStoryClaimed(story, 'my-session');
      expect(result.claimed).toBe(true);
      expect(result.claimedBy.session_id).toBe('other-session');
    });

    it('returns stale=true for expired claim by another session', () => {
      const expiredDate = new Date();
      expiredDate.setHours(expiredDate.getHours() - DEFAULT_CLAIM_TTL_HOURS - 1);

      const story = {
        title: 'Test Story',
        claimed_by: {
          session_id: 'other-session',
          pid: 9999999, // Dead PID
          claimed_at: expiredDate.toISOString(),
        },
      };

      const result = isStoryClaimed(story, 'my-session');
      expect(result.claimed).toBe(false);
      expect(result.stale).toBe(true);
    });
  });

  describe('claimStory', () => {
    beforeEach(() => {
      // Default: empty stories
      safeReadJSON.mockReturnValue({
        ok: true,
        data: {
          stories: {
            'US-0001': { title: 'Test Story' },
          },
        },
      });
    });

    it('successfully claims unclaimed story', () => {
      const result = claimStory('US-0001');
      expect(result.ok).toBe(true);
      expect(result.claimed).toBe(true);
      expect(safeWriteJSON).toHaveBeenCalled();
    });

    it('returns error for non-existent story', () => {
      const result = claimStory('US-9999');
      expect(result.ok).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('rejects claim on story claimed by another session', () => {
      safeReadJSON.mockReturnValue({
        ok: true,
        data: {
          stories: {
            'US-0001': {
              title: 'Test Story',
              claimed_by: {
                session_id: 'other-session',
                pid: process.pid, // Alive PID
                claimed_at: new Date().toISOString(),
              },
            },
          },
        },
      });

      const result = claimStory('US-0001');
      expect(result.ok).toBe(false);
      expect(result.claimed).toBe(true);
      expect(result.claimedBy.session_id).toBe('other-session');
    });

    it('allows force claim', () => {
      safeReadJSON.mockReturnValue({
        ok: true,
        data: {
          stories: {
            'US-0001': {
              title: 'Test Story',
              claimed_by: {
                session_id: 'other-session',
                pid: process.pid,
                claimed_at: new Date().toISOString(),
              },
            },
          },
        },
      });

      const result = claimStory('US-0001', { force: true });
      expect(result.ok).toBe(true);
    });

    it('returns error when status.json cannot be loaded', () => {
      safeReadJSON.mockReturnValue({ ok: false, error: 'File not found' });

      const result = claimStory('US-0001');
      expect(result.ok).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('returns error when status.json cannot be written', () => {
      safeWriteJSON.mockReturnValue({ ok: false, error: 'Write failed' });

      const result = claimStory('US-0001');
      expect(result.ok).toBe(false);
      expect(result.error).toContain('Write failed');
    });
  });

  describe('releaseStory', () => {
    beforeEach(() => {
      // Mock session to match claim
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(`pid=${process.pid}`);
    });

    it('successfully releases owned claim', () => {
      safeReadJSON.mockReturnValue({
        ok: true,
        data: {
          sessions: { 1: { path: process.cwd() } },
          stories: {
            'US-0001': {
              title: 'Test Story',
              claimed_by: {
                session_id: '1',
                pid: process.pid,
              },
            },
          },
        },
      });

      const result = releaseStory('US-0001');
      expect(result.ok).toBe(true);
      expect(result.released).toBe(true);
    });

    it('returns error when releasing claim owned by another session', () => {
      safeReadJSON.mockReturnValue({
        ok: true,
        data: {
          sessions: { 1: { path: process.cwd() } },
          stories: {
            'US-0001': {
              title: 'Test Story',
              claimed_by: {
                session_id: 'other-session',
                pid: 1234,
              },
            },
          },
        },
      });

      const result = releaseStory('US-0001');
      expect(result.ok).toBe(false);
      expect(result.error).toContain('not you');
    });

    it('returns error for non-existent story', () => {
      safeReadJSON.mockReturnValue({
        ok: true,
        data: { stories: {} },
      });

      const result = releaseStory('US-9999');
      expect(result.ok).toBe(false);
      expect(result.error).toContain('not found');
    });
  });

  describe('cleanupStaleClaims', () => {
    it('cleans up claims with dead PIDs', () => {
      safeReadJSON.mockReturnValue({
        ok: true,
        data: {
          stories: {
            'US-0001': {
              title: 'Story 1',
              claimed_by: {
                session_id: 'dead-session',
                pid: 9999999, // Non-existent PID
                claimed_at: new Date().toISOString(),
              },
            },
            'US-0002': {
              title: 'Story 2',
              claimed_by: {
                session_id: 'alive-session',
                pid: process.pid, // Current process
                claimed_at: new Date().toISOString(),
              },
            },
          },
        },
      });

      const result = cleanupStaleClaims();
      expect(result.ok).toBe(true);
      expect(result.cleaned).toBe(1);
      expect(safeWriteJSON).toHaveBeenCalled();
    });

    it('cleans up expired claims', () => {
      const expiredDate = new Date();
      expiredDate.setHours(expiredDate.getHours() - DEFAULT_CLAIM_TTL_HOURS - 1);

      safeReadJSON.mockReturnValue({
        ok: true,
        data: {
          stories: {
            'US-0001': {
              title: 'Story 1',
              claimed_by: {
                session_id: 'expired-session',
                pid: process.pid,
                claimed_at: expiredDate.toISOString(),
              },
            },
          },
        },
      });

      const result = cleanupStaleClaims();
      expect(result.ok).toBe(true);
      expect(result.cleaned).toBe(1);
    });

    it('does not write if nothing cleaned', () => {
      safeReadJSON.mockReturnValue({
        ok: true,
        data: {
          stories: {
            'US-0001': {
              title: 'Story 1',
              claimed_by: {
                session_id: 'active-session',
                pid: process.pid,
                claimed_at: new Date().toISOString(),
              },
            },
          },
        },
      });

      const result = cleanupStaleClaims();
      expect(result.ok).toBe(true);
      expect(result.cleaned).toBe(0);
      expect(safeWriteJSON).not.toHaveBeenCalled();
    });
  });

  describe('getClaimedStoriesForSession', () => {
    it('returns stories claimed by session', () => {
      safeReadJSON.mockReturnValue({
        ok: true,
        data: {
          stories: {
            'US-0001': {
              title: 'Story 1',
              claimed_by: { session_id: '1', claimed_at: '2026-01-01' },
            },
            'US-0002': {
              title: 'Story 2',
              claimed_by: { session_id: '2', claimed_at: '2026-01-02' },
            },
            'US-0003': {
              title: 'Story 3',
              claimed_by: { session_id: '1', claimed_at: '2026-01-03' },
            },
          },
        },
      });

      const result = getClaimedStoriesForSession('1');
      expect(result.ok).toBe(true);
      expect(result.stories).toHaveLength(2);
      expect(result.stories.map(s => s.id)).toEqual(['US-0001', 'US-0003']);
    });

    it('returns empty array for session with no claims', () => {
      safeReadJSON.mockReturnValue({
        ok: true,
        data: { stories: {} },
      });

      const result = getClaimedStoriesForSession('no-claims');
      expect(result.ok).toBe(true);
      expect(result.stories).toEqual([]);
    });
  });

  describe('getStoriesClaimedByOthers', () => {
    beforeEach(() => {
      // Mock current session as '1'
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(`pid=${process.pid}`);
    });

    it('returns stories claimed by other sessions', () => {
      safeReadJSON.mockReturnValue({
        ok: true,
        data: {
          sessions: { 1: { path: process.cwd() } },
          stories: {
            'US-0001': {
              title: 'Story 1',
              claimed_by: {
                session_id: '1',
                pid: process.pid,
                claimed_at: new Date().toISOString(),
              },
            },
            'US-0002': {
              title: 'Story 2',
              claimed_by: {
                session_id: '2',
                pid: process.pid, // Make it "alive"
                claimed_at: new Date().toISOString(),
              },
            },
          },
        },
      });

      const result = getStoriesClaimedByOthers();
      expect(result.ok).toBe(true);
      expect(result.stories).toHaveLength(1);
      expect(result.stories[0].id).toBe('US-0002');
    });

    it('excludes stale claims', () => {
      const expiredDate = new Date();
      expiredDate.setHours(expiredDate.getHours() - DEFAULT_CLAIM_TTL_HOURS - 1);

      safeReadJSON.mockReturnValue({
        ok: true,
        data: {
          sessions: { 1: { path: process.cwd() } },
          stories: {
            'US-0001': {
              title: 'Story 1',
              claimed_by: {
                session_id: '2',
                pid: 9999999, // Dead PID
                claimed_at: expiredDate.toISOString(),
              },
            },
          },
        },
      });

      const result = getStoriesClaimedByOthers();
      expect(result.ok).toBe(true);
      expect(result.stories).toHaveLength(0);
    });
  });

  describe('formatClaimedStories', () => {
    it('returns empty string for empty array', () => {
      expect(formatClaimedStories([])).toBe('');
      expect(formatClaimedStories(null)).toBe('');
    });

    it('formats stories with session info', () => {
      const stories = [
        {
          id: 'US-0001',
          title: 'Test Story',
          claimedBy: {
            session_id: '2',
            path: '/home/user/project',
          },
        },
      ];

      const result = formatClaimedStories(stories);
      expect(result).toContain('US-0001');
      expect(result).toContain('Test Story');
      expect(result).toContain('Session 2');
    });

    it('handles missing claimedBy info', () => {
      const stories = [
        {
          id: 'US-0001',
          title: 'Test Story',
          claimedBy: null,
        },
      ];

      const result = formatClaimedStories(stories);
      expect(result).toContain('US-0001');
      expect(result).toContain('unknown');
    });
  });

  describe('claimStory edge cases', () => {
    beforeEach(() => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(`pid=${process.pid}`);
      safeWriteJSON.mockReturnValue({ ok: true });
    });

    it('returns error when current session cannot be determined', () => {
      // Make safeReadJSON return different values based on file path
      safeReadJSON.mockImplementation(filePath => {
        if (filePath.includes('status.json')) {
          return {
            ok: true,
            data: {
              stories: { 'US-0001': { title: 'Test Story' } },
            },
          };
        }
        // For registry.json - return failure to make getCurrentSession return null
        return { ok: false, error: 'Not found' };
      });

      const result = claimStory('US-0001');
      expect(result.ok).toBe(false);
      expect(result.error).toContain('session');
    });

    it('allows re-claiming story already claimed by same session', () => {
      safeReadJSON.mockReturnValue({
        ok: true,
        data: {
          sessions: { 1: { path: process.cwd() } },
          stories: {
            'US-0001': {
              title: 'Test Story',
              claimed_by: {
                session_id: '1', // Same as current session
                pid: process.pid,
                claimed_at: new Date().toISOString(),
              },
            },
          },
        },
      });

      const result = claimStory('US-0001');
      expect(result.ok).toBe(true);
    });

    it('reclaims story with stale claim from other session', () => {
      const staleDate = new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString();
      safeReadJSON.mockReturnValue({
        ok: true,
        data: {
          sessions: { 1: { path: process.cwd() } },
          stories: {
            'US-0001': {
              title: 'Test Story',
              claimed_by: {
                session_id: '2',
                pid: 9999999, // Dead PID
                claimed_at: staleDate,
              },
            },
          },
        },
      });

      const result = claimStory('US-0001');
      expect(result.ok).toBe(true);
    });
  });

  describe('releaseStory edge cases', () => {
    beforeEach(() => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(`pid=${process.pid}`);
      safeReadJSON.mockReturnValue({
        ok: true,
        data: {
          sessions: { 1: { path: process.cwd() } },
          stories: {},
        },
      });
    });

    it('returns error when status.json cannot be loaded', () => {
      safeReadJSON.mockReturnValue({ ok: false, error: 'Load failed' });

      const result = releaseStory('US-0001');
      expect(result.ok).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('returns error when status.json cannot be written', () => {
      safeReadJSON.mockReturnValue({
        ok: true,
        data: {
          sessions: { 1: { path: process.cwd() } },
          stories: {
            'US-0001': {
              title: 'Test',
              claimed_by: { session_id: '1', pid: process.pid },
            },
          },
        },
      });
      safeWriteJSON.mockReturnValue({ ok: false, error: 'Write failed' });

      const result = releaseStory('US-0001');
      expect(result.ok).toBe(false);
      expect(result.error).toContain('Write failed');
    });

    it('returns success when story has no claim', () => {
      safeReadJSON.mockReturnValue({
        ok: true,
        data: {
          sessions: { 1: { path: process.cwd() } },
          stories: {
            'US-0001': {
              title: 'Test',
              // No claimed_by
            },
          },
        },
      });

      const result = releaseStory('US-0001');
      expect(result.ok).toBe(true);
    });
  });

  describe('cleanupStaleClaims edge cases', () => {
    it('returns error when status.json cannot be loaded', () => {
      safeReadJSON.mockReturnValue({ ok: false, error: 'Load failed' });

      const result = cleanupStaleClaims();
      expect(result.ok).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('returns error when status.json cannot be written', () => {
      safeReadJSON.mockReturnValue({
        ok: true,
        data: {
          stories: {
            'US-0001': {
              title: 'Test',
              claimed_by: { session_id: '1', pid: 9999999, claimed_at: new Date().toISOString() },
            },
          },
        },
      });
      safeWriteJSON.mockReturnValue({ ok: false, error: 'Write failed' });

      const result = cleanupStaleClaims();
      expect(result.ok).toBe(false);
      expect(result.error).toContain('Write failed');
    });
  });

  describe('getClaimedStoriesForSession edge cases', () => {
    it('returns error when status.json cannot be loaded', () => {
      safeReadJSON.mockReturnValue({ ok: false, error: 'Load failed' });

      const result = getClaimedStoriesForSession('1');
      expect(result.ok).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('returns error when no session ID and current session cannot be determined', () => {
      // Make safeReadJSON return failure for registry.json (getCurrentSession returns null)
      safeReadJSON.mockImplementation(filePath => {
        if (filePath.includes('registry.json')) {
          return { ok: false, error: 'Not found' };
        }
        return { ok: true, data: { stories: {} } };
      });

      const result = getClaimedStoriesForSession(); // No session ID provided
      expect(result.ok).toBe(false);
      expect(result.error).toContain('session');
    });

    it('uses current session when no session ID provided', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(`pid=${process.pid}`);
      safeReadJSON.mockReturnValue({
        ok: true,
        data: {
          sessions: { 1: { path: process.cwd() } },
          stories: {
            'US-0001': {
              title: 'Story 1',
              claimed_by: { session_id: '1', claimed_at: '2026-01-01' },
            },
          },
        },
      });

      const result = getClaimedStoriesForSession(); // No session ID
      expect(result.ok).toBe(true);
      expect(result.stories).toHaveLength(1);
    });
  });

  describe('getStoriesClaimedByOthers edge cases', () => {
    beforeEach(() => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(`pid=${process.pid}`);
    });

    it('returns error when status.json cannot be loaded', () => {
      safeReadJSON.mockReturnValue({ ok: false, error: 'Load failed' });

      const result = getStoriesClaimedByOthers();
      expect(result.ok).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('returns empty array when no current session', () => {
      fs.readFileSync.mockReturnValue('invalid content');
      safeReadJSON.mockReturnValue({
        ok: true,
        data: { stories: {} },
      });

      const result = getStoriesClaimedByOthers();
      expect(result.ok).toBe(true);
      expect(result.stories).toEqual([]);
    });
  });

  describe('DEFAULT_CLAIM_TTL_HOURS', () => {
    it('exports the constant', () => {
      expect(DEFAULT_CLAIM_TTL_HOURS).toBe(4);
    });
  });
});
