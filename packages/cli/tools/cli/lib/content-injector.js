/**
 * Content Injector - Dynamic content injection for AgileFlow files
 *
 * Supports template variables that get replaced at install time:
 *
 * COUNTS:
 *   {{COMMAND_COUNT}}  - Total number of commands
 *   {{AGENT_COUNT}}    - Total number of agents
 *   {{SKILL_COUNT}}    - Total number of skills
 *
 * LISTS:
 *   <!-- {{AGENT_LIST}} -->   - Full formatted agent list
 *   <!-- {{COMMAND_LIST}} --> - Full formatted command list
 *
 * METADATA:
 *   {{VERSION}}        - AgileFlow version from package.json
 *   {{INSTALL_DATE}}   - Date of installation (YYYY-MM-DD)
 *
 * FOLDER REFERENCES:
 *   {agileflow_folder} - Name of the agileflow folder (e.g., .agileflow)
 *   {project-root}     - Project root reference
 */

const fs = require('fs');
const path = require('path');

// Use shared modules
const { parseFrontmatter, normalizeTools } = require('../../../scripts/lib/frontmatter-parser');
const { validatePath } = require('../../../lib/validate');
const {
  countCommands,
  countAgents,
  countSkills,
  getCounts,
} = require('../../../scripts/lib/counter');

// =============================================================================
// List Generation Functions
// =============================================================================

/**
 * Validate that a file path is within the expected directory.
 * Prevents reading files outside the expected scope.
 * @param {string} filePath - File path to validate
 * @param {string} baseDir - Expected base directory
 * @returns {boolean} True if path is safe
 */
function isPathSafe(filePath, baseDir) {
  const result = validatePath(filePath, baseDir, { allowSymlinks: true });
  return result.ok;
}

/**
 * Scan agents directory and generate formatted agent list
 * @param {string} agentsDir - Path to agents directory
 * @returns {string} Formatted agent list
 */
function generateAgentList(agentsDir) {
  if (!fs.existsSync(agentsDir)) return '';

  const files = fs.readdirSync(agentsDir).filter(f => f.endsWith('.md'));
  const agents = [];

  for (const file of files) {
    const filePath = path.join(agentsDir, file);

    // Validate path before reading to prevent traversal via symlinks or malicious names
    if (!isPathSafe(filePath, agentsDir)) {
      continue;
    }

    const content = fs.readFileSync(filePath, 'utf8');
    const frontmatter = parseFrontmatter(content);

    if (!frontmatter || Object.keys(frontmatter).length === 0) {
      continue;
    }

    agents.push({
      name: frontmatter.name || path.basename(file, '.md'),
      description: frontmatter.description || '',
      tools: normalizeTools(frontmatter.tools),
      model: frontmatter.model || 'haiku',
    });
  }

  agents.sort((a, b) => a.name.localeCompare(b.name));

  let output = `**AVAILABLE AGENTS (${agents.length} total)**:\n\n`;

  agents.forEach((agent, index) => {
    output += `${index + 1}. **${agent.name}** (model: ${agent.model})\n`;
    output += `   - **Purpose**: ${agent.description}\n`;
    output += `   - **Tools**: ${agent.tools.join(', ')}\n`;
    output += `   - **Usage**: \`subagent_type: "agileflow-${agent.name}"\`\n`;
    output += `\n`;
  });

  return output;
}

/**
 * Scan commands directory and generate formatted command list
 * @param {string} commandsDir - Path to commands directory
 * @returns {string} Formatted command list
 */
function generateCommandList(commandsDir) {
  if (!fs.existsSync(commandsDir)) return '';

  const commands = [];

  // Scan main commands
  const mainFiles = fs.readdirSync(commandsDir).filter(f => f.endsWith('.md'));
  for (const file of mainFiles) {
    const filePath = path.join(commandsDir, file);

    // Validate path before reading
    if (!isPathSafe(filePath, commandsDir)) {
      continue;
    }

    const content = fs.readFileSync(filePath, 'utf8');
    const frontmatter = parseFrontmatter(content);
    const cmdName = path.basename(file, '.md');

    if (!frontmatter || Object.keys(frontmatter).length === 0) {
      continue;
    }

    commands.push({
      name: cmdName,
      description: frontmatter.description || '',
      argumentHint: frontmatter['argument-hint'] || '',
    });
  }

  // Scan subdirectories (e.g., session/)
  const entries = fs.readdirSync(commandsDir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      const subDir = path.join(commandsDir, entry.name);

      // Validate subdirectory path
      if (!isPathSafe(subDir, commandsDir)) {
        continue;
      }

      const subFiles = fs.readdirSync(subDir).filter(f => f.endsWith('.md'));

      for (const file of subFiles) {
        const filePath = path.join(subDir, file);

        // Validate file path within subdirectory
        if (!isPathSafe(filePath, commandsDir)) {
          continue;
        }

        const content = fs.readFileSync(filePath, 'utf8');
        const frontmatter = parseFrontmatter(content);
        const cmdName = `${entry.name}:${path.basename(file, '.md')}`;

        if (!frontmatter || Object.keys(frontmatter).length === 0) {
          continue;
        }

        commands.push({
          name: cmdName,
          description: frontmatter.description || '',
          argumentHint: frontmatter['argument-hint'] || '',
        });
      }
    }
  }

  commands.sort((a, b) => a.name.localeCompare(b.name));

  let output = `Available commands (${commands.length} total):\n`;

  commands.forEach(cmd => {
    const argHint = cmd.argumentHint ? ` ${cmd.argumentHint}` : '';
    output += `- \`/agileflow:${cmd.name}${argHint}\` - ${cmd.description}\n`;
  });

  return output;
}

// =============================================================================
// Main Injection Function
// =============================================================================

/**
 * Inject all template variables into content
 * @param {string} content - Template content with placeholders
 * @param {Object} context - Context for replacements
 * @param {string} context.coreDir - Path to core directory (commands/, agents/, skills/)
 * @param {string} context.agileflowFolder - AgileFlow folder name
 * @param {string} context.version - AgileFlow version
 * @returns {string} Content with all placeholders replaced
 */
function injectContent(content, context = {}) {
  const { coreDir, agileflowFolder = '.agileflow', version = 'unknown' } = context;

  let result = content;

  // Get counts if core directory is available
  let counts = { commands: 0, agents: 0, skills: 0 };
  if (coreDir && fs.existsSync(coreDir)) {
    counts = getCounts(coreDir);
  }

  // Replace count placeholders (both formats: {{X}} and <!-- {{X}} -->)
  result = result.replace(/\{\{COMMAND_COUNT\}\}/g, String(counts.commands));
  result = result.replace(/\{\{AGENT_COUNT\}\}/g, String(counts.agents));
  result = result.replace(/\{\{SKILL_COUNT\}\}/g, String(counts.skills));

  // Replace metadata placeholders
  result = result.replace(/\{\{VERSION\}\}/g, version);
  result = result.replace(/\{\{INSTALL_DATE\}\}/g, new Date().toISOString().split('T')[0]);

  // Replace list placeholders (only if core directory available)
  if (coreDir && fs.existsSync(coreDir)) {
    if (result.includes('{{AGENT_LIST}}')) {
      const agentList = generateAgentList(path.join(coreDir, 'agents'));
      result = result.replace(/<!-- \{\{AGENT_LIST\}\} -->/g, agentList);
      result = result.replace(/\{\{AGENT_LIST\}\}/g, agentList);
    }

    if (result.includes('{{COMMAND_LIST}}')) {
      const commandList = generateCommandList(path.join(coreDir, 'commands'));
      result = result.replace(/<!-- \{\{COMMAND_LIST\}\} -->/g, commandList);
      result = result.replace(/\{\{COMMAND_LIST\}\}/g, commandList);
    }
  }

  // Replace folder placeholders
  result = result.replace(/\{agileflow_folder\}/g, agileflowFolder);
  result = result.replace(/\{project-root\}/g, '{project-root}'); // Keep as-is for runtime

  return result;
}

// =============================================================================
// Section Processing Functions (Progressive Disclosure)
// =============================================================================

/**
 * Extract section names from content
 * @param {string} content - Content with section markers
 * @returns {string[]} Array of section names
 */
function extractSectionNames(content) {
  const sectionPattern = /<!-- SECTION: (\w+[-\w]*) -->/g;
  const sections = [];
  let match;
  while ((match = sectionPattern.exec(content)) !== null) {
    sections.push(match[1]);
  }
  return sections;
}

/**
 * Filter content to only include specified sections
 * Sections are marked with: <!-- SECTION: name --> ... <!-- END_SECTION -->
 *
 * @param {string} content - Content with section markers
 * @param {string[]} activeSections - Sections to include (empty = include all)
 * @returns {string} Content with only active sections
 */
function filterSections(content, activeSections = []) {
  // If no active sections specified, include all content
  if (!activeSections || activeSections.length === 0) {
    return content;
  }

  // Pattern matches: <!-- SECTION: name --> content <!-- END_SECTION -->
  const sectionPattern = /<!-- SECTION: (\w+[-\w]*) -->([\s\S]*?)<!-- END_SECTION -->/g;

  return content.replace(sectionPattern, (match, sectionName, sectionContent) => {
    if (activeSections.includes(sectionName)) {
      // Keep the section content, remove the markers
      return sectionContent;
    }
    // Remove the entire section
    return '';
  });
}

/**
 * Remove all section markers but keep content
 * Used when no filtering is needed but markers should be cleaned
 *
 * @param {string} content - Content with section markers
 * @returns {string} Content without section markers
 */
function stripSectionMarkers(content) {
  // Remove section start markers
  let result = content.replace(/<!-- SECTION: \w+[-\w]* -->\n?/g, '');
  // Remove section end markers
  result = result.replace(/<!-- END_SECTION -->\n?/g, '');
  return result;
}

/**
 * Check if content has section markers
 * @param {string} content - Content to check
 * @returns {boolean} True if content has sections
 */
function hasSections(content) {
  return /<!-- SECTION: \w+[-\w]* -->/.test(content);
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Check if content has any template variables
 * @param {string} content - Content to check
 * @returns {boolean} True if content has placeholders
 */
function hasPlaceholders(content) {
  const patterns = [
    /\{\{COMMAND_COUNT\}\}/,
    /\{\{AGENT_COUNT\}\}/,
    /\{\{SKILL_COUNT\}\}/,
    /\{\{VERSION\}\}/,
    /\{\{INSTALL_DATE\}\}/,
    /\{\{AGENT_LIST\}\}/,
    /\{\{COMMAND_LIST\}\}/,
    /\{agileflow_folder\}/,
  ];

  return patterns.some(pattern => pattern.test(content));
}

/**
 * List all supported placeholders
 * @returns {Object} Placeholder documentation
 */
function getPlaceholderDocs() {
  return {
    counts: {
      '{{COMMAND_COUNT}}': 'Total number of slash commands',
      '{{AGENT_COUNT}}': 'Total number of specialized agents',
      '{{SKILL_COUNT}}': 'Total number of skills',
    },
    lists: {
      '<!-- {{AGENT_LIST}} -->': 'Full formatted agent list with details',
      '<!-- {{COMMAND_LIST}} -->': 'Full formatted command list',
    },
    metadata: {
      '{{VERSION}}': 'AgileFlow version from package.json',
      '{{INSTALL_DATE}}': 'Installation date (YYYY-MM-DD)',
    },
    folders: {
      '{agileflow_folder}': 'Name of the AgileFlow folder',
      '{project-root}': 'Project root reference (kept as-is)',
    },
  };
}

module.exports = {
  // Count functions
  countCommands,
  countAgents,
  countSkills,
  getCounts,

  // List generation
  generateAgentList,
  generateCommandList,

  // Main injection
  injectContent,
  hasPlaceholders,
  getPlaceholderDocs,

  // Section processing (progressive disclosure)
  extractSectionNames,
  filterSections,
  stripSectionMarkers,
  hasSections,
};
