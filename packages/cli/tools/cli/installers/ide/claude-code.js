/**
 * AgileFlow CLI - Claude Code IDE Installer
 *
 * Installs AgileFlow commands for Claude Code IDE.
 */

const path = require('node:path');
const fs = require('fs-extra');
const chalk = require('chalk');
const { BaseIdeSetup } = require('./_base-ide');

/**
 * Claude Code IDE setup handler
 */
class ClaudeCodeSetup extends BaseIdeSetup {
  constructor() {
    super('claude-code', 'Claude Code', true);
    this.configDir = '.claude';
    this.commandsDir = 'commands';
  }

  /**
   * Setup Claude Code IDE configuration
   * @param {string} projectDir - Project directory
   * @param {string} agileflowDir - AgileFlow installation directory
   * @param {Object} options - Setup options
   */
  async setup(projectDir, agileflowDir, options = {}) {
    // Use standard setup for commands and agents
    const result = await this.setupStandard(projectDir, agileflowDir, {
      targetSubdir: this.commandsDir,
      agileflowFolder: 'agileflow',
    });

    const { ideDir, agileflowTargetDir } = result;
    const agentsSource = path.join(agileflowDir, 'agents');

    // Claude Code specific: Check for duplicates in user-level ~/.claude/commands/
    // Commands in both ~/.claude/commands/ and .claude/commands/agileflow/ cause
    // "command 2" entries in autocomplete
    await this.removeUserLevelDuplicates(agileflowDir);

    // Claude Code specific: Install agents as spawnable subagents (.claude/agents/agileflow/)
    // This allows Task tool to spawn them with subagent_type: "agileflow-ui"
    const spawnableAgentsDir = path.join(ideDir, 'agents', 'agileflow');

    // Clean existing spawnable agents directory to prevent duplicates during update
    if (await fs.pathExists(spawnableAgentsDir)) {
      await fs.remove(spawnableAgentsDir);
    }

    await this.installCommandsRecursive(agentsSource, spawnableAgentsDir, agileflowDir, false);
    console.log(chalk.dim(`    - Spawnable agents: .claude/agents/agileflow/`));

    // Claude Code specific: Create skills directory for user-generated skills
    // AgileFlow no longer ships static skills - users generate them via /agileflow:skill:create
    const skillsTargetDir = path.join(ideDir, 'skills');
    await this.ensureDir(skillsTargetDir);
    console.log(chalk.dim(`    - Skills directory: .claude/skills/ (for user-generated skills)`));

    // Claude Code specific: Setup damage control hooks
    await this.setupDamageControl(projectDir, agileflowDir, ideDir, options);

    // Claude Code specific: Setup SessionStart hooks (welcome, archive, context-loader, tmux-task-watcher)
    await this.setupSessionStartHooks(projectDir, agileflowDir, ideDir, options);

    // Claude Code specific: Setup Stop hooks (tmux-task-watcher cleanup)
    await this.setupStopHooks(projectDir, agileflowDir, ideDir, options);

    return result;
  }

  /**
   * Setup damage control hooks
   * @param {string} projectDir - Project directory
   * @param {string} agileflowDir - AgileFlow installation directory
   * @param {string} claudeDir - .claude directory path
   * @param {Object} options - Setup options
   */
  async setupDamageControl(projectDir, agileflowDir, claudeDir, options = {}) {
    const damageControlSource = path.join(agileflowDir, 'scripts', 'damage-control');
    const damageControlTarget = path.join(claudeDir, 'hooks', 'damage-control');

    // Check if source exists
    if (!fs.existsSync(damageControlSource)) {
      console.log(chalk.dim(`    - Damage control: source not found, skipping`));
      return;
    }

    // Create hooks directory
    await this.ensureDir(damageControlTarget);

    // Copy hook scripts
    const scripts = [
      'bash-tool-damage-control.js',
      'edit-tool-damage-control.js',
      'write-tool-damage-control.js',
    ];
    for (const script of scripts) {
      const src = path.join(damageControlSource, script);
      const dest = path.join(damageControlTarget, script);
      if (fs.existsSync(src)) {
        await fs.copy(src, dest);
      }
    }

    // Copy lib/damage-control-utils.js (required by hook scripts via ../lib/damage-control-utils)
    const libSource = path.join(agileflowDir, 'scripts', 'lib', 'damage-control-utils.js');
    const libTarget = path.join(claudeDir, 'hooks', 'lib', 'damage-control-utils.js');
    if (fs.existsSync(libSource)) {
      await this.ensureDir(path.dirname(libTarget));
      await fs.copy(libSource, libTarget);
    }

    // Copy patterns.yaml (preserve existing)
    const patternsSource = path.join(damageControlSource, 'patterns.yaml');
    const patternsTarget = path.join(damageControlTarget, 'patterns.yaml');
    if (fs.existsSync(patternsSource) && !fs.existsSync(patternsTarget)) {
      await fs.copy(patternsSource, patternsTarget);
      console.log(chalk.dim(`    - Damage control: patterns.yaml created`));
    } else if (fs.existsSync(patternsTarget)) {
      console.log(chalk.dim(`    - Damage control: patterns.yaml preserved`));
    }

    // Setup hooks in settings.json (unless disabled)
    if (!options.skipDamageControl) {
      await this.setupDamageControlHooks(claudeDir);
      console.log(chalk.dim(`    - Damage control: hooks enabled`));
    }
  }

  /**
   * Add PreToolUse hooks to settings.json
   * @param {string} claudeDir - .claude directory path
   */
  async setupDamageControlHooks(claudeDir) {
    const settingsPath = path.join(claudeDir, 'settings.json');
    let settings = {};

    // Load existing settings
    if (fs.existsSync(settingsPath)) {
      try {
        settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
      } catch (e) {
        settings = {};
      }
    }

    // Initialize hooks structure
    if (!settings.hooks) settings.hooks = {};
    if (!settings.hooks.PreToolUse) settings.hooks.PreToolUse = [];

    // Define damage control hooks
    const damageControlHooks = [
      {
        matcher: 'Bash',
        hooks: [
          {
            type: 'command',
            command:
              'node $CLAUDE_PROJECT_DIR/.claude/hooks/damage-control/bash-tool-damage-control.js',
            timeout: 5000,
          },
        ],
      },
      {
        matcher: 'Edit',
        hooks: [
          {
            type: 'command',
            command:
              'node $CLAUDE_PROJECT_DIR/.claude/hooks/damage-control/edit-tool-damage-control.js',
            timeout: 5000,
          },
        ],
      },
      {
        matcher: 'Write',
        hooks: [
          {
            type: 'command',
            command:
              'node $CLAUDE_PROJECT_DIR/.claude/hooks/damage-control/write-tool-damage-control.js',
            timeout: 5000,
          },
        ],
      },
    ];

    // Merge with existing hooks (don't duplicate)
    for (const newHook of damageControlHooks) {
      const existingIdx = settings.hooks.PreToolUse.findIndex(h => h.matcher === newHook.matcher);
      if (existingIdx === -1) {
        // No existing matcher, add new
        settings.hooks.PreToolUse.push(newHook);
      } else {
        // Existing matcher, merge hooks array
        const existing = settings.hooks.PreToolUse[existingIdx];
        if (!existing.hooks) existing.hooks = [];

        // Check if damage control hook already exists
        const dcHook = newHook.hooks[0];
        const hasDcHook = existing.hooks.some(
          h => h.type === 'command' && h.command && h.command.includes('damage-control')
        );

        if (!hasDcHook) {
          // Add at beginning for priority
          existing.hooks.unshift(dcHook);
        }
      }
    }

    // Write settings
    await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2));
  }

  /**
   * Setup SessionStart hooks (welcome, archive, context-loader)
   * @param {string} projectDir - Project directory
   * @param {string} agileflowDir - AgileFlow installation directory
   * @param {string} claudeDir - .claude directory path
   * @param {Object} options - Setup options
   */
  async setupSessionStartHooks(projectDir, agileflowDir, claudeDir, options = {}) {
    const settingsPath = path.join(claudeDir, 'settings.json');
    let settings = {};

    // Load existing settings
    if (fs.existsSync(settingsPath)) {
      try {
        settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
      } catch (e) {
        settings = {};
      }
    }

    // Initialize hooks structure
    if (!settings.hooks) settings.hooks = {};
    if (!settings.hooks.SessionStart) settings.hooks.SessionStart = [];

    // Define SessionStart hooks
    const sessionStartHooks = [
      {
        type: 'command',
        command:
          'node $CLAUDE_PROJECT_DIR/.agileflow/scripts/agileflow-welcome.js 2>/dev/null || true',
        timeout: 10000,
      },
      {
        type: 'command',
        command:
          'bash $CLAUDE_PROJECT_DIR/.agileflow/scripts/archive-completed-stories.sh --quiet 2>/dev/null || true',
        timeout: 10000,
      },
      {
        type: 'command',
        command:
          'node $CLAUDE_PROJECT_DIR/.agileflow/scripts/context-loader.js 2>/dev/null || true',
        timeout: 5000,
      },
      {
        type: 'command',
        command:
          'bash $CLAUDE_PROJECT_DIR/.agileflow/scripts/tmux-task-watcher.sh 2>/dev/null || true',
        timeout: 5000,
      },
    ];

    // Check if SessionStart hooks already exist
    const existingEntry = settings.hooks.SessionStart.find(
      h => h.matcher === '' || h.matcher === undefined
    );

    if (existingEntry) {
      // Merge hooks - add any missing
      if (!existingEntry.hooks) existingEntry.hooks = [];

      for (const newHook of sessionStartHooks) {
        const alreadyExists = existingEntry.hooks.some(
          h => h.command && h.command.includes(newHook.command.split('/').pop().split(' ')[0])
        );
        if (!alreadyExists) {
          existingEntry.hooks.push(newHook);
        }
      }
    } else {
      // Add new entry
      settings.hooks.SessionStart.push({
        matcher: '',
        hooks: sessionStartHooks,
      });
    }

    // Write settings
    await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2));
    console.log(
      chalk.dim(`    - SessionStart hooks: welcome, archive, context-loader, tmux-task-watcher`)
    );
  }

  /**
   * Setup Stop hooks (tmux-task-watcher cleanup)
   * @param {string} projectDir - Project directory
   * @param {string} agileflowDir - AgileFlow installation directory
   * @param {string} claudeDir - .claude directory path
   * @param {Object} options - Setup options
   */
  async setupStopHooks(projectDir, agileflowDir, claudeDir, options = {}) {
    const settingsPath = path.join(claudeDir, 'settings.json');
    let settings = {};

    if (fs.existsSync(settingsPath)) {
      try {
        settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
      } catch (e) {
        settings = {};
      }
    }

    if (!settings.hooks) settings.hooks = {};
    if (!settings.hooks.Stop) settings.hooks.Stop = [];

    const stopHooks = [
      {
        type: 'command',
        command:
          'bash $CLAUDE_PROJECT_DIR/.agileflow/scripts/tmux-task-watcher.sh stop 2>/dev/null || true',
        timeout: 3000,
      },
    ];

    const existingEntry = settings.hooks.Stop.find(
      h => h.matcher === '' || h.matcher === undefined
    );

    if (existingEntry) {
      if (!existingEntry.hooks) existingEntry.hooks = [];
      for (const newHook of stopHooks) {
        const alreadyExists = existingEntry.hooks.some(
          h => h.command && h.command.includes('tmux-task-watcher')
        );
        if (!alreadyExists) {
          existingEntry.hooks.push(newHook);
        }
      }
    } else {
      settings.hooks.Stop.push({
        matcher: '',
        hooks: stopHooks,
      });
    }

    await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2));
    console.log(chalk.dim(`    - Stop hooks: tmux-task-watcher cleanup`));
  }

  /**
   * Remove AgileFlow command duplicates from user-level ~/.claude/commands/
   * When the same command exists in both ~/.claude/commands/ and
   * <project>/.claude/commands/agileflow/, Claude Code shows duplicates.
   * @param {string} agileflowDir - AgileFlow installation directory (to get command names)
   */
  async removeUserLevelDuplicates(agileflowDir) {
    const os = require('os');
    const userCommandsDir = path.join(os.homedir(), '.claude', 'commands');

    if (!(await fs.pathExists(userCommandsDir))) return;

    // Collect AgileFlow command names from source
    const agileflowNames = new Set();
    const commandsSource = path.join(agileflowDir, 'commands');
    const agentsSource = path.join(agileflowDir, 'agents');

    for (const sourceDir of [commandsSource, agentsSource]) {
      if (await fs.pathExists(sourceDir)) {
        const entries = await fs.readdir(sourceDir, { withFileTypes: true });
        for (const entry of entries) {
          agileflowNames.add(entry.name);
        }
      }
    }

    if (agileflowNames.size === 0) return;

    // Check for agileflow-related items in user-level commands
    let removedCount = 0;
    const entries = await fs.readdir(userCommandsDir, { withFileTypes: true });

    for (const entry of entries) {
      // Only remove items that match AgileFlow command names
      if (agileflowNames.has(entry.name)) {
        const duplicatePath = path.join(userCommandsDir, entry.name);
        try {
          await fs.remove(duplicatePath);
          removedCount++;
        } catch {
          // Best effort - don't fail setup over cleanup
        }
      }
    }

    // Also remove any agileflow/ subfolder from user-level commands
    for (const folderName of ['agileflow', 'AgileFlow']) {
      const userAgileflowDir = path.join(userCommandsDir, folderName);
      if (await fs.pathExists(userAgileflowDir)) {
        try {
          await fs.remove(userAgileflowDir);
          removedCount++;
        } catch {
          // Best effort
        }
      }
    }

    if (removedCount > 0) {
      console.log(chalk.dim(`    - Removed ${removedCount} duplicate(s) from ~/.claude/commands/`));
    }
  }
}

module.exports = { ClaudeCodeSetup };
