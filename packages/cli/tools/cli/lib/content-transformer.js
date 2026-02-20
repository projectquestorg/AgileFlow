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
    'Task tool': 'workflow chaining',
    'Task agent': 'workflow',
    AskUserQuestion: 'numbered list prompt',
    '.claude/agents/agileflow': '.windsurf/skills/agileflow',
  },
};

/**
 * Tool reference replacements for IDE capability-aware transformation
 * Maps Claude Code tool/pattern names to IDE-appropriate alternatives
 *
 * @private
 */
const TOOL_REFERENCE_REPLACEMENTS = {
  /**
   * Cursor: Has subagents but no structured AskUserQuestion
   * Replaces abstract tool patterns with concrete instructions
   */
  cursor: [
    // AskUserQuestion references
    {
      pattern: /call the AskUserQuestion tool/gi,
      replacement: 'ask the user to reply with their choice (as a numbered list)',
    },
    {
      pattern: /\bAskUserQuestion\b/g,
      replacement: 'numbered list prompt',
    },
    // Task-related references (keep Task, but clarify it's for subagents)
    {
      pattern: /Task\(\s*$/gm,
      replacement: '/* Use Cursor subagents to spawn async work */',
    },
    // Task tracking references (not available in Cursor)
    {
      pattern: /TaskCreate\b/g,
      replacement: '(not available - track progress in conversation)',
    },
    {
      pattern: /TaskUpdate\b/g,
      replacement: '(not available in Cursor)',
    },
    {
      pattern: /TaskList\b/g,
      replacement: '(not available in Cursor)',
    },
  ],

  /**
   * Windsurf: No subagents, suggests workflow chaining instead
   * Uses "megaplan" for plan mode
   */
  windsurf: [
    // AskUserQuestion references
    {
      pattern: /call the AskUserQuestion tool/gi,
      replacement: 'ask the user to reply with their choice (as a numbered list)',
    },
    {
      pattern: /\bAskUserQuestion\b/g,
      replacement: 'numbered list prompt',
    },
    // Task references - suggest workflows instead
    {
      pattern: /\bTask\s*tool\b/gi,
      replacement: 'workflow chaining',
    },
    {
      pattern: /call the Task tool/gi,
      replacement: 'suggest running the relevant /workflow',
    },
    {
      pattern: /Task\(\s*$/gm,
      replacement: '/* Suggest running /agileflow workflow via cascade */',
    },
    // Subagent type references - convert to workflow
    {
      pattern: /subagent_type:\s*"agileflow-([^"]+)"/g,
      replacement: 'workflow: "/agileflow-$1"',
    },
    // Task tracking (not available)
    {
      pattern: /TaskCreate\b/g,
      replacement: '(not available - use conversation comments)',
    },
    {
      pattern: /TaskUpdate\b/g,
      replacement: '(not available)',
    },
    {
      pattern: /TaskList\b/g,
      replacement: '(not available)',
    },
    // Plan mode - use megaplan keyword
    {
      pattern: /EnterPlanMode/g,
      replacement: 'megaplan',
    },
    {
      pattern: /ExitPlanMode/g,
      replacement: '(end megaplan)',
    },
  ],

  /**
   * Codex: Most limited - no plan mode, hooks, or subagents
   * Suggests skills and text-only interaction instead
   */
  codex: [
    // AskUserQuestion references - use text-only function
    {
      pattern: /call the AskUserQuestion tool/gi,
      replacement: 'call ask_user_question (text-only, no menus)',
    },
    {
      pattern: /\bAskUserQuestion\b/g,
      replacement: 'ask_user_question',
    },
    // Task/delegation references - suggest skills instead
    {
      pattern: /\bTask\s*tool\b/gi,
      replacement: 'skill invocation',
    },
    {
      pattern: /call the Task tool/gi,
      replacement: 'invoke the relevant $agileflow skill',
    },
    {
      pattern: /Task\(\s*$/gm,
      replacement: '/* Invoke relevant skill via $agileflow-name */',
    },
    // Subagent type references - convert to skill syntax
    {
      pattern: /subagent_type:\s*"agileflow-([^"]+)"/g,
      replacement: 'skill: "$agileflow-$1"',
    },
    // Task tracking (not available)
    {
      pattern: /TaskCreate\b/g,
      replacement: '(not available in Codex)',
    },
    {
      pattern: /TaskUpdate\b/g,
      replacement: '(not available)',
    },
    {
      pattern: /TaskList\b/g,
      replacement: '(not available)',
    },
    // Plan mode (not available)
    {
      pattern: /EnterPlanMode/g,
      replacement: '(not available - no plan mode in Codex)',
    },
    {
      pattern: /ExitPlanMode/g,
      replacement: '(not available)',
    },
    // Hooks (not available)
    {
      pattern: /PreToolUse\b/g,
      replacement: '(not available - no hooks)',
    },
    {
      pattern: /PostToolUse\b/g,
      replacement: '(not available - no hooks)',
    },
    {
      pattern: /SessionStart\b/g,
      replacement: '(not available - no hooks)',
    },
  ],
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
 * Transform tool references in content based on IDE capabilities.
 * Replaces Claude Code tool names and patterns with IDE-appropriate alternatives.
 *
 * For Claude Code (canonical format), returns content unchanged.
 * For other IDEs, replaces tool references with alternatives based on capabilities:
 * - Cursor: Converts AskUserQuestion to "numbered list prompt", Task stays as subagents
 * - Windsurf: Converts to "megaplan" and workflow suggestions, removes Task references
 * - Codex: Converts to skill invocations, text-only prompts, removes Plan mode
 *
 * @param {string} content - Content with Claude Code tool references
 * @param {string} targetIde - Target IDE name: 'claude-code', 'cursor', 'windsurf', 'codex'
 * @returns {string} Content with IDE-appropriate tool references
 *
 * @example
 * const content = 'Use the AskUserQuestion tool to get user input';
 * const cursor = transformToolReferences(content, 'cursor');
 * // Returns: 'Use numbered list prompt to get user input'
 *
 * @example
 * const content = 'Call the Task tool with subagent_type: "agileflow-test"';
 * const windsurf = transformToolReferences(content, 'windsurf');
 * // Returns: 'Suggest running the relevant /workflow with workflow: "/agileflow-test"'
 */
function transformToolReferences(content, targetIde) {
  // Claude Code is the canonical format - return unchanged
  if (targetIde === 'claude-code') {
    return content;
  }

  if (!content || typeof content !== 'string') {
    return content || '';
  }

  const replacements = TOOL_REFERENCE_REPLACEMENTS[targetIde];
  if (!replacements) {
    // Unknown IDE - return unchanged
    return content;
  }

  // Apply all replacements in order
  return replaceReferences(content, replacements);
}

/**
 * Transform content for a specific IDE target
 *
 * @param {string} content - Source content
 * @param {string} targetIde - Target IDE: 'codex', 'cursor', 'windsurf', 'claude-code'
 * @param {Object} [options] - Additional options
 * @param {string} [options.docsFolder] - Custom docs folder name
 * @param {Object} [options.additionalReplacements] - Extra replacements to apply
 * @param {boolean} [options.transformTools] - Apply tool reference transformations (default: false for backward compatibility)
 * @returns {string} Transformed content
 */
function transformForIde(content, targetIde, options = {}) {
  const { docsFolder, additionalReplacements = {}, transformTools = false } = options;

  // Start with IDE-specific replacements
  const replacements = { ...(IDE_REPLACEMENTS[targetIde] || {}) };

  // Add docs folder replacements if needed
  if (docsFolder && docsFolder !== 'docs') {
    Object.assign(replacements, createDocsReplacements(docsFolder));
  }

  // Add any additional custom replacements
  Object.assign(replacements, additionalReplacements);

  let result = replaceReferences(content, replacements);

  // Apply tool reference transformations if requested
  if (transformTools) {
    result = transformToolReferences(result, targetIde);
  }

  return result;
}

module.exports = {
  replaceReferences,
  stripFrontmatter,
  convertFrontmatter,
  injectContent,
  getFrontmatter,
  escapeRegex,
  IDE_REPLACEMENTS,
  TOOL_REFERENCE_REPLACEMENTS,
  createDocsReplacements,
  transformToolReferences,
  transformForIde,
};
