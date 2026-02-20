/**
 * AgileFlow CLI - Windsurf IDE Installer
 *
 * Installs AgileFlow for Windsurf IDE:
 * - Commands as workflows to .windsurf/workflows/agileflow/
 * - Agents as skills to .windsurf/skills/agileflow-<NAME>/SKILL.md
 * - Damage control hooks to .windsurf/hooks.json
 *
 * Windsurf supports 11 lifecycle events and 12,000 character limit per workflow.
 * Skills follow agentskills.io specification with YAML frontmatter.
 */

const path = require('node:path');
const fs = require('fs-extra');
const chalk = require('chalk');
const { yaml } = require('../../../../lib/yaml-utils');
const { BaseIdeSetup } = require('./_base-ide');
const {
  getFrontmatter,
  stripFrontmatter,
  replaceReferences,
  IDE_REPLACEMENTS,
} = require('../../lib/content-transformer');

/**
 * Windsurf IDE setup handler
 */
class WindsurfSetup extends BaseIdeSetup {
  constructor() {
    super('windsurf', 'Windsurf', false);
    this.configDir = '.windsurf';
    this.workflowsDir = 'workflows';
  }

  /**
   * Convert an AgileFlow agent markdown file to Windsurf SKILL.md format
   * Windsurf skills follow the agentskills.io specification with YAML frontmatter
   *
   * @param {string} content - Original agent markdown content
   * @param {string} agentName - Agent name (e.g., 'database')
   * @returns {string} Windsurf SKILL.md content
   */
  convertAgentToSkill(content, agentName) {
    // Extract frontmatter using content-transformer
    const frontmatter = getFrontmatter(content);
    const description = frontmatter.description || `AgileFlow ${agentName} agent`;

    // Create SKILL.md with YAML frontmatter (agentskills.io spec)
    const skillFrontmatter = yaml
      .dump({
        name: `agileflow-${agentName}`,
        description: description,
      })
      .trim();

    // Remove original frontmatter from content using content-transformer
    let bodyContent = stripFrontmatter(content);

    // Add Windsurf-specific header
    const windsurfHeader = `# AgileFlow: ${agentName.charAt(0).toUpperCase() + agentName.slice(1)} Skill

> Use this skill via \`@agileflow-${agentName}\` or /cascade

`;

    // Replace Claude-specific references using content-transformer
    bodyContent = replaceReferences(bodyContent, IDE_REPLACEMENTS.windsurf);

    // Add Windsurf-specific replacements
    bodyContent = replaceReferences(bodyContent, {
      'Task tool': 'workflow chaining',
      AskUserQuestion: 'numbered list prompt',
      '.claude/agents/agileflow': '.windsurf/skills/agileflow',
    });

    // Replace /agileflow: prefix for Windsurf workflow chaining
    // e.g., /agileflow:story:list → /agileflow-story-list
    bodyContent = bodyContent.replace(/\/agileflow:([a-zA-Z0-9:_-]+)/g, (_match, rest) => {
      return '/agileflow-' + rest.replace(/:/g, '-');
    });

    // Warn if content exceeds Windsurf's 12,000 character limit
    const totalLength = skillFrontmatter.length + windsurfHeader.length + bodyContent.length;
    if (totalLength > 12000) {
      console.warn(
        chalk.yellow(
          `    ⚠ Skill '${agentName}' exceeds 12,000 character limit (${totalLength} chars). Consider splitting.`
        )
      );
    }

    return `---
${skillFrontmatter}
---

${windsurfHeader}${bodyContent}`;
  }

  /**
   * Install AgileFlow agents as Windsurf skills
   * Skills are installed to .windsurf/skills/agileflow-{name}/SKILL.md
   *
   * @param {string} projectDir - Project directory
   * @param {string} agileflowDir - AgileFlow installation directory
   * @returns {Promise<number>} Number of skills installed
   */
  async installSkills(projectDir, agileflowDir) {
    const agentsSource = path.join(agileflowDir, 'agents');
    const skillsTarget = path.join(projectDir, this.configDir, 'skills');

    if (!(await this.exists(agentsSource))) {
      return 0;
    }

    let skillCount = 0;
    const agents = await this.scanDirectory(agentsSource, '.md');

    for (const agent of agents) {
      const content = await this.readFile(agent.path);
      const skillContent = this.convertAgentToSkill(content, agent.name);

      // Create skill directory: .windsurf/skills/agileflow-{name}/
      const skillDir = path.join(skillsTarget, `agileflow-${agent.name}`);
      await this.ensureDir(skillDir);

      // Write SKILL.md
      await this.writeFile(path.join(skillDir, 'SKILL.md'), skillContent);
      skillCount++;
    }

    return skillCount;
  }

  /**
   * Setup damage control hooks for Windsurf
   * Maps Claude Code's PreToolUse hooks to Windsurf's lifecycle events:
   * - pre_run_command (for bash commands)
   * - post_write_code (for file edits)
   * - pre_mcp_tool_use (for MCP tools)
   *
   * @param {string} projectDir - Project directory
   * @param {string} agileflowDir - AgileFlow installation directory
   * @param {string} windsurfDir - .windsurf directory path
   * @param {Object} options - Setup options
   */
  async setupDamageControlHooks(projectDir, agileflowDir, windsurfDir, options = {}) {
    if (options.skipDamageControl) {
      return;
    }

    const hooksPath = path.join(windsurfDir, 'hooks.json');
    let hooks = [];

    // Load existing hooks if they exist
    if (fs.existsSync(hooksPath)) {
      try {
        const content = await fs.readFile(hooksPath, 'utf8');
        const parsed = JSON.parse(content);
        if (!Array.isArray(parsed)) {
          console.warn(
            '[AgileFlow] hooks.json exists but is not an array, preserving existing file'
          );
          return;
        }
        hooks = parsed;
      } catch (e) {
        console.warn(
          `[AgileFlow] hooks.json exists but is malformed (${e.message}), preserving existing file`
        );
        return;
      }
    }

    // Define damage control hooks for Windsurf
    // Windsurf's hooks.json format differs from Cursor - it uses event, command, args
    const damageControlHooks = [
      {
        event: 'pre_run_command',
        command: 'node',
        args: ['.agileflow/scripts/damage-control/damage-control-bash.js'],
        description: 'AgileFlow damage control for shell commands',
      },
      {
        event: 'post_write_code',
        command: 'node',
        args: ['.agileflow/scripts/damage-control/damage-control-edit.js'],
        description: 'AgileFlow damage control for file edits',
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
  }

  /**
   * Setup Windsurf IDE configuration
   * @param {string} projectDir - Project directory
   * @param {string} agileflowDir - AgileFlow installation directory
   * @param {Object} options - Setup options
   */
  async setup(projectDir, agileflowDir, options = {}) {
    console.log(chalk.hex('#e8683a')(`  Setting up ${this.displayName}...`));

    // Note: cleanup is handled inside setupStandard(), no need to call explicitly

    // 1. Install workflows using standard setup
    const workflowsResult = await this.setupStandard(projectDir, agileflowDir, {
      targetSubdir: this.workflowsDir,
      agileflowFolder: 'agileflow',
      commandLabel: 'workflows',
      agentLabel: 'agent workflows',
    });

    // 2. Install agents as skills
    const skillCount = await this.installSkills(projectDir, agileflowDir);
    if (skillCount > 0) {
      console.log(chalk.dim(`    - ${skillCount} skills installed to .windsurf/skills/`));
    }

    // 3. Setup damage control hooks
    const windsurfDir = path.join(projectDir, this.configDir);
    await this.setupDamageControlHooks(projectDir, agileflowDir, windsurfDir, options);

    console.log(chalk.green(`  ✓ ${this.displayName} configured:`));
    console.log(chalk.dim(`    - Workflows: .windsurf/workflows/agileflow/`));
    console.log(chalk.dim(`    - Skills: .windsurf/skills/agileflow-*/`));
    console.log(chalk.dim(`    - Hooks: .windsurf/hooks.json`));

    return {
      ...workflowsResult,
      skills: skillCount,
    };
  }

  /**
   * Cleanup old AgileFlow installation
   * @param {string} projectDir - Project directory
   */
  async cleanup(projectDir) {
    // Remove old workflows directory
    const workflowsPath = path.join(projectDir, this.configDir, this.workflowsDir, 'agileflow');
    if (await this.exists(workflowsPath)) {
      await fs.remove(workflowsPath);
      console.log(chalk.dim(`    Removed old AgileFlow workflows from ${this.displayName}`));
    }

    // Remove old skills directories
    const skillsDir = path.join(projectDir, this.configDir, 'skills');
    if (await this.exists(skillsDir)) {
      const entries = await fs.readdir(skillsDir);
      for (const entry of entries) {
        if (entry.startsWith('agileflow-')) {
          await fs.remove(path.join(skillsDir, entry));
        }
      }
      console.log(chalk.dim(`    Removed old AgileFlow skills from ${this.displayName}`));
    }
  }
}

module.exports = { WindsurfSetup };
