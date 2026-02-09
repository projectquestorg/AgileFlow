---
description: Post-install validation
argument-hint: "(no arguments)"
compact_context:
  priority: high
  preserve_rules:
    - "No arguments required - validates installation automatically"
    - "Run after npx agileflow setup to verify installation"
    - "Check 5 areas: directories, scripts, hooks, JSON files, permissions"
    - "Directory Validation - verify .agileflow/, .claude/, docs/ structure"
    - "Script Validation - check scripts exist and are executable"
    - "Hook Configuration - validate hooks in .claude/settings.json"
    - "JSON File Integrity - validate all JSON files with jq empty"
    - "Report issues with indicators: ✅ (pass), ❌ (fail), ⚠️ (warn), ℹ️ (info)"
    - "Suggest specific fixes for common installation problems"
    - "Exit code 0 (healthy) or 1 (issues found)"
  state_fields:
    - total_checks
    - passed_checks
    - warning_count
    - failure_count
---

# install

Validate AgileFlow installation after `npx agileflow setup` and report what's installed correctly vs. what needs attention.

## Prompt

ROLE: Installation Validator

INPUTS
(no arguments - runs full installation validation)

ACTIONS
1) Verify directory structure (.agileflow/, .claude/, docs/)
2) Check installed scripts exist and are executable
3) Validate hook configuration in .claude/settings.json
4) Validate all JSON files (metadata, status.json, settings)
5) Check file permissions on scripts
6) Generate validation report with fix suggestions

OBJECTIVE: Validate AgileFlow installation integrity, identify issues, and provide actionable fix commands.

<!-- COMPACT_SUMMARY_START -->
## Compact Summary

The `install` command validates your AgileFlow installation after running `npx agileflow setup`:

**What it validates:**
- Directory structure (.agileflow/, .claude/, docs/)
- Installed scripts existence and executability
- Hook configuration in .claude/settings.json
- JSON file integrity (metadata, status.json, settings)
- File permissions on key scripts

**Directory Structure Validation**:
- Required: `.agileflow/` (core installation)
- Required: `.claude/commands/agileflow/` (slash commands)
- Required: `docs/09-agents/` (status tracking)
- Optional: `docs/00-meta/` (metadata)
- Checks for proper subdirectory structure

**Script Validation**:
- Checks scripts/ directory for key scripts
- Verifies scripts are executable (`[ -x script ]`)
- Reports missing or non-executable scripts
- Suggests `chmod +x` fixes

**Hook Configuration**:
- Parses .claude/settings.json for hooks
- Validates SessionStart, PreCompact, PreToolUse hooks
- Reports unconfigured but available features
- Suggests `/agileflow:configure` for setup

**JSON Integrity**:
- Validates with `jq empty` for syntax errors
- Checks required files: metadata, status.json
- Reports file sizes
- Shows specific parse errors for invalid files

**Common Installation Issues**:
1. Missing directories - Re-run `npx agileflow setup`
2. Non-executable scripts - Run `chmod +x scripts/*.sh`
3. Invalid JSON - Manual repair needed
4. Missing hooks - Run `/agileflow:configure`
5. Permission errors - Check directory ownership

**Output Format**:
- Indicators: ✅ (pass), ❌ (fail), ⚠️ (warning), ℹ️ (info)
- Section-by-section validation results
- Specific fix commands for each issue
- Exit code 0 (all passed) or 1 (issues found)

**Usage**:
```bash
/agileflow:install
```

**No arguments required** - validates full installation automatically.
<!-- COMPACT_SUMMARY_END -->

**Run these validation checks**:

```bash
#!/bin/bash

echo "🔍 AgileFlow Installation Validation"
echo "====================================="
echo ""

ERRORS=0
WARNINGS=0

# Check 1: Directory Structure
echo "📁 Directory Structure"
echo "----------------------"

REQUIRED_DIRS=(
  ".agileflow"
  ".agileflow/agents"
  ".agileflow/commands"
  ".agileflow/scripts"
  ".claude"
  ".claude/commands/agileflow"
  "docs/09-agents"
)

OPTIONAL_DIRS=(
  "docs/00-meta"
  "docs/03-decisions"
  "docs/04-architecture"
  "docs/05-epics"
  "docs/06-stories"
  ".agileflow/experts"
  ".agileflow/templates"
)

for DIR in "${REQUIRED_DIRS[@]}"; do
  if [ -d "$DIR" ]; then
    echo "  ✅ $DIR"
  else
    echo "  ❌ $DIR - MISSING (REQUIRED)"
    ERRORS=$((ERRORS + 1))
  fi
done

for DIR in "${OPTIONAL_DIRS[@]}"; do
  if [ -d "$DIR" ]; then
    echo "  ✅ $DIR"
  else
    echo "  ℹ️  $DIR - not found (optional)"
  fi
done

echo ""

# Check 2: Core Scripts
echo "📜 Script Installation"
echo "----------------------"

# Check both possible script locations
SCRIPT_DIR=""
if [ -d ".agileflow/scripts" ]; then
  SCRIPT_DIR=".agileflow/scripts"
elif [ -d "scripts" ]; then
  SCRIPT_DIR="scripts"
fi

if [ -n "$SCRIPT_DIR" ]; then
  REQUIRED_SCRIPTS=(
    "agileflow-welcome.js"
    "archive-completed-stories.sh"
    "precompact-context.sh"
  )

  OPTIONAL_SCRIPTS=(
    "agileflow-statusline.sh"
    "obtain-context.js"
    "session-manager.js"
    "check-update.js"
  )

  for SCRIPT in "${REQUIRED_SCRIPTS[@]}"; do
    if [ -f "$SCRIPT_DIR/$SCRIPT" ]; then
      if [ -x "$SCRIPT_DIR/$SCRIPT" ] || [[ "$SCRIPT" == *.js ]]; then
        echo "  ✅ $SCRIPT"
      else
        echo "  ⚠️  $SCRIPT - exists but not executable"
        echo "     Fix: chmod +x $SCRIPT_DIR/$SCRIPT"
        WARNINGS=$((WARNINGS + 1))
      fi
    else
      echo "  ❌ $SCRIPT - MISSING (REQUIRED)"
      ERRORS=$((ERRORS + 1))
    fi
  done

  for SCRIPT in "${OPTIONAL_SCRIPTS[@]}"; do
    if [ -f "$SCRIPT_DIR/$SCRIPT" ]; then
      echo "  ✅ $SCRIPT"
    else
      echo "  ℹ️  $SCRIPT - not found (optional)"
    fi
  done
else
  echo "  ❌ No scripts directory found"
  ERRORS=$((ERRORS + 1))
fi

echo ""

# Check 3: Hook Configuration
echo "🪝 Hook Configuration"
echo "---------------------"

if [ -f .claude/settings.json ]; then
  if jq empty .claude/settings.json 2>/dev/null; then
    echo "  ✅ .claude/settings.json is valid JSON"

    # Check for specific hooks
    SESSION_START=$(jq '.hooks.SessionStart | length // 0' .claude/settings.json 2>/dev/null)
    PRE_COMPACT=$(jq '.hooks.PreCompact | length // 0' .claude/settings.json 2>/dev/null)
    PRE_TOOL_USE=$(jq '.hooks.PreToolUse | length // 0' .claude/settings.json 2>/dev/null)

    if [ "$SESSION_START" -gt 0 ]; then
      echo "  ✅ SessionStart hooks: $SESSION_START configured"
    else
      echo "  ⚠️  SessionStart hooks: not configured"
      echo "     Run: /agileflow:configure to enable welcome display"
      WARNINGS=$((WARNINGS + 1))
    fi

    if [ "$PRE_COMPACT" -gt 0 ]; then
      echo "  ✅ PreCompact hooks: $PRE_COMPACT configured"
    else
      echo "  ⚠️  PreCompact hooks: not configured"
      echo "     Run: /agileflow:configure to enable context preservation"
      WARNINGS=$((WARNINGS + 1))
    fi

    if [ "$PRE_TOOL_USE" -gt 0 ]; then
      echo "  ✅ PreToolUse hooks: $PRE_TOOL_USE configured (damage control)"
    else
      echo "  ℹ️  PreToolUse hooks: not configured (optional damage control)"
    fi
  else
    echo "  ❌ .claude/settings.json - INVALID JSON"
    jq . .claude/settings.json 2>&1 | head -3 | sed 's/^/     /'
    ERRORS=$((ERRORS + 1))
  fi
else
  echo "  ❌ .claude/settings.json - NOT FOUND"
  echo "     Run: npx agileflow setup to create"
  ERRORS=$((ERRORS + 1))
fi

echo ""

# Check 4: JSON File Integrity
echo "📋 JSON File Integrity"
echo "----------------------"

JSON_FILES=(
  "docs/00-meta/agileflow-metadata.json:required"
  "docs/09-agents/status.json:required"
  ".claude/settings.json:required"
  "docs/09-agents/session-state.json:optional"
  ".agileflow/config.yaml:optional"
)

for ENTRY in "${JSON_FILES[@]}"; do
  FILE="${ENTRY%:*}"
  TYPE="${ENTRY#*:}"

  if [ -f "$FILE" ]; then
    # Handle YAML files differently
    if [[ "$FILE" == *.yaml ]]; then
      SIZE=$(stat -f%z "$FILE" 2>/dev/null || stat -c%s "$FILE" 2>/dev/null)
      SIZE_KB=$((SIZE / 1024))
      echo "  ✅ $FILE (${SIZE_KB}KB) - YAML config"
    elif jq empty "$FILE" 2>/dev/null; then
      SIZE=$(stat -f%z "$FILE" 2>/dev/null || stat -c%s "$FILE" 2>/dev/null)
      SIZE_KB=$((SIZE / 1024))
      echo "  ✅ $FILE (${SIZE_KB}KB)"
    else
      echo "  ❌ $FILE - INVALID JSON"
      jq . "$FILE" 2>&1 | head -3 | sed 's/^/     /'
      ERRORS=$((ERRORS + 1))
    fi
  else
    if [ "$TYPE" = "required" ]; then
      echo "  ❌ $FILE - NOT FOUND (REQUIRED)"
      ERRORS=$((ERRORS + 1))
    else
      echo "  ℹ️  $FILE - not found (optional)"
    fi
  fi
done

echo ""

# Check 5: Slash Commands Installation
echo "⚡ Slash Commands"
echo "-----------------"

COMMANDS_DIR=".claude/commands/agileflow"
if [ -d "$COMMANDS_DIR" ]; then
  COMMAND_COUNT=$(find "$COMMANDS_DIR" -name "*.md" -type f 2>/dev/null | wc -l | tr -d ' ')
  if [ "$COMMAND_COUNT" -gt 0 ]; then
    echo "  ✅ $COMMAND_COUNT slash commands installed"

    # Check for key commands
    KEY_COMMANDS=("story.md" "status.md" "board.md" "configure.md" "diagnose.md")
    MISSING_KEY=0
    for CMD in "${KEY_COMMANDS[@]}"; do
      if [ ! -f "$COMMANDS_DIR/$CMD" ]; then
        MISSING_KEY=$((MISSING_KEY + 1))
      fi
    done

    if [ $MISSING_KEY -gt 0 ]; then
      echo "  ⚠️  $MISSING_KEY key command(s) missing - may need reinstall"
      WARNINGS=$((WARNINGS + 1))
    fi
  else
    echo "  ❌ No slash commands found in $COMMANDS_DIR"
    ERRORS=$((ERRORS + 1))
  fi
else
  echo "  ❌ Commands directory not found: $COMMANDS_DIR"
  ERRORS=$((ERRORS + 1))
fi

echo ""

# Check 6: Version Information
echo "📦 Version Information"
echo "----------------------"

# Check installed version from config.yaml
if [ -f ".agileflow/config.yaml" ]; then
  VERSION=$(grep -E "^version:" .agileflow/config.yaml 2>/dev/null | sed "s/version:[[:space:]]*['\"]*//" | sed "s/['\"]//g")
  if [ -n "$VERSION" ]; then
    echo "  ✅ Installed version: v$VERSION"
  fi
fi

# Check npm for latest
LATEST=$(npm view agileflow version 2>/dev/null)
if [ -n "$LATEST" ]; then
  echo "  ℹ️  Latest available: v$LATEST"

  if [ -n "$VERSION" ] && [ "$VERSION" != "$LATEST" ]; then
    echo "  ⚠️  Update available: v$VERSION -> v$LATEST"
    echo "     Run: npx agileflow update"
  fi
fi

echo ""

# Final Summary
echo "📊 Installation Summary"
echo "======================="

TOTAL=$((ERRORS + WARNINGS))

if [ $ERRORS -eq 0 ] && [ $WARNINGS -eq 0 ]; then
  echo "✅ Installation validated successfully!"
  echo ""
  echo "Next steps:"
  echo "  • Run /agileflow:board to see your kanban board"
  echo "  • Run /agileflow:story to create your first story"
  echo "  • Run /agileflow:help for all available commands"
  exit 0
elif [ $ERRORS -eq 0 ]; then
  echo "⚠️  Installation complete with $WARNINGS warning(s)."
  echo ""
  echo "Recommended actions:"
  echo "  • Run /agileflow:configure to enable optional features"
  echo "  • Fix script permissions: chmod +x scripts/*.sh"
  exit 0
else
  echo "❌ Installation has $ERRORS error(s) and $WARNINGS warning(s)."
  echo ""
  echo "Required actions:"
  echo "  1. Re-run setup: npx agileflow setup --force"
  echo "  2. Check file permissions and ownership"
  echo "  3. Re-run validation: /agileflow:install"
  exit 1
fi
```

**Output Format**:
- Show all validation results with ✅/❌/⚠️/ℹ️ indicators
- Display specific fix commands for each issue
- Provide actionable next steps
- Exit with code 0 if healthy, code 1 if issues found

---

## Expected Output

### Successful Installation

```
🔍 AgileFlow Installation Validation
=====================================

📁 Directory Structure
----------------------
  ✅ .agileflow
  ✅ .agileflow/agents
  ✅ .agileflow/commands
  ✅ .agileflow/scripts
  ✅ .claude
  ✅ .claude/commands/agileflow
  ✅ docs/09-agents
  ✅ docs/00-meta
  ✅ docs/03-decisions
  ✅ docs/04-architecture
  ✅ docs/05-epics
  ✅ docs/06-stories
  ✅ .agileflow/experts
  ✅ .agileflow/templates

📜 Script Installation
----------------------
  ✅ agileflow-welcome.js
  ✅ archive-completed-stories.sh
  ✅ precompact-context.sh
  ✅ agileflow-statusline.sh
  ✅ obtain-context.js
  ✅ session-manager.js
  ✅ check-update.js

🪝 Hook Configuration
---------------------
  ✅ .claude/settings.json is valid JSON
  ✅ SessionStart hooks: 2 configured
  ✅ PreCompact hooks: 1 configured
  ✅ PreToolUse hooks: 3 configured (damage control)

📋 JSON File Integrity
----------------------
  ✅ docs/00-meta/agileflow-metadata.json (2KB)
  ✅ docs/09-agents/status.json (15KB)
  ✅ .claude/settings.json (8KB)
  ✅ docs/09-agents/session-state.json (1KB)
  ✅ .agileflow/config.yaml (1KB) - YAML config

⚡ Slash Commands
-----------------
  ✅ 79 slash commands installed

📦 Version Information
----------------------
  ✅ Installed version: v2.94.1
  ℹ️  Latest available: v2.94.1

📊 Installation Summary
=======================
✅ Installation validated successfully!

Next steps:
  • Run /agileflow:board to see your kanban board
  • Run /agileflow:story to create your first story
  • Run /agileflow:help for all available commands
```

### Installation with Issues

```
🔍 AgileFlow Installation Validation
=====================================

📁 Directory Structure
----------------------
  ✅ .agileflow
  ❌ .agileflow/agents - MISSING (REQUIRED)
  ✅ .agileflow/commands
  ✅ .agileflow/scripts
  ✅ .claude
  ✅ .claude/commands/agileflow
  ❌ docs/09-agents - MISSING (REQUIRED)

📜 Script Installation
----------------------
  ✅ agileflow-welcome.js
  ⚠️  archive-completed-stories.sh - exists but not executable
     Fix: chmod +x .agileflow/scripts/archive-completed-stories.sh
  ✅ precompact-context.sh

🪝 Hook Configuration
---------------------
  ✅ .claude/settings.json is valid JSON
  ⚠️  SessionStart hooks: not configured
     Run: /agileflow:configure to enable welcome display
  ⚠️  PreCompact hooks: not configured
     Run: /agileflow:configure to enable context preservation

📋 JSON File Integrity
----------------------
  ❌ docs/00-meta/agileflow-metadata.json - NOT FOUND (REQUIRED)
  ❌ docs/09-agents/status.json - NOT FOUND (REQUIRED)
  ✅ .claude/settings.json (8KB)

⚡ Slash Commands
-----------------
  ✅ 79 slash commands installed

📊 Installation Summary
=======================
❌ Installation has 4 error(s) and 3 warning(s).

Required actions:
  1. Re-run setup: npx agileflow setup --force
  2. Check file permissions and ownership
  3. Re-run validation: /agileflow:install
```

---

## Related Commands

- `/agileflow:diagnose` - Full system health diagnostics
- `/agileflow:maintain` - Periodic maintenance checks
- `/agileflow:configure` - Configure AgileFlow features
- `/agileflow:help` - Display AgileFlow overview
