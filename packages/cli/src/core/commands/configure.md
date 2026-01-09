---
description: Configure AgileFlow features, hooks, and project infrastructure (Visual E2E, CI, git)
argument-hint: [--profile=<name>] [--save-profile=<name>] [--list-profiles] [--export-profile=<name>] [--import-profile=<file>] [--enable/--disable=features]
compact_context:
  priority: critical
  preserve_rules:
    - "ACTIVE COMMAND: /agileflow:configure - Configuration manager for AgileFlow features"
    - "CRITICAL: Max 4 options per AskUserQuestion - use hierarchical menus"
    - "CRITICAL: Run --detect FIRST, handle issues, then show Main Menu"
    - "Main Menu (4 categories): Profiles | Features | Infrastructure | Maintenance"
    - "Each category has its own sub-menu with max 4 options"
    - "MUST show RED RESTART banner after ANY changes"
  state_fields:
    - detection_status
    - has_format_issues
    - has_outdated_scripts
    - enabled_features
---

<!-- COMPACT_SUMMARY_START -->

## Compact Summary

Configuration management with **hierarchical menus** (4 options max per question).

### Workflow (MUST FOLLOW)

1. **Run detection**: `node .agileflow/scripts/agileflow-configure.js --detect`
2. **Handle issues**: If ⚠️ INVALID FORMAT → migrate. If 🔄 OUTDATED → upgrade.
3. **Main menu** (4 categories): Profiles | Features | Infrastructure | Maintenance
4. **Sub-menu**: Based on selection, show category-specific options

### Menu Flow

```
Main Menu → "What would you like to configure?"
├─ Profiles       → Apply preset | Apply custom | Save current | Manage
│                   ├─ Presets: Full | Basic | Minimal | None
│                   └─ Custom: Save, Export, Import, Delete
├─ Features       → Enable | Disable | View status
│                   └─ Hooks (4) + Other Features (4)
├─ Infrastructure → Visual E2E | Damage Control | CI/CD
└─ Maintenance    → Fix format | Upgrade | Repair | Check status
```

### Quick Commands

```bash
node .agileflow/scripts/agileflow-configure.js --detect        # Check status
node .agileflow/scripts/agileflow-configure.js --profile=full  # Enable all
node .agileflow/scripts/agileflow-configure.js --migrate       # Fix format
node .agileflow/scripts/agileflow-configure.js --upgrade       # Update scripts
node .agileflow/scripts/agileflow-configure.js --repair        # Restore missing
```

### Critical Rules

- **Max 4 options per AskUserQuestion** - use hierarchical menus
- **Run detection FIRST** - show current state before changes
- **Restart required** - show red banner after any changes

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

## STEP 3: Main Menu

After handling issues (or if none), present the main category menu:

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "What would you like to configure?",
  "header": "Configure",
  "multiSelect": false,
  "options": [
    {"label": "Profiles", "description": "Quick setup with preset configurations (full, basic, minimal)"},
    {"label": "Features", "description": "Enable or disable individual hooks and features"},
    {"label": "Infrastructure", "description": "Set up Visual E2E, Damage Control, or CI/CD"},
    {"label": "Maintenance", "description": "Fix issues, repair scripts, or check status"}
  ]
}]</parameter>
</invoke>
```

---

## STEP 4: Sub-menus

### If "Profiles" selected

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "What would you like to do with profiles?",
  "header": "Profiles",
  "multiSelect": false,
  "options": [
    {"label": "Apply preset profile", "description": "Full, Basic, Minimal, or None"},
    {"label": "Apply custom profile", "description": "Use one of your saved profiles"},
    {"label": "Save current as profile", "description": "Save current feature settings as reusable profile"},
    {"label": "Manage profiles", "description": "View, export, import, or delete profiles"}
  ]
}]</parameter>
</invoke>
```

#### If "Apply preset profile" selected

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "Which preset?",
  "header": "Preset",
  "multiSelect": false,
  "options": [
    {"label": "Full (Recommended)", "description": "All features: hooks, archival, status line, AskUserQuestion"},
    {"label": "Basic", "description": "SessionStart + PreCompact + Archival + AskUserQuestion"},
    {"label": "Minimal", "description": "SessionStart + Archival only"},
    {"label": "None", "description": "Disable all AgileFlow features"}
  ]
}]</parameter>
</invoke>
```

Then run:
- "Full" → `node .agileflow/scripts/agileflow-configure.js --profile=full`
- "Basic" → `node .agileflow/scripts/agileflow-configure.js --profile=basic`
- "Minimal" → `node .agileflow/scripts/agileflow-configure.js --profile=minimal`
- "None" → `node .agileflow/scripts/agileflow-configure.js --profile=none`

#### If "Apply custom profile" selected

First, check if custom profiles exist:
```bash
node .agileflow/scripts/agileflow-configure.js --list-profiles
```

If no profiles: "No custom profiles saved yet. Create one with 'Save current as profile'."

If profiles exist, list them (max 4 at a time):
```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "Which custom profile?",
  "header": "Custom",
  "multiSelect": false,
  "options": [
    {"label": "my-backend-setup", "description": "Backend dev - no UI features"},
    {"label": "ui-heavy", "description": "UI development with visual verification"},
    {"label": "ci-mode", "description": "Minimal for CI/CD pipelines"}
  ]
}]</parameter>
</invoke>
```

Then run: `node .agileflow/scripts/agileflow-configure.js --profile=<selected-name>`

#### If "Save current as profile" selected

Ask for profile name and description:
```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "What should we name this profile?",
  "header": "Name",
  "multiSelect": false,
  "options": [
    {"label": "my-setup", "description": "Generic name for personal setup"},
    {"label": "backend-dev", "description": "For backend development work"},
    {"label": "ui-dev", "description": "For UI/frontend development"},
    {"label": "ci-mode", "description": "Minimal config for CI pipelines"}
  ]
}]</parameter>
</invoke>
```

User can select or type custom name via "Other".

Then run:
```bash
node .agileflow/scripts/agileflow-configure.js --save-profile=<name> --description="<description>"
```

#### If "Manage profiles" selected

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "What would you like to do?",
  "header": "Manage",
  "multiSelect": false,
  "options": [
    {"label": "View all profiles", "description": "See details of all saved profiles"},
    {"label": "Export profile", "description": "Export a profile to share with others"},
    {"label": "Import profile", "description": "Import a profile from file"},
    {"label": "Delete profile", "description": "Remove a saved custom profile"}
  ]
}]</parameter>
</invoke>
```

Commands:
- View: `node .agileflow/scripts/agileflow-configure.js --list-profiles --verbose`
- Export: `node .agileflow/scripts/agileflow-configure.js --export-profile=<name> --output=profile.json`
- Import: `node .agileflow/scripts/agileflow-configure.js --import-profile=profile.json`
- Delete: `node .agileflow/scripts/agileflow-configure.js --delete-profile=<name>`

---

### If "Features" selected

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "What do you want to do?",
  "header": "Features",
  "multiSelect": false,
  "options": [
    {"label": "Enable features", "description": "Turn on specific hooks and features"},
    {"label": "Disable features", "description": "Turn off specific hooks and features"},
    {"label": "View current status", "description": "See what's currently enabled/disabled"}
  ]
}]</parameter>
</invoke>
```

#### If "Enable features" or "Disable features" selected

First, ask about hooks:

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "Which hooks?",
  "header": "Hooks",
  "multiSelect": true,
  "options": [
    {"label": "SessionStart", "description": "Welcome display with project status on session start"},
    {"label": "PreCompact", "description": "Context preservation when conversation compacts"},
    {"label": "RalphLoop", "description": "Stop hook: autonomous story loop with tests"},
    {"label": "SelfImprove", "description": "Stop hook: auto-update agent expertise from work"}
  ]
}]</parameter>
</invoke>
```

Then ask about other features:

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "Which other features?",
  "header": "Features",
  "multiSelect": true,
  "options": [
    {"label": "Archival", "description": "Auto-archive completed stories older than threshold"},
    {"label": "Status Line", "description": "Custom status bar showing story/epic info"},
    {"label": "Auto-Update", "description": "Automatically update AgileFlow on session start"},
    {"label": "AskUserQuestion Mode", "description": "End responses with guided options"}
  ]
}]</parameter>
</invoke>
```

Map selections to commands:
- SessionStart → `sessionstart`
- PreCompact → `precompact`
- RalphLoop → `ralphloop`
- SelfImprove → `selfimprove`
- Archival → `archival`
- Status Line → `statusline`
- Auto-Update → `autoupdate`
- AskUserQuestion Mode → `askuserquestion`

Then run:
```bash
node .agileflow/scripts/agileflow-configure.js --enable=feature1,feature2
# or
node .agileflow/scripts/agileflow-configure.js --disable=feature1,feature2
```

---

### If "Infrastructure" selected

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "What infrastructure to set up?",
  "header": "Setup",
  "multiSelect": false,
  "options": [
    {"label": "Visual E2E Testing", "description": "Playwright + screenshot verification workflow"},
    {"label": "Damage Control", "description": "Block destructive commands, protect sensitive paths"},
    {"label": "CI/CD Workflow", "description": "GitHub Actions for automated testing"}
  ]
}]</parameter>
</invoke>
```

Spawn the appropriate configuration agent:

```javascript
// Visual E2E
Task({ subagent_type: "configuration-visual-e2e", description: "Configure Visual E2E", prompt: "..." })

// Damage Control
Task({ subagent_type: "configuration-damage-control", description: "Configure Damage Control", prompt: "..." })

// CI/CD
Task({ subagent_type: "configuration-ci", description: "Configure CI/CD", prompt: "..." })
```

---

### If "Maintenance" selected

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "What maintenance task?",
  "header": "Maintenance",
  "multiSelect": false,
  "options": [
    {"label": "Fix format issues", "description": "Migrate invalid settings to correct format"},
    {"label": "Upgrade scripts", "description": "Update features to latest AgileFlow version"},
    {"label": "Repair missing scripts", "description": "Restore accidentally deleted scripts"},
    {"label": "Check status", "description": "View current configuration (already shown above)"}
  ]
}]</parameter>
</invoke>
```

Then run:
- "Fix format issues" → `node .agileflow/scripts/agileflow-configure.js --migrate`
- "Upgrade scripts" → `node .agileflow/scripts/agileflow-configure.js --upgrade`
- "Repair missing scripts" → `node .agileflow/scripts/agileflow-configure.js --repair`
- "Check status" → Already shown in Step 1, no action needed

---

## Profile Details

| Profile | SessionStart | PreCompact | RalphLoop | SelfImprove | Archival | StatusLine | AskUserQuestion |
|---------|-------------|------------|-----------|-------------|----------|------------|-----------------|
| `full` | ✅ | ✅ | ✅ | ✅ | ✅ 30 days | ✅ | ✅ |
| `basic` | ✅ | ✅ | ❌ | ❌ | ✅ 30 days | ❌ | ✅ |
| `minimal` | ✅ | ❌ | ❌ | ❌ | ✅ 30 days | ❌ | ❌ |
| `none` | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

## CLI Commands Reference

```bash
# Preset Profiles
node .agileflow/scripts/agileflow-configure.js --profile=full
node .agileflow/scripts/agileflow-configure.js --profile=basic
node .agileflow/scripts/agileflow-configure.js --profile=minimal
node .agileflow/scripts/agileflow-configure.js --profile=none

# Custom Profiles
node .agileflow/scripts/agileflow-configure.js --profile=my-custom-profile    # Apply custom
node .agileflow/scripts/agileflow-configure.js --save-profile=my-setup        # Save current
node .agileflow/scripts/agileflow-configure.js --list-profiles                # List all
node .agileflow/scripts/agileflow-configure.js --list-profiles --verbose      # With details
node .agileflow/scripts/agileflow-configure.js --delete-profile=my-setup      # Delete

# Export/Import Profiles (for sharing)
node .agileflow/scripts/agileflow-configure.js --export-profile=my-setup --output=my-setup.json
node .agileflow/scripts/agileflow-configure.js --import-profile=my-setup.json

# Enable/disable features
node .agileflow/scripts/agileflow-configure.js --enable=sessionstart,precompact
node .agileflow/scripts/agileflow-configure.js --disable=statusline
node .agileflow/scripts/agileflow-configure.js --enable=archival --archival-days=14

# Maintenance
node .agileflow/scripts/agileflow-configure.js --detect
node .agileflow/scripts/agileflow-configure.js --migrate
node .agileflow/scripts/agileflow-configure.js --upgrade
node .agileflow/scripts/agileflow-configure.js --repair
node .agileflow/scripts/agileflow-configure.js --list-scripts
node .agileflow/scripts/agileflow-configure.js --version
```

## Custom Profiles

Custom profiles let you save and reuse your preferred feature combinations.

### Data Model

Profiles are stored in `docs/00-meta/agileflow-metadata.json`:

```json
{
  "version": "2.78.0",
  "profiles": {
    "my-backend-setup": {
      "description": "Backend development - no UI features",
      "created": "2026-01-09T10:00:00.000Z",
      "features": {
        "sessionstart": true,
        "precompact": true,
        "ralphloop": true,
        "selfimprove": false,
        "archival": true,
        "statusline": false,
        "autoupdate": true,
        "askuserquestion": false
      }
    },
    "ui-heavy": {
      "description": "UI development with visual verification",
      "created": "2026-01-09T10:00:00.000Z",
      "features": {
        "sessionstart": true,
        "precompact": true,
        "ralphloop": true,
        "selfimprove": false,
        "archival": true,
        "statusline": true,
        "autoupdate": false,
        "askuserquestion": true
      }
    }
  },
  "features": { ... }
}
```

### Export Format

Exported profiles use this format (for sharing):

```json
{
  "name": "my-backend-setup",
  "description": "Backend development - no UI features",
  "agileflow_version": "2.78.0",
  "exported": "2026-01-09T10:00:00.000Z",
  "features": {
    "sessionstart": true,
    "precompact": true,
    "ralphloop": true,
    "selfimprove": false,
    "archival": true,
    "statusline": false,
    "autoupdate": true,
    "askuserquestion": false
  }
}
```

### Sharing Profiles

1. **Export**: `--export-profile=my-setup --output=my-setup.json`
2. **Share**: Send the JSON file to teammate
3. **Import**: `--import-profile=my-setup.json`

Imported profiles are added to the local metadata with the same name.

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
