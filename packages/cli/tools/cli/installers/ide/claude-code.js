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
    console.log(chalk.hex('#e8683a')(`  Setting up ${this.displayName}...`));

    // Clean up old installation first
    await this.cleanup(projectDir);

    // Create .claude/commands/agileflow directory
    const claudeDir = path.join(projectDir, this.configDir);
    const commandsDir = path.join(claudeDir, this.commandsDir);
    const agileflowCommandsDir = path.join(commandsDir, 'agileflow');

    await this.ensureDir(agileflowCommandsDir);

    // Recursively install all commands (including subdirectories like agents/, session/)
    const commandsSource = path.join(agileflowDir, 'commands');
    const commandResult = await this.installCommandsRecursive(
      commandsSource,
      agileflowCommandsDir,
      agileflowDir,
      true // Inject dynamic content for top-level commands
    );

    // Also install agents as slash commands (.claude/commands/agileflow/agents/)
    const agentsSource = path.join(agileflowDir, 'agents');
    const agentsTargetDir = path.join(agileflowCommandsDir, 'agents');
    const agentResult = await this.installCommandsRecursive(
      agentsSource,
      agentsTargetDir,
      agileflowDir,
      false // No dynamic content for agents
    );

    // ALSO install agents as spawnable subagents (.claude/agents/agileflow/)
    // This allows Task tool to spawn them with subagent_type: "agileflow-ui"
    const spawnableAgentsDir = path.join(claudeDir, 'agents', 'agileflow');
    await this.installCommandsRecursive(agentsSource, spawnableAgentsDir, agileflowDir, false);
    console.log(chalk.dim(`    - Spawnable agents: .claude/agents/agileflow/`));

    // Create skills directory for user-generated skills (.claude/skills/)
    // AgileFlow no longer ships static skills - users generate them via /agileflow:skill:create
    const skillsTargetDir = path.join(claudeDir, 'skills');
    await this.ensureDir(skillsTargetDir);
    console.log(chalk.dim(`    - Skills directory: .claude/skills/ (for user-generated skills)`));

    // Setup damage control hooks
    await this.setupDamageControl(projectDir, agileflowDir, claudeDir, options);

    const totalCommands = commandResult.commands + agentResult.commands;
    const totalSubdirs =
      commandResult.subdirs + (agentResult.commands > 0 ? 1 : 0) + agentResult.subdirs;

    console.log(chalk.green(`  ✓ ${this.displayName} configured:`));
    console.log(chalk.dim(`    - ${totalCommands} commands installed`));
    if (totalSubdirs > 0) {
      console.log(chalk.dim(`    - ${totalSubdirs} subdirectories`));
    }
    console.log(chalk.dim(`    - Path: ${path.relative(projectDir, agileflowCommandsDir)}`));

    return {
      success: true,
      commands: totalCommands,
      subdirs: totalSubdirs,
    };
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
    const scripts = ['bash-tool-damage-control.js', 'edit-tool-damage-control.js', 'write-tool-damage-control.js'];
    for (const script of scripts) {
      const src = path.join(damageControlSource, script);
      const dest = path.join(damageControlTarget, script);
      if (fs.existsSync(src)) {
        await fs.copy(src, dest);
      }
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
        hooks: [{
          type: 'command',
          command: 'node $CLAUDE_PROJECT_DIR/.claude/hooks/damage-control/bash-tool-damage-control.js',
          timeout: 5000
        }]
      },
      {
        matcher: 'Edit',
        hooks: [{
          type: 'command',
          command: 'node $CLAUDE_PROJECT_DIR/.claude/hooks/damage-control/edit-tool-damage-control.js',
          timeout: 5000
        }]
      },
      {
        matcher: 'Write',
        hooks: [{
          type: 'command',
          command: 'node $CLAUDE_PROJECT_DIR/.claude/hooks/damage-control/write-tool-damage-control.js',
          timeout: 5000
        }]
      }
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
        const hasDcHook = existing.hooks.some(h =>
          h.type === 'command' && h.command && h.command.includes('damage-control')
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
}

module.exports = { ClaudeCodeSetup };
