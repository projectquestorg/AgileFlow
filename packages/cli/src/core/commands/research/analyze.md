---
description: Analyze existing research for implementation in your project
argument-hint: "[FILE=<filename>]"
compact_context:
  priority: high
  preserve_rules:
    - "ACTIVE COMMAND: /agileflow:research:analyze - Analyze saved research for project implementation"
    - "MUST use EnterPlanMode and deploy 3-5 domain experts IN PARALLEL for multi-perspective analysis"
    - "MUST be project-specific: reference actual files and patterns from user's codebase"
    - "MUST synthesize expert results with confidence scoring (HIGH = 2+ experts agree)"
    - "MUST present Implementation Ideation Report with expert consensus before artifact creation"
    - "DO NOT use single-perspective analysis (shallow, misses domain considerations)"
    - "Research type + expert consensus determines artifact: Architecture decision→ADR, Large feature→Epic+Stories, Focused improvement→Story"
    - "For large research files (50k+ chars) or HIGH complexity: Use RLM approach with document-repl.js"
    - "Assess file with --info before reading; use targeted extraction for large docs"
  state_fields:
    - selected_research_file
    - research_topic
    - research_complexity
    - research_chars
    - plan_mode_active
    - implementation_analysis
    - experts_deployed
    - expert_results
    - consensus_level
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

## STEP 0: Gather Context

```bash
node .agileflow/scripts/obtain-context.js research:analyze
```

---

<!-- COMPACT_SUMMARY_START -->

## ⚠️ COMPACT SUMMARY - /agileflow:research:analyze IS ACTIVE

**CRITICAL**: You are running `/agileflow:research:analyze`. This command bridges saved research to implementation.

**ROLE**: Analyze research with project context, show benefits, recommend artifact type.

---

### 🚨 RULE #1: IMPLEMENTATION IDEATION = PLAN MODE + MULTI-EXPERT ANALYSIS

**Before analyzing research, ALWAYS:**

1. **Enter plan mode**:
```xml
<invoke name="EnterPlanMode"/>
```

2. **Gather project context**:
```bash
node .agileflow/scripts/obtain-context.js babysit
```

3. **Deploy 3-5 domain experts IN PARALLEL** (see RULE #6 for expert selection)

4. **Synthesize results** with confidence scoring

**Why**: Single-perspective analysis misses domain-specific considerations. Multi-expert analysis provides security, performance, testing, and architecture perspectives for comprehensive implementation guidance.

**❌ WRONG**: Single-perspective analysis without expert consultation
**✅ RIGHT**: Deploy domain experts in parallel, synthesize with confidence scoring

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

### 🚨 RULE #5: USE RLM FOR LARGE RESEARCH FILES

**For research files > 50k chars or HIGH complexity, use document-repl.js:**

```bash
# Assess first
node packages/cli/scripts/document-repl.js --load="docs/10-research/FILE.md" --info

# If large/complex, use targeted extraction:
node packages/cli/scripts/document-repl.js --load="FILE" --toc
node packages/cli/scripts/document-repl.js --load="FILE" --search="implementation"
node packages/cli/scripts/document-repl.js --load="FILE" --section="Key Findings"
```

**❌ WRONG**: Read full 100k char research file into context
**✅ RIGHT**: Use document-repl.js to extract only relevant sections

---

### 🚨 RULE #6: IMPLEMENTATION IDEATION (Multi-Expert Analysis)

When user requests "Yes - Implementation ideation with multi-expert analysis":

1. **Enter Plan Mode** and auto-detect research type to select experts
2. **Deploy 3-5 experts IN PARALLEL** (like /ideate pattern)
3. **Each expert analyzes from their domain perspective**:
   - Implementation fit for codebase
   - Domain-specific considerations
   - Recommended approach with specific files
   - Risks and gotchas
4. **Synthesize with confidence scoring**:
   - HIGH CONFIDENCE: 2+ experts agree on approach/files
   - MEDIUM CONFIDENCE: 1 expert with specific evidence
5. **Present unified Implementation Ideation Report** with expert consensus

**Expert Selection by Research Type:**

| Research Type | Detection Keywords | Experts |
|--------------|-------------------|---------|
| **Security/Compliance** | auth, oauth, jwt, encryption, vulnerability, compliance, csrf, xss | security, api, testing, compliance |
| **Performance** | cache, optimize, latency, throughput, benchmark, profiling | performance, database, api, monitoring |
| **Architecture/Framework** | migrate, upgrade, framework, refactor, redesign, architecture | api, database, performance, security |
| **UI/Frontend** | component, styling, accessibility, ux, design system, responsive | ui, api, testing, accessibility |
| **Database** | schema, migration, query, index, model, postgres, mongo | database, api, performance, datamigration |
| **Full-Stack (default)** | multiple domains or unclear | api, ui, database, testing, security |

---

### ANTI-PATTERNS (DON'T DO THESE)

❌ Skip plan mode and analyze without project context
❌ Single-perspective analysis (shallow, misses domain considerations)
❌ Deploy experts one at a time (MUST be parallel)
❌ Reference files that don't exist in their codebase
❌ Assume one artifact type for all research (Epic for everything)
❌ Create artifacts without user asking first
❌ Load full large research files (50k+) - use RLM approach

### DO THESE INSTEAD

✅ ALWAYS enter plan mode first
✅ Deploy 3-5 domain experts IN PARALLEL for multi-perspective analysis
✅ Synthesize expert results with confidence scoring
✅ Present Implementation Ideation Report with expert consensus
✅ Reference actual files and patterns from their codebase
✅ Recommend artifact type based on expert agreement
✅ Confirm user wants to implement before creating anything
✅ Assess research file size/complexity before reading
✅ Use document-repl.js for large or complex research files

---

### WORKFLOW

**Phase 1: Select Research**
1. List research files if FILE not provided
2. User selects which research to analyze
3. Assess file size/complexity
4. Read and display the research summary

**Phase 2: Offer Implementation Ideation**
5. Ask if user wants multi-expert analysis
6. If "No": Display full research, exit
7. If "Yes": Continue to Phase 3

**Phase 3: Implementation Ideation**
8. Enter plan mode + select 3-5 domain experts
9. Deploy experts IN PARALLEL (Task tool with run_in_background)
10. Collect results (TaskOutput) + synthesize with confidence scoring
11. Present Implementation Ideation Report

**Phase 4: Decide on Artifacts**
12. Confirm interest in proceeding
13. Recommend artifact type based on expert consensus
14. Create artifact if user confirms

**Phase 5: Finish**
15. Exit plan mode
16. Confirm artifact created with expert validation
17. Research is now tracked and ready to implement

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
- ALWAYS enter plan mode + deploy 3-5 domain experts IN PARALLEL
- Synthesize expert results with confidence scoring (HIGH = 2+ agree)
- Present unified Implementation Ideation Report
- ALWAYS make analysis project-specific (reference actual files)
- Recommend artifact type based on expert consensus (not always Epic)
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
<invoke name="TaskCreate/TaskUpdate">
<parameter name="todos">[
  {"content": "Select research note", "status": "in_progress", "activeForm": "Selecting research"},
  {"content": "Assess file and display research summary", "status": "pending", "activeForm": "Showing summary"},
  {"content": "Offer implementation ideation", "status": "pending", "activeForm": "Offering ideation"},
  {"content": "Enter plan mode and select domain experts", "status": "pending", "activeForm": "Selecting experts"},
  {"content": "Deploy 3-5 experts in parallel", "status": "pending", "activeForm": "Deploying experts"},
  {"content": "Synthesize expert results with confidence scoring", "status": "pending", "activeForm": "Synthesizing results"},
  {"content": "Present Implementation Ideation Report", "status": "pending", "activeForm": "Presenting report"},
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

### Step 3: Assess and Read Research

First, assess the research file size and complexity:

```bash
# Assess document complexity
node packages/cli/scripts/document-repl.js --load="docs/10-research/[SELECTED_FILE]" --info --json
```

**Decision point based on assessment:**

| Chars | Complexity | Approach |
|-------|------------|----------|
| < 10k | Any | Direct read (standard approach) |
| 10-50k | LOW/MEDIUM | Direct read (standard approach) |
| 50k+ | Any | **Use RLM approach** |
| Any | HIGH | **Use RLM approach** |

**If RLM approach needed** (large or high-complexity file):
- Use document-repl.js for targeted extraction
- Get TOC first: `--toc`
- Search for key concepts: `--search="implementation"`, `--search="benefits"`
- Extract relevant sections: `--section="Key Findings"`
- Avoid loading full document to preserve context

**If standard approach** (small, simple file):
```bash
# Read the research note directly
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
    {"label": "Yes - Implementation ideation with multi-expert analysis (Recommended)", "description": "Deploy 3-5 domain experts to analyze from security, performance, testing, and architecture perspectives"},
    {"label": "Just view the full research", "description": "Display without analysis"},
    {"label": "Cancel", "description": "Exit"}
  ]
}]</parameter>
</invoke>
```

**If "Just view"**: Display full research content, exit.
**If "Cancel"**: Exit.
**If "Yes"**: Continue to Step 5.

### Step 5: Enter Plan Mode and Select Experts

```xml
<invoke name="EnterPlanMode"/>
```

Then immediately gather project context:

```bash
node .agileflow/scripts/obtain-context.js babysit
```

**Auto-detect research type and select experts:**

Analyze the research TOPIC and CONTENT to determine research type, then select 3-5 experts:

| Research Type | Detection Keywords | Experts |
|--------------|-------------------|---------|
| **Security/Compliance** | auth, oauth, jwt, encryption, vulnerability, compliance, csrf, xss | security, api, testing, compliance |
| **Performance** | cache, optimize, latency, throughput, benchmark, profiling | performance, database, api, monitoring |
| **Architecture/Framework** | migrate, upgrade, framework, refactor, redesign, architecture | api, database, performance, security |
| **UI/Frontend** | component, styling, accessibility, ux, design system, responsive | ui, api, testing, accessibility |
| **Database** | schema, migration, query, index, model, postgres, mongo | database, api, performance, datamigration |
| **Full-Stack (default)** | multiple domains or unclear | api, ui, database, testing, security |

---

### Step 6: Deploy Experts in Parallel

**CRITICAL**: Deploy ALL selected experts in a SINGLE message using the Task tool.

Each expert receives this prompt template:

```
EXPERTISE FIRST: Read your expertise.yaml file if it exists at .agileflow/expertise/{domain}.yaml

RESEARCH TOPIC: {TOPIC}
RESEARCH SUMMARY: {2-3 paragraph summary from research file}
PROJECT CONTEXT: {from obtain-context.js output}

TASK: Analyze this research from your {DOMAIN} perspective:

1. **Implementation Fit**: How well does this fit the current codebase?
   - What patterns/files would need to change?
   - Any conflicts with existing architecture?

2. **Domain-Specific Considerations**: From your expertise:
   - For SECURITY: What security implications? Risks? Compliance needs?
   - For PERFORMANCE: What performance impacts? Bottlenecks? Optimization opportunities?
   - For TESTING: What test coverage needed? Edge cases? Regression risks?
   - For API: What API changes? Breaking changes? Versioning needs?
   - For UI: What UX considerations? Accessibility? Design patterns?
   - For DATABASE: What schema changes? Migration strategy? Query impact?

3. **Implementation Approach**: Your recommended approach:
   - Key files to modify (specific paths from codebase)
   - Effort estimate (hours/days/weeks)
   - Dependencies or prerequisites

4. **Risks & Gotchas**: What could go wrong?
   - Technical risks
   - Migration complexity
   - Team adoption concerns

FORMAT as structured markdown with specific file paths and evidence from codebase.
```

**Deploy using Task tool (ALL in one message):**

```xml
<invoke name="Task">
<parameter name="description">Security analysis of {TOPIC}</parameter>
<parameter name="prompt">{prompt with DOMAIN=security}</parameter>
<parameter name="subagent_type">agileflow-security</parameter>
<parameter name="run_in_background">true</parameter>
</invoke>

<invoke name="Task">
<parameter name="description">API analysis of {TOPIC}</parameter>
<parameter name="prompt">{prompt with DOMAIN=api}</parameter>
<parameter name="subagent_type">agileflow-api</parameter>
<parameter name="run_in_background">true</parameter>
</invoke>

<invoke name="Task">
<parameter name="description">Testing analysis of {TOPIC}</parameter>
<parameter name="prompt">{prompt with DOMAIN=testing}</parameter>
<parameter name="subagent_type">agileflow-testing</parameter>
<parameter name="run_in_background">true</parameter>
</invoke>

<!-- Continue for all selected experts -->
```

---

### Step 7: Collect Results and Synthesize

Collect all expert outputs:

```xml
<invoke name="TaskOutput">
<parameter name="task_id">{security_task_id}</parameter>
<parameter name="block">true</parameter>
<parameter name="timeout">60000</parameter>
</invoke>

<!-- Repeat for each expert -->
```

**Synthesis Process:**

1. **Find Consensus**: Group similar recommendations across experts
   - **HIGH CONFIDENCE**: 2+ experts recommend same approach/files
   - **MEDIUM CONFIDENCE**: 1 expert with specific evidence

2. **Aggregate Effort Estimates**: Average across experts, note range

3. **Collect All Risks**: Union of risks from all experts, prioritize by frequency

4. **Validate Artifact Recommendation** via expert consensus:
   - If experts mention "decision", "tradeoffs", "alternatives" → **ADR**
   - If experts identify 5+ files across multiple domains → **Epic + Stories**
   - If experts agree on single focus area, 1-3 files → **Story**
   - If experts focus on guidelines, patterns → **Practice doc**

---

### Step 8: Present Implementation Ideation Report

Present the synthesized analysis:

```markdown
## 🧠 Implementation Ideation Report

**Research**: {TOPIC}
**Experts Consulted**: {list of 3-5 experts with badges}
**Consensus Level**: {High/Medium/Low based on agreement}

---

### 🎯 High-Confidence Implementation Steps
*Agreed by 2+ experts*

1. **{Step title}**
   - Experts: 🔒 security, 🧪 testing
   - Files: `path/to/file1.ts`, `path/to/file2.ts`
   - Effort: {averaged estimate}
   - Approach: {consensus approach}

2. **{Step title}**
   - Experts: ⚡ api, 🗄️ database
   - Files: `path/to/file3.ts`
   - Effort: {averaged estimate}
   - Approach: {consensus approach}

---

### 💡 Domain-Specific Considerations

**🔒 Security** (security expert):
- {key consideration 1}
- {risk flagged}
- Mitigation: {recommended approach}

**⚡ Performance** (performance expert):
- {optimization opportunity}
- {bottleneck identified}

**🧪 Testing** (testing expert):
- {coverage requirements}
- {edge cases to handle}
- {regression risk assessment}

**🔧 API** (api expert):
- {API changes needed}
- {versioning considerations}

---

### ⚠️ Risks & Gotchas
*Flagged by experts*

| Risk | Expert(s) | Severity | Mitigation |
|------|-----------|----------|------------|
| {risk 1} | 🔒 security | High | {mitigation} |
| {risk 2} | ⚡ performance | Medium | {mitigation} |
| {risk 3} | 🧪 testing | Low | {mitigation} |

---

### 📊 Effort Estimate Summary

| Expert | Estimate | Notes |
|--------|----------|-------|
| security | {estimate} | {notes} |
| api | {estimate} | {notes} |
| testing | {estimate} | {notes} |
| **Consensus** | **{averaged}** | {range: min-max} |

---

### 📋 Recommended Artifact

Based on expert consensus: **{ADR/Epic/Story/Practice}**

**Reason**: {why this artifact type based on scope and expert recommendations}

**Evidence**:
- {expert 1} recommended: {artifact type}
- {expert 2} recommended: {artifact type}
- Scope assessment: {small/medium/large}
```

---

### Step 9: Confirm Interest in Implementing

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "Based on this multi-expert analysis, would you like to proceed with implementation?",
  "header": "Proceed?",
  "multiSelect": false,
  "options": [
    {"label": "Yes - Create implementation artifacts", "description": "I'll create the recommended artifact based on expert consensus"},
    {"label": "Modify approach first", "description": "Let's adjust the plan before creating artifacts"},
    {"label": "Save analysis to research file", "description": "Append Implementation Ideation Report to the research note for later"},
    {"label": "Cancel", "description": "Exit plan mode, no changes"}
  ]
}]</parameter>
</invoke>
```

**If "Modify approach"**: Discuss changes, update analysis, re-ask.
**If "Save analysis"**: Append the Implementation Ideation Report to the research file, exit plan mode.
**If "Cancel"**: Exit plan mode, done.
**If "Yes"**: Continue to Step 10.

---

### Step 10: Intelligently Suggest Artifact Type

Based on expert consensus, present the recommendation:

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "Based on expert consensus, I recommend creating: [ARTIFACT TYPE]. What would you like to do?",
  "header": "Create",
  "multiSelect": false,
  "options": [
    {"label": "[Recommended artifact] (Recommended)", "description": "[Why experts agreed on this choice]"},
    {"label": "Create ADR instead", "description": "Document this as an architecture decision"},
    {"label": "Create Epic + Stories instead", "description": "Break down into trackable work items"},
    {"label": "Create single Story instead", "description": "Track as a single work item"},
    {"label": "Skip artifact creation", "description": "Analysis is enough for now"}
  ]
}]</parameter>
</invoke>
```

---

### Step 11: Create Selected Artifact

**If ADR selected**:
- Use `/agileflow:adr` command format
- Reference the research file
- Include key decisions from expert analysis
- Document trade-offs identified by experts

**If Epic + Stories selected**:
- Create epic in status.json
- Generate stories based on high-confidence implementation steps
- Include expert-identified risks as acceptance criteria
- Reference research in epic

**If Story selected**:
- Create single story with ACs from implementation steps
- Include testing requirements from testing expert
- Reference research

**If Practice doc selected**:
- Create doc in `docs/02-practices/`
- Format as guidelines/best practices
- Include expert-recommended patterns

After creation, exit plan mode and confirm:

```
✅ Created [ARTIFACT] from research "[TOPIC]"

**Multi-Expert Analysis Summary:**
- Experts consulted: {list}
- Consensus level: {High/Medium/Low}
- Key insights preserved: {count}

**Artifacts:**
- Research: docs/10-research/[filename]
- Implementation Ideation Report: [appended to research file]
- [Artifact]: [path or ID]

The implementation plan is now tracked and ready to execute with expert-validated guidance.
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
- `/agileflow:rlm` - RLM document analysis (used automatically for large research files)
