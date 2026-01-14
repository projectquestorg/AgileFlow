/**
 * AgileFlow CLI - List Command
 *
 * Lists installed commands, agents, skills, and experts.
 */

const chalk = require('chalk');
const path = require('node:path');
const fs = require('fs-extra');
const { safeLoad } = require('../../../lib/yaml-utils');
const { Installer } = require('../installers/core/installer');
const { displayLogo, displaySection, success, warning, info } = require('../lib/ui');
const {
  parseFrontmatter: parseYamlFrontmatter,
} = require('../../../scripts/lib/frontmatter-parser');

const installer = new Installer();

module.exports = {
  name: 'list',
  description: 'List installed AgileFlow components',
  options: [
    ['-d, --directory <path>', 'Project directory (default: current directory)'],
    ['-c, --commands', 'List only commands'],
    ['-a, --agents', 'List only agents'],
    ['-s, --skills', 'List only skills'],
    ['-e, --experts', 'List only experts'],
    ['--json', 'Output as JSON'],
    ['--compact', 'Compact output (names only)'],
  ],
  action: async options => {
    try {
      const directory = path.resolve(options.directory || '.');

      // Check installation
      const status = await installer.getStatus(directory);

      if (!status.installed) {
        if (options.json) {
          console.log(JSON.stringify({ error: 'Not installed' }));
        } else {
          displayLogo();
          warning('No AgileFlow installation found in this directory');
          console.log(chalk.dim(`\nRun 'npx agileflow setup' to set up AgileFlow\n`));
        }
        process.exit(1);
      }

      // Determine what to list
      const showAll = !options.commands && !options.agents && !options.skills && !options.experts;
      const showCommands = showAll || options.commands;
      const showAgents = showAll || options.agents;
      const showSkills = showAll || options.skills;
      const showExperts = showAll || options.experts;

      // Collect data
      const result = {};

      if (showCommands) {
        result.commands = await listCommands(status.path);
      }

      if (showAgents) {
        result.agents = await listAgents(status.path);
      }

      if (showSkills) {
        result.skills = await listSkills(status.path);
      }

      if (showExperts) {
        result.experts = await listExperts(status.path);
      }

      // Output
      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
      } else if (options.compact) {
        displayCompact(result, showCommands, showAgents, showSkills, showExperts);
      } else {
        displayLogo();
        displayFull(result, showCommands, showAgents, showSkills, showExperts);
      }

      process.exit(0);
    } catch (err) {
      if (options.json) {
        console.log(JSON.stringify({ error: err.message }));
      } else {
        console.error(chalk.red('Error:'), err.message);
        if (process.env.DEBUG) {
          console.error(err.stack);
        }
      }
      process.exit(1);
    }
  },
};

/**
 * List commands from the commands directory
 * @param {string} agileflowPath - Path to .agileflow directory
 * @returns {Promise<Array>}
 */
async function listCommands(agileflowPath) {
  const commandsPath = path.join(agileflowPath, 'commands');
  const commands = [];

  if (!(await fs.pathExists(commandsPath))) {
    return commands;
  }

  const files = await fs.readdir(commandsPath);

  for (const file of files) {
    if (!file.endsWith('.md')) continue;

    const filePath = path.join(commandsPath, file);
    const stat = await fs.stat(filePath);

    if (!stat.isFile()) continue;

    const content = await fs.readFile(filePath, 'utf8');
    const parsed = parseFrontmatter(content);

    commands.push({
      name: file.replace('.md', ''),
      description: parsed.frontmatter?.description || extractFirstLine(content),
      file: file,
    });
  }

  return commands.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * List agents from the agents directory
 * @param {string} agileflowPath - Path to .agileflow directory
 * @returns {Promise<Array>}
 */
async function listAgents(agileflowPath) {
  const agentsPath = path.join(agileflowPath, 'agents');
  const agents = [];

  if (!(await fs.pathExists(agentsPath))) {
    return agents;
  }

  const files = await fs.readdir(agentsPath);

  for (const file of files) {
    if (!file.endsWith('.md')) continue;

    const filePath = path.join(agentsPath, file);
    const stat = await fs.stat(filePath);

    if (!stat.isFile()) continue;

    const content = await fs.readFile(filePath, 'utf8');
    const parsed = parseFrontmatter(content);

    agents.push({
      name: parsed.frontmatter?.name || file.replace('.md', ''),
      description: parsed.frontmatter?.description || extractFirstLine(content),
      model: parsed.frontmatter?.model || 'default',
      file: file,
    });
  }

  return agents.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * List skills from the skills directory
 * @param {string} agileflowPath - Path to .agileflow directory
 * @returns {Promise<Array>}
 */
async function listSkills(agileflowPath) {
  const skillsPath = path.join(agileflowPath, 'skills');
  const skills = [];

  if (!(await fs.pathExists(skillsPath))) {
    return skills;
  }

  const entries = await fs.readdir(skillsPath, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const skillDir = path.join(skillsPath, entry.name);
    const skillFile = path.join(skillDir, 'SKILL.md');

    if (!(await fs.pathExists(skillFile))) continue;

    const content = await fs.readFile(skillFile, 'utf8');
    const parsed = parseFrontmatter(content);

    skills.push({
      name: entry.name,
      description: parsed.frontmatter?.description || extractFirstLine(content),
      triggers: parsed.frontmatter?.triggers || [],
      file: `${entry.name}/SKILL.md`,
    });
  }

  return skills.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * List experts from the experts directory
 * @param {string} agileflowPath - Path to .agileflow directory
 * @returns {Promise<Array>}
 */
async function listExperts(agileflowPath) {
  const expertsPath = path.join(agileflowPath, 'experts');
  const experts = [];

  if (!(await fs.pathExists(expertsPath))) {
    return experts;
  }

  const entries = await fs.readdir(expertsPath, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name === 'templates') continue; // Skip templates directory

    const expertDir = path.join(expertsPath, entry.name);
    const expertiseFile = path.join(expertDir, 'expertise.yaml');

    if (!(await fs.pathExists(expertiseFile))) continue;

    try {
      const content = await fs.readFile(expertiseFile, 'utf8');
      const parsed = safeLoad(content);

      experts.push({
        name: entry.name,
        description: parsed?.description || `${entry.name} domain expert`,
        version: parsed?.version || 'unknown',
        lastUpdated: parsed?.last_updated || null,
        file: `${entry.name}/expertise.yaml`,
      });
    } catch {
      // Skip invalid YAML files
      experts.push({
        name: entry.name,
        description: `${entry.name} domain expert`,
        version: 'unknown',
        lastUpdated: null,
        file: `${entry.name}/expertise.yaml`,
      });
    }
  }

  return experts.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Parse YAML frontmatter from markdown (wrapper for shared parser)
 * @param {string} content - File content
 * @returns {{ frontmatter: Object|null, content: string }}
 */
function parseFrontmatter(content) {
  const frontmatter = parseYamlFrontmatter(content);
  const body = content.replace(/^---\n[\s\S]*?\n---\n?/, '');
  return {
    frontmatter: Object.keys(frontmatter).length > 0 ? frontmatter : null,
    content: body,
  };
}

/**
 * Extract first non-empty line from content (for description fallback)
 * @param {string} content - File content
 * @returns {string}
 */
function extractFirstLine(content) {
  // Remove frontmatter if present
  const withoutFrontmatter = content.replace(/^---\n[\s\S]*?\n---\n?/, '');

  // Find first heading or text line
  const lines = withoutFrontmatter.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // If it's a heading, extract the text
    if (trimmed.startsWith('#')) {
      return trimmed.replace(/^#+\s*/, '');
    }

    // Return first non-empty line (truncated)
    return trimmed.length > 60 ? trimmed.slice(0, 57) + '...' : trimmed;
  }

  return 'No description';
}

/**
 * Display compact output
 */
function displayCompact(result, showCommands, showAgents, showSkills, showExperts) {
  if (showCommands && result.commands?.length > 0) {
    console.log(chalk.bold('Commands:'), result.commands.map(c => c.name).join(', '));
  }

  if (showAgents && result.agents?.length > 0) {
    console.log(chalk.bold('Agents:'), result.agents.map(a => a.name).join(', '));
  }

  if (showSkills && result.skills?.length > 0) {
    console.log(chalk.bold('Skills:'), result.skills.map(s => s.name).join(', '));
  }

  if (showExperts && result.experts?.length > 0) {
    console.log(chalk.bold('Experts:'), result.experts.map(e => e.name).join(', '));
  }
}

/**
 * Display full output with descriptions
 */
function displayFull(result, showCommands, showAgents, showSkills, showExperts) {
  if (showCommands && result.commands?.length > 0) {
    displaySection(`Commands (${result.commands.length})`);

    for (const cmd of result.commands) {
      console.log(chalk.hex('#e8683a')(`  ${cmd.name}`));
      console.log(chalk.dim(`    ${cmd.description}`));
    }
  }

  if (showAgents && result.agents?.length > 0) {
    displaySection(`Agents (${result.agents.length})`);

    for (const agent of result.agents) {
      const modelBadge = agent.model !== 'default' ? chalk.dim(` [${agent.model}]`) : '';
      console.log(chalk.hex('#e8683a')(`  ${agent.name}`) + modelBadge);
      console.log(chalk.dim(`    ${agent.description}`));
    }
  }

  if (showSkills && result.skills?.length > 0) {
    displaySection(`Skills (${result.skills.length})`);

    for (const skill of result.skills) {
      console.log(chalk.hex('#e8683a')(`  ${skill.name}`));
      console.log(chalk.dim(`    ${skill.description}`));
      if (skill.triggers?.length > 0) {
        console.log(
          chalk.dim(
            `    Triggers: ${skill.triggers.slice(0, 3).join(', ')}${skill.triggers.length > 3 ? '...' : ''}`
          )
        );
      }
    }
  }

  if (showExperts && result.experts?.length > 0) {
    displaySection(`Experts (${result.experts.length})`);

    for (const expert of result.experts) {
      const versionBadge = expert.version !== 'unknown' ? chalk.dim(` v${expert.version}`) : '';
      console.log(chalk.hex('#e8683a')(`  ${expert.name}`) + versionBadge);
      console.log(chalk.dim(`    ${expert.description}`));
    }
  }

  console.log(); // Final newline
}
