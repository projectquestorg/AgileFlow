---
description: Add timestamped note to context file
argument-hint: NOTE=<text>
compact_context:
  priority: high
  preserve_rules:
    - "ACTIVE COMMAND: /agileflow:context:note NOTE=\"text\" - Append timestamped note to docs/context.md"
    - "ALWAYS show diff BEFORE applying changes - wait for YES/NO confirmation"
    - "REQUIRED ARGUMENT: NOTE must be provided (ask user if missing)"
    - "AUTO-CREATE: Creates Notes section if missing, appends note to end"
    - "ISO TIMESTAMP: Always use ISO 8601 format for timestamps"
    - "PRESERVE: Creates docs/context.md if missing (don't error, create it)"
    - "CHRONOLOGICAL ORDER: Notes appear in order added (newest at bottom)"
  state_fields:
    - note_text
    - context_file_exists
    - notes_section_exists
    - user_confirmation
---

# /agileflow:context:note

Append a timestamped note to the context file.

---

## Purpose

Quickly add a note to `docs/context.md` under the "Notes" section. Useful for recording decisions, observations, or reminders that should persist in project context.

---

<!-- COMPACT_SUMMARY_START -->

## ⚠️ COMPACT SUMMARY - /agileflow:context:note IS ACTIVE

**CRITICAL**: You are appending a timestamped note to `docs/context.md`. Follow these rules EXACTLY.

**PURPOSE**: Quickly record decisions, observations, and reminders as timestamped notes that persist in project context.

---

### 🚨 RULE #1: REQUIRE NOTE ARGUMENT

**The NOTE argument is MANDATORY.**

**If not provided, ask user:**

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "What note would you like to add to docs/context.md?",
  "header": "Enter note text",
  "multiSelect": false,
  "options": [
    {"label": "Enter note (use 'Other' field)", "description": "Type your 1-5 line note"}
  ]
}]</parameter>
</invoke>
```

**Then extract the user's text from response and proceed.**

**Examples of good notes:**
```
"Decided to use JWT instead of sessions"
"User reported auth bug in production, investigating now"
"Sprint planning: focusing on US-0042 and US-0045 this week"
"Performance issue fixed: reduced API response time by 40%"
"Stakeholder meeting: new feature request added to backlog"
```

---

### 🚨 RULE #2: AUTO-CREATE MISSING FILES

**If docs/context.md doesn't exist, CREATE it with Notes section:**

```markdown
# Project Context

<!-- MANAGED_SECTION: placeholder -->
Run /agileflow:context:full to populate project context.
<!-- END_MANAGED -->

## Notes

[Notes will appear here]
```

**Do NOT error or skip. Create the file and add the note.**

---

### 🚨 RULE #3: FIND OR CREATE NOTES SECTION

**Workflow:**
1. Read docs/context.md
2. Look for `## Notes` section
3. If NOT found, CREATE it at the end of the file:

```markdown

## Notes
```

4. If found, position cursor after last note

**Append format (ALWAYS use this):**
```markdown
- **[ISO_TIMESTAMP]**: Note text here
```

**Example:**
```markdown
## Notes

- **[2024-12-31T10:30:00Z]**: Decided to use JWT instead of sessions
- **[2024-12-31T15:45:00Z]**: User reported auth bug in production
- **[2025-01-01T09:00:00Z]**: Sprint planning: focusing on US-0042 this week
```

---

### 🚨 RULE #4: ALWAYS DIFF-FIRST

**NEVER write directly. Always show changes first:**

1. **Read** docs/context.md (or create new)
2. **Find/Create** Notes section
3. **Generate** new note with ISO timestamp
4. **Show diff** (display exactly what changed)
5. **Confirm** (ask user: "Add this note?")
6. **Apply** (only after YES, write using Edit tool)

**Diff format:**
```diff
## Notes

- **[2024-12-31T10:30:00Z]**: Old note here
+ - **[2025-01-07T14:22:00Z]**: New note being added
```

---

### 🚨 RULE #5: ISO 8601 TIMESTAMP FORMAT

**ALWAYS use ISO 8601 format for all timestamps.**

**Format**: `YYYY-MM-DDTHH:MM:SSZ` (UTC/Zulu time)

**Examples:**
- `2024-12-31T10:30:00Z` - correct
- `2025-01-07T15:45:30Z` - correct
- `12/31/2024 3:30 PM` - WRONG (not ISO)
- `Jan 7, 2025 3:45 PM` - WRONG (not ISO)

**To get current timestamp in JavaScript:**
```javascript
new Date().toISOString()  // Returns "2025-01-07T14:22:18.123Z"
// Remove milliseconds: "2025-01-07T14:22:18Z"
```

---

### 🚨 RULE #6: CONFIRMATION BEFORE WRITING

**Always use AskUserQuestion before Edit:**

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "Add this note to docs/context.md?",
  "header": "Confirm Note Addition",
  "multiSelect": false,
  "options": [
    {"label": "Yes, add note", "description": "Append note to Notes section"},
    {"label": "No, cancel", "description": "Cancel without saving"}
  ]
}]</parameter>
</invoke>
```

**Only call Edit tool if response is YES.**

---

### KEY FILES & STATE TO REMEMBER

| File/State | Purpose | Format |
|-----------|---------|--------|
| docs/context.md | Target file | Markdown with Notes section |
| Notes section | Append location | `## Notes` header at end |
| Timestamp | Each note | ISO 8601: `YYYY-MM-DDTHH:MM:SSZ` |
| Note format | Structure | `- **[timestamp]**: note text` |
| Diff display | Review before confirm | Show change with context lines |
| User confirmation | Gate before write | YES = write, NO = cancel |

---

### WORKFLOW SEQUENCE

**This is the EXACT workflow:**

```
1. Validate NOTE argument provided
   ├─ If missing: AskUserQuestion for note text
   └─ If provided: Use provided value

2. Read docs/context.md
   ├─ If missing: Create new file with placeholder
   └─ If exists: Read entire file

3. Find or Create Notes section
   ├─ If found: Position after last note
   └─ If missing: Add at end of file

4. Generate note entry
   ├─ Get current ISO timestamp
   ├─ Format: "- **[timestamp]**: note text"
   └─ Store as pending_entry

5. Show diff to user
   ├─ Display before/after
   └─ Add context lines

6. Confirm with AskUserQuestion
   ├─ If YES: Go to step 7
   └─ If NO: Exit, don't write

7. Apply change using Edit tool
   ├─ Call Edit with old_string and new_string
   └─ Done
```

---

### ANTI-PATTERNS & CORRECT PATTERNS

❌ **DON'T**: Write note without showing diff
✅ **DO**: Show diff → confirm → write

❌ **DON'T**: Error if docs/context.md missing
✅ **DO**: Create file with placeholder, add note

❌ **DON'T**: Use non-ISO timestamp format
✅ **DO**: Use `YYYY-MM-DDTHH:MM:SSZ` format

❌ **DON'T**: Skip creating Notes section
✅ **DO**: Create `## Notes` if missing, append notes there

❌ **DON'T**: Use custom timestamp format
✅ **DO**: All notes use same ISO format (consistent ordering)

---

### REMEMBER AFTER COMPACTION

After this command completes:
- ✓ Note appended to docs/context.md (diff shown first)
- ✓ ISO 8601 timestamp added automatically
- ✓ Notes section created if missing
- ✓ Note visible in `/agileflow:context:export` (if space allows)
- ✓ Notes persist across sessions
- ✓ Use `/agileflow:context:full` to regenerate managed sections
- ✓ Use `/agileflow:context:export` to get excerpt for pasting

<!-- COMPACT_SUMMARY_END -->

---

## Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| NOTE | Yes | 1-5 line note text to append |

---

## IMMEDIATE ACTIONS

Upon invocation, execute these steps:

### Step 1: Validate Input

Verify NOTE argument is provided. If missing:

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "What note would you like to add?",
  "header": "Note text",
  "multiSelect": false,
  "options": [
    {"label": "Enter note text", "description": "Type your note in the 'Other' field"}
  ]
}]</parameter>
</invoke>
```

### Step 2: Read Context File

Read `docs/context.md`. If it doesn't exist, create it with a Notes section.

### Step 3: Find or Create Notes Section

Look for `## Notes` section. If not found, add it at the end of the file.

### Step 4: Generate Timestamped Entry

Format the note with ISO timestamp:

```markdown
- **[2024-12-31T10:30:00Z]**: [Note text here]
```

### Step 5: Show Diff

Display the change:

```diff
## Notes

+ - **[2024-12-31T10:30:00Z]**: User reported auth bug in production
```

### Step 6: Ask for Confirmation

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "Add this note to docs/context.md?",
  "header": "Confirm",
  "multiSelect": false,
  "options": [
    {"label": "Yes, add note", "description": "Append note to file"},
    {"label": "No, cancel", "description": "Cancel without saving"}
  ]
}]</parameter>
</invoke>
```

### Step 7: Apply Changes

If YES: Append the note to the Notes section using Edit tool.

---

## Example Usage

```bash
/agileflow:context:note NOTE="Decided to use JWT instead of sessions"
/agileflow:context:note NOTE="User reported auth bug in production, investigating"
/agileflow:context:note NOTE="Sprint planning: focusing on US-0042 and US-0045 this week"
```

---

## Rules

- Diff-first: Always show changes before writing
- Creates Notes section if it doesn't exist
- ISO timestamp format for all entries
- Notes appear in chronological order (newest at bottom)

---

## Related Commands

- `/agileflow:context:full` - Generate/refresh full context brief
- `/agileflow:context:export` - Export concise excerpt for pasting
- `/agileflow:research:ask` - Generate research prompt for web AI
