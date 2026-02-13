#!/bin/bash
#
# AgileFlow PreCompact Hook
# Outputs critical context that should survive conversation compaction.
#
# Supports two modes:
# 1. Default: Extract COMPACT_SUMMARY sections from active command files
# 2. Experimental (fullFileInjection): Inject entire command files (more context, may be more reliable)
#

# Track start time for hook metrics
HOOK_START_TIME=$(date +%s%3N 2>/dev/null || date +%s)
# macOS date doesn't support %N - outputs literal "3N" instead of millis
[[ ! "$HOOK_START_TIME" =~ ^[0-9]+$ ]] && HOOK_START_TIME="$(date +%s)000"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Get current version from package.json
VERSION=$(node -p "require('./package.json').version" 2>/dev/null || echo "unknown")

# Check if experimental full-file injection mode is enabled
FULL_FILE_INJECTION=$(node -p "
  try {
    const meta = require('./docs/00-meta/agileflow-metadata.json');
    meta.features?.experimental?.fullFileInjection === true ? 'true' : 'false';
  } catch { 'false'; }
" 2>/dev/null || echo "false")

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
# IMPORTANT: Skip "output-only" commands like research:ask, research:list, research:view
# These commands generate output for the user to copy - they're not ongoing tasks.
# If we include them in PreCompact, Claude will try to re-execute them after compact.
COMMAND_SUMMARIES=""
if [ -f "docs/09-agents/session-state.json" ]; then
  # Output-only commands that should NOT be preserved during compact
  # These commands generate output once and are done - no ongoing state
  # Note: Commands with type: output-only in frontmatter are also filtered
  OUTPUT_ONLY_COMMANDS="research/ask research/list research/view help metrics board"

  ACTIVE_COMMANDS=$(node -p "
    const s = require('./docs/09-agents/session-state.json');
    const outputOnly = '$OUTPUT_ONLY_COMMANDS'.split(' ');
    (s.active_commands || [])
      .filter(c => !outputOnly.includes(c.name) && c.type !== 'output-only')
      .map(c => c.name)
      .join(' ');
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
      # Security: Validate COMMAND_FILE contains only safe characters (alphanumeric, /, -, _, .)
      # and doesn't contain path traversal sequences
      if [[ "$COMMAND_FILE" =~ ^[a-zA-Z0-9/_.-]+$ ]] && [[ ! "$COMMAND_FILE" =~ \.\. ]]; then
        if [ "$FULL_FILE_INJECTION" = "true" ]; then
          # EXPERIMENTAL: Inject the entire command file content
          SUMMARY=$(COMMAND_FILE_PATH="$COMMAND_FILE" ACTIVE_CMD="$ACTIVE_COMMAND" node -e "
            const fs = require('fs');
            const filePath = process.env.COMMAND_FILE_PATH;
            const activeCmd = process.env.ACTIVE_CMD;
            // Double-check: only allow paths within expected directories
            const allowedPrefixes = ['packages/cli/src/core/commands/', '.agileflow/commands/', '.claude/commands/agileflow/'];
            if (!allowedPrefixes.some(p => filePath.startsWith(p))) {
              process.exit(1);
            }
            try {
              const content = fs.readFileSync(filePath, 'utf8');
              console.log('## ⚠️ FULL COMMAND FILE (EXPERIMENTAL MODE): /agileflow:' + activeCmd);
              console.log('');
              console.log('The following is the COMPLETE command file. Follow ALL instructions below.');
              console.log('');
              console.log('---');
              console.log('');
              console.log(content);
            } catch (e) {}
          " 2>/dev/null || echo "")
        else
          # Default: Extract only the compact summary section
          SUMMARY=$(COMMAND_FILE_PATH="$COMMAND_FILE" ACTIVE_CMD="$ACTIVE_COMMAND" node -e "
            const fs = require('fs');
            const filePath = process.env.COMMAND_FILE_PATH;
            const activeCmd = process.env.ACTIVE_CMD;
            // Double-check: only allow paths within expected directories
            const allowedPrefixes = ['packages/cli/src/core/commands/', '.agileflow/commands/', '.claude/commands/agileflow/'];
            if (!allowedPrefixes.some(p => filePath.startsWith(p))) {
              process.exit(1);
            }
            try {
              const content = fs.readFileSync(filePath, 'utf8');
              const match = content.match(/<!-- COMPACT_SUMMARY_START[\\s\\S]*?-->([\\s\\S]*?)<!-- COMPACT_SUMMARY_END -->/);
              if (match) {
                console.log('## ACTIVE COMMAND: /agileflow:' + activeCmd);
                console.log('');
                console.log(match[1].trim());
              }
            } catch (e) {}
          " 2>/dev/null || echo "")
        fi
      fi

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

# Output Task Orchestration State section
echo ""
echo "## Task Orchestration State"
TASK_STATE=$(node -e "
  const path = require('path');
  const fs = require('fs');

  // Try to load task registry
  try {
    const taskRegistryPath = path.join(process.cwd(), '.agileflow', 'state', 'task-dependencies.json');
    if (!fs.existsSync(taskRegistryPath)) {
      console.log('No active task orchestration');
      process.exit(0);
    }

    const taskState = JSON.parse(fs.readFileSync(taskRegistryPath, 'utf8'));
    const tasks = Object.values(taskState.tasks || {});

    if (tasks.length === 0) {
      console.log('No active task orchestration');
      process.exit(0);
    }

    // Group by state
    const running = tasks.filter(t => t.state === 'running');
    const queued = tasks.filter(t => t.state === 'queued');
    const blocked = tasks.filter(t => t.state === 'blocked');

    // If no active tasks (all completed/failed/cancelled), show no activity
    if (running.length === 0 && queued.length === 0 && blocked.length === 0) {
      console.log('No active task orchestration');
      process.exit(0);
    }

    console.log('### Active Task Graph');
    console.log('');

    if (running.length > 0) {
      console.log('**Running (' + running.length + '):**');
      running.forEach(t => {
        console.log('- ' + t.id + ': ' + (t.description || 'No description').slice(0, 50));
        if (t.subagent_type) console.log('  Agent: ' + t.subagent_type);
        if (t.metadata?.claude_task_id) console.log('  Claude ID: ' + t.metadata.claude_task_id + ' (use TaskOutput to check)');
        if (t.story_id) console.log('  Story: ' + t.story_id);
      });
      console.log('');
    }

    if (queued.length > 0) {
      console.log('**Queued (' + queued.length + '):**');
      queued.slice(0, 5).forEach(t => {
        console.log('- ' + t.id + ': ' + (t.description || 'No description').slice(0, 50));
        if (t.story_id) console.log('  Story: ' + t.story_id);
      });
      if (queued.length > 5) console.log('  ... and ' + (queued.length - 5) + ' more');
      console.log('');
    }

    if (blocked.length > 0) {
      console.log('**Blocked (' + blocked.length + '):**');
      blocked.slice(0, 3).forEach(t => {
        console.log('- ' + t.id + ' (blocked by: ' + (t.blockedBy || []).join(', ') + ')');
      });
      console.log('');
    }

    // Show dependency graph summary
    const withDeps = tasks.filter(t => (t.blockedBy || []).length > 0);
    if (withDeps.length > 0) {
      console.log('**Dependency Chain:**');
      console.log('Task state file: .agileflow/state/task-dependencies.json');
      console.log('Use TaskOutput to collect results from running tasks.');
    }
  } catch (e) {
    // Error reading/parsing - show no activity
    console.log('No active task orchestration');
  }
" 2>/dev/null || echo "No active task orchestration")
echo "$TASK_STATE"

cat << EOF

## Post-Compact Actions
1. Re-read CLAUDE.md if unsure about conventions
2. Check status.json for current story state
3. Review docs/02-practices/ for implementation patterns
4. Check git log for recent changes
5. If tasks were running, use TaskOutput to check results
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

# Record hook metrics
if command -v node &> /dev/null && [[ -f "$SCRIPT_DIR/lib/hook-metrics.js" ]]; then
  HOOK_END_TIME=$(date +%s%3N 2>/dev/null || date +%s)
  [[ ! "$HOOK_END_TIME" =~ ^[0-9]+$ ]] && HOOK_END_TIME="$(date +%s)000"
  HOOK_DURATION=$((HOOK_END_TIME - HOOK_START_TIME))
  HOOK_DURATION="$HOOK_DURATION" node -e '
    try {
      const hookMetrics = require("'"$SCRIPT_DIR"'/lib/hook-metrics.js");
      const timer = {
        hookEvent: "PreCompact",
        hookName: "context",
        startTime: Date.now() - parseInt(process.env.HOOK_DURATION || "0"),
      };
      hookMetrics.recordHookMetrics(timer, "success");
    } catch (e) {
      // Silently ignore metrics errors
    }
  ' 2>/dev/null || true
fi
