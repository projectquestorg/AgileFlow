/**
 * content-sanitizer.js - Content Security for Dynamic Injection
 *
 * Provides sanitization for dynamic content that gets injected into
 * files during installation. Prevents injection attacks through
 * malicious placeholder values.
 *
 * Security Model:
 * - All dynamic values are validated against expected patterns
 * - Special characters are escaped for Markdown and shell contexts
 * - Agent/command names are restricted to safe character sets
 *
 * Usage:
 *   const { sanitize, validatePlaceholderValue } = require('./content-sanitizer');
 *
 *   // Sanitize agent name for markdown
 *   const safeName = sanitize.name(agentName);
 *
 *   // Validate count values
 *   const safeCount = sanitize.count(count);
 */

/**
 * Patterns for validating dynamic content
 */
const PATTERNS = {
  // Agent/command names: alphanumeric, hyphens, underscores
  name: /^[a-zA-Z][a-zA-Z0-9_-]*$/,

  // Description: printable ASCII, no control chars or dangerous sequences
  description: /^[\x20-\x7E\u00A0-\uFFFF]*$/,

  // Count: non-negative integer
  count: /^\d+$/,

  // Version: semver-like pattern
  version: /^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.]+)?$/,

  // Date: ISO date format
  date: /^\d{4}-\d{2}-\d{2}$/,

  // Folder name: alphanumeric, dots, hyphens, underscores
  folderName: /^[a-zA-Z0-9._-]+$/,

  // Tool name: alphanumeric with some special chars
  toolName: /^[a-zA-Z][a-zA-Z0-9_*-]*$/,

  // Model name: simple identifier
  modelName: /^[a-z][a-z0-9-]*$/,
};

/**
 * Maximum lengths for various content types
 */
const MAX_LENGTHS = {
  name: 64,
  description: 500,
  version: 32,
  folderName: 64,
  toolName: 32,
  modelName: 32,
  agentListEntry: 1000,
  commandListEntry: 500,
};

/**
 * Characters that need escaping in Markdown
 */
const MARKDOWN_ESCAPE_CHARS = [
  '\\',
  '`',
  '*',
  '_',
  '{',
  '}',
  '[',
  ']',
  '(',
  ')',
  '#',
  '+',
  '-',
  '.',
  '!',
  '|',
];

/**
 * Characters that need escaping in shell context
 */
const SHELL_ESCAPE_CHARS = [
  '$',
  '`',
  '\\',
  '"',
  "'",
  '!',
  '&',
  ';',
  '|',
  '>',
  '<',
  '(',
  ')',
  '{',
  '}',
  '[',
  ']',
  '*',
  '?',
  '#',
  '~',
];

/**
 * Escape special characters for Markdown content
 * @param {string} text - Text to escape
 * @returns {string} Escaped text safe for Markdown
 */
function escapeMarkdown(text) {
  if (!text || typeof text !== 'string') return '';

  let escaped = text;
  for (const char of MARKDOWN_ESCAPE_CHARS) {
    escaped = escaped.replace(new RegExp('\\' + char, 'g'), '\\' + char);
  }
  return escaped;
}

/**
 * Escape special characters for shell/command context
 * @param {string} text - Text to escape
 * @returns {string} Escaped text safe for shell
 */
function escapeShell(text) {
  if (!text || typeof text !== 'string') return '';

  // Use a single regex replacement to avoid double-escaping backslashes
  return text.replace(/[$`\\"'!&;|><(){}[\]*?#~]/g, char => '\\' + char);
}

/**
 * Remove control characters from text
 * @param {string} text - Text to clean
 * @returns {string} Text without control characters
 */
function removeControlChars(text) {
  if (!text || typeof text !== 'string') return '';
  // Remove ASCII control chars (0x00-0x1F except tab/newline/carriage return)
  return text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
}

/**
 * Truncate text to maximum length with ellipsis
 * @param {string} text - Text to truncate
 * @param {number} maxLength - Maximum length
 * @returns {string} Truncated text
 */
function truncate(text, maxLength) {
  if (!text || typeof text !== 'string') return '';
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + '...';
}

/**
 * Sanitization functions for different content types
 */
const sanitize = {
  /**
   * Sanitize a name (agent name, command name, etc.)
   * @param {string} name - Name to sanitize
   * @param {Object} [options={}] - Options
   * @param {boolean} [options.strict=true] - Strict validation (returns empty on invalid)
   * @returns {string} Sanitized name
   */
  name(name, options = {}) {
    const { strict = true } = options;

    if (!name || typeof name !== 'string') return '';

    // Clean the name
    let cleaned = removeControlChars(name).trim();
    cleaned = truncate(cleaned, MAX_LENGTHS.name);

    // Strict mode: validate against pattern
    if (strict) {
      if (!PATTERNS.name.test(cleaned)) {
        return '';
      }
    } else {
      // Permissive mode: just remove dangerous chars
      cleaned = cleaned.replace(/[^a-zA-Z0-9_-]/g, '-');
      // Ensure starts with letter
      if (!/^[a-zA-Z]/.test(cleaned)) {
        cleaned = 'x-' + cleaned;
      }
    }

    return cleaned;
  },

  /**
   * Sanitize a description
   * @param {string} description - Description to sanitize
   * @param {Object} [options={}] - Options
   * @param {boolean} [options.escapeMarkdown=true] - Escape markdown chars
   * @returns {string} Sanitized description
   */
  description(description, options = {}) {
    const { escapeMarkdown: shouldEscape = true } = options;

    if (!description || typeof description !== 'string') return '';

    let cleaned = removeControlChars(description).trim();
    cleaned = truncate(cleaned, MAX_LENGTHS.description);

    if (shouldEscape) {
      cleaned = escapeMarkdown(cleaned);
    }

    return cleaned;
  },

  /**
   * Sanitize a count value
   * @param {number|string} count - Count to sanitize
   * @returns {number} Sanitized count (0 if invalid)
   */
  count(count) {
    const num = typeof count === 'string' ? parseInt(count, 10) : count;
    if (!Number.isFinite(num) || num < 0) return 0;
    return Math.floor(num);
  },

  /**
   * Sanitize a version string
   * @param {string} version - Version to sanitize
   * @returns {string} Sanitized version or 'unknown'
   */
  version(version) {
    if (!version || typeof version !== 'string') return 'unknown';

    const cleaned = removeControlChars(version).trim();
    if (!PATTERNS.version.test(cleaned)) {
      return 'unknown';
    }

    return truncate(cleaned, MAX_LENGTHS.version);
  },

  /**
   * Sanitize a date string (ISO format)
   * @param {string|Date} date - Date to sanitize
   * @returns {string} Sanitized date in YYYY-MM-DD format
   */
  date(date) {
    if (date instanceof Date) {
      return date.toISOString().split('T')[0];
    }

    if (!date || typeof date !== 'string') {
      return new Date().toISOString().split('T')[0];
    }

    const cleaned = removeControlChars(date).trim();
    if (!PATTERNS.date.test(cleaned)) {
      return new Date().toISOString().split('T')[0];
    }

    return cleaned;
  },

  /**
   * Sanitize a folder name
   * @param {string} name - Folder name to sanitize
   * @param {string} [defaultName='.agileflow'] - Default if invalid
   * @returns {string} Sanitized folder name
   */
  folderName(name, defaultName = '.agileflow') {
    if (!name || typeof name !== 'string') return defaultName;

    const cleaned = removeControlChars(name).trim();
    if (!PATTERNS.folderName.test(cleaned)) {
      return defaultName;
    }

    return truncate(cleaned, MAX_LENGTHS.folderName);
  },

  /**
   * Sanitize a tool name for agent tools list
   * @param {string} tool - Tool name to sanitize
   * @returns {string} Sanitized tool name
   */
  toolName(tool) {
    if (!tool || typeof tool !== 'string') return '';

    const cleaned = removeControlChars(tool).trim();
    if (!PATTERNS.toolName.test(cleaned)) {
      return '';
    }

    return truncate(cleaned, MAX_LENGTHS.toolName);
  },

  /**
   * Sanitize a model name
   * @param {string} model - Model name to sanitize
   * @param {string} [defaultModel='haiku'] - Default if invalid
   * @returns {string} Sanitized model name
   */
  modelName(model, defaultModel = 'haiku') {
    if (!model || typeof model !== 'string') return defaultModel;

    const cleaned = removeControlChars(model).trim().toLowerCase();
    if (!PATTERNS.modelName.test(cleaned)) {
      return defaultModel;
    }

    return truncate(cleaned, MAX_LENGTHS.modelName);
  },

  /**
   * Sanitize an array of tool names
   * @param {string[]} tools - Tool names to sanitize
   * @returns {string[]} Sanitized tool names (empty entries removed)
   */
  toolsList(tools) {
    if (!Array.isArray(tools)) return [];

    return tools.map(t => sanitize.toolName(t)).filter(Boolean);
  },
};

/**
 * Validate a placeholder value against expected type
 * @param {string} placeholder - Placeholder name (e.g., 'COMMAND_COUNT')
 * @param {any} value - Value to validate
 * @returns {{ valid: boolean, sanitized?: any, error?: string }}
 */
function validatePlaceholderValue(placeholder, value) {
  switch (placeholder) {
    case 'COMMAND_COUNT':
    case 'AGENT_COUNT':
    case 'SKILL_COUNT': {
      const sanitized = sanitize.count(value);
      return { valid: true, sanitized };
    }

    case 'VERSION': {
      const sanitized = sanitize.version(value);
      if (sanitized === 'unknown' && value !== 'unknown') {
        return { valid: false, error: `Invalid version format: ${value}` };
      }
      return { valid: true, sanitized };
    }

    case 'INSTALL_DATE': {
      const sanitized = sanitize.date(value);
      return { valid: true, sanitized };
    }

    case 'agileflow_folder': {
      const sanitized = sanitize.folderName(value);
      if (sanitized !== value) {
        return { valid: false, error: `Invalid folder name: ${value}` };
      }
      return { valid: true, sanitized };
    }

    default:
      return { valid: true, sanitized: value };
  }
}

/**
 * Sanitize agent data for list generation
 * @param {Object} agent - Agent data from frontmatter
 * @returns {Object} Sanitized agent data
 */
function sanitizeAgentData(agent) {
  return {
    name: sanitize.name(agent.name, { strict: false }) || 'unknown',
    description: sanitize.description(agent.description || ''),
    tools: sanitize.toolsList(agent.tools || []),
    model: sanitize.modelName(agent.model),
  };
}

/**
 * Sanitize command data for list generation
 * @param {Object} command - Command data from frontmatter
 * @returns {Object} Sanitized command data
 */
function sanitizeCommandData(command) {
  return {
    name: sanitize.name(command.name, { strict: false }) || 'unknown',
    description: sanitize.description(command.description || ''),
    argumentHint: sanitize.description(command.argumentHint || '', { escapeMarkdown: true }),
  };
}

/**
 * Check if content appears to contain injection attempts
 * @param {string} content - Content to check
 * @returns {{ safe: boolean, reason?: string }}
 */
function detectInjectionAttempt(content) {
  if (!content || typeof content !== 'string') {
    return { safe: true };
  }

  // Check for shell injection patterns
  const shellInjectionPatterns = [
    /\$\(/, // Command substitution
    /`[^`]+`/, // Backtick execution
    /;\s*rm\s/i, // rm command
    /;\s*dd\s/i, // dd command
    /\|\s*sh\b/i, // Piping to shell
    />\s*\/etc\//i, // Writing to /etc
    /\/dev\/null/i, // /dev/null (suspicious in content)
  ];

  for (const pattern of shellInjectionPatterns) {
    if (pattern.test(content)) {
      return { safe: false, reason: `Suspicious pattern detected: ${pattern}` };
    }
  }

  // Check for markdown injection that could break document structure
  const markdownInjectionPatterns = [
    /^#+ /m, // Unexpected headers (could break structure)
    /\[.*\]\(javascript:/i, // JavaScript URLs
    /\[.*\]\(data:/i, // Data URLs
  ];

  for (const pattern of markdownInjectionPatterns) {
    if (pattern.test(content)) {
      return { safe: false, reason: `Markdown injection pattern detected: ${pattern}` };
    }
  }

  return { safe: true };
}

module.exports = {
  // Patterns and constants
  PATTERNS,
  MAX_LENGTHS,

  // Core sanitization functions
  sanitize,
  escapeMarkdown,
  escapeShell,
  removeControlChars,
  truncate,

  // Validation
  validatePlaceholderValue,
  sanitizeAgentData,
  sanitizeCommandData,
  detectInjectionAttempt,
};
