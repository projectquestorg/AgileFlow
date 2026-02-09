---
description: Manage scheduled automations for recurring tasks
argument-hint: "ACTION=list|add|edit|remove|run|presets [ID=<automation-id>]"
compact_context:
  priority: medium
  preserve_rules:
    - "ACTIVE COMMAND: /agileflow:automate - Scheduled automation management"
    - "Automations stored in docs/09-agents/automation-schedule.json"
    - "No daemon required - runs during user sessions"
  state_fields:
    - action
    - automation_id
    - schedule_type
---

# automate

Manage scheduled automations for recurring tasks like changelog generation, dependency audits, and tech debt scans.

---

## Overview

AgileFlow's automation system enables recurring tasks without requiring a daemon process. Automations run during user sessions, triggered by the SessionStart hook.

**Key Features**:
- **No daemon required** - Runs when you start a session
- **Simple scheduling** - Daily, weekly, monthly, or custom intervals
- **Loop detection** - Prevents runaway automation chains
- **Timeout protection** - Kills stuck processes
- **Retry logic** - Automatic retries with exponential backoff

---

## Usage

### List Automations

```
/agileflow:automate ACTION=list
```

Shows all configured automations with their schedules and status.

### View Presets

```
/agileflow:automate ACTION=presets
```

Shows available preset automations that can be installed.

### Add Automation

```
/agileflow:automate ACTION=add ID=weekly-report
```

Add a new automation (interactive wizard).

### Edit Automation

```
/agileflow:automate ACTION=edit ID=weekly-changelog
```

Modify an existing automation.

### Remove Automation

```
/agileflow:automate ACTION=remove ID=weekly-changelog
```

Delete an automation.

### Run Automation Manually

```
/agileflow:automate ACTION=run ID=weekly-changelog
```

Run an automation immediately without waiting for schedule.

### Run All Due

```
/agileflow:automate ACTION=run-due
```

Run all automations that are due based on their schedules.

---

## Schedule Types

| Type | Description | Example |
|------|-------------|---------|
| `daily` | Run once per day | Every day at session start |
| `weekly` | Run on specific day | Every Sunday |
| `monthly` | Run on specific date | 1st of every month |
| `interval` | Run every N hours | Every 12 hours |
| `on_session` | Run every session | Every time you start Claude |

---

## Preset Automations

Available presets that can be installed:

| Preset | Description | Schedule |
|--------|-------------|----------|
| `weekly-changelog` | Generate changelog from commits | Weekly (Sunday) |
| `daily-ci-summary` | Summarize CI failures | Daily |
| `monthly-debt-scan` | Scan for tech debt | Monthly (1st) |
| `weekly-dependency-audit` | Check for vulnerabilities | Weekly (Monday) |
| `session-context-refresh` | Refresh CONTEXT.md | Every session |

Install with:
```
/agileflow:automate ACTION=add ID=weekly-changelog PRESET=true
```

---

## Prompt

ROLE: Automation Manager

INPUTS:
- ACTION=list|add|edit|remove|run|run-due|presets (required)
- ID=<automation-id> (required for add/edit/remove/run)
- PRESET=true (optional, use preset template)

ACTIONS:

**For ACTION=list**:
1. Load `docs/09-agents/automation-schedule.json`
2. Display all automations with:
   - ID and name
   - Schedule (type, day/date/hours)
   - Enabled status
   - Last run time (if available)
   - Next expected run

**For ACTION=presets**:
1. List available preset templates:
   - weekly-changelog
   - daily-ci-summary
   - monthly-debt-scan
   - weekly-dependency-audit
   - session-context-refresh

**For ACTION=add**:
1. If PRESET=true, load preset definition
2. Otherwise, use interactive wizard:
   - Ask for name and description
   - Ask for command or script
   - Ask for schedule type
   - Ask for schedule parameters (day/date/hours)
   - Ask for timeout (default: 5 minutes)
   - Ask for retry count (default: 2)
3. Validate automation definition
4. Save to automation-schedule.json
5. Report success

**For ACTION=edit**:
1. Load existing automation by ID
2. Show current values
3. Ask what to modify
4. Update and save

**For ACTION=remove**:
1. Confirm deletion
2. Remove from automation-schedule.json
3. Report success

**For ACTION=run**:
1. Load automation by ID
2. Execute immediately (bypass schedule check)
3. Show output in real-time
4. Record run in history
5. Report success/failure

**For ACTION=run-due**:
1. Get all due automations from registry
2. Run each sequentially
3. Report results summary

---

## Implementation

### Load Automation Registry

```javascript
const { getAutomationRegistry } = require('./.agileflow/scripts/lib/automation-registry');
const registry = getAutomationRegistry();

// List all
const automations = registry.list();

// Get due
const due = registry.getDue();

// Install preset
registry.installPreset('weekly-changelog');
```

### Run Automation

```javascript
const { getAutomationRunner } = require('./.agileflow/scripts/lib/automation-runner');
const runner = getAutomationRunner();

// Run specific automation
const result = await runner.run('weekly-changelog');

// Run all due
const results = await runner.runDue();
```

---

## Expected Output

### ACTION=list

```
/agileflow:automate ACTION=list

📋 Scheduled Automations
────────────────────────────────────────────────

ID: weekly-changelog
  Name:     Weekly Changelog Generation
  Schedule: Weekly (Sunday)
  Enabled:  ✅ Yes
  Last Run: 2026-01-26T10:00:00Z (7 days ago)
  Next:     Due now

ID: daily-ci-summary
  Name:     Daily CI Summary
  Schedule: Daily
  Enabled:  ✅ Yes
  Last Run: 2026-02-02T08:00:00Z (yesterday)
  Next:     Not due yet

ID: monthly-debt-scan
  Name:     Monthly Tech Debt Scan
  Schedule: Monthly (1st)
  Enabled:  ❌ No
  Last Run: Never
  Next:     Disabled

────────────────────────────────────────────────
Total: 3 automations | Enabled: 2 | Due: 1
```

### ACTION=presets

```
/agileflow:automate ACTION=presets

📦 Available Automation Presets
────────────────────────────────────────────────

weekly-changelog
  Weekly Changelog Generation
  Generate changelog from commits every Sunday
  Schedule: Weekly (Sunday)
  Timeout: 5 minutes

daily-ci-summary
  Daily CI Summary
  Summarize CI failures from the past 24 hours
  Schedule: Daily
  Timeout: 2 minutes

monthly-debt-scan
  Monthly Tech Debt Scan
  Scan for tech debt and generate report on the 1st
  Schedule: Monthly (1st)
  Timeout: 10 minutes

weekly-dependency-audit
  Weekly Dependency Audit
  Check for security vulnerabilities every Monday
  Schedule: Weekly (Monday)
  Timeout: 3 minutes

────────────────────────────────────────────────
Install with: /agileflow:automate ACTION=add ID=<preset-id> PRESET=true
```

### ACTION=run

```
/agileflow:automate ACTION=run ID=weekly-changelog

🚀 Running: weekly-changelog
────────────────────────────────────────────────

[10:00:01] Starting automation...
[10:00:02] Generating changelog...
[10:00:05] Found 15 commits since last release
[10:00:07] Changelog updated: CHANGELOG.md
[10:00:07] Complete

────────────────────────────────────────────────
✅ Success
Duration: 6.2 seconds
Output: CHANGELOG.md updated with 15 commits
```

### ACTION=add (Interactive)

```
/agileflow:automate ACTION=add ID=custom-backup

Creating new automation: custom-backup
────────────────────────────────────────────────

[AskUserQuestion: "What should this automation be called?"]
Name: Daily Database Backup

[AskUserQuestion: "Enter the command or script to run"]
Command: ./scripts/backup-db.sh

[AskUserQuestion: "How often should this run?"]
Schedule: Daily

[AskUserQuestion: "Timeout in minutes? (default: 5)"]
Timeout: 10

────────────────────────────────────────────────

Preview:
  ID:       custom-backup
  Name:     Daily Database Backup
  Command:  ./scripts/backup-db.sh
  Schedule: Daily
  Timeout:  10 minutes
  Enabled:  Yes

[AskUserQuestion: "Create this automation?"]

✅ Automation created: custom-backup
```

---

## Configuration File

Automations are stored in `docs/09-agents/automation-schedule.json`:

```json
{
  "schema_version": "1.0.0",
  "created_at": "2026-01-01T00:00:00Z",
  "updated_at": "2026-02-03T10:00:00Z",
  "automations": {
    "weekly-changelog": {
      "name": "Weekly Changelog Generation",
      "description": "Generate changelog from commits every Sunday",
      "command": "/agileflow:changelog ACTION=generate",
      "schedule": {
        "type": "weekly",
        "day": "sunday"
      },
      "timeout": 300000,
      "enabled": true,
      "created_at": "2026-01-01T00:00:00Z",
      "updated_at": "2026-01-15T00:00:00Z"
    }
  },
  "run_history": [
    {
      "automation_id": "weekly-changelog",
      "at": "2026-01-26T10:00:00Z",
      "success": true,
      "duration_ms": 6200,
      "output": "CHANGELOG.md updated"
    }
  ]
}
```

---

## Safety Features

### Loop Detection
- Detects if automation runs more than 3 times in 5 minutes
- Prevents infinite automation chains
- Logs warning when loop detected

### Timeout Protection
- Default: 5 minutes per automation
- Configurable per automation
- SIGTERM followed by SIGKILL after 5s

### Retry Logic
- Default: 2 retries on failure
- Exponential backoff (5s, 10s, 20s)
- Records all attempts in history

---

## Related Commands

- `/agileflow:changelog` - Generate changelogs
- `/agileflow:debt` - Tech debt scanning
- `/agileflow:ci` - CI/CD operations
- `/agileflow:configure` - Configure hooks and features
