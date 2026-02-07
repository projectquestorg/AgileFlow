#!/usr/bin/env node

/**
 * Content Generation Orchestrator
 *
 * Runs all content generators to update AgileFlow plugin files.
 * Single source of truth: frontmatter and directory structure.
 */

const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);

/**
 * Run a generator script asynchronously
 * @param {string} scriptName - Name of the generator script
 * @returns {Promise<{generator: string, success: boolean}>} Result with status
 */
async function runGenerator(scriptName) {
  const scriptPath = path.join(__dirname, scriptName);

  console.log(`\n${'='.repeat(60)}`);
  console.log(`Running: ${scriptName}`);
  console.log('='.repeat(60));

  try {
    await execFileAsync('node', [scriptPath], {
      cwd: __dirname,
      stdio: 'inherit',
    });
    console.log(`✅ ${scriptName} completed successfully`);
    return { generator: scriptName, success: true };
  } catch (error) {
    console.error(`❌ ${scriptName} failed:`, error.message);
    return { generator: scriptName, success: false };
  }
}

/**
 * Main orchestrator
 */
async function main() {
  console.log('🚀 AgileFlow Content Generation System');
  console.log('Generating content from metadata...\n');

  const generators = ['inject-help.js', 'inject-babysit.js', 'inject-readme.js'];

  // Run all generators in parallel
  const results = await Promise.all(generators.map(g => runGenerator(g)));

  // Summary
  console.log(`\n${'='.repeat(60)}`);
  console.log('GENERATION SUMMARY');
  console.log('='.repeat(60));

  let allSuccess = true;
  for (const { generator, success } of results) {
    const status = success ? '✅' : '❌';
    console.log(`${status} ${generator}`);
    if (!success) allSuccess = false;
  }

  console.log('');

  if (allSuccess) {
    console.log('🎉 All generators completed successfully!');
    console.log('📝 Generated content is ready for commit.');
    process.exit(0);
  } else {
    console.log('⚠️  Some generators failed. Please check errors above.');
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main().catch(err => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { runGenerator };
