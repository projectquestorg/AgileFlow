---
description: Generate/refresh full context brief for web AI tools
argument-hint: (no arguments)
compact_context:
  priority: high
  preserve_rules:
    - "ACTIVE COMMAND: /agileflow:context:full - Generates docs/context.md for external AI tools"
    - "ALWAYS create TodoWrite list for multi-step workflow tracking"
    - "ALWAYS show diff BEFORE ANY file writes - wait for YES/NO confirmation"
    - "PRESERVE user-written content - only update sections between MANAGED_SECTION markers"
    - "REQUIRED SOURCES: status.json, bus/log.jsonl, epics, stories, ADRs, practices, architecture, CI, CHANGELOG"
    - "MANAGED SECTIONS: overview, features, tech, decisions, progress, next"
    - "DIFF-FIRST PATTERN: Read → Gather → Generate → Show diff → Confirm → Apply"
  state_fields:
    - context_sources
    - managed_sections
    - user_content_preserved
    - user_confirmation
---

# /agileflow:context:full

Generate or refresh the comprehensive context brief for web AI tools.

---

## Purpose

Creates `docs/context.md` with managed sections containing:
- What we're building and current focus
- Feature map and tech/tooling summary
- Key decisions (ADRs) and architecture snapshot
- Testing & CI status
- Recent progress (last 10 bus messages)
- Risks and next steps

This file is designed to be pasted into ChatGPT, Perplexity, Gemini, or Claude web to give external AI tools full project context.

---

<!-- COMPACT_SUMMARY_START -->

## ⚠️ COMPACT SUMMARY - /agileflow:context:full IS ACTIVE

**CRITICAL**: You are generating `docs/context.md` for external AI tools. Follow these rules EXACTLY.

**PURPOSE**: Create comprehensive context brief with managed sections that external AI tools (ChatGPT, Claude web, Perplexity) can paste for full project understanding.

---

### 🚨 RULE #1: ALWAYS START WITH TodoWrite LIST

**Before ANY gathering, create TodoWrite to track workflow:**

```xml
<invoke name="TodoWrite">
<parameter name="todos">[
  {"content": "Read existing docs/context.md", "status": "in_progress", "activeForm": "Reading context file"},
  {"content": "Gather sources (status.json, bus, epics, ADRs, practices, architecture, CI, CHANGELOG)", "status": "pending", "activeForm": "Gathering sources"},
  {"content": "Generate/update managed sections (6 sections)", "status": "pending", "activeForm": "Generating sections"},
  {"content": "Show diff for review", "status": "pending", "activeForm": "Showing diff"},
  {"content": "Apply changes after YES confirmation", "status": "pending", "activeForm": "Applying changes"}
]</parameter>
</invoke>
```

**NEVER skip this.** It's how we track multi-step work.

---

### 🚨 RULE #2: DIFF-FIRST - ALWAYS SHOW CHANGES BEFORE WRITING

**Workflow sequence is NON-NEGOTIABLE:**
1. **Read** existing `docs/context.md` (if exists) - identify user vs managed content
2. **Gather** all source files (see REQUIRED SOURCES below)
3. **Generate** new managed sections
4. **Show diff** - display exactly what changed (use diff format)
5. **Confirm** - call AskUserQuestion: "Apply these changes?"
6. **Apply** - only after YES, write to file using Edit tool

**❌ WRONG:** Write changes without showing diff first
**✅ RIGHT:** Show diff, wait for YES, then write

---

### 🚨 RULE #3: PRESERVE USER-WRITTEN CONTENT

**MANAGED SECTIONS are within markers:**
```markdown
<!-- MANAGED_SECTION: overview -->
[Content here - OK to update]
<!-- END_MANAGED -->
```

**USER-WRITTEN SECTIONS have no markers:**
```markdown
## My Custom Section
[Content here - NEVER touch this]
```

**Rules for updating:**
- Only modify content between `<!-- MANAGED_SECTION: X -->` markers
- NEVER delete or modify sections without markers
- If user has added custom sections outside markers, preserve them
- If user section conflicts with managed section, show diff and ask

---

### 🚨 RULE #4: REQUIRED SOURCES & MANAGED SECTIONS

**Required source files (gather ALL, even if missing):**
```
docs/09-agents/status.json       # Current story/epic status (REQUIRED)
docs/09-agents/bus/log.jsonl     # Last 10 progress messages (REQUIRED)
docs/05-epics/*.md               # Epic details (if exists)
docs/06-stories/*/*.md           # Story details (if exists)
docs/03-decisions/*.md           # ADRs (if exists)
docs/02-practices/*.md           # Development practices (if exists)
docs/04-architecture/*.md        # System architecture (if exists)
package.json / pyproject.toml    # Project manifest (for tech stack)
.github/workflows/*.yml          # CI config (if exists)
CHANGELOG.md                     # Recent changes (if exists)
```

**Managed sections to generate (6 total):**

| Section | Source | Purpose | Max Lines |
|---------|--------|---------|-----------|
| **overview** | README, package.json | What we're building + current focus | 10 |
| **features** | status.json epics | Epic map with story counts | 20 |
| **tech** | package.json, workflows | Tech stack and dependencies | 15 |
| **decisions** | ADRs directory | Key ADRs with status | 15 |
| **progress** | bus/log.jsonl | Last 10 bus messages (chronological) | 30 |
| **next** | status.json | Ready/in-progress stories | 20 |

---

### 🚨 RULE #5: HANDLING MISSING FILES

**If file doesn't exist, DON'T ERROR - adapt:**

| Missing File | Action |
|--------------|--------|
| `docs/context.md` | Create new file with all sections |
| `status.json` | Skip features/next sections, leave placeholders |
| `bus/log.jsonl` | Skip progress section |
| `ADR files` | Skip decisions section |
| `CI config` | Skip CI details from tech section |

**Placeholder format for missing sections:**
```markdown
<!-- MANAGED_SECTION: features -->
No epics found. Create epics in docs/05-epics/ to populate this section.
<!-- END_MANAGED -->
```

---

### 🚨 RULE #6: CONFIRMATION BEFORE WRITING

**Always use AskUserQuestion before Edit:**

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "Apply these changes to docs/context.md?",
  "header": "Confirm Context Update",
  "multiSelect": false,
  "options": [
    {"label": "Yes, update", "description": "Write changes to file"},
    {"label": "No, abort", "description": "Cancel without saving"}
  ]
}]</parameter>
</invoke>
```

**Only call Edit tool if response is YES.**

---

### KEY FILES & STATE TO REMEMBER

| File/State | Purpose | Path |
|-----------|---------|------|
| Managed source | List of files to read | Required sources (Rule 4) |
| Diff display | What's changing | Show before confirm |
| User confirmation | Gate before writing | YES = write, NO = cancel |
| Managed sections | Content to update | 6 sections (overview, features, tech, decisions, progress, next) |
| File markers | Protect user content | Between `<!-- MANAGED_SECTION: X -->` markers |

---

### ANTI-PATTERNS & CORRECT PATTERNS

❌ **DON'T**: Write directly without diff
✅ **DO**: Show diff → ask → write

❌ **DON'T**: Modify user-written content
✅ **DO**: Only touch content between MANAGED_SECTION markers

❌ **DON'T**: Skip gathering if file missing
✅ **DO**: Gather what exists, use placeholders for missing

❌ **DON'T**: Create context.md without section markers
✅ **DO**: All managed content wrapped in `<!-- MANAGED_SECTION: X -->` markers

---

### REMEMBER AFTER COMPACTION

After this command completes:
- ✓ docs/context.md created/updated with managed sections
- ✓ User-written content preserved (outside markers untouched)
- ✓ File ready for pasting into ChatGPT, Perplexity, Gemini, Claude web
- ✓ Use `/agileflow:context:export` to get ≤300 line excerpt for pasting
- ✓ Use `/agileflow:context:note` to add quick timestamped notes

<!-- COMPACT_SUMMARY_END -->

---

## IMMEDIATE ACTIONS

Upon invocation, execute these steps:

### Step 1: Create Todo List

```xml
<invoke name="TodoWrite">
<parameter name="todos">[
  {"content": "Read existing docs/context.md", "status": "in_progress", "activeForm": "Reading context file"},
  {"content": "Gather sources (status.json, bus, epics, ADRs)", "status": "pending", "activeForm": "Gathering sources"},
  {"content": "Generate managed sections", "status": "pending", "activeForm": "Generating sections"},
  {"content": "Show diff for review", "status": "pending", "activeForm": "Showing diff"},
  {"content": "Apply changes after YES", "status": "pending", "activeForm": "Applying changes"}
]</parameter>
</invoke>
```

### Step 2: Read Existing Context

Read `docs/context.md` if it exists. Note which sections are managed (between `<!-- MANAGED_SECTION -->` and `<!-- END_MANAGED -->` markers) vs user-written.

### Step 3: Gather Sources

Read these files if they exist:
- `docs/09-agents/status.json` - Current story status
- `docs/09-agents/bus/log.jsonl` - Last 10 progress messages
- `docs/05-epics/*.md` - Epic details
- `docs/06-stories/*/*.md` - Story details
- `docs/03-decisions/*.md` - ADRs
- `docs/02-practices/*.md` - Practices
- `docs/04-architecture/*.md` - Architecture docs
- `package.json` or `pyproject.toml` - Project manifest
- `.github/workflows/*.yml` - CI config
- `CHANGELOG.md` - Recent changes

### Step 4: Generate Managed Sections

Create or update these sections:

```markdown
<!-- MANAGED_SECTION: overview -->
## What We're Building
[Project description from package.json or README]

## Current Focus
[From status.json: active epics/stories]
<!-- END_MANAGED -->

<!-- MANAGED_SECTION: features -->
## Feature Map
| Epic | Status | Stories |
|------|--------|---------|
[One line per epic from status.json]
<!-- END_MANAGED -->

<!-- MANAGED_SECTION: tech -->
## Tech Stack
- Framework: [from package.json]
- Key dependencies: [list major deps]
- Testing: [from scripts or CI]
<!-- END_MANAGED -->

<!-- MANAGED_SECTION: decisions -->
## Key Decisions (ADRs)
[List of ADRs with titles and status]
<!-- END_MANAGED -->

<!-- MANAGED_SECTION: progress -->
## Recent Progress
[Last 10 entries from bus/log.jsonl]
<!-- END_MANAGED -->

<!-- MANAGED_SECTION: next -->
## Next Steps
[Stories in READY status]
<!-- END_MANAGED -->
```

### Step 5: Show Diff

Display the changes as a diff:

```diff
- [old content]
+ [new content]
```

### Step 6: Ask for Confirmation

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "Apply these changes to docs/context.md?",
  "header": "Confirm",
  "multiSelect": false,
  "options": [
    {"label": "Yes, update", "description": "Write changes to file"},
    {"label": "No, abort", "description": "Cancel without saving"}
  ]
}]</parameter>
</invoke>
```

### Step 7: Apply Changes

If YES: Write to `docs/context.md` using Edit tool, preserving user-written content.

---

## Rules

- Update ONLY managed sections (between markers)
- NEVER modify user-written content outside markers
- Diff-first: Always show changes before writing
- Create file if it doesn't exist

---

## Related Commands

- `/agileflow:context:export` - Export concise excerpt for pasting
- `/agileflow:context:note` - Add quick timestamped note
- `/agileflow:research:ask` - Generate research prompt for web AI
