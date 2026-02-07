#!/usr/bin/env node

/**
 * Help Command Content Injector
 *
 * Injects command list into /agileflow:help command file.
 * Finds AUTOGEN markers and replaces content with generated command directory.
 */

const fs = require('fs');
const fsp = require('fs').promises;
const path = require('path');
const { scanCommands } = require('./command-registry');

/**
 * Generate command list content grouped by category
 * @param {Array} commands - Array of command metadata
 * @returns {string} Formatted command list
 */
function generateCommandList(commands) {
  const lines = [];

  // Group commands by category
  const categories = {};
  for (const cmd of commands) {
    if (!categories[cmd.category]) {
      categories[cmd.category] = [];
    }
    categories[cmd.category].push(cmd);
  }

  // Generate markdown for each category
  for (const [category, cmds] of Object.entries(categories)) {
    lines.push(`**${category}:**`);
    for (const cmd of cmds) {
      const hint = cmd.argumentHint ? ` ${cmd.argumentHint}` : '';
      lines.push(`- \`/agileflow:${cmd.name}${hint}\` - ${cmd.description}`);
    }
    lines.push(''); // Blank line between categories
  }

  return lines.join('\n');
}

/**
 * Inject content between AUTOGEN markers
 * @param {string} content - Original file content
 * @param {string} generated - Generated content to inject
 * @returns {string} Updated file content
 */
function injectContent(content, generated) {
  const startMarker = '<!-- AUTOGEN:COMMAND_LIST:START -->';
  const endMarker = '<!-- AUTOGEN:COMMAND_LIST:END -->';

  const startIdx = content.indexOf(startMarker);
  const endIdx = content.indexOf(endMarker);

  if (startIdx === -1 || endIdx === -1) {
    console.error('AUTOGEN markers not found in file');
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
  const rootDir = path.resolve(__dirname, '../..');
  const helpFile = path.join(rootDir, 'src/core/commands/help.md');
  const commandsDir = path.join(rootDir, 'src/core/commands');

  // Check if help file exists
  if (!fs.existsSync(helpFile)) {
    console.error(`Help file not found: ${helpFile}`);
    process.exit(1);
  }

  // Scan commands
  console.log('Scanning commands...');
  const commands = scanCommands(commandsDir);
  console.log(`Found ${commands.length} commands`);

  // Generate command list
  console.log('Generating command list...');
  const commandList = generateCommandList(commands);

  // Read help file
  const helpContent = await fsp.readFile(helpFile, 'utf-8');

  // Inject content
  console.log('Injecting content into help.md...');
  const updatedContent = injectContent(helpContent, commandList);

  // Write back
  await fsp.writeFile(helpFile, updatedContent, 'utf-8');
  console.log('✅ Successfully updated help.md');
}

// Export for use in orchestrator
module.exports = { generateCommandList, injectContent };

// Run if called directly
if (require.main === module) {
  main().catch(err => {
    console.error(err);
    process.exit(1);
  });
}
