---
name: configuration-damage-control
description: Configure AgileFlow damage control to protect against destructive commands
tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
model: haiku
---

# Configuration Agent: Damage Control

Configure PreToolUse hooks to protect your codebase from destructive agent commands.

---

## STEP 0: Gather Context (MANDATORY)

```bash
node .agileflow/scripts/obtain-context.js configuration-damage-control
```

---

## What Is Damage Control?

Damage control uses Claude Code's PreToolUse hooks to validate commands BEFORE they execute:

**Three Protection Layers:**
1. **Bash Tool Hook** - Blocks dangerous commands (rm -rf, DROP TABLE, etc.)
2. **Edit Tool Hook** - Prevents editing protected files
3. **Write Tool Hook** - Prevents writing to protected locations

**Path Protection Levels:**
| Level | Read | Write | Edit | Delete |
|-------|------|-------|------|--------|
| Zero Access | No | No | No | No |
| Read-Only | Yes | No | No | No |
| No Delete | Yes | Yes | Yes | No |

**Protection Modes:**
- **Standard** (recommended): Deterministic pattern matching - fast and reliable
- **Enhanced**: Standard + AI prompt hook for unknown threats - slower but thorough

---

## IMMEDIATE ACTIONS

### Step 1: Check Current Status

```bash
# Check if patterns file exists
if [ -f ".agileflow/config/damage-control-patterns.yaml" ]; then
  echo "STATUS: Damage control patterns configured"
  PATTERNS_EXIST=true
else
  echo "STATUS: No patterns file found"
  PATTERNS_EXIST=false
fi

# Check if hooks are in settings.json
if [ -f ".claude/settings.json" ] && grep -q "damage-control" .claude/settings.json 2>/dev/null; then
  echo "STATUS: PreToolUse hooks configured"
  HOOKS_EXIST=true
else
  echo "STATUS: No hooks configured"
  HOOKS_EXIST=false
fi
```

### Step 2: Determine Action

**If NOT configured** (first time setup):
- Proceed to Step 3 (Protection Level)

**If ALREADY configured**:
- Use AskUserQuestion to offer reconfiguration options:

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "Damage control is already configured. What would you like to do?",
  "header": "Options",
  "multiSelect": false,
  "options": [
    {"label": "Change protection level", "description": "Switch between Standard/Enhanced"},
    {"label": "Add custom patterns", "description": "Block additional commands or protect more paths"},
    {"label": "View current config", "description": "Show what's protected"},
    {"label": "Disable damage control", "description": "Remove all hooks"},
    {"label": "Keep current", "description": "Exit without changes"}
  ]
}]</parameter>
</invoke>
```

### Step 3: Choose Protection Level

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "What protection level would you like?",
  "header": "Level",
  "multiSelect": false,
  "options": [
    {"label": "Standard (Recommended)", "description": "Fast deterministic hooks - blocks known dangerous patterns"},
    {"label": "Enhanced", "description": "Standard + AI evaluation for unknown threats (adds latency)"},
    {"label": "Minimal", "description": "Path protection only - no command pattern matching"}
  ]
}]</parameter>
</invoke>
```

### Step 4: Ask About Custom Protections

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "Any additional protections to enable?",
  "header": "Custom",
  "multiSelect": true,
  "options": [
    {"label": "Production database commands", "description": "Block psql/mysql/mongo production connections"},
    {"label": "Cloud CLI destructive ops", "description": "Block aws/gcloud/az delete commands"},
    {"label": "Extra env file protection", "description": "Block all .env.* and secrets.* files"},
    {"label": "Use defaults only", "description": "No additional protections needed"}
  ]
}]</parameter>
</invoke>
```

### Step 5: Create Configuration Directory

```bash
mkdir -p .agileflow/config
```

### Step 6: Deploy Patterns File

```bash
# Copy from templates if not exists, or if user wants reset
if [ ! -f ".agileflow/config/damage-control-patterns.yaml" ]; then
  if [ -f ".agileflow/templates/damage-control-patterns.yaml" ]; then
    cp .agileflow/templates/damage-control-patterns.yaml .agileflow/config/damage-control-patterns.yaml
    echo "Deployed default patterns"
  fi
fi
```

### Step 7: Add Custom Patterns (if selected)

Based on user selections from Step 4, append to patterns file:

**Production database commands:**
```yaml
  # Production database protection (added by configure)
  - pattern: 'psql\s+.*production'
    reason: "Production database access blocked"
  - pattern: 'mysql\s+.*-h\s+.*prod'
    reason: "Production MySQL access blocked"
  - pattern: 'mongo.*mongodb\+srv.*prod'
    reason: "Production MongoDB access blocked"
```

**Cloud CLI destructive ops:**
```yaml
  # Cloud CLI protection (added by configure)
  - pattern: '\baws\s+s3\s+rm'
    reason: "AWS S3 delete blocked"
  - pattern: '\baws\s+ec2\s+terminate'
    reason: "AWS EC2 terminate blocked"
  - pattern: '\bgcloud\s+compute\s+instances\s+delete'
    reason: "GCloud instance delete blocked"
```

**Extra env file protection** - add to zeroAccessPaths:
```yaml
  - ".env.*"
  - "secrets.*"
  - "credentials.*"
```

### Step 8: Configure PreToolUse Hooks

Read current settings.json and merge damage control hooks:

```javascript
// This is the hook configuration to add/merge
const damageControlHooks = {
  PreToolUse: [
    {
      matcher: "Bash",
      hooks: [{
        type: "command",
        command: `node ${process.cwd()}/.agileflow/scripts/damage-control-bash.js`,
        timeout: 5
      }]
    },
    {
      matcher: "Edit",
      hooks: [{
        type: "command",
        command: `node ${process.cwd()}/.agileflow/scripts/damage-control-edit.js`,
        timeout: 5
      }]
    },
    {
      matcher: "Write",
      hooks: [{
        type: "command",
        command: `node ${process.cwd()}/.agileflow/scripts/damage-control-write.js`,
        timeout: 5
      }]
    }
  ]
};

// For Enhanced protection, add prompt hook to Bash:
// {
//   type: "prompt",
//   prompt: "Evaluate if this bash command could cause destructive or irreversible changes to files, databases, or systems. If dangerous, block it."
// }
```

**Implementation:**
1. Read existing `.claude/settings.json` (create if missing)
2. Initialize `hooks.PreToolUse` array if missing
3. Remove any existing damage-control hooks (to allow reconfiguration)
4. Add the new hooks
5. Write back to settings.json

### Step 9: Update Metadata

```bash
node -e "
const fs = require('fs');
const metaPath = 'docs/00-meta/agileflow-metadata.json';

// Ensure directory exists
fs.mkdirSync('docs/00-meta', { recursive: true });

// Read or create metadata
let meta = {};
if (fs.existsSync(metaPath)) {
  meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
}

// Update damage control feature
meta.features = meta.features || {};
meta.features.damageControl = {
  enabled: true,
  protectionLevel: 'LEVEL_HERE',  // Replace with actual selection
  version: '2.78.0',
  configured_at: new Date().toISOString()
};
meta.updated = new Date().toISOString();

fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
console.log('Updated metadata');
"
```

### Step 10: Verify Scripts Exist

```bash
# Verify all required scripts exist
MISSING=false
for script in damage-control-bash.js damage-control-edit.js damage-control-write.js; do
  if [ ! -f ".agileflow/scripts/$script" ]; then
    echo "WARNING: Missing .agileflow/scripts/$script"
    MISSING=true
  fi
done

if [ "$MISSING" = "true" ]; then
  echo "Some scripts missing. Run 'npx agileflow update' to restore."
fi
```

---

## Success Output

Display formatted success message:

```
Damage Control Configured!

Protection Level: [Standard/Enhanced]

Hooks Enabled:
  Bash Tool:  Validates commands against patterns
  Edit Tool:  Enforces path access controls
  Write Tool: Enforces path access controls

Protected Paths:
  Zero Access: ~/.ssh/, ~/.aws/, .env files
  Read-Only:   ~/.bashrc, package-lock.json
  No Delete:   .agileflow/, .claude/, status.json

Blocked Patterns: [N] bash patterns, [N] ask-first patterns

Files Updated:
  .agileflow/config/damage-control-patterns.yaml
  .claude/settings.json

To customize: Edit .agileflow/config/damage-control-patterns.yaml
To test: Try running 'rm -rf /' (will be blocked)

═══════════════════════════════════════════════════════════
   RESTART CLAUDE CODE NOW!
   Quit completely (Cmd+Q / Ctrl+Q), wait 5 seconds, restart
   Hooks only take effect after restart!
═══════════════════════════════════════════════════════════
```

---

## Disable Damage Control

If user selects "Disable":

1. Remove damage-control hooks from `.claude/settings.json`
2. Update metadata to show disabled:
```javascript
meta.features.damageControl = {
  enabled: false,
  disabled_at: new Date().toISOString()
};
```
3. Keep patterns file (user may re-enable later)
4. Show restart reminder

---

## View Current Config

If user selects "View current config":

1. Read and display `.agileflow/config/damage-control-patterns.yaml`
2. Count patterns in each category
3. List protected paths
4. Show whether Enhanced mode is enabled

---

## Rules

- **ALWAYS use AskUserQuestion** for user choices - never ask users to type
- **MERGE hooks** into existing settings.json - don't overwrite other hooks
- **VERIFY scripts exist** before enabling hooks
- **UPDATE metadata** for version tracking
- **SHOW restart banner** at the end - hooks require Claude Code restart
- **FAIL-OPEN principle** - if something goes wrong, don't break existing functionality
