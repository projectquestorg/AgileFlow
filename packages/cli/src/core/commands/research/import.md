---
description: Import research results and save to research folder
argument-hint: TOPIC=<text> [CONTENT=<text>] [SOURCE=<url>]
compact_context:
  priority: critical
  preserve_rules:
    - "ACTIVE COMMAND: /agileflow:research:import - Import research from external sources"
    - "FLOW: Validate → Analyze → Format → Preview (diff-first) → Save → Update index → Ask for analysis"
    - "MUST validate TOPIC required, CONTENT required (or wait for paste)"
    - "MUST preserve ALL code snippets exactly as provided"
    - "MUST use diff-first: show formatted result BEFORE saving"
    - "MUST update docs/10-research/README.md index after saving"
    - "DO NOT jump to artifacts: ask 'would you like analysis' FIRST"
    - "If user wants analysis: EnterPlanMode → obtain-context → show benefits/changes/risks"
    - "Intelligent artifact recommendation based on research type (not always Epic)"
  state_fields:
    - topic
    - content
    - source
    - formatted_research
    - file_saved
    - analysis_requested
---

# /agileflow:research:import

Import research results from web AI tools or external content into your research folder.

---

## Purpose

After using `/agileflow:research:ask` to get answers from ChatGPT, Claude web, or other AI tools, use this command to:
- Format the results into structured markdown
- Save to `docs/10-research/YYYYMMDD-topic-slug.md`
- Update the research index
- Optionally link to ADRs, Epics, or Stories

Also works for importing:
- YouTube video transcripts
- Conference talk notes
- Blog posts / articles
- Documentation pages
- Meeting notes

---

<!-- COMPACT_SUMMARY_START -->

## ⚠️ COMPACT SUMMARY - /agileflow:research:import IS ACTIVE

**CRITICAL**: You are running `/agileflow:research:import`. This imports external research and optionally analyzes for implementation.

**ROLE**: Import → Format → Save → Optionally analyze for project-specific implementation.

---

### 🚨 RULE #1: THREE-PHASE WORKFLOW

```
Phase 1: IMPORT
  ├─ Validate TOPIC and CONTENT
  ├─ Analyze and extract key points
  └─ Format into structured markdown

Phase 2: PREVIEW (Diff-First)
  ├─ Show formatted result to user
  ├─ Ask for confirmation BEFORE saving
  └─ User reviews before file is written

Phase 3: SAVE & INDEX
  ├─ Save to docs/10-research/YYYYMMDD-topic-slug.md
  ├─ Update docs/10-research/README.md index
  └─ Offer implementation analysis (ASK FIRST)

Phase 4: ANALYSIS (If Requested)
  ├─ Enter plan mode
  ├─ Gather project context
  ├─ Show benefits + implementation plan
  └─ Suggest intelligent artifact (ADR/Epic/Story/Practice)
```

---

### 🚨 RULE #2: VALIDATE INPUTS FIRST

**TOPIC**: Required. If missing, ask user.
**CONTENT**: Required. If missing, ask user to paste after command.

```xml
<!-- If TOPIC missing -->
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "What topic is this research about?",
  "header": "Topic",
  "multiSelect": false,
  "options": [{"label": "Enter topic", "description": "Provide a descriptive title"}]
}]</parameter>
</invoke>

<!-- If CONTENT missing -->
"Please paste the research results from ChatGPT/Claude/Perplexity below."
```

---

### 🚨 RULE #3: PRESERVE CODE SNIPPETS EXACTLY

**Copy-paste code blocks verbatim. NO changes, NO reformatting.**

```
❌ WRONG: Reformat code to match project style / Remove comments / Clean up
✅ RIGHT: [Include code EXACTLY as provided in CONTENT]
```

**Why**: Code from ChatGPT/Claude might have version-specific details or important comments.

---

### 🚨 RULE #4: DIFF-FIRST (PREVIEW BEFORE SAVING)

**ALWAYS show formatted result before writing file.**

```
1. Format the research into markdown
2. Display the preview
3. Ask "Save this research file?"
4. User confirms
5. Write to docs/10-research/
6. Update index
```

```xml
<!-- Ask for confirmation -->
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "Save this research file?",
  "header": "Confirm",
  "multiSelect": false,
  "options": [
    {"label": "Yes, save to docs/10-research/", "description": "Write file and update index"},
    {"label": "No, make changes first", "description": "Cancel, I'll revise"}
  ]
}]</parameter>
</invoke>
```

---

### 🚨 RULE #5: UPDATE INDEX ALWAYS

**After saving, ALWAYS update `docs/10-research/README.md` with new entry.**

Add entry to the top of the table:
```markdown
| Date | Topic | File | Summary |
|------|-------|------|---------|
| 2026-01-07 | New Research Title | 20260107-topic-slug.md | One-line summary |
| [older entries...] |
```

**Never skip this step.** Index is how users discover research.

---

### 🚨 RULE #6: ASK BEFORE ANALYZING

**After saving research, ask "Do you want implementation analysis?" - DON'T assume.**

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "Would you like me to analyze how this research could be implemented in your project?",
  "header": "Analyze",
  "multiSelect": false,
  "options": [
    {"label": "Yes - Enter plan mode and explore (Recommended)", "description": "I'll analyze your codebase and show benefits, implementation steps, and what would change"},
    {"label": "No - Just save the research", "description": "Keep as reference, I can analyze later"},
    {"label": "Link to existing Epic/Story", "description": "Reference from current work without full analysis"}
  ]
}]</parameter>
</invoke>
```

**If "No"**: Research saved, exit gracefully.
**If "Link"**: Add research reference to document, exit.
**If "Yes"**: Continue to analysis (Phase 4).

---

### 🚨 RULE #7: ANALYSIS = PLAN MODE + PROJECT CONTEXT

**When analyzing, you MUST enter plan mode and gather project context.**

```xml
<invoke name="EnterPlanMode"/>
```

Then:
```bash
node .agileflow/scripts/obtain-context.js babysit
```

**Why**: Can't recommend artifacts without understanding their codebase, current patterns, tech stack.

---

### 🚨 RULE #8: SHOW BENEFITS FIRST IN ANALYSIS

**Order matters: Benefits → Implementation → Complexity → Risks.**

```
❌ WRONG: "We'd modify 5 files, add 2 dependencies, refactor the system..."
✅ RIGHT: "You'd gain: 40% faster auth, better security, cleaner codebase.
           To implement, we'd modify 5 files, add 2 dependencies..."
```

---

### 🚨 RULE #9: INTELLIGENT ARTIFACT SELECTION

**Recommend artifact type based on research scope. DON'T default to Epic.**

| Research Type | Artifact | Indicators |
|---|---|---|
| Architecture/tech decision | **ADR** | Trade-offs, "use X or Y?", one-time decision |
| Large feature (5+ steps) | **Epic + Stories** | Multiple files, multiple domains, 3+ days |
| Single focused task | **Story** | 1-3 files, 1-4 hours, single domain |
| Best practices/guidelines | **Practice doc** | "How to do X", guidelines, no feature work |
| Code quality/refactoring | **Tech debt item** | No user-facing change, improvement |

**Example recommendations:**
- "Upgrade to Next.js 15" → ADR
- "Add OAuth" → Epic + Stories (multiple domains)
- "Fix cache bug" → Story (single issue)

---

### FORMATTED RESEARCH STRUCTURE

Every imported research must be formatted as:

```markdown
# [Topic Title]

**Import Date**: YYYY-MM-DD
**Topic**: [original topic]
**Source**: [URL or "Direct import"]
**Content Type**: [research/transcript/article/notes]

---

## Summary
[2-3 paragraph executive summary]

---

## Key Findings
- [Point 1]
- [Point 2]
- [Point 3]

---

## Implementation Approach
1. [Step 1]
2. [Step 2]
3. [Step 3]

---

## Code Snippets
[PRESERVE EXACTLY AS PROVIDED]

---

## Action Items
- [ ] [Action 1]
- [ ] [Action 2]

---

## Risks & Gotchas
- [Risk 1]
- [Risk 2]

---

## Story Suggestions
[If content suggests feature work]

---

## References
- Source: [URL]
- Import date: YYYY-MM-DD
```

---

### ANTI-PATTERNS (DON'T DO THESE)

❌ Skip validation of TOPIC/CONTENT
❌ Save without showing preview first (diff-first)
❌ Reformat or clean up code snippets
❌ Forget to update docs/10-research/README.md
❌ Jump straight to artifact creation without asking
❌ Show generic benefits without project context
❌ Assume Epic is the right artifact for all research

### DO THESE INSTEAD

✅ Validate TOPIC and CONTENT before formatting
✅ Show formatted result before saving
✅ Preserve code snippets exactly as provided
✅ Always update the research index
✅ Ask "Do you want analysis?" before proceeding
✅ Enter plan mode to gather project context
✅ Show specific, project-relevant benefits
✅ Recommend artifact type based on research scope

---

### WORKFLOW

**Phase 1: Validate Inputs**
1. Check TOPIC provided, ask if not
2. Check CONTENT provided, ask user to paste if not
3. Extract framework/versions if available

**Phase 2: Analyze & Format**
4. Extract key findings, summary, code snippets
5. Generate action items from content
6. Identify story suggestions if applicable

**Phase 3: Preview**
7. Format complete research markdown
8. Display preview to user
9. Ask for confirmation

**Phase 4: Save**
10. If confirmed: Save to docs/10-research/YYYYMMDD-slug.md
11. Update docs/10-research/README.md index

**Phase 5: Offer Analysis**
12. Ask "Do you want implementation analysis?"
13. If "No": Done
14. If "Link": Add reference to document, exit
15. If "Yes": Continue to Phase 6

**Phase 6: Analysis (If Requested)**
16. Enter plan mode
17. Run obtain-context.js
18. Show implementation benefits + plan
19. Recommend intelligent artifact type
20. Create artifact if user confirms

**Phase 7: Finish**
21. Exit plan mode
22. Confirm artifact created
23. Research ready for implementation

---

### KEY FILES

| File | Purpose |
|------|---------|
| `docs/10-research/` | Imported research notes |
| `docs/10-research/README.md` | Index of all research |
| `docs/09-agents/status.json` | Where artifacts are created |
| `.agileflow/scripts/obtain-context.js` | Get project context |

---

### REMEMBER AFTER COMPACTION

- `/agileflow:research:import` IS ACTIVE - you're importing research
- Validate TOPIC and CONTENT first
- Format into structured markdown
- Show preview BEFORE saving (diff-first)
- Always update docs/10-research/README.md
- Ask "Do you want analysis?" BEFORE assuming
- If analyzing: enter plan mode + gather context
- Recommend artifact type based on research scope

<!-- COMPACT_SUMMARY_END -->

---

## Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| TOPIC | Yes | Name for the research file (e.g., "OAuth 2.0 Setup") |
| CONTENT | Yes* | Research results to import (*can be pasted after command) |
| SOURCE | No | Original source URL for attribution |

---

## IMMEDIATE ACTIONS

Upon invocation, execute these steps:

### Step 1: Create Todo List

```xml
<invoke name="TodoWrite">
<parameter name="todos">[
  {"content": "Validate TOPIC and CONTENT", "status": "in_progress", "activeForm": "Validating inputs"},
  {"content": "Analyze and summarize content", "status": "pending", "activeForm": "Analyzing content"},
  {"content": "Extract code snippets", "status": "pending", "activeForm": "Extracting code"},
  {"content": "Generate action items", "status": "pending", "activeForm": "Generating actions"},
  {"content": "Format research file", "status": "pending", "activeForm": "Formatting file"},
  {"content": "Show diff for review", "status": "pending", "activeForm": "Showing preview"},
  {"content": "Save to docs/10-research/", "status": "pending", "activeForm": "Saving file"},
  {"content": "Update README.md index", "status": "pending", "activeForm": "Updating index"},
  {"content": "Offer implementation analysis", "status": "pending", "activeForm": "Offering analysis"},
  {"content": "Enter plan mode and gather context (if requested)", "status": "pending", "activeForm": "Gathering context"},
  {"content": "Present implementation plan with benefits", "status": "pending", "activeForm": "Presenting plan"},
  {"content": "Suggest and create appropriate artifact", "status": "pending", "activeForm": "Creating artifact"}
]</parameter>
</invoke>
```

### Step 2: Validate Inputs

**TOPIC required**: If missing, ask:
```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "What topic is this research about?",
  "header": "Topic",
  "multiSelect": false,
  "options": [{"label": "Enter topic", "description": "Type in 'Other' field"}]
}]</parameter>
</invoke>
```

**CONTENT required**: If not provided, wait for user to paste results. Prompt:
"Please paste the research results from ChatGPT/Claude/Perplexity below."

### Step 3: Analyze Content

Extract from the provided content:
- **Summary**: 2-3 paragraph TL;DR
- **Key Findings**: Main takeaways as bullet points
- **Code Snippets**: Any code blocks (preserve exactly)
- **Action Items**: Concrete next steps
- **Story Suggestions**: Potential user stories if applicable

### Step 4: Format Research File

Generate structured markdown:

```markdown
# [Topic Title]

**Import Date**: YYYY-MM-DD
**Topic**: [original topic]
**Source**: [URL if provided, or "ChatGPT/Claude/Perplexity research"]
**Content Type**: [research/transcript/article/notes]

---

## Summary

[2-3 paragraph executive summary of the content]

---

## Key Findings

- [Main point 1 with details]
- [Main point 2 with details]
- [Main point 3 with details]
- [Continue for all key points...]

---

## Implementation Approach

[Step-by-step plan if applicable]

1. [Step 1]
2. [Step 2]
3. [Step 3]

---

## Code Snippets

[Preserve ALL code snippets exactly as provided]

### [Snippet description]

```language
[code here]
```

### [Another snippet]

```language
[code here]
```

---

## Action Items

- [ ] [Action 1 - concrete next step]
- [ ] [Action 2 - concrete next step]
- [ ] [Action 3 - concrete next step]

---

## Risks & Gotchas

[Any warnings, edge cases, or potential issues mentioned]

- [Risk 1]
- [Risk 2]

---

## Story Suggestions

[If content suggests feature work]

### Potential Epic: [Epic Title]

**US-XXXX**: [Story 1 title]
- AC: [acceptance criteria]

**US-XXXX**: [Story 2 title]
- AC: [acceptance criteria]

---

## Raw Content Reference

<details>
<summary>Original content (click to expand)</summary>

[First 1000 chars of original content for reference...]

</details>

---

## References

- Source: [URL or "Direct import"]
- Import date: YYYY-MM-DD
- Related: [links to related docs if applicable]
```

### Step 5: Show Preview

Display the formatted research file for review.

### Step 6: Ask for Confirmation

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "Save this research file?",
  "header": "Confirm",
  "multiSelect": false,
  "options": [
    {"label": "Yes, save to docs/10-research/", "description": "Write file and update index"},
    {"label": "No, cancel", "description": "Cancel without saving"}
  ]
}]</parameter>
</invoke>
```

### Step 7: Save Research File

If YES:
- Generate filename: `YYYYMMDD-<topic-slug>.md`
- Save to `docs/10-research/`
- Use Write tool

### Step 8: Update Index

Add entry to `docs/10-research/README.md`:

```markdown
| Date | Topic | File | Summary |
|------|-------|------|---------|
| YYYY-MM-DD | [Topic] | [filename.md] | [One-line summary] |
```

Insert newest entries at the top of the table.

### Step 9: Offer Implementation Analysis

After saving, ask if the user wants to understand how this research applies to their specific project:

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "Would you like me to analyze how this research could be implemented in your project?",
  "header": "Analyze",
  "multiSelect": false,
  "options": [
    {"label": "Yes - Enter plan mode and explore (Recommended)", "description": "I'll analyze your codebase and show benefits, implementation steps, and what would change"},
    {"label": "No - Just save the research", "description": "Keep as reference, I can analyze later"},
    {"label": "Link to existing Epic/Story", "description": "Reference from current work without full analysis"}
  ]
}]</parameter>
</invoke>
```

**If "Link to existing"**: Add to the target document and finish:
```markdown
**Research**: See [Topic Research](../10-research/YYYYMMDD-topic-slug.md)
```

**If "No"**: Research is saved, exit gracefully.

**If "Yes"**: Continue to Step 10.

---

### Step 10: Enter Plan Mode and Gather Context

```xml
<invoke name="EnterPlanMode"/>
```

Then immediately gather project context:

```bash
node .agileflow/scripts/obtain-context.js babysit
```

Also read key files to understand the project:
- `CLAUDE.md` or `README.md` for project overview
- Relevant source files based on research topic
- Existing architecture/pattern files

**Goal**: Understand:
- Current project structure
- Existing patterns that apply
- Files that would be affected
- Current tech stack

---

### Step 11: Analyze and Present Implementation Plan

Based on the research content AND project context, prepare a detailed analysis:

```markdown
## Implementation Analysis

### 🎯 Benefits of Implementing This Research

**What you would gain:**
- [Benefit 1 - specific to this project]
- [Benefit 2 - quantifiable if possible]
- [Benefit 3 - addresses current gaps/pain points]

**Problems this solves:**
- [Current issue 1 this addresses]
- [Current issue 2 this addresses]

---

### 🔧 How It Would Be Implemented

**Files to modify:**
| File | Change | Effort |
|------|--------|--------|
| `path/to/file1.ts` | [What changes] | Low |
| `path/to/file2.ts` | [What changes] | Medium |

**New files to create:**
- `path/to/new/file.ts` - [Purpose]

**Implementation steps:**
1. [Step 1 - specific action]
2. [Step 2 - specific action]
3. [Step 3 - specific action]

---

### 🔄 What Would Change

**Behavior changes:**
- [User-facing change 1]
- [Developer experience change]

**Architecture impact:**
- [How this affects current architecture]
- [New patterns introduced]

**Dependencies:**
- [New packages needed, if any]
- [Internal dependencies affected]

---

### ⚠️ Risks & Considerations

- [Risk 1 - migration complexity, breaking changes, etc.]
- [Risk 2 - learning curve, team adoption]
- [Mitigation strategy for each]

---

### ⏱️ Effort Estimate

**Scope**: [Small/Medium/Large]
**Suggested approach**: [Epic with stories / Single story / Quick fix]
```

Present this analysis to the user.

---

### Step 12: Confirm Interest in Implementing

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "Based on this analysis, would you like to proceed with implementation?",
  "header": "Proceed?",
  "multiSelect": false,
  "options": [
    {"label": "Yes - Create implementation artifacts", "description": "I'll suggest the best artifact type based on scope"},
    {"label": "Modify approach first", "description": "Let's adjust the plan before creating artifacts"},
    {"label": "Save analysis only", "description": "Exit plan mode, keep research + analysis for later"},
    {"label": "Cancel", "description": "Exit plan mode, research already saved"}
  ]
}]</parameter>
</invoke>
```

**If "Modify approach"**: Discuss changes, update analysis, re-ask.
**If "Save analysis only"**: Append analysis to the research file, exit plan mode.
**If "Cancel"**: Exit plan mode, done.
**If "Yes"**: Continue to Step 13.

---

### Step 13: Intelligently Suggest Artifact Type

Based on the research content and analysis, determine the BEST artifact to create:

| Research Type | Suggested Artifact | Indicators |
|---------------|-------------------|------------|
| Architecture/technology decision | **ADR** | "Should we use X or Y?", trade-offs, alternatives |
| Large feature with multiple parts | **Epic + Stories** | 5+ implementation steps, multiple domains |
| Single focused improvement | **Story** | Clear scope, 1-3 files, can be done in one session |
| Best practices/patterns | **Practice doc** | "How to do X", guidelines, not feature work |
| Code quality improvement | **Tech debt item** | Refactoring, cleanup, no user-facing change |

Present the recommendation:

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "Based on the scope, I recommend creating: [ARTIFACT TYPE]. What would you like to do?",
  "header": "Create",
  "multiSelect": false,
  "options": [
    {"label": "[Recommended artifact] (Recommended)", "description": "[Why this is the right choice]"},
    {"label": "Create ADR instead", "description": "Document this as an architecture decision"},
    {"label": "Create Epic + Stories instead", "description": "Break down into trackable work items"},
    {"label": "Create single Story instead", "description": "Track as a single work item"},
    {"label": "Skip artifact creation", "description": "Research and analysis are enough for now"}
  ]
}]</parameter>
</invoke>
```

---

### Step 14: Create Selected Artifact

**If ADR selected**:
- Use `/agileflow:adr` command format
- Reference the research file
- Include key decisions from analysis

**If Epic + Stories selected**:
- Create epic in status.json
- Generate stories based on implementation steps
- Reference research in epic

**If Story selected**:
- Create single story with ACs from implementation steps
- Reference research

**If Practice doc selected**:
- Create doc in `docs/02-practices/`
- Format as guidelines/best practices

After creation, exit plan mode and confirm:

```
✅ Created [ARTIFACT] from research "[TOPIC]"

- Research: docs/10-research/YYYYMMDD-topic.md
- [Artifact]: [path or ID]

The implementation plan is now tracked and ready to execute.
```

---

## Rules

- **Preserve ALL code snippets** exactly as provided
- **Generate actionable items** (not vague suggestions)
- **Diff-first**: Always show preview before saving
- **Always update the index**: Never skip this step
- **Keep raw content reference** collapsed for space

---

## Related Commands

- `/agileflow:research:analyze` - Revisit existing research for implementation analysis
- `/agileflow:research:ask` - Generate research prompt for web AI
- `/agileflow:research:list` - Show research notes index
- `/agileflow:research:view` - Read specific research note
