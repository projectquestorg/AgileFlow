/**
 * content-transformer.js - Reusable content transformation utilities
 *
 * Extracts common content transformation patterns from IDE installers:
 * - replaceReferences: Generic string replacement with pattern support
 * - stripFrontmatter: Remove YAML frontmatter from content
 * - convertFrontmatter: Transform frontmatter keys/values between formats
 * - injectContent: Delegate to existing content-injector
 *
 * Created as part of US-0177: Extract content transformation into reusable helper module
 */

const { parseFrontmatter, extractBody } = require('../../../scripts/lib/frontmatter-parser');

/**
 * Replace multiple string patterns in content
 *
 * @param {string} content - The content to transform
 * @param {Object|Array} replacements - Either an object of {pattern: replacement} pairs,
 *                                      or an array of {pattern, replacement, flags} objects
 * @returns {string} Content with all replacements applied
 *
 * @example
 * // Object form (simple string replacement)
 * replaceReferences(content, {
 *   'Claude Code': 'OpenAI Codex',
 *   '.claude/': '.codex/',
 *   'CLAUDE.md': 'AGENTS.md'
 * });
 *
 * @example
 * // Array form (with regex flags)
 * replaceReferences(content, [
 *   { pattern: 'Claude Code', replacement: 'OpenAI Codex', flags: 'gi' },
 *   { pattern: /\.claude\//g, replacement: '.codex/' }
 * ]);
 */
function replaceReferences(content, replacements) {
  if (!content || typeof content !== 'string') {
    return content || '';
  }

  let result = content;

  if (Array.isArray(replacements)) {
    // Array form: [{pattern, replacement, flags?}]
    for (const item of replacements) {
      if (!item || !item.pattern) continue;

      let regex;
      if (item.pattern instanceof RegExp) {
        regex = item.pattern;
      } else {
        const flags = item.flags || 'g';
        regex = new RegExp(escapeRegex(item.pattern), flags);
      }
      result = result.replace(regex, item.replacement || '');
    }
  } else if (typeof replacements === 'object' && replacements !== null) {
    // Object form: {pattern: replacement}
    for (const [pattern, replacement] of Object.entries(replacements)) {
      result = result.replace(new RegExp(escapeRegex(pattern), 'g'), replacement);
    }
  }

  return result;
}

/**
 * Escape special regex characters in a string
 * @param {string} str - String to escape
 * @returns {string} Escaped string safe for use in RegExp
 */
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Remove YAML frontmatter from content, returning only the body
 *
 * @param {string} content - Content with optional YAML frontmatter
 * @returns {string} Content body without frontmatter
 *
 * @example
 * const body = stripFrontmatter(`---
 * title: My Document
 * ---
 *
 * # Heading
 * Content here`);
 * // Returns: "# Heading\nContent here"
 */
function stripFrontmatter(content) {
  return extractBody(content);
}

/**
 * Convert frontmatter between formats using a mapping configuration
 *
 * @param {Object} frontmatter - Parsed frontmatter object
 * @param {Object} config - Conversion configuration
 * @param {Object} [config.keyMap] - Map of source keys to target keys
 * @param {Object} [config.valueMap] - Map of key names to value transformation functions
 * @param {Array} [config.include] - Only include these keys (whitelist)
 * @param {Array} [config.exclude] - Exclude these keys (blacklist)
 * @param {Object} [config.defaults] - Default values to add if not present
 * @returns {Object} Transformed frontmatter object
 *
 * @example
 * const converted = convertFrontmatter(
 *   { name: 'security', description: 'Security agent', tools: ['Read', 'Write'] },
 *   {
 *     keyMap: { name: 'skill_name', tools: 'allowed_tools' },
 *     valueMap: { description: (v) => v.replace('agent', 'skill') },
 *     exclude: ['internal_only'],
 *     defaults: { version: '1.0' }
 *   }
 * );
 */
function convertFrontmatter(frontmatter, config = {}) {
  if (!frontmatter || typeof frontmatter !== 'object') {
    return {};
  }

  const { keyMap = {}, valueMap = {}, include, exclude = [], defaults = {} } = config;

  const result = { ...defaults };

  for (const [key, value] of Object.entries(frontmatter)) {
    // Skip excluded keys
    if (exclude.includes(key)) continue;

    // Skip if not in include list (when include is specified)
    if (include && !include.includes(key)) continue;

    // Map key name if mapping exists
    const targetKey = keyMap[key] || key;

    // Transform value if transformation exists
    const targetValue = valueMap[key] ? valueMap[key](value) : value;

    result[targetKey] = targetValue;
  }

  return result;
}

/**
 * Inject dynamic content into a template using content-injector
 *
 * @param {string} content - Content with placeholders
 * @param {Object} options - Injection options
 * @param {string} options.coreDir - Path to AgileFlow core directory
 * @param {string} [options.agileflowFolder] - Target AgileFlow folder name (default: '.agileflow')
 * @param {string} [options.version] - Version string to inject
 * @returns {string} Content with placeholders replaced
 */
function injectContent(content, options) {
  const { injectContent: inject } = require('./content-injector');
  return inject(content, options);
}

/**
 * Parse frontmatter from content
 * Re-exported from frontmatter-parser for convenience
 *
 * @param {string} content - Content with YAML frontmatter
 * @returns {Object} Parsed frontmatter as object
 */
function getFrontmatter(content) {
  return parseFrontmatter(content);
}

/**
 * Common replacement patterns for IDE conversions
 */
const IDE_REPLACEMENTS = {
  /**
   * Claude Code to OpenAI Codex conversions
   */
  codex: {
    'Claude Code': 'OpenAI Codex',
    'claude code': 'OpenAI Codex',
    CLAUDE_CODE: 'CODEX_CLI',
    'CLAUDE.md': 'AGENTS.md',
    '.claude/': '.codex/',
    '.claude\\': '.codex\\',
    'Task tool': 'skill invocation',
    'Task agent': 'skill invocation',
  },

  /**
   * Claude Code to Cursor conversions
   */
  cursor: {
    'Claude Code': 'Cursor',
    'claude code': 'Cursor',
    '.claude/': '.cursor/',
    '.claude\\': '.cursor\\',
    '.claude/agents/agileflow': '.cursor/agents/AgileFlow',
    'Task tool': 'subagent spawning',
    'Task agent': 'subagent',
    AskUserQuestion: 'numbered list prompt',
  },

  /**
   * Claude Code to Windsurf conversions
   */
  windsurf: {
    'Claude Code': 'Windsurf',
    'claude code': 'Windsurf',
    '.claude/': '.windsurf/',
    '.claude\\': '.windsurf\\',
  },
};

/**
 * Create docs folder reference replacements
 *
 * @param {string} targetFolder - Target docs folder name (e.g., 'project-docs')
 * @returns {Object} Replacement patterns for docs references
 */
function createDocsReplacements(targetFolder) {
  if (targetFolder === 'docs') {
    return {}; // No changes needed
  }

  return {
    'docs/': `${targetFolder}/`,
    '`docs/': `\`${targetFolder}/`,
    '"docs/': `"${targetFolder}/`,
    "'docs/": `'${targetFolder}/`,
    '(docs/': `(${targetFolder}/`,
    '[docs/': `[${targetFolder}/`,
  };
}

/**
 * Transform content for a specific IDE target
 *
 * @param {string} content - Source content
 * @param {string} targetIde - Target IDE: 'codex', 'cursor', 'windsurf'
 * @param {Object} [options] - Additional options
 * @param {string} [options.docsFolder] - Custom docs folder name
 * @param {Object} [options.additionalReplacements] - Extra replacements to apply
 * @returns {string} Transformed content
 */
function transformForIde(content, targetIde, options = {}) {
  const { docsFolder, additionalReplacements = {} } = options;

  // Start with IDE-specific replacements
  const replacements = { ...(IDE_REPLACEMENTS[targetIde] || {}) };

  // Add docs folder replacements if needed
  if (docsFolder && docsFolder !== 'docs') {
    Object.assign(replacements, createDocsReplacements(docsFolder));
  }

  // Add any additional custom replacements
  Object.assign(replacements, additionalReplacements);

  return replaceReferences(content, replacements);
}

module.exports = {
  replaceReferences,
  stripFrontmatter,
  convertFrontmatter,
  injectContent,
  getFrontmatter,
  escapeRegex,
  IDE_REPLACEMENTS,
  createDocsReplacements,
  transformForIde,
};
