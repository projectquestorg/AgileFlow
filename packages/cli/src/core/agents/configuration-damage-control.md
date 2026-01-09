---
name: configuration-damage-control
description: Configure AgileFlow damage control to protect against destructive commands
tools: Read, Write, Edit, Bash, Glob, Grep
model: haiku
compact_context:
  priority: high
  preserve_rules:
    - "Use AskUserQuestion for all configuration choices"
    - "Copy hook scripts to .claude/hooks/damage-control/"
    - "Create patterns.yaml if not exists, PRESERVE if exists"
    - "Write PreToolUse hooks to .claude/settings.json"
    - "Never overwrite existing patterns without confirmation"
  state_fields:
    - damage_control_enabled
    - protection_level
---

# Configuration: Damage Control

Set up damage control protection to block destructive commands and protect sensitive paths.

---

## What This Does

Damage control protects your codebase from destructive agent commands through PreToolUse hooks:

1. **Bash Command Validation** - Blocks dangerous commands like `rm -rf`, `DROP TABLE`, force pushes
2. **Path Protection** - Prevents access to sensitive files (`.env`, `~/.ssh/`, etc.)
3. **Ask Confirmation** - Prompts before risky-but-valid operations

---

## Configuration Steps

### Step 1: Ask User to Enable

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "Enable damage control to protect against destructive commands?",
  "header": "Damage Control",
  "multiSelect": false,
  "options": [
    {"label": "Enable (Recommended)", "description": "Block dangerous commands and protect sensitive paths"},
    {"label": "Skip", "description": "No damage control (not recommended)"}
  ]
}]</parameter>
</invoke>
```

If user selects "Skip", exit with message: "Damage control not enabled. Run /agileflow:configure to enable later."

### Step 2: Ask Protection Level

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "Choose protection level:",
  "header": "Protection Level",
  "multiSelect": false,
  "options": [
    {"label": "Standard (Recommended)", "description": "Deterministic pattern matching - fast, no AI calls"},
    {"label": "Enhanced", "description": "Standard + AI prompt hook for unknown threats (slower)"}
  ]
}]</parameter>
</invoke>
```

### Step 3: Create Hooks Directory

```bash
mkdir -p .claude/hooks/damage-control
```

### Step 4: Copy Hook Scripts

Copy the following scripts from AgileFlow installation:

```bash
# Source: .agileflow/scripts/damage-control/
# Destination: .claude/hooks/damage-control/

cp .agileflow/scripts/damage-control/bash-tool-damage-control.js .claude/hooks/damage-control/
cp .agileflow/scripts/damage-control/edit-tool-damage-control.js .claude/hooks/damage-control/
cp .agileflow/scripts/damage-control/write-tool-damage-control.js .claude/hooks/damage-control/
```

### Step 5: Create or Preserve patterns.yaml

**If patterns.yaml does NOT exist**, copy the default:

```bash
cp .agileflow/scripts/damage-control/patterns.yaml .claude/hooks/damage-control/
```

**If patterns.yaml ALREADY exists**, preserve it (do not overwrite):

```
patterns.yaml already exists - preserving existing rules.
To update patterns, edit .claude/hooks/damage-control/patterns.yaml
```

### Step 6: Update settings.json

Add PreToolUse hooks to `.claude/settings.json`:

**For Standard protection:**

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [{
          "type": "command",
          "command": "node $CLAUDE_PROJECT_DIR/.claude/hooks/damage-control/bash-tool-damage-control.js",
          "timeout": 5000
        }]
      },
      {
        "matcher": "Edit",
        "hooks": [{
          "type": "command",
          "command": "node $CLAUDE_PROJECT_DIR/.claude/hooks/damage-control/edit-tool-damage-control.js",
          "timeout": 5000
        }]
      },
      {
        "matcher": "Write",
        "hooks": [{
          "type": "command",
          "command": "node $CLAUDE_PROJECT_DIR/.claude/hooks/damage-control/write-tool-damage-control.js",
          "timeout": 5000
        }]
      }
    ]
  }
}
```

**For Enhanced protection (adds prompt hook):**

Add to the Bash matcher:

```json
{
  "matcher": "Bash",
  "hooks": [
    {
      "type": "command",
      "command": "node $CLAUDE_PROJECT_DIR/.claude/hooks/damage-control/bash-tool-damage-control.js",
      "timeout": 5000
    },
    {
      "type": "prompt",
      "prompt": "Evaluate if this bash command is destructive or could cause irreversible damage. Consider: Does it delete files recursively? Does it modify system files? Could it expose secrets? Block if dangerous."
    }
  ]
}
```

### Step 7: Merge with Existing Hooks

**IMPORTANT**: If PreToolUse hooks already exist in settings.json, MERGE the new hooks with existing ones. Do NOT replace existing hooks.

Check for existing hooks:
```javascript
// If settings.hooks.PreToolUse exists, append to it
// If a matcher (Bash, Edit, Write) already exists, merge hooks array
```

### Step 8: Show Completion Summary

```
Damage Control Enabled

Protection level: Standard (or Enhanced)

Protected against:
- Destructive bash commands (rm -rf, DROP TABLE, etc.)
- Access to sensitive paths (~/.ssh, .env, etc.)
- Force pushes and hard resets

Configuration:
- Hook scripts: .claude/hooks/damage-control/
- Patterns file: .claude/hooks/damage-control/patterns.yaml
- Settings: .claude/settings.json

To customize blocked patterns, edit:
  .claude/hooks/damage-control/patterns.yaml

Restart Claude Code for hooks to take effect.
```

---

## Patterns.yaml Reference

```yaml
# Block dangerous bash commands
bashToolPatterns:
  - pattern: '\brm\s+-[rRf]'
    reason: "rm with recursive or force flags"

# Commands requiring confirmation
askPatterns:
  - pattern: 'git\s+push\s+.*--force'
    reason: "Force push overwrites history"

# Path protection levels
zeroAccessPaths:   # Cannot read, write, edit, delete
  - ~/.ssh/
  - .env

readOnlyPaths:     # Can read, cannot modify
  - /etc/
  - package-lock.json

noDeletePaths:     # Can modify, cannot delete
  - .agileflow/
  - .claude/
```

---

## Troubleshooting

**Hooks not working after enabling:**
- Restart Claude Code - hooks only load on startup

**Command blocked that should be allowed:**
- Edit patterns.yaml to remove or adjust the pattern
- Use `ask: true` instead of blocking

**Need to disable damage control:**
- Remove PreToolUse hooks from .claude/settings.json
- Or delete .claude/hooks/damage-control/ directory

---

## Related

- Research: `docs/10-research/20260106-claude-code-damage-control-hooks.md`
- Patterns file: `.claude/hooks/damage-control/patterns.yaml`
- Hook scripts: `.claude/hooks/damage-control/*.js`
