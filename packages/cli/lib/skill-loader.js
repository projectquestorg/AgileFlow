#!/usr/bin/env node
/**
 * skill-loader.js
 *
 * Skill metadata parser and loader for enhanced skills (EP-0033 Story 4).
 *
 * Skills can now include frontmatter metadata:
 * ---
 * type: skill
 * name: my-skill
 * model: haiku
 * category: database
 * version: 1.0.0
 * ---
 *
 * This module:
 * - Parses skill frontmatter from SKILL.md files
 * - Discovers all installed skills with metadata
 * - Filters skills by category or model
 * - Provides skill recommendations based on context
 */

const fs = require('fs');
const path = require('path');

/**
 * Parse frontmatter from a SKILL.md file.
 * Supports YAML-like frontmatter between --- delimiters.
 *
 * @param {string} content - File content
 * @returns {Object} { metadata: {...}, body: "..." }
 */
function parseSkillFrontmatter(content) {
  const result = { metadata: {}, body: content };

  if (!content || !content.startsWith('---')) {
    return result;
  }

  const endIndex = content.indexOf('---', 3);
  if (endIndex === -1) {
    return result;
  }

  const frontmatterBlock = content.substring(3, endIndex).trim();
  result.body = content.substring(endIndex + 3).trim();

  // Simple YAML-like parsing (no dependency on js-yaml)
  for (const line of frontmatterBlock.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const colonIndex = trimmed.indexOf(':');
    if (colonIndex === -1) continue;

    const key = trimmed.substring(0, colonIndex).trim();
    let value = trimmed.substring(colonIndex + 1).trim();

    // Remove surrounding quotes
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    // Type coercion for known fields
    if (
      key === 'version' ||
      key === 'model' ||
      key === 'category' ||
      key === 'name' ||
      key === 'type'
    ) {
      result.metadata[key] = value;
    } else if (value === 'true') {
      result.metadata[key] = true;
    } else if (value === 'false') {
      result.metadata[key] = false;
    } else {
      result.metadata[key] = value;
    }
  }

  return result;
}

/**
 * Load a single skill from its directory.
 *
 * @param {string} skillDir - Path to skill directory
 * @returns {Object|null} Skill info or null if invalid
 */
function loadSkill(skillDir) {
  const skillMdPath = path.join(skillDir, 'SKILL.md');

  if (!fs.existsSync(skillMdPath)) {
    return null;
  }

  try {
    const content = fs.readFileSync(skillMdPath, 'utf8');
    const { metadata, body } = parseSkillFrontmatter(content);

    // Extract description from frontmatter or first paragraph
    let description = metadata.description || '';
    if (!description && body) {
      // Try to get description from first non-empty line after title
      const lines = body.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#') && !trimmed.startsWith('---')) {
          description = trimmed;
          break;
        }
      }
    }

    return {
      name: metadata.name || path.basename(skillDir),
      type: metadata.type || 'skill',
      model: metadata.model || null,
      category: metadata.category || null,
      version: metadata.version || null,
      description,
      path: skillDir,
      hasReferences: fs.existsSync(path.join(skillDir, 'references.md')),
      hasCookbook: fs.existsSync(path.join(skillDir, 'cookbook')),
      hasMcp: fs.existsSync(path.join(skillDir, '.mcp.json')),
      metadata,
    };
  } catch {
    return null;
  }
}

/**
 * Discover all installed skills.
 *
 * @param {string} rootDir - Project root directory
 * @returns {Object[]} Array of skill info objects
 */
function discoverSkills(rootDir) {
  const skills = [];
  const skillsDirs = [
    path.join(rootDir, '.claude', 'skills'),
    path.join(rootDir, '.agileflow', 'skills'),
  ];

  for (const skillsDir of skillsDirs) {
    if (!fs.existsSync(skillsDir)) continue;

    try {
      const entries = fs.readdirSync(skillsDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;

        const skill = loadSkill(path.join(skillsDir, entry.name));
        if (skill) {
          skills.push(skill);
        }
      }
    } catch {
      // Silently continue
    }
  }

  return skills;
}

/**
 * Filter skills by category.
 *
 * @param {Object[]} skills - Array of skill info objects
 * @param {string} category - Category to filter by
 * @returns {Object[]} Filtered skills
 */
function filterByCategory(skills, category) {
  return skills.filter(s => s.category === category);
}

/**
 * Filter skills by model preference.
 *
 * @param {Object[]} skills - Array of skill info objects
 * @param {string} model - Model to filter by (haiku, sonnet, opus)
 * @returns {Object[]} Filtered skills
 */
function filterByModel(skills, model) {
  return skills.filter(s => s.model === model);
}

/**
 * Get a formatted skill summary for display.
 *
 * @param {Object} skill - Skill info object
 * @returns {string} Formatted summary line
 */
function formatSkillSummary(skill) {
  const parts = [skill.name];
  if (skill.category) parts.push(`[${skill.category}]`);
  if (skill.model) parts.push(`(${skill.model})`);
  if (skill.version) parts.push(`v${skill.version}`);
  return parts.join(' ');
}

module.exports = {
  parseSkillFrontmatter,
  loadSkill,
  discoverSkills,
  filterByCategory,
  filterByModel,
  formatSkillSummary,
};
