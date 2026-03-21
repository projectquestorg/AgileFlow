---
description: List all epics with status and progress
argument-hint: "[STATUS=<status>] [OWNER=<id>] [SEARCH=<text>]"
compact_context:
  priority: medium
  preserve_rules:
    - "ACTIVE COMMAND: /agileflow:epic:list - Lists all epics with progress tracking"
    - "MUST read status.json for epic data"
    - "MUST support filters: STATUS, OWNER, SEARCH (combinable, AND-combined)"
    - "MUST calculate story progress (completed/total) for each epic"
    - "MUST display table with status, progress percentage, owner"
    - "MUST show active filters header with result count when filtered"
    - "MUST offer actions: view details, add story, create new epic"
    - "This is READ-ONLY - no file writes"
  state_fields:
    - status_filter
    - owner_filter
    - search_query
    - epic_count
---

# /agileflow:epic:list

Display all epics with progress tracking and quick actions.

---

## Purpose

Shows all epics from `docs/09-agents/status.json` with:
- Status (active, complete, on-hold)
- Story count and completion percentage
- Owner assignment
- Quick action options

**This is a read-only command** - no files are written.

---

## STEP 0: Gather Context

```bash
node .agileflow/scripts/obtain-context.js epic:list
```

---

<!-- COMPACT_SUMMARY_START -->
## Compact Summary

**Command**: `/agileflow:epic:list [STATUS=<status>] [OWNER=<id>] [SEARCH=<text>]`
**Purpose**: Display epics with progress and offer quick actions

### Flow
1. Read status.json for epics
2. Calculate story progress for each epic
3. Apply filters (status, owner, search — AND-combined)
4. Display formatted table with active filters header and result count
5. Offer actions: view details, add story, create new

### Critical Rules
- **Read-only**: No file writes
- **Show progress**: Include story completion percentage
- **Always offer actions**: End with AskUserQuestion for next steps
<!-- COMPACT_SUMMARY_END -->

---

## Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| STATUS | No | Filter by status (active, complete, on-hold) |
| OWNER | No | Filter by owner |
| SEARCH | No | Full-text search on epic title (case-insensitive substring match) |

---

## IMMEDIATE ACTIONS

Upon invocation, execute these steps:

### Step 1: Read Status File

```bash
cat docs/09-agents/status.json
```

### Step 2: Calculate Progress

For each epic:
- Count total stories
- Count completed stories
- Calculate percentage

### Step 3: Apply Filters

If filters provided (all filters are AND-combined — all must match):
- STATUS: Show only epics with that status
- OWNER: Show only epics assigned to that owner
- SEARCH: Show only epics whose title contains the search text (case-insensitive substring match)

### Step 4: Display Epics

If any filters are active, show a header line before the table:

```markdown
**Showing N of M epics** (STATUS=active, OWNER=AG-UI)
```

Only list the filters that are actually active. Omit this header when no filters are applied.

Format output as table sorted by status then number:

```markdown
## Epics

**Showing 2 of 3 epics** (STATUS=active)

| Epic | Title | Status | Progress | Owner |
|------|-------|--------|----------|-------|
| EP-0003 | User Dashboard | active | 2/5 (40%) | AG-UI |
| EP-0002 | Authentication | active | 4/6 (67%) | AG-API |
| EP-0001 | Core Setup | complete | 3/3 (100%) | AG-DEVOPS |

---
**Summary**: 3 epics (2 active, 1 complete)
**Stories**: 9/14 complete (64%)

Legend:
- **active**: In progress, accepting new stories
- **complete**: All stories done
- **on-hold**: Paused, not currently worked on
```

### Step 5: Offer Actions

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "What would you like to do?",
  "header": "Actions",
  "multiSelect": false,
  "options": [
    {"label": "View epic details", "description": "See all stories in an epic with progress"},
    {"label": "Add story to epic", "description": "Create a new story in an existing epic"},
    {"label": "Create new epic", "description": "Start a new feature epic"},
    {"label": "Done", "description": "Exit"}
  ]
}]</parameter>
</invoke>
```

**If "View epic details"**:
```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "Which epic would you like to view?",
  "header": "Select",
  "multiSelect": false,
  "options": [
    {"label": "EP-0003: User Dashboard (40%)", "description": "active - 2/5 stories"},
    {"label": "EP-0002: Authentication (67%)", "description": "active - 4/6 stories"},
    {"label": "EP-0001: Core Setup (100%)", "description": "complete - 3/3 stories"}
  ]
}]</parameter>
</invoke>
```

Then invoke: `/agileflow:epic:view EPIC=<selected>`

**If "Add story to epic"**:
Ask which epic, then invoke: `/agileflow:story EPIC=<selected>`

**If "Create new epic"**:
Invoke: `/agileflow:epic`

---

## Example Usage

```bash
# List all epics
/agileflow:epic:list

# List only active epics
/agileflow:epic:list STATUS=active

# List completed epics
/agileflow:epic:list STATUS=complete

# Filter by owner
/agileflow:epic:list OWNER=AG-DEVOPS

# Search epics by title
/agileflow:epic:list SEARCH=auth

# Combined filters (AND-combined)
/agileflow:epic:list STATUS=active OWNER=AG-API
/agileflow:epic:list SEARCH=dashboard STATUS=active
```

---

## Rules

- **Read-only**: No file writes
- **Show progress**: Calculate and display story completion
- **Show summary**: Include totals at the bottom
- **Always offer actions**: End with next step options

---

## Related Commands

- `/agileflow:epic:view` - View epic details with all stories
- `/agileflow:epic` - Create new epic
- `/agileflow:story:list` - View all stories
- `/agileflow:board` - Visual kanban board
- `/agileflow:sprint` - Sprint planning
