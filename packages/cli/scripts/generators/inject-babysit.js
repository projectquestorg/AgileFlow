#!/usr/bin/env node

/**
 * Babysit Command Content Injector
 *
 * Injects agent list and command references into /agileflow:babysit command file.
 * Handles multiple AUTOGEN sections.
 */

const fs = require('fs');
const fsp = require('fs').promises;
const path = require('path');
const { scanAgents } = require('./agent-registry');
const { scanCommands } = require('./command-registry');

/**
 * Generate agent list content as category summary with counts.
 * Uses compact format with discovery pointer instead of listing every agent name.
 * Research (arXiv:2602.11988): Full lists increase context cost without improving performance.
 * @param {Array} agents - Array of agent metadata
 * @returns {string} Formatted agent category summary
 */
function generateAgentList(agents) {
  const lines = [];

  lines.push(`**AVAILABLE AGENTS** (${agents.length} total):`);
  lines.push('');

  // Group agents by category for compact output (counts only, not full names)
  const categories = {};
  for (const agent of agents) {
    const cat = agent.category || 'Other';
    if (!categories[cat]) categories[cat] = { count: 0, examples: [] };
    categories[cat].count++;
    // Keep first 3 names as examples
    if (categories[cat].examples.length < 3) {
      categories[cat].examples.push(agent.name);
    }
  }

  for (const [category, data] of Object.entries(categories)) {
    const examples = data.examples.join(', ');
    const more = data.count > 3 ? `, +${data.count - 3} more` : '';
    lines.push(`**${category}** (${data.count}): ${examples}${more}`);
  }

  lines.push('');
  lines.push('Browse all: `ls .agileflow/agents/` or run `/agileflow:help agents`');

  return lines.join('\n');
}

/**
 * Generate command reference list (compact format for babysit)
 * @param {Array} commands - Array of command metadata
 * @returns {string} Formatted command list
 */
function generateCommandReference(commands) {
  const lines = [];

  // Group by category
  const categories = {};
  for (const cmd of commands) {
    if (!categories[cmd.category]) {
      categories[cmd.category] = [];
    }
    categories[cmd.category].push(cmd);
  }

  for (const [category, cmds] of Object.entries(categories)) {
    const cmdNames = cmds.map(c => c.name).join(', ');
    lines.push(`- **${category}**: ${cmdNames}`);
  }

  return lines.join('\n');
}

/**
 * Inject content between specified AUTOGEN markers
 * @param {string} content - Original file content
 * @param {string} markerName - Name of the marker (e.g., AGENT_LIST, COMMAND_REF)
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
 * Add AUTOGEN markers to babysit file if they don't exist
 * @param {string} content - Original file content
 * @returns {string} Updated content with markers
 */
function addMarkersIfMissing(content) {
  let updated = content;

  // Add AGENT_LIST markers around the agent list section
  if (!content.includes('<!-- AUTOGEN:AGENT_LIST:START -->')) {
    // Find "**AVAILABLE AGENTS**" and wrap it
    const agentSectionStart = content.indexOf('**AVAILABLE AGENTS**');
    if (agentSectionStart !== -1) {
      // Find the end of the agent list (before "**WHEN TO SPAWN AGENTS**")
      const agentSectionEnd = content.indexOf('**WHEN TO SPAWN AGENTS**', agentSectionStart);
      if (agentSectionEnd !== -1) {
        const before = content.substring(0, agentSectionStart);
        const agentSection = content.substring(agentSectionStart, agentSectionEnd);
        const after = content.substring(agentSectionEnd);

        updated = `${before}<!-- AUTOGEN:AGENT_LIST:START -->\n${agentSection}<!-- AUTOGEN:AGENT_LIST:END -->\n\n${after}`;
        console.log('✅ Added AGENT_LIST markers to babysit.md');
      }
    }
  }

  return updated;
}

/**
 * Main function
 */
async function main() {
  const rootDir = path.resolve(__dirname, '../..');
  const babysitFile = path.join(rootDir, 'src/core/commands/babysit.md');
  const agentsDir = path.join(rootDir, 'src/core/agents');
  const commandsDir = path.join(rootDir, 'src/core/commands');

  // Check if babysit file exists
  if (!fs.existsSync(babysitFile)) {
    console.error(`Babysit file not found: ${babysitFile}`);
    process.exit(1);
  }

  // Scan agents and commands
  console.log('Scanning agents...');
  const agents = scanAgents(agentsDir);
  console.log(`Found ${agents.length} agents`);

  console.log('Scanning commands...');
  const commands = scanCommands(commandsDir);
  console.log(`Found ${commands.length} commands`);

  // Read babysit file
  let babysitContent = await fsp.readFile(babysitFile, 'utf-8');

  // Add markers if missing
  babysitContent = addMarkersIfMissing(babysitContent);

  // Generate content
  console.log('Generating agent list...');
  const agentList = generateAgentList(agents);

  // Inject content
  console.log('Injecting content into babysit.md...');
  babysitContent = injectContentByMarker(babysitContent, 'AGENT_LIST', agentList);

  // Write back
  await fsp.writeFile(babysitFile, babysitContent, 'utf-8');
  console.log('✅ Successfully updated babysit.md');
}

// Export for use in orchestrator
module.exports = {
  generateAgentList,
  generateCommandReference,
  injectContentByMarker,
  addMarkersIfMissing,
};

// Run if called directly
if (require.main === module) {
  main().catch(err => {
    console.error(err);
    process.exit(1);
  });
}
