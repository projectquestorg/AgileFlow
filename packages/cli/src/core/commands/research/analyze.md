---
description: Analyze existing research for implementation in your project
argument-hint: [FILE=<filename>]
compact_context:
  priority: high
  preserve_rules:
    - "ACTIVE COMMAND: /agileflow:research:analyze - Analyze saved research for project implementation"
    - "MUST use EnterPlanMode to gather project context before analyzing"
    - "MUST be project-specific: reference actual files and patterns from user's codebase"
    - "MUST show benefits FIRST before asking for implementation commitment"
    - "MUST intelligently recommend artifact type (ADR/Epic/Stories/Practice) based on scope"
    - "DO NOT assume a one-size-fits-all artifact type"
    - "Research type + analysis determines artifact: Architecture decision→ADR, Large feature→Epic+Stories, Focused improvement→Story"
  state_fields:
    - selected_research_file
    - research_topic
    - plan_mode_active
    - implementation_analysis
---

# /agileflow:research:analyze

Revisit existing research and analyze how it could be implemented in your project.

---

## Purpose

After importing research with `/agileflow:research:import`, you may not be ready to implement immediately. Use this command later to:
- Revisit saved research with fresh context
- Get a detailed implementation analysis for YOUR project
- See benefits, changes, and impact before committing
- Create appropriate artifacts (ADR, Epic, Story) when ready

**This is the "I want to do something with that research now" command.**

---

<!-- COMPACT_SUMMARY_START -->

## ⚠️ COMPACT SUMMARY - /agileflow:research:analyze IS ACTIVE

**CRITICAL**: You are running `/agileflow:research:analyze`. This command bridges saved research to implementation.

**ROLE**: Analyze research with project context, show benefits, recommend artifact type.

---

### 🚨 RULE #1: ALWAYS ENTER PLAN MODE FIRST

**Before analyzing research, ALWAYS call `EnterPlanMode`.** This gathers project context:

```xml
<invoke name="EnterPlanMode"/>
```

Then immediately:
```bash
node .agileflow/scripts/obtain-context.js babysit
```

**Why**: Generic analysis is worthless. You need to know their specific codebase, patterns, files, tech stack.

**❌ WRONG**: Show generic benefits without project context
**✅ RIGHT**: Reference actual files, patterns, and architecture from their codebase

---

### 🚨 RULE #2: PROJECT-SPECIFIC ANALYSIS ONLY

**Every analysis must reference ACTUAL FILES from their codebase.**

```
❌ WRONG: "This would improve performance by adding caching"
✅ RIGHT: "In src/api/users.ts, you could add Redis caching to getUserById()
           which is called 50+ times per request in the admin dashboard"
```

**What makes analysis project-specific:**
- References actual file paths (src/components/Button.tsx, not just "components")
- Mentions current patterns ("You're using React Query for data fetching, so we'd add a cache layer here")
- Estimates impact on THEIR code ("Your homepage renders 200+ components, this would fix the 2-second load time")
- Addresses THEIR tech stack (mentions Next.js if they use it, not generic React)

---

### 🚨 RULE #3: SHOW BENEFITS FIRST, THEN CHANGES

**Order matters. Benefits first, implementation complexity second.**

Format:
```
1. What they GAIN (benefits, problems solved)
2. How it would be implemented (changes, effort)
3. Risks and considerations
4. Effort estimate
5. Should we implement? (ask for commitment)
```

**❌ WRONG**: "We'd need to modify 5 files, refactor the auth system, add 2 new dependencies..."
**✅ RIGHT**: "You'd gain: 40% faster authentication, better session management, reduced security issues.
             To implement, we'd modify 5 files, refactor the auth system..."

---

### 🚨 RULE #4: INTELLIGENT ARTIFACT SELECTION

**Research type determines artifact. DON'T default to Epic.**

| Research Type | Artifact | Indicators |
|---|---|---|
| Architecture/tech decision | **ADR** | "Should we use X or Y?", trade-offs, alternatives, one-time decision |
| Large feature (5+ steps) | **Epic + Stories** | Multiple files, multiple domains, 3+ day effort |
| Single focused task | **Story** | 1-3 files, 1-4 hours effort, single domain |
| Best practices/guidelines | **Practice doc** | "How to do X properly", no feature work |
| Code quality | **Tech debt item** | Refactoring, no user-facing change |

**Example recommendations:**
- "Upgrade to Next.js 15" → ADR (architecture decision with trade-offs)
- "Add OAuth integration" → Epic + Stories (multiple files, auth + UI + API)
- "Fix memory leak in cache" → Story (single issue, focused fix)
- "Establish error handling patterns" → Practice doc (guidelines, not a feature)

---

### 🚨 RULE #5: ANALYSIS STRUCTURE (MANDATORY)

Every implementation analysis must include:

```
## 🎯 Benefits of Implementing This Research
- What they gain (specific to their project)
- Problems this solves (reference current issues)
- Why now (relevant to project state)

## 🔧 How It Would Be Implemented
- Files to modify (with impact table)
- New files to create
- Step-by-step implementation

## 🔄 What Would Change
- Behavior changes (user-facing)
- Architecture impact (how it affects current design)
- Dependencies (new packages needed)

## ⚠️ Risks & Considerations
- Migration complexity
- Learning curve
- Breaking changes

## ⏱️ Effort Estimate
- Scope: Small/Medium/Large
- Suggested approach: Epic/Story/Quick fix
```

---

### ANTI-PATTERNS (DON'T DO THESE)

❌ Skip plan mode and analyze without project context
❌ Show generic benefits ("better performance") instead of specific gains
❌ Reference files that don't exist in their codebase
❌ Assume one artifact type for all research (Epic for everything)
❌ Create artifacts without user asking first
❌ Finish without asking "Should we implement this?"

### DO THESE INSTEAD

✅ ALWAYS enter plan mode first
✅ Get project context (obtain-context.js)
✅ Reference actual files and patterns from their codebase
✅ Show specific, quantifiable benefits
✅ Recommend artifact type based on research scope
✅ Confirm user wants to implement before creating anything

---

### WORKFLOW

**Phase 1: Select Research**
1. List research files if FILE not provided
2. User selects which research to analyze
3. Read and display the research summary

**Phase 2: Gather Context**
4. Enter plan mode
5. Run obtain-context.js to understand project
6. Read relevant source files
7. Understand current patterns and architecture

**Phase 3: Analyze & Present**
8. Write detailed implementation analysis
9. Show benefits first, then complexity
10. Include project-specific file references

**Phase 4: Decide on Artifacts**
11. Ask if user wants to proceed
12. Recommend artifact type (ADR/Epic/Story/Practice/Tech debt)
13. Create artifact if user confirms

**Phase 5: Finish**
14. Exit plan mode
15. Confirm artifact created
16. Research is now tracked and ready to implement

---

### KEY FILES TO REMEMBER

| File | Purpose |
|------|---------|
| `docs/10-research/` | Saved research notes |
| `.agileflow/scripts/obtain-context.js` | Gather project context |
| `docs/09-agents/status.json` | Where artifacts are created |
| `CLAUDE.md` or `README.md` | Project overview |

---

### RESEARCH TYPE TO ARTIFACT MAPPING

**Decision/Architecture Research** → ADR
- Contains "should we use X or Y?"
- Trade-offs between options
- Long-term architectural impact
- One-time decision

**Feature/Implementation Research** → Epic + Stories OR Story
- Step-by-step implementation
- Spans multiple files/domains → Epic + Stories
- Single focused task → Story
- Clear acceptance criteria

**Pattern/Best Practice Research** → Practice doc
- "How to do X properly"
- Applies to many future tasks
- Guidelines, not a feature
- No specific artifact tracking needed

---

### REMEMBER AFTER COMPACTION

- `/agileflow:research:analyze` IS ACTIVE - you're analyzing research for implementation
- ALWAYS enter plan mode and gather context first
- ALWAYS make analysis project-specific (reference actual files)
- Show benefits FIRST, then implementation complexity
- Recommend artifact type based on research scope (not always Epic)
- Confirm user wants to implement before creating artifacts

<!-- COMPACT_SUMMARY_END -->

---

## Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| FILE | No | Filename of research note (will prompt if not provided) |

---

## IMMEDIATE ACTIONS

Upon invocation, execute these steps:

### Step 1: Create Todo List

```xml
<invoke name="TodoWrite">
<parameter name="todos">[
  {"content": "Select research note", "status": "in_progress", "activeForm": "Selecting research"},
  {"content": "Display research summary", "status": "pending", "activeForm": "Showing summary"},
  {"content": "Enter plan mode and gather context", "status": "pending", "activeForm": "Gathering context"},
  {"content": "Analyze implementation approach", "status": "pending", "activeForm": "Analyzing approach"},
  {"content": "Present benefits and changes", "status": "pending", "activeForm": "Presenting analysis"},
  {"content": "Confirm interest in implementing", "status": "pending", "activeForm": "Confirming interest"},
  {"content": "Suggest and create artifact", "status": "pending", "activeForm": "Creating artifact"}
]</parameter>
</invoke>
```

### Step 2: Select Research Note

If FILE not provided, list available research and ask:

```bash
# Get list of research files
ls docs/10-research/*.md
```

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "Which research would you like to analyze for implementation?",
  "header": "Select",
  "multiSelect": false,
  "options": [
    {"label": "[Most recent research file]", "description": "[Topic from filename]"},
    {"label": "[Second most recent]", "description": "[Topic]"},
    {"label": "[Third most recent]", "description": "[Topic]"},
    {"label": "Show full list", "description": "See all research notes"}
  ]
}]</parameter>
</invoke>
```

### Step 3: Read and Summarize Research

Read the selected research file:

```bash
# Read the research note
cat docs/10-research/[SELECTED_FILE]
```

Display a brief summary:

```markdown
## Research: [Topic]

**Imported**: [Date from file]
**Source**: [Source if available]

### Key Findings
- [Point 1]
- [Point 2]
- [Point 3]

### Action Items from Research
- [ ] [Item 1]
- [ ] [Item 2]
```

### Step 4: Offer Implementation Analysis

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "Would you like me to analyze how this research could be implemented in your project?",
  "header": "Analyze",
  "multiSelect": false,
  "options": [
    {"label": "Yes - Enter plan mode and explore (Recommended)", "description": "I'll analyze your codebase and show benefits, implementation steps, and what would change"},
    {"label": "Just view the full research", "description": "Display without analysis"},
    {"label": "Cancel", "description": "Exit"}
  ]
}]</parameter>
</invoke>
```

**If "Just view"**: Display full research content, exit.
**If "Cancel"**: Exit.
**If "Yes"**: Continue to Step 5.

### Step 5: Enter Plan Mode and Gather Context

```xml
<invoke name="EnterPlanMode"/>
```

Gather project context:

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
- How research findings apply to THIS specific project

### Step 6: Analyze and Present Implementation Plan

Based on the research content AND project context, prepare a detailed analysis:

```markdown
## Implementation Analysis for "[Research Topic]"

### 🎯 Benefits of Implementing This Research

**What you would gain:**
- [Benefit 1 - specific to this project]
- [Benefit 2 - quantifiable if possible]
- [Benefit 3 - addresses current gaps/pain points]

**Problems this solves:**
- [Current issue 1 this addresses]
- [Current issue 2 this addresses]

**Why now?**
- [Reason this is relevant to current project state]

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
**Estimated effort**: [Low/Medium/High]
```

Present this analysis to the user.

### Step 7: Confirm Interest in Implementing

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "Based on this analysis, would you like to proceed with implementation?",
  "header": "Proceed?",
  "multiSelect": false,
  "options": [
    {"label": "Yes - Create implementation artifacts", "description": "I'll suggest the best artifact type based on scope"},
    {"label": "Modify approach first", "description": "Let's adjust the plan before creating artifacts"},
    {"label": "Save analysis to research file", "description": "Append this analysis to the research note for later"},
    {"label": "Cancel", "description": "Exit plan mode, no changes"}
  ]
}]</parameter>
</invoke>
```

**If "Modify approach"**: Discuss changes, update analysis, re-ask.
**If "Save analysis"**: Append the analysis section to the research file, exit plan mode.
**If "Cancel"**: Exit plan mode, done.
**If "Yes"**: Continue to Step 8.

### Step 8: Intelligently Suggest Artifact Type

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
    {"label": "Skip artifact creation", "description": "Analysis is enough for now"}
  ]
}]</parameter>
</invoke>
```

### Step 9: Create Selected Artifact

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

- Research: docs/10-research/[filename]
- Analysis: [appended to research file / separate]
- [Artifact]: [path or ID]

The implementation plan is now tracked and ready to execute.
```

---

## Example Usage

```bash
# Analyze specific research
/agileflow:research:analyze FILE=20260106-nextjs-best-practices.md

# Let command prompt for selection
/agileflow:research:analyze
```

---

## Rules

- **Plan mode required**: Always use EnterPlanMode for proper context gathering
- **Project-specific analysis**: Reference actual files, not generic advice
- **Benefits first**: Show value before asking for commitment
- **Intelligent artifacts**: Recommend based on scope, not one-size-fits-all
- **Preserve research**: Never modify original research content (only append analysis)

---

## Related Commands

- `/agileflow:research:import` - Import new research (includes analysis option)
- `/agileflow:research:synthesize` - Synthesize insights across multiple research files
- `/agileflow:research:view` - Read-only view of research
- `/agileflow:research:list` - Show all research notes
- `/agileflow:research:ask` - Generate research prompt for web AI
