---
description: Create an Architecture Decision Record
argument-hint: NUMBER=<4-digit> TITLE=<text> CONTEXT=<text> DECISION=<text> CONSEQUENCES=<text> [LINKS=<text>]
compact_context:
  priority: medium
  preserve_rules:
    - "NUMBER is REQUIRED - must be 4-digit sequentially (0001, 0002, etc.)"
    - "TITLE, CONTEXT, DECISION, CONSEQUENCES all REQUIRED"
    - "Create ADR file in docs/03-decisions/adr-<NUMBER>-<slug>.md"
    - "Always show preview FIRST, wait for YES/NO confirmation BEFORE writing"
    - "Document BOTH positive and negative consequences"
    - "Keep ADRs concise: 1-2 pages max"
    - "Link related ADRs and stories in Related section"
    - "Use template from @packages/cli/src/core/templates/adr-template.md"
  state_fields:
    - adr_number
    - adr_title
    - context
    - decision
    - consequences
---

# adr

Create a new Architecture Decision Record.

## STEP 0: Gather Context

```bash
node .agileflow/scripts/obtain-context.js adr
```

<!-- COMPACT_SUMMARY_START -->

## ⚠️ COMPACT SUMMARY - /agileflow:adr IS ACTIVE

**CRITICAL**: You are creating Architecture Decision Records (ADRs) that document architectural choices made in the project.

**ROLE**: ADR Writer

---

### 🚨 RULE #1: ALL INPUTS REQUIRED

Always require these inputs. Ask if missing:

| Input | Required? | Example |
|-------|-----------|---------|
| NUMBER | YES | `NUMBER=0042` (4-digit, sequential) |
| TITLE | YES | `TITLE="Use PostgreSQL for persistence"` |
| CONTEXT | YES | `CONTEXT="Need reliable ACID database..."` |
| DECISION | YES | `DECISION="PostgreSQL chosen over MongoDB"` |
| CONSEQUENCES | YES | `CONSEQUENCES="Better integrity, learning curve"` |
| LINKS | NO | `LINKS="ADR-0041, US-0055"` |

❌ WRONG: Create ADR without CONTEXT or DECISION
✅ RIGHT: Ask for missing inputs, then proceed

---

### 🚨 RULE #2: SEQUENTIAL NUMBERING

ADRs MUST be numbered sequentially (0001, 0002, 0003, etc.):

1. Check existing ADRs in docs/03-decisions/
2. Find highest number (e.g., 0041)
3. Next ADR should be 0042
4. Never skip numbers or reuse numbers

❌ WRONG: Create ADR-0100 when only 0042 exists
✅ RIGHT: Find next sequential number and use it

---

### 🚨 RULE #3: ADR FILE STRUCTURE

Create file at: `docs/03-decisions/adr-<NUMBER>-<slug>.md`

Example: `docs/03-decisions/adr-0042-postgresql.md`

Use template from `@packages/cli/src/core/templates/adr-template.md`:
```markdown
---
number: 0042
title: Use PostgreSQL for persistence
date: 2025-12-22
status: accepted
tags: [database, architecture]
---

# ADR-0042: Use PostgreSQL for persistence

## Context
[Why this decision - explain the problem/constraints]

## Decision
[What was chosen and why - be specific]

## Consequences
### Positive
- Better data integrity
- ACID guarantees

### Negative
- Team needs training
- Operational complexity

## Related
- [ADR-0041](adr-0041-db-selection.md)
- [US-0055](../06-stories/US-0055.md)
```

---

### 🚨 RULE #4: CONTEXT BEFORE DECISION

**ALWAYS explain the "why" in Context section:**

❌ WRONG: "We use PostgreSQL because it's good"
✅ RIGHT: "Need ACID guarantees for financial transactions. Considered MongoDB (eventual consistency risk), Redis (in-memory limits). PostgreSQL best fit for requirements."

Good context helps future readers understand the trade-offs.

---

### 🚨 RULE #5: DOCUMENT BOTH POSITIVE AND NEGATIVE

**ALWAYS document consequences honestly:**

| Type | Examples |
|------|----------|
| **Positive** | Performance, maintenance, guarantees |
| **Negative** | Learning curve, cost, migration effort |

Both are important - readers need full trade-off picture.

---

### 🚨 RULE #6: DIFF-FIRST, YES/NO PATTERN

**ALWAYS follow this pattern:**

1. Generate ADR content (don't write yet)
2. Show preview/diff to user
3. Ask: "Create this ADR? (YES/NO)"
4. Only write file if user says YES

---

### ANTI-PATTERNS (DON'T DO THESE)

❌ Create ADR with only DECISION (no CONTEXT)
❌ Reuse or skip ADR numbers
❌ Write vague consequences ("pros and cons")
❌ Create multi-page ADRs (keep concise)
❌ Write ADR without showing preview
❌ Document only positive consequences

### DO THESE INSTEAD

✅ Explain CONTEXT (the "why") thoroughly
✅ Use sequential numbering
✅ Document positive AND negative consequences
✅ Keep to 1-2 pages max
✅ Show preview before creating
✅ Honest about trade-offs

---

### WORKFLOW

1. **Input Validation**: Ensure all inputs (ask if missing)
2. **Check Number**: Verify next sequential ADR
3. **Generate ADR**: Create from template
4. **Show Preview**: Display to user
5. **Confirm**: Ask "Create this ADR? (YES/NO)"
6. **Write**: Only if approved
7. **Done**: Show success message

---

### KEY FILES TO REMEMBER

| File | Purpose |
|------|---------|
| `docs/03-decisions/adr-<NUMBER>-<slug>.md` | ADR file location |
| `@packages/cli/src/core/templates/adr-template.md` | ADR template |

---

### REMEMBER AFTER COMPACTION

- `/agileflow:adr` IS ACTIVE - creating ADRs
- All inputs required (NUMBER, TITLE, CONTEXT, DECISION, CONSEQUENCES)
- NUMBER must be sequential 4-digit
- Always explain CONTEXT (the "why")
- Document positive AND negative consequences
- Keep 1-2 pages max
- Show preview, wait for YES/NO before writing

<!-- COMPACT_SUMMARY_END -->

## Prompt

ROLE: ADR Writer

TODO LIST TRACKING
**CRITICAL**: Immediately create a todo list using TodoWrite tool to track ADR creation:
```
1. Parse inputs (NUMBER, TITLE, CONTEXT, DECISION, CONSEQUENCES, LINKS)
2. Create docs/03-decisions/adr-<NUMBER>-<slug>.md from template
3. Show preview and wait for YES/NO confirmation
```

Mark each step complete as you finish it. This ensures nothing is forgotten.

INPUTS
NUMBER=<4-digit>  TITLE=<Decision Title>
CONTEXT=<short context>  DECISION=<choice>
CONSEQUENCES=<trade-offs>  LINKS=<optional bullets>

TEMPLATE
Use the following ADR template structure:
@packages/cli/src/core/templates/adr-template.md

ACTIONS
1) Parse inputs (NUMBER, TITLE, CONTEXT, DECISION, CONSEQUENCES, LINKS)
2) Create docs/03-decisions/adr-<NUMBER>-<slug>.md from template
3) Show diff and wait for YES/NO confirmation
4) Write file if approved

---

## POST-CREATION ACTIONS

After successfully creating the ADR, offer next steps:

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "ADR-<NUMBER> created! What would you like to do next?",
  "header": "Next Steps",
  "multiSelect": false,
  "options": [
    {"label": "Create implementation stories (Recommended)", "description": "Turn this decision into actionable work"},
    {"label": "Link to existing research", "description": "Connect to research that led to this decision"},
    {"label": "Create another ADR", "description": "Document another architecture decision"},
    {"label": "View all ADRs", "description": "See full list with /agileflow:adr:list"}
  ]
}]</parameter>
</invoke>
```

**If "Create implementation stories"**:
1. Analyze the ADR's decision and consequences
2. Suggest potential stories/epic based on the decision
3. If confirmed, run `/agileflow:epic` or `/agileflow:story`

**If "Link to existing research"**:
1. Run `/agileflow:research:list` to show available research
2. Select research note
3. Add reference to ADR: `**Research**: See [Research Title](../10-research/...)`

**If "Create another ADR"**:
- Re-run `/agileflow:adr` with next number

**If "View all ADRs"**:
- Run `/agileflow:adr:list`

---

## Related Commands

- `/agileflow:adr:list` - View all ADRs with status
- `/agileflow:adr:view` - View ADR details with contextual actions
- `/agileflow:adr:update` - Update ADR status
- `/agileflow:research:analyze` - Analyze research that may lead to ADR
- `/agileflow:epic` - Create implementation epic
- `/agileflow:story` - Create implementation story
