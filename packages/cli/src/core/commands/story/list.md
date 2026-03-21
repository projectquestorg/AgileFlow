---
description: List all stories with status and filters
argument-hint: "[EPIC=<EP-ID>] [STATUS=<status>] [OWNER=<id>] [SEARCH=<text>] [PRIORITY=<level>]"
compact_context:
  priority: medium
  preserve_rules:
    - "ACTIVE COMMAND: /agileflow:story:list - Lists stories with filters and quick actions"
    - "MUST read status.json for story data"
    - "MUST support filters: EPIC, STATUS, OWNER, SEARCH, PRIORITY (combinable, AND-combined)"
    - "MUST group stories by epic in output table"
    - "MUST show: story ID, title, status, phase, owner, estimate"
    - "MUST offer actions: view details, start work, create new"
    - "This is READ-ONLY - no file writes"
  state_fields:
    - epic_filter
    - status_filter
    - owner_filter
    - search_query
    - priority_filter
    - story_count
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

## STEP 0: Gather Context

```bash
node .agileflow/scripts/obtain-context.js story:list
```

---

<!-- COMPACT_SUMMARY_START -->
## Compact Summary

**Command**: `/agileflow:story:list [EPIC=<EP-ID>] [STATUS=<status>] [OWNER=<id>] [SEARCH=<text>] [PRIORITY=<level>]`
**Purpose**: Display stories with filters and offer quick actions

### Flow
1. Read status.json
2. Apply filters (epic, status, owner, search, priority — AND-combined)
3. Display formatted table with active filters header and result count
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
| SEARCH | No | Full-text search on story title (case-insensitive substring match) |
| PRIORITY | No | Filter by priority level (high, medium, low) |

---

## IMMEDIATE ACTIONS

Upon invocation, execute these steps:

### Step 1: Read Status File

```bash
cat docs/09-agents/status.json
```

### Step 2: Apply Filters

If filters provided (all filters are AND-combined — all must match):
- EPIC: Show only stories in that epic
- STATUS: Show only stories with that status
- OWNER: Show only stories assigned to that owner
- SEARCH: Show only stories whose title contains the search text (case-insensitive substring match)
- PRIORITY: Show only stories with that priority level

### Step 3: Display Stories

If any filters are active, show a header line before the table:

```markdown
**Showing N of M stories** (EPIC=EP-0001, STATUS=ready)
```

Only list the filters that are actually active. Omit this header when no filters are applied.

Format output as table grouped by epic:

```markdown
## Stories

**Showing 5 of 12 stories** (STATUS=ready)

### EP-0001: Authentication System
| Story | Title | Status | Phase | Owner | Estimate |
|-------|-------|--------|-------|-------|----------|
| US-0001 | Login form | done | complete | AG-UI | 2h |
| US-0002 | Password reset | in_progress | execute | AG-API | 3h |
| US-0003 | Session management | ready | plan | AG-API | 4h |

### EP-0002: User Dashboard
| Story | Title | Status | Phase | Owner | Estimate |
|-------|-------|--------|-------|-------|----------|
| US-0004 | Dashboard layout | ready | plan | AG-UI | 2h |
| US-0005 | Activity feed | ready | plan | AG-UI | 3h |

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

# Search stories by title
/agileflow:story:list SEARCH=auth

# Filter by priority
/agileflow:story:list PRIORITY=high

# Combined filters (AND-combined)
/agileflow:story:list EPIC=EP-0001 STATUS=ready
/agileflow:story:list SEARCH=login PRIORITY=high STATUS=ready
/agileflow:story:list OWNER=AG-API SEARCH=session
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
