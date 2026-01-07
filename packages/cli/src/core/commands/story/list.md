---
description: List all stories with status and filters
argument-hint: [EPIC=<EP-ID>] [STATUS=<status>] [OWNER=<id>]
---

# /agileflow:story:list

Display all user stories with filtering and quick actions.

---

## Purpose

Shows all stories from `docs/09-agents/status.json` with:
- Status (ready, in_progress, blocked, done)
- Epic grouping
- Owner assignment
- Quick action options

**This is a read-only command** - no files are written.

---

<!-- COMPACT_SUMMARY_START -->
## Compact Summary

**Command**: `/agileflow:story:list [EPIC=<EP-ID>] [STATUS=<status>] [OWNER=<id>]`
**Purpose**: Display stories with filters and offer quick actions

### Flow
1. Read status.json
2. Apply filters (epic, status, owner)
3. Display formatted table
4. Offer actions: view details, start work, create new

### Critical Rules
- **Read-only**: No file writes
- **Always offer actions**: End with AskUserQuestion for next steps
- **Group by epic**: Show stories organized by their parent epic
<!-- COMPACT_SUMMARY_END -->

---

## Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| EPIC | No | Filter by epic (e.g., EP-0001) |
| STATUS | No | Filter by status (ready, in_progress, blocked, done) |
| OWNER | No | Filter by owner |

---

## IMMEDIATE ACTIONS

Upon invocation, execute these steps:

### Step 1: Read Status File

```bash
cat docs/09-agents/status.json
```

### Step 2: Apply Filters

If filters provided:
- EPIC: Show only stories in that epic
- STATUS: Show only stories with that status
- OWNER: Show only stories assigned to that owner

### Step 3: Display Stories

Format output as table grouped by epic:

```markdown
## Stories

### EP-0001: Authentication System
| Story | Title | Status | Owner | Estimate |
|-------|-------|--------|-------|----------|
| US-0001 | Login form | done | AG-UI | 2h |
| US-0002 | Password reset | in_progress | AG-API | 3h |
| US-0003 | Session management | ready | AG-API | 4h |

### EP-0002: User Dashboard
| Story | Title | Status | Owner | Estimate |
|-------|-------|--------|-------|----------|
| US-0004 | Dashboard layout | ready | AG-UI | 2h |
| US-0005 | Activity feed | ready | AG-UI | 3h |

---
**Summary**: 5 stories (1 done, 1 in_progress, 3 ready)
```

### Step 4: Offer Actions

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "What would you like to do?",
  "header": "Actions",
  "multiSelect": false,
  "options": [
    {"label": "View story details", "description": "See full story with acceptance criteria"},
    {"label": "Start working on a story", "description": "Mark a ready story as in_progress"},
    {"label": "Create new story", "description": "Add a new story to an epic"},
    {"label": "Done", "description": "Exit"}
  ]
}]</parameter>
</invoke>
```

**If "View story details"**:
```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "Which story would you like to view?",
  "header": "Select",
  "multiSelect": false,
  "options": [
    {"label": "US-0003: Session management (ready)", "description": "EP-0001 - AG-API"},
    {"label": "US-0004: Dashboard layout (ready)", "description": "EP-0002 - AG-UI"},
    {"label": "US-0005: Activity feed (ready)", "description": "EP-0002 - AG-UI"}
  ]
}]</parameter>
</invoke>
```

Then invoke: `/agileflow:story:view STORY=<selected>`

**If "Start working on a story"**:
Show only `ready` stories, then invoke:
`/agileflow:status <selected> STATUS=in_progress`

**If "Create new story"**:
Invoke: `/agileflow:story`

---

## Example Usage

```bash
# List all stories
/agileflow:story:list

# List stories for specific epic
/agileflow:story:list EPIC=EP-0001

# List only ready stories
/agileflow:story:list STATUS=ready

# List stories assigned to specific owner
/agileflow:story:list OWNER=AG-UI

# Combined filters
/agileflow:story:list EPIC=EP-0001 STATUS=ready
```

---

## Rules

- **Read-only**: No file writes
- **Group by epic**: Always organize stories under their parent epic
- **Show summary**: Include counts by status at the bottom
- **Always offer actions**: End with next step options

---

## Related Commands

- `/agileflow:story:view` - View full story details
- `/agileflow:story` - Create new story
- `/agileflow:story-validate` - Validate story completeness
- `/agileflow:status` - Update story status
- `/agileflow:board` - Visual kanban board view
