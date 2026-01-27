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
    ['<subcommand>', 'Subcommand: list, new, switch, end, spawn, status, cleanup, history'],
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
    ['--limit <n>', 'Number of history entries to show (default: 20)'],
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

        case 'cleanup':
          await handleCleanup(options, handler);
          break;

        case 'history':
          await handleHistory(options);
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
  console.log('  npx agileflow session status <id>       Detailed view of a session');
  console.log('  npx agileflow session cleanup           Clean up stale sessions');
  console.log('  npx agileflow session history           View merge history\n');
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
  console.log(chalk.bold('History Options:\n'));
  console.log('  --limit <n>           Number of history entries to show (default: 20)\n');
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
  console.log('  npx agileflow session status auth --json');
  console.log('  npx agileflow session cleanup');
  console.log('  npx agileflow session cleanup --yes');
  console.log('  npx agileflow session history');
  console.log('  npx agileflow session history --limit 10');
  console.log('  npx agileflow session history --json\n');
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
 * Handle cleanup subcommand - interactive cleanup wizard
 */
async function handleCleanup(options) {
  const fs = require('fs-extra');

  displayLogo();
  displaySection('Session Cleanup Wizard');

  const spinner = ora('Scanning for issues...').start();

  // Gather all potential issues
  const issues = [];

  // 1. Get sessions and check for problems
  const { sessions } = sessionManager.getSessions();

  // 2. Check for orphaned worktrees (worktrees not in sessions registry)
  const orphanedWorktrees = await findOrphanedWorktrees(sessions);
  for (const wt of orphanedWorktrees) {
    issues.push({
      type: 'orphaned_worktree',
      severity: 'warning',
      description: `Orphaned worktree: ${wt.path}`,
      detail: `Branch: ${wt.branch}`,
      path: wt.path,
      action: 'Remove worktree',
    });
  }

  // 3. Check for sessions with missing worktrees
  for (const session of sessions) {
    if (session.is_main) continue;

    if (!fs.existsSync(session.path)) {
      issues.push({
        type: 'missing_worktree',
        severity: 'warning',
        description: `Session ${session.id} (${session.nickname || session.branch}) has missing worktree`,
        detail: `Path: ${session.path}`,
        sessionId: session.id,
        action: 'Remove session from registry',
      });
    }
  }

  // 4. Check for stale sessions (inactive for 7+ days with no uncommitted changes)
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  for (const session of sessions) {
    if (session.is_main) continue;
    if (!fs.existsSync(session.path)) continue;

    const lastActive = new Date(session.last_active || session.created).getTime();
    if (lastActive < sevenDaysAgo) {
      const gitInfo = getSessionGitInfo(session.path);
      if (!gitInfo.error && gitInfo.uncommitted === 0) {
        issues.push({
          type: 'stale_session',
          severity: 'info',
          description: `Stale session ${session.id} (${session.nickname || session.branch})`,
          detail: `Last active: ${formatDate(session.last_active)}, no uncommitted changes`,
          sessionId: session.id,
          action: 'Consider ending session',
        });
      }
    }
  }

  // 5. Check for dead tmux sessions
  const deadTmuxSessions = await findDeadTmuxSessions();
  for (const tmuxSession of deadTmuxSessions) {
    issues.push({
      type: 'dead_tmux',
      severity: 'info',
      description: `Dead tmux session: ${tmuxSession}`,
      detail: 'No windows or all windows exited',
      tmuxSession,
      action: 'Kill tmux session',
    });
  }

  spinner.succeed(`Scan complete. Found ${issues.length} issue(s).`);
  console.log();

  // Display issues
  if (issues.length === 0) {
    success('No issues found. All sessions are healthy!');
    console.log();
    return;
  }

  // Group issues by type
  const byType = {
    orphaned_worktree: issues.filter(i => i.type === 'orphaned_worktree'),
    missing_worktree: issues.filter(i => i.type === 'missing_worktree'),
    stale_session: issues.filter(i => i.type === 'stale_session'),
    dead_tmux: issues.filter(i => i.type === 'dead_tmux'),
  };

  // Display summary
  console.log(chalk.bold('Issues Found:'));
  console.log(chalk.dim('─'.repeat(50)));

  if (byType.orphaned_worktree.length > 0) {
    console.log(chalk.yellow(`  ⚠ ${byType.orphaned_worktree.length} orphaned worktree(s)`));
  }
  if (byType.missing_worktree.length > 0) {
    console.log(
      chalk.yellow(`  ⚠ ${byType.missing_worktree.length} session(s) with missing worktree`)
    );
  }
  if (byType.stale_session.length > 0) {
    console.log(
      chalk.dim(`  ○ ${byType.stale_session.length} stale session(s) (7+ days inactive)`)
    );
  }
  if (byType.dead_tmux.length > 0) {
    console.log(chalk.dim(`  ○ ${byType.dead_tmux.length} dead tmux session(s)`));
  }
  console.log();

  // If --yes, auto-clean without prompts
  if (options.yes) {
    await performCleanup(issues);
    return;
  }

  // Interactive cleanup
  const { action } = await inquirer.prompt([
    {
      type: 'list',
      name: 'action',
      message: 'What would you like to do?',
      choices: [
        { name: 'Clean all issues automatically', value: 'all' },
        { name: 'Review and select issues to clean', value: 'select' },
        { name: 'Cancel', value: 'cancel' },
      ],
    },
  ]);

  if (action === 'cancel') {
    info('Cleanup cancelled');
    return;
  }

  if (action === 'all') {
    await performCleanup(issues);
    return;
  }

  // Interactive selection
  const { selectedIssues } = await inquirer.prompt([
    {
      type: 'checkbox',
      name: 'selectedIssues',
      message: 'Select issues to clean:',
      choices: issues.map((issue, idx) => ({
        name: `${issue.description} (${issue.action})`,
        value: idx,
        checked: issue.severity === 'warning',
      })),
    },
  ]);

  if (selectedIssues.length === 0) {
    info('No issues selected');
    return;
  }

  const toClean = selectedIssues.map(idx => issues[idx]);
  await performCleanup(toClean);
}

/**
 * Perform the actual cleanup of selected issues
 */
async function performCleanup(issues) {
  const { execSync } = require('child_process');
  const fs = require('fs-extra');

  console.log();
  console.log(chalk.bold('Cleaning up...'));
  console.log(chalk.dim('─'.repeat(50)));

  let cleaned = 0;
  let failed = 0;

  for (const issue of issues) {
    const spinner = ora(issue.description).start();

    try {
      switch (issue.type) {
        case 'orphaned_worktree':
          // Remove orphaned worktree
          try {
            execSync(`git worktree remove --force "${issue.path}"`, {
              encoding: 'utf8',
              stdio: ['pipe', 'pipe', 'pipe'],
            });
          } catch {
            // If git command fails, try removing directory directly
            if (fs.existsSync(issue.path)) {
              fs.removeSync(issue.path);
            }
          }
          spinner.succeed(`Removed orphaned worktree: ${path.basename(issue.path)}`);
          cleaned++;
          break;

        case 'missing_worktree':
          // Remove session from registry
          sessionManager.deleteSession(issue.sessionId, false);
          spinner.succeed(`Removed session ${issue.sessionId} from registry`);
          cleaned++;
          break;

        case 'stale_session':
          // End stale session
          sessionManager.deleteSession(issue.sessionId, true);
          spinner.succeed(`Ended stale session ${issue.sessionId}`);
          cleaned++;
          break;

        case 'dead_tmux':
          // Kill dead tmux session
          try {
            execSync(`tmux kill-session -t "${issue.tmuxSession}"`, {
              encoding: 'utf8',
              stdio: ['pipe', 'pipe', 'pipe'],
            });
            spinner.succeed(`Killed tmux session: ${issue.tmuxSession}`);
            cleaned++;
          } catch {
            spinner.warn(`Could not kill tmux session: ${issue.tmuxSession}`);
            failed++;
          }
          break;

        default:
          spinner.skip(`Unknown issue type: ${issue.type}`);
      }
    } catch (err) {
      spinner.fail(`Failed: ${err.message}`);
      failed++;
    }
  }

  console.log();
  if (cleaned > 0) {
    success(`Cleaned ${cleaned} issue(s)`);
  }
  if (failed > 0) {
    warning(`Failed to clean ${failed} issue(s)`);
  }
  console.log();
}

/**
 * Find orphaned worktrees (not tracked in sessions registry)
 */
async function findOrphanedWorktrees(sessions) {
  const { execSync } = require('child_process');
  const orphaned = [];

  try {
    // Get all git worktrees
    const output = execSync('git worktree list --porcelain', {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const lines = output.split('\n');
    let currentWorktree = {};

    for (const line of lines) {
      if (line.startsWith('worktree ')) {
        currentWorktree.path = line.substring(9);
      } else if (line.startsWith('branch ')) {
        currentWorktree.branch = line.substring(7);
      } else if (line === '') {
        // End of worktree entry
        if (currentWorktree.path) {
          // Check if this worktree is tracked in sessions
          const isTracked = sessions.some(s => s.path === currentWorktree.path);
          if (!isTracked) {
            // Skip the main worktree
            const isMain =
              currentWorktree.branch === 'refs/heads/main' ||
              currentWorktree.branch === 'refs/heads/master';
            if (!isMain) {
              orphaned.push(currentWorktree);
            }
          }
        }
        currentWorktree = {};
      }
    }
  } catch {
    // Ignore errors
  }

  return orphaned;
}

/**
 * Find dead tmux sessions (claude-parallel-* with no active windows)
 */
async function findDeadTmuxSessions() {
  const { execSync } = require('child_process');
  const dead = [];

  if (!hasTmux()) return dead;

  try {
    const output = execSync('tmux list-sessions -F "#{session_name}:#{session_windows}"', {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const lines = output.trim().split('\n');
    for (const line of lines) {
      const [name, windows] = line.split(':');
      if (name.startsWith('claude-parallel-') && parseInt(windows, 10) === 0) {
        dead.push(name);
      }
    }
  } catch {
    // Ignore errors (e.g., no tmux server running)
  }

  return dead;
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
 * Handle history subcommand - display merge history
 */
async function handleHistory(options) {
  const limit = parseInt(options.limit) || 20;

  // Get merge history from session manager
  const historyResult = sessionManager.getMergeHistory();

  if (!historyResult.success) {
    if (options.json) {
      console.log(JSON.stringify({ success: false, error: historyResult.error }));
      return;
    }
    error(`Failed to read history: ${historyResult.error}`);
    return;
  }

  const merges = historyResult.merges || [];

  // JSON output mode
  if (options.json) {
    console.log(
      JSON.stringify(
        {
          success: true,
          total: merges.length,
          showing: Math.min(limit, merges.length),
          merges: merges.slice(0, limit),
        },
        null,
        2
      )
    );
    return;
  }

  // Standard display
  displayLogo();
  displaySection('Session History', `${merges.length} merge(s) recorded`);

  if (merges.length === 0) {
    info('No merge history recorded yet.');
    console.log();
    info('Merge history is created when sessions are integrated into main.');
    console.log(chalk.dim('  Use: npx agileflow session end <id> --merge'));
    return;
  }

  // Display merges (most recent first)
  const toShow = merges.slice(-limit).reverse();

  console.log();
  for (const merge of toShow) {
    const timestamp = merge.timestamp ? formatDate(merge.timestamp) : 'unknown';
    const strategy = merge.strategy || 'unknown';
    const commits = merge.commitsCount || merge.commits?.length || 0;

    // Session info line
    console.log(
      chalk.bold(`Session ${merge.sessionId || 'unknown'}`) +
        chalk.dim(` (${merge.nickname || 'no nickname'})`)
    );

    // Branch info
    console.log(
      chalk.dim('  Branch: ') +
        chalk.cyan(merge.branch || 'unknown') +
        chalk.dim(' → ') +
        chalk.green(merge.targetBranch || 'main')
    );

    // Merge details
    console.log(
      chalk.dim('  Strategy: ') +
        chalk.yellow(strategy) +
        chalk.dim(' | Commits: ') +
        chalk.white(commits) +
        chalk.dim(' | ') +
        timestamp
    );

    // Result status
    if (merge.success === false) {
      console.log(chalk.red('  ✗ Failed: ') + chalk.dim(merge.error || 'Unknown error'));
    } else {
      console.log(chalk.green('  ✓ Merged successfully'));
    }

    console.log();
  }

  if (merges.length > limit) {
    info(`Showing ${limit} of ${merges.length} merges. Use --limit to see more.`);
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
