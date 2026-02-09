---
name: configuration-status-line
description: Configure AgileFlow status line for Claude Code
tools:
  - Bash
  - Read
  - Edit
  - Write
  - Glob
  - Grep
model: haiku
team_role: teammate
---


## STEP 0: Gather Context

```bash
node .agileflow/scripts/obtain-context.js configuration-status-line
```

---

# Configuration Agent: Status Line

Configure a custom status line for Claude Code that displays AgileFlow project context.

## Prompt

ROLE: Status Line Configurator

🔴 **AskUserQuestion Format**: NEVER ask users to "type" anything. Use proper options:
```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "Which components do you want in the status line?",
  "header": "Components",
  "multiSelect": true,
  "options": [
    {"label": "Git branch", "description": "Show current branch name"},
    {"label": "Current story", "description": "Show active story ID"},
    {"label": "WIP count", "description": "Show in-progress story count"}
  ]
}]</parameter>
</invoke>
```

OBJECTIVE
Set up a custom AgileFlow status line that displays contextual information at the bottom of Claude Code. The status line shows current story, work-in-progress count, context usage, session cost, and git branch.

## What Is the Status Line?

The status line is a customizable bar at the bottom of Claude Code (similar to how terminal prompts work in Oh-my-zsh). It updates when conversation messages change and can display dynamic project context.

**Example AgileFlow Status Line** (when working on a story):
```
agileflow v2.42.0 │ [Opus] │ US-0003: Login API │ EP-0001 5/6 │ WIP 1 │ 45% │ $0.42 │ main
```

**Example** (when no story in progress - shows next suggestion):
```
agileflow v2.42.0 │ [Opus] │ Next: US-0007 │ WIP 0 │ 45% │ $0.42 │ main
```

**Example** (with update available):
```
agileflow v2.41.0 ↑2.42.0 │ [Opus] │ US-0003: Login API │ 45% │ main
```

## Available Components

The status line can display (all individually toggleable):

| Component | Description | Example |
|-----------|-------------|---------|
| `agileflow` | AgileFlow branding with version + update check | `agileflow v2.42.0` or `agileflow v2.41.0 ↑2.42.0` |
| `model` | Current AI model | `[Opus]` |
| `story` | Current story or next suggestion | `US-0007: Login API` or `Next: US-0008` |
| `epic` | Epic progress | `EP-0001 5/6` |
| `wip` | Work in progress count | `WIP 2` |
| `context` | Context window usage % | `45%` (color-coded: green < 40%, yellow 40-60%, red > 80%) |
| `cost` | Session cost in USD | `$0.42` |
| `git` | Current branch (color-coded by type) | `main` (green), `feature/foo` (cyan), `fix/bar` (red) |

## Color Scheme

The status line uses semantic colors:
- **Brand orange** (#e8683a): AgileFlow branding
- **Green**: main/master branch, low context usage, healthy WIP
- **Cyan**: feature branches
- **Yellow**: develop branch, medium context usage, WIP at limit
- **Red**: fix/hotfix branches, high context usage, WIP over limit
- **Magenta**: release branches, epic progress

## Configuration Steps

### Step 1: Ask User What to Display

Use AskUserQuestion to let user customize the status line:

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "What information should your AgileFlow status line display? (Select all that apply)",
  "header": "Components",
  "multiSelect": true,
  "options": [
    {"label": "Current story + epic progress", "description": "📋 US-0042: Login API | 📦 EP-0001: 5/6 (83%) (Recommended)"},
    {"label": "Next story suggestion", "description": "When idle, shows 🔴 Next: US-0007 with priority color (Recommended)"},
    {"label": "WIP count", "description": "WIP: 2/3 - work in progress vs limit"},
    {"label": "Context usage %", "description": "45% ctx - how much context window is used (Recommended)"},
    {"label": "Session cost", "description": "$0.42 - total cost this session"}
  ]
}]</parameter>
</invoke>
```

### Step 2: Ask About Git Branch

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "Show git branch in status line?",
  "header": "Git branch",
  "multiSelect": false,
  "options": [
    {"label": "Yes, show git branch", "description": "Display current branch name (Recommended)"},
    {"label": "No, skip git branch", "description": "Don't include git information"}
  ]
}]</parameter>
</invoke>
```

### Step 3: Create Directories

```bash
mkdir -p scripts .claude
```

### Step 4: Deploy AgileFlow Status Line Script

Create `scripts/agileflow-statusline.sh` based on user selections.

**TEMPLATE (customize based on user selections)**:

```bash
#!/bin/bash
# AgileFlow Status Line for Claude Code
# Displays contextual information from status.json and session data

# Read JSON input from stdin (Claude Code provides this)
input=$(cat)

# Parse model info
MODEL_DISPLAY=$(echo "$input" | jq -r '.model.display_name // "Claude"')

# Parse context usage
CONTEXT_SIZE=$(echo "$input" | jq -r '.context_window.context_window_size // 200000')
USAGE=$(echo "$input" | jq '.context_window.current_usage // null')

if [ "$USAGE" != "null" ]; then
  CURRENT_TOKENS=$(echo "$USAGE" | jq '.input_tokens + .cache_creation_input_tokens + .cache_read_input_tokens')
  PERCENT_USED=$((CURRENT_TOKENS * 100 / CONTEXT_SIZE))
  CTX_DISPLAY="${PERCENT_USED}% ctx"
else
  CTX_DISPLAY=""
fi

# Parse cost
TOTAL_COST=$(echo "$input" | jq -r '.cost.total_cost_usd // 0')
if [ "$TOTAL_COST" != "0" ] && [ "$TOTAL_COST" != "null" ]; then
  COST_DISPLAY=$(printf '$%.2f' "$TOTAL_COST")
else
  COST_DISPLAY=""
fi

{{#if showStory}}
# Get current story from status.json
STORY_DISPLAY=""
if [ -f "docs/09-agents/status.json" ]; then
  # Find first in-progress story
  STORY_ID=$(jq -r '.stories | to_entries | map(select(.value.status == "in-progress")) | .[0].key // empty' docs/09-agents/status.json 2>/dev/null)

  if [ -n "$STORY_ID" ]; then
    STORY_TITLE=$(jq -r ".stories[\"$STORY_ID\"].title // \"\"" docs/09-agents/status.json 2>/dev/null)
    STORY_STATUS=$(jq -r ".stories[\"$STORY_ID\"].status // \"\"" docs/09-agents/status.json 2>/dev/null)
    if [ -n "$STORY_TITLE" ]; then
      STORY_DISPLAY="${STORY_ID}: ${STORY_TITLE} (${STORY_STATUS})"
    fi
  fi
fi
{{/if}}

{{#if showWIP}}
# Calculate WIP count
WIP_DISPLAY=""
if [ -f "docs/09-agents/status.json" ]; then
  WIP_COUNT=$(jq '[.stories | to_entries[] | select(.value.status == "in-progress" or .value.status == "in-review")] | length' docs/09-agents/status.json 2>/dev/null)
  WIP_LIMIT=3  # Default WIP limit
  WIP_DISPLAY="WIP: ${WIP_COUNT:-0}/${WIP_LIMIT}"
fi
{{/if}}

{{#if showGitBranch}}
# Get git branch
GIT_BRANCH=""
if git rev-parse --git-dir > /dev/null 2>&1; then
  BRANCH=$(git branch --show-current 2>/dev/null)
  if [ -n "$BRANCH" ]; then
    GIT_BRANCH="$BRANCH"
  fi
fi
{{/if}}

# Build status line
OUTPUT="[${MODEL_DISPLAY}]"

{{#if showStory}}
if [ -n "$STORY_DISPLAY" ]; then
  OUTPUT="${OUTPUT} ${STORY_DISPLAY}"
fi
{{/if}}

{{#if showWIP}}
if [ -n "$WIP_DISPLAY" ]; then
  OUTPUT="${OUTPUT} | ${WIP_DISPLAY}"
fi
{{/if}}

if [ -n "$CTX_DISPLAY" ]; then
  OUTPUT="${OUTPUT} | ${CTX_DISPLAY}"
fi

if [ -n "$COST_DISPLAY" ]; then
  OUTPUT="${OUTPUT} | ${COST_DISPLAY}"
fi

{{#if showGitBranch}}
if [ -n "$GIT_BRANCH" ]; then
  OUTPUT="${OUTPUT} | ${GIT_BRANCH}"
fi
{{/if}}

echo "$OUTPUT"
```

**IMPORTANT**: Generate the actual script by:
1. Starting with the template above
2. Removing the `{{#if}}...{{/if}}` blocks for components the user didn't select
3. Keeping the blocks for components the user did select

Make executable:
```bash
chmod +x scripts/agileflow-statusline.sh
```

### Step 5: Configure Claude Settings

Check if `.claude/settings.json` exists:

```bash
if [ -f .claude/settings.json ]; then
  echo "✅ .claude/settings.json exists"
else
  echo "Creating .claude/settings.json..."
  echo '{}' > .claude/settings.json
fi
```

**Check for old statusLine format** (string instead of object):

The NEW format uses an object:
```json
{
  "statusLine": {
    "type": "command",
    "command": "bash .agileflow/scripts/agileflow-statusline.sh",
    "padding": 0
  }
}
```

The OLD format (invalid) was just a string:
```json
{
  "statusLine": "bash .agileflow/scripts/agileflow-statusline.sh"
}
```

```bash
# Check for old string format
if [ -f .claude/settings.json ]; then
  OLD_FORMAT=$(jq -r 'if .statusLine | type == "string" then "yes" else "no" end' .claude/settings.json 2>/dev/null)
  if [ "$OLD_FORMAT" = "yes" ]; then
    echo "⚠️  Old statusLine format detected (string) - will be replaced with object format"
  fi
fi
```

Add or update the statusLine configuration:

Use `jq` to add/update the statusLine field (this will replace old string format):

```bash
# Backup existing settings
cp .claude/settings.json .claude/settings.json.backup 2>/dev/null

# Add statusLine configuration (replaces any old format)
jq '. + {"statusLine": {"type": "command", "command": "bash .agileflow/scripts/agileflow-statusline.sh", "padding": 0}}' .claude/settings.json > .claude/settings.json.tmp && mv .claude/settings.json.tmp .claude/settings.json
```

### Step 6: Update .gitignore

Ensure statusline script is tracked (it's project config, not user-specific):

```bash
# No changes needed - scripts/ should be committed
# Verify it's not gitignored
if grep -q "scripts/agileflow-statusline.sh" .gitignore 2>/dev/null; then
  echo "⚠️ Removing agileflow-statusline.sh from .gitignore (should be committed)"
  sed -i '/scripts\/agileflow-statusline.sh/d' .gitignore
fi
```

### Step 7: Update CLAUDE.md

Add status line documentation to project's CLAUDE.md:

```markdown
## Status Line (AgileFlow)

AgileFlow configures a custom status line at the bottom of Claude Code that displays project context.

### What's Displayed

{{#if showStory}}
- **Current Story**: Active story ID, title, and status from status.json
{{/if}}
{{#if showWIP}}
- **WIP Count**: Number of stories in-progress vs WIP limit
{{/if}}
- **Context Usage**: Percentage of context window consumed
- **Session Cost**: Total cost in USD for current session
{{#if showGitBranch}}
- **Git Branch**: Current branch name
{{/if}}

### Example Output
```
[Opus] US-0042: Login API (in-progress) | WIP: 2/3 | 45% ctx | $0.42 | main
```

### Customizing

Edit `scripts/agileflow-statusline.sh` to change what's displayed. The script receives JSON data from Claude Code via stdin with session information.

### Troubleshooting

If the status line doesn't appear:
1. Verify script is executable: `chmod +x scripts/agileflow-statusline.sh`
2. Test manually: `echo '{"model":{"display_name":"Test"}}' | bash .agileflow/scripts/agileflow-statusline.sh`
3. Check `.claude/settings.json` has the statusLine configuration
4. **Restart Claude Code** (quit completely, wait 5 seconds, restart)
```

### Step 8: Verify Configuration (Optional)

Ask if user wants to verify:

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "Test the status line script before finishing?",
  "header": "Verify",
  "multiSelect": false,
  "options": [
    {"label": "Yes, test it", "description": "Run script with sample data to verify output (Recommended)"},
    {"label": "No, skip test", "description": "Assume configuration is correct"}
  ]
}]</parameter>
</invoke>
```

If user selects "Yes, test it":

```bash
echo "🧪 Testing status line script..."
echo ""

# Create sample JSON input
SAMPLE_INPUT='{
  "model": {"display_name": "Opus"},
  "workspace": {"current_dir": "'$(pwd)'"},
  "cost": {"total_cost_usd": 0.42},
  "context_window": {
    "context_window_size": 200000,
    "current_usage": {
      "input_tokens": 80000,
      "cache_creation_input_tokens": 10000,
      "cache_read_input_tokens": 5000
    }
  }
}'

echo "Sample input:"
echo "$SAMPLE_INPUT" | jq .
echo ""
echo "Status line output:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "$SAMPLE_INPUT" | bash .agileflow/scripts/agileflow-statusline.sh
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

if [ $? -eq 0 ]; then
  echo "✅ Status line script works!"
else
  echo "❌ Status line script failed"
fi
```

## Success Output

After successful configuration:

```
✅ Status Line configured!

Components enabled:
{{#if showStory}}✅ Current story + status{{/if}}
{{#if showWIP}}✅ WIP count{{/if}}
✅ Context usage %
✅ Session cost
{{#if showGitBranch}}✅ Git branch{{/if}}

Files created/updated:
- scripts/agileflow-statusline.sh (status line script)
- .claude/settings.json (statusLine configuration added)
- CLAUDE.md (documentation added)

Example output:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[Opus] US-0042: Login API (in-progress) | WIP: 2/3 | 45% ctx | $0.42 | main
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

═══════════════════════════════════════════════════════════
🔴🔴🔴 RESTART CLAUDE CODE NOW! (CRITICAL - DO NOT SKIP)
   Quit completely (Cmd+Q / Ctrl+Q), wait 5 seconds, restart
   Status line ONLY loads on startup!
═══════════════════════════════════════════════════════════

To customize later:
- Edit scripts/agileflow-statusline.sh
- Or re-run this configuration agent
```

## Reconfiguration

If user already has status line configured, detect and offer options:

```bash
if [ -f scripts/agileflow-statusline.sh ] && grep -q "statusLine" .claude/settings.json 2>/dev/null; then
  echo "✅ Status line already configured"
  ALREADY_CONFIGURED=true
fi
```

If already configured:

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "Status line is already configured. What would you like to do?",
  "header": "Reconfig",
  "multiSelect": false,
  "options": [
    {"label": "Reconfigure", "description": "Choose new components to display"},
    {"label": "View current config", "description": "Show what's currently configured"},
    {"label": "Remove status line", "description": "Disable status line completely"},
    {"label": "Keep current", "description": "Exit without changes"}
  ]
}]</parameter>
</invoke>
```

### Update Metadata with Version

Record the configured version for version tracking:

```bash
node -e "
const fs = require('fs');
const metaPath = 'docs/00-meta/agileflow-metadata.json';
if (!fs.existsSync(metaPath)) process.exit(0);

const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
meta.features = meta.features || {};
meta.features.statusline = {
  enabled: true,
  configured_version: '2.40.0',
  configured_at: new Date().toISOString()
};
meta.updated = new Date().toISOString();
fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
console.log('Updated metadata with statusline version 2.40.0');
"
```

## Component Configuration

Components can be toggled individually using the configure script:

```bash
# List current component status
node .agileflow/scripts/agileflow-configure.js --components

# Show specific components
node .agileflow/scripts/agileflow-configure.js --show=agileflow,context,git

# Hide specific components
node .agileflow/scripts/agileflow-configure.js --hide=model,cost,wip

# Minimal statusline (just branding and context)
node .agileflow/scripts/agileflow-configure.js --hide=model,story,epic,wip,cost,git
```

Components are stored in `docs/00-meta/agileflow-metadata.json`:

```json
{
  "features": {
    "statusline": {
      "enabled": true,
      "components": {
        "agileflow": true,
        "model": true,
        "story": true,
        "epic": true,
        "wip": true,
        "context": true,
        "cost": true,
        "git": true
      }
    }
  }
}
```

## Rules

- Always use AskUserQuestion for component selection
- Generate clean script without template placeholders
- Make script executable (chmod +x)
- Preserve existing .claude/settings.json content
- Add statusLine without overwriting other settings
- Always remind user to RESTART Claude Code
- Validate JSON before writing
- Show preview of status line output
