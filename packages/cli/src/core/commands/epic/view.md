---
description: View epic details with stories and contextual actions
argument-hint: EPIC=<EP-ID>
---

# /agileflow:epic:view

View full epic details including all stories and contextual actions.

---

## Purpose

Displays complete epic information and offers **context-aware actions** based on epic state:
- **active, low progress** → Add stories, start work
- **active, high progress** → Complete remaining stories, close epic
- **complete** → View summary, reopen if needed
- **on-hold** → Resume, view blockers

---

<!-- COMPACT_SUMMARY_START -->
## Compact Summary

**Command**: `/agileflow:epic:view EPIC=<EP-ID>`
**Purpose**: View epic with all stories and context-aware actions

### Flow
1. Read epic from status.json
2. Load all stories for this epic
3. Display epic overview and story breakdown
4. Offer actions based on epic progress
5. Execute selected action

### Critical Rules
- **Show all stories**: Group by status (in_progress, ready, done)
- **Context-aware actions**: Different options based on progress
- **Always offer next steps**: End with relevant AskUserQuestion
<!-- COMPACT_SUMMARY_END -->

---

## Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| EPIC | Yes | Epic ID (e.g., EP-0001) |

---

## IMMEDIATE ACTIONS

Upon invocation, execute these steps:

### Step 1: Validate Input

If EPIC not provided, list recent epics:

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "Which epic would you like to view?",
  "header": "Select",
  "multiSelect": false,
  "options": [
    {"label": "EP-0003: User Dashboard", "description": "active - 40% complete"},
    {"label": "EP-0002: Authentication", "description": "active - 67% complete"},
    {"label": "Show all epics", "description": "View full epic list"}
  ]
}]</parameter>
</invoke>
```

### Step 2: Read Epic Data

Read from status.json:
- Epic metadata (title, owner, status, goal)
- All stories belonging to this epic

### Step 3: Display Epic Overview

```markdown
## EP-0002: Authentication System

**Status**: active
**Owner**: AG-API
**Goal**: Implement secure user authentication with OAuth and sessions
**Created**: 2024-12-20
**Updated**: 2024-12-28

**Progress**: 4/6 stories complete (67%)

███████████████░░░░░░░ 67%

---

### Stories by Status

#### In Progress (1)
| Story | Title | Owner | Estimate |
|-------|-------|-------|----------|
| US-0012 | Session management | AG-API | 4h |

#### Ready (1)
| Story | Title | Owner | Estimate |
|-------|-------|-------|----------|
| US-0013 | Remember me feature | AG-UI | 2h |

#### Done (4)
| Story | Title | Owner | Completed |
|-------|-------|-------|-----------|
| US-0011 | OAuth Google login | AG-API | 2024-12-27 |
| US-0010 | Login form UI | AG-UI | 2024-12-26 |
| US-0009 | User model | AG-API | 2024-12-25 |
| US-0008 | Auth API setup | AG-API | 2024-12-24 |

---

### Related

- **Research**: [OAuth Best Practices](../10-research/20241220-oauth.md)
- **ADR**: [ADR-0002: Use NextAuth](../03-decisions/adr-0002.md)
```

### Step 4: Offer Context-Aware Actions

**Based on epic progress, show different options:**

#### If Progress < 50%

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "This epic is 40% complete. What would you like to do?",
  "header": "Actions",
  "multiSelect": false,
  "options": [
    {"label": "Add more stories", "description": "Epic may need more work items"},
    {"label": "Start work on a ready story", "description": "Pick a story to begin"},
    {"label": "Plan sprint for this epic", "description": "Schedule stories with /agileflow:sprint"},
    {"label": "Back to epic list", "description": "Return to /agileflow:epic:list"}
  ]
}]</parameter>
</invoke>
```

#### If Progress >= 50% but < 100%

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "This epic is 67% complete. What would you like to do?",
  "header": "Actions",
  "multiSelect": false,
  "options": [
    {"label": "Work on remaining stories (Recommended)", "description": "Continue toward completion"},
    {"label": "View story details", "description": "Check a specific story"},
    {"label": "Add more stories", "description": "Epic scope may have grown"},
    {"label": "Mark epic as complete", "description": "If remaining work is deferred"}
  ]
}]</parameter>
</invoke>
```

**If "Work on remaining stories"**:
- Show ready stories
- Let user pick one
- Run `/agileflow:story:view STORY=<selected>`

#### If Progress = 100%

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "This epic is 100% complete! What would you like to do?",
  "header": "Actions",
  "multiSelect": false,
  "options": [
    {"label": "Close epic (Recommended)", "description": "Mark as complete in status.json"},
    {"label": "View completion summary", "description": "See what was delivered"},
    {"label": "Add follow-up stories", "description": "Epic needs more work after all"},
    {"label": "Back to epic list", "description": "Return to /agileflow:epic:list"}
  ]
}]</parameter>
</invoke>
```

**If "Close epic"**:
- Update epic status to "complete" in status.json
- Add completion timestamp
- Show summary of delivered stories

#### If Status = on-hold

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "This epic is on hold. What would you like to do?",
  "header": "Actions",
  "multiSelect": false,
  "options": [
    {"label": "Resume epic", "description": "Change status back to active"},
    {"label": "View why it's on hold", "description": "Check blockers or notes"},
    {"label": "Close epic", "description": "No longer needed"},
    {"label": "Back to epic list", "description": "Return to /agileflow:epic:list"}
  ]
}]</parameter>
</invoke>
```

---

## Example Usage

```bash
# View specific epic
/agileflow:epic:view EPIC=EP-0002

# Will prompt for selection if no ID
/agileflow:epic:view
```

---

## Rules

- **Show all stories**: Group by status for clarity
- **Progress visualization**: Show percentage and progress bar
- **Context-aware**: Actions match epic state
- **Connect to related**: Show linked research, ADRs
- **Always offer next steps**: End with relevant action options

---

## Related Commands

- `/agileflow:epic:list` - View all epics
- `/agileflow:epic` - Create new epic
- `/agileflow:story` - Add story to epic
- `/agileflow:story:view` - View story details
- `/agileflow:sprint` - Plan sprint
- `/agileflow:board` - Kanban view
