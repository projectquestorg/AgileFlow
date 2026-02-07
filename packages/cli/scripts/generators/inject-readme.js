#!/usr/bin/env node

/**
 * README Content Injector
 *
 * Injects stats, agent tables, and skill lists into README.md.
 * Handles multiple AUTOGEN sections for different content types.
 */

const fs = require('fs');
const fsp = require('fs').promises;
const path = require('path');
const { scanAgents } = require('./agent-registry');
const { scanCommands } = require('./command-registry');
const { scanSkills } = require('./skill-registry');

/**
 * Generate stats content (command/agent/skill counts)
 * @param {Object} counts - {commands, agents, skills}
 * @returns {string} Formatted stats
 */
function generateStats(counts) {
  return `- **${counts.commands}** slash commands\n- **${counts.agents}** specialized agents\n- **${counts.skills}** code generation skills`;
}

/**
 * Generate agent table (markdown table format)
 * @param {Array} agents - Array of agent metadata
 * @returns {string} Formatted table
 */
function generateAgentTable(agents) {
  const lines = [];

  lines.push('| Agent | Description | Model | Category |');
  lines.push('|-------|-------------|-------|----------|');

  for (const agent of agents) {
    const tools = agent.tools.slice(0, 3).join(', ') + (agent.tools.length > 3 ? '...' : '');
    lines.push(`| ${agent.name} | ${agent.description} | ${agent.model} | ${agent.category} |`);
  }

  return lines.join('\n');
}

/**
 * Generate skill list (bulleted list grouped by category)
 * @param {Array} skills - Array of skill metadata
 * @returns {string} Formatted list
 */
function generateSkillList(skills) {
  const lines = [];

  // Group by category
  const categories = {};
  for (const skill of skills) {
    if (!categories[skill.category]) {
      categories[skill.category] = [];
    }
    categories[skill.category].push(skill);
  }

  for (const [category, categorySkills] of Object.entries(categories)) {
    lines.push(`**${category}:**`);
    for (const skill of categorySkills) {
      lines.push(`- **${skill.name}**: ${skill.description}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Inject content between specified AUTOGEN markers
 * @param {string} content - Original file content
 * @param {string} markerName - Name of the marker (e.g., STATS, AGENT_TABLE)
 * @param {string} generated - Generated content to inject
 * @returns {string} Updated file content
 */
function injectContentByMarker(content, markerName, generated) {
  const startMarker = `<!-- AUTOGEN:${markerName}:START -->`;
  const endMarker = `<!-- AUTOGEN:${markerName}:END -->`;

  const startIdx = content.indexOf(startMarker);
  const endIdx = content.indexOf(endMarker);

  if (startIdx === -1 || endIdx === -1) {
    console.warn(`AUTOGEN:${markerName} markers not found - skipping`);
    return content;
  }

  const timestamp = new Date().toISOString().split('T')[0];
  const injectedContent = `${startMarker}\n<!-- Auto-generated on ${timestamp}. Do not edit manually. -->\n\n${generated}\n${endMarker}`;

  return (
    content.substring(0, startIdx) + injectedContent + content.substring(endIdx + endMarker.length)
  );
}

/**
 * Main function
 */
async function main() {
  const cliDir = path.resolve(__dirname, '../..');
  const rootDir = path.resolve(cliDir, '../..');
  const readmeFile = path.join(rootDir, 'README.md');
  const agentsDir = path.join(cliDir, 'src/core/agents');
  const commandsDir = path.join(cliDir, 'src/core/commands');
  const skillsDir = path.join(cliDir, 'src/core/skills');

  // Check if README exists
  if (!fs.existsSync(readmeFile)) {
    console.error(`README not found: ${readmeFile}`);
    process.exit(1);
  }

  // Scan all registries in parallel
  console.log('Scanning commands, agents, and skills...');
  const [commands, agents, skills] = await Promise.all([
    Promise.resolve(scanCommands(commandsDir)),
    Promise.resolve(scanAgents(agentsDir)),
    Promise.resolve(scanSkills(skillsDir)),
  ]);

  console.log(
    `Found: ${commands.length} commands, ${agents.length} agents, ${skills.length} skills`
  );

  // Read README
  let readmeContent = await fsp.readFile(readmeFile, 'utf-8');

  // Generate content
  console.log('Generating stats...');
  const stats = generateStats({
    commands: commands.length,
    agents: agents.length,
    skills: skills.length,
  });

  console.log('Generating agent table...');
  const agentTable = generateAgentTable(agents);

  console.log('Generating skill list...');
  const skillList = generateSkillList(skills);

  // Inject content
  console.log('Injecting content into README.md...');
  readmeContent = injectContentByMarker(readmeContent, 'STATS', stats);
  readmeContent = injectContentByMarker(readmeContent, 'AGENT_TABLE', agentTable);
  readmeContent = injectContentByMarker(readmeContent, 'SKILL_LIST', skillList);

  // Write back
  await fsp.writeFile(readmeFile, readmeContent, 'utf-8');
  console.log('✅ Successfully updated README.md');
}

// Export for use in orchestrator
module.exports = { generateStats, generateAgentTable, generateSkillList, injectContentByMarker };

// Run if called directly
if (require.main === module) {
  main().catch(err => {
    console.error(err);
    process.exit(1);
  });
}
