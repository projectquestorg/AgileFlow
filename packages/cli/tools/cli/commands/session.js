/**
 * AgileFlow CLI - Session Command
 *
 * Manage parallel Claude Code sessions via CLI.
 * Provides shell-accessible session management without requiring Claude Code.
 */

const chalk = require('chalk');
const path = require('node:path');
const inquirer = require('inquirer');
const ora = require('ora');
const { displayLogo, displaySection, success, warning, error, info } = require('../lib/ui');
const { ErrorHandler } = require('../lib/error-handler');

// Session manager provides all session operations
const sessionManager = require('../../../scripts/session-manager');
const { hasTmux, spawnInTmux, buildClaudeCommand } = require('../../../scripts/spawn-parallel');

module.exports = {
  name: 'session',
  description: 'Manage parallel Claude Code sessions',
  arguments: [
    ['<subcommand>', 'Subcommand: list, new, switch, end, spawn, status'],
    ['[idOrNickname]', 'Session ID or nickname (for switch/end/status)'],
  ],
  options: [
    ['-d, --directory <path>', 'Project directory (default: current directory)'],
    ['-y, --yes', 'Skip prompts, use defaults'],
    ['--json', 'Output as JSON'],
    ['--branch <name>', 'Branch name for new session'],
    ['--nickname <name>', 'Nickname for new session'],
    ['--merge', 'Merge session before ending'],
    ['--strategy <type>', 'Merge strategy: squash|merge (default: squash)'],
    ['--echo-cd', 'Output only the path (for cd $(agileflow session switch <id> --echo-cd))'],
    ['--kanban', 'Show Kanban-style board view (for list)'],
    ['--count <n>', 'Number of sessions to spawn (for spawn)'],
    ['--branches <list>', 'Comma-separated branch names (for spawn)'],
    ['--from-epic <id>', 'Create sessions from ready stories in epic (for spawn)'],
    ['--no-tmux', 'Output commands without spawning in tmux (for spawn)'],
    ['--no-claude', 'Create worktrees but do not start Claude (for spawn)'],
    ['--dangerous', 'Use --dangerously-skip-permissions for Claude (for spawn)'],
    ['--prompt <text>', 'Initial prompt to send to each Claude instance (for spawn)'],
  ],
  action: async (subcommand, idOrNickname, options) => {
    const handler = new ErrorHandler('session');

    try {
      switch (subcommand) {
        case 'list':
          await handleList(options);
          break;

        case 'new':
          await handleNew(options);
          break;

        case 'switch':
          await handleSwitch(idOrNickname, options, handler);
          break;

        case 'end':
          await handleEnd(idOrNickname, options, handler);
          break;

        case 'spawn':
          await handleSpawn(options, handler);
          break;

        case 'status':
          await handleStatus(idOrNickname, options, handler);
          break;

        default:
          displayLogo();
          showHelp();
          process.exit(0);
      }

      process.exit(0);
    } catch (err) {
      handler.critical(
        'Session operation failed',
        'Check session manager functionality',
        'npx agileflow doctor',
        err
      );
    }
  },
};

/**
 * Show help for session subcommands
 */
function showHelp() {
  console.log(chalk.bold('Usage:\n'));
  console.log('  npx agileflow session list              List all sessions');
  console.log('  npx agileflow session new               Create a new session (interactive)');
  console.log('  npx agileflow session switch <id>       Switch active session context');
  console.log('  npx agileflow session end <id>          End session (optional merge)');
  console.log('  npx agileflow session spawn             Spawn multiple parallel sessions');
  console.log('  npx agileflow session status <id>       Detailed view of a session\n');
  console.log(chalk.bold('Options:\n'));
  console.log('  --json                Output as JSON');
  console.log('  --kanban              Show Kanban-style board view (for list)');
  console.log('  --yes, -y             Skip prompts, use defaults');
  console.log('  --branch <name>       Branch name for new session');
  console.log('  --nickname <name>     Nickname for new session');
  console.log('  --merge               Merge session before ending');
  console.log('  --strategy <type>     Merge strategy: squash|merge');
  console.log('  --echo-cd             Output only path (for shell substitution)\n');
  console.log(chalk.bold('Spawn Options:\n'));
  console.log('  --count <n>           Number of sessions to spawn');
  console.log('  --branches <list>     Comma-separated branch names');
  console.log('  --from-epic <id>      Create sessions from ready stories in epic');
  console.log('  --no-tmux             Output commands without spawning in tmux');
  console.log('  --no-claude           Create worktrees but do not start Claude');
  console.log('  --dangerous           Use --dangerously-skip-permissions');
  console.log('  --prompt <text>       Initial prompt for each Claude instance\n');
  console.log(chalk.bold('Examples:\n'));
  console.log('  npx agileflow session list');
  console.log('  npx agileflow session list --json');
  console.log('  npx agileflow session list --kanban');
  console.log('  npx agileflow session new');
  console.log('  npx agileflow session new --branch feat-auth --nickname auth --yes');
  console.log('  npx agileflow session switch 2');
  console.log('  cd $(npx agileflow session switch 2 --echo-cd)');
  console.log('  npx agileflow session end 2');
  console.log('  npx agileflow session end 2 --merge --strategy squash');
  console.log('  npx agileflow session spawn --count 4');
  console.log('  npx agileflow session spawn --branches auth,dashboard,api');
  console.log('  npx agileflow session spawn --from-epic EP-0001');
  console.log('  npx agileflow session spawn --count 2 --no-tmux');
  console.log('  npx agileflow session status 2');
  console.log('  npx agileflow session status auth --json\n');
}

/**
 * Handle list subcommand - display all sessions
 */
async function handleList(options) {
  const { sessions, cleaned, cleanedSessions } = sessionManager.getSessions();

  // JSON output mode
  if (options.json) {
    console.log(
      JSON.stringify(
        {
          sessions,
          cleaned,
          cleanedSessions: cleanedSessions || [],
        },
        null,
        2
      )
    );
    return;
  }

  // Kanban view mode
  if (options.kanban) {
    displayLogo();
    console.log(sessionManager.renderKanbanBoard(sessions));
    if (cleaned > 0) {
      console.log(chalk.dim(`\nCleaned ${cleaned} stale lock(s)`));
    }
    return;
  }

  // Standard table view
  displayLogo();
  displaySection('Sessions', `${sessions.length} session(s) registered`);

  if (sessions.length === 0) {
    info('No sessions registered.');
    console.log();
    info('Create a new session with:');
    console.log(chalk.cyan('  npx agileflow session new'));
    return;
  }

  // Display table header
  const cols = {
    id: 4,
    status: 8,
    nickname: 20,
    branch: 25,
    path: 40,
  };

  console.log(
    chalk.bold(
      `${'ID'.padEnd(cols.id)} ${'Status'.padEnd(cols.status)} ${'Nickname'.padEnd(cols.nickname)} ${'Branch'.padEnd(cols.branch)} Path`
    )
  );
  console.log(chalk.dim('─'.repeat(100)));

  for (const session of sessions) {
    const statusIcon = session.active ? chalk.green('● active') : chalk.dim('○ idle');
    const currentTag = session.current ? chalk.yellow(' (current)') : '';
    const nickname = session.nickname || chalk.dim('-');
    const mainTag = session.is_main ? chalk.blue(' [main]') : '';

    console.log(
      `${chalk.cyan(session.id.padEnd(cols.id))} ${statusIcon.padEnd(cols.status + 10)} ${(nickname + mainTag + currentTag).padEnd(cols.nickname + 20)} ${chalk.dim(session.branch.padEnd(cols.branch))} ${chalk.dim(truncatePath(session.path, cols.path))}`
    );
  }

  console.log(chalk.dim('─'.repeat(100)));

  // Summary
  const activeCount = sessions.filter(s => s.active).length;
  const parallelCount = sessions.filter(s => !s.is_main).length;

  console.log();
  console.log(
    chalk.dim(`Active: ${activeCount} │ Parallel: ${parallelCount} │ Total: ${sessions.length}`)
  );

  if (cleaned > 0) {
    console.log(chalk.dim(`Cleaned ${cleaned} stale lock(s)`));
  }

  console.log();
}

/**
 * Handle new subcommand - create a new session
 */
async function handleNew(options) {
  displayLogo();

  // Check tmux availability early
  const inTmux = hasTmux() && process.env.TMUX;

  let branchName = options.branch;
  let nickname = options.nickname;

  // Interactive mode
  if (!options.yes) {
    displaySection('Create New Session');

    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'branch',
        message: 'Branch name:',
        default: options.branch || `session-${Date.now()}`,
        validate: input => {
          if (!/^[a-zA-Z0-9._/-]+$/.test(input)) {
            return 'Branch name can only contain letters, numbers, dots, underscores, hyphens, and forward slashes';
          }
          return true;
        },
      },
      {
        type: 'input',
        name: 'nickname',
        message: 'Nickname (optional, for easy reference):',
        default: options.nickname || '',
        validate: input => {
          if (input && !/^[a-zA-Z0-9_-]+$/.test(input)) {
            return 'Nickname can only contain letters, numbers, underscores, and hyphens';
          }
          return true;
        },
      },
    ]);

    branchName = answers.branch;
    nickname = answers.nickname || null;
  } else {
    // Non-interactive - use defaults if not provided
    branchName = branchName || `session-${Date.now()}`;
  }

  // Create the session
  const spinner = ora('Creating session...').start();

  try {
    const result = await sessionManager.createSession({
      branch: branchName,
      nickname: nickname || undefined,
    });

    if (!result.success) {
      spinner.fail('Failed to create session');
      error(result.error);
      process.exit(1);
    }

    spinner.succeed('Session created');

    // Display result
    console.log();
    success(`Session ${chalk.cyan(result.sessionId)} created successfully`);
    console.log();
    console.log(chalk.bold('Session Details:'));
    console.log(`  ${chalk.dim('ID:')}       ${chalk.cyan(result.sessionId)}`);
    console.log(`  ${chalk.dim('Branch:')}   ${result.branch}`);
    if (nickname) {
      console.log(`  ${chalk.dim('Nickname:')} ${nickname}`);
    }
    console.log(`  ${chalk.dim('Path:')}     ${result.path}`);

    // Show what was copied
    const copied = [...(result.envFilesCopied || []), ...(result.foldersCopied || [])];
    const symlinked = result.foldersSymlinked || [];
    if (copied.length > 0 || symlinked.length > 0) {
      console.log();
      if (copied.length > 0) {
        console.log(chalk.dim(`  Copied: ${copied.join(', ')}`));
      }
      if (symlinked.length > 0) {
        console.log(chalk.dim(`  Symlinked: ${symlinked.join(', ')}`));
      }
    }

    // Navigation instructions
    console.log();
    console.log(chalk.bold('Next Steps:'));
    if (inTmux) {
      info('You are in tmux. You can switch windows using Alt+<number>');
    }
    console.log(`  ${chalk.cyan(`cd "${result.path}"`)}  ${chalk.dim('- Navigate to session')}`);
    console.log(`  ${chalk.cyan('claude')}  ${chalk.dim('- Start Claude Code in session')}`);
    console.log();
    console.log(chalk.dim('Or use the full command:'));
    console.log(`  ${chalk.cyan(result.command)}`);
    console.log();
  } catch (err) {
    spinner.fail('Session creation failed');
    throw err;
  }
}

/**
 * Handle switch subcommand - switch active session context
 */
async function handleSwitch(idOrNickname, options, handler) {
  if (!idOrNickname) {
    handler.warning(
      'Session ID or nickname required',
      'Provide a session identifier',
      'npx agileflow session switch <id>'
    );
  }

  const result = sessionManager.switchSession(idOrNickname);

  if (!result.success) {
    if (options.echoCd) {
      // Silent failure for shell substitution - output nothing
      process.exit(1);
    }
    handler.warning(result.error, 'Check session ID or nickname', 'npx agileflow session list');
  }

  // Echo-cd mode: just output the path for shell substitution
  if (options.echoCd) {
    console.log(result.path);
    return;
  }

  // Normal mode: show full output
  displayLogo();
  displaySection('Session Switched');

  success(`Switched to session ${chalk.cyan(result.session.id)}`);
  console.log();
  console.log(chalk.bold('Session Details:'));
  console.log(`  ${chalk.dim('ID:')}       ${chalk.cyan(result.session.id)}`);
  if (result.session.nickname) {
    console.log(`  ${chalk.dim('Nickname:')} ${result.session.nickname}`);
  }
  console.log(`  ${chalk.dim('Branch:')}   ${result.session.branch}`);
  console.log(`  ${chalk.dim('Path:')}     ${result.session.path}`);
  console.log();

  info('The session context has been updated in session-state.json');
  console.log();
  console.log(chalk.bold('To change directories:'));
  console.log(`  ${chalk.cyan(`cd "${result.path}"`)}`);
  console.log();
  console.log(chalk.dim('Tip: Use shell substitution to switch and cd in one command:'));
  console.log(chalk.dim(`  cd $(npx agileflow session switch ${idOrNickname} --echo-cd)`));
  console.log();
}

/**
 * Handle end subcommand - end a session (optionally merge)
 */
async function handleEnd(idOrNickname, options, handler) {
  if (!idOrNickname) {
    handler.warning(
      'Session ID or nickname required',
      'Provide a session identifier',
      'npx agileflow session end <id>'
    );
  }

  // Get session first to show details
  const session = sessionManager.getSession(idOrNickname);

  if (!session) {
    handler.warning(
      `Session "${idOrNickname}" not found`,
      'Check the session ID or nickname',
      'npx agileflow session list'
    );
  }

  if (session.is_main) {
    handler.warning(
      'Cannot end main session',
      'Only parallel sessions can be ended',
      'npx agileflow session list'
    );
  }

  displayLogo();
  displaySection('End Session');

  console.log(chalk.bold('Session to end:'));
  console.log(`  ${chalk.dim('ID:')}       ${chalk.cyan(session.id)}`);
  if (session.nickname) {
    console.log(`  ${chalk.dim('Nickname:')} ${session.nickname}`);
  }
  console.log(`  ${chalk.dim('Branch:')}   ${session.branch}`);
  console.log(`  ${chalk.dim('Path:')}     ${session.path}`);
  console.log();

  // If merge is requested
  if (options.merge) {
    const spinner = ora('Checking merge status...').start();

    const mergeCheck = sessionManager.checkMergeability(idOrNickname);

    if (!mergeCheck.success) {
      spinner.fail('Merge check failed');
      error(mergeCheck.error);
      process.exit(1);
    }

    if (!mergeCheck.mergeable) {
      spinner.warn('Session is not mergeable');
      console.log();
      warning(`Cannot merge: ${mergeCheck.reason}`);

      if (mergeCheck.reason === 'uncommitted_changes') {
        console.log();
        info('The session has uncommitted changes:');
        console.log(chalk.dim(mergeCheck.details));
        console.log();
        info('Commit or discard changes before merging');
      } else if (mergeCheck.reason === 'no_changes') {
        console.log();
        info('The branch has no commits ahead of main');
      }
      process.exit(1);
    }

    spinner.succeed('Session is mergeable');

    // Show merge preview
    const preview = sessionManager.getMergePreview(idOrNickname);
    if (preview.success && preview.commitCount > 0) {
      console.log();
      console.log(chalk.bold('Commits to merge:'));
      for (const commit of preview.commits.slice(0, 5)) {
        console.log(`  ${chalk.dim('•')} ${commit}`);
      }
      if (preview.commits.length > 5) {
        console.log(chalk.dim(`  ... and ${preview.commits.length - 5} more`));
      }
      console.log();
      console.log(chalk.bold('Files changed:'), preview.fileCount);
    }

    // Confirm if not using --yes
    if (!options.yes) {
      console.log();
      const { confirmed } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'confirmed',
          message: `Merge and end session ${session.id}?`,
          default: true,
        },
      ]);

      if (!confirmed) {
        info('Operation cancelled');
        process.exit(0);
      }
    }

    // Perform merge
    const strategy = options.strategy || 'squash';
    const mergeSpinner = ora(`Merging session (${strategy})...`).start();

    const mergeResult = sessionManager.integrateSession(idOrNickname, {
      strategy,
      deleteBranch: true,
      deleteWorktree: true,
    });

    if (!mergeResult.success) {
      mergeSpinner.fail('Merge failed');
      error(mergeResult.error);
      if (mergeResult.hasConflicts) {
        console.log();
        info('The merge has conflicts that need manual resolution');
        info('Try using /agileflow:session:end in Claude Code for guided resolution');
      }
      process.exit(1);
    }

    mergeSpinner.succeed('Session merged and cleaned up');

    console.log();
    success(`Session ${chalk.cyan(session.id)} has been merged to ${mergeResult.mainBranch}`);
    if (mergeResult.branchDeleted) {
      info(`Branch ${session.branch} deleted`);
    }
    if (mergeResult.worktreeDeleted) {
      info('Worktree removed');
    }
    console.log();
    info(`Changes are now on ${chalk.cyan(mergeResult.mainBranch)} in:`);
    console.log(`  ${chalk.cyan(mergeResult.mainPath)}`);
    console.log();
  } else {
    // End without merge - just delete
    if (!options.yes) {
      console.log();
      warning('This will delete the session WITHOUT merging changes');
      const { confirmed } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'confirmed',
          message: `End session ${session.id} without merging?`,
          default: false,
        },
      ]);

      if (!confirmed) {
        info('Operation cancelled');
        info('Use --merge to merge changes before ending');
        process.exit(0);
      }
    }

    const spinner = ora('Ending session...').start();

    const deleteResult = sessionManager.deleteSession(idOrNickname, true);

    if (!deleteResult.success) {
      spinner.fail('Failed to end session');
      error(deleteResult.error);
      process.exit(1);
    }

    spinner.succeed('Session ended');

    console.log();
    success(`Session ${chalk.cyan(session.id)} has been removed`);
    info('Worktree and session registry entry deleted');
    console.log();
    warning('Any uncommitted changes have been discarded');
    console.log();
  }
}

/**
 * Handle spawn subcommand - spawn multiple parallel sessions
 */
async function handleSpawn(options, handler) {
  const count = options.count ? parseInt(options.count, 10) : null;
  const branches = options.branches ? options.branches.split(',').map(b => b.trim()) : null;
  const fromEpic = options.fromEpic;
  // Commander.js converts --no-X to options.X = false
  const noTmux = options.tmux === false;
  const noClaude = options.claude === false;
  const dangerous = options.dangerous;
  const prompt = options.prompt;

  // Validate: need at least one of count, branches, or fromEpic
  if (!count && !branches && !fromEpic) {
    handler.warning(
      'Must specify --count, --branches, or --from-epic',
      'Provide number of sessions or branch names',
      'npx agileflow session spawn --count 4'
    );
  }

  displayLogo();
  displaySection('Spawn Parallel Sessions');

  // Build the list of sessions to create
  const sessionsToCreate = [];

  if (fromEpic) {
    // Get ready stories from epic via status.json
    const statusPath = sessionManager.getStatusPath
      ? sessionManager.getStatusPath()
      : 'docs/09-agents/status.json';
    let status;
    try {
      const fs = require('fs-extra');
      if (fs.existsSync(statusPath)) {
        status = fs.readJsonSync(statusPath);
      } else {
        handler.warning(
          `Status file not found: ${statusPath}`,
          'Ensure AgileFlow is installed in this project',
          'npx agileflow setup'
        );
      }
    } catch {
      handler.warning(
        'Could not read status.json',
        'Check file permissions',
        `ls -la ${statusPath}`
      );
    }

    const epic = status?.epics?.[fromEpic];
    if (!epic) {
      handler.warning(`Epic ${fromEpic} not found`, 'Check epic ID', 'npx agileflow session list');
    }

    const storyIds = epic.stories || [];
    const readyStories = storyIds
      .map(id => status?.stories?.[id])
      .filter(s => s && s.status === 'ready');

    if (readyStories.length === 0) {
      info(`No ready stories found in epic ${fromEpic}`);
      console.log();
      info('Stories must have status: ready to be spawned');
      process.exit(0);
    }

    console.log(chalk.bold(`Epic: ${epic.title || fromEpic}`));
    console.log(`Found ${chalk.cyan(readyStories.length)} ready stories\n`);

    for (const story of readyStories) {
      sessionsToCreate.push({
        nickname: story.id?.toLowerCase() || `story-${Date.now()}`,
        branch: `feature/${story.id?.toLowerCase() || `story-${Date.now()}`}`,
        story: story.id,
      });
    }
  } else if (branches) {
    for (const branch of branches) {
      sessionsToCreate.push({
        nickname: branch,
        branch: `feature/${branch}`,
      });
    }
  } else if (count) {
    for (let i = 1; i <= count; i++) {
      sessionsToCreate.push({
        nickname: `parallel-${i}`,
        branch: `parallel-${i}`,
      });
    }
  }

  console.log(chalk.bold(`Creating ${sessionsToCreate.length} parallel session(s)...\n`));

  // Create the sessions
  const createdSessions = [];
  for (const sessionSpec of sessionsToCreate) {
    const spinner = ora(`Creating ${sessionSpec.nickname}...`).start();

    try {
      const result = await sessionManager.createSession({
        nickname: sessionSpec.nickname,
        branch: sessionSpec.branch,
      });

      if (!result.success) {
        spinner.fail(`Failed: ${sessionSpec.nickname}`);
        error(`  ${result.error}`);
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

      const copied = [...(result.envFilesCopied || []), ...(result.foldersCopied || [])];
      const copyInfo = copied.length ? chalk.dim(` (copied: ${copied.join(', ')})`) : '';
      spinner.succeed(
        `Session ${chalk.cyan(result.sessionId)}: ${sessionSpec.nickname}${copyInfo}`
      );
    } catch (err) {
      spinner.fail(`Error: ${sessionSpec.nickname}`);
      error(`  ${err.message}`);
    }
  }

  if (createdSessions.length === 0) {
    console.log();
    error('No sessions were created');
    process.exit(1);
  }

  console.log();

  // Spawn in tmux or output commands
  if (noTmux) {
    outputSpawnCommands(createdSessions, { dangerous, prompt, noClaude });
  } else if (hasTmux()) {
    const tmuxResult = spawnInTmux(createdSessions, {
      dangerous,
      prompt,
      noClaude,
    });

    if (tmuxResult.success) {
      success(`Tmux session created: ${chalk.cyan(tmuxResult.sessionName)}`);
      console.log(`${tmuxResult.windowCount} windows ready\n`);

      console.log(chalk.bold('Controls:'));
      console.log(
        `  ${chalk.cyan(`tmux attach -t ${tmuxResult.sessionName}`)}  ${chalk.dim('- Attach to session')}`
      );
      console.log(`  ${chalk.dim('Alt+1/2/3')}  ${chalk.dim('- Switch to window 1, 2, 3')}`);
      console.log(`  ${chalk.dim('q')}          ${chalk.dim('- Detach (sessions keep running)')}`);
      console.log();
    } else {
      warning('Failed to create tmux session');
      outputSpawnCommands(createdSessions, { dangerous, prompt, noClaude });
    }
  } else {
    console.log();
    warning('tmux is not installed');
    console.log();
    console.log(chalk.bold('Install tmux:'));
    console.log(`  ${chalk.cyan('macOS:')}        brew install tmux`);
    console.log(`  ${chalk.cyan('Ubuntu/Debian:')} sudo apt install tmux`);
    console.log(`  ${chalk.cyan('Fedora/RHEL:')}  sudo dnf install tmux`);
    console.log();
    outputSpawnCommands(createdSessions, { dangerous, prompt, noClaude });
  }

  // Summary table
  console.log(chalk.bold('Session Summary:'));
  console.log(chalk.dim('─'.repeat(60)));
  for (const session of createdSessions) {
    console.log(
      `  ${chalk.cyan(session.sessionId.padEnd(4))} │ ${session.nickname.padEnd(20)} │ ${chalk.dim(session.branch)}`
    );
  }
  console.log(chalk.dim('─'.repeat(60)));
  console.log();
  info('Use: npx agileflow session list       to view all sessions');
  info('Use: npx agileflow session end <id>   to end a session');
  console.log();
}

/**
 * Output spawn commands for manual execution (no tmux)
 */
function outputSpawnCommands(sessions, options = {}) {
  console.log(chalk.bold('Commands to run manually:\n'));

  for (const session of sessions) {
    const cmd = buildClaudeCommand(session.path, options);
    console.log(chalk.dim(`# Session ${session.sessionId} (${session.nickname})`));
    console.log(`  ${chalk.cyan(cmd)}`);
    console.log();
  }

  console.log(chalk.dim('Copy these commands to separate terminals to run in parallel.\n'));
}

/**
 * Handle status subcommand - detailed view of a single session
 */
async function handleStatus(idOrNickname, options, handler) {
  if (!idOrNickname) {
    handler.warning(
      'Session ID or nickname required',
      'Provide a session identifier',
      'npx agileflow session status <id>'
    );
  }

  const session = sessionManager.getSession(idOrNickname);

  if (!session) {
    handler.warning(
      `Session "${idOrNickname}" not found`,
      'Check the session ID or nickname',
      'npx agileflow session list'
    );
  }

  // Gather git information from the session's worktree
  const gitInfo = getSessionGitInfo(session.path);

  // Build status data object
  const statusData = {
    id: session.id,
    nickname: session.nickname || null,
    branch: session.branch,
    path: session.path,
    created: session.created,
    lastActive: session.last_active,
    isMain: session.is_main,
    active: session.active,
    current: session.current,
    git: gitInfo,
  };

  // JSON output
  if (options.json) {
    console.log(JSON.stringify(statusData, null, 2));
    return;
  }

  // Rich display
  displayLogo();
  displaySection('Session Status', `Session ${session.id}`);

  // Basic info
  console.log(chalk.bold('Session Information'));
  console.log(chalk.dim('─'.repeat(50)));
  console.log(`  ${chalk.dim('ID:')}          ${chalk.cyan(session.id)}`);
  if (session.nickname) {
    console.log(`  ${chalk.dim('Nickname:')}    ${session.nickname}`);
  }
  console.log(`  ${chalk.dim('Branch:')}      ${session.branch}`);
  console.log(`  ${chalk.dim('Path:')}        ${session.path}`);
  console.log(`  ${chalk.dim('Created:')}     ${formatDate(session.created)}`);
  console.log(`  ${chalk.dim('Last Active:')} ${formatDate(session.last_active)}`);

  // Status badges
  const badges = [];
  if (session.is_main) badges.push(chalk.blue('[main]'));
  if (session.current) badges.push(chalk.yellow('[current]'));
  if (session.active) badges.push(chalk.green('[active]'));
  if (badges.length > 0) {
    console.log(`  ${chalk.dim('Status:')}      ${badges.join(' ')}`);
  }
  console.log();

  // Git status
  console.log(chalk.bold('Git Status'));
  console.log(chalk.dim('─'.repeat(50)));

  if (gitInfo.error) {
    warning(`Could not get git info: ${gitInfo.error}`);
  } else {
    // Branch and tracking
    console.log(`  ${chalk.dim('Branch:')}      ${gitInfo.branch}`);
    if (gitInfo.upstream) {
      console.log(`  ${chalk.dim('Tracking:')}    ${gitInfo.upstream}`);
    }

    // Ahead/behind
    if (gitInfo.ahead > 0 || gitInfo.behind > 0) {
      const aheadBehind = [];
      if (gitInfo.ahead > 0) {
        aheadBehind.push(chalk.green(`↑${gitInfo.ahead} ahead`));
      }
      if (gitInfo.behind > 0) {
        aheadBehind.push(chalk.yellow(`↓${gitInfo.behind} behind`));
      }
      console.log(`  ${chalk.dim('Sync:')}        ${aheadBehind.join(', ')}`);
    } else if (gitInfo.upstream) {
      console.log(`  ${chalk.dim('Sync:')}        ${chalk.green('✓ up to date')}`);
    }

    // Uncommitted changes
    if (gitInfo.uncommitted > 0) {
      console.log(
        `  ${chalk.dim('Changes:')}     ${chalk.yellow(`${gitInfo.uncommitted} uncommitted file(s)`)}`
      );
      // Show first few changed files
      if (gitInfo.changedFiles && gitInfo.changedFiles.length > 0) {
        const filesToShow = gitInfo.changedFiles.slice(0, 5);
        for (const file of filesToShow) {
          console.log(`                ${chalk.dim(file)}`);
        }
        if (gitInfo.changedFiles.length > 5) {
          console.log(chalk.dim(`                ... and ${gitInfo.changedFiles.length - 5} more`));
        }
      }
    } else {
      console.log(`  ${chalk.dim('Changes:')}     ${chalk.green('✓ clean working tree')}`);
    }

    // Recent commits
    if (gitInfo.recentCommits && gitInfo.recentCommits.length > 0) {
      console.log();
      console.log(chalk.bold('Recent Commits'));
      console.log(chalk.dim('─'.repeat(50)));
      for (const commit of gitInfo.recentCommits.slice(0, 5)) {
        console.log(`  ${chalk.dim('•')} ${commit}`);
      }
    }
  }

  console.log();

  // Navigation help
  console.log(chalk.bold('Actions'));
  console.log(chalk.dim('─'.repeat(50)));
  console.log(`  ${chalk.cyan(`cd "${session.path}"`)}  ${chalk.dim('- Navigate to session')}`);
  if (!session.is_main) {
    console.log(
      `  ${chalk.cyan(`npx agileflow session end ${session.id}`)}  ${chalk.dim('- End session')}`
    );
    console.log(
      `  ${chalk.cyan(`npx agileflow session end ${session.id} --merge`)}  ${chalk.dim('- Merge and end')}`
    );
  }
  console.log();
}

/**
 * Get git information for a session path
 */
function getSessionGitInfo(sessionPath) {
  const { execSync } = require('child_process');
  const fs = require('fs-extra');

  if (!fs.existsSync(sessionPath)) {
    return { error: 'Path does not exist' };
  }

  const execOpts = { cwd: sessionPath, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] };

  try {
    // Get current branch
    let branch = '';
    try {
      branch = execSync('git rev-parse --abbrev-ref HEAD', execOpts).trim();
    } catch {
      return { error: 'Not a git repository' };
    }

    // Get upstream tracking branch
    let upstream = '';
    try {
      upstream = execSync(`git rev-parse --abbrev-ref ${branch}@{upstream}`, execOpts).trim();
    } catch {
      // No upstream configured
    }

    // Get ahead/behind counts
    let ahead = 0;
    let behind = 0;
    if (upstream) {
      try {
        const counts = execSync(
          `git rev-list --left-right --count ${branch}...${upstream}`,
          execOpts
        )
          .trim()
          .split('\t');
        ahead = parseInt(counts[0], 10) || 0;
        behind = parseInt(counts[1], 10) || 0;
      } catch {
        // Ignore errors
      }
    }

    // Get uncommitted changes count
    let uncommitted = 0;
    let changedFiles = [];
    try {
      const status = execSync('git status --porcelain', execOpts);
      // Split by newline, preserving line format (don't trim whole output)
      // Git porcelain format: XY filename (where XY is 2 chars + space = 3 chars prefix)
      const lines = status.split('\n').filter(line => line.length >= 3);
      if (lines.length > 0) {
        changedFiles = lines.map(line => line.slice(3));
        uncommitted = changedFiles.length;
      }
    } catch {
      // Ignore errors
    }

    // Get recent commits
    let recentCommits = [];
    try {
      const log = execSync('git log --oneline -5', execOpts).trim();
      if (log) {
        recentCommits = log.split('\n');
      }
    } catch {
      // Ignore errors
    }

    return {
      branch,
      upstream,
      ahead,
      behind,
      uncommitted,
      changedFiles,
      recentCommits,
    };
  } catch (err) {
    return { error: err.message };
  }
}

/**
 * Format a date for display
 */
function formatDate(dateStr) {
  if (!dateStr) return chalk.dim('unknown');
  try {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;

    return date.toLocaleDateString();
  } catch {
    return chalk.dim(dateStr);
  }
}

/**
 * Truncate a path for display
 */
function truncatePath(filePath, maxLen) {
  if (filePath.length <= maxLen) {
    return filePath;
  }
  const parts = filePath.split(path.sep);
  let result = parts.pop();

  while (parts.length > 0 && result.length < maxLen - 4) {
    const next = parts.pop();
    if ((next + path.sep + result).length < maxLen - 4) {
      result = next + path.sep + result;
    } else {
      break;
    }
  }

  return '...' + path.sep + result;
}
