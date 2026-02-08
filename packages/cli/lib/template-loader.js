'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Template Loader Factory
 *
 * Centralized template reading with caching and frontmatter parsing.
 * Replaces scattered readFileSync + parse patterns in generator scripts.
 */

const _templateCache = new Map();

/**
 * Read a template file with optional caching
 * @param {string} filePath - Absolute path to template file
 * @param {Object} [options]
 * @param {boolean} [options.cache] - Enable caching (default true)
 * @param {boolean} [options.parseFrontmatter] - Parse YAML frontmatter (default false)
 * @returns {{ content: string, frontmatter: Object|null, raw: string }}
 */
function loadTemplate(filePath, options = {}) {
  const { cache = true, parseFrontmatter = false } = options;

  // Check cache
  if (cache) {
    const cached = _templateCache.get(filePath);
    if (cached) {
      try {
        const stat = fs.statSync(filePath);
        if (stat.mtimeMs === cached.mtimeMs) {
          return cached.result;
        }
      } catch {
        // File changed or gone, fall through to reload
      }
      _templateCache.delete(filePath);
    }
  }

  // Read file
  const raw = fs.readFileSync(filePath, 'utf-8');

  let content = raw;
  let frontmatter = null;

  if (parseFrontmatter) {
    const parsed = extractSimpleFrontmatter(raw);
    content = parsed.content;
    frontmatter = parsed.frontmatter;
  }

  const result = { content, frontmatter, raw };

  // Cache with mtime
  if (cache) {
    try {
      const stat = fs.statSync(filePath);
      _templateCache.set(filePath, { result, mtimeMs: stat.mtimeMs });
    } catch {
      // Can't stat, don't cache
    }
  }

  return result;
}

/**
 * Simple frontmatter extraction (no js-yaml dependency)
 * Handles key: value pairs in --- delimited blocks
 * @param {string} raw - Raw file content
 * @returns {{ frontmatter: Object, content: string }}
 */
function extractSimpleFrontmatter(raw) {
  const fmRegex = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;
  const match = raw.match(fmRegex);

  if (!match) {
    return { frontmatter: {}, content: raw };
  }

  const fmBlock = match[1];
  const content = match[2];
  const frontmatter = {};

  for (const line of fmBlock.split('\n')) {
    const colonIdx = line.indexOf(':');
    if (colonIdx > 0) {
      const key = line.substring(0, colonIdx).trim();
      let value = line.substring(colonIdx + 1).trim();
      // Remove quotes if present
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      frontmatter[key] = value;
    }
  }

  return { frontmatter, content };
}

/**
 * Create a cached template loader for a specific directory
 * @param {string} baseDir - Base directory for templates
 * @param {Object} [defaultOptions] - Default options for loadTemplate
 * @returns {Function} Loader function: (relativePath) => templateResult
 */
function createTemplateLoader(baseDir, defaultOptions = {}) {
  return function load(relativePath, overrides = {}) {
    const filePath = path.join(baseDir, relativePath);
    return loadTemplate(filePath, { ...defaultOptions, ...overrides });
  };
}

/**
 * Clear the template cache
 */
function clearTemplateCache() {
  _templateCache.clear();
}

/**
 * Get template cache stats
 * @returns {{ size: number, keys: string[] }}
 */
function getTemplateCacheStats() {
  return {
    size: _templateCache.size,
    keys: Array.from(_templateCache.keys()),
  };
}

module.exports = {
  loadTemplate,
  createTemplateLoader,
  clearTemplateCache,
  getTemplateCacheStats,
  extractSimpleFrontmatter,
};
