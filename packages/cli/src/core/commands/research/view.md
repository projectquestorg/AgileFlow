---
description: Read a specific research note
argument-hint: FILE=<filename>
compact_context:
  priority: medium
  preserve_rules:
    - "ACTIVE COMMAND: /agileflow:research:view - Display research note contents (read-only)"
    - "NO FILE WRITES - This is read-only, no modifications"
    - "If FILE not provided, list available research and ask user to select"
    - "Display FULL content, never truncate"
    - "After viewing, offer actions: Analyze for implementation OR View another OR Done"
    - "If user selects 'Analyze', invoke /agileflow:research:analyze with the FILE"
  state_fields:
    - selected_research_file
    - file_displayed
---

# /agileflow:research:view

Read and display a specific research note.

---

## Purpose

Displays the content of a research note from `docs/10-research/`. Useful for:
- Reviewing previous research before implementing
- Finding code snippets from past research
- Checking action items from research

**This is a read-only command** - no files are written.

---

<!-- COMPACT_SUMMARY_START -->

## ⚠️ COMPACT SUMMARY - /agileflow:research:view IS ACTIVE

**CRITICAL**: You are running `/agileflow:research:view`. This is a read-only research viewer.

**ROLE**: Display research note contents and offer next actions.

---

### 🚨 RULE #1: NO FILE WRITES (READ-ONLY)

**This command ONLY reads files. NEVER write, edit, or modify anything.**

```
❌ WRONG: Modify the research file / Update timestamps / Add sections
✅ RIGHT: Read and display the file contents, nothing else
```

---

### 🚨 RULE #2: HANDLE FILE SELECTION

**If FILE argument not provided, prompt user to select:**

1. List available research files from `docs/10-research/`
2. Show most recent files first
3. Use AskUserQuestion to let user select
4. Include "Show full list" option if many files
5. Then proceed to display

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "Which research would you like to view?",
  "header": "Select",
  "multiSelect": false,
  "options": [
    {"label": "20260106-oauth-setup.md", "description": "OAuth 2.0 Setup"},
    {"label": "20260105-next-patterns.md", "description": "Next.js Best Practices"},
    {"label": "Show full list", "description": "See all research notes"}
  ]
}]</parameter>
</invoke>
```

---

### 🚨 RULE #3: DISPLAY FULL CONTENT

**Always display the ENTIRE research note. Never truncate or summarize.**

```
❌ WRONG: "The research discusses OAuth implementation..."
✅ RIGHT: [Display full file contents exactly as written]
```

---

### 🚨 RULE #4: HANDLE MISSING FILES GRACEFULLY

**If FILE doesn't exist, show helpful error:**

```
Research note not found: [FILENAME]

Use /agileflow:research:list to see all available research notes.
```

---

### 🚨 RULE #5: OFFER ACTIONS AFTER VIEWING

**After displaying, ALWAYS ask what user wants to do next:**

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "What would you like to do with this research?",
  "header": "Actions",
  "multiSelect": false,
  "options": [
    {"label": "Analyze for implementation (Recommended)", "description": "Enter plan mode to understand how to implement this"},
    {"label": "View another research note", "description": "Select a different note"},
    {"label": "Done", "description": "Exit"}
  ]
}]</parameter>
</invoke>
```

**If "Analyze selected"**: Invoke `/agileflow:research:analyze FILE=[current file]`
**If "View another"**: List files again and repeat
**If "Done"**: Exit

---

### ANTI-PATTERNS (DON'T DO THESE)

❌ Modify or edit the research file
❌ Truncate or summarize content instead of showing full file
❌ Add timestamps or metadata to the file
❌ Fail silently if file doesn't exist
❌ End without offering next actions
❌ Assume user knows what to do after viewing

### DO THESE INSTEAD

✅ Read only, never modify
✅ Display complete file contents
✅ Show helpful error for missing files
✅ Always offer action options after viewing
✅ Link to /agileflow:research:analyze for implementation
✅ Link to /agileflow:research:list for browsing all notes

---

### WORKFLOW

**Phase 1: Get File Selection**
1. Check if FILE argument provided
2. If not, list files and ask user to select
3. Validate file exists

**Phase 2: Read & Display**
4. Read the entire file from docs/10-research/
5. Display full content to user

**Phase 3: Offer Actions**
6. Ask what user wants to do next
7. Route to appropriate command:
   - Analyze → /agileflow:research:analyze
   - View another → Step 1 (select again)
   - Done → Exit

---

### KEY FILES

| File | Purpose |
|------|---------|
| `docs/10-research/` | Directory containing all research notes |
| `docs/10-research/README.md` | Index of research notes (if available) |

---

### REMEMBER AFTER COMPACTION

- `/agileflow:research:view` IS ACTIVE - you're viewing a research note
- Read-only: no file modifications whatsoever
- If FILE not provided, list files and ask user to select
- Display FULL content, never truncate
- Always offer next actions (Analyze, View another, Done)

<!-- COMPACT_SUMMARY_END -->

---

## Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| FILE | Yes | Filename of the research note (e.g., "20241231-oauth-setup.md") |

---

## IMMEDIATE ACTIONS

Upon invocation, execute these steps:

### Step 1: Validate Input

If FILE not provided, show available files:

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "Which research note would you like to view?",
  "header": "Select file",
  "multiSelect": false,
  "options": [
    {"label": "20241231-oauth-setup.md", "description": "OAuth 2.0 Setup"},
    {"label": "20241230-session-tracking.md", "description": "Session Tracking"},
    {"label": "List all notes", "description": "Show full research index"}
  ]
}]</parameter>
</invoke>
```

### Step 2: Read File

Read `docs/10-research/[FILE]`.

If file doesn't exist:
```
Research note not found: [FILE]

Use /agileflow:research:list to see available notes.
```

### Step 3: Display Content

Output the full content of the research note.

### Step 4: Suggest Actions

After displaying:

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "What would you like to do with this research?",
  "header": "Actions",
  "multiSelect": false,
  "options": [
    {"label": "Analyze for implementation", "description": "Enter plan mode and see how to implement this in your project"},
    {"label": "View another research note", "description": "Switch to a different note"},
    {"label": "Done", "description": "Exit"}
  ]
}]</parameter>
</invoke>
```

If "Analyze for implementation" selected, invoke:
```
/agileflow:research:analyze FILE=[current file]
```

---

## Example Usage

```bash
/agileflow:research:view FILE=20241231-oauth-setup.md
/agileflow:research:view FILE=20241228-mermaid-diagrams.md
```

---

## Rules

- **Read-only**: No file writes
- **Full content**: Display entire file, don't truncate
- **Handle missing files**: Graceful error message

---

## Related Commands

- `/agileflow:research:analyze` - Analyze research for implementation in your project
- `/agileflow:research:ask` - Generate research prompt for web AI
- `/agileflow:research:import` - Import research results
- `/agileflow:research:list` - Show research notes index
