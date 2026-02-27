#!/usr/bin/env node

/**
 * Agent Registry Scanner
 *
 * Scans agents/ directory and extracts metadata from frontmatter.
 * Returns structured agent registry for use in generators.
 *
 * Set DEBUG_REGISTRY=1 for verbose logging of skipped files.
 */

const fs = require('fs');
const fsp = require('fs').promises;
const path = require('path');
const { extractFrontmatter, normalizeTools } = require('../lib/frontmatter-parser');
const { getCached, setCached } = require('../../lib/registry-cache');

// Lazy-load model-profiles to avoid circular deps and missing-module crashes
let _resolveModel;
function getResolveModel() {
  if (_resolveModel === undefined) {
    try {
      _resolveModel = require('../lib/model-profiles').resolveModel;
    } catch (_) {
      _resolveModel = null;
    }
  }
  return _resolveModel;
}

// Debug mode: set DEBUG_REGISTRY=1 to see why files are skipped
const DEBUG = process.env.DEBUG_REGISTRY === '1';

/**
 * Log debug messages when DEBUG_REGISTRY=1
 * @param {string} message - Message to log
 */
function debugLog(message) {
  if (DEBUG) {
    console.error(`[agent-registry] ${message}`);
  }
}

/**
 * Categorize agent based on its role
 * @param {string} name - Agent name
 * @param {string} description - Agent description
 * @returns {string} Category name
 */
function categorizeAgent(name, description) {
  const categories = {
    'Core Development': ['ui', 'api', 'database', 'devops', 'ci'],
    'Specialized Development': ['mobile', 'integrations', 'datamigration'],
    'Quality & Testing': ['qa', 'testing', 'security', 'accessibility'],
    'Architecture & Design': ['design', 'adr-writer', 'epic-planner', 'product'],
    'Maintenance & Optimization': ['refactor', 'performance', 'monitoring'],
    'Documentation & Knowledge': ['documentation', 'readme-updater', 'research'],
    'Compliance & Governance': ['compliance', 'analytics'],
    Mentorship: ['mentor'],
  };

  for (const [category, keywords] of Object.entries(categories)) {
    if (keywords.some(kw => name.includes(kw))) {
      return category;
    }
  }

  return 'Other';
}

/**
 * Scan agents directory and build registry
 * @param {string} agentsDir - Path to agents directory
 * @returns {Promise<Array>} Array of agent metadata objects
 */
async function scanAgents(agentsDir) {
  // Check cache first
  const cached = getCached(agentsDir);
  if (cached) {
    debugLog(`Using cached agents for ${agentsDir}`);
    return cached;
  }

  const agents = [];
  const skipped = [];

  let files;
  try {
    files = await fsp.readdir(agentsDir);
  } catch (err) {
    debugLog(`Failed to read directory: ${err.message}`);
    return agents;
  }

  debugLog(`Scanning ${files.length} files in ${agentsDir}`);

  for (const file of files) {
    if (!file.endsWith('.md')) {
      debugLog(`Skipping non-md file: ${file}`);
      continue;
    }

    const filePath = path.join(agentsDir, file);
    const frontmatter = extractFrontmatter(filePath);
    const name = file.replace('.md', '');

    // Check if frontmatter was extracted successfully
    if (Object.keys(frontmatter).length === 0) {
      skipped.push({ file, reason: 'no frontmatter or parse error' });
      debugLog(`Skipping ${file}: no frontmatter found`);
      continue;
    }

    // Normalize tools field (handles array or comma-separated string)
    const tools = normalizeTools(frontmatter.tools);

    debugLog(`Loaded ${file}: name="${frontmatter.name || name}", tools=${tools.length}`);

    agents.push({
      name,
      file,
      path: filePath,
      displayName: frontmatter.name || name,
      description: frontmatter.description || '',
      tools,
      model: (getResolveModel() || ((_, fm) => fm || 'haiku'))(null, frontmatter.model),
      color: frontmatter.color || 'blue',
      category: categorizeAgent(name, frontmatter.description || ''),
    });
  }

  // Sort by category, then by name
  agents.sort((a, b) => {
    if (a.category !== b.category) {
      return a.category.localeCompare(b.category);
    }
    return a.name.localeCompare(b.name);
  });

  if (skipped.length > 0) {
    debugLog(`Skipped ${skipped.length} files: ${skipped.map(s => s.file).join(', ')}`);
  }

  debugLog(`Found ${agents.length} agents`);

  // Cache the result
  setCached(agentsDir, agents);

  return agents;
}

/**
 * Main function
 */
async function main() {
  const rootDir = path.resolve(__dirname, '../..');
  const agentsDir = path.join(rootDir, 'src/core/agents');

  if (!fs.existsSync(agentsDir)) {
    console.error(`Agents directory not found: ${agentsDir}`);
    process.exit(1);
  }

  const agents = await scanAgents(agentsDir);

  // If called directly, output JSON
  if (require.main === module) {
    console.log(JSON.stringify(agents, null, 2));
  }

  return agents;
}

// Export for use in other scripts
module.exports = { scanAgents, categorizeAgent };

// Run if called directly
if (require.main === module) {
  main().catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
  });
}
