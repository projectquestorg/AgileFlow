---
description: Export concise context excerpt for web AI tools
argument-hint: (no arguments)
compact_context:
  priority: medium
  preserve_rules:
    - "ACTIVE COMMAND: /agileflow:context:export - Read-only export command"
    - "READ-ONLY: No file writes, no confirmation needed, no state changes"
    - "OUTPUT LIMIT: ≤300 lines maximum for easy pasting into web AI tools"
    - "REQUIRED INPUT: docs/context.md must exist (run /agileflow:context:full first if missing)"
    - "EXTRACT ONLY: overview, focus, tech, decisions, features, next steps (skip progress, notes)"
    - "NO TodoWrite needed - single-step read-only operation"
  state_fields:
    - context_file_exists
    - output_line_count
---

# /agileflow:context:export

Export a concise context excerpt for pasting into web AI tools.

---

## Purpose

Reads `docs/context.md` and outputs a condensed excerpt (≤300 lines) ready to paste into ChatGPT, Perplexity, Gemini, or Claude web.

**This is a read-only command** - no files are written.

---

<!-- COMPACT_SUMMARY_START -->

## ⚠️ COMPACT SUMMARY - /agileflow:context:export IS ACTIVE

**CRITICAL**: You are exporting a condensed context brief from `docs/context.md`. Follow these rules EXACTLY.

**PURPOSE**: Extract ≤300 line excerpt ready to paste into ChatGPT, Perplexity, Gemini, or Claude web for immediate context loading.

---

### 🚨 RULE #1: READ-ONLY COMMAND

**This command NEVER writes, modifies, or changes state:**
- ✓ Read docs/context.md
- ✓ Extract and format
- ✓ Output to code block
- ✗ NO file writes
- ✗ NO Edit tool calls
- ✗ NO confirmation needed
- ✗ NO state changes

**Purpose**: Simple read → extract → display workflow.

---

### 🚨 RULE #2: OUTPUT LIMIT IS STRICT - ≤300 LINES

**Maximum output size is 300 lines.** This is critical for pasting into web AI tools.

**If context.md is longer:**
1. Extract ONLY these sections (in order):
   - What We're Building (overview)
   - Current Focus (active work)
   - Tech Stack (technologies)
   - Key Decisions (ADRs list only, not full descriptions)
   - Feature Map (one-line-per-epic summary)
   - Next Steps (upcoming work)

2. **SKIP these to save space:**
   - Recent Progress (too verbose)
   - Notes section (too long)
   - Detailed story descriptions
   - Full ADR content

3. **Count lines as you extract** - use line counter to stay under 300

**Format as:**
```markdown
# Project Context Brief
Last updated: [timestamp from context.md]

## What We're Building
[Max 5 lines]

## Current Focus
[Max 5 lines]

## Tech Stack
[Max 8 lines]

## Key Decisions
[Max 10 lines - ADR titles only]

## Feature Map
[Max 15 lines - one per epic]

## Next Steps
[Max 15 lines - ready stories only]
```

---

### 🚨 RULE #3: REQUIRED INPUT FILE

**docs/context.md MUST exist before exporting.**

**If missing:**
```
Error: docs/context.md not found.

To create it, run: /agileflow:context:full

Then you can export with: /agileflow:context:export
```

**Do NOT create placeholder or fallback - user must run :full first.**

---

### 🚨 RULE #4: EXTRACTION SEQUENCE

**Extract in this EXACT order (don't rearrange):**

| Step | Section | Source | Max Lines |
|------|---------|--------|-----------|
| 1 | Header | "# Project Context Brief" | 1 |
| 2 | Timestamp | Last updated: [from context.md] | 1 |
| 3 | What We're Building | From overview section | 5 |
| 4 | Current Focus | From overview/focus section | 5 |
| 5 | Tech Stack | From tech section (short list) | 8 |
| 6 | Key Decisions | From decisions section (titles only) | 10 |
| 7 | Feature Map | From features section (one per epic) | 15 |
| 8 | Next Steps | From next section (ready stories) | 15 |
| 9 | Footer | Paste instructions | 3 |
| | | **TOTAL** | **≤300** |

---

### 🚨 RULE #5: CONTENT CONDENSING RULES

**When extracting, apply these rules to stay under limit:**

| Element | Full Size | Condensed Size | Rule |
|---------|-----------|----------------|------|
| ADRs | Full description | Title + status only | "ADR-001: Feature X (Accepted)" |
| Stories | Title + description | Title + status | "US-0042 (in-progress)" |
| Tech | Full list + versions | Framework + key deps only | "Next.js 16, TensorFlow.js, Tailwind" |
| Epics | Title + stories list | Title + story count + status | "EP-001: Auth (3 stories, 1 done)" |
| Decisions | Full context | One-liner | "JWT instead of sessions" |

---

### 🚨 RULE #6: OUTPUT FORMAT IS EXACT

**Always output in code block for easy copying:**

```
markdown
# Project Context Brief
Last updated: [ISO timestamp]

[Extracted sections...]

---
**Paste this into**: ChatGPT, Perplexity, Gemini, or Claude web
**Purpose**: Load full project context for AI assistance
**Limit**: This excerpt is ≤300 lines for easy pasting
```

**DO NOT output as plain text, tables, or separate sections - use single code block for easy selection and copy.**

---

### KEY FILES & STATE TO REMEMBER

| File/State | Purpose | Notes |
|-----------|---------|-------|
| docs/context.md | Source file | Must exist, read-only |
| Output limit | Max 300 lines | Count carefully |
| Line counter | Track total | Update as you extract |
| Code block | Output format | For easy copy-paste |

---

### ANTI-PATTERNS & CORRECT PATTERNS

❌ **DON'T**: Modify docs/context.md
✅ **DO**: Read-only extract only

❌ **DON'T**: Output >300 lines
✅ **DO**: Condense to fit limit

❌ **DON'T**: Include full ADR descriptions
✅ **DO**: ADR titles + status only

❌ **DON'T**: Include progress/notes sections
✅ **DO**: Overview, focus, tech, decisions, features, next only

❌ **DON'T**: Output as plain text
✅ **DO**: Single markdown code block for copy-paste

---

### REMEMBER AFTER COMPACTION

After this command completes:
- ✓ Excerpt extracted from docs/context.md (read-only)
- ✓ Output ≤300 lines (verified count)
- ✓ Formatted in markdown code block
- ✓ Ready to paste into ChatGPT, Perplexity, Gemini, Claude web
- ✓ Use `/agileflow:context:full` to regenerate docs/context.md
- ✓ Use `/agileflow:context:note` to add timestamped notes to context.md

<!-- COMPACT_SUMMARY_END -->

---

## IMMEDIATE ACTIONS

Upon invocation, execute these steps:

### Step 1: Read Context File

Read `docs/context.md`. If it doesn't exist, inform user to run `/agileflow:context:full` first.

### Step 2: Extract Key Sections

From the context file, extract only:
- Last updated timestamp
- What we're building (project overview)
- Current focus (active work)
- Tech/tooling summary
- Key decisions (ADRs list)
- Feature map (one line per epic)
- Next steps

### Step 3: Format Output

Output the excerpt in a code block:

```markdown
# Project Context Brief
Last updated: [timestamp]

## What We're Building
[Brief description]

## Current Focus
[Active epics/stories]

## Tech Stack
[Key technologies]

## Key Decisions
[ADR list]

## Feature Map
[Epic status summary]

## Next Steps
[Ready stories]
```

### Step 4: Add Instructions

End with:

```
---
Paste this excerpt into your web AI tool (ChatGPT, Perplexity, Gemini, etc.) to load context.
```

---

## Constraints

- **LIMIT**: ≤300 lines total output
- **NO FILE WRITES**: This is read-only
- **NO TodoWrite needed**: Simple single-step operation

---

## Related Commands

- `/agileflow:context:full` - Generate/refresh full context brief
- `/agileflow:context:note` - Add quick timestamped note
- `/agileflow:research:ask` - Generate research prompt for web AI
