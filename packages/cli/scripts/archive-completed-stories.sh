#!/bin/bash

# archive-completed-stories.sh
# Automatically archives completed stories older than threshold from status.json

set -e

# Source shared utilities
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Source colors from canonical source (lib/colors.sh)
if [[ -f "$SCRIPT_DIR/lib/colors.sh" ]]; then
  source "$SCRIPT_DIR/lib/colors.sh"
  NC="$RESET"  # Alias for backwards compatibility
else
  # Fallback colors if colors.sh not available
  RED='\033[0;31m'
  GREEN='\033[0;32m'
  YELLOW='\033[1;33m'
  BLUE='\033[0;34m'
  NC='\033[0m'
fi

# Source JSON utilities if available
if [[ -f "$SCRIPT_DIR/lib/json-utils.sh" ]]; then
  source "$SCRIPT_DIR/lib/json-utils.sh"
fi

# Default paths (relative to project root)
DOCS_DIR="docs"
STATUS_FILE="$DOCS_DIR/09-agents/status.json"
ARCHIVE_DIR="$DOCS_DIR/09-agents/archive"
METADATA_FILE="$DOCS_DIR/00-meta/agileflow-metadata.json"

# Find project root (directory containing .agileflow)
PROJECT_ROOT="$(pwd)"
while [[ ! -d "$PROJECT_ROOT/.agileflow" ]] && [[ "$PROJECT_ROOT" != "/" ]]; do
  PROJECT_ROOT="$(dirname "$PROJECT_ROOT")"
done

if [[ "$PROJECT_ROOT" == "/" ]]; then
  echo -e "${RED}Error: Not in an AgileFlow project (no .agileflow directory found)${NC}"
  exit 1
fi

# Update paths to absolute
STATUS_FILE="$PROJECT_ROOT/$STATUS_FILE"
ARCHIVE_DIR="$PROJECT_ROOT/$ARCHIVE_DIR"
METADATA_FILE="$PROJECT_ROOT/$METADATA_FILE"

# Check if status.json exists
if [[ ! -f "$STATUS_FILE" ]]; then
  echo -e "${YELLOW}No status.json found at $STATUS_FILE${NC}"
  exit 0
fi

# Read archival settings
THRESHOLD_DAYS=7
ENABLED=true

if [[ -f "$METADATA_FILE" ]]; then
  # Use safeJsonParse if available (from json-utils.sh), otherwise fallback
  if declare -f safeJsonParse > /dev/null; then
    ENABLED=$(safeJsonParse "$METADATA_FILE" ".archival.enabled" "true")
    THRESHOLD_DAYS=$(safeJsonParse "$METADATA_FILE" ".archival.threshold_days" "7")
  elif command -v jq &> /dev/null; then
    ENABLED=$(jq -r '.archival.enabled // true' "$METADATA_FILE")
    THRESHOLD_DAYS=$(jq -r '.archival.threshold_days // 7' "$METADATA_FILE")
  elif command -v node &> /dev/null; then
    # Security: Pass file path via environment variable, not string interpolation
    ENABLED=$(METADATA_PATH="$METADATA_FILE" node -pe "JSON.parse(require('fs').readFileSync(process.env.METADATA_PATH, 'utf8')).archival?.enabled ?? true" 2>/dev/null || echo "true")
    THRESHOLD_DAYS=$(METADATA_PATH="$METADATA_FILE" node -pe "JSON.parse(require('fs').readFileSync(process.env.METADATA_PATH, 'utf8')).archival?.threshold_days ?? 7" 2>/dev/null || echo "7")
  fi
fi

if [[ "$ENABLED" != "true" ]]; then
  echo -e "${BLUE}Auto-archival is disabled${NC}"
  exit 0
fi

echo -e "${BLUE}Starting auto-archival (threshold: $THRESHOLD_DAYS days)...${NC}"

# Create archive directory if needed
mkdir -p "$ARCHIVE_DIR"

# Security: Validate archive directory is not a symlink pointing outside project
if [[ -L "$ARCHIVE_DIR" ]]; then
  RESOLVED_ARCHIVE=$(readlink -f "$ARCHIVE_DIR" 2>/dev/null || realpath "$ARCHIVE_DIR" 2>/dev/null)
  if [[ ! "$RESOLVED_ARCHIVE" == "$PROJECT_ROOT"* ]]; then
    echo -e "${RED}Error: Archive directory symlink points outside project. Aborting.${NC}"
    exit 1
  fi
fi

# Calculate cutoff date (threshold days ago)
if [[ "$OSTYPE" == "darwin"* ]]; then
  # macOS
  CUTOFF_DATE=$(date -v-${THRESHOLD_DAYS}d -u +"%Y-%m-%dT%H:%M:%S.000Z")
else
  # Linux
  CUTOFF_DATE=$(date -u -d "$THRESHOLD_DAYS days ago" +"%Y-%m-%dT%H:%M:%S.000Z")
fi

echo -e "${BLUE}Cutoff date: $CUTOFF_DATE${NC}"

# Archive using Node.js (more reliable for JSON manipulation)
if command -v node &> /dev/null; then
  STATUS_FILE="$STATUS_FILE" ARCHIVE_DIR="$ARCHIVE_DIR" CUTOFF_DATE="$CUTOFF_DATE" node <<'EOF'
const fs = require('fs');
const path = require('path');

const statusFile = process.env.STATUS_FILE;
const archiveDir = process.env.ARCHIVE_DIR;
const cutoffDate = process.env.CUTOFF_DATE;

// Read status.json
const status = JSON.parse(fs.readFileSync(statusFile, 'utf8'));
const stories = status.stories || {};

// Find stories to archive
const toArchive = {};
const toKeep = {};
let archivedCount = 0;

for (const [storyId, story] of Object.entries(stories)) {
  if (story.status === 'completed' && story.completed_at) {
    if (story.completed_at < cutoffDate) {
      toArchive[storyId] = story;
      archivedCount++;
    } else {
      toKeep[storyId] = story;
    }
  } else {
    toKeep[storyId] = story;
  }
}

if (archivedCount === 0) {
  console.log('\x1b[33mNo stories to archive\x1b[0m');
  process.exit(0);
}

// Group archived stories by month
const byMonth = {};
for (const [storyId, story] of Object.entries(toArchive)) {
  const date = new Date(story.completed_at);
  const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

  // Security: Validate monthKey matches expected format (YYYY-MM) to prevent path traversal
  if (!/^\d{4}-\d{2}$/.test(monthKey)) {
    console.error(`\x1b[31mSkipping story ${storyId}: invalid date format\x1b[0m`);
    continue;
  }

  if (!byMonth[monthKey]) {
    byMonth[monthKey] = {
      month: monthKey,
      archived_at: new Date().toISOString(),
      stories: {}
    };
  }

  byMonth[monthKey].stories[storyId] = story;
}

// Write archive files
for (const [monthKey, archiveData] of Object.entries(byMonth)) {
  const archiveFile = path.join(archiveDir, `${monthKey}.json`);

  // Security: Verify resolved path stays within archive directory
  const resolvedPath = path.resolve(archiveFile);
  const resolvedArchiveDir = path.resolve(archiveDir);
  if (!resolvedPath.startsWith(resolvedArchiveDir + path.sep) && resolvedPath !== resolvedArchiveDir) {
    console.error(`\x1b[31mSecurity: Archive path ${archiveFile} escapes archive directory. Skipping.\x1b[0m`);
    continue;
  }

  // Merge with existing archive if it exists
  if (fs.existsSync(archiveFile)) {
    try {
      const existing = JSON.parse(fs.readFileSync(archiveFile, 'utf8'));
      archiveData.stories = { ...existing.stories, ...archiveData.stories };
    } catch (e) {
      console.error(`\x1b[31mWarning: Could not parse existing ${monthKey}.json, will overwrite\x1b[0m`);
    }
  }

  fs.writeFileSync(archiveFile, JSON.stringify(archiveData, null, 2));
  const count = Object.keys(archiveData.stories).length;
  console.log(`\x1b[32m✓ Archived ${count} stories to ${monthKey}.json\x1b[0m`);
}

// Update status.json
status.stories = toKeep;
status.updated = new Date().toISOString();
fs.writeFileSync(statusFile, JSON.stringify(status, null, 2));

console.log(`\x1b[32m✓ Removed ${archivedCount} archived stories from status.json\x1b[0m`);
console.log(`\x1b[34mStories remaining: ${Object.keys(toKeep).length}\x1b[0m`);
EOF

  echo -e "${GREEN}Auto-archival complete!${NC}"
else
  echo -e "${RED}Error: Node.js not found. Cannot perform archival.${NC}"
  exit 1
fi

exit 0
