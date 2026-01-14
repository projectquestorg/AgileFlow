/**
 * AgileFlow CLI - OpenAI Codex CLI Installer
 *
 * Installs AgileFlow for OpenAI Codex CLI:
 * - Agents become Codex Skills (.codex/skills/agileflow-NAME/)
 * - Commands become Codex Prompts (~/.codex/prompts/agileflow-NAME.md)
 * - AGENTS.md provides project instructions at repo root
 *
 * @see https://developers.openai.com/codex/
 * @see ADR-0002: Codex CLI Integration Strategy
 */

const path = require('node:path');
const os = require('node:os');
const fs = require('fs-extra');
const chalk = require('chalk');
const { safeLoad, yaml } = require('../../../../lib/yaml-utils');
const { BaseIdeSetup } = require('./_base-ide');
const { parseFrontmatter } = require('../../../../scripts/lib/frontmatter-parser');

/**
 * OpenAI Codex CLI setup handler
 */
class CodexSetup extends BaseIdeSetup {
  constructor() {
    super('codex', 'OpenAI Codex CLI', false);
    // Per-repo config directory
    this.configDir = '.codex';
    // User-level Codex home (can be overridden by $CODEX_HOME)
    this.codexHome = process.env.CODEX_HOME || path.join(os.homedir(), '.codex');
  }

  /**
   * Get the Codex home directory
   * @returns {string} Path to ~/.codex or $CODEX_HOME
   */
  getCodexHome() {
    return this.codexHome;
  }

  /**
   * Detect if Codex CLI is installed/configured
   * @param {string} projectDir - Project directory
   * @returns {Promise<boolean>}
   */
  async detect(projectDir) {
    // Check if Codex home exists (user has Codex CLI)
    const codexHomeExists = await this.exists(this.codexHome);
    // Check if project has .codex/ or AGENTS.md
    const projectCodexExists = await this.exists(path.join(projectDir, this.configDir));
    const agentsMdExists = await this.exists(path.join(projectDir, 'AGENTS.md'));

    return codexHomeExists || projectCodexExists || agentsMdExists;
  }

  /**
   * Convert an AgileFlow agent markdown file to Codex SKILL.md format
   * @param {string} content - Original agent markdown content
   * @param {string} agentName - Agent name (e.g., 'database')
   * @returns {string} Codex SKILL.md content
   */
  convertAgentToSkill(content, agentName) {
    // Extract frontmatter using shared parser
    let description = `AgileFlow ${agentName} agent`;
    let model = 'default';

    const frontmatter = parseFrontmatter(content);
    if (frontmatter && Object.keys(frontmatter).length > 0) {
      if (frontmatter.description) {
        description = frontmatter.description;
      }
      if (frontmatter.model) {
        model = frontmatter.model;
      }
    }

    // Create SKILL.md with YAML frontmatter
    const skillFrontmatter = yaml
      .dump({
        name: `agileflow-${agentName}`,
        description: description,
        version: '1.0.0',
      })
      .trim();

    // Remove original frontmatter from content
    let bodyContent = content.replace(/^---\n[\s\S]*?\n---\n*/, '');

    // Add Codex-specific header
    const codexHeader = `# AgileFlow: ${agentName.charAt(0).toUpperCase() + agentName.slice(1)} Agent

> Invoke with \`$agileflow-${agentName}\` or via \`/skills\`

`;

    // Replace Claude-specific references
    bodyContent = bodyContent
      .replace(/Claude Code/gi, 'Codex CLI')
      .replace(/CLAUDE\.md/g, 'AGENTS.md')
      .replace(/\.claude\//g, '.codex/')
      .replace(/Task tool/gi, 'skill invocation');

    return `---
${skillFrontmatter}
---

${codexHeader}${bodyContent}`;
  }

  /**
   * Convert an AgileFlow command markdown file to Codex prompt format
   * @param {string} content - Original command markdown content
   * @param {string} commandName - Command name (e.g., 'board')
   * @returns {string} Codex prompt content
   */
  convertCommandToPrompt(content, commandName) {
    // Extract description from frontmatter if present
    let description = `AgileFlow ${commandName} command`;

    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (frontmatterMatch) {
      try {
        const frontmatter = safeLoad(frontmatterMatch[1]);
        if (frontmatter.description) {
          description = frontmatter.description;
        }
      } catch (e) {
        // Ignore YAML parse errors
      }
    }

    // Remove original frontmatter from content
    let bodyContent = content.replace(/^---\n[\s\S]*?\n---\n*/, '');

    // Replace Claude-specific references
    bodyContent = bodyContent
      .replace(/Claude Code/gi, 'Codex CLI')
      .replace(/CLAUDE\.md/g, 'AGENTS.md')
      .replace(/\.claude\//g, '.codex/')
      .replace(/\/agileflow:/g, '$agileflow-');

    // Add Codex prompt header
    const header = `# AgileFlow: ${commandName}

> ${description}

## Instructions

`;

    // Add input placeholder at the end
    const footer = `

## Context

{{input}}
`;

    return `${header}${bodyContent}${footer}`;
  }

  /**
   * Install AgileFlow agents as Codex skills
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

      // Create skill directory: .codex/skills/agileflow-{name}/
      const skillDir = path.join(skillsTarget, `agileflow-${agent.name}`);
      await this.ensureDir(skillDir);

      // Write SKILL.md
      await this.writeFile(path.join(skillDir, 'SKILL.md'), skillContent);
      skillCount++;
    }

    return skillCount;
  }

  /**
   * Install AgileFlow commands as Codex prompts (user-level)
   * @param {string} agileflowDir - AgileFlow installation directory
   * @returns {Promise<number>} Number of prompts installed
   */
  async installPrompts(agileflowDir) {
    const commandsSource = path.join(agileflowDir, 'commands');
    const promptsTarget = path.join(this.codexHome, 'prompts');

    if (!(await this.exists(commandsSource))) {
      return 0;
    }

    await this.ensureDir(promptsTarget);

    let promptCount = 0;
    const commands = await this.scanDirectory(commandsSource, '.md');

    for (const command of commands) {
      const content = await this.readFile(command.path);
      const promptContent = this.convertCommandToPrompt(content, command.name);

      // Write prompt: ~/.codex/prompts/agileflow-{name}.md
      const promptPath = path.join(promptsTarget, `agileflow-${command.name}.md`);
      await this.writeFile(promptPath, promptContent);
      promptCount++;
    }

    return promptCount;
  }

  /**
   * Generate AGENTS.md scaffolding for the project
   * @param {string} projectDir - Project directory
   * @returns {Promise<boolean>} Whether AGENTS.md was created
   */
  async generateAgentsMd(projectDir) {
    const agentsMdPath = path.join(projectDir, 'AGENTS.md');

    // Don't overwrite existing AGENTS.md
    if (await this.exists(agentsMdPath)) {
      console.log(chalk.dim(`    - AGENTS.md already exists (preserved)`));
      return false;
    }

    const content = `# AGENTS.md

> Project instructions for Codex CLI with AgileFlow integration

## Project Commands

\`\`\`bash
# Run tests
npm test

# Lint code
npm run lint

# Build project
npm run build
\`\`\`

## Conventions

- Prefer running tests before claiming success
- Keep changes small and reviewable
- Use AgileFlow skills when relevant (see below)
- Check \`${this.docsFolder}/09-agents/status.json\` for current work status

## When to Use AgileFlow Skills

Invoke skills with \`$skill-name\` or list available skills with \`/skills\`.

| Task Type | Skill to Use |
|-----------|--------------|
| Architecture decisions | \`$agileflow-adr-writer\` |
| Database work | \`$agileflow-database\` |
| API endpoints | \`$agileflow-api\` |
| UI components | \`$agileflow-ui\` |
| Testing | \`$agileflow-testing\` |
| CI/CD setup | \`$agileflow-ci\` |
| Security review | \`$agileflow-security\` |
| Performance | \`$agileflow-performance\` |
| Documentation | \`$agileflow-documentation\` |

## AgileFlow Status

- **Stories**: \`${this.docsFolder}/09-agents/status.json\`
- **Research**: \`${this.docsFolder}/10-research/\`
- **Decisions**: \`${this.docsFolder}/03-decisions/\`
- **Epics**: \`${this.docsFolder}/05-epics/\`

## Security Recommendations

For safe operation, configure Codex with:

\`\`\`toml
# ~/.codex/config.toml
approval_policy = "on-request"
sandbox_mode = "workspace-write"
\`\`\`

---

*Generated by AgileFlow - https://github.com/projectquestorg/AgileFlow*
`;

    await this.writeFile(agentsMdPath, content);
    return true;
  }

  /**
   * Generate AGENTS.override.md template for subdirectories
   * @param {string} targetDir - Directory to create override in
   * @returns {Promise<boolean>} Whether file was created
   */
  async generateAgentsOverride(targetDir) {
    const overridePath = path.join(targetDir, 'AGENTS.override.md');

    // Don't overwrite existing override
    if (await this.exists(overridePath)) {
      return false;
    }

    const content = `# AGENTS.override.md

> Override instructions for this subdirectory

## Directory-Specific Context

This directory contains: [describe purpose]

## Additional Commands

\`\`\`bash
# Directory-specific commands here
\`\`\`

## Directory Conventions

- [List any patterns specific to this directory]

---

*This file overrides AGENTS.md for this subdirectory*
`;

    await this.writeFile(overridePath, content);
    return true;
  }

  /**
   * Setup Codex CLI configuration
   * @param {string} projectDir - Project directory
   * @param {string} agileflowDir - AgileFlow installation directory
   * @param {Object} options - Setup options
   */
  async setup(projectDir, agileflowDir, options = {}) {
    console.log(chalk.hex('#e8683a')(`  Setting up ${this.displayName}...`));

    // Clean up old installation first
    await this.cleanup(projectDir);

    // Ensure .codex directory exists
    await this.ensureDir(path.join(projectDir, this.configDir));

    // 1. Install agents as skills (per-repo)
    const skillCount = await this.installSkills(projectDir, agileflowDir);
    if (skillCount > 0) {
      console.log(chalk.dim(`    - ${skillCount} skills installed to .codex/skills/`));
    }

    // 2. Install commands as prompts (user-level)
    const promptCount = await this.installPrompts(agileflowDir);
    if (promptCount > 0) {
      console.log(chalk.dim(`    - ${promptCount} prompts installed to ~/.codex/prompts/`));
    }

    // 3. Generate AGENTS.md if it doesn't exist
    const agentsMdCreated = await this.generateAgentsMd(projectDir);
    if (agentsMdCreated) {
      console.log(chalk.dim(`    - AGENTS.md created at project root`));
    }

    console.log(chalk.green(`  ✓ ${this.displayName} configured`));
    console.log(chalk.dim(`    - Skills: .codex/skills/agileflow-*/`));
    console.log(chalk.dim(`    - Prompts: ~/.codex/prompts/agileflow-*.md`));
    console.log(chalk.dim(`    - Instructions: AGENTS.md`));

    return {
      success: true,
      skills: skillCount,
      prompts: promptCount,
      agentsMd: agentsMdCreated,
    };
  }

  /**
   * Cleanup Codex configuration
   * @param {string} projectDir - Project directory
   * @param {Object} options - Cleanup options
   * @param {boolean} options.removeAgentsMd - Also remove AGENTS.md (requires confirmation)
   */
  async cleanup(projectDir, options = {}) {
    // Clean up per-repo skills
    const skillsDir = path.join(projectDir, this.configDir, 'skills');
    if (await this.exists(skillsDir)) {
      const entries = await fs.readdir(skillsDir);
      for (const entry of entries) {
        if (entry.startsWith('agileflow-')) {
          await fs.remove(path.join(skillsDir, entry));
        }
      }
      console.log(chalk.dim(`  Cleaned up AgileFlow skills from .codex/skills/`));
    }

    // Clean up user-level prompts
    const promptsDir = path.join(this.codexHome, 'prompts');
    if (await this.exists(promptsDir)) {
      const entries = await fs.readdir(promptsDir);
      for (const entry of entries) {
        if (entry.startsWith('agileflow-')) {
          await fs.remove(path.join(promptsDir, entry));
        }
      }
      console.log(chalk.dim(`  Cleaned up AgileFlow prompts from ~/.codex/prompts/`));
    }

    // Optionally remove AGENTS.md if explicitly requested
    if (options.removeAgentsMd) {
      const agentsMdPath = path.join(projectDir, 'AGENTS.md');
      if (await this.exists(agentsMdPath)) {
        await fs.remove(agentsMdPath);
        console.log(chalk.dim(`  Removed AGENTS.md`));
      }
    } else {
      console.log(chalk.dim(`  Note: AGENTS.md preserved (use removeAgentsMd option to delete)`));
    }
  }
}

module.exports = { CodexSetup };
