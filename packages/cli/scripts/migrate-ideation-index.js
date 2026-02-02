#!/usr/bin/env node

/**
 * migrate-ideation-index.js - Backfill ideation index from existing reports
 *
 * Parses all existing ideation reports (docs/08-project/ideation-*.md) and
 * populates the ideation index with ideas, detecting duplicates across reports
 * and linking to stories/epics where possible.
 *
 * Usage:
 *   node packages/cli/scripts/migrate-ideation-index.js [--dry-run]
 *
 * Options:
 *   --dry-run    Preview changes without writing to index
 */

const fs = require('fs');
const path = require('path');

const {
  loadIdeationIndex,
  saveIdeationIndex,
  addIdeaToIndex,
  updateReportMetadata,
  getIndexSummary,
} = require('./lib/ideation-index');

// ============================================================================
// PARSING UTILITIES
// ============================================================================

/**
 * Parse frontmatter-style header from ideation report
 * @param {string} content - Report content
 * @returns {object} Parsed metadata
 */
function parseReportHeader(content) {
  const metadata = {
    generated: null,
    scope: 'all',
    depth: 'deep',
    experts: [],
    totalIdeas: 0,
    highConfidence: 0,
    mediumConfidence: 0,
  };

  // Parse **Generated**: 2026-01-30
  const generatedMatch = content.match(/\*\*Generated\*\*:\s*(\d{4}-\d{2}-\d{2})/);
  if (generatedMatch) {
    metadata.generated = generatedMatch[1];
  }

  // Parse **Scope**: all
  const scopeMatch = content.match(/\*\*Scope\*\*:\s*(\w+)/);
  if (scopeMatch) {
    metadata.scope = scopeMatch[1].toLowerCase();
  }

  // Parse **Depth**: deep
  const depthMatch = content.match(/\*\*Depth\*\*:\s*(\w+)/);
  if (depthMatch) {
    metadata.depth = depthMatch[1].toLowerCase();
  }

  // Parse **Experts Consulted**: Security, Performance, Code Quality...
  const expertsMatch = content.match(/\*\*Experts Consulted\*\*:\s*([^\n]+)/);
  if (expertsMatch) {
    metadata.experts = expertsMatch[1].split(',').map(e => e.trim()).filter(Boolean);
  }

  // Parse **Total Ideas**: 30 raw / 22 after synthesis (High-Confidence: 8, Medium-Confidence: 14)
  const totalMatch = content.match(/\*\*Total Ideas\*\*:[^(]*\(High-Confidence:\s*(\d+),\s*Medium-Confidence:\s*(\d+)\)/);
  if (totalMatch) {
    metadata.highConfidence = parseInt(totalMatch[1], 10);
    metadata.mediumConfidence = parseInt(totalMatch[2], 10);
    metadata.totalIdeas = metadata.highConfidence + metadata.mediumConfidence;
  }

  return metadata;
}

/**
 * Parse ideas from markdown content
 * @param {string} content - Report content
 * @returns {Array<object>} Parsed ideas
 */
function parseIdeas(content) {
  const ideas = [];

  // Split by idea headers: ### 1. Title or ### {N}. Title
  const ideaPattern = /###\s*(\d+)\.\s*([^\n]+)/g;
  const matches = [...content.matchAll(ideaPattern)];

  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];
    const number = parseInt(match[1], 10);
    const title = match[2].trim();
    const startIndex = match.index;
    const endIndex = i < matches.length - 1 ? matches[i + 1].index : content.length;
    const ideaContent = content.substring(startIndex, endIndex);

    const idea = parseIdeaContent(title, ideaContent);
    idea.number = number;
    ideas.push(idea);
  }

  return ideas;
}

/**
 * Parse a single idea's content
 * @param {string} title - Idea title
 * @param {string} content - Idea markdown content
 * @returns {object} Parsed idea
 */
function parseIdeaContent(title, content) {
  const idea = {
    title: title.replace(/\[IDEA-\d+\]/g, '').trim(),
    category: null,
    impact: null,
    effort: null,
    experts: [],
    files: [],
    why: null,
    approach: null,
    confidence: 'MEDIUM',
  };

  // Parse **Category**: Security + Code Quality | **Impact**: High | **Effort**: 2-3 Days
  const categoryLine = content.match(/\*\*Category\*\*:\s*([^|]+)/);
  if (categoryLine) {
    idea.category = categoryLine[1].trim();
  }

  const impactMatch = content.match(/\*\*Impact\*\*:\s*(\w+)/);
  if (impactMatch) {
    idea.impact = impactMatch[1].trim();
  }

  const effortMatch = content.match(/\*\*Effort\*\*:\s*([^\n|]+)/);
  if (effortMatch) {
    idea.effort = effortMatch[1].trim();
  }

  // Parse **Experts**: Security, Code Quality (Refactor)
  const expertsMatch = content.match(/\*\*Experts?\*\*:\s*([^\n]+)/);
  if (expertsMatch) {
    idea.experts = expertsMatch[1].split(',').map(e => e.trim()).filter(Boolean);
    // If multiple experts, it's high confidence
    if (idea.experts.length >= 2) {
      idea.confidence = 'HIGH';
    }
  }

  // Parse **Files**: `packages/cli/lib/errors.js`, `packages/cli/tools/...`
  const filesMatch = content.match(/\*\*Files\*\*:\s*([^\n]+)/);
  if (filesMatch) {
    // Extract backtick-wrapped paths
    const pathMatches = filesMatch[1].match(/`([^`]+)`/g);
    if (pathMatches) {
      idea.files = pathMatches.map(p => p.replace(/`/g, '').trim());
    }
  }

  // Parse **Why**: One sentence...
  const whyMatch = content.match(/\*\*Why\*\*:\s*([^\n]+)/);
  if (whyMatch) {
    idea.why = whyMatch[1].trim();
  }

  // Parse **Approach**: Brief implementation approach...
  const approachMatch = content.match(/\*\*Approach\*\*:\s*([^\n]+(?:\n(?!\*\*)[^\n]+)*)/);
  if (approachMatch) {
    idea.approach = approachMatch[1].trim().replace(/\n/g, ' ');
  }

  // Determine confidence from section context
  // High-Confidence section contains "Agreed by multiple experts"
  // We'll set this externally based on which section the idea is in

  return idea;
}

/**
 * Detect which confidence section an idea is in
 * @param {string} content - Full report content
 * @param {number} ideaIndex - Character index where idea starts
 * @returns {string} 'HIGH' or 'MEDIUM'
 */
function detectConfidenceSection(content, ideaIndex) {
  // Find the last section header before this idea
  const highConfPattern = /##\s*(?:🎯\s*)?High-Confidence/gi;
  const medConfPattern = /##\s*(?:💡\s*)?Medium-Confidence/gi;

  let highConfIndex = -1;
  let medConfIndex = -1;

  let match;
  while ((match = highConfPattern.exec(content)) !== null) {
    if (match.index < ideaIndex) {
      highConfIndex = match.index;
    }
  }

  while ((match = medConfPattern.exec(content)) !== null) {
    if (match.index < ideaIndex) {
      medConfIndex = match.index;
    }
  }

  // Return whichever section header was most recently before this idea
  if (highConfIndex > medConfIndex) {
    return 'HIGH';
  } else if (medConfIndex > highConfIndex) {
    return 'MEDIUM';
  }

  // Default to medium if unclear
  return 'MEDIUM';
}

// ============================================================================
// STORY/EPIC LINKING
// ============================================================================

/**
 * Try to find linked stories for ideas by checking status.json
 * @param {string} rootDir - Project root
 * @param {string} reportName - Report filename
 * @returns {Map<string, object>} Map of idea titles to linked stories/epics
 */
function findLinkedStoriesForReport(rootDir, reportName) {
  const links = new Map();

  try {
    const statusPath = path.join(rootDir, 'docs/09-agents/status.json');
    if (!fs.existsSync(statusPath)) return links;

    const status = JSON.parse(fs.readFileSync(statusPath, 'utf8'));

    // Check epics for research field matching this report
    for (const [epicId, epic] of Object.entries(status.epics || {})) {
      if (epic.research && epic.research.includes(reportName.replace('.md', ''))) {
        // This epic is linked to this ideation report
        const stories = epic.stories || [];
        for (const storyId of stories) {
          // We don't have idea-to-story mapping, just note the epic link
          links.set(epicId, { epicId, storyIds: stories, epicTitle: epic.title });
        }
      }
    }
  } catch (err) {
    // Ignore errors, linking is best-effort
  }

  return links;
}

// ============================================================================
// MIGRATION
// ============================================================================

/**
 * Migrate all ideation reports to the index
 * @param {string} rootDir - Project root directory
 * @param {object} options - Options
 * @param {boolean} options.dryRun - Preview changes without writing
 * @returns {{ ok: boolean, stats: object, error?: string }}
 */
function migrateIdeationReports(rootDir, options = {}) {
  const { dryRun = false } = options;

  console.log('Ideation Index Migration');
  console.log('========================\n');

  // Load or create index
  const loadResult = loadIdeationIndex(rootDir);
  if (!loadResult.ok) {
    return { ok: false, error: loadResult.error };
  }

  const index = loadResult.data;

  // Find all ideation reports
  const reportsDir = path.join(rootDir, 'docs/08-project');
  if (!fs.existsSync(reportsDir)) {
    return { ok: false, error: `Reports directory not found: ${reportsDir}` };
  }

  const reportFiles = fs.readdirSync(reportsDir)
    .filter(f => f.startsWith('ideation-') && f.endsWith('.md'))
    .sort(); // Sort chronologically

  if (reportFiles.length === 0) {
    console.log('No ideation reports found in docs/08-project/');
    return { ok: true, stats: { reportsProcessed: 0, ideasAdded: 0, duplicates: 0 } };
  }

  console.log(`Found ${reportFiles.length} ideation reports\n`);

  const stats = {
    reportsProcessed: 0,
    ideasAdded: 0,
    duplicatesDetected: 0,
    errors: 0,
  };

  for (const reportFile of reportFiles) {
    const reportPath = path.join(reportsDir, reportFile);
    console.log(`Processing: ${reportFile}`);

    try {
      const content = fs.readFileSync(reportPath, 'utf8');

      // Parse report header
      const header = parseReportHeader(content);
      console.log(`  Generated: ${header.generated || 'unknown'}`);
      console.log(`  Scope: ${header.scope}, Depth: ${header.depth}`);

      // Parse ideas
      const ideas = parseIdeas(content);
      console.log(`  Found ${ideas.length} ideas`);

      // Detect confidence for each idea based on section
      for (const idea of ideas) {
        // Find the idea in the content to determine its position
        const ideaPattern = new RegExp(`###\\s*${idea.number}\\.\\s*${escapeRegex(idea.title.substring(0, 30))}`, 'i');
        const ideaMatch = content.match(ideaPattern);
        if (ideaMatch) {
          const sectionConf = detectConfidenceSection(content, ideaMatch.index);
          // Only override if we detected it and it wasn't already set by experts count
          if (idea.experts.length < 2) {
            idea.confidence = sectionConf;
          }
        }
      }

      // Update report metadata
      updateReportMetadata(index, reportFile, {
        generated: header.generated,
        scope: header.scope,
        depth: header.depth,
        experts: header.experts,
      });

      // Add ideas to index
      let reportIdeasAdded = 0;
      let reportDuplicates = 0;

      for (const idea of ideas) {
        const result = addIdeaToIndex(index, {
          title: idea.title,
          category: idea.category || 'Uncategorized',
          files: idea.files,
          confidence: idea.confidence,
          experts: idea.experts,
        }, reportFile);

        if (result.ok) {
          if (result.recurring) {
            reportDuplicates++;
            stats.duplicatesDetected++;
            if (!dryRun) {
              console.log(`    [RECURRING] ${result.id}: ${idea.title.substring(0, 50)}...`);
            }
          } else {
            reportIdeasAdded++;
            stats.ideasAdded++;
            if (!dryRun) {
              console.log(`    [NEW] ${result.id}: ${idea.title.substring(0, 50)}...`);
            }
          }
        } else {
          stats.errors++;
          console.log(`    [ERROR] ${idea.title}: ${result.error}`);
        }
      }

      console.log(`  Added: ${reportIdeasAdded}, Recurring: ${reportDuplicates}\n`);
      stats.reportsProcessed++;

    } catch (err) {
      console.log(`  ERROR: ${err.message}\n`);
      stats.errors++;
    }
  }

  // Try to link to epics (best-effort)
  console.log('Linking to epics...');
  try {
    const statusPath = path.join(rootDir, 'docs/09-agents/status.json');
    if (fs.existsSync(statusPath)) {
      const status = JSON.parse(fs.readFileSync(statusPath, 'utf8'));

      for (const [epicId, epic] of Object.entries(status.epics || {})) {
        if (epic.research && epic.research.includes('ideation-')) {
          const reportName = epic.research.endsWith('.md') ? epic.research : `${epic.research}.md`;
          if (index.reports[reportName]) {
            console.log(`  Linked ${epicId} to ${reportName}`);

            // Mark ideas from this report as potentially implemented if epic is complete
            if (epic.status === 'complete' && index.reports[reportName].ideas) {
              for (const ideaId of index.reports[reportName].ideas) {
                if (index.ideas[ideaId] && index.ideas[ideaId].status === 'pending') {
                  index.ideas[ideaId].linked_epic = epicId;
                  // Don't auto-mark as implemented, just link
                }
              }
            }
          }
        }
      }
    }
  } catch (err) {
    console.log(`  Warning: Could not link to epics: ${err.message}`);
  }

  // Save index
  if (!dryRun) {
    const saveResult = saveIdeationIndex(rootDir, index);
    if (!saveResult.ok) {
      return { ok: false, error: saveResult.error, stats };
    }
    console.log('\nIndex saved successfully.');
  } else {
    console.log('\n[DRY RUN] No changes written.');
  }

  // Print summary
  const summary = getIndexSummary(index);
  console.log('\n════════════════════════════════════════');
  console.log('Migration Summary');
  console.log('════════════════════════════════════════');
  console.log(`Reports processed:   ${stats.reportsProcessed}`);
  console.log(`Ideas added:         ${stats.ideasAdded}`);
  console.log(`Duplicates detected: ${stats.duplicatesDetected}`);
  console.log(`Errors:              ${stats.errors}`);
  console.log('');
  console.log(`Total ideas in index: ${summary.totalIdeas}`);
  console.log(`Total reports:        ${summary.totalReports}`);
  console.log(`Recurring ideas:      ${summary.recurringCount}`);
  console.log('');
  console.log('By Status:');
  for (const [status, count] of Object.entries(summary.byStatus)) {
    console.log(`  ${status}: ${count}`);
  }
  console.log('');
  console.log('By Category:');
  for (const [category, count] of Object.entries(summary.byCategory)) {
    console.log(`  ${category}: ${count}`);
  }

  return { ok: true, stats, summary };
}

/**
 * Escape special regex characters in a string
 * @param {string} str - String to escape
 * @returns {string} Escaped string
 */
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ============================================================================
// CLI
// ============================================================================

function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const rootDir = process.cwd();

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
migrate-ideation-index.js - Backfill ideation index from existing reports

Usage:
  node packages/cli/scripts/migrate-ideation-index.js [options]

Options:
  --dry-run    Preview changes without writing to index
  --help       Show this help

Description:
  Parses all ideation reports in docs/08-project/ideation-*.md and populates
  the ideation index at docs/00-meta/ideation-index.json with ideas, detecting
  duplicates across reports and linking to epics where possible.
`);
    process.exit(0);
  }

  const result = migrateIdeationReports(rootDir, { dryRun });

  if (!result.ok) {
    console.error(`\nMigration failed: ${result.error}`);
    process.exit(1);
  }

  process.exit(0);
}

// Run if executed directly
if (require.main === module) {
  main();
}

module.exports = {
  parseReportHeader,
  parseIdeas,
  parseIdeaContent,
  detectConfidenceSection,
  migrateIdeationReports,
};
