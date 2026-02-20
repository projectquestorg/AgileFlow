/**
 * AgileFlow CLI - Cursor IDE Installer
 *
 * Installs AgileFlow commands, agents, and hooks for Cursor IDE.
 * Cursor uses:
 * - Plain Markdown files in .cursor/commands/ for slash commands
 * - Markdown files in .cursor/agents/ for subagents (with YAML frontmatter)
 * - .cursor/hooks.json for lifecycle hooks
 */

const path = require('node:path');
const fs = require('fs-extra');
const chalk = require('chalk');
const { BaseIdeSetup } = require('./_base-ide');

/**
 * Cursor IDE setup handler
 */
class CursorSetup extends BaseIdeSetup {
  constructor() {
    super('cursor', 'Cursor', false);
    this.configDir = '.cursor';
    this.commandsDir = 'commands';
  }

  /**
   * Setup Cursor IDE configuration
   * @param {string} projectDir - Project directory
   * @param {string} agileflowDir - AgileFlow installation directory
   * @param {Object} options - Setup options
   */
  async setup(projectDir, agileflowDir, options = {}) {
    // Use standard setup for commands and agents
    const result = await this.setupStandard(projectDir, agileflowDir, {
      targetSubdir: this.commandsDir,
      agileflowFolder: 'AgileFlow',
    });

    const { ideDir, agileflowTargetDir } = result;
    const agentsSource = path.join(agileflowDir, 'agents');

    // Cursor specific: Install agents as spawnable subagents (.cursor/agents/AgileFlow/)
    // This allows Cursor's async subagent spawning feature
    const spawnableAgentsDir = path.join(ideDir, 'agents', 'AgileFlow');

    // Clean existing spawnable agents directory to prevent duplicates during update
    if (await fs.pathExists(spawnableAgentsDir)) {
      await fs.remove(spawnableAgentsDir);
    }

    const agentInstallResult = await this.installCommandsRecursive(
      agentsSource,
      spawnableAgentsDir,
      agileflowDir,
      false
    );
    console.log(chalk.dim(`    - Spawnable agents: .cursor/agents/AgileFlow/`));

    // Cursor specific: Setup damage control hooks
    await this.setupDamageControlHooks(projectDir, agileflowDir, ideDir, options);

    return {
      ...result,
      agents: agentInstallResult.commands,
    };
  }

  /**
   * Setup damage control hooks for Cursor
   * Maps Claude Code's PreToolUse hooks to Cursor's lifecycle events:
   * - beforeShellExecution (for bash commands)
   * - afterFileEdit (for file edits)
   *
   * @param {string} projectDir - Project directory
   * @param {string} agileflowDir - AgileFlow installation directory
   * @param {string} cursorDir - .cursor directory path
   * @param {Object} options - Setup options
   */
  async setupDamageControlHooks(projectDir, agileflowDir, cursorDir, options = {}) {
    if (options.skipDamageControl) {
      return;
    }

    const hooksPath = path.join(cursorDir, 'hooks.json');
    let hooks = [];

    // Load existing hooks if they exist
    if (fs.existsSync(hooksPath)) {
      try {
        const content = await fs.readFile(hooksPath, 'utf8');
        hooks = JSON.parse(content);
        if (!Array.isArray(hooks)) {
          hooks = [];
        }
      } catch (e) {
        hooks = [];
      }
    }

    // Define damage control hooks for Cursor
    // Cursor's hooks.json format: Array of {event, command, args, order}
    const damageControlHooks = [
      {
        event: 'beforeShellExecution',
        command: 'node',
        args: ['$CURSOR_PROJECT_DIR/.cursor/hooks/damage-control/bash-tool-damage-control.js'],
        order: 1,
      },
      {
        event: 'afterFileEdit',
        command: 'node',
        args: ['$CURSOR_PROJECT_DIR/.cursor/hooks/damage-control/edit-tool-damage-control.js'],
        order: 1,
      },
    ];

    // Check if damage control hooks already exist and merge
    let hasUpdates = false;
    for (const newHook of damageControlHooks) {
      const existingIdx = hooks.findIndex(
        h =>
          h.event === newHook.event &&
          h.command === newHook.command &&
          (h.args?.join(' ') === newHook.args?.join(' ') ||
            (h.args && h.args.some(arg => arg.includes('damage-control'))))
      );

      if (existingIdx === -1) {
        hooks.push(newHook);
        hasUpdates = true;
      }
    }

    // Only write if we have updates or if file didn't exist
    if (hasUpdates || !fs.existsSync(hooksPath)) {
      await fs.ensureDir(path.dirname(hooksPath));
      await fs.writeFile(hooksPath, JSON.stringify(hooks, null, 2));
      console.log(chalk.dim(`    - Damage control: hooks enabled`));
    }

    // Copy damage control scripts
    await this.setupDamageControlScripts(agileflowDir, cursorDir);
  }

  /**
   * Copy damage control scripts to .cursor/hooks/damage-control/
   * @param {string} agileflowDir - AgileFlow installation directory
   * @param {string} cursorDir - .cursor directory path
   */
  async setupDamageControlScripts(agileflowDir, cursorDir) {
    const damageControlSource = path.join(agileflowDir, 'scripts', 'damage-control');
    const damageControlTarget = path.join(cursorDir, 'hooks', 'damage-control');

    if (!fs.existsSync(damageControlSource)) {
      return;
    }

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

    // Copy lib/damage-control-utils.js (required by hook scripts)
    const libSource = path.join(agileflowDir, 'scripts', 'lib', 'damage-control-utils.js');
    const libTarget = path.join(cursorDir, 'hooks', 'lib', 'damage-control-utils.js');
    if (fs.existsSync(libSource)) {
      await this.ensureDir(path.dirname(libTarget));
      await fs.copy(libSource, libTarget);
    }

    // Copy patterns.yaml (preserve existing)
    const patternsSource = path.join(damageControlSource, 'patterns.yaml');
    const patternsTarget = path.join(damageControlTarget, 'patterns.yaml');
    if (fs.existsSync(patternsSource) && !fs.existsSync(patternsTarget)) {
      await fs.copy(patternsSource, patternsTarget);
    }
  }

  /**
   * Cleanup old AgileFlow installation
   * @param {string} projectDir - Project directory
   */
  async cleanup(projectDir) {
    // Remove old .cursor/rules/agileflow (deprecated)
    const oldRulesPath = path.join(projectDir, this.configDir, 'rules', 'agileflow');
    if (await this.exists(oldRulesPath)) {
      await fs.remove(oldRulesPath);
      console.log(chalk.dim(`    Removed old AgileFlow rules from ${this.displayName}`));
    }

    // Remove .cursor/commands/AgileFlow (for re-installation)
    const commandsPath = path.join(projectDir, this.configDir, this.commandsDir, 'AgileFlow');
    if (await this.exists(commandsPath)) {
      await fs.remove(commandsPath);
    }

    // Remove .cursor/agents/AgileFlow (for re-installation)
    const agentsPath = path.join(projectDir, this.configDir, 'agents', 'AgileFlow');
    if (await this.exists(agentsPath)) {
      await fs.remove(agentsPath);
    }
  }
}

module.exports = { CursorSetup };
