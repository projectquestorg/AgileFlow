/**
 * story-claiming.js - Inter-session story coordination
 *
 * Prevents multiple Claude Code sessions from working on the same story.
 * Uses PID-based liveness detection to auto-release stale claims.
 *
 * Usage:
 *   const { claimStory, releaseStory, isStoryClaimed, getClaimedStories } = require('./lib/story-claiming');
 *
 *   // Claim a story for this session
 *   const result = claimStory('US-0042');
 *   if (!result.ok) {
 *     console.log(`Story claimed by session ${result.claimedBy.session_id}`);
 *   }
 *
 *   // Release when done
 *   releaseStory('US-0042');
 */

const fs = require('fs');
const path = require('path');

// Shared utilities
const { getProjectRoot, getStatusPath } = require('../../lib/paths');
const { safeReadJSON, safeWriteJSON } = require('../../lib/errors');
const { c } = require('../../lib/colors');

// Default claim expiration: 4 hours
const DEFAULT_CLAIM_TTL_HOURS = 4;

/**
 * Check if a PID is alive.
 * Uses signal 0 which checks process existence without sending a signal.
 *
 * @param {number} pid - Process ID to check
 * @returns {boolean} True if PID is alive
 */
function isPidAlive(pid) {
  if (!pid || typeof pid !== 'number') return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Get the current session info from session-manager registry.
 *
 * @param {string} [rootDir] - Project root directory
 * @returns {{ session_id: string, pid: number, path: string } | null}
 */
function getCurrentSession(rootDir) {
  const root = rootDir || getProjectRoot();
  const registryPath = path.join(root, '.agileflow', 'sessions', 'registry.json');

  const result = safeReadJSON(registryPath, { defaultValue: null });
  if (!result.ok || !result.data) return null;

  const cwd = process.cwd();
  const registry = result.data;

  // Find session by current working directory
  for (const [id, session] of Object.entries(registry.sessions || {})) {
    if (session.path === cwd) {
      // Get PID from lock file
      const lockPath = path.join(root, '.agileflow', 'sessions', `${id}.lock`);
      let pid = process.ppid || process.pid;

      if (fs.existsSync(lockPath)) {
        try {
          const lockContent = fs.readFileSync(lockPath, 'utf8');
          const pidMatch = lockContent.match(/^pid=(\d+)/m);
          if (pidMatch) {
            pid = parseInt(pidMatch[1], 10);
          }
        } catch (e) {
          // Use default pid
        }
      }

      return {
        session_id: id,
        pid,
        path: session.path,
      };
    }
  }

  // No registered session found - return basic info
  return {
    session_id: 'unregistered',
    pid: process.ppid || process.pid,
    path: cwd,
  };
}

/**
 * Check if a claim is still valid.
 * Claims are valid if:
 * 1. The claiming session's PID is still alive
 * 2. The claim hasn't exceeded the TTL
 *
 * @param {object} claimedBy - The claimed_by object from a story
 * @returns {boolean} True if claim is still valid
 */
function isClaimValid(claimedBy) {
  if (!claimedBy) return false;

  // Check PID liveness
  if (claimedBy.pid && !isPidAlive(claimedBy.pid)) {
    return false;
  }

  // Check TTL expiration
  if (claimedBy.claimed_at) {
    const claimedAt = new Date(claimedBy.claimed_at);
    const now = new Date();
    const hoursSinceClaim = (now - claimedAt) / (1000 * 60 * 60);

    if (hoursSinceClaim > DEFAULT_CLAIM_TTL_HOURS) {
      return false;
    }
  }

  return true;
}

/**
 * Check if a story is claimed by another session.
 *
 * @param {object} story - Story object from status.json
 * @param {string} [currentSessionId] - Current session ID (auto-detected if not provided)
 * @returns {{ claimed: boolean, claimedBy?: object, stale: boolean }}
 */
function isStoryClaimed(story, currentSessionId) {
  if (!story || !story.claimed_by) {
    return { claimed: false, stale: false };
  }

  const current = getCurrentSession();
  const mySessionId = currentSessionId || (current ? current.session_id : null);

  // Check if it's our own claim
  if (story.claimed_by.session_id === mySessionId) {
    return { claimed: false, stale: false }; // Our claim doesn't block us
  }

  // Check if the claim is still valid
  if (!isClaimValid(story.claimed_by)) {
    return { claimed: false, stale: true, claimedBy: story.claimed_by };
  }

  return { claimed: true, stale: false, claimedBy: story.claimed_by };
}

/**
 * Claim a story for the current session.
 *
 * @param {string} storyId - Story ID (e.g., 'US-0042')
 * @param {object} [options] - Options
 * @param {boolean} [options.force=false] - Force claim even if already claimed
 * @param {string} [options.rootDir] - Project root directory
 * @returns {{ ok: boolean, claimed?: boolean, claimedBy?: object, error?: string }}
 */
function claimStory(storyId, options = {}) {
  const { force = false, rootDir } = options;
  const root = rootDir || getProjectRoot();
  const statusPath = getStatusPath(root);

  // Load status.json
  const result = safeReadJSON(statusPath, { defaultValue: null });
  if (!result.ok || !result.data) {
    return { ok: false, error: result.error || 'Could not load status.json' };
  }

  const status = result.data;
  const story = status.stories?.[storyId];

  if (!story) {
    return { ok: false, error: `Story ${storyId} not found` };
  }

  // Check if already claimed by someone else
  const claimCheck = isStoryClaimed(story);
  if (claimCheck.claimed && !force) {
    return {
      ok: false,
      claimed: true,
      claimedBy: claimCheck.claimedBy,
      error: `Story ${storyId} is claimed by session ${claimCheck.claimedBy.session_id}`,
    };
  }

  // Get current session info
  const currentSession = getCurrentSession(root);
  if (!currentSession) {
    return { ok: false, error: 'Could not determine current session' };
  }

  // Set the claim
  story.claimed_by = {
    session_id: currentSession.session_id,
    pid: currentSession.pid,
    path: currentSession.path,
    claimed_at: new Date().toISOString(),
  };

  // Save status.json
  status.updated = new Date().toISOString();
  const writeResult = safeWriteJSON(statusPath, status);
  if (!writeResult.ok) {
    return { ok: false, error: writeResult.error };
  }

  return { ok: true, claimed: true };
}

/**
 * Release a story claim for the current session.
 *
 * @param {string} storyId - Story ID (e.g., 'US-0042')
 * @param {object} [options] - Options
 * @param {string} [options.rootDir] - Project root directory
 * @returns {{ ok: boolean, released?: boolean, error?: string }}
 */
function releaseStory(storyId, options = {}) {
  const { rootDir } = options;
  const root = rootDir || getProjectRoot();
  const statusPath = getStatusPath(root);

  // Load status.json
  const result = safeReadJSON(statusPath, { defaultValue: null });
  if (!result.ok || !result.data) {
    return { ok: false, error: result.error || 'Could not load status.json' };
  }

  const status = result.data;
  const story = status.stories?.[storyId];

  if (!story) {
    return { ok: false, error: `Story ${storyId} not found` };
  }

  // Get current session info
  const currentSession = getCurrentSession(root);
  const mySessionId = currentSession ? currentSession.session_id : null;

  // Check if we own this claim
  if (story.claimed_by && story.claimed_by.session_id !== mySessionId) {
    return {
      ok: false,
      error: `Story ${storyId} is claimed by session ${story.claimed_by.session_id}, not you`,
    };
  }

  // Remove the claim
  delete story.claimed_by;

  // Save status.json
  status.updated = new Date().toISOString();
  const writeResult = safeWriteJSON(statusPath, status);
  if (!writeResult.ok) {
    return { ok: false, error: writeResult.error };
  }

  return { ok: true, released: true };
}

/**
 * Get all stories claimed by a specific session.
 *
 * @param {string} [sessionId] - Session ID (current session if not provided)
 * @param {object} [options] - Options
 * @param {string} [options.rootDir] - Project root directory
 * @returns {{ ok: boolean, stories?: Array<{ id: string, title: string }>, error?: string }}
 */
function getClaimedStoriesForSession(sessionId, options = {}) {
  const { rootDir } = options;
  const root = rootDir || getProjectRoot();
  const statusPath = getStatusPath(root);

  // Determine session ID
  let targetSessionId = sessionId;
  if (!targetSessionId) {
    const currentSession = getCurrentSession(root);
    targetSessionId = currentSession ? currentSession.session_id : null;
  }

  if (!targetSessionId) {
    return { ok: false, error: 'Could not determine session ID' };
  }

  // Load status.json
  const result = safeReadJSON(statusPath, { defaultValue: null });
  if (!result.ok || !result.data) {
    return { ok: false, error: result.error || 'Could not load status.json' };
  }

  const status = result.data;
  const claimedStories = [];

  for (const [id, story] of Object.entries(status.stories || {})) {
    if (story.claimed_by && story.claimed_by.session_id === targetSessionId) {
      claimedStories.push({
        id,
        title: story.title,
        claimed_at: story.claimed_by.claimed_at,
      });
    }
  }

  return { ok: true, stories: claimedStories };
}

/**
 * Get all stories claimed by OTHER sessions (not this one).
 *
 * @param {object} [options] - Options
 * @param {string} [options.rootDir] - Project root directory
 * @returns {{ ok: boolean, stories?: Array<{ id: string, title: string, claimedBy: object }>, error?: string }}
 */
function getStoriesClaimedByOthers(options = {}) {
  const { rootDir } = options;
  const root = rootDir || getProjectRoot();
  const statusPath = getStatusPath(root);

  // Get current session
  const currentSession = getCurrentSession(root);
  const mySessionId = currentSession ? currentSession.session_id : null;

  // Load status.json
  const result = safeReadJSON(statusPath, { defaultValue: null });
  if (!result.ok || !result.data) {
    return { ok: false, error: result.error || 'Could not load status.json' };
  }

  const status = result.data;
  const claimedStories = [];

  for (const [id, story] of Object.entries(status.stories || {})) {
    if (!story.claimed_by) continue;
    if (story.claimed_by.session_id === mySessionId) continue;

    // Check if claim is still valid
    if (isClaimValid(story.claimed_by)) {
      claimedStories.push({
        id,
        title: story.title,
        claimedBy: story.claimed_by,
      });
    }
  }

  return { ok: true, stories: claimedStories };
}

/**
 * Clean up stale claims (dead PIDs or expired TTL).
 * Should be called on session startup.
 *
 * @param {object} [options] - Options
 * @param {string} [options.rootDir] - Project root directory
 * @returns {{ ok: boolean, cleaned?: number, error?: string }}
 */
function cleanupStaleClaims(options = {}) {
  const { rootDir } = options;
  const root = rootDir || getProjectRoot();
  const statusPath = getStatusPath(root);

  // Load status.json
  const result = safeReadJSON(statusPath, { defaultValue: null });
  if (!result.ok || !result.data) {
    return { ok: false, error: result.error || 'Could not load status.json' };
  }

  const status = result.data;
  let cleanedCount = 0;

  for (const [id, story] of Object.entries(status.stories || {})) {
    if (!story.claimed_by) continue;

    // Check if claim is stale
    if (!isClaimValid(story.claimed_by)) {
      delete story.claimed_by;
      cleanedCount++;
    }
  }

  // Save if anything was cleaned
  if (cleanedCount > 0) {
    status.updated = new Date().toISOString();
    const writeResult = safeWriteJSON(statusPath, status);
    if (!writeResult.ok) {
      return { ok: false, error: writeResult.error };
    }
  }

  return { ok: true, cleaned: cleanedCount };
}

/**
 * Format claimed stories for display.
 *
 * @param {Array} stories - Array of claimed story objects
 * @returns {string} Formatted display string
 */
function formatClaimedStories(stories) {
  if (!stories || stories.length === 0) {
    return '';
  }

  const lines = [];
  lines.push(`${c.amber}Stories claimed by other sessions:${c.reset}`);

  for (let i = 0; i < stories.length; i++) {
    const story = stories[i];
    const isLast = i === stories.length - 1;
    const prefix = isLast ? '└─' : '├─';
    const sessionPath = story.claimedBy?.path || 'unknown';
    const sessionDir = path.basename(sessionPath);
    const sessionId = story.claimedBy?.session_id || '?';

    lines.push(
      `  ${prefix} ${c.lavender}${story.id}${c.reset} "${story.title}" ${c.dim}→ Session ${sessionId} (${sessionDir})${c.reset}`
    );
  }

  return lines.join('\n');
}

// CLI interface
function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  switch (command) {
    case 'claim': {
      const storyId = args[1];
      const force = args.includes('--force');
      if (!storyId) {
        console.log(JSON.stringify({ ok: false, error: 'Story ID required' }));
        return;
      }
      const result = claimStory(storyId, { force });
      console.log(JSON.stringify(result));
      break;
    }

    case 'release': {
      const storyId = args[1];
      if (!storyId) {
        console.log(JSON.stringify({ ok: false, error: 'Story ID required' }));
        return;
      }
      const result = releaseStory(storyId);
      console.log(JSON.stringify(result));
      break;
    }

    case 'list': {
      const sessionId = args[1] || null;
      const result = getClaimedStoriesForSession(sessionId);
      console.log(JSON.stringify(result));
      break;
    }

    case 'others': {
      const result = getStoriesClaimedByOthers();
      if (result.ok && result.stories.length > 0) {
        console.log(formatClaimedStories(result.stories));
      } else {
        console.log(JSON.stringify(result));
      }
      break;
    }

    case 'cleanup': {
      const result = cleanupStaleClaims();
      console.log(JSON.stringify(result));
      break;
    }

    case 'check': {
      const storyId = args[1];
      if (!storyId) {
        console.log(JSON.stringify({ ok: false, error: 'Story ID required' }));
        return;
      }

      const statusPath = getStatusPath();
      const result = safeReadJSON(statusPath, { defaultValue: null });
      if (!result.ok || !result.data) {
        console.log(JSON.stringify({ ok: false, error: 'Could not load status.json' }));
        return;
      }

      const story = result.data.stories?.[storyId];
      if (!story) {
        console.log(JSON.stringify({ ok: false, error: `Story ${storyId} not found` }));
        return;
      }

      const claimCheck = isStoryClaimed(story);
      console.log(JSON.stringify({ ok: true, ...claimCheck }));
      break;
    }

    case 'help':
    default:
      console.log(`
${c.brand}${c.bold}Story Claiming${c.reset} - Inter-session coordination

${c.cyan}Commands:${c.reset}
  claim <story-id> [--force]  Claim a story for this session
  release <story-id>          Release a story claim
  list [session-id]           List stories claimed by session (current if not specified)
  others                      List stories claimed by OTHER sessions
  cleanup                     Clean up stale claims (dead PIDs)
  check <story-id>            Check if a story is claimed
  help                        Show this help

${c.cyan}Examples:${c.reset}
  node story-claiming.js claim US-0042
  node story-claiming.js release US-0042
  node story-claiming.js others
  node story-claiming.js cleanup
`);
  }
}

// Export for use as module
module.exports = {
  // Core functions
  claimStory,
  releaseStory,
  isStoryClaimed,
  isClaimValid,
  cleanupStaleClaims,

  // Query functions
  getClaimedStoriesForSession,
  getStoriesClaimedByOthers,
  getCurrentSession,

  // Utilities
  isPidAlive,
  formatClaimedStories,

  // Constants
  DEFAULT_CLAIM_TTL_HOURS,
};

// Run CLI if executed directly
if (require.main === module) {
  main();
}
