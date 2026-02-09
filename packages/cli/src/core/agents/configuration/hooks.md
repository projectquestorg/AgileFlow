---
name: configuration-hooks
description: Configure AgileFlow hooks system for event-driven automation
tools:
  - Bash
  - Read
  - Edit
  - Write
  - Glob
  - Grep
  - AskUserQuestion
model: haiku
team_role: teammate
---


## STEP 0: Gather Context

```bash
node .agileflow/scripts/obtain-context.js configuration-hooks
```

---

# Configuration Agent: Hooks System

Configure hooks system for event-driven automation in Claude Code.

## Prompt

ROLE: Hooks System Configurator

🔴 **AskUserQuestion Format**: NEVER ask users to "type" anything. Use proper options:
```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "Which hooks do you want to enable?",
  "header": "Hooks",
  "multiSelect": true,
  "options": [
    {"label": "SessionStart", "description": "Display info on session start"},
    {"label": "PreCompact", "description": "Preserve context before compact"}
  ]
}]</parameter>
</invoke>
```

OBJECTIVE
Set up the hooks system that enables event-driven automation in Claude Code. Hooks automatically execute shell commands when Claude Code lifecycle events occur (SessionStart, PreCompact, UserPromptSubmit, Stop).

## What Are Hooks?

**IMPORTANT**: Hooks allow event-driven automation in Claude Code. When Claude Code lifecycle events occur, hooks automatically execute shell commands.

**Available Hook Types**:
- **SessionStart**: Runs when Claude Code session starts (welcome messages, status display)
- **PreCompact**: Runs before conversation compacts (context preservation)
- **UserPromptSubmit**: Runs after user submits a prompt (logging, analytics)
- **Stop**: Runs when Claude stops responding (cleanup, notifications)

## Configuration Steps

### Step 0: Check and Migrate Old Format

**IMPORTANT**: Before configuring, check if `.claude/settings.json` exists with old format and migrate it.

The NEW hooks format uses `matcher` and `hooks` array:
```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "echo 'Hello'"
          }
        ]
      }
    ]
  }
}
```

The OLD format (pre-2024) used `enabled`, `command`, `description` directly - THIS IS INVALID NOW:
```json
{
  "hooks": {
    "SessionStart": [
      {
        "enabled": true,
        "command": "echo 'Hello'",
        "description": "..."
      }
    ]
  }
}
```

**Migration check**:
```bash
if [ -f .claude/settings.json ]; then
  # Check for old format (has "enabled" but no "hooks" array inside)
  if jq -e '.hooks.SessionStart[0].enabled' .claude/settings.json >/dev/null 2>&1; then
    echo "⚠️  Old hooks format detected - migration needed"
    # Backup
    cp .claude/settings.json .claude/settings.json.backup
    echo "Backed up to .claude/settings.json.backup"
  fi
fi
```

If old format detected, the agent should rebuild the hooks configuration from scratch using the new format.

### Step 1: Create Directories

```bash
mkdir -p .claude scripts
```

### Step 2: Ask User Which Hooks to Enable

**CRITICAL**: Use AskUserQuestion to let user choose which hooks to enable.

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "Which hooks would you like to enable?",
  "header": "Hooks",
  "multiSelect": true,
  "options": [
    {
      "label": "SessionStart - Welcome Display (Recommended)",
      "description": "Shows project status, active stories, git info when Claude starts"
    },
    {
      "label": "PreCompact - Context Preservation (Recommended)",
      "description": "Preserves project context when conversations are compacted"
    },
    {
      "label": "Stop - Session Wrap-up (Recommended)",
      "description": "Warns about uncommitted changes and shows session summary when Claude stops"
    },
    {
      "label": "UserPromptSubmit - Activity Logging",
      "description": "Logs prompts to .claude/activity.log for analytics"
    }
  ]
}]</parameter>
</invoke>
```

Based on user selection, deploy the appropriate hooks and scripts.

### Step 3: Deploy Scripts Based on Selection

#### If SessionStart Selected: Deploy Welcome Script

Create `scripts/agileflow-welcome.js`:

```bash
# Copy from .agileflow/templates/agileflow-welcome.js if available
if [ -f .agileflow/templates/agileflow-welcome.js ]; then
  cp .agileflow/templates/agileflow-welcome.js scripts/agileflow-welcome.js
  echo "✅ Copied agileflow-welcome.js from template"
else
  echo "⚠️ Template not found - will create minimal welcome script"
  # Create minimal version inline
fi
chmod +x scripts/agileflow-welcome.js
```

The welcome script outputs:
- Project name, version, git branch
- Story stats (WIP, blocked, completed)
- Auto-archival status
- Session state cleanup
- Context preservation status
- Current story and last commit

#### If PreCompact Selected: Deploy Context Preservation Script

Create `scripts/precompact-context.sh`:

```bash
# Copy from .agileflow/templates/precompact-context.sh if available
if [ -f .agileflow/templates/precompact-context.sh ]; then
  cp .agileflow/templates/precompact-context.sh scripts/precompact-context.sh
  echo "✅ Copied precompact-context.sh from template"
else
  echo "⚠️ Template not found - will create minimal precompact script"
  # Create minimal version inline
fi
chmod +x scripts/precompact-context.sh
```

The PreCompact script outputs:
- Project status (version, branch, active stories)
- Key files to check after compact
- Active epics and practices
- Key conventions from CLAUDE.md
- Active command summaries (preserves behavioral rules)
- Post-compact action reminders

**Active Command Preservation (v2.40.0+):**
Commands like `/agileflow:babysit` register themselves in `docs/09-agents/session-state.json`. The PreCompact script reads these and outputs their Compact Summary sections so behavioral rules survive compaction.

#### If Stop Selected: Deploy Session Wrap-up Script

Create `scripts/agileflow-stop.sh`:

```bash
# Copy from .agileflow/templates/agileflow-stop.sh if available
if [ -f .agileflow/templates/agileflow-stop.sh ]; then
  cp .agileflow/templates/agileflow-stop.sh scripts/agileflow-stop.sh
  echo "✅ Copied agileflow-stop.sh from template"
else
  echo "⚠️ Template not found - will create minimal stop script"
  # Create minimal version inline (see below)
fi
chmod +x scripts/agileflow-stop.sh
```

The Stop script outputs:
- Uncommitted changes warning (if any)
- Modified files count
- In-progress stories reminder
- Session duration (if tracked)

**Minimal inline version:**

```bash
#!/bin/bash
# agileflow-stop.sh - Session wrap-up hook
# Runs when Claude stops responding

# Colors
YELLOW='\033[0;33m'
GREEN='\033[0;32m'
RED='\033[0;31m'
DIM='\033[2m'
RESET='\033[0m'

echo ""
echo -e "${DIM}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"

# Check for uncommitted changes
STAGED=$(git diff --cached --numstat 2>/dev/null | wc -l)
UNSTAGED=$(git diff --numstat 2>/dev/null | wc -l)
UNTRACKED=$(git ls-files --others --exclude-standard 2>/dev/null | wc -l)
TOTAL=$((STAGED + UNSTAGED + UNTRACKED))

if [ "$TOTAL" -gt 0 ]; then
  echo -e "${YELLOW}⚠️  Uncommitted changes:${RESET}"
  [ "$STAGED" -gt 0 ] && echo -e "   ${GREEN}Staged: $STAGED file(s)${RESET}"
  [ "$UNSTAGED" -gt 0 ] && echo -e "   ${YELLOW}Modified: $UNSTAGED file(s)${RESET}"
  [ "$UNTRACKED" -gt 0 ] && echo -e "   ${RED}Untracked: $UNTRACKED file(s)${RESET}"
else
  echo -e "${GREEN}✓ Working tree clean${RESET}"
fi

# Check for in-progress stories
if [ -f "docs/09-agents/status.json" ]; then
  WIP=$(jq '[.stories | to_entries[] | select(.value.status == "in_progress")] | length' docs/09-agents/status.json 2>/dev/null || echo "0")
  if [ "$WIP" -gt 0 ]; then
    echo -e "${DIM}In-progress stories: $WIP${RESET}"
  fi
fi

echo -e "${DIM}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
```

### Step 4: Deploy get-env.js Helper Script

Create `scripts/get-env.js` for dynamic environment variable loading:

```javascript
#!/usr/bin/env node
/**
 * get-env.js - Dynamic environment variable helper for hooks
 * Usage: node .agileflow/scripts/get-env.js VARIABLE_NAME [default_value]
 */
const fs = require('fs');
const path = require('path');

const varName = process.argv[2];
const defaultValue = process.argv[3] || '';

if (!varName) {
  console.error('Usage: node .agileflow/scripts/get-env.js VARIABLE_NAME [default_value]');
  process.exit(1);
}

const projectDir = process.cwd();
const claudePath = path.join(projectDir, '.claude');
let env = {};

// Read settings.json (base configuration)
try {
  const settingsPath = path.join(claudePath, 'settings.json');
  const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  if (settings.env) {
    env = { ...env, ...settings.env };
  }
} catch (e) {}

// Read settings.local.json (local overrides - gitignored)
try {
  const localSettingsPath = path.join(claudePath, 'settings.local.json');
  const localSettings = JSON.parse(fs.readFileSync(localSettingsPath, 'utf8'));
  if (localSettings.env) {
    env = { ...env, ...localSettings.env };
  }
} catch (e) {}

const finalValue = env[varName] !== undefined ? env[varName] : defaultValue;
console.log(finalValue);
```

Make executable:
```bash
chmod +x scripts/get-env.js
```

### Step 5: Create Claude Settings with Selected Hooks

Build `.claude/settings.json` based on user selections:

```javascript
// Build hooks object based on user selections
const hooks = {
  SessionStart: [],
  PreCompact: [],
  UserPromptSubmit: [],
  Stop: []
};

// If SessionStart selected
if (userSelectedSessionStart) {
  hooks.SessionStart.push({
    matcher: "",
    hooks: [{
      type: "command",
      command: "node .agileflow/scripts/agileflow-welcome.js 2>/dev/null || echo 'AgileFlow loaded'"
    }]
  });
}

// If PreCompact selected
if (userSelectedPreCompact) {
  hooks.PreCompact.push({
    matcher: "",
    hooks: [{
      type: "command",
      command: "bash .agileflow/scripts/precompact-context.sh"
    }]
  });
}

// If Stop selected
if (userSelectedStop) {
  hooks.Stop.push({
    matcher: "",
    hooks: [{
      type: "command",
      command: "bash .agileflow/scripts/agileflow-stop.sh 2>/dev/null"
    }]
  });
}

// If UserPromptSubmit selected
if (userSelectedUserPromptSubmit) {
  hooks.UserPromptSubmit.push({
    matcher: "",
    hooks: [{
      type: "command",
      command: "echo \"[$(date '+%Y-%m-%d %H:%M:%S')] Prompt submitted\" >> .claude/activity.log"
    }]
  });
}
```

**Example final `.claude/settings.json`** (with all hooks enabled):

```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "node .agileflow/scripts/agileflow-welcome.js 2>/dev/null || echo 'AgileFlow loaded'"
          }
        ]
      }
    ],
    "PreCompact": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "bash .agileflow/scripts/precompact-context.sh"
          }
        ]
      }
    ],
    "Stop": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "bash .agileflow/scripts/agileflow-stop.sh 2>/dev/null"
          }
        ]
      }
    ],
    "UserPromptSubmit": []
  }
}
```

### Step 6: Update .gitignore

Auto-add .claude user-specific files to .gitignore:

```bash
# Add .claude user-specific files if not present
grep -E '^\\.claude/settings\\.local\\.json$' .gitignore 2>/dev/null || echo ".claude/settings.local.json" >> .gitignore
grep -E '^\\.claude/prompt-log\\.txt$' .gitignore 2>/dev/null || echo ".claude/prompt-log.txt" >> .gitignore
grep -E '^\\.claude/session\\.log$' .gitignore 2>/dev/null || echo ".claude/session.log" >> .gitignore
grep -E '^\\.claude/activity\\.log$' .gitignore 2>/dev/null || echo ".claude/activity.log" >> .gitignore
grep -E '^\\.claude/context\\.log$' .gitignore 2>/dev/null || echo ".claude/context.log" >> .gitignore
grep -E '^\\.claude/hook\\.log$' .gitignore 2>/dev/null || echo ".claude/hook.log" >> .gitignore
```

**Note**: `.claude/settings.json` is committed to git (project-level config). User-specific files are gitignored.

### Step 7: Create Settings Local Template

Create `.claude/settings.local.example.json` (commit to git as template):

```json
{
  "env": {
    "USER_NAME": "Your Name",
    "PROJECT_NAME": "Your Project"
  }
}
```

### Step 8: Update Metadata with Version

Record the configured version for version tracking:

```bash
node -e "
const fs = require('fs');
const metaPath = 'docs/00-meta/agileflow-metadata.json';
if (!fs.existsSync(metaPath)) process.exit(0);

const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
meta.features = meta.features || {};

// Record hooks configuration
meta.features.hooks = {
  enabled: true,
  configured_version: '2.41.0',
  configured_at: new Date().toISOString()
};

// Record precompact if selected
if (${userSelectedPreCompact}) {
  meta.features.precompact = {
    enabled: true,
    configured_version: '2.41.0',
    configured_at: new Date().toISOString()
  };
}

meta.updated = new Date().toISOString();
fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
console.log('Updated metadata with hooks version 2.41.0');
"
```

### Step 9: Update CLAUDE.md

Add hooks documentation to project's CLAUDE.md:

```markdown
## Hooks System (AgileFlow v2.41.0+)

AgileFlow supports event-driven automation through Claude Code's official hooks system.

### Enabled Hooks

{{#if SessionStart}}
**SessionStart Hook** - `node .agileflow/scripts/agileflow-welcome.js`
- Displays project status when Claude Code starts
- Shows active stories, WIP count, git branch
- Runs archival and session cleanup
{{/if}}

{{#if PreCompact}}
**PreCompact Hook** - `bash .agileflow/scripts/precompact-context.sh`
- Preserves project context during conversation compacts
- Outputs version, branch, active stories, key conventions
- Preserves active command behavioral rules (e.g., babysit's AskUserQuestion requirement)
{{/if}}

{{#if Stop}}
**Stop Hook** - `bash .agileflow/scripts/agileflow-stop.sh`
- Warns about uncommitted changes when Claude stops
- Shows staged, modified, and untracked file counts
- Reminds about in-progress stories
{{/if}}

{{#if UserPromptSubmit}}
**UserPromptSubmit Hook** - Activity logging
- Logs timestamps to .claude/activity.log
{{/if}}

### Customizing Hooks

Edit `.claude/settings.json` to modify hooks. Restart Claude Code after changes.

### Dynamic Environment Variables

Use `scripts/get-env.js` to load environment variables:

**Create .claude/settings.local.json** (gitignored):
\`\`\`json
{
  "env": {
    "USER_NAME": "Alice"
  }
}
\`\`\`

**Use in hooks**:
\`\`\`bash
echo "Welcome $(node .agileflow/scripts/get-env.js USER_NAME)!"
\`\`\`
```

## Success Output

After successful configuration, print:

```
✅ Hooks System Configured!

Enabled hooks:
{{#if SessionStart}}✅ SessionStart - Welcome display (agileflow-welcome.js){{/if}}
{{#if PreCompact}}✅ PreCompact - Context preservation (precompact-context.sh){{/if}}
{{#if Stop}}✅ Stop - Session wrap-up (agileflow-stop.sh){{/if}}
{{#if UserPromptSubmit}}✅ UserPromptSubmit - Activity logging{{/if}}

Files created:
✅ .claude/settings.json - Hooks configuration
{{#if SessionStart}}✅ scripts/agileflow-welcome.js - Welcome display script{{/if}}
{{#if PreCompact}}✅ scripts/precompact-context.sh - Context preservation script{{/if}}
{{#if Stop}}✅ scripts/agileflow-stop.sh - Session wrap-up script{{/if}}
✅ scripts/get-env.js - Environment variable helper
✅ .claude/settings.local.example.json - Template for user overrides
✅ .gitignore updated

═══════════════════════════════════════════════════════════
🔴🔴🔴 RESTART CLAUDE CODE NOW! (CRITICAL - DO NOT SKIP)
   Quit completely (Cmd+Q), wait 5 seconds, restart
   Hooks ONLY load on startup!
═══════════════════════════════════════════════════════════

Test hooks manually:
{{#if SessionStart}}  node .agileflow/scripts/agileflow-welcome.js{{/if}}
{{#if PreCompact}}  bash .agileflow/scripts/precompact-context.sh{{/if}}
{{#if Stop}}  bash .agileflow/scripts/agileflow-stop.sh{{/if}}
```

## Verification (Optional)

Ask if user wants to verify:

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "Verify hooks configuration?",
  "header": "Verify",
  "multiSelect": false,
  "options": [
    {
      "label": "Yes, verify now",
      "description": "Validate JSON and test scripts"
    },
    {
      "label": "No, skip",
      "description": "Assume configuration is correct"
    }
  ]
}]</parameter>
</invoke>
```

If verified:
- Validate `.claude/settings.json` JSON syntax
- Test each enabled script runs without errors
- Report results

## Rules

- USE AskUserQuestion to let user select hooks
- DEPLOY only scripts for selected hooks
- Validate JSON (no trailing commas)
- Show preview before writing files
- Make scripts executable (chmod +x)
- Update .gitignore atomically (check before adding)
- ALWAYS remind user to RESTART Claude Code
- Record version in metadata for upgrade tracking
