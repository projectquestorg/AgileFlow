#!/usr/bin/env node
/**
 * obtain-context.js
 *
 * Orchestrator for gathering all project context in a single execution.
 * Refactored in US-0148 to separate concerns:
 *   - context-loader.js: Data loading operations
 *   - context-formatter.js: Output formatting
 *   - obtain-context.js: Orchestration (this file, ~180 lines)
 *
 * SMART OUTPUT STRATEGY:
 * - Calculates summary character count dynamically
 * - Shows (30K - summary_chars) of full content first
 * - Then shows the summary (so user sees it at their display cutoff)
 *
 * Usage:
 *   node scripts/obtain-context.js              # Just gather context
 *   node scripts/obtain-context.js babysit      # Gather + register 'babysit'
 *   node scripts/obtain-context.js babysit QUERY="auth files"  # Query mode
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Import loader and formatter modules
const {
  parseCommandArgs,
  getCommandType,
  safeReadJSON,
  prefetchAllData,
  determineSectionsToLoad,
  isMultiSessionEnvironment,
} = require('./lib/context-loader');

const { generateSummary, generateFullContent } = require('./lib/context-formatter');

// Import validation
let isValidCommandName;
try {
  isValidCommandName = require('../lib/validate').isValidCommandName;
} catch {
  isValidCommandName = name => /^[a-z][a-z0-9-]*$/i.test(name);
}

// Claude Code's Bash tool truncates around 30K chars
const DISPLAY_LIMIT = 29200;

// =============================================================================
// Parse Arguments
// =============================================================================

const commandName = process.argv[2];
const commandArgs = process.argv.slice(3);
const { activeSections, params: commandParams } = parseCommandArgs(commandArgs);

// =============================================================================
// Command Registration (for PreCompact context preservation)
// =============================================================================

function registerCommand() {
  if (!commandName || !isValidCommandName(commandName)) {
    return;
  }

  const sessionStatePath = 'docs/09-agents/session-state.json';
  if (!fs.existsSync(sessionStatePath)) {
    return;
  }

  try {
    const state = JSON.parse(fs.readFileSync(sessionStatePath, 'utf8'));

    // Initialize active_commands array if not present
    if (!Array.isArray(state.active_commands)) {
      state.active_commands = [];
    }

    // Remove any existing entry for this command (avoid duplicates)
    state.active_commands = state.active_commands.filter(c => c.name !== commandName);

    // Get command type from frontmatter
    const commandType = getCommandType(commandName);

    // Add the new command with active sections
    state.active_commands.push({
      name: commandName,
      type: commandType,
      activated_at: new Date().toISOString(),
      state: {},
      active_sections: activeSections,
      params: commandParams,
    });

    // Remove legacy active_command field
    if (state.active_command !== undefined) {
      delete state.active_command;
    }

    fs.writeFileSync(sessionStatePath, JSON.stringify(state, null, 2) + '\n');
  } catch {
    // Silently continue if session state can't be updated
  }
}

// =============================================================================
// Query Mode (US-0127)
// =============================================================================

/**
 * Execute query mode using codebase index for targeted search.
 * Falls back to full context if query returns no results.
 *
 * @param {string} query - Natural language or pattern query
 * @returns {Object|null} Query results or null to fall back to full context
 */
function executeQueryMode(query) {
  const queryScript = path.join(__dirname, 'query-codebase.js');

  if (!fs.existsSync(queryScript)) {
    console.error('Query mode unavailable: query-codebase.js not found');
    return null;
  }

  try {
    const result = execSync(`node "${queryScript}" --query="${query}" --budget=15000`, {
      encoding: 'utf8',
      maxBuffer: 50 * 1024 * 1024,
    });

    if (result.includes('No files found') || result.trim() === '') {
      return null;
    }

    return {
      mode: 'query',
      query: query,
      results: result.trim(),
    };
  } catch (err) {
    if (err.status === 2) {
      return null; // No results, fall back
    }
    console.error(`Query error: ${err.message}`);
    return null;
  }
}

// =============================================================================
// Main Execution
// =============================================================================

async function main() {
  // Register command for PreCompact
  registerCommand();

  // Check for query mode first (US-0127)
  if (activeSections.includes('query-mode') && commandParams.QUERY) {
    const queryResult = executeQueryMode(commandParams.QUERY);

    if (queryResult) {
      console.log(`=== QUERY MODE ===`);
      console.log(`Query: "${queryResult.query}"`);
      console.log(`---`);
      console.log(queryResult.results);
      console.log(`---`);
      console.log(`[Query mode: targeted search. Run without QUERY= for full context]`);
      return;
    }
    console.log(`[Query "${commandParams.QUERY}" returned no results, loading full context...]`);
  }

  // Check for multi-session environment
  const isMultiSession = isMultiSessionEnvironment();

  // Load lazy context configuration
  const metadata = safeReadJSON('docs/00-meta/agileflow-metadata.json');
  const lazyConfig = metadata?.features?.lazyContext;

  // Determine which sections need full content (US-0093)
  const sectionsToLoad = determineSectionsToLoad(commandName, lazyConfig, isMultiSession);

  // Pre-fetch all data in parallel
  const prefetched = await prefetchAllData({ sectionsToLoad });

  // Generate formatted output
  const formatOptions = { commandName, activeSections };
  const summary = generateSummary(prefetched, formatOptions);
  const fullContent = generateFullContent(prefetched, formatOptions);

  // Smart output positioning
  const summaryLength = summary.length;
  const cutoffPoint = DISPLAY_LIMIT - summaryLength;

  if (fullContent.length <= cutoffPoint) {
    // Full content fits before summary
    console.log(fullContent);
    console.log(summary);
  } else {
    // Output content up to cutoff, then summary as the LAST visible thing
    const contentBefore = fullContent.substring(0, cutoffPoint);
    console.log(contentBefore);
    console.log(summary);
  }
}

// Execute
main().catch(err => {
  console.error('Error gathering context:', err.message);
  process.exit(1);
});
