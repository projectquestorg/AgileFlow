#!/usr/bin/env node

/**
 * Skill Registry Scanner
 *
 * Scans skills/ directory and extracts metadata from SKILL.md frontmatter.
 * Returns structured skill registry for use in generators.
 *
 * Set DEBUG_REGISTRY=1 for verbose logging of skipped files.
 */

const fs = require('fs');
const fsp = require('fs').promises;
const path = require('path');
const { extractFrontmatter } = require('../lib/frontmatter-parser');
const { getCached, setCached } = require('../../lib/registry-cache');

// Debug mode: set DEBUG_REGISTRY=1 to see why files are skipped
const DEBUG = process.env.DEBUG_REGISTRY === '1';

/**
 * Log debug messages when DEBUG_REGISTRY=1
 * @param {string} message - Message to log
 */
function debugLog(message) {
  if (DEBUG) {
    console.error(`[skill-registry] ${message}`);
  }
}

/**
 * Categorize skill based on its name/description
 * @param {string} name - Skill name
 * @param {string} description - Skill description
 * @returns {string} Category name
 */
function categorizeSkill(name, description) {
  const categories = {
    'Story & Planning': ['story', 'epic', 'sprint', 'acceptance-criteria'],
    'Code Generation': ['type-definitions', 'validation-schema', 'error-handler'],
    Testing: ['test-case'],
    Documentation: ['adr', 'api-documentation', 'changelog', 'pr-description'],
    Architecture: ['sql-schema', 'diagram'],
    Deployment: ['deployment-guide', 'migration-checklist'],
  };

  const lowerName = name.toLowerCase();
  const lowerDesc = description.toLowerCase();

  for (const [category, keywords] of Object.entries(categories)) {
    if (keywords.some(kw => lowerName.includes(kw) || lowerDesc.includes(kw))) {
      return category;
    }
  }

  return 'Other';
}

/**
 * Scan skills directory and build registry
 * @param {string} skillsDir - Path to skills directory
 * @returns {Promise<Array>} Array of skill metadata objects
 */
async function scanSkills(skillsDir) {
  // Check cache first
  const cached = getCached(skillsDir);
  if (cached) {
    debugLog(`Using cached skills for ${skillsDir}`);
    return cached;
  }

  const skills = [];
  const skipped = [];

  let skillDirs;
  try {
    skillDirs = await fsp.readdir(skillsDir);
  } catch (err) {
    debugLog(`Failed to read directory: ${err.message}`);
    return skills;
  }

  debugLog(`Scanning ${skillDirs.length} entries in ${skillsDir}`);

  for (const skillDir of skillDirs) {
    const skillPath = path.join(skillsDir, skillDir);

    // Skip if not a directory
    let stat;
    try {
      stat = await fsp.stat(skillPath);
    } catch (err) {
      debugLog(`Failed to stat ${skillDir}: ${err.message}`);
      continue;
    }

    if (!stat.isDirectory()) {
      debugLog(`Skipping non-directory: ${skillDir}`);
      continue;
    }

    const skillFile = path.join(skillPath, 'SKILL.md');

    // Skip if SKILL.md doesn't exist
    try {
      await fsp.access(skillFile);
    } catch (err) {
      skipped.push({ dir: skillDir, reason: 'no SKILL.md file' });
      debugLog(`Skipping ${skillDir}: no SKILL.md found`);
      continue;
    }

    const frontmatter = extractFrontmatter(skillFile);

    // Check if frontmatter was extracted successfully
    if (Object.keys(frontmatter).length === 0) {
      skipped.push({ dir: skillDir, reason: 'no frontmatter or parse error' });
      debugLog(`Skipping ${skillDir}: no frontmatter in SKILL.md`);
      continue;
    }

    const name = frontmatter.name || skillDir;
    const description = frontmatter.description || '';

    debugLog(`Loaded ${skillDir}: name="${name}"`);

    skills.push({
      name,
      directory: skillDir,
      file: 'SKILL.md',
      path: skillFile,
      description,
      category: categorizeSkill(name, description),
    });
  }

  // Sort by category, then by name
  skills.sort((a, b) => {
    if (a.category !== b.category) {
      return a.category.localeCompare(b.category);
    }
    return a.name.localeCompare(b.name);
  });

  if (skipped.length > 0) {
    debugLog(`Skipped ${skipped.length} directories: ${skipped.map(s => s.dir).join(', ')}`);
  }

  debugLog(`Found ${skills.length} skills`);

  // Cache the result
  setCached(skillsDir, skills);

  return skills;
}

/**
 * Main function
 */
async function main() {
  const rootDir = path.resolve(__dirname, '../..');
  const skillsDir = path.join(rootDir, 'src/core/skills');

  if (!fs.existsSync(skillsDir)) {
    console.error(`Skills directory not found: ${skillsDir}`);
    process.exit(1);
  }

  const skills = await scanSkills(skillsDir);

  // If called directly, output JSON
  if (require.main === module) {
    console.log(JSON.stringify(skills, null, 2));
  }

  return skills;
}

// Export for use in other scripts
module.exports = { scanSkills, categorizeSkill };

// Run if called directly
if (require.main === module) {
  main().catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
  });
}
