---
description: List all Architecture Decision Records
argument-hint: [STATUS=<status>]
---

# /agileflow:adr:list

Display all Architecture Decision Records with status and quick actions.

---

## Purpose

Shows all ADRs from `docs/03-decisions/` with:
- Status (proposed, accepted, deprecated, superseded)
- Date created
- Summary
- Quick action options

**This is a read-only command** - no files are written.

---

<!-- COMPACT_SUMMARY_START -->
## Compact Summary

**Command**: `/agileflow:adr:list [STATUS=<status>]`
**Purpose**: Display ADRs with filters and offer quick actions

### Flow
1. Read docs/03-decisions/ directory
2. Parse ADR frontmatter for status/date
3. Display formatted table
4. Offer actions: view details, create new, update status

### Critical Rules
- **Read-only**: No file writes
- **Always offer actions**: End with AskUserQuestion for next steps
- **Show status clearly**: Color-code by status
<!-- COMPACT_SUMMARY_END -->

---

## Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| STATUS | No | Filter by status (proposed, accepted, deprecated, superseded) |

---

## IMMEDIATE ACTIONS

Upon invocation, execute these steps:

### Step 1: Read ADR Directory

```bash
ls docs/03-decisions/adr-*.md
```

### Step 2: Parse Each ADR

For each ADR file, extract from frontmatter:
- number
- title
- date
- status
- tags (if present)

### Step 3: Apply Filters

If STATUS provided, show only ADRs with that status.

### Step 4: Display ADRs

Format output as table sorted by number:

```markdown
## Architecture Decision Records

| # | Title | Status | Date | Tags |
|---|-------|--------|------|------|
| 0003 | Use PostgreSQL for persistence | accepted | 2024-12-28 | database, architecture |
| 0002 | Session management approach | accepted | 2024-12-25 | auth, sessions |
| 0001 | AgileFlow agent system | accepted | 2024-12-20 | agents, architecture |

---
**Summary**: 3 ADRs (3 accepted, 0 proposed, 0 deprecated)

Statuses:
- **proposed**: Under discussion, not yet decided
- **accepted**: Decision made and in effect
- **deprecated**: No longer applies (superseded or obsolete)
- **superseded**: Replaced by a newer ADR
```

### Step 5: Offer Actions

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "What would you like to do?",
  "header": "Actions",
  "multiSelect": false,
  "options": [
    {"label": "View ADR details", "description": "Read full ADR with context and consequences"},
    {"label": "Create new ADR", "description": "Document a new architecture decision"},
    {"label": "Update ADR status", "description": "Change status of existing ADR"},
    {"label": "Done", "description": "Exit"}
  ]
}]</parameter>
</invoke>
```

**If "View ADR details"**:
```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "Which ADR would you like to view?",
  "header": "Select",
  "multiSelect": false,
  "options": [
    {"label": "ADR-0003: Use PostgreSQL for persistence", "description": "accepted - 2024-12-28"},
    {"label": "ADR-0002: Session management approach", "description": "accepted - 2024-12-25"},
    {"label": "ADR-0001: AgileFlow agent system", "description": "accepted - 2024-12-20"}
  ]
}]</parameter>
</invoke>
```

Then invoke: `/agileflow:adr:view NUMBER=<selected>`

**If "Create new ADR"**:
Invoke: `/agileflow:adr`

**If "Update ADR status"**:
Invoke: `/agileflow:adr:update`

---

## Example Usage

```bash
# List all ADRs
/agileflow:adr:list

# List only proposed ADRs
/agileflow:adr:list STATUS=proposed

# List only accepted ADRs
/agileflow:adr:list STATUS=accepted
```

---

## Rules

- **Read-only**: No file writes
- **Parse frontmatter**: Extract status, date, tags from YAML
- **Show summary**: Include counts by status at the bottom
- **Always offer actions**: End with next step options

---

## Related Commands

- `/agileflow:adr:view` - View full ADR details
- `/agileflow:adr` - Create new ADR
- `/agileflow:adr:update` - Update ADR status
- `/agileflow:research:analyze` - Analyze research that may lead to ADR
