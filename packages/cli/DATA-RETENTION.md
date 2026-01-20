# Data Retention Policy

**Last Updated:** January 2026

This document describes how AgileFlow manages and retains data locally on your machine.

## Overview

AgileFlow stores all data locally. There is no cloud storage or external data transmission. You have complete control over your data.

## Retention Categories

### 1. Configuration Data

**Location:** `.agileflow/config/`

**Retention:** Indefinite until manual deletion

**Files:**
| File | Purpose | Retention |
|------|---------|-----------|
| `consent.json` | Privacy consent record | Indefinite (compliance requirement) |
| `settings.json` | User preferences | Until manually deleted |
| `metadata.json` | Installation metadata | Until manually deleted |

**Deletion:**
```bash
rm -rf .agileflow/config/
```

### 2. Session Data

**Location:** `docs/09-agents/session-state.json`

**Retention:** Cleared automatically on session end, or after 24 hours of inactivity

**What's tracked:**
- Current session ID
- Active commands
- Session start time
- Current story being worked on

**Automatic Cleanup:**
Sessions are considered stale after 24 hours of inactivity and are automatically cleaned up on the next session start.

### 3. Story/Project Data

**Location:** `docs/09-agents/status.json`

**Retention:** Indefinite for active stories, auto-archived for completed stories

**Auto-Archival:**
- Completed stories older than **7 days** are automatically archived
- Archived stories are moved to `docs/09-agents/archive/YYYY-MM.json`
- Configurable in `docs/00-meta/agileflow-metadata.json`:

```json
{
  "archival": {
    "threshold_days": 7,
    "enabled": true
  }
}
```

**To disable auto-archival:**
```json
{
  "archival": {
    "enabled": false
  }
}
```

### 4. Message Bus Logs

**Location:** `docs/09-agents/bus/log.jsonl`

**Retention:** Rolling 1000 messages (oldest messages pruned)

**Content:**
- Inter-agent communication messages
- Timestamps
- Message types

**Manual Cleanup:**
```bash
rm docs/09-agents/bus/log.jsonl
```

### 5. Research Notes

**Location:** `docs/10-research/`

**Retention:** Indefinite until manual deletion

**Content:**
- Research notes in Markdown format
- Named with date prefixes (e.g., `20260119-topic.md`)

### 6. Documentation

**Location:** `docs/`

**Retention:** Indefinite until manual deletion

**Directories:**
| Directory | Purpose |
|-----------|---------|
| `00-meta/` | Metadata and configuration |
| `01-brainstorming/` | Ideas and proposals |
| `02-practices/` | Development practices |
| `03-decisions/` | Architecture Decision Records |
| `04-architecture/` | System design docs |
| `05-epics/` | Epic tracking |
| `06-stories/` | Story files |
| `07-testing/` | Test documentation |
| `08-project/` | Project overview |
| `09-agents/` | Agent state (auto-managed) |
| `10-research/` | Research notes |

## Retention Schedule Summary

| Data Type | Default Retention | Automatic Cleanup |
|-----------|-------------------|-------------------|
| Configuration | Indefinite | No |
| Session state | 24 hours inactive | Yes |
| Active stories | Indefinite | No |
| Completed stories | 7 days | Yes (archived) |
| Archived stories | Indefinite | No |
| Bus messages | 1000 messages | Yes (rolling) |
| Research notes | Indefinite | No |
| Documentation | Indefinite | No |

## Data Minimization

AgileFlow follows data minimization principles:

1. **Collect Only What's Needed**: Only workflow-essential data is stored
2. **Local Storage Only**: No cloud sync or external transmission
3. **Automatic Cleanup**: Stale data is automatically cleaned up
4. **User Control**: You can delete any data at any time

## Complete Data Deletion

To completely remove all AgileFlow data from a project:

```bash
# 1. Remove AgileFlow installation
rm -rf .agileflow/

# 2. Remove Claude Code commands (if installed)
rm -rf .claude/commands/agileflow/

# 3. Remove AgileFlow-managed documentation (optional)
rm -rf docs/

# 4. Remove from package.json devDependencies (if installed)
npm uninstall agileflow
```

## Backup Recommendations

Since AgileFlow stores data locally, we recommend:

1. **Version Control**: Commit `docs/` directory to git (excluding `09-agents/`)
2. **Regular Backups**: Back up your project directory as part of normal backup procedures
3. **Export Before Deletion**: Copy important data before running cleanup commands

## Audit Trail

AgileFlow maintains an audit trail for story transitions:

**Location:** In-memory during session, persisted in `status.json`

**Content:**
- Story ID
- Previous status
- New status
- Timestamp
- Actor (if provided)
- Reason (if provided)

**Access:**
```javascript
const { getAuditTrail } = require('agileflow/scripts/lib/story-state-machine');
const trail = getAuditTrail({ storyId: 'US-001' });
```

## Contact

For questions about data retention:
- Open an issue: https://github.com/projectquestorg/AgileFlow/issues
- See also: [PRIVACY.md](./PRIVACY.md)
