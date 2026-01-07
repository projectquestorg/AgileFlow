---
description: Show research notes index
argument-hint: (no arguments)
compact_context:
  priority: medium
  preserve_rules:
    - "ACTIVE COMMAND: /agileflow:research:list - List all research notes (read-only)"
    - "NO FILE WRITES - This is read-only browsing"
    - "Read docs/10-research/README.md for index table"
    - "If README doesn't exist, list files from directory"
    - "After showing list, offer quick action links"
    - "Suggest: view a note OR ask new research OR import new research"
  state_fields:
    - research_count
    - most_recent_topic
---

# /agileflow:research:list

Display the index of all research notes in your project.

---

## Purpose

Shows all research notes stored in `docs/10-research/` with:
- Date
- Topic
- File path
- One-line summary

**This is a read-only command** - no files are written.

---

<!-- COMPACT_SUMMARY_START -->

## ⚠️ COMPACT SUMMARY - /agileflow:research:list IS ACTIVE

**CRITICAL**: You are running `/agileflow:research:list`. This is a read-only research index viewer.

**ROLE**: Display research index and offer navigation options.

---

### 🚨 RULE #1: NO FILE WRITES (READ-ONLY)

**This command ONLY reads and displays. NEVER write, edit, or modify.**

```
❌ WRONG: Update timestamps / Add entries / Reorganize
✅ RIGHT: Read index and display to user
```

---

### 🚨 RULE #2: READ INDEX FROM docs/10-research/README.md

**Primary source: `docs/10-research/README.md` should contain a table:**

```markdown
## Research Notes

| Date | Topic | File | Summary |
|------|-------|------|---------|
| 2026-01-07 | OAuth Integration | 20260107-oauth.md | Setup Google OAuth |
| 2026-01-06 | Performance Tips | 20260106-perf.md | Caching strategies |
```

**If README doesn't exist:** List files from the directory directly.

---

### 🚨 RULE #3: HANDLE MISSING RESEARCH GRACEFULLY

**If no research exists, show helpful message:**

```
No research notes found.

Quick start:
- /agileflow:research:ask TOPIC="your topic" - Generate research prompt for ChatGPT/Claude
- /agileflow:research:import TOPIC="..." - Import external content
```

---

### 🚨 RULE #4: SIMPLE, CLEAN OUTPUT

**Just show the list. No complex formatting, no long explanations.**

```
Research Notes
==============

| Date       | Topic                  | File                        |
|------------|------------------------|-----------------------------|
| 2026-01-07 | OAuth Integration       | 20260107-oauth.md           |
| 2026-01-06 | Performance Tips        | 20260106-perf.md            |
| 2026-01-05 | Database Migrations     | 20260105-migrations.md      |

Total: 3 research notes
```

---

### 🚨 RULE #5: OFFER QUICK ACTION LINKS

**After showing list, provide suggested actions:**

```
Quick actions:
- /agileflow:research:view FILE=<filename> - Read a specific note
- /agileflow:research:analyze FILE=<filename> - Analyze for implementation
- /agileflow:research:ask TOPIC="new topic" - Create new research prompt
- /agileflow:research:import TOPIC="..." - Import external content
```

Or use AskUserQuestion:

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "What would you like to do?",
  "header": "Actions",
  "multiSelect": false,
  "options": [
    {"label": "View a research note", "description": "Read specific research"},
    {"label": "Analyze research for implementation", "description": "Enter plan mode"},
    {"label": "Create new research prompt", "description": "/agileflow:research:ask"},
    {"label": "Import external content", "description": "/agileflow:research:import"},
    {"label": "Done", "description": "Exit"}
  ]
}]</parameter>
</invoke>
```

---

### ANTI-PATTERNS (DON'T DO THESE)

❌ Modify the index
❌ Add or remove entries
❌ Show only recent research, hide older entries
❌ Truncate topic names or summaries
❌ Fail silently if research directory doesn't exist
❌ End without offering next actions

### DO THESE INSTEAD

✅ Read-only: no modifications
✅ Show ALL research notes in index
✅ Display complete file paths
✅ Graceful handling if no research exists
✅ Always offer suggested actions
✅ Link to related commands (view, analyze, ask, import)

---

### WORKFLOW

**Step 1: Read Index**
1. Try to read `docs/10-research/README.md`
2. If missing, list files from `docs/10-research/` directory
3. If directory doesn't exist, show helpful message

**Step 2: Display Index**
4. Show table with: Date, Topic, File, Summary
5. Count total research notes
6. Show list to user

**Step 3: Offer Actions**
7. Suggest next steps via quick links or AskUserQuestion
8. Allow user to view, analyze, or create new research

---

### KEY FILES

| File | Purpose |
|------|---------|
| `docs/10-research/` | Directory containing all research notes |
| `docs/10-research/README.md` | Index of research with metadata |

---

### REMEMBER AFTER COMPACTION

- `/agileflow:research:list` IS ACTIVE - you're listing research notes
- Read-only: no file modifications
- Read index from README.md or list directory
- Display ALL research notes, don't truncate
- Show helpful message if no research exists
- Always offer next action options

<!-- COMPACT_SUMMARY_END -->

---

## IMMEDIATE ACTIONS

Upon invocation, execute these steps:

### Step 1: Check Research Directory

Verify `docs/10-research/` exists. If not:
```
No research notes found. Use /agileflow:research:ask to generate a research prompt.
```

### Step 2: Read Index File

Read `docs/10-research/README.md` for the index table.

If README.md doesn't exist but research files do, list them by reading the directory.

### Step 3: Display Index

Format output:

```
## Research Notes

| Date | Topic | File |
|------|-------|------|
| 2024-12-31 | OAuth 2.0 Setup | 20241231-oauth-setup.md |
| 2024-12-30 | Session Tracking | 20241230-session-tracking.md |
| 2024-12-28 | Mermaid Diagrams | 20241228-mermaid-diagrams.md |

Total: 3 research notes

Use /agileflow:research:view FILE=<filename> to read a specific note.
```

### Step 4: Suggest Actions

If notes exist:
```
Quick actions:
- /agileflow:research:view FILE=<filename> - Read a note
- /agileflow:research:analyze FILE=<filename> - Analyze for implementation
- /agileflow:research:ask TOPIC="new topic" - Create new research prompt
- /agileflow:research:import - Import external content
```

---

## Rules

- **Read-only**: No file writes
- **Handle missing directory**: Graceful message if no research exists
- **Simple output**: Just show the list, no complex formatting

---

## Related Commands

- `/agileflow:research:analyze` - Analyze research for implementation in your project
- `/agileflow:research:ask` - Generate research prompt for web AI
- `/agileflow:research:import` - Import research results
- `/agileflow:research:view` - Read specific research note
