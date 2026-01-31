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
    - "If user wants analysis: EnterPlanMode → deploy 3-5 experts IN PARALLEL → synthesize → Implementation Ideation Report"
    - "Intelligent artifact recommendation based on research type (not always Epic)"
  state_fields:
    - topic
    - content
    - source
    - formatted_research
    - file_saved
    - analysis_requested
    - experts_deployed
    - expert_results
    - consensus_level
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

## STEP 0: Gather Context

```bash
node .agileflow/scripts/obtain-context.js research:import
```

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

Phase 4: IMPLEMENTATION IDEATION (If Requested)
  ├─ Enter plan mode + select 3-5 domain experts
  ├─ Deploy experts IN PARALLEL (like /ideate)
  ├─ Collect results + synthesize with confidence scoring
  ├─ Present unified report with expert consensus
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
    {"label": "Yes - Implementation ideation with multi-expert analysis (Recommended)", "description": "Deploy 3-5 domain experts to analyze from security, performance, testing, and architecture perspectives"},
    {"label": "No - Just save the research", "description": "Keep as reference, I can analyze later"},
    {"label": "Link to existing Epic/Story", "description": "Reference from current work without full analysis"}
  ]
}]</parameter>
</invoke>
```

**If "No"**: Research saved, exit gracefully.
**If "Link"**: Add research reference to document, exit.
**If "Yes"**: Continue to Implementation Ideation (Phase 4).

---

### 🚨 RULE #7: IMPLEMENTATION IDEATION = PLAN MODE + MULTI-EXPERT ANALYSIS

**When user requests analysis, you MUST:**

1. **Enter plan mode**:
```xml
<invoke name="EnterPlanMode"/>
```

2. **Gather project context**:
```bash
node .agileflow/scripts/obtain-context.js babysit
```

3. **Deploy 3-5 domain experts IN PARALLEL** (see RULE #10 for expert selection)

4. **Synthesize results** with confidence scoring

**Why**: Single-perspective analysis misses domain-specific considerations. Multi-expert analysis provides security, performance, testing, and architecture perspectives for comprehensive implementation guidance.

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

### 🚨 RULE #10: IMPLEMENTATION IDEATION (Multi-Expert Analysis)

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

| Research Type | Experts (Deploy ALL in parallel) |
|--------------|--------------------------------|
| Architecture/Framework | api, database, performance, security (4) |
| Feature Implementation | api, ui, testing, database (4) |
| Security/Compliance | security, api, testing, compliance (4) |
| Performance | performance, database, api, monitoring (4) |
| Best Practices | refactor, testing, documentation (3) |
| Full-Stack (default) | api, ui, database, testing, security (5) |

**Detection Keywords:**
- **Security**: auth, oauth, jwt, encryption, vulnerability, compliance
- **Performance**: cache, optimize, latency, throughput, benchmark
- **Architecture**: migrate, upgrade, framework, refactor, redesign
- **UI**: component, styling, accessibility, ux, design system
- **Database**: schema, migration, query, index, model

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
❌ Single-perspective analysis (shallow, misses domain considerations)
❌ Deploy experts one at a time (MUST be parallel)
❌ Assume Epic is the right artifact for all research

### DO THESE INSTEAD

✅ Validate TOPIC and CONTENT before formatting
✅ Show formatted result before saving
✅ Preserve code snippets exactly as provided
✅ Always update the research index
✅ Ask "Do you want implementation ideation?" before proceeding
✅ Deploy 3-5 domain experts IN PARALLEL for multi-perspective analysis
✅ Synthesize expert results with confidence scoring
✅ Present Implementation Ideation Report with expert consensus
✅ Recommend artifact type based on expert agreement

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
12. Ask "Do you want implementation ideation?"
13. If "No": Done
14. If "Link": Add reference to document, exit
15. If "Yes": Continue to Phase 6

**Phase 6: Implementation Ideation (If Requested)**
16. Enter plan mode + select 3-5 domain experts
17. Deploy experts IN PARALLEL (Task tool with run_in_background)
18. Collect results (TaskOutput) + synthesize with confidence scoring
19. Present Implementation Ideation Report
20. Confirm interest in proceeding
21. Recommend artifact type based on expert consensus
22. Create artifact if user confirms

**Phase 7: Finish**
23. Exit plan mode
24. Confirm artifact created with expert validation
25. Research ready for implementation with expert-validated guidance

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
- Ask "Do you want implementation ideation?" BEFORE assuming
- If ideation requested: enter plan mode + deploy 3-5 domain experts IN PARALLEL
- Synthesize expert results with confidence scoring (HIGH = 2+ agree)
- Present unified Implementation Ideation Report
- Recommend artifact type based on expert consensus

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
<invoke name="TaskCreate/TaskUpdate">
<parameter name="todos">[
  {"content": "Validate TOPIC and CONTENT", "status": "in_progress", "activeForm": "Validating inputs"},
  {"content": "Analyze and summarize content", "status": "pending", "activeForm": "Analyzing content"},
  {"content": "Extract code snippets", "status": "pending", "activeForm": "Extracting code"},
  {"content": "Generate action items", "status": "pending", "activeForm": "Generating actions"},
  {"content": "Format research file", "status": "pending", "activeForm": "Formatting file"},
  {"content": "Show diff for review", "status": "pending", "activeForm": "Showing preview"},
  {"content": "Save to docs/10-research/", "status": "pending", "activeForm": "Saving file"},
  {"content": "Update README.md index", "status": "pending", "activeForm": "Updating index"},
  {"content": "Offer implementation ideation", "status": "pending", "activeForm": "Offering ideation"},
  {"content": "Enter plan mode and select domain experts (if requested)", "status": "pending", "activeForm": "Selecting experts"},
  {"content": "Deploy 3-5 experts in parallel", "status": "pending", "activeForm": "Deploying experts"},
  {"content": "Synthesize expert results with confidence scoring", "status": "pending", "activeForm": "Synthesizing results"},
  {"content": "Present Implementation Ideation Report", "status": "pending", "activeForm": "Presenting report"},
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
    {"label": "Yes - Implementation ideation with multi-expert analysis (Recommended)", "description": "Deploy 3-5 domain experts to analyze from security, performance, testing, and architecture perspectives"},
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

### Step 10: Enter Plan Mode and Select Experts

```xml
<invoke name="EnterPlanMode"/>
```

Then immediately gather project context:

```bash
node .agileflow/scripts/obtain-context.js babysit
```

**Auto-detect research type and select experts:**

Analyze the TOPIC and CONTENT to determine research type, then select 3-5 experts:

| Research Type | Detection Keywords | Experts |
|--------------|-------------------|---------|
| **Security/Compliance** | auth, oauth, jwt, encryption, vulnerability, compliance, csrf, xss | security, api, testing, compliance |
| **Performance** | cache, optimize, latency, throughput, benchmark, profiling | performance, database, api, monitoring |
| **Architecture/Framework** | migrate, upgrade, framework, refactor, redesign, architecture | api, database, performance, security |
| **UI/Frontend** | component, styling, accessibility, ux, design system, responsive | ui, api, testing, accessibility |
| **Database** | schema, migration, query, index, model, postgres, mongo | database, api, performance, datamigration |
| **Full-Stack (default)** | multiple domains or unclear | api, ui, database, testing, security |

---

### Step 11: Deploy Experts in Parallel

**CRITICAL**: Deploy ALL selected experts in a SINGLE message using the Task tool.

Each expert receives this prompt template:

```
EXPERTISE FIRST: Read your expertise.yaml file if it exists at .agileflow/expertise/{domain}.yaml

RESEARCH TOPIC: {TOPIC}
RESEARCH SUMMARY: {2-3 paragraph summary from imported content}
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

### Step 12: Collect Results and Synthesize

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

### Step 13: Present Implementation Ideation Report

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

### Step 14: Confirm Interest in Implementing

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "Based on this multi-expert analysis, would you like to proceed with implementation?",
  "header": "Proceed?",
  "multiSelect": false,
  "options": [
    {"label": "Yes - Create implementation artifacts", "description": "I'll create the recommended artifact based on expert consensus"},
    {"label": "Modify approach first", "description": "Let's adjust the plan before creating artifacts"},
    {"label": "Save analysis only", "description": "Exit plan mode, keep research + analysis for later"},
    {"label": "Cancel", "description": "Exit plan mode, research already saved"}
  ]
}]</parameter>
</invoke>
```

**If "Modify approach"**: Discuss changes, update analysis, re-ask.
**If "Save analysis only"**: Append Implementation Ideation Report to the research file, exit plan mode.
**If "Cancel"**: Exit plan mode, done.
**If "Yes"**: Continue to Step 15.

---

### Step 15: Intelligently Suggest Artifact Type

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
    {"label": "Skip artifact creation", "description": "Research and analysis are enough for now"}
  ]
}]</parameter>
</invoke>
```

---

### Step 16: Create Selected Artifact

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
- Research: docs/10-research/YYYYMMDD-topic.md
- [Artifact]: [path or ID]

The implementation plan is now tracked and ready to execute with expert-validated guidance.
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
- `/agileflow:research:synthesize` - Synthesize insights across multiple research files
- `/agileflow:research:view` - Read specific research note
