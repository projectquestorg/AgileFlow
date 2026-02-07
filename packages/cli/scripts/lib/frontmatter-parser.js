#!/usr/bin/env node

/**
 * Frontmatter Parser - Shared YAML frontmatter extraction
 *
 * Consolidates frontmatter parsing logic used across:
 * - command-registry.js
 * - agent-registry.js
 * - skill-registry.js
 * - content-injector.js
 */

const fs = require('fs');
const { safeLoad } = require('../../lib/yaml-utils');

/**
 * Parse YAML frontmatter from markdown content
 * @param {string} content - Markdown content with frontmatter
 * @returns {object} Parsed frontmatter object, or empty object if none found
 */
function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);

  if (!match) {
    return {};
  }

  try {
    const parsed = safeLoad(match[1]);
    // Return empty object if safeLoad returns null/undefined
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (err) {
    // Return empty object on parse error (invalid YAML)
    return {};
  }
}

/**
 * Extract frontmatter from a markdown file
 * @param {string} filePath - Path to markdown file
 * @returns {object} Parsed frontmatter object, or empty object if none/error
 */
function extractFrontmatter(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return parseFrontmatter(content);
  } catch (err) {
    // Return empty object on file read error
    return {};
  }
}

/**
 * Parse AGILEFLOW_META comment block from markdown content.
 * These are AgileFlow-specific fields stored as HTML comments
 * to avoid polluting native YAML frontmatter.
 *
 * @param {string} content - Markdown content
 * @returns {object} Parsed meta fields, or empty object if none found
 */
function parseAgileflowMeta(content) {
  const metaMatch = content.match(/<!-- AGILEFLOW_META\n([\s\S]*?)AGILEFLOW_META -->/);
  if (!metaMatch) return {};

  try {
    const parsed = safeLoad(metaMatch[1]);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (err) {
    // Fallback: simple key-value parsing for top-level fields
    const result = {};
    const lines = metaMatch[1].split('\n');
    for (const line of lines) {
      const colonIdx = line.indexOf(':');
      if (colonIdx > 0 && !line.startsWith(' ') && !line.startsWith('\t')) {
        const key = line.slice(0, colonIdx).trim();
        let value = line.slice(colonIdx + 1).trim();
        if (value === 'true') value = true;
        else if (value === 'false') value = false;
        result[key] = value;
      }
    }
    return result;
  }
}

/**
 * Parse full agent config: YAML frontmatter + AGILEFLOW_META comment block.
 * Merges both into a single object (YAML fields take priority).
 *
 * @param {string} content - Markdown content
 * @returns {object} Merged config object
 */
function parseFullAgentConfig(content) {
  const frontmatter = parseFrontmatter(content);
  const meta = parseAgileflowMeta(content);
  return { ...meta, ...frontmatter };
}

/**
 * Extract markdown body (content after frontmatter)
 * @param {string} content - Full markdown content
 * @returns {string} Content after frontmatter, or original if no frontmatter
 */
function extractBody(content) {
  const match = content.match(/^---\n[\s\S]*?\n---\n?([\s\S]*)/);
  return match ? match[1].trim() : content.trim();
}

/**
 * Normalize tools field - handles array or comma-separated string
 * @param {string|Array} tools - Tools field from frontmatter
 * @returns {Array} Array of tool names
 */
function normalizeTools(tools) {
  if (!tools) return [];
  if (Array.isArray(tools)) return tools;
  if (typeof tools === 'string') {
    return tools
      .split(',')
      .map(t => t.trim())
      .filter(Boolean);
  }
  return [];
}

module.exports = {
  parseFrontmatter,
  parseAgileflowMeta,
  parseFullAgentConfig,
  extractFrontmatter,
  extractBody,
  normalizeTools,
};
