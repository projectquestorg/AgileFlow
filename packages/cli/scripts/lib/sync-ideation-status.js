/**
 * sync-ideation-status.js - Sync ideation status with epic completion
 *
 * Automatically marks ideas as "implemented" when their linked epics complete.
 * This prevents /babysit and /mentor from re-suggesting already-implemented work.
 *
 * Usage:
 *   const { syncImplementedIdeas } = require('./lib/sync-ideation-status');
 *   const result = syncImplementedIdeas(rootDir);
 *   // result: { ok: true, updated: 5, skipped: 10, errors: [] }
 */

const fs = require('fs');
const path = require('path');

// Paths relative to project root
const STATUS_PATH = 'docs/09-agents/status.json';
const IDEATION_INDEX_PATH = 'docs/00-meta/ideation-index.json';

/**
 * Load JSON file safely
 * @param {string} filePath - Absolute path to JSON file
 * @returns {{ ok: boolean, data?: object, error?: string }}
 */
function loadJSON(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      return { ok: false, error: `File not found: ${filePath}` };
    }
    const content = fs.readFileSync(filePath, 'utf8');
    const data = JSON.parse(content);
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: `Failed to load ${filePath}: ${err.message}` };
  }
}

/**
 * Save JSON file with atomic write
 * @param {string} filePath - Absolute path to JSON file
 * @param {object} data - Data to save
 * @returns {{ ok: boolean, error?: string }}
 */
function saveJSON(filePath, data) {
  const tempPath = `${filePath}.tmp`;
  try {
    const content = JSON.stringify(data, null, 2) + '\n';
    fs.writeFileSync(tempPath, content);
    fs.renameSync(tempPath, filePath);
    return { ok: true };
  } catch (err) {
    try {
      if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
    } catch {}
    return { ok: false, error: `Failed to save ${filePath}: ${err.message}` };
  }
}

/**
 * Normalize report filename for matching
 * Handles case-insensitivity and path variations
 * @param {string} name - Report filename
 * @returns {string} Normalized name
 */
function normalizeReportName(name) {
  if (!name || typeof name !== 'string') return '';
  // Remove path prefix if present, lowercase, trim
  return path.basename(name).toLowerCase().trim();
}

/**
 * Find all ideas that originated from a specific report
 * @param {object} index - Ideation index
 * @param {string} reportName - Source report filename
 * @returns {Array<{ id: string, idea: object }>}
 */
function findIdeasByReport(index, reportName) {
  if (!index || !index.ideas || !reportName) return [];

  const normalizedReport = normalizeReportName(reportName);
  const matches = [];

  for (const [id, idea] of Object.entries(index.ideas)) {
    const ideaReport = normalizeReportName(idea.source_report);
    if (ideaReport === normalizedReport) {
      matches.push({ id, idea });
    }
  }

  return matches;
}

/**
 * Sync ideas for a specific completed epic
 * @param {string} epicId - Epic ID (e.g., 'EP-0017')
 * @param {object} epic - Epic data from status.json
 * @param {object} index - Ideation index
 * @returns {{ updated: number, ideas: string[] }}
 */
function syncEpicIdeas(epicId, epic, index) {
  const result = { updated: 0, ideas: [] };

  // Skip if no research field
  if (!epic.research) return result;

  // Find all ideas from this epic's research
  const ideas = findIdeasByReport(index, epic.research);

  for (const { id, idea } of ideas) {
    // Skip if already implemented or rejected
    if (idea.status === 'implemented' || idea.status === 'rejected') continue;

    // Mark as implemented
    idea.status = 'implemented';
    idea.linked_epic = epicId;
    idea.implemented_date = epic.completed || new Date().toISOString().split('T')[0];

    result.updated++;
    result.ideas.push(id);
  }

  return result;
}

/**
 * Get all completed epics with research fields
 * @param {object} statusData - Status.json data
 * @returns {Array<{ id: string, epic: object }>}
 */
function getCompletedEpicsWithResearch(statusData) {
  if (!statusData || !statusData.epics) return [];

  return Object.entries(statusData.epics)
    .filter(([, epic]) => epic.status === 'complete' && epic.research)
    .map(([id, epic]) => ({ id, epic }));
}

/**
 * Sync all implemented ideas based on completed epics
 * @param {string} rootDir - Project root directory
 * @param {object} options - Options
 * @param {boolean} options.dryRun - If true, don't write changes
 * @param {boolean} options.verbose - If true, log details
 * @returns {{ ok: boolean, updated: number, skipped: number, errors: string[], details?: object }}
 */
function syncImplementedIdeas(rootDir, options = {}) {
  const { dryRun = false, verbose = false } = options;
  const result = {
    ok: true,
    updated: 0,
    skipped: 0,
    errors: [],
    details: {},
  };

  // Load status.json
  const statusPath = path.join(rootDir, STATUS_PATH);
  const statusResult = loadJSON(statusPath);
  if (!statusResult.ok) {
    result.ok = false;
    result.errors.push(statusResult.error);
    return result;
  }

  // Load ideation-index.json
  const indexPath = path.join(rootDir, IDEATION_INDEX_PATH);
  const indexResult = loadJSON(indexPath);
  if (!indexResult.ok) {
    // Index doesn't exist - not an error, just nothing to sync
    if (verbose) console.log('No ideation index found, nothing to sync');
    return result;
  }

  const statusData = statusResult.data;
  const index = indexResult.data;

  // Get completed epics with research
  const completedEpics = getCompletedEpicsWithResearch(statusData);
  if (verbose) {
    console.log(`Found ${completedEpics.length} completed epics with research fields`);
  }

  // Sync each epic's ideas
  for (const { id: epicId, epic } of completedEpics) {
    const syncResult = syncEpicIdeas(epicId, epic, index);

    if (syncResult.updated > 0) {
      result.updated += syncResult.updated;
      result.details[epicId] = {
        research: epic.research,
        ideas: syncResult.ideas,
      };

      if (verbose) {
        console.log(
          `  ${epicId}: ${syncResult.updated} ideas marked implemented (${epic.research})`
        );
      }
    } else {
      result.skipped++;
    }
  }

  // Save updated index if changes were made
  if (result.updated > 0 && !dryRun) {
    index.updated = new Date().toISOString();
    const saveResult = saveJSON(indexPath, index);
    if (!saveResult.ok) {
      result.ok = false;
      result.errors.push(saveResult.error);
    }
  }

  return result;
}

/**
 * Get sync status summary for reporting
 * @param {string} rootDir - Project root directory
 * @returns {{ totalIdeas: number, pending: number, implemented: number, linkedEpics: number }}
 */
function getSyncStatus(rootDir) {
  const indexPath = path.join(rootDir, IDEATION_INDEX_PATH);
  const indexResult = loadJSON(indexPath);

  if (!indexResult.ok) {
    return { totalIdeas: 0, pending: 0, implemented: 0, linkedEpics: 0 };
  }

  const index = indexResult.data;
  const ideas = Object.values(index.ideas || {});

  const linkedEpics = new Set(ideas.filter(i => i.linked_epic).map(i => i.linked_epic)).size;

  return {
    totalIdeas: ideas.length,
    pending: ideas.filter(i => i.status === 'pending').length,
    implemented: ideas.filter(i => i.status === 'implemented').length,
    rejected: ideas.filter(i => i.status === 'rejected').length,
    inProgress: ideas.filter(i => i.status === 'in-progress').length,
    linkedEpics,
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  // Core functions
  syncImplementedIdeas,
  syncEpicIdeas,
  findIdeasByReport,
  getCompletedEpicsWithResearch,

  // Utilities
  loadJSON,
  saveJSON,
  normalizeReportName,
  getSyncStatus,

  // Paths (for testing)
  STATUS_PATH,
  IDEATION_INDEX_PATH,
};

// CLI interface when run directly
if (require.main === module) {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const verbose = args.includes('--verbose') || args.includes('-v');
  const rootDir = process.cwd();

  console.log('Syncing ideation status with completed epics...');
  if (dryRun) console.log('(Dry run - no changes will be saved)');

  const result = syncImplementedIdeas(rootDir, { dryRun, verbose });

  if (result.ok) {
    console.log(`\nSync complete: ${result.updated} ideas marked as implemented`);
    if (result.updated > 0) {
      console.log('\nDetails:');
      for (const [epicId, info] of Object.entries(result.details)) {
        console.log(`  ${epicId}: ${info.ideas.join(', ')}`);
      }
    }
  } else {
    console.error('\nSync failed:');
    result.errors.forEach(e => console.error(`  - ${e}`));
    process.exit(1);
  }
}
