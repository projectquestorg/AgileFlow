/**
 * Prompt Assembler - Install-time prompt inheritance for agent .md files
 *
 * Supports:
 *   extends: <base-name>     - Single-level inheritance from base-prompts/
 *   mixins: [name1, name2]   - Inject mixin content at <!-- {{MIXIN:name}} --> markers
 *   variables: { K: V }      - Replace {{K}} in base template with V
 *
 * Assembly is install-time only (zero runtime cost).
 * Fail-open: if base/mixin not found, returns content unchanged.
 * Max 1 level deep (no grandparent inheritance).
 */

const fs = require('fs');
const path = require('path');
const { parseFrontmatter, extractBody } = require('../../../scripts/lib/frontmatter-parser');
const { validatePath } = require('../../../lib/validate');

// Cache for loaded base templates and mixins
const baseCache = new Map();
const mixinCache = new Map();

/**
 * Validate that a file path is within the expected directory.
 * @param {string} filePath - File path to validate
 * @param {string} baseDir - Expected base directory
 * @returns {boolean} True if path is safe
 */
function isPathSafe(filePath, baseDir) {
  const result = validatePath(filePath, baseDir, { allowSymlinks: false });
  return result.ok;
}

/**
 * Load a base template from the base-prompts directory.
 * @param {string} baseName - Base template name (without .md)
 * @param {string} coreDir - Path to core directory
 * @returns {string|null} Template content or null if not found
 */
function loadBaseTemplate(baseName, coreDir) {
  if (baseCache.has(baseName)) {
    return baseCache.get(baseName);
  }

  const baseDir = path.join(coreDir, 'base-prompts');
  const templatePath = path.join(baseDir, `${baseName}.md`);

  if (!fs.existsSync(templatePath) || !isPathSafe(templatePath, coreDir)) {
    baseCache.set(baseName, null);
    return null;
  }

  try {
    const content = fs.readFileSync(templatePath, 'utf8');
    baseCache.set(baseName, content);
    return content;
  } catch {
    baseCache.set(baseName, null);
    return null;
  }
}

/**
 * Load a mixin from the mixins directory.
 * @param {string} mixinName - Mixin name (without .md)
 * @param {string} coreDir - Path to core directory
 * @returns {string|null} Mixin content or null if not found
 */
function loadMixin(mixinName, coreDir) {
  if (mixinCache.has(mixinName)) {
    return mixinCache.get(mixinName);
  }

  const mixinsDir = path.join(coreDir, 'mixins');
  const mixinPath = path.join(mixinsDir, `${mixinName}.md`);

  if (!fs.existsSync(mixinPath) || !isPathSafe(mixinPath, coreDir)) {
    mixinCache.set(mixinName, null);
    return null;
  }

  try {
    const content = fs.readFileSync(mixinPath, 'utf8');
    mixinCache.set(mixinName, content);
    return content;
  } catch {
    mixinCache.set(mixinName, null);
    return null;
  }
}

/**
 * Extract named sections from child agent body.
 * Sections are marked with: <!-- SECTION: name --> content <!-- END_SECTION -->
 *
 * @param {string} body - Agent body content (after frontmatter)
 * @returns {Map<string, string>} Map of section name → content
 */
function extractChildSections(body) {
  const sections = new Map();
  const pattern = /<!-- SECTION: ([\w-]+) -->\n?([\s\S]*?)<!-- END_SECTION -->/g;
  let match;

  while ((match = pattern.exec(body)) !== null) {
    sections.set(match[1], match[2].trim());
  }

  return sections;
}

/**
 * Get child body content, excluding named sections.
 * This is the "free-form" content that goes into {{CHILD_BODY}}.
 *
 * @param {string} body - Agent body content (after frontmatter)
 * @returns {string} Body without section blocks
 */
function getChildBodyWithoutSections(body) {
  return body.replace(/<!-- SECTION: [\w-]+ -->\n?[\s\S]*?<!-- END_SECTION -->\n?/g, '').trim();
}

/**
 * Substitute variables in template content.
 * Replaces {{VARIABLE_NAME}} with the value from the variables map.
 * Only replaces known variables (does not touch other {{}} patterns).
 *
 * @param {string} content - Template content
 * @param {Object} variables - Key-value pairs for substitution
 * @returns {string} Content with variables replaced
 */
function substituteVariables(content, variables) {
  if (!variables || typeof variables !== 'object') return content;

  let result = content;
  for (const [key, value] of Object.entries(variables)) {
    // Only substitute safe keys (alphanumeric + underscore)
    if (!/^[A-Z_][A-Z0-9_]*$/i.test(key)) continue;
    // Only substitute safe values (no script injection)
    const safeValue = String(value).substring(0, 1000);
    const pattern = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
    result = result.replace(pattern, safeValue);
  }

  return result;
}

/**
 * Resolve inheritance: merge base template with child sections.
 *
 * Base template markers:
 *   <!-- {{SECTION:name}} -->  - Replaced with child section content
 *   {{CHILD_BODY}}             - Replaced with child's non-section body
 *   {{VARIABLE_NAME}}          - Replaced via variables map
 *
 * @param {string} childContent - Full child agent content (with frontmatter)
 * @param {string} baseName - Base template name
 * @param {string} coreDir - Path to core directory
 * @param {Object} variables - Variable substitutions
 * @returns {string} Assembled content
 */
function resolveInheritance(childContent, baseName, coreDir, variables) {
  const baseContent = loadBaseTemplate(baseName, coreDir);
  if (!baseContent) {
    // Fail-open: return child unchanged
    return childContent;
  }

  // Check that the base itself doesn't extend (max 1 level)
  const baseFrontmatter = parseFrontmatter(baseContent);
  if (baseFrontmatter.extends) {
    // Circular/deep inheritance not allowed — fail-open
    return childContent;
  }

  const childBody = extractBody(childContent);
  const childSections = extractChildSections(childBody);
  const childFreeBody = getChildBodyWithoutSections(childBody);

  // Start with the base template body (strip its frontmatter if any)
  let assembled = extractBody(baseContent);

  // Substitute section placeholders with child sections
  assembled = assembled.replace(/<!-- \{\{SECTION:([\w-]+)\}\} -->/g, (match, sectionName) => {
    return childSections.has(sectionName) ? childSections.get(sectionName) : '';
  });

  // Substitute {{CHILD_BODY}} with child's free-form body
  assembled = assembled.replace(/\{\{CHILD_BODY\}\}/g, childFreeBody);

  // Substitute variables from child frontmatter
  assembled = substituteVariables(assembled, variables);

  // Reconstruct with child's frontmatter (minus extends/variables/mixins metadata)
  const childFrontmatter = parseFrontmatter(childContent);
  const cleanFrontmatter = buildCleanFrontmatter(childFrontmatter);

  return `${cleanFrontmatter}\n${assembled}`;
}

/**
 * Resolve mixins: inject mixin content at placeholder markers.
 *
 * @param {string} content - Agent content (possibly already assembled)
 * @param {string[]} mixinNames - List of mixin names to inject
 * @param {string} coreDir - Path to core directory
 * @returns {string} Content with mixins injected
 */
function resolveMixins(content, mixinNames, coreDir) {
  if (!Array.isArray(mixinNames) || mixinNames.length === 0) return content;

  let result = content;

  for (const mixinName of mixinNames) {
    const mixinContent = loadMixin(mixinName, coreDir);
    if (!mixinContent) continue;

    // Replace both HTML-comment and bare placeholder formats
    const commentPattern = new RegExp(`<!-- \\{\\{MIXIN:${escapeRegExp(mixinName)}\\}\\} -->`, 'g');
    const barePattern = new RegExp(`\\{\\{MIXIN:${escapeRegExp(mixinName)}\\}\\}`, 'g');

    result = result.replace(commentPattern, mixinContent);
    result = result.replace(barePattern, mixinContent);
  }

  return result;
}

/**
 * Build clean YAML frontmatter from parsed object, removing assembly metadata.
 * Strips extends, mixins, variables keys (used only during assembly).
 *
 * @param {Object} frontmatter - Parsed frontmatter object
 * @returns {string} YAML frontmatter block
 */
function buildCleanFrontmatter(frontmatter) {
  const skipKeys = new Set(['extends', 'mixins', 'variables']);
  const lines = ['---'];

  for (const [key, value] of Object.entries(frontmatter)) {
    if (skipKeys.has(key)) continue;
    if (value === null || value === undefined) continue;

    if (typeof value === 'string') {
      // Quote strings that contain YAML characters that would break parsing.
      // Commas are safe in simple values (e.g., "tools: Read, Glob, Grep").
      if (/[:#[\]{}|>&*!%@`]/.test(value) || value.includes('\n')) {
        lines.push(`${key}: "${value.replace(/"/g, '\\"')}"`);
      } else {
        lines.push(`${key}: ${value}`);
      }
    } else if (typeof value === 'boolean' || typeof value === 'number') {
      lines.push(`${key}: ${value}`);
    } else if (Array.isArray(value)) {
      lines.push(`${key}: ${value.join(', ')}`);
    }
  }

  lines.push('---');
  return lines.join('\n');
}

/**
 * Escape string for use in RegExp.
 * @param {string} str - String to escape
 * @returns {string} Escaped string
 */
function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Assemble a prompt by resolving inheritance and mixins.
 * This is the main entry point called during installation.
 *
 * @param {string} content - Raw agent .md content
 * @param {string} coreDir - Path to core directory (contains base-prompts/, mixins/)
 * @returns {string} Assembled agent content (or original if no assembly needed)
 */
function assemblePrompt(content, coreDir) {
  if (!content || !coreDir) return content;

  const frontmatter = parseFrontmatter(content);
  if (!frontmatter || typeof frontmatter !== 'object') return content;

  const extendsBase = frontmatter.extends;
  const mixins = frontmatter.mixins;
  const variables = frontmatter.variables;

  // Nothing to assemble
  if (!extendsBase && (!mixins || !Array.isArray(mixins) || mixins.length === 0)) {
    return content;
  }

  let result = content;

  // Handle inheritance (extends)
  if (extendsBase && typeof extendsBase === 'string') {
    result = resolveInheritance(result, extendsBase, coreDir, variables || {});
  }

  // Handle mixins
  if (Array.isArray(mixins) && mixins.length > 0) {
    result = resolveMixins(result, mixins, coreDir);
  }

  return result;
}

/**
 * Clear all caches. Useful for testing.
 */
function clearAssemblerCaches() {
  baseCache.clear();
  mixinCache.clear();
}

module.exports = {
  assemblePrompt,
  clearAssemblerCaches,
  // Exported for testing
  loadBaseTemplate,
  loadMixin,
  extractChildSections,
  getChildBodyWithoutSections,
  substituteVariables,
  resolveInheritance,
  resolveMixins,
  buildCleanFrontmatter,
};
