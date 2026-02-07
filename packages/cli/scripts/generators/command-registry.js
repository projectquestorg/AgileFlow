#!/usr/bin/env node

/**
 * Command Registry Scanner
 *
 * Scans commands/ directory and extracts metadata from frontmatter.
 * Returns structured command registry for use in generators.
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
    console.error(`[command-registry] ${message}`);
  }
}

/**
 * Categorize command based on its name/description
 * @param {string} name - Command name
 * @param {string} description - Command description
 * @returns {string} Category name
 */
function categorizeCommand(name, description) {
  const categories = {
    'Story Management': ['story', 'epic', 'assign', 'status'],
    Development: ['verify', 'baseline', 'resume', 'session-init', 'babysit'],
    'Quality & Testing': ['tests', 'review', 'ci'],
    Documentation: ['docs', 'adr', 'readme-sync'],
    'Planning & Metrics': ['sprint', 'velocity', 'metrics', 'board', 'deps'],
    'Research & Strategy': ['research', 'product'],
    'Deployment & Operations': ['deploy', 'packages'],
    Collaboration: ['update', 'handoff', 'feedback', 'retro'],
    Maintenance: ['debt', 'compress', 'template'],
    System: ['setup', 'help', 'diagnose', 'auto', 'agent'],
  };

  for (const [category, keywords] of Object.entries(categories)) {
    if (keywords.some(kw => name.includes(kw))) {
      return category;
    }
  }

  return 'Other';
}

/**
 * Scan commands directory and build registry
 * @param {string} commandsDir - Path to commands directory
 * @returns {Promise<Array>} Array of command metadata objects
 */
async function scanCommands(commandsDir) {
  // Check cache first
  const cached = getCached(commandsDir);
  if (cached) {
    debugLog(`Using cached commands for ${commandsDir}`);
    return cached;
  }

  const commands = [];
  const skipped = [];

  let files;
  try {
    files = await fsp.readdir(commandsDir);
  } catch (err) {
    debugLog(`Failed to read directory: ${err.message}`);
    return commands;
  }

  debugLog(`Scanning ${files.length} files in ${commandsDir}`);

  for (const file of files) {
    if (!file.endsWith('.md')) {
      debugLog(`Skipping non-md file: ${file}`);
      continue;
    }

    const filePath = path.join(commandsDir, file);
    const frontmatter = extractFrontmatter(filePath);
    const name = file.replace('.md', '');

    // Check if frontmatter was extracted successfully
    if (Object.keys(frontmatter).length === 0) {
      skipped.push({ file, reason: 'no frontmatter or parse error' });
      debugLog(`Skipping ${file}: no frontmatter found`);
      continue;
    }

    debugLog(`Loaded ${file}: description="${frontmatter.description || '(none)'}"`);

    commands.push({
      name,
      file,
      path: filePath,
      description: frontmatter.description || '',
      argumentHint: frontmatter['argument-hint'] || '',
      category: categorizeCommand(name, frontmatter.description || ''),
    });
  }

  // Sort by category, then by name
  commands.sort((a, b) => {
    if (a.category !== b.category) {
      return a.category.localeCompare(b.category);
    }
    return a.name.localeCompare(b.name);
  });

  if (skipped.length > 0) {
    debugLog(`Skipped ${skipped.length} files: ${skipped.map(s => s.file).join(', ')}`);
  }

  debugLog(`Found ${commands.length} commands`);

  // Cache the result
  setCached(commandsDir, commands);

  return commands;
}

/**
 * Main function
 */
async function main() {
  const rootDir = path.resolve(__dirname, '../..');
  const commandsDir = path.join(rootDir, 'src/core/commands');

  if (!fs.existsSync(commandsDir)) {
    console.error(`Commands directory not found: ${commandsDir}`);
    process.exit(1);
  }

  const commands = await scanCommands(commandsDir);

  // If called directly, output JSON
  if (require.main === module) {
    console.log(JSON.stringify(commands, null, 2));
  }

  return commands;
}

// Export for use in other scripts
module.exports = { scanCommands, categorizeCommand };

// Run if called directly
if (require.main === module) {
  main().catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
  });
}
