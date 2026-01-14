#!/bin/bash
#
# AgileFlow PreCompact Hook
# Outputs critical context that should survive conversation compaction.
#

# Get current version from package.json
VERSION=$(node -p "require('./package.json').version" 2>/dev/null || echo "unknown")

# Get current git branch
BRANCH=$(git branch --show-current 2>/dev/null || echo "unknown")

# Get current story from status.json
CURRENT_STORY=""
WIP_COUNT=0
if [ -f "docs/09-agents/status.json" ]; then
  CURRENT_STORY=$(node -p "
    const s = require('./docs/09-agents/status.json');
    const stories = Object.entries(s.stories || {})
      .filter(([,v]) => v.status === 'in_progress')
      .map(([k,v]) => k + ': ' + v.title)
      .join(', ');
    stories || 'None in progress';
  " 2>/dev/null || echo "Unable to read")

  WIP_COUNT=$(node -p "
    const s = require('./docs/09-agents/status.json');
    Object.values(s.stories || {}).filter(v => v.status === 'in_progress').length;
  " 2>/dev/null || echo "0")
fi

# Get practices list
PRACTICES=""
if [ -d "docs/02-practices" ]; then
  PRACTICES=$(ls docs/02-practices/*.md 2>/dev/null | head -8 | xargs -I {} basename {} .md | tr '\n' ',' | sed 's/,$//')
fi

# Get active epics
EPICS=""
if [ -d "docs/05-epics" ]; then
  EPICS=$(ls docs/05-epics/ 2>/dev/null | head -5 | tr '\n' ',' | sed 's/,$//')
fi

# Detect active commands and extract their Compact Summaries
COMMAND_SUMMARIES=""
if [ -f "docs/09-agents/session-state.json" ]; then
  ACTIVE_COMMANDS=$(node -p "
    const s = require('./docs/09-agents/session-state.json');
    (s.active_commands || []).map(c => c.name).join(' ');
  " 2>/dev/null || echo "")

  for ACTIVE_COMMAND in $ACTIVE_COMMANDS; do
    [ -z "$ACTIVE_COMMAND" ] && continue

    COMMAND_FILE=""
    if [ -f "packages/cli/src/core/commands/${ACTIVE_COMMAND}.md" ]; then
      COMMAND_FILE="packages/cli/src/core/commands/${ACTIVE_COMMAND}.md"
    elif [ -f ".agileflow/commands/${ACTIVE_COMMAND}.md" ]; then
      COMMAND_FILE=".agileflow/commands/${ACTIVE_COMMAND}.md"
    elif [ -f ".claude/commands/agileflow/${ACTIVE_COMMAND}.md" ]; then
      COMMAND_FILE=".claude/commands/agileflow/${ACTIVE_COMMAND}.md"
    fi

    if [ ! -z "$COMMAND_FILE" ]; then
      SUMMARY=$(node -e "
        const fs = require('fs');
        const content = fs.readFileSync('$COMMAND_FILE', 'utf8');
        const match = content.match(/<!-- COMPACT_SUMMARY_START[\\s\\S]*?-->([\\s\\S]*?)<!-- COMPACT_SUMMARY_END -->/);
        if (match) {
          console.log('## ACTIVE COMMAND: /agileflow:${ACTIVE_COMMAND}');
          console.log('');
          console.log(match[1].trim());
        }
      " 2>/dev/null || echo "")

      if [ ! -z "$SUMMARY" ]; then
        COMMAND_SUMMARIES="${COMMAND_SUMMARIES}

${SUMMARY}"
      fi
    fi
  done
fi

# Output context
cat << EOF
AGILEFLOW PROJECT CONTEXT (preserve during compact):

## Project Status
- Project: AgileFlow v${VERSION}
- Branch: ${BRANCH}
- Active Stories: ${CURRENT_STORY}
- WIP Count: ${WIP_COUNT}

## Key Files to Check After Compact
- CLAUDE.md - Project system prompt with conventions
- README.md - Project overview and setup
- docs/09-agents/status.json - Story statuses and assignments
- docs/02-practices/ - Codebase practices (${PRACTICES:-check folder})

## Active Epics
${EPICS:-Check docs/05-epics/ for epic files}

## Key Conventions (from CLAUDE.md)
$(grep -A 15 "## Key\|## Critical\|## Important\|CRITICAL:" CLAUDE.md 2>/dev/null | head -20 || echo "- Read CLAUDE.md for project conventions")

## Recent Agent Activity
$(tail -3 docs/09-agents/bus/log.jsonl 2>/dev/null | head -3 || echo "")
EOF

# Output active command summaries
if [ ! -z "$COMMAND_SUMMARIES" ]; then
  echo "$COMMAND_SUMMARIES"
fi

cat << EOF

## Post-Compact Actions
1. Re-read CLAUDE.md if unsure about conventions
2. Check status.json for current story state
3. Review docs/02-practices/ for implementation patterns
4. Check git log for recent changes
EOF

# Mark that PreCompact just ran - tells SessionStart to preserve active_commands
# This prevents the welcome script from clearing commands right after compact
if [ -f "docs/09-agents/session-state.json" ]; then
  node -e "
    const fs = require('fs');
    const path = 'docs/09-agents/session-state.json';
    try {
      const state = JSON.parse(fs.readFileSync(path, 'utf8'));
      state.last_precompact_at = new Date().toISOString();
      fs.writeFileSync(path, JSON.stringify(state, null, 2) + '\n');
    } catch (e) {}
  " 2>/dev/null
fi
