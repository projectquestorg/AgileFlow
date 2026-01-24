#!/usr/bin/env node
/**
 * spawn-parallel.js - Spawn multiple parallel Claude Code sessions in git worktrees
 *
 * Creates worktrees using session-manager.js and optionally spawns Claude Code
 * instances in a terminal multiplexer (tmux/screen).
 *
 * Usage:
 *   node scripts/spawn-parallel.js spawn --count 4
 *   node scripts/spawn-parallel.js spawn --branches "auth,dashboard,api"
 *   node scripts/spawn-parallel.js spawn --from-epic EP-0025
 *   node scripts/spawn-parallel.js list
 *   node scripts/spawn-parallel.js kill-all
 *
 * Options:
 *   --count N         Create N worktrees with auto-generated names
 *   --branches "a,b"  Create worktrees for specific branch names
 *   --from-epic ID    Create worktrees for ready stories in epic
 *   --init            Run 'claude init' in each worktree (default: false)
 *   --dangerous       Use --dangerouslySkipPermissions (default: false)
 *   --no-tmux         Just create worktrees, output commands without spawning
 *   --prompt TEXT     Initial prompt to send to each Claude instance
 */

const fs = require('fs');
const path = require('path');
const { execSync, spawnSync } = require('child_process');

// Shared utilities
const { c, success, warning, error, dim, bold } = require('../lib/colors');
const { getProjectRoot, getStatusPath } = require('../lib/paths');
const { safeReadJSON } = require('../lib/errors');

// Import session manager functions
const sessionManager = require('./session-manager');

const ROOT = getProjectRoot();

/**
 * Check if tmux is available
 */
function hasTmux() {
  try {
    execSync('which tmux', { encoding: 'utf8', stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if screen is available
 */
function hasScreen() {
  try {
    execSync('which screen', { encoding: 'utf8', stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Build the Claude command for a session
 */
function buildClaudeCommand(sessionPath, options = {}) {
  const { init = false, dangerous = false, prompt = null, claudeArgs = null, noClaude = false } = options;
  const parts = [`cd "${sessionPath}"`];

  if (init) {
    parts.push('claude init --yes 2>/dev/null || true');
  }

  // If noClaude is true, just return cd command (no claude startup)
  if (noClaude) {
    return parts.join(' && ');
  }

  let claudeCmd = 'claude';
  if (dangerous) {
    claudeCmd = 'claude --dangerously-skip-permissions';
  } else if (claudeArgs) {
    // Custom claude arguments (e.g., --permission-mode acceptEdits)
    claudeCmd = `claude ${claudeArgs}`;
  }

  if (prompt) {
    // Escape the prompt for shell
    const escapedPrompt = prompt.replace(/'/g, "'\\''");
    parts.push(`echo '${escapedPrompt}' | ${claudeCmd}`);
  } else {
    parts.push(claudeCmd);
  }

  return parts.join(' && ');
}

/**
 * Spawn sessions in tmux
 */
function spawnInTmux(sessions, options = {}) {
  const timestamp = Date.now();
  const sessionName = `claude-parallel-${timestamp}`;

  // Create new tmux session (detached)
  const createResult = spawnSync('tmux', ['new-session', '-d', '-s', sessionName], {
    encoding: 'utf8',
  });

  if (createResult.status !== 0) {
    console.error(error(`Failed to create tmux session: ${createResult.stderr}`));
    return { success: false, error: createResult.stderr };
  }

  // Configure clean, user-friendly tmux settings
  const tmuxOpts = (opt, value) => {
    spawnSync('tmux', ['set-option', '-t', sessionName, opt, value], { encoding: 'utf8' });
  };

  // Clean, minimal status bar
  tmuxOpts('status', 'on');
  tmuxOpts('status-position', 'bottom');
  tmuxOpts('status-style', 'bg=#282c34,fg=#abb2bf');
  tmuxOpts('status-left', '#[fg=#61afef,bold] Parallel ');
  tmuxOpts('status-left-length', '15');
  tmuxOpts('status-right', '#[fg=#98c379] Alt+1/2/3 to switch │ q=quit ');
  tmuxOpts('status-right-length', '45');
  tmuxOpts('window-status-format', '#[fg=#5c6370] [#I] #W ');
  tmuxOpts('window-status-current-format', '#[fg=#61afef,bold,bg=#3e4452] [#I] #W ');
  tmuxOpts('window-status-separator', '');

  // Simple keybindings - Alt+number to switch windows
  for (let w = 1; w <= 9; w++) {
    spawnSync('tmux', ['bind-key', '-n', `M-${w}`, 'select-window', '-t', `:${w - 1}`], {
      encoding: 'utf8',
    });
  }
  spawnSync('tmux', ['bind-key', '-n', 'q', 'detach-client'], { encoding: 'utf8' });

  for (let i = 0; i < sessions.length; i++) {
    const session = sessions[i];
    const cmd = buildClaudeCommand(session.path, options);
    const windowName = session.nickname || `session-${session.sessionId}`;

    if (i === 0) {
      // First window already exists, just rename and send command
      spawnSync('tmux', ['rename-window', '-t', `${sessionName}:0`, windowName], {
        encoding: 'utf8',
      });
      spawnSync('tmux', ['send-keys', '-t', sessionName, cmd, 'Enter'], {
        encoding: 'utf8',
      });
    } else {
      // Create new window for subsequent sessions
      spawnSync('tmux', ['new-window', '-t', sessionName, '-n', windowName], {
        encoding: 'utf8',
      });
      spawnSync('tmux', ['send-keys', '-t', `${sessionName}:${windowName}`, cmd, 'Enter'], {
        encoding: 'utf8',
      });
    }
  }

  return {
    success: true,
    sessionName,
    windowCount: sessions.length,
  };
}

/**
 * Output commands without spawning (for --no-tmux mode)
 */
function outputCommands(sessions, options = {}) {
  console.log(bold('\n📋 Commands to run manually:\n'));

  for (const session of sessions) {
    const cmd = buildClaudeCommand(session.path, options);
    console.log(dim(`# Session ${session.sessionId} (${session.nickname || session.branch})`));
    console.log(cmd);
    console.log('');
  }

  console.log(dim('─'.repeat(50)));
  console.log(`${c.cyan}Copy these commands to separate terminals to run in parallel.${c.reset}`);
}

/**
 * Get ready stories from an epic
 */
function getReadyStoriesFromEpic(epicId) {
  const statusPath = getStatusPath(ROOT);
  const result = safeReadJSON(statusPath, { defaultValue: { stories: {}, epics: {} } });

  if (!result.ok) {
    return { ok: false, error: 'Could not read status.json' };
  }

  const status = result.data;
  const epic = status.epics?.[epicId];

  if (!epic) {
    return { ok: false, error: `Epic ${epicId} not found` };
  }

  const readyStories = [];
  const storyIds = epic.stories || [];

  for (const storyId of storyIds) {
    const story = status.stories?.[storyId];
    if (story && story.status === 'ready') {
      readyStories.push({
        id: storyId,
        title: story.title,
        owner: story.owner,
      });
    }
  }

  return { ok: true, stories: readyStories, epicTitle: epic.title };
}

/**
 * Main spawn command
 */
async function spawn(args) {
  const count = args.count ? parseInt(args.count, 10) : null;
  const branches = args.branches ? args.branches.split(',').map(b => b.trim()) : null;
  const fromEpic = args['from-epic'] || args.fromEpic;
  const noTmux = args['no-tmux'] || args.noTmux;
  const init = args.init || false;
  const dangerous = args.dangerous || false;
  const prompt = args.prompt || null;
  const claudeArgs = args['claude-args'] || args.claudeArgs || null;
  const noClaude = args['no-claude'] || args.noClaude || false;

  // Determine what to create
  let sessionsToCreate = [];

  if (fromEpic) {
    // Get ready stories from epic
    const epicResult = getReadyStoriesFromEpic(fromEpic);
    if (!epicResult.ok) {
      console.error(error(epicResult.error));
      process.exit(1);
    }

    if (epicResult.stories.length === 0) {
      console.log(warning(`No ready stories found in epic ${fromEpic}`));
      process.exit(0);
    }

    console.log(bold(`\n📋 Epic: ${epicResult.epicTitle}`));
    console.log(`${c.cyan}Found ${epicResult.stories.length} ready stories${c.reset}\n`);

    for (const story of epicResult.stories) {
      sessionsToCreate.push({
        nickname: story.id.toLowerCase(),
        branch: `feature/${story.id.toLowerCase()}`,
        story: story.id,
      });
    }
  } else if (branches) {
    // Create sessions for specific branches
    for (const branch of branches) {
      sessionsToCreate.push({
        nickname: branch,
        branch: `feature/${branch}`,
      });
    }
  } else if (count) {
    // Create N generic sessions
    for (let i = 1; i <= count; i++) {
      sessionsToCreate.push({
        nickname: `parallel-${i}`,
        branch: `parallel-${i}`,
      });
    }
  } else {
    console.error(error('Must specify --count, --branches, or --from-epic'));
    process.exit(1);
  }

  // Create the sessions
  console.log(bold(`\n🚀 Creating ${sessionsToCreate.length} parallel sessions...\n`));

  const createdSessions = [];
  for (const sessionSpec of sessionsToCreate) {
    const result = await sessionManager.createSession({
      nickname: sessionSpec.nickname,
      branch: sessionSpec.branch,
    });

    if (!result.success) {
      console.error(error(`Failed to create session ${sessionSpec.nickname}: ${result.error}`));
      continue;
    }

    createdSessions.push({
      sessionId: result.sessionId,
      path: result.path,
      branch: result.branch,
      nickname: sessionSpec.nickname,
      envFilesCopied: result.envFilesCopied || [],
      foldersCopied: result.foldersCopied || [],
    });

    // Show what was copied
    const copied = [...(result.envFilesCopied || []), ...(result.foldersCopied || [])];
    const copyInfo = copied.length ? dim(` (copied: ${copied.join(', ')})`) : '';
    console.log(success(`  ✓ Session ${result.sessionId}: ${sessionSpec.nickname}${copyInfo}`));
  }

  if (createdSessions.length === 0) {
    console.error(error('\nNo sessions were created.'));
    process.exit(1);
  }

  console.log('');

  // Spawn in tmux or output commands
  if (noTmux) {
    // User explicitly requested manual mode
    outputCommands(createdSessions, { init, dangerous, prompt, claudeArgs, noClaude });
  } else if (hasTmux()) {
    // Tmux available - use it
    const tmuxResult = spawnInTmux(createdSessions, { init, dangerous, prompt, claudeArgs, noClaude });

    if (tmuxResult.success) {
      console.log(success(`\n✅ Tmux session created: ${tmuxResult.sessionName}`));
      console.log(`${c.cyan}   ${tmuxResult.windowCount} windows ready${c.reset}\n`);
      console.log(bold('📺 Controls:'));
      console.log(`   ${c.cyan}tmux attach -t ${tmuxResult.sessionName}${c.reset}  - Attach`);
      console.log(`   ${dim('Alt+1/2/3')}  Switch to window 1, 2, 3`);
      console.log(`   ${dim('q')}          Quit (sessions keep running)`);
      console.log('');
    } else {
      console.error(error(`Failed to create tmux session: ${tmuxResult.error}`));
      outputCommands(createdSessions, { init, dangerous, prompt, claudeArgs, noClaude });
    }
  } else {
    // Tmux NOT available - require it or use --no-tmux
    console.log(error('\n❌ tmux is required but not installed.\n'));
    console.log(bold('Install tmux:'));
    console.log(`  ${c.cyan}macOS:${c.reset}        brew install tmux`);
    console.log(`  ${c.cyan}Ubuntu/Debian:${c.reset} sudo apt install tmux`);
    console.log(`  ${c.cyan}Fedora/RHEL:${c.reset}  sudo dnf install tmux`);
    console.log(`  ${c.cyan}No sudo?${c.reset}      conda install -c conda-forge tmux`);
    console.log('');
    console.log(dim('Or use --no-tmux to get manual commands instead:'));
    console.log(
      `  ${c.cyan}node spawn-parallel.js spawn --count ${createdSessions.length} --no-tmux${c.reset}`
    );
    console.log('');
    console.log(
      warning('Worktrees created but Claude not spawned. Install tmux or use --no-tmux.')
    );
  }

  // Summary
  console.log(bold('\n📊 Session Summary:'));
  console.log(dim('─'.repeat(50)));
  for (const session of createdSessions) {
    console.log(
      `  ${c.cyan}${session.sessionId}${c.reset} │ ${session.nickname} │ ${dim(session.branch)}`
    );
  }
  console.log(dim('─'.repeat(50)));
  console.log(`${c.cyan}Use /agileflow:session:status to view all sessions.${c.reset}`);
  console.log(`${c.cyan}Use /agileflow:session:end <id> to end and merge a session.${c.reset}\n`);
}

/**
 * List all parallel sessions
 */
function list() {
  const result = sessionManager.getSessions();

  if (result.sessions.length === 0) {
    console.log(`${c.cyan}No sessions registered.${c.reset}`);
    return;
  }

  console.log(bold('\n📋 Parallel Sessions:\n'));

  const parallelSessions = result.sessions.filter(s => !s.is_main);

  if (parallelSessions.length === 0) {
    console.log(`${c.cyan}No parallel sessions (only main session exists).${c.reset}`);
    return;
  }

  for (const session of parallelSessions) {
    const statusStr = session.active ? success('● active') : dim('○ inactive');
    const nickname = session.nickname ? `${c.cyan}${session.nickname}${c.reset}` : dim('no-name');
    console.log(`  ${session.id} │ ${nickname} │ ${session.branch} │ ${statusStr}`);
  }

  console.log('');
}

/**
 * Add a new window to an existing tmux session
 */
async function addWindow(args) {
  const nickname = args.nickname || args.name || null;
  const branch = args.branch || null;
  const dangerous = args.dangerous || false;
  const claudeArgs = args['claude-args'] || args.claudeArgs || null;
  const noClaude = args['no-claude'] || args.noClaude || false;

  // Check if we're inside a tmux session
  const tmuxEnv = process.env.TMUX;
  if (!tmuxEnv) {
    console.log(error('\n❌ Not in a tmux session.\n'));
    console.log(
      `${c.cyan}Use /agileflow:session:spawn to create a new tmux session first.${c.reset}`
    );
    console.log(`${dim('Or run: node .agileflow/scripts/spawn-parallel.js spawn --count 1')}`);
    return { success: false, error: 'Not in tmux' };
  }

  // Get current tmux session name
  let currentSession;
  try {
    currentSession = execSync('tmux display-message -p "#S"', {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  } catch {
    console.log(error('Failed to get current tmux session name.'));
    return { success: false, error: 'Failed to get tmux session' };
  }

  console.log(bold(`\n🚀 Adding new window to tmux session: ${currentSession}\n`));

  // Create a new session/worktree
  const sessionSpec = {
    nickname: nickname || `parallel-${Date.now()}`,
    branch: branch || `parallel-${Date.now()}`,
  };

  const result = await sessionManager.createSession({
    nickname: sessionSpec.nickname,
    branch: sessionSpec.branch,
  });

  if (!result.success) {
    console.error(error(`Failed to create session: ${result.error}`));
    return { success: false, error: result.error };
  }

  const windowName = sessionSpec.nickname;
  const cmd = buildClaudeCommand(result.path, { dangerous, claudeArgs, noClaude });

  // Create new window in current tmux session
  const newWindowResult = spawnSync(
    'tmux',
    ['new-window', '-t', currentSession, '-n', windowName],
    {
      encoding: 'utf8',
    }
  );

  if (newWindowResult.status !== 0) {
    console.error(error(`Failed to create tmux window: ${newWindowResult.stderr}`));
    return { success: false, error: newWindowResult.stderr };
  }

  // Send command to the new window
  spawnSync('tmux', ['send-keys', '-t', `${currentSession}:${windowName}`, cmd, 'Enter'], {
    encoding: 'utf8',
  });

  // Get window number
  let windowIndex;
  try {
    windowIndex = execSync(
      `tmux list-windows -t ${currentSession} -F "#I:#W" | grep ":${windowName}$" | cut -d: -f1`,
      {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      }
    ).trim();
  } catch {
    windowIndex = '?';
  }

  // Show what was copied
  const copied = [...(result.envFilesCopied || []), ...(result.foldersCopied || [])];
  const copyInfo = copied.length ? dim(` (copied: ${copied.join(', ')})`) : '';

  console.log(success(`  ✓ Created session ${result.sessionId}: ${windowName}${copyInfo}`));
  console.log(`    ${dim('Path:')} ${result.path}`);
  console.log(`    ${dim('Branch:')} ${result.branch}`);
  console.log('');
  console.log(success(`✅ Added window [${windowIndex}] "${windowName}" to tmux session`));
  console.log(`\n${c.cyan}Press Alt+${windowIndex} to switch to the new window${c.reset}`);
  console.log(`${dim('Or use Ctrl+b then the window number')}\n`);

  return {
    success: true,
    sessionId: result.sessionId,
    windowName,
    windowIndex,
    path: result.path,
    branch: result.branch,
  };
}

/**
 * Kill all tmux claude-parallel sessions
 */
function killAll() {
  try {
    const result = execSync('tmux list-sessions -F "#{session_name}"', {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const sessions = result
      .trim()
      .split('\n')
      .filter(s => s.startsWith('claude-parallel-'));

    if (sessions.length === 0) {
      console.log(`${c.cyan}No claude-parallel tmux sessions found.${c.reset}`);
      return;
    }

    for (const session of sessions) {
      spawnSync('tmux', ['kill-session', '-t', session], { encoding: 'utf8' });
      console.log(success(`  ✓ Killed ${session}`));
    }

    console.log(success(`\n✅ Killed ${sessions.length} tmux session(s).`));
  } catch (e) {
    if (e.message.includes('no server running')) {
      console.log(`${c.cyan}No tmux server running.${c.reset}`);
    } else {
      console.error(error(`Error: ${e.message}`));
    }
  }
}

/**
 * Show help
 */
function showHelp() {
  console.log(`
${bold('spawn-parallel.js')} - Spawn parallel Claude Code sessions in git worktrees

${c.cyan}USAGE:${c.reset}
  node scripts/spawn-parallel.js <command> [options]

${c.cyan}COMMANDS:${c.reset}
  spawn       Create worktrees and optionally spawn Claude instances
  add-window  Add a new window to current tmux session (when in tmux)
  list        List all parallel sessions
  kill-all    Kill all claude-parallel tmux sessions

${c.cyan}SPAWN OPTIONS:${c.reset}
  --count N           Create N worktrees with auto-generated names
  --branches "a,b,c"  Create worktrees for specific branch names
  --from-epic EP-XXX  Create worktrees for ready stories in epic
  --init              Run 'claude init' in each worktree
  --dangerous         Use --dangerously-skip-permissions
  --claude-args "..." Custom arguments for claude command
  --no-claude         Create worktree but don't start claude
  --no-tmux           Output commands without spawning in tmux
  --prompt "TEXT"     Initial prompt to send to each Claude instance

${c.cyan}EXAMPLES:${c.reset}
  ${dim('# Create 4 parallel sessions')}
  node scripts/spawn-parallel.js spawn --count 4

  ${dim('# Create sessions for specific features')}
  node scripts/spawn-parallel.js spawn --branches "auth,dashboard,api"

  ${dim('# Create sessions from epic stories')}
  node scripts/spawn-parallel.js spawn --from-epic EP-0025

  ${dim('# Create with claude init')}
  node scripts/spawn-parallel.js spawn --count 2 --init

  ${dim('# Just output commands (no tmux)')}
  node scripts/spawn-parallel.js spawn --count 4 --no-tmux

${c.cyan}ADD-WINDOW OPTIONS:${c.reset}
  --name NAME         Name for the new session/window
  --nickname NAME     Alias for --name
  --branch BRANCH     Use specific branch name
  --dangerous         Use --dangerously-skip-permissions
  --claude-args "..." Custom arguments for claude command
  --no-claude         Create worktree but don't start claude

${c.cyan}ADD-WINDOW EXAMPLES:${c.reset}
  ${dim('# Add window with auto-generated name (when in tmux)')}
  node scripts/spawn-parallel.js add-window

  ${dim('# Add named window')}
  node scripts/spawn-parallel.js add-window --name auth

  ${dim('# Add window without starting claude')}
  node scripts/spawn-parallel.js add-window --name research --no-claude

  ${dim('# Add window with skip permissions')}
  node scripts/spawn-parallel.js add-window --name trusted --dangerous

  ${dim('# Add window with custom claude args')}
  node scripts/spawn-parallel.js add-window --name safe --claude-args "--permission-mode acceptEdits"
`);
}

/**
 * Parse command line arguments
 */
function parseArgs(argv) {
  const args = {};
  let command = null;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (!arg.startsWith('-') && !command) {
      command = arg;
    } else if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const nextArg = argv[i + 1];

      if (nextArg && !nextArg.startsWith('-')) {
        args[key] = nextArg;
        i++;
      } else {
        args[key] = true;
      }
    }
  }

  return { command, args };
}

/**
 * Main entry point
 */
async function main() {
  const { command, args } = parseArgs(process.argv.slice(2));

  switch (command) {
    case 'spawn':
      await spawn(args);
      break;
    case 'add-window':
    case 'add':
      await addWindow(args);
      break;
    case 'list':
      list();
      break;
    case 'kill-all':
      killAll();
      break;
    case 'help':
    case '--help':
    case '-h':
      showHelp();
      break;
    default:
      if (command) {
        console.error(c.error(`Unknown command: ${command}`));
      }
      showHelp();
      process.exit(command ? 1 : 0);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

// Export for testing
module.exports = {
  spawn,
  addWindow,
  list,
  killAll,
  buildClaudeCommand,
  spawnInTmux,
  getReadyStoriesFromEpic,
  hasTmux,
  hasScreen,
};
