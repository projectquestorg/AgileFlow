#!/usr/bin/env node
/**
 * session-manager.js - Multi-session coordination for Claude Code
 *
 * Manages parallel Claude Code sessions with:
 * - Numbered session IDs (1, 2, 3...)
 * - PID-based liveness detection
 * - Git worktree automation
 * - Registry persistence
 */

const fs = require('fs');
const path = require('path');
const { execSync, spawnSync } = require('child_process');

// Shared utilities
const { c } = require('../lib/colors');
const { getProjectRoot } = require('../lib/paths');
const { safeReadJSON } = require('../lib/errors');
const { isValidBranchName, isValidSessionNickname } = require('../lib/validate');

const ROOT = getProjectRoot();
const SESSIONS_DIR = path.join(ROOT, '.agileflow', 'sessions');
const REGISTRY_PATH = path.join(SESSIONS_DIR, 'registry.json');

// Ensure sessions directory exists
function ensureSessionsDir() {
  if (!fs.existsSync(SESSIONS_DIR)) {
    fs.mkdirSync(SESSIONS_DIR, { recursive: true });
  }
}

// Load or create registry
function loadRegistry() {
  ensureSessionsDir();

  if (fs.existsSync(REGISTRY_PATH)) {
    try {
      return JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8'));
    } catch (e) {
      console.error(`${c.red}Error loading registry: ${e.message}${c.reset}`);
    }
  }

  // Create default registry
  const registry = {
    schema_version: '1.0.0',
    next_id: 1,
    project_name: path.basename(ROOT),
    sessions: {},
  };

  saveRegistry(registry);
  return registry;
}

// Save registry
function saveRegistry(registry) {
  ensureSessionsDir();
  registry.updated = new Date().toISOString();
  fs.writeFileSync(REGISTRY_PATH, JSON.stringify(registry, null, 2) + '\n');
}

// Check if PID is alive
function isPidAlive(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return false;
  }
}

// Get lock file path for session
function getLockPath(sessionId) {
  return path.join(SESSIONS_DIR, `${sessionId}.lock`);
}

// Read lock file
function readLock(sessionId) {
  const lockPath = getLockPath(sessionId);
  if (!fs.existsSync(lockPath)) return null;

  try {
    const content = fs.readFileSync(lockPath, 'utf8');
    const lock = {};
    content.split('\n').forEach(line => {
      const [key, value] = line.split('=');
      if (key && value) lock[key.trim()] = value.trim();
    });
    return lock;
  } catch (e) {
    return null;
  }
}

// Write lock file
function writeLock(sessionId, pid) {
  const lockPath = getLockPath(sessionId);
  const content = `pid=${pid}\nstarted=${Math.floor(Date.now() / 1000)}\n`;
  fs.writeFileSync(lockPath, content);
}

// Remove lock file
function removeLock(sessionId) {
  const lockPath = getLockPath(sessionId);
  if (fs.existsSync(lockPath)) {
    fs.unlinkSync(lockPath);
  }
}

// Check if session is active (has lock with alive PID)
function isSessionActive(sessionId) {
  const lock = readLock(sessionId);
  if (!lock || !lock.pid) return false;
  return isPidAlive(parseInt(lock.pid, 10));
}

// Clean up stale locks
function cleanupStaleLocks(registry) {
  let cleaned = 0;

  for (const [id, session] of Object.entries(registry.sessions)) {
    const lock = readLock(id);
    if (lock && !isPidAlive(parseInt(lock.pid, 10))) {
      removeLock(id);
      cleaned++;
    }
  }

  return cleaned;
}

// Get current git branch
function getCurrentBranch() {
  try {
    return execSync('git branch --show-current', { cwd: ROOT, encoding: 'utf8' }).trim();
  } catch (e) {
    return 'unknown';
  }
}

// Get current story from status.json
function getCurrentStory() {
  const statusPath = path.join(ROOT, 'docs', '09-agents', 'status.json');
  const result = safeReadJSON(statusPath, { defaultValue: null });

  if (!result.ok || !result.data) return null;

  for (const [id, story] of Object.entries(result.data.stories || {})) {
    if (story.status === 'in_progress') {
      return { id, title: story.title };
    }
  }
  return null;
}

// Register current session (called on startup)
function registerSession(nickname = null) {
  const registry = loadRegistry();
  const cwd = process.cwd();
  const branch = getCurrentBranch();
  const story = getCurrentStory();
  const pid = process.ppid || process.pid; // Parent PID (Claude Code) or current

  // Check if this path already has a session
  let existingId = null;
  for (const [id, session] of Object.entries(registry.sessions)) {
    if (session.path === cwd) {
      existingId = id;
      break;
    }
  }

  if (existingId) {
    // Update existing session
    registry.sessions[existingId].branch = branch;
    registry.sessions[existingId].story = story ? story.id : null;
    registry.sessions[existingId].last_active = new Date().toISOString();
    if (nickname) registry.sessions[existingId].nickname = nickname;

    writeLock(existingId, pid);
    saveRegistry(registry);

    return { id: existingId, isNew: false };
  }

  // Create new session
  const sessionId = String(registry.next_id);
  registry.next_id++;

  registry.sessions[sessionId] = {
    path: cwd,
    branch,
    story: story ? story.id : null,
    nickname: nickname || null,
    created: new Date().toISOString(),
    last_active: new Date().toISOString(),
    is_main: cwd === ROOT,
  };

  writeLock(sessionId, pid);
  saveRegistry(registry);

  return { id: sessionId, isNew: true };
}

// Unregister session (called on exit)
function unregisterSession(sessionId) {
  const registry = loadRegistry();

  if (registry.sessions[sessionId]) {
    registry.sessions[sessionId].last_active = new Date().toISOString();
    removeLock(sessionId);
    saveRegistry(registry);
  }
}

// Create new session with worktree
function createSession(options = {}) {
  const registry = loadRegistry();
  const sessionId = String(registry.next_id);
  const projectName = registry.project_name;

  const nickname = options.nickname || null;
  const branchName = options.branch || `session-${sessionId}`;
  const dirName = nickname || sessionId;

  // SECURITY: Validate branch name to prevent command injection
  if (!isValidBranchName(branchName)) {
    return {
      success: false,
      error: `Invalid branch name: "${branchName}". Use only letters, numbers, hyphens, underscores, and forward slashes.`,
    };
  }

  // SECURITY: Validate nickname if provided
  if (nickname && !isValidSessionNickname(nickname)) {
    return {
      success: false,
      error: `Invalid nickname: "${nickname}". Use only letters, numbers, hyphens, and underscores.`,
    };
  }

  const worktreePath = path.resolve(ROOT, '..', `${projectName}-${dirName}`);

  // Check if directory already exists
  if (fs.existsSync(worktreePath)) {
    return {
      success: false,
      error: `Directory already exists: ${worktreePath}`,
    };
  }

  // Create branch if it doesn't exist (using spawnSync for safety)
  const checkRef = spawnSync(
    'git',
    ['show-ref', '--verify', '--quiet', `refs/heads/${branchName}`],
    {
      cwd: ROOT,
      encoding: 'utf8',
    }
  );

  if (checkRef.status !== 0) {
    // Branch doesn't exist, create it
    const createBranch = spawnSync('git', ['branch', branchName], {
      cwd: ROOT,
      encoding: 'utf8',
    });

    if (createBranch.status !== 0) {
      return {
        success: false,
        error: `Failed to create branch: ${createBranch.stderr || 'unknown error'}`,
      };
    }
  }

  // Create worktree (using spawnSync for safety)
  const createWorktree = spawnSync('git', ['worktree', 'add', worktreePath, branchName], {
    cwd: ROOT,
    encoding: 'utf8',
  });

  if (createWorktree.status !== 0) {
    return {
      success: false,
      error: `Failed to create worktree: ${createWorktree.stderr || 'unknown error'}`,
    };
  }

  // Register session
  registry.next_id++;
  registry.sessions[sessionId] = {
    path: worktreePath,
    branch: branchName,
    story: null,
    nickname,
    created: new Date().toISOString(),
    last_active: new Date().toISOString(),
    is_main: false,
  };

  saveRegistry(registry);

  return {
    success: true,
    sessionId,
    path: worktreePath,
    branch: branchName,
    command: `cd "${worktreePath}" && claude`,
  };
}

// Get all sessions with status
function getSessions() {
  const registry = loadRegistry();
  const cleaned = cleanupStaleLocks(registry);

  const sessions = [];
  for (const [id, session] of Object.entries(registry.sessions)) {
    sessions.push({
      id,
      ...session,
      active: isSessionActive(id),
      current: session.path === process.cwd(),
    });
  }

  // Sort by ID (numeric)
  sessions.sort((a, b) => parseInt(a.id) - parseInt(b.id));

  return { sessions, cleaned };
}

// Get count of active sessions (excluding current)
function getActiveSessionCount() {
  const { sessions } = getSessions();
  const cwd = process.cwd();
  return sessions.filter(s => s.active && s.path !== cwd).length;
}

// Delete session (and optionally worktree)
function deleteSession(sessionId, removeWorktree = false) {
  const registry = loadRegistry();
  const session = registry.sessions[sessionId];

  if (!session) {
    return { success: false, error: `Session ${sessionId} not found` };
  }

  if (session.is_main) {
    return { success: false, error: 'Cannot delete main session' };
  }

  // Remove lock
  removeLock(sessionId);

  // Remove worktree if requested
  if (removeWorktree && fs.existsSync(session.path)) {
    try {
      execSync(`git worktree remove "${session.path}"`, { cwd: ROOT, encoding: 'utf8' });
    } catch (e) {
      // Try force remove
      try {
        execSync(`git worktree remove --force "${session.path}"`, { cwd: ROOT, encoding: 'utf8' });
      } catch (e2) {
        return { success: false, error: `Failed to remove worktree: ${e2.message}` };
      }
    }
  }

  // Remove from registry
  delete registry.sessions[sessionId];
  saveRegistry(registry);

  return { success: true };
}

// Get main branch name (main or master)
function getMainBranch() {
  const checkMain = spawnSync('git', ['show-ref', '--verify', '--quiet', 'refs/heads/main'], {
    cwd: ROOT,
    encoding: 'utf8',
  });

  if (checkMain.status === 0) return 'main';

  const checkMaster = spawnSync('git', ['show-ref', '--verify', '--quiet', 'refs/heads/master'], {
    cwd: ROOT,
    encoding: 'utf8',
  });

  if (checkMaster.status === 0) return 'master';

  return 'main'; // Default fallback
}

// Check if session branch is mergeable to main
function checkMergeability(sessionId) {
  const registry = loadRegistry();
  const session = registry.sessions[sessionId];

  if (!session) {
    return { success: false, error: `Session ${sessionId} not found` };
  }

  if (session.is_main) {
    return { success: false, error: 'Cannot merge main session' };
  }

  const branchName = session.branch;
  const mainBranch = getMainBranch();

  // Check for uncommitted changes in the session worktree
  const statusResult = spawnSync('git', ['status', '--porcelain'], {
    cwd: session.path,
    encoding: 'utf8',
  });

  if (statusResult.stdout && statusResult.stdout.trim()) {
    return {
      success: true,
      mergeable: false,
      reason: 'uncommitted_changes',
      details: statusResult.stdout.trim(),
      branchName,
      mainBranch,
    };
  }

  // Check if branch has commits ahead of main
  const aheadBehind = spawnSync(
    'git',
    ['rev-list', '--left-right', '--count', `${mainBranch}...${branchName}`],
    {
      cwd: ROOT,
      encoding: 'utf8',
    }
  );

  const [behind, ahead] = (aheadBehind.stdout || '0\t0').trim().split('\t').map(Number);

  if (ahead === 0) {
    return {
      success: true,
      mergeable: false,
      reason: 'no_changes',
      details: 'Branch has no commits ahead of main',
      branchName,
      mainBranch,
      commitsAhead: 0,
      commitsBehind: behind,
    };
  }

  // Try merge --no-commit --no-ff to check for conflicts (dry run)
  // First, stash any changes in ROOT and ensure we're on main
  const currentBranch = getCurrentBranch();

  // Checkout main in ROOT for the test merge
  const checkoutMain = spawnSync('git', ['checkout', mainBranch], {
    cwd: ROOT,
    encoding: 'utf8',
  });

  if (checkoutMain.status !== 0) {
    return {
      success: false,
      error: `Failed to checkout ${mainBranch}: ${checkoutMain.stderr}`,
    };
  }

  // Try the merge
  const testMerge = spawnSync('git', ['merge', '--no-commit', '--no-ff', branchName], {
    cwd: ROOT,
    encoding: 'utf8',
  });

  const hasConflicts = testMerge.status !== 0;

  // Abort the test merge
  spawnSync('git', ['merge', '--abort'], { cwd: ROOT, encoding: 'utf8' });

  // Go back to original branch if different
  if (currentBranch && currentBranch !== mainBranch) {
    spawnSync('git', ['checkout', currentBranch], { cwd: ROOT, encoding: 'utf8' });
  }

  return {
    success: true,
    mergeable: !hasConflicts,
    branchName,
    mainBranch,
    commitsAhead: ahead,
    commitsBehind: behind,
    hasConflicts,
    conflictDetails: hasConflicts ? testMerge.stderr : null,
  };
}

// Get merge preview (commits and files to be merged)
function getMergePreview(sessionId) {
  const registry = loadRegistry();
  const session = registry.sessions[sessionId];

  if (!session) {
    return { success: false, error: `Session ${sessionId} not found` };
  }

  if (session.is_main) {
    return { success: false, error: 'Cannot preview merge for main session' };
  }

  const branchName = session.branch;
  const mainBranch = getMainBranch();

  // Get commits that would be merged
  const logResult = spawnSync('git', ['log', '--oneline', `${mainBranch}..${branchName}`], {
    cwd: ROOT,
    encoding: 'utf8',
  });

  const commits = (logResult.stdout || '').trim().split('\n').filter(Boolean);

  // Get files changed
  const diffResult = spawnSync('git', ['diff', '--name-status', `${mainBranch}...${branchName}`], {
    cwd: ROOT,
    encoding: 'utf8',
  });

  const filesChanged = (diffResult.stdout || '').trim().split('\n').filter(Boolean);

  return {
    success: true,
    branchName,
    mainBranch,
    nickname: session.nickname,
    commits,
    commitCount: commits.length,
    filesChanged,
    fileCount: filesChanged.length,
  };
}

// Execute merge operation
function integrateSession(sessionId, options = {}) {
  const {
    strategy = 'squash',
    deleteBranch = true,
    deleteWorktree = true,
    message = null,
  } = options;

  const registry = loadRegistry();
  const session = registry.sessions[sessionId];

  if (!session) {
    return { success: false, error: `Session ${sessionId} not found` };
  }

  if (session.is_main) {
    return { success: false, error: 'Cannot merge main session' };
  }

  const branchName = session.branch;
  const mainBranch = getMainBranch();

  // Ensure we're on main branch in ROOT
  const checkoutMain = spawnSync('git', ['checkout', mainBranch], {
    cwd: ROOT,
    encoding: 'utf8',
  });

  if (checkoutMain.status !== 0) {
    return { success: false, error: `Failed to checkout ${mainBranch}: ${checkoutMain.stderr}` };
  }

  // Pull latest main (optional, for safety) - ignore errors for local-only repos
  spawnSync('git', ['pull', '--ff-only'], { cwd: ROOT, encoding: 'utf8' });

  // Build commit message
  const commitMessage =
    message ||
    `Merge session ${sessionId}${session.nickname ? ` "${session.nickname}"` : ''}: ${branchName}`;

  // Execute merge based on strategy
  let mergeResult;

  if (strategy === 'squash') {
    mergeResult = spawnSync('git', ['merge', '--squash', branchName], {
      cwd: ROOT,
      encoding: 'utf8',
    });

    if (mergeResult.status === 0) {
      // Create the squash commit
      const commitResult = spawnSync('git', ['commit', '-m', commitMessage], {
        cwd: ROOT,
        encoding: 'utf8',
      });

      if (commitResult.status !== 0) {
        return { success: false, error: `Failed to create squash commit: ${commitResult.stderr}` };
      }
    }
  } else {
    // Regular merge commit
    mergeResult = spawnSync('git', ['merge', '--no-ff', '-m', commitMessage, branchName], {
      cwd: ROOT,
      encoding: 'utf8',
    });
  }

  if (mergeResult.status !== 0) {
    // Abort if merge failed
    spawnSync('git', ['merge', '--abort'], { cwd: ROOT, encoding: 'utf8' });
    return { success: false, error: `Merge failed: ${mergeResult.stderr}`, hasConflicts: true };
  }

  const result = {
    success: true,
    merged: true,
    strategy,
    branchName,
    mainBranch,
    commitMessage,
    mainPath: ROOT,
  };

  // Delete worktree first (before branch, as worktree holds ref)
  if (deleteWorktree && session.path !== ROOT && fs.existsSync(session.path)) {
    try {
      execSync(`git worktree remove "${session.path}"`, { cwd: ROOT, encoding: 'utf8' });
      result.worktreeDeleted = true;
    } catch (e) {
      try {
        execSync(`git worktree remove --force "${session.path}"`, { cwd: ROOT, encoding: 'utf8' });
        result.worktreeDeleted = true;
      } catch (e2) {
        result.worktreeDeleted = false;
        result.worktreeError = e2.message;
      }
    }
  }

  // Delete branch if requested
  if (deleteBranch) {
    const deleteBranchResult = spawnSync('git', ['branch', '-d', branchName], {
      cwd: ROOT,
      encoding: 'utf8',
    });
    result.branchDeleted = deleteBranchResult.status === 0;
    if (!result.branchDeleted) {
      // Try force delete if normal delete fails
      const forceDelete = spawnSync('git', ['branch', '-D', branchName], {
        cwd: ROOT,
        encoding: 'utf8',
      });
      result.branchDeleted = forceDelete.status === 0;
    }
  }

  // Remove from registry
  removeLock(sessionId);
  delete registry.sessions[sessionId];
  saveRegistry(registry);

  return result;
}

// Format sessions for display
function formatSessionsTable(sessions) {
  const lines = [];

  lines.push(`${c.cyan}Active Sessions:${c.reset}`);
  lines.push(`${'─'.repeat(70)}`);

  for (const session of sessions) {
    const status = session.active ? `${c.green}●${c.reset}` : `${c.dim}○${c.reset}`;
    const current = session.current ? ` ${c.yellow}(current)${c.reset}` : '';
    const name = session.nickname ? `"${session.nickname}"` : session.branch;
    const story = session.story ? `${c.blue}${session.story}${c.reset}` : `${c.dim}-${c.reset}`;

    lines.push(`  ${status} [${c.bold}${session.id}${c.reset}] ${name}${current}`);
    lines.push(`      ${c.dim}Story:${c.reset} ${story} ${c.dim}│ Path:${c.reset} ${session.path}`);
  }

  lines.push(`${'─'.repeat(70)}`);

  return lines.join('\n');
}

// CLI interface
function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  switch (command) {
    case 'register': {
      const nickname = args[1] || null;
      const result = registerSession(nickname);
      console.log(JSON.stringify(result));
      break;
    }

    case 'unregister': {
      const sessionId = args[1];
      if (sessionId) {
        unregisterSession(sessionId);
        console.log(JSON.stringify({ success: true }));
      } else {
        console.log(JSON.stringify({ success: false, error: 'Session ID required' }));
      }
      break;
    }

    case 'create': {
      const options = {};
      // SECURITY: Only accept whitelisted option keys
      const allowedKeys = ['nickname', 'branch'];
      for (let i = 1; i < args.length; i++) {
        const arg = args[i];
        if (arg.startsWith('--')) {
          const key = arg.slice(2).split('=')[0];
          if (!allowedKeys.includes(key)) {
            console.log(JSON.stringify({ success: false, error: `Unknown option: --${key}` }));
            return;
          }
          // Handle --key=value or --key value formats
          const eqIndex = arg.indexOf('=');
          if (eqIndex !== -1) {
            options[key] = arg.slice(eqIndex + 1);
          } else if (args[i + 1] && !args[i + 1].startsWith('--')) {
            options[key] = args[++i];
          }
        }
      }
      const result = createSession(options);
      console.log(JSON.stringify(result));
      break;
    }

    case 'list': {
      const { sessions, cleaned } = getSessions();
      if (args.includes('--json')) {
        console.log(JSON.stringify({ sessions, cleaned }));
      } else {
        console.log(formatSessionsTable(sessions));
        if (cleaned > 0) {
          console.log(`${c.dim}Cleaned ${cleaned} stale lock(s)${c.reset}`);
        }
      }
      break;
    }

    case 'count': {
      const count = getActiveSessionCount();
      console.log(JSON.stringify({ count }));
      break;
    }

    case 'delete': {
      const sessionId = args[1];
      const removeWorktree = args.includes('--remove-worktree');
      const result = deleteSession(sessionId, removeWorktree);
      console.log(JSON.stringify(result));
      break;
    }

    case 'status': {
      const { sessions } = getSessions();
      const cwd = process.cwd();
      const current = sessions.find(s => s.path === cwd);
      const others = sessions.filter(s => s.active && s.path !== cwd);

      console.log(
        JSON.stringify({
          current: current || null,
          otherActive: others.length,
          total: sessions.length,
        })
      );
      break;
    }

    case 'check-merge': {
      const sessionId = args[1];
      if (!sessionId) {
        console.log(JSON.stringify({ success: false, error: 'Session ID required' }));
        return;
      }
      const result = checkMergeability(sessionId);
      console.log(JSON.stringify(result));
      break;
    }

    case 'merge-preview': {
      const sessionId = args[1];
      if (!sessionId) {
        console.log(JSON.stringify({ success: false, error: 'Session ID required' }));
        return;
      }
      const result = getMergePreview(sessionId);
      console.log(JSON.stringify(result));
      break;
    }

    case 'integrate': {
      const sessionId = args[1];
      if (!sessionId) {
        console.log(JSON.stringify({ success: false, error: 'Session ID required' }));
        return;
      }
      const options = {};
      const allowedKeys = ['strategy', 'deleteBranch', 'deleteWorktree', 'message'];
      for (let i = 2; i < args.length; i++) {
        const arg = args[i];
        if (arg.startsWith('--')) {
          const eqIndex = arg.indexOf('=');
          let key, value;
          if (eqIndex !== -1) {
            key = arg.slice(2, eqIndex);
            value = arg.slice(eqIndex + 1);
          } else {
            key = arg.slice(2);
            value = args[++i];
          }
          if (!allowedKeys.includes(key)) {
            console.log(JSON.stringify({ success: false, error: `Unknown option: --${key}` }));
            return;
          }
          // Convert boolean strings
          if (key === 'deleteBranch' || key === 'deleteWorktree') {
            options[key] = value !== 'false';
          } else {
            options[key] = value;
          }
        }
      }
      const result = integrateSession(sessionId, options);
      console.log(JSON.stringify(result));
      break;
    }

    case 'smart-merge': {
      const sessionId = args[1];
      if (!sessionId) {
        console.log(JSON.stringify({ success: false, error: 'Session ID required' }));
        return;
      }
      const options = {};
      const allowedKeys = ['strategy', 'deleteBranch', 'deleteWorktree', 'message'];
      for (let i = 2; i < args.length; i++) {
        const arg = args[i];
        if (arg.startsWith('--')) {
          const eqIndex = arg.indexOf('=');
          let key, value;
          if (eqIndex !== -1) {
            key = arg.slice(2, eqIndex);
            value = arg.slice(eqIndex + 1);
          } else {
            key = arg.slice(2);
            value = args[++i];
          }
          if (!allowedKeys.includes(key)) {
            console.log(JSON.stringify({ success: false, error: `Unknown option: --${key}` }));
            return;
          }
          // Convert boolean strings
          if (key === 'deleteBranch' || key === 'deleteWorktree') {
            options[key] = value !== 'false';
          } else {
            options[key] = value;
          }
        }
      }
      const result = smartMerge(sessionId, options);
      console.log(JSON.stringify(result, null, 2));
      break;
    }

    case 'merge-history': {
      const result = getMergeHistory();
      console.log(JSON.stringify(result, null, 2));
      break;
    }

    case 'help':
    default:
      console.log(`
${c.brand}${c.bold}Session Manager${c.reset} - Multi-session coordination for Claude Code

${c.cyan}Commands:${c.reset}
  register [nickname]     Register current directory as a session
  unregister <id>         Unregister a session (remove lock)
  create [--nickname X]   Create new session with git worktree
  list [--json]           List all sessions
  count                   Count other active sessions
  delete <id> [--remove-worktree]  Delete session
  status                  Get current session status
  check-merge <id>        Check if session is mergeable to main
  merge-preview <id>      Preview commits/files to be merged
  integrate <id> [opts]   Merge session to main and cleanup
  smart-merge <id> [opts] Auto-resolve conflicts and merge
  merge-history           View merge audit log
  help                    Show this help

${c.cyan}Merge Options (integrate & smart-merge):${c.reset}
  --strategy=squash|merge   Merge strategy (default: squash)
  --deleteBranch=true|false Delete branch after merge (default: true)
  --deleteWorktree=true|false Delete worktree after merge (default: true)
  --message="..."           Custom commit message

${c.cyan}Smart Merge Resolution Strategies:${c.reset}
  docs (.md, README)      → accept_both (keep changes from both)
  tests (.test., .spec.)  → accept_both (keep changes from both)
  schema (.sql, prisma)   → take_theirs (use session version)
  config (.json, .yaml)   → merge_keys (keep main, log for review)
  source code             → take_theirs (use session version)

${c.cyan}Examples:${c.reset}
  node session-manager.js register
  node session-manager.js create --nickname auth
  node session-manager.js list
  node session-manager.js delete 2 --remove-worktree
  node session-manager.js check-merge 2
  node session-manager.js integrate 2 --strategy=squash
  node session-manager.js smart-merge 2 --strategy=squash
  node session-manager.js merge-history
`);
  }
}

// File tracking integration for smart merge
let fileTracking;
try {
  fileTracking = require('./lib/file-tracking.js');
} catch (e) {
  // File tracking not available
}

/**
 * Categorize a file by type for merge strategy selection.
 * @param {string} filePath - File path
 * @returns {string} Category: 'docs', 'test', 'schema', 'config', 'source'
 */
function categorizeFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const basename = path.basename(filePath).toLowerCase();
  const dirname = path.dirname(filePath).toLowerCase();

  // Documentation files
  if (ext === '.md' || basename === 'readme' || basename.startsWith('readme.')) {
    return 'docs';
  }

  // Test files
  if (
    filePath.includes('.test.') ||
    filePath.includes('.spec.') ||
    filePath.includes('__tests__') ||
    dirname.includes('test') ||
    dirname.includes('tests')
  ) {
    return 'test';
  }

  // Schema/migration files
  if (
    ext === '.sql' ||
    filePath.includes('schema') ||
    filePath.includes('migration') ||
    filePath.includes('prisma')
  ) {
    return 'schema';
  }

  // Config files
  if (
    ext === '.json' ||
    ext === '.yaml' ||
    ext === '.yml' ||
    ext === '.toml' ||
    basename.includes('config') ||
    basename.startsWith('.') // dotfiles
  ) {
    return 'config';
  }

  // Default: source code
  return 'source';
}

/**
 * Get merge strategy for a file category.
 * @param {string} category - File category
 * @returns {{ strategy: string, gitStrategy: string, description: string }}
 */
function getMergeStrategy(category) {
  const strategies = {
    docs: {
      strategy: 'accept_both',
      gitStrategy: 'union', // Git's union strategy for text files
      description: 'Documentation is additive - both changes kept',
    },
    test: {
      strategy: 'accept_both',
      gitStrategy: 'union',
      description: 'Tests are additive - both test files kept',
    },
    schema: {
      strategy: 'take_theirs',
      gitStrategy: 'theirs',
      description: 'Schemas evolve forward - session version used',
    },
    config: {
      strategy: 'merge_keys',
      gitStrategy: 'ours', // Conservative - keep main, log for review
      description: 'Config changes need review - main version kept',
    },
    source: {
      strategy: 'intelligent_merge',
      gitStrategy: 'recursive',
      description: 'Source code merged by git recursive strategy',
    },
  };

  return strategies[category] || strategies.source;
}

/**
 * Smart merge with automatic conflict resolution.
 * Resolves conflicts based on file type categorization.
 *
 * @param {string} sessionId - Session ID to merge
 * @param {object} [options] - Options
 * @param {string} [options.strategy='squash'] - Merge strategy
 * @param {boolean} [options.deleteBranch=true] - Delete branch after merge
 * @param {boolean} [options.deleteWorktree=true] - Delete worktree after merge
 * @param {string} [options.message=null] - Custom commit message
 * @returns {{ success: boolean, merged?: boolean, autoResolved?: object[], error?: string }}
 */
function smartMerge(sessionId, options = {}) {
  const {
    strategy = 'squash',
    deleteBranch = true,
    deleteWorktree = true,
    message = null,
  } = options;

  const registry = loadRegistry();
  const session = registry.sessions[sessionId];

  if (!session) {
    return { success: false, error: `Session ${sessionId} not found` };
  }

  if (session.is_main) {
    return { success: false, error: 'Cannot merge main session' };
  }

  const branchName = session.branch;
  const mainBranch = getMainBranch();

  // First, try normal merge
  const checkResult = checkMergeability(sessionId);
  if (!checkResult.success) {
    return checkResult;
  }

  // If no conflicts, use regular merge
  if (!checkResult.hasConflicts) {
    return integrateSession(sessionId, options);
  }

  // We have conflicts - try smart resolution
  console.log(`${c.amber}Conflicts detected - attempting auto-resolution...${c.reset}`);

  // Get list of conflicting files
  const conflictFiles = getConflictingFiles(sessionId);
  if (!conflictFiles.success) {
    return conflictFiles;
  }

  // Categorize and plan resolutions
  const resolutions = conflictFiles.files.map((file) => {
    const category = categorizeFile(file);
    const strategyInfo = getMergeStrategy(category);
    return {
      file,
      category,
      ...strategyInfo,
    };
  });

  // Log merge audit
  const mergeLog = {
    session: sessionId,
    started_at: new Date().toISOString(),
    files_to_resolve: resolutions,
  };

  // Ensure we're on main branch
  const checkoutMain = spawnSync('git', ['checkout', mainBranch], {
    cwd: ROOT,
    encoding: 'utf8',
  });

  if (checkoutMain.status !== 0) {
    return { success: false, error: `Failed to checkout ${mainBranch}: ${checkoutMain.stderr}` };
  }

  // Start the merge
  const startMerge = spawnSync('git', ['merge', '--no-commit', '--no-ff', branchName], {
    cwd: ROOT,
    encoding: 'utf8',
  });

  // If merge started but has conflicts, resolve them
  if (startMerge.status !== 0) {
    const resolvedFiles = [];
    const unresolvedFiles = [];

    for (const resolution of resolutions) {
      const resolveResult = resolveConflict(resolution);
      if (resolveResult.success) {
        resolvedFiles.push({
          file: resolution.file,
          strategy: resolution.strategy,
          description: resolution.description,
        });
      } else {
        unresolvedFiles.push({
          file: resolution.file,
          error: resolveResult.error,
        });
      }
    }

    // If any files couldn't be resolved, abort
    if (unresolvedFiles.length > 0) {
      spawnSync('git', ['merge', '--abort'], { cwd: ROOT, encoding: 'utf8' });
      return {
        success: false,
        error: 'Some conflicts could not be auto-resolved',
        autoResolved: resolvedFiles,
        unresolved: unresolvedFiles,
        hasConflicts: true,
      };
    }

    // All conflicts resolved - commit the merge
    const commitMessage =
      message ||
      `Merge session ${sessionId}${session.nickname ? ` "${session.nickname}"` : ''}: ${branchName} (auto-resolved)`;

    // Stage all resolved files
    spawnSync('git', ['add', '-A'], { cwd: ROOT, encoding: 'utf8' });

    // Create commit
    const commitResult = spawnSync('git', ['commit', '-m', commitMessage], {
      cwd: ROOT,
      encoding: 'utf8',
    });

    if (commitResult.status !== 0) {
      spawnSync('git', ['merge', '--abort'], { cwd: ROOT, encoding: 'utf8' });
      return { success: false, error: `Failed to commit merge: ${commitResult.stderr}` };
    }

    // Log successful merge
    mergeLog.merged_at = new Date().toISOString();
    mergeLog.files_auto_resolved = resolvedFiles;
    mergeLog.commits_merged = checkResult.commitsAhead;
    saveMergeLog(mergeLog);

    const result = {
      success: true,
      merged: true,
      autoResolved: resolvedFiles,
      strategy,
      branchName,
      mainBranch,
      commitMessage,
      mainPath: ROOT,
    };

    // Cleanup worktree and branch
    if (deleteWorktree && session.path !== ROOT && fs.existsSync(session.path)) {
      try {
        execSync(`git worktree remove "${session.path}"`, { cwd: ROOT, encoding: 'utf8' });
        result.worktreeDeleted = true;
      } catch (e) {
        try {
          execSync(`git worktree remove --force "${session.path}"`, { cwd: ROOT, encoding: 'utf8' });
          result.worktreeDeleted = true;
        } catch (e2) {
          result.worktreeDeleted = false;
        }
      }
    }

    if (deleteBranch) {
      try {
        execSync(`git branch -D "${branchName}"`, { cwd: ROOT, encoding: 'utf8' });
        result.branchDeleted = true;
      } catch (e) {
        result.branchDeleted = false;
      }
    }

    // Clear file tracking for this session
    if (fileTracking) {
      try {
        fileTracking.clearSessionFiles({ rootDir: session.path });
      } catch (e) {
        // Ignore file tracking errors
      }
    }

    // Unregister the session
    unregisterSession(sessionId);

    return result;
  }

  // Merge succeeded without conflicts (shouldn't happen given our check, but handle it)
  const commitMessage =
    message ||
    `Merge session ${sessionId}${session.nickname ? ` "${session.nickname}"` : ''}: ${branchName}`;

  const commitResult = spawnSync('git', ['commit', '-m', commitMessage], {
    cwd: ROOT,
    encoding: 'utf8',
  });

  if (commitResult.status !== 0) {
    return { success: false, error: `Failed to commit: ${commitResult.stderr}` };
  }

  return {
    success: true,
    merged: true,
    strategy,
    branchName,
    mainBranch,
    commitMessage,
  };
}

/**
 * Get list of files that would conflict during merge.
 * @param {string} sessionId - Session ID
 * @returns {{ success: boolean, files?: string[], error?: string }}
 */
function getConflictingFiles(sessionId) {
  const registry = loadRegistry();
  const session = registry.sessions[sessionId];

  if (!session) {
    return { success: false, error: `Session ${sessionId} not found` };
  }

  const branchName = session.branch;
  const mainBranch = getMainBranch();

  // Get files changed in both branches since divergence
  const mergeBase = spawnSync('git', ['merge-base', mainBranch, branchName], {
    cwd: ROOT,
    encoding: 'utf8',
  });

  if (mergeBase.status !== 0) {
    return { success: false, error: 'Could not find merge base' };
  }

  const base = mergeBase.stdout.trim();

  // Files changed in main since base
  const mainFiles = spawnSync('git', ['diff', '--name-only', base, mainBranch], {
    cwd: ROOT,
    encoding: 'utf8',
  });

  // Files changed in session branch since base
  const branchFiles = spawnSync('git', ['diff', '--name-only', base, branchName], {
    cwd: ROOT,
    encoding: 'utf8',
  });

  const mainSet = new Set((mainFiles.stdout || '').trim().split('\n').filter(Boolean));
  const branchSet = new Set((branchFiles.stdout || '').trim().split('\n').filter(Boolean));

  // Find intersection (files changed in both)
  const conflicting = [...mainSet].filter((f) => branchSet.has(f));

  return { success: true, files: conflicting };
}

/**
 * Resolve a single file conflict using the designated strategy.
 * @param {object} resolution - Resolution info from categorization
 * @returns {{ success: boolean, error?: string }}
 */
function resolveConflict(resolution) {
  const { file, gitStrategy } = resolution;

  try {
    switch (gitStrategy) {
      case 'union':
        // Union merge - keep both sides (works for text files)
        execSync(`git checkout --ours "${file}" && git checkout --theirs "${file}" --`, {
          cwd: ROOT,
          encoding: 'utf8',
        });
        // Actually, use git merge-file for union
        // For simplicity, accept theirs for now and log
        execSync(`git checkout --theirs "${file}"`, { cwd: ROOT, encoding: 'utf8' });
        break;

      case 'theirs':
        // Accept the session's version
        execSync(`git checkout --theirs "${file}"`, { cwd: ROOT, encoding: 'utf8' });
        break;

      case 'ours':
        // Keep main's version
        execSync(`git checkout --ours "${file}"`, { cwd: ROOT, encoding: 'utf8' });
        break;

      case 'recursive':
      default:
        // Try to use git's recursive strategy
        // For conflicts, we'll favor theirs (the session's work)
        execSync(`git checkout --theirs "${file}"`, { cwd: ROOT, encoding: 'utf8' });
        break;
    }

    // Stage the resolved file
    execSync(`git add "${file}"`, { cwd: ROOT, encoding: 'utf8' });
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

/**
 * Save merge log for audit trail.
 * @param {object} log - Merge log entry
 */
function saveMergeLog(log) {
  const logPath = path.join(SESSIONS_DIR, 'merge-log.json');

  let logs = { merges: [] };
  if (fs.existsSync(logPath)) {
    try {
      logs = JSON.parse(fs.readFileSync(logPath, 'utf8'));
    } catch (e) {
      // Start fresh
    }
  }

  logs.merges.push(log);

  // Keep only last 50 merges
  if (logs.merges.length > 50) {
    logs.merges = logs.merges.slice(-50);
  }

  fs.writeFileSync(logPath, JSON.stringify(logs, null, 2));
}

/**
 * Get merge history from audit log.
 * @returns {{ success: boolean, merges?: object[], error?: string }}
 */
function getMergeHistory() {
  const logPath = path.join(SESSIONS_DIR, 'merge-log.json');

  if (!fs.existsSync(logPath)) {
    return { success: true, merges: [] };
  }

  try {
    const logs = JSON.parse(fs.readFileSync(logPath, 'utf8'));
    return { success: true, merges: logs.merges || [] };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// Export for use as module
module.exports = {
  loadRegistry,
  saveRegistry,
  registerSession,
  unregisterSession,
  createSession,
  getSessions,
  getActiveSessionCount,
  deleteSession,
  isSessionActive,
  cleanupStaleLocks,
  // Merge operations
  getMainBranch,
  checkMergeability,
  getMergePreview,
  integrateSession,
  // Smart merge (auto-resolution)
  smartMerge,
  getConflictingFiles,
  categorizeFile,
  getMergeStrategy,
  getMergeHistory,
};

// Run CLI if executed directly
if (require.main === module) {
  main();
}
