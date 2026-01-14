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
  extractFrontmatter,
  extractBody,
  normalizeTools,
};
