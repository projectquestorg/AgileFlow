/**
 * ide-generator.js - Build-time IDE-specific prompt/skill/agent generator
 *
 * Integrates IDE capability profiles with content transformer to produce
 * IDE-native commands and agents during the install process.
 *
 * Main entry points:
 * - generateForIde(content, targetIde, options) - Base transformation
 * - generateCommandForIde(content, commandName, targetIde, options) - Command-specific
 * - generateAgentForIde(content, agentName, targetIde, options) - Agent-specific
 */

const {
  transformForIde,
  transformToolReferences,
  replaceReferences,
  stripFrontmatter,
  getFrontmatter,
  convertFrontmatter,
} = require('./content-transformer');

// Lazy-load profile loader - only if profiles are needed
let profileLoader = null;

function getProfileLoader() {
  if (!profileLoader) {
    try {
      profileLoader = require('../../../src/core/profiles/loader');
    } catch (e) {
      // Profiles not available - return null to indicate fallback mode
      return null;
    }
  }
  return profileLoader;
}

/**
 * Get the IDE prefix style for commands
 * Claude Code uses "/agileflow:", others use "/" or "$" as prefix
 * @param {string} targetIde - Target IDE: 'claude-code', 'cursor', 'windsurf', 'codex'
 * @returns {string} Command prefix pattern
 * @private
 */
function getCommandPrefix(targetIde) {
  const prefixes = {
    'claude-code': '/agileflow:',
    cursor: '/',
    windsurf: '/',
    codex: '$agileflow-',
  };
  return prefixes[targetIde] || '/agileflow:';
}

/**
 * Convert /agileflow:style:commands to IDE-specific format
 * - Claude Code: /agileflow:foo:bar → /agileflow:foo:bar (unchanged)
 * - Cursor: /agileflow:foo:bar → /foo-bar
 * - Windsurf: /agileflow:foo:bar → /agileflow-foo-bar
 * - Codex: /agileflow:foo:bar → $agileflow-foo-bar
 *
 * @param {string} content - Content with command references
 * @param {string} targetIde - Target IDE
 * @returns {string} Content with converted command prefixes
 * @private
 */
function convertCommandPrefixes(content, targetIde) {
  if (targetIde === 'claude-code') {
    return content; // No conversion needed
  }

  let result = content;

  if (targetIde === 'cursor') {
    // /agileflow:foo:bar → /foo-bar
    result = result.replace(/\/agileflow:([a-zA-Z0-9:_-]+)/g, (_match, rest) => {
      return '/' + rest.replace(/:/g, '-');
    });
  } else if (targetIde === 'windsurf') {
    // /agileflow:foo:bar → /agileflow-foo-bar
    result = result.replace(/\/agileflow:([a-zA-Z0-9:_-]+)/g, (_match, rest) => {
      return '/agileflow-' + rest.replace(/:/g, '-');
    });
  } else if (targetIde === 'codex') {
    // /agileflow:foo:bar → $agileflow-foo-bar
    result = result.replace(/\/agileflow:([a-zA-Z0-9:_-]+)/g, (_match, rest) => {
      return '$agileflow-' + rest.replace(/:/g, '-');
    });
  }

  return result;
}

/**
 * Main entry point for IDE-specific content generation
 * Takes canonical Claude Code markdown content and transforms it for a target IDE
 *
 * @param {string} content - Source content (Claude Code format)
 * @param {string} targetIde - Target IDE: 'claude-code', 'cursor', 'windsurf', 'codex'
 * @param {Object} [options] - Generation options
 * @param {string} [options.docsFolder] - Custom docs folder name
 * @param {boolean} [options.transformTools] - Apply tool reference transformations (default: true)
 * @param {boolean} [options.transformPrefixes] - Convert command prefixes (default: true)
 * @param {Object} [options.additionalReplacements] - Extra IDE-specific replacements
 * @returns {string} Transformed content for target IDE
 *
 * @example
 * const content = await fs.readFile('command.md', 'utf8');
 * const cursorVersion = generateForIde(content, 'cursor', { transformTools: true });
 */
function generateForIde(content, targetIde, options = {}) {
  // Claude Code is canonical format - return as-is
  if (targetIde === 'claude-code') {
    return content;
  }

  if (!content || typeof content !== 'string') {
    return content || '';
  }

  const {
    docsFolder,
    transformTools = true,
    transformPrefixes = true,
    additionalReplacements = {},
  } = options;

  // Step 1: Apply IDE-specific replacements and docs folder updates
  let result = transformForIde(content, targetIde, {
    docsFolder,
    additionalReplacements,
    transformTools: false, // Will apply separately
  });

  // Step 2: Apply tool reference transformations if requested
  if (transformTools) {
    result = transformToolReferences(result, targetIde);
  }

  // Step 3: Convert command prefixes if requested
  if (transformPrefixes) {
    result = convertCommandPrefixes(result, targetIde);
  }

  return result;
}

/**
 * Generate IDE-specific command content with IDE-native wrapping
 *
 * For Codex, adds {{input}} placeholder at end for context injection.
 * For other IDEs, uses base generateForIde() transformation.
 *
 * @param {string} content - Source command content (Claude Code format)
 * @param {string} commandName - Command name for display
 * @param {string} targetIde - Target IDE
 * @param {Object} [options] - Generation options (same as generateForIde)
 * @returns {string} IDE-native command content
 *
 * @example
 * const cmd = await fs.readFile('commands/deploy.md', 'utf8');
 * const codexPrompt = generateCommandForIde(cmd, 'deploy', 'codex');
 */
function generateCommandForIde(content, commandName, targetIde, options = {}) {
  // Handle null/undefined content
  if (content === null || content === undefined || typeof content !== 'string') {
    return '';
  }

  // Start with base transformation
  let result = generateForIde(content, targetIde, options);

  // Codex-specific wrapping: Add {{input}} placeholder
  if (targetIde === 'codex' && result !== '') {
    // Strip frontmatter for Codex format
    const bodyContent = stripFrontmatter(result);
    const frontmatter = getFrontmatter(content);
    const description = frontmatter.description || `AgileFlow ${commandName} command`;

    const header = `# AgileFlow: ${commandName}

> ${description}

## Instructions

`;

    const footer = `

## Context

{{input}}
`;

    result = header + bodyContent + footer;
  }

  return result;
}

/**
 * Generate IDE-specific agent/skill content
 *
 * Performs IDE-specific transformations including:
 * - For Codex: Converts to SKILL.md format with skill-specific frontmatter
 * - For Windsurf: Converts to agentskills.io format with skill-specific frontmatter
 * - For Cursor: Adds agent-specific frontmatter for spawnable agents
 * - For Claude Code: Returns unchanged (canonical format)
 *
 * @param {string} content - Source agent content (Claude Code format)
 * @param {string} agentName - Agent name (e.g., 'database', 'security')
 * @param {string} targetIde - Target IDE: 'claude-code', 'cursor', 'windsurf', 'codex'
 * @param {Object} [options] - Generation options
 * @param {string} [options.docsFolder] - Custom docs folder name
 * @param {boolean} [options.transformTools] - Apply tool reference transformations (default: true)
 * @returns {string} IDE-native agent/skill content
 *
 * @example
 * const agent = await fs.readFile('agents/security.md', 'utf8');
 * const windsurfSkill = generateAgentForIde(agent, 'security', 'windsurf');
 */
function generateAgentForIde(content, agentName, targetIde, options = {}) {
  if (!content || typeof content !== 'string') {
    return content || '';
  }

  // Claude Code is canonical format
  if (targetIde === 'claude-code') {
    return content;
  }

  const { docsFolder, transformTools = true } = options;

  // Get base transformations
  const baseContent = generateForIde(content, targetIde, {
    docsFolder,
    transformTools,
    transformPrefixes: false, // Don't convert prefixes in agent bodies
  });

  // Extract frontmatter and body
  const frontmatter = getFrontmatter(content);
  const description = frontmatter.description || `AgileFlow ${agentName} agent`;

  // Apply IDE-specific formatting
  if (targetIde === 'codex') {
    return formatAgentForCodex(baseContent, agentName, description);
  } else if (targetIde === 'windsurf') {
    return formatAgentForWindsurf(baseContent, agentName, description);
  } else if (targetIde === 'cursor') {
    return formatAgentForCursor(baseContent, agentName, description);
  }

  return baseContent;
}

/**
 * Format agent content for Codex SKILL.md format
 * @private
 */
function formatAgentForCodex(content, agentName, description) {
  const yaml = require('../../../lib/yaml-utils').yaml;

  const bodyContent = stripFrontmatter(content);

  // Create SKILL.md with YAML frontmatter
  const skillFrontmatter = yaml
    .dump({
      name: `agileflow-${agentName}`,
      description: description,
      version: '1.0.0',
    })
    .trim();

  const codexHeader = `# AgileFlow: ${agentName.charAt(0).toUpperCase() + agentName.slice(1)} Agent

> Invoke with \`$agileflow-${agentName}\` or via \`/skills\`

`;

  return `---
${skillFrontmatter}
---

${codexHeader}${bodyContent}`;
}

/**
 * Format agent content for Windsurf SKILL.md (agentskills.io spec)
 * @private
 */
function formatAgentForWindsurf(content, agentName, description) {
  const yaml = require('../../../lib/yaml-utils').yaml;

  const bodyContent = stripFrontmatter(content);

  // Create SKILL.md with YAML frontmatter (agentskills.io spec)
  const skillFrontmatter = yaml
    .dump({
      name: `agileflow-${agentName}`,
      description: description,
    })
    .trim();

  const windsurfHeader = `# AgileFlow: ${agentName.charAt(0).toUpperCase() + agentName.slice(1)} Skill

> Use this skill via \`@agileflow-${agentName}\` or /cascade

`;

  return `---
${skillFrontmatter}
---

${windsurfHeader}${bodyContent}`;
}

/**
 * Format agent content for Cursor spawnable agent
 * Cursor agents use YAML frontmatter with name, description, and model fields
 * @private
 */
function formatAgentForCursor(content, agentName, description) {
  const yaml = require('../../../lib/yaml-utils').yaml;

  // Extract frontmatter from source
  const sourceFrontmatter = getFrontmatter(content);
  const bodyContent = stripFrontmatter(content);

  // Create agent frontmatter for Cursor
  const agentFrontmatter = yaml
    .dump({
      name: `agileflow-${agentName}`,
      description: description,
      model: sourceFrontmatter.model || 'claude-3-5-sonnet',
      readonly: false,
    })
    .trim();

  return `---
${agentFrontmatter}
---

${bodyContent}`;
}

module.exports = {
  generateForIde,
  generateCommandForIde,
  generateAgentForIde,
  getCommandPrefix,
  // Export private functions for testing
  _convertCommandPrefixes: convertCommandPrefixes,
  _getProfileLoader: getProfileLoader,
  _formatAgentForCodex: formatAgentForCodex,
  _formatAgentForWindsurf: formatAgentForWindsurf,
  _formatAgentForCursor: formatAgentForCursor,
};
