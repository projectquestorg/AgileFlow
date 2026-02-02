/**
 * ideation-index.js - Ideation History & Deduplication System
 *
 * Provides persistent idea tracking, deduplication, and history querying
 * for the /agileflow:ideate command. Tracks all generated ideas with unique IDs,
 * detects duplicates across reports, and provides status tracking.
 *
 * Usage:
 *   const {
 *     loadIdeationIndex,
 *     saveIdeationIndex,
 *     addIdeaToIndex,
 *     findDuplicates,
 *     updateIdeaStatus,
 *     getIdeasByStatus,
 *     getRecurringIdeas,
 *   } = require('./lib/ideation-index');
 *
 *   // Load or create index
 *   const index = loadIdeationIndex(rootDir);
 *
 *   // Add a new idea
 *   const result = addIdeaToIndex(index, idea, 'ideation-20260130.md');
 *
 *   // Find duplicates
 *   const duplicates = findDuplicates(index, idea);
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Default index file location
const DEFAULT_INDEX_PATH = 'docs/00-meta/ideation-index.json';

// Similarity threshold for duplicate detection (0-1)
const SIMILARITY_THRESHOLD = 0.75;

// Schema version for migrations
const SCHEMA_VERSION = '1.0.0';

// ============================================================================
// SCHEMA & DEFAULTS
// ============================================================================

/**
 * Create a new empty ideation index with default structure
 * @returns {object} Empty index structure
 */
function createEmptyIndex() {
  return {
    schema_version: SCHEMA_VERSION,
    updated: new Date().toISOString(),
    ideas: {},
    reports: {},
    next_id: 1,
  };
}

/**
 * Validate index structure and migrate if needed
 * @param {object} data - Raw index data
 * @returns {object} Validated/migrated index
 */
function validateAndMigrateIndex(data) {
  if (!data || typeof data !== 'object') {
    return createEmptyIndex();
  }

  // Ensure required fields exist
  const index = {
    schema_version: data.schema_version || SCHEMA_VERSION,
    updated: data.updated || new Date().toISOString(),
    ideas: data.ideas || {},
    reports: data.reports || {},
    next_id: data.next_id || 1,
  };

  // Future: Add migration logic for schema version upgrades

  return index;
}

// ============================================================================
// FILE I/O
// ============================================================================

/**
 * Get the path to the ideation index file
 * @param {string} rootDir - Project root directory
 * @returns {string} Full path to index file
 */
function getIndexPath(rootDir) {
  return path.join(rootDir, DEFAULT_INDEX_PATH);
}

/**
 * Load ideation index from disk
 * @param {string} rootDir - Project root directory
 * @returns {{ ok: boolean, data?: object, error?: string, created?: boolean }}
 */
function loadIdeationIndex(rootDir) {
  const indexPath = getIndexPath(rootDir);

  try {
    if (!fs.existsSync(indexPath)) {
      // Create new index
      const newIndex = createEmptyIndex();
      return { ok: true, data: newIndex, created: true };
    }

    const content = fs.readFileSync(indexPath, 'utf8');
    if (!content.trim()) {
      const newIndex = createEmptyIndex();
      return { ok: true, data: newIndex, created: true };
    }

    const data = JSON.parse(content);
    const index = validateAndMigrateIndex(data);
    return { ok: true, data: index };
  } catch (err) {
    return { ok: false, error: `Failed to load ideation index: ${err.message}` };
  }
}

/**
 * Save ideation index to disk with atomic write
 * @param {string} rootDir - Project root directory
 * @param {object} index - Index data to save
 * @returns {{ ok: boolean, error?: string }}
 */
function saveIdeationIndex(rootDir, index) {
  const indexPath = getIndexPath(rootDir);
  const tempPath = `${indexPath}.tmp`;

  try {
    // Ensure directory exists
    const dir = path.dirname(indexPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Update timestamp
    index.updated = new Date().toISOString();

    // Atomic write: write to temp file, then rename
    const content = JSON.stringify(index, null, 2) + '\n';
    fs.writeFileSync(tempPath, content);
    fs.renameSync(tempPath, indexPath);

    return { ok: true };
  } catch (err) {
    // Clean up temp file if it exists
    try {
      if (fs.existsSync(tempPath)) {
        fs.unlinkSync(tempPath);
      }
    } catch {}
    return { ok: false, error: `Failed to save ideation index: ${err.message}` };
  }
}

// ============================================================================
// FINGERPRINTING & SIMILARITY
// ============================================================================

/**
 * Normalize a string for comparison (lowercase, remove punctuation, collapse whitespace)
 * @param {string} str - String to normalize
 * @returns {string} Normalized string
 */
function normalizeString(str) {
  if (!str || typeof str !== 'string') return '';
  return str
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Normalize file paths for comparison
 * @param {string[]} files - Array of file paths
 * @returns {string[]} Sorted, normalized file paths
 */
function normalizeFiles(files) {
  if (!Array.isArray(files)) return [];
  return files
    .map(f => (typeof f === 'string' ? f.replace(/^[`'"]+|[`'"]+$/g, '').trim() : ''))
    .filter(Boolean)
    .sort();
}

/**
 * Generate a fingerprint (SHA256 hash) for an idea
 * @param {string} title - Idea title
 * @param {string[]} files - Files affected
 * @returns {string} Hex fingerprint
 */
function generateIdeaFingerprint(title, files = []) {
  const normalizedTitle = normalizeString(title);
  const normalizedFiles = normalizeFiles(files);
  const data = `${normalizedTitle}|${normalizedFiles.join(',')}`;
  return crypto.createHash('sha256').update(data).digest('hex').substring(0, 16);
}

/**
 * Calculate Levenshtein distance between two strings
 * @param {string} a - First string
 * @param {string} b - Second string
 * @returns {number} Edit distance
 */
function levenshteinDistance(a, b) {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const matrix = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1, // insertion
          matrix[i - 1][j] + 1 // deletion
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

/**
 * Calculate similarity between two strings (0-1, higher is more similar)
 * @param {string} a - First string
 * @param {string} b - Second string
 * @returns {number} Similarity score (0-1)
 */
function stringSimilarity(a, b) {
  const normA = normalizeString(a);
  const normB = normalizeString(b);

  if (normA === normB) return 1;
  if (!normA || !normB) return 0;

  const maxLen = Math.max(normA.length, normB.length);
  if (maxLen === 0) return 1;

  const distance = levenshteinDistance(normA, normB);
  return 1 - distance / maxLen;
}

/**
 * Calculate file overlap between two sets of files
 * @param {string[]} files1 - First file set
 * @param {string[]} files2 - Second file set
 * @returns {number} Overlap ratio (0-1)
 */
function fileOverlap(files1, files2) {
  const norm1 = normalizeFiles(files1);
  const norm2 = normalizeFiles(files2);

  if (norm1.length === 0 && norm2.length === 0) return 0;
  if (norm1.length === 0 || norm2.length === 0) return 0;

  const set1 = new Set(norm1);
  const intersection = norm2.filter(f => set1.has(f)).length;
  const union = new Set([...norm1, ...norm2]).size;

  return union > 0 ? intersection / union : 0;
}

/**
 * Calculate combined similarity score for two ideas
 * @param {object} idea1 - First idea
 * @param {object} idea2 - Second idea
 * @returns {{ score: number, titleSimilarity: number, fileOverlap: number }}
 */
function calculateIdeaSimilarity(idea1, idea2) {
  const titleSim = stringSimilarity(idea1.title || '', idea2.title || '');
  const fileSim = fileOverlap(idea1.files || [], idea2.files || []);

  // Weighted combination: title matters more (70%), files (30%)
  const score = titleSim * 0.7 + fileSim * 0.3;

  return {
    score,
    titleSimilarity: titleSim,
    fileOverlap: fileSim,
  };
}

// ============================================================================
// IDEA MANAGEMENT
// ============================================================================

/**
 * Find duplicate ideas in the index
 * @param {object} index - Ideation index
 * @param {object} idea - Idea to check { title, files }
 * @param {object} options - Options
 * @param {number} options.threshold - Similarity threshold (default: 0.75)
 * @returns {Array<{ id: string, idea: object, similarity: object }>}
 */
function findDuplicates(index, idea, options = {}) {
  const { threshold = SIMILARITY_THRESHOLD } = options;
  const duplicates = [];

  // First check fingerprint for exact matches
  const fingerprint = generateIdeaFingerprint(idea.title, idea.files);

  for (const [id, existing] of Object.entries(index.ideas || {})) {
    // Skip if fingerprint matches (exact duplicate)
    if (existing.fingerprint === fingerprint) {
      duplicates.push({
        id,
        idea: existing,
        similarity: { score: 1, titleSimilarity: 1, fileOverlap: 1 },
        exact: true,
      });
      continue;
    }

    // Calculate similarity
    const similarity = calculateIdeaSimilarity(idea, existing);
    if (similarity.score >= threshold) {
      duplicates.push({
        id,
        idea: existing,
        similarity,
        exact: false,
      });
    }
  }

  // Sort by similarity score descending
  duplicates.sort((a, b) => b.similarity.score - a.similarity.score);

  return duplicates;
}

/**
 * Add an idea to the index
 * @param {object} index - Ideation index
 * @param {object} idea - Idea to add
 * @param {string} idea.title - Idea title
 * @param {string} idea.category - Category (Security, Performance, etc.)
 * @param {string[]} idea.files - Files affected
 * @param {string} idea.confidence - Confidence level (HIGH, MEDIUM)
 * @param {string[]} idea.experts - Contributing experts
 * @param {string} reportName - Source report filename
 * @returns {{ ok: boolean, id?: string, duplicate?: object, error?: string }}
 */
function addIdeaToIndex(index, idea, reportName) {
  if (!idea || !idea.title) {
    return { ok: false, error: 'Idea title is required' };
  }

  // Check for duplicates first
  const duplicates = findDuplicates(index, idea);
  if (duplicates.length > 0 && duplicates[0].similarity.score > 0.9) {
    // This is a recurring idea - add occurrence instead of creating new
    const existing = duplicates[0];
    const existingIdea = index.ideas[existing.id];

    // Add new occurrence
    if (!existingIdea.occurrences) {
      existingIdea.occurrences = [];
    }
    existingIdea.occurrences.push({
      report: reportName,
      date: new Date().toISOString().split('T')[0],
      experts: idea.experts || [],
    });

    // Update last seen
    existingIdea.last_seen = new Date().toISOString().split('T')[0];

    return {
      ok: true,
      id: existing.id,
      duplicate: existing,
      recurring: true,
    };
  }

  // Generate new ID
  const id = `IDEA-${String(index.next_id).padStart(4, '0')}`;
  index.next_id++;

  // Create idea entry
  const now = new Date().toISOString().split('T')[0];
  const newIdea = {
    id,
    title: idea.title,
    title_normalized: normalizeString(idea.title),
    fingerprint: generateIdeaFingerprint(idea.title, idea.files),
    category: idea.category || 'Uncategorized',
    source_report: reportName,
    first_seen: now,
    last_seen: now,
    confidence: idea.confidence || 'MEDIUM',
    files: idea.files || [],
    status: 'pending',
    linked_story: null,
    linked_epic: null,
    occurrences: [
      {
        report: reportName,
        date: now,
        experts: idea.experts || [],
      },
    ],
  };

  // Add to index
  index.ideas[id] = newIdea;

  // Update report entry
  if (!index.reports[reportName]) {
    index.reports[reportName] = {
      generated: now,
      scope: null,
      depth: null,
      idea_count: 0,
      ideas: [],
    };
  }
  index.reports[reportName].ideas.push(id);
  index.reports[reportName].idea_count++;

  return { ok: true, id, recurring: false };
}

/**
 * Update the status of an idea
 * @param {object} index - Ideation index
 * @param {string} ideaId - Idea ID (e.g., 'IDEA-0001')
 * @param {string} status - New status ('pending', 'in-progress', 'implemented', 'rejected')
 * @param {object} options - Additional options
 * @param {string} options.linkedStory - Link to a story (e.g., 'US-0095')
 * @param {string} options.linkedEpic - Link to an epic (e.g., 'EP-0017')
 * @returns {{ ok: boolean, error?: string }}
 */
function updateIdeaStatus(index, ideaId, status, options = {}) {
  const idea = index.ideas[ideaId];
  if (!idea) {
    return { ok: false, error: `Idea not found: ${ideaId}` };
  }

  const validStatuses = ['pending', 'in-progress', 'implemented', 'rejected'];
  if (!validStatuses.includes(status)) {
    return { ok: false, error: `Invalid status: ${status}. Must be one of: ${validStatuses.join(', ')}` };
  }

  idea.status = status;

  if (options.linkedStory) {
    idea.linked_story = options.linkedStory;
  }
  if (options.linkedEpic) {
    idea.linked_epic = options.linkedEpic;
  }

  return { ok: true };
}

// ============================================================================
// QUERIES
// ============================================================================

/**
 * Get ideas filtered by status
 * @param {object} index - Ideation index
 * @param {string} status - Status to filter by
 * @returns {Array<object>} Matching ideas
 */
function getIdeasByStatus(index, status) {
  return Object.values(index.ideas || {}).filter(idea => idea.status === status);
}

/**
 * Get recurring ideas (seen 2+ times)
 * @param {object} index - Ideation index
 * @param {object} options - Options
 * @param {boolean} options.excludeImplemented - Exclude implemented ideas
 * @returns {Array<{ idea: object, occurrenceCount: number }>}
 */
function getRecurringIdeas(index, options = {}) {
  const { excludeImplemented = true } = options;

  return Object.values(index.ideas || {})
    .filter(idea => {
      if (excludeImplemented && idea.status === 'implemented') return false;
      return (idea.occurrences || []).length >= 2;
    })
    .map(idea => ({
      idea,
      occurrenceCount: (idea.occurrences || []).length,
    }))
    .sort((a, b) => b.occurrenceCount - a.occurrenceCount);
}

/**
 * Get index summary statistics
 * @param {object} index - Ideation index
 * @returns {object} Summary stats
 */
function getIndexSummary(index) {
  const ideas = Object.values(index.ideas || {});

  const byStatus = {
    pending: 0,
    'in-progress': 0,
    implemented: 0,
    rejected: 0,
  };

  const byCategory = {};
  let recurringCount = 0;

  for (const idea of ideas) {
    // Count by status
    byStatus[idea.status] = (byStatus[idea.status] || 0) + 1;

    // Count by category
    const cat = idea.category || 'Uncategorized';
    byCategory[cat] = (byCategory[cat] || 0) + 1;

    // Count recurring
    if ((idea.occurrences || []).length >= 2) {
      recurringCount++;
    }
  }

  return {
    totalIdeas: ideas.length,
    totalReports: Object.keys(index.reports || {}).length,
    byStatus,
    byCategory,
    recurringCount,
    lastUpdated: index.updated,
  };
}

/**
 * Get idea by ID
 * @param {object} index - Ideation index
 * @param {string} ideaId - Idea ID
 * @returns {object|null} Idea or null if not found
 */
function getIdeaById(index, ideaId) {
  return index.ideas[ideaId] || null;
}

/**
 * Search ideas by title keyword
 * @param {object} index - Ideation index
 * @param {string} query - Search query
 * @returns {Array<object>} Matching ideas
 */
function searchIdeas(index, query) {
  const normalizedQuery = normalizeString(query);
  if (!normalizedQuery) return [];

  return Object.values(index.ideas || {}).filter(idea => {
    const normalizedTitle = idea.title_normalized || normalizeString(idea.title);
    return normalizedTitle.includes(normalizedQuery);
  });
}

/**
 * Update report metadata
 * @param {object} index - Ideation index
 * @param {string} reportName - Report filename
 * @param {object} metadata - Metadata to update
 * @returns {{ ok: boolean }}
 */
function updateReportMetadata(index, reportName, metadata) {
  if (!index.reports[reportName]) {
    index.reports[reportName] = {
      generated: new Date().toISOString().split('T')[0],
      scope: null,
      depth: null,
      idea_count: 0,
      ideas: [],
    };
  }

  Object.assign(index.reports[reportName], metadata);
  return { ok: true };
}

// ============================================================================
// CLI INTERFACE
// ============================================================================

function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  const rootDir = process.cwd();

  const result = loadIdeationIndex(rootDir);
  if (!result.ok) {
    console.error(JSON.stringify({ ok: false, error: result.error }));
    process.exit(1);
  }

  const index = result.data;

  switch (command) {
    case 'summary': {
      const summary = getIndexSummary(index);
      console.log(JSON.stringify(summary, null, 2));
      break;
    }

    case 'status': {
      const status = args[1] || 'pending';
      const ideas = getIdeasByStatus(index, status);
      console.log(JSON.stringify(ideas, null, 2));
      break;
    }

    case 'recurring': {
      const recurring = getRecurringIdeas(index);
      console.log(JSON.stringify(recurring, null, 2));
      break;
    }

    case 'get': {
      const ideaId = args[1];
      if (!ideaId) {
        console.log(JSON.stringify({ ok: false, error: 'Idea ID required' }));
        break;
      }
      const idea = getIdeaById(index, ideaId);
      console.log(JSON.stringify(idea, null, 2));
      break;
    }

    case 'search': {
      const query = args[1];
      if (!query) {
        console.log(JSON.stringify({ ok: false, error: 'Search query required' }));
        break;
      }
      const ideas = searchIdeas(index, query);
      console.log(JSON.stringify(ideas, null, 2));
      break;
    }

    case 'help':
    default:
      console.log(`
Ideation Index - Idea tracking and deduplication

Commands:
  summary            Show index summary statistics
  status <status>    List ideas by status (pending|in-progress|implemented|rejected)
  recurring          List recurring ideas (seen 2+ times)
  get <id>           Get idea by ID (e.g., IDEA-0001)
  search <query>     Search ideas by title keyword
  help               Show this help

Examples:
  node ideation-index.js summary
  node ideation-index.js status pending
  node ideation-index.js recurring
  node ideation-index.js get IDEA-0001
  node ideation-index.js search "error handling"
`);
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  // Constants
  SCHEMA_VERSION,
  SIMILARITY_THRESHOLD,
  DEFAULT_INDEX_PATH,

  // Schema
  createEmptyIndex,
  validateAndMigrateIndex,

  // File I/O
  getIndexPath,
  loadIdeationIndex,
  saveIdeationIndex,

  // Fingerprinting & Similarity
  normalizeString,
  normalizeFiles,
  generateIdeaFingerprint,
  stringSimilarity,
  fileOverlap,
  calculateIdeaSimilarity,

  // Idea Management
  findDuplicates,
  addIdeaToIndex,
  updateIdeaStatus,

  // Queries
  getIdeasByStatus,
  getRecurringIdeas,
  getIndexSummary,
  getIdeaById,
  searchIdeas,
  updateReportMetadata,
};

// Run CLI if executed directly
if (require.main === module) {
  main();
}
