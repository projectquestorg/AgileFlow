---
description: View ADR details with contextual actions
argument-hint: NUMBER=<4-digit>
---

# /agileflow:adr:view

View full ADR details and take contextual actions based on ADR status.

---

## Purpose

Displays complete ADR information and offers **context-aware actions** based on the ADR's current status:
- **proposed** → Accept, reject, request changes
- **accepted** → Create implementation stories, supersede, deprecate
- **deprecated** → View history, reactivate if needed
- **superseded** → View replacement ADR, understand evolution

---

<!-- COMPACT_SUMMARY_START -->
## Compact Summary

**Command**: `/agileflow:adr:view NUMBER=<4-digit>`
**Purpose**: View ADR details with context-aware action suggestions

### Flow
1. Read ADR file from docs/03-decisions/
2. Display full ADR content
3. Offer actions based on current status
4. Execute selected action

### Critical Rules
- **Context-aware actions**: Different options based on ADR status
- **Show everything**: Context, decision, consequences, links
- **Always offer next steps**: End with relevant AskUserQuestion
<!-- COMPACT_SUMMARY_END -->

---

## Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| NUMBER | Yes | ADR number (e.g., 0042) |

---

## IMMEDIATE ACTIONS

Upon invocation, execute these steps:

### Step 1: Validate Input

If NUMBER not provided, list recent ADRs:

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "Which ADR would you like to view?",
  "header": "Select",
  "multiSelect": false,
  "options": [
    {"label": "ADR-0003: Latest ADR", "description": "accepted"},
    {"label": "ADR-0002: Previous ADR", "description": "accepted"},
    {"label": "Show all ADRs", "description": "View full ADR list"}
  ]
}]</parameter>
</invoke>
```

### Step 2: Read ADR File

```bash
cat docs/03-decisions/adr-<NUMBER>-*.md
```

If file not found, show error and suggest `/agileflow:adr:list`.

### Step 3: Display ADR Content

```markdown
## ADR-0042: Use PostgreSQL for Persistence

**Status**: accepted
**Date**: 2024-12-28
**Tags**: database, architecture

---

### Context

We need a reliable database with ACID guarantees for user data.
The application handles financial transactions requiring strong consistency.
Current SQLite implementation cannot scale to multiple servers.

---

### Decision

We will use PostgreSQL as our primary database because:
- Mature, well-tested ACID compliance
- Excellent tooling and ecosystem
- Team has existing experience
- Supports advanced features (JSONB, full-text search)

---

### Consequences

**Positive:**
- Strong data integrity guarantees
- Better performance at scale
- Rich query capabilities

**Negative:**
- Requires managed database service or self-hosting
- Team needs PostgreSQL-specific training
- Migration effort from SQLite

---

### Related

- [Research: Database Selection](../10-research/20241225-database-selection.md)
- [US-0050: Database migration story](../06-stories/EP-0005/US-0050.md)
- Supersedes: ADR-0010 (Use SQLite)
```

### Step 4: Offer Context-Aware Actions

**Based on ADR status, show different options:**

#### If STATUS = proposed

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "This ADR is proposed. What would you like to do?",
  "header": "Actions",
  "multiSelect": false,
  "options": [
    {"label": "Accept this ADR", "description": "Mark as accepted and in effect"},
    {"label": "Request changes", "description": "Add comments or modify the proposal"},
    {"label": "Reject this ADR", "description": "Mark as rejected with reason"},
    {"label": "Back to ADR list", "description": "Return to /agileflow:adr:list"}
  ]
}]</parameter>
</invoke>
```

**If "Accept"**:
- Run `/agileflow:adr:update NUMBER=<NUMBER> STATUS=accepted`
- Ask: "Create implementation stories for this decision?"

#### If STATUS = accepted

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "This ADR is accepted and in effect. What would you like to do?",
  "header": "Actions",
  "multiSelect": false,
  "options": [
    {"label": "Create implementation stories (Recommended)", "description": "Turn this decision into actionable work"},
    {"label": "Supersede with new ADR", "description": "Replace with updated decision"},
    {"label": "Deprecate this ADR", "description": "Mark as no longer applicable"},
    {"label": "View related research", "description": "See research that led to this decision"}
  ]
}]</parameter>
</invoke>
```

**If "Create implementation stories"**:
1. Analyze the ADR's consequences and decision
2. Ask: "This decision suggests the following work:"
3. Present potential stories/epic
4. If confirmed, run `/agileflow:epic` or `/agileflow:story`

**If "Supersede"**:
- Ask for reason/context for new decision
- Create new ADR referencing this one
- Update this ADR status to "superseded"
- Add link to new ADR

#### If STATUS = deprecated

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "This ADR is deprecated. What would you like to do?",
  "header": "Actions",
  "multiSelect": false,
  "options": [
    {"label": "View deprecation history", "description": "See why this was deprecated"},
    {"label": "Reactivate this ADR", "description": "Mark as accepted again"},
    {"label": "View replacement ADR", "description": "See what superseded this"},
    {"label": "Back to ADR list", "description": "Return to /agileflow:adr:list"}
  ]
}]</parameter>
</invoke>
```

#### If STATUS = superseded

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "This ADR was superseded. What would you like to do?",
  "header": "Actions",
  "multiSelect": false,
  "options": [
    {"label": "View replacement ADR", "description": "See the ADR that replaced this one"},
    {"label": "View decision evolution", "description": "See how this decision evolved over time"},
    {"label": "Back to ADR list", "description": "Return to /agileflow:adr:list"}
  ]
}]</parameter>
</invoke>
```

---

## Example Usage

```bash
# View specific ADR
/agileflow:adr:view NUMBER=0042

# Will prompt for selection if no number
/agileflow:adr:view
```

---

## Rules

- **Context-aware**: Actions must match current ADR status
- **Show everything**: Context, decision, consequences, links
- **Always offer next steps**: End with relevant action options
- **Connect to related commands**: Link to stories, research, other ADRs

---

## Related Commands

- `/agileflow:adr:list` - View all ADRs
- `/agileflow:adr` - Create new ADR
- `/agileflow:adr:update` - Update ADR status
- `/agileflow:story` - Create implementation story
- `/agileflow:epic` - Create implementation epic
- `/agileflow:research:view` - View related research
