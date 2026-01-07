---
description: Update ADR status or content
argument-hint: NUMBER=<4-digit> [STATUS=<status>] [REASON=<text>]
---

# /agileflow:adr:update

Update an existing ADR's status or add amendments.

---

## Purpose

Allows you to:
- Change ADR status (proposed → accepted, accepted → deprecated, etc.)
- Add amendment notes explaining status changes
- Mark an ADR as superseded by a newer ADR
- Reactivate deprecated ADRs

---

<!-- COMPACT_SUMMARY_START -->
## Compact Summary

**Command**: `/agileflow:adr:update NUMBER=<4-digit> [STATUS=<status>] [REASON=<text>]`
**Purpose**: Update ADR status with optional reason/amendment

### Flow
1. Read existing ADR
2. Ask for new status if not provided
3. Require reason for status change
4. Show preview of changes
5. Update file if confirmed
6. Offer next actions

### Critical Rules
- **Require reason**: Every status change needs a reason documented
- **Show preview**: Display changes before writing
- **Link superseding ADRs**: If superseded, require link to new ADR
<!-- COMPACT_SUMMARY_END -->

---

## Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| NUMBER | Yes | ADR number to update (e.g., 0042) |
| STATUS | No | New status (proposed, accepted, deprecated, superseded) |
| REASON | No | Reason for the status change |
| SUPERSEDED_BY | No | If superseding, the new ADR number |

---

## IMMEDIATE ACTIONS

Upon invocation, execute these steps:

### Step 1: Validate and Read ADR

```bash
cat docs/03-decisions/adr-<NUMBER>-*.md
```

If file not found, show error and suggest `/agileflow:adr:list`.

### Step 2: Ask for New Status (if not provided)

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "What should the new status be for ADR-<NUMBER>?",
  "header": "Status",
  "multiSelect": false,
  "options": [
    {"label": "accepted", "description": "Decision approved and in effect"},
    {"label": "deprecated", "description": "No longer applies (but not replaced)"},
    {"label": "superseded", "description": "Replaced by a newer ADR"},
    {"label": "proposed", "description": "Back to discussion phase"}
  ]
}]</parameter>
</invoke>
```

### Step 3: Get Reason for Change

Always require a reason:

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "Why is this ADR being changed to '<STATUS>'?",
  "header": "Reason",
  "multiSelect": false,
  "options": [
    {"label": "Provide reason", "description": "Enter in 'Other' field (required)"}
  ]
}]</parameter>
</invoke>
```

### Step 4: If Superseded, Get Replacement ADR

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "Which ADR supersedes this one?",
  "header": "Replacement",
  "multiSelect": false,
  "options": [
    {"label": "ADR-0045 (latest)", "description": "Most recent ADR"},
    {"label": "ADR-0044", "description": "Previous ADR"},
    {"label": "Create new ADR", "description": "I need to create the replacement first"}
  ]
}]</parameter>
</invoke>
```

If "Create new ADR": Run `/agileflow:adr` first, then return to update this one.

### Step 5: Preview Changes

Show what will be updated:

```markdown
## ADR-0042 Update Preview

**Current Status**: accepted
**New Status**: superseded

**Changes to file:**

```diff
- status: accepted
+ status: superseded

+ ## Amendment - 2024-12-30
+
+ **Status changed**: accepted → superseded
+ **Reason**: New requirements made this approach obsolete.
+ **Superseded by**: [ADR-0045](adr-0045-new-approach.md)
```

### Step 6: Confirm Update

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "Apply this update to ADR-<NUMBER>?",
  "header": "Confirm",
  "multiSelect": false,
  "options": [
    {"label": "Yes, update ADR", "description": "Apply changes to file"},
    {"label": "No, cancel", "description": "Discard changes"}
  ]
}]</parameter>
</invoke>
```

### Step 7: Update File

If confirmed:
1. Update frontmatter status
2. Append Amendment section with:
   - Date
   - Status change (from → to)
   - Reason
   - Superseded by link (if applicable)

### Step 8: Offer Next Actions

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "ADR-<NUMBER> updated. What would you like to do next?",
  "header": "Next Steps",
  "multiSelect": false,
  "options": [
    {"label": "View updated ADR", "description": "See the changes with /agileflow:adr:view"},
    {"label": "Update another ADR", "description": "Change status of a different ADR"},
    {"label": "View all ADRs", "description": "Return to /agileflow:adr:list"},
    {"label": "Done", "description": "Exit"}
  ]
}]</parameter>
</invoke>
```

---

## Status Transitions

| From | To | Common Reasons |
|------|-----|----------------|
| proposed | accepted | Team approved, ready to implement |
| proposed | rejected | Alternative chosen, not viable |
| accepted | deprecated | No longer relevant, context changed |
| accepted | superseded | Better approach found, replaced by new ADR |
| deprecated | accepted | Reconsidered, still valid |
| superseded | accepted | Replacement didn't work out |

---

## Example Usage

```bash
# Mark ADR as accepted
/agileflow:adr:update NUMBER=0042 STATUS=accepted REASON="Team approved after review"

# Mark ADR as superseded
/agileflow:adr:update NUMBER=0042 STATUS=superseded SUPERSEDED_BY=0045 REASON="New requirements"

# Deprecate an ADR
/agileflow:adr:update NUMBER=0042 STATUS=deprecated REASON="Context no longer applies"

# Interactive (no arguments)
/agileflow:adr:update NUMBER=0042
```

---

## Rules

- **Require reason**: Every status change must have documented reason
- **Show preview**: Always display changes before writing
- **Link superseding ADRs**: If superseded, must link to replacement
- **Preserve history**: Never delete content, always append amendments
- **Update timestamps**: Set updated date in frontmatter

---

## Related Commands

- `/agileflow:adr:view` - View ADR details
- `/agileflow:adr:list` - View all ADRs
- `/agileflow:adr` - Create new ADR
