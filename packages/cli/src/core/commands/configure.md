---
description: Configure advanced AgileFlow features (git, hooks, archival, CI, status line)
argument-hint: [--profile=full|basic|minimal|none] [--enable/--disable=features] [--migrate] [--upgrade] [--repair] [--version] [--list-scripts]
compact_context:
  priority: critical
  preserve_rules:
    - "ACTIVE COMMAND: /agileflow:configure - Configuration manager for AgileFlow features"
    - "CRITICAL: ALWAYS run --detect FIRST to check status before anything else"
    - "CRITICAL: If ⚠️ INVALID FORMAT shown → offer --migrate BEFORE other options"
    - "CRITICAL: If 🔄 OUTDATED shown → offer --upgrade to re-deploy latest scripts"
    - "MUST backup created on migrate: .claude/settings.json.backup"
    - "MUST show RED RESTART banner after ANY changes (quit, wait 5s, restart)"
    - "Features: sessionstart, precompact, ralphloop, selfimprove, archival, statusline, autoupdate, askuserquestion"
    - "Stop hooks (ralphloop, selfimprove) run when Claude completes or pauses"
  state_fields:
    - detection_status
    - has_format_issues
    - has_outdated_scripts
    - enabled_features
---

<!-- COMPACT_SUMMARY_START -->

## Compact Summary

Configuration management with **profiles**, **enable/disable**, **format migration**, and **upgrade detection**.

### Workflow (MUST FOLLOW)

1. **Run detection**: `node .agileflow/scripts/agileflow-configure.js --detect`
2. **If ⚠️ INVALID FORMAT shown**: Ask user to fix with `--migrate` BEFORE anything else
3. **If 🔄 OUTDATED shown**: Ask user to upgrade with `--upgrade`
4. **Present options**: Profiles, enable/disable, or check status

### Quick Commands

```bash
node .agileflow/scripts/agileflow-configure.js --detect             # Check status
node .agileflow/scripts/agileflow-configure.js --migrate            # Fix format issues
node .agileflow/scripts/agileflow-configure.js --upgrade            # Update outdated scripts
node .agileflow/scripts/agileflow-configure.js --profile=full       # Enable all
node .agileflow/scripts/agileflow-configure.js --profile=none       # Disable all
node .agileflow/scripts/agileflow-configure.js --enable=sessionstart  # Enable specific
node .agileflow/scripts/agileflow-configure.js --disable=archival   # Disable specific
node .agileflow/scripts/agileflow-configure.js --list-scripts       # Show all scripts status
node .agileflow/scripts/agileflow-configure.js --version            # Version info
node .agileflow/scripts/agileflow-configure.js --repair             # Fix missing scripts
node .agileflow/scripts/agileflow-configure.js --repair=statusline  # Fix specific feature
```

**Note:** All scripts are located in `.agileflow/scripts/` - no files in project root `scripts/`.

### Features

`sessionstart`, `precompact`, `ralphloop`, `selfimprove`, `archival`, `statusline`, `autoupdate`, `askuserquestion`

**Stop hooks** (ralphloop, selfimprove) run when Claude completes or pauses work.

### Critical Rules

- **Check for format issues FIRST** - offer to fix before other options
- **Check for outdated scripts** - offer to upgrade if versions differ
- **Backup created** on migrate: `.claude/settings.json.backup`
- **Restart required** - always show red banner after changes

<!-- COMPACT_SUMMARY_END -->

# configure

Manage AgileFlow features with profiles, enable/disable, and format migration.

## Prompt

ROLE: Configuration Manager

## STEP 1: Always Run Detection First

```bash
node .agileflow/scripts/agileflow-configure.js --detect
```

**CRITICAL**: Check the output for format issues (⚠️ INVALID FORMAT).

## STEP 2: Handle Issues (Migration or Upgrade)

### If ⚠️ INVALID FORMAT detected → Offer Migration
```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "Format issues detected in your settings! These will cause Claude Code errors. Fix them now?",
  "header": "Fix Issues",
  "multiSelect": false,
  "options": [
    {"label": "Yes, fix format issues (Recommended)", "description": "Migrate old formats to new Claude Code format. Creates backup first."},
    {"label": "No, skip for now", "description": "Continue with configuration (issues will remain)"}
  ]
}]</parameter>
</invoke>
```

If user says yes:
```bash
node .agileflow/scripts/agileflow-configure.js --migrate
```

### If 🔄 OUTDATED detected → Offer Upgrade
```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "Outdated scripts detected! Your features were configured with an older AgileFlow version. Update them?",
  "header": "Upgrade",
  "multiSelect": false,
  "options": [
    {"label": "Yes, upgrade scripts (Recommended)", "description": "Re-deploy all enabled features with latest scripts."},
    {"label": "No, keep current versions", "description": "Continue with older scripts (may miss bug fixes)."}
  ]
}]</parameter>
</invoke>
```

If user says yes:
```bash
node .agileflow/scripts/agileflow-configure.js --upgrade
```

## STEP 3: Configuration Options

After fixing issues (or if no issues), present main options:

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "What would you like to do?",
  "header": "Configure",
  "multiSelect": false,
  "options": [
    {"label": "Quick setup (full profile)", "description": "Enable all features: hooks, archival, status line"},
    {"label": "Basic setup", "description": "SessionStart + PreCompact + Archival"},
    {"label": "Enable specific features", "description": "Choose which features to enable"},
    {"label": "Disable specific features", "description": "Choose which features to disable"},
    {"label": "Check current status only", "description": "Already done - no changes needed"}
  ]
}]</parameter>
</invoke>
```

## Profile Commands

**Use a profile:**

```bash
# Full - all features
node .agileflow/scripts/agileflow-configure.js --profile=full

# Basic - essential hooks + archival
node .agileflow/scripts/agileflow-configure.js --profile=basic

# Minimal - welcome + archival
node .agileflow/scripts/agileflow-configure.js --profile=minimal

# None - disable all AgileFlow features
node .agileflow/scripts/agileflow-configure.js --profile=none
```

**Option B: Enable/disable specific features**

```bash
# Enable features
node .agileflow/scripts/agileflow-configure.js --enable=sessionstart,precompact

# Disable features
node .agileflow/scripts/agileflow-configure.js --disable=statusline

# Both at once
node .agileflow/scripts/agileflow-configure.js --enable=statusline --disable=archival

# With custom archival days
node .agileflow/scripts/agileflow-configure.js --enable=archival --archival-days=14
```

## Profile Details

| Profile | SessionStart | PreCompact | RalphLoop | SelfImprove | Archival | StatusLine | AskUserQuestion |
|---------|-------------|------------|-----------|-------------|----------|------------|-----------------|
| `full` | ✅ | ✅ | ✅ | ✅ | ✅ 30 days | ✅ | ✅ |
| `basic` | ✅ | ✅ | ❌ | ❌ | ✅ 30 days | ❌ | ✅ |
| `minimal` | ✅ | ❌ | ❌ | ❌ | ✅ 30 days | ❌ | ❌ |
| `none` | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

## Interactive Mode (via /configure command)

When user runs `/configure` without arguments, present options:

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "What would you like to do?",
  "header": "Configure",
  "multiSelect": false,
  "options": [
    {"label": "Quick setup (full profile)", "description": "Enable all features: hooks, archival, status line"},
    {"label": "Basic setup", "description": "SessionStart + PreCompact + Archival"},
    {"label": "Fix format issues", "description": "Migrate old/invalid settings formats"},
    {"label": "Enable specific features", "description": "Choose which features to enable"},
    {"label": "Disable specific features", "description": "Choose which features to disable"},
    {"label": "Check current status", "description": "See what's currently configured"}
  ]
}]</parameter>
</invoke>
```

Based on selection, run appropriate command.

## Feature Selection (when Enable/Disable selected)

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "Which features?",
  "header": "Features",
  "multiSelect": true,
  "options": [
    {"label": "SessionStart Hook", "description": "Welcome display with project status"},
    {"label": "PreCompact Hook", "description": "Context preservation on compact"},
    {"label": "RalphLoop (Stop Hook)", "description": "Autonomous story loop - runs tests, advances stories"},
    {"label": "SelfImprove (Stop Hook)", "description": "Auto-update agent expertise from work"},
    {"label": "Archival", "description": "Auto-archive old completed stories"},
    {"label": "Status Line", "description": "Custom status bar"},
    {"label": "Auto-Update", "description": "Automatically update AgileFlow on session start"},
    {"label": "AskUserQuestion Mode", "description": "End all responses with AskUserQuestion tool for guided interaction"}
  ]
}]</parameter>
</invoke>
```

Map selections:
- "SessionStart Hook" → `sessionstart`
- "PreCompact Hook" → `precompact`
- "RalphLoop (Stop Hook)" → `ralphloop`
- "SelfImprove (Stop Hook)" → `selfimprove`
- "Archival" → `archival`
- "Status Line" → `statusline`
- "Auto-Update" → `autoupdate`
- "AskUserQuestion Mode" → `askuserquestion`

## Auto-Update Configuration

Enable auto-update to automatically update AgileFlow when a new version is available:

```bash
# Enable auto-update
node .agileflow/scripts/agileflow-configure.js --enable=autoupdate

# Or manually edit docs/00-meta/agileflow-metadata.json:
```

```json
{
  "updates": {
    "autoUpdate": true,
    "checkFrequency": "daily"
  }
}
```

**Check frequencies:** `hourly`, `daily`, `weekly`, `never`

## AskUserQuestion Mode

Enable AskUserQuestion to have all commands end with guided options:

```bash
# Enable AskUserQuestion mode
node .agileflow/scripts/agileflow-configure.js --enable=askuserquestion

# Disable AskUserQuestion mode
node .agileflow/scripts/agileflow-configure.js --disable=askuserquestion
```

**What it does:**
- When enabled: All commands end with AskUserQuestion tool call (guided options)
- When disabled: Commands can end with natural text questions

**Storage in metadata:**
```json
{
  "features": {
    "askUserQuestion": {
      "enabled": true,
      "mode": "all"
    }
  }
}
```

**Modes:**
- `all`: All commands use AskUserQuestion (default)
- `interactive`: Only interactive commands (babysit, mentor, configure, epic-planner)
- `none`: Disabled

The guidance is injected via `obtain-context.js` when commands run.

## Stop Hook Features

Stop hooks run when Claude completes a task or pauses for user input. These enable autonomous workflows.

### RalphLoop (`ralphloop`)

Autonomous story processing loop (named after the "Ralph Wiggum" pattern):
- Runs tests automatically when Claude stops
- If tests pass → marks story as completed, loads next story in epic
- If tests fail → shows failures for Claude to fix
- Tracks iterations with configurable limits (default: 20)
- Enable: `--enable=ralphloop`

**How to use:**
1. Enable: `node .agileflow/scripts/agileflow-configure.js --enable=ralphloop`
2. Start a loop: `node .agileflow/scripts/ralph-loop.js --init --epic=EP-XXXX`
3. Work on stories - tests run automatically when Claude stops
4. Check status: `node .agileflow/scripts/ralph-loop.js --status`
5. Stop loop: `node .agileflow/scripts/ralph-loop.js --stop`

### SelfImprove (`selfimprove`)

Automatic agent expertise learning:
- Analyzes git changes when Claude stops
- Detects which domain (database, api, ui, etc.) was modified
- Appends learnings to the relevant agent's expertise.yaml
- Helps agents improve over time based on actual work
- Enable: `--enable=selfimprove`

**What it learns:**
- Files modified per domain
- New patterns discovered
- Test file changes
- Configuration updates

Both Stop hooks use error suppression (`2>/dev/null || true`) to avoid blocking Claude if they fail.

## Format Migration Details

The script handles these migrations automatically:

**Hook string format:**
```json
// OLD (invalid)
"PreCompact": "./.agileflow/scripts/precompact-context.sh"

// NEW (valid)
"PreCompact": [{"matcher": "", "hooks": [{"type": "command", "command": "bash ./.agileflow/scripts/precompact-context.sh"}]}]
```

**StatusLine missing type:**
```json
// OLD (invalid)
"statusLine": {"command": "./.agileflow/scripts/statusline.sh", "refreshInterval": 5000}

// NEW (valid)
"statusLine": {"type": "command", "command": "./.agileflow/scripts/statusline.sh", "padding": 0}
```

## Metadata Tracking

The script updates `docs/00-meta/agileflow-metadata.json`:

```json
{
  "version": "2.71.0",
  "updated": "2025-12-29T...",
  "archival": {
    "enabled": true,
    "threshold_days": 7
  },
  "features": {
    "sessionstart": {"enabled": true, "version": "2.71.0", "at": "..."},
    "precompact": {"enabled": true, "version": "2.71.0", "at": "..."},
    "archival": {"enabled": true, "version": "2.71.0", "at": "..."},
    "statusline": {"enabled": true, "version": "2.71.0", "at": "..."}
  }
}
```

## Complex Features (Spawn Agents)

For features needing extra user input, spawn specialized agents:

```javascript
// CI/CD - needs provider and commands
Task({
  subagent_type: "agileflow-configuration:ci",
  description: "Configure CI/CD",
  prompt: "Set up CI/CD workflow. Ask for provider (GitHub Actions, GitLab CI, CircleCI) and commands."
})

// Git config - needs remote URL
Task({
  subagent_type: "agileflow-configuration:git-config",
  description: "Configure git",
  prompt: "Set up git remote. Ask for URL."
})
```

## Rules

1. **Always show detection first** - User sees current state before changes
2. **Auto-migrate on enable** - Script fixes format issues automatically when enabling features
3. **Backup on migrate** - Creates `.claude/settings.json.backup`
4. **Restart reminder** - Always show red banner after changes

## Output Format

After configuration:

```
✅ Configuration Complete!

Enabled:
  ✅ sessionstart
  ✅ precompact
  ✅ archival

Disabled:
  ❌ statusline

═══════════════════════════════════════════════════════
🔴 RESTART CLAUDE CODE NOW!
   Quit completely, wait 5 seconds, restart
═══════════════════════════════════════════════════════
```

After upgrade:

```
🔄 Upgrading Outdated Features...

Upgrading sessionstart...
✅ Deployed agileflow-welcome.js
✅ SessionStart hook enabled

Upgrading precompact...
✅ Deployed precompact-context.sh
✅ PreCompact hook enabled

✅ Upgraded 2 feature(s) to v2.71.0
```

## Repair & Diagnostics

When scripts are accidentally deleted or corrupted, use these commands:

### List Scripts Status

```bash
node .agileflow/scripts/agileflow-configure.js --list-scripts
```

Shows all scripts with their status (present/missing/modified):

```
📋 Installed Scripts
  ✅ agileflow-welcome.js: present
  ✅ precompact-context.sh: present
  ❌ agileflow-statusline.sh: MISSING
     └─ Feature: statusline
  ⚠️  obtain-context.js: modified (local changes)

Summary: 15 present, 1 modified, 1 missing

💡 Run with --repair to restore missing scripts
```

### Show Version Info

```bash
node .agileflow/scripts/agileflow-configure.js --version
```

Shows installed vs latest versions:

```
📊 Version Information
Installed:  v2.71.0
CLI:        v2.73.0
Latest:     v2.73.0

🔄 Update available! Run: npx agileflow update

Feature Versions:
  ✅ sessionstart: v2.73.0
  🔄 precompact: v2.68.0 → v2.73.0
  ✅ archival: v2.73.0
  ❌ statusline: disabled
```

### Repair Missing Scripts

```bash
# Repair all missing scripts
node .agileflow/scripts/agileflow-configure.js --repair

# Repair scripts for a specific feature only
node .agileflow/scripts/agileflow-configure.js --repair=statusline
```

Output:

```
🔧 Repairing Scripts...
✅ Restored agileflow-statusline.sh

Repaired: 1, Errors: 0, Skipped: 18

═══════════════════════════════════════════════════════
🔴 RESTART CLAUDE CODE NOW!
   Quit completely, wait 5 seconds, restart
═══════════════════════════════════════════════════════
```

### When to Use Each Command

| Scenario | Command |
|----------|---------|
| Accidentally deleted a script | `--repair` |
| Want to see what's installed | `--list-scripts` |
| Check if update is available | `--version` |
| Scripts outdated (feature version differs) | `--upgrade` |
| Settings format broken | `--migrate` |
| Major corruption/reinstall needed | `npx agileflow update --force`
