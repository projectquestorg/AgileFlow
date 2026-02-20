---
description: Synthesize insights across multiple research files
argument-hint: "[TOPIC=<text>] [FILES=<list>]"
compact_context:
  priority: high
  preserve_rules:
    - "ACTIVE COMMAND: /agileflow:research:synthesize - Cross-research synthesis"
    - "Search docs/10-research/ for matching files by keyword or use provided FILES list"
    - "Extract metadata: date, findings, approach, sources, related items"
    - "Find CONSENSUS (2+ files agree = HIGH), UNIQUE (1 file = verify), CONFLICTS (disagreement = flag)"
    - "Show synthesis BEFORE recommending artifacts (diff-first)"
    - "Use confidence scoring: HIGH (2+ agree), UNIQUE (1 file), CONFLICT (disagree)"
    - "After synthesis, offer Implementation Ideation with multi-expert analysis (like /research:import)"
    - "If ideation requested: EnterPlanMode → deploy 3-5 experts IN PARALLEL → synthesize → Implementation Ideation Report"
    - "Intelligent artifact recommendation based on research type (not always ADR/Epic)"
    - "Always end with AskUserQuestion for next steps"
  state_fields:
    - selected_files
    - metadata_extracted
    - consensus_findings
    - conflicts_found
    - analysis_requested
    - experts_deployed
    - expert_results
    - consensus_level
---

# /agileflow:research:synthesize

Synthesize insights across multiple research files to find patterns, detect conflicts, and aggregate knowledge.

---

## Purpose

Query across your research notes to discover:
- **Consensus findings** - What do multiple research files agree on? (HIGH confidence)
- **Unique insights** - What appears in only one file? (Specialized or outdated?)
- **Conflicts** - Where do research files disagree? (Needs human review)
- **Patterns** - Common technologies, timelines, categories across research

**RLM Concept Applied**: This implements the "dependency graph over documents" pattern - treating research files as nodes in a graph and finding cross-document relationships.

---

## STEP 0: Gather Context

```bash
node .agileflow/scripts/obtain-context.js research:synthesize
```

---

<!-- COMPACT_SUMMARY_START -->

## ⚠️ COMPACT SUMMARY - /agileflow:research:synthesize IS ACTIVE

**CRITICAL**: You are running `/agileflow:research:synthesize`. This command queries across multiple research files and optionally analyzes for implementation.

**ROLE**: Find patterns, consensus, and conflicts across research. Apply confidence scoring. Optionally deploy multi-expert analysis for implementation ideation.

---

### 🚨 RULE #1: VALIDATE INPUTS FIRST

**Require TOPIC or FILES:**
- `TOPIC=<text>` - Search research files by keyword
- `FILES=<comma-separated>` - Specific files to analyze

If neither provided, ask user:
```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "What topic would you like to synthesize research about?",
  "header": "Topic",
  "multiSelect": false,
  "options": [
    {"label": "Enter topic keyword", "description": "Search research files by keyword (use 'Other' to type)"},
    {"label": "List all research first", "description": "Show research index to pick files"},
    {"label": "Analyze ALL research", "description": "Synthesize entire research library (may be slow)"}
  ]
}]</parameter>
</invoke>
```

---

### 🚨 RULE #2: SEARCH OR SELECT RESEARCH FILES

**If TOPIC provided:**
1. Search `docs/10-research/*.md` AND `docs/10-research/prompts/*.md` for files containing keyword
2. Check filename, title (# header), key findings, summary
3. Present matching files to user for confirmation

**If FILES provided:**
1. Validate each file exists in `docs/10-research/` or `docs/10-research/prompts/`
2. Warn if any file not found in either location
3. Proceed with valid files

**Auto-select if <5 matches. Ask user to confirm if 5+ matches.**

---

### 🚨 RULE #3: EXTRACT METADATA FROM EACH FILE

For each selected research file, extract:

| Field | Source |
|-------|--------|
| Date | Filename (YYYYMMDD) or **Date**: header |
| Topic | First `# ` header |
| Status | **Status**: field (Active/Superseded/Archived) |
| Summary | ## Summary section (first paragraph) |
| Key Findings | Bullet list under ## Key Findings |
| Recommended Approach | ## Recommended Approach section |
| Technologies | Keywords in findings (React, Next.js, etc.) |
| Related ADRs | ## Related section ADR links |
| Related Stories | ## Related section story links |
| Sources | ## Sources section URLs |
| Age Days | Today - file date |

---

### 🚨 RULE #4: APPLY CONFIDENCE SCORING

| Category | Definition | Threshold | Action |
|----------|------------|-----------|--------|
| **HIGH** | Finding appears in 2+ files | 2+ matches | Strong recommendation |
| **MEDIUM** | Related findings, not exact | Similar topics | Consider context |
| **UNIQUE** | Only in 1 file | 1 match | Verify: newer insight or outdated? |
| **CONFLICT** | Files disagree on approach | Contradictory | Flag for human review |

**How to detect:**
- **Consensus**: Same finding/approach mentioned in multiple files
- **Unique**: Grep for finding - only 1 file contains it
- **Conflict**: Different recommendations for same topic (e.g., "use Redis" vs "use in-memory cache")

---

### 🚨 RULE #5: SHOW SYNTHESIS BEFORE ARTIFACTS (DIFF-FIRST)

**Present synthesis report BEFORE offering to create anything:**

```markdown
## Research Synthesis: [TOPIC]

### Files Analyzed (N total)
| Date | Title | Status |
|------|-------|--------|
| YYYY-MM-DD | [Topic] | Active |

### Consensus Findings (HIGH CONFIDENCE)
Findings that appear in 2+ research notes:
- **[Finding]** - Sources: [file1.md, file2.md]
  - [Supporting detail from files]

### Unique Insights (VERIFY)
Findings only in one research note:
- **[Finding]** - Source: [file.md]
  - Age: N days | Reason: [Specialized topic / Newer research / Consider updating]

### Conflicts Detected (NEEDS REVIEW)
Different approaches recommended:
- **[Topic]**:
  - [file1.md]: Recommends X because [reason]
  - [file2.md]: Recommends Y because [reason]
  - **Resolution needed**: [suggestion]

### Technology Patterns
| Technology | Files | First Mentioned | Most Recent |
|------------|-------|-----------------|-------------|
| Next.js | 5 | 2025-12-01 | 2026-01-17 |

### Related Artifacts
- **ADRs**: [list of ADRs mentioned across files]
- **Stories**: [list of stories mentioned]
- **Epics**: [list of epics mentioned]

### Timeline
[Oldest research date] → [Newest research date]
```

---

### 🚨 RULE #6: END WITH AskUserQuestion (OFFER IDEATION)

**After showing synthesis, offer implementation ideation (like /research:import):**

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "Synthesis of '[TOPIC]': [N] consensus findings, [M] conflicts across [K] files. What next?",
  "header": "Next step",
  "multiSelect": false,
  "options": [
    {"label": "Implementation ideation with [detected-type] experts (Recommended)", "description": "Deploy [3-5] experts ([expert list]) to analyze [N] consensus findings for your codebase"},
    {"label": "Save synthesis report", "description": "Save to docs/10-research/[YYYYMMDD]-synthesis-[slug].md"},
    {"label": "Flag [M] conflicts for review", "description": "Mark conflicting research on [conflict topics] for update"},
    {"label": "Narrow scope - different topic", "description": "Current: '[TOPIC]' matched [K] files - try different keywords"},
    {"label": "Done", "description": "Synthesis complete, [N] consensus + [M] conflicts documented"}
  ]
}]</parameter>
</invoke>
```

**Key**: Populate `[TOPIC]` with search topic, `[N]` with consensus finding count, `[M]` with conflict count, `[K]` with files analyzed count. For ideation, auto-detect expert type from synthesis content and list specific experts (e.g., "security, api, testing"). For "Flag conflicts", reference the actual conflict topics found. If no conflicts found (M=0), replace that option with "Synthesize with additional files" or remove it.

---

### 🚨 RULE #7: IMPLEMENTATION IDEATION = PLAN MODE + MULTI-EXPERT ANALYSIS

**When user requests ideation, you MUST:**

1. **Enter plan mode**:
```xml
<invoke name="EnterPlanMode"/>
```

2. **Gather project context**:
```bash
node .agileflow/scripts/obtain-context.js babysit
```

3. **Deploy 3-5 domain experts IN PARALLEL** (see RULE #9 for expert selection)

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

### 🚨 RULE #9: IMPLEMENTATION IDEATION (Multi-Expert Analysis)

When user requests "Implementation ideation with multi-expert analysis":

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

### 🚨 RULE #10: INTELLIGENT ARTIFACT SELECTION

**Recommend artifact type based on expert consensus. DON'T default to ADR or Epic.**

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

### ANTI-PATTERNS (DON'T DO THESE)

❌ Skip validation of TOPIC/FILES
❌ Include files that don't match the topic
❌ Show generic synthesis without reading actual file contents
❌ Jump to artifact creation without showing synthesis first
❌ Ignore conflicts - they must be flagged
❌ Treat all findings as equal - use confidence scoring
❌ Single-perspective analysis (shallow, misses domain considerations)
❌ Deploy experts one at a time (MUST be parallel)
❌ Assume ADR is the right artifact for all synthesis
❌ End without AskUserQuestion

### DO THESE INSTEAD

✅ Validate TOPIC or FILES first
✅ Search and confirm file selection
✅ Read and extract metadata from each file
✅ Apply confidence scoring (HIGH/UNIQUE/CONFLICT)
✅ Show full synthesis before offering artifacts
✅ Flag conflicts for human review
✅ Offer implementation ideation with multi-expert analysis
✅ Deploy 3-5 domain experts IN PARALLEL for multi-perspective analysis
✅ Synthesize expert results with confidence scoring
✅ Recommend artifact type based on expert consensus (not always ADR)
✅ Always end with AskUserQuestion

---

### WORKFLOW

**Phase 1: Input Validation**
1. Check if TOPIC or FILES provided
2. If neither, ask user via AskUserQuestion
3. Store selected topic/files in state

**Phase 2: File Selection**
4. If TOPIC: Search docs/10-research/*.md for keyword matches
5. If FILES: Validate each file exists
6. Present matches, confirm selection if 5+ files

**Phase 3: Metadata Extraction**
7. For each file, read and extract:
   - Date, topic, status, summary
   - Key findings, recommended approach
   - Technologies, related items, sources

**Phase 4: Synthesis Analysis**
8. Compare findings across files
9. Identify consensus (2+ files agree)
10. Identify unique insights (1 file only)
11. Detect conflicts (disagreements)
12. Extract technology patterns

**Phase 5: Report Generation**
13. Format synthesis report with sections:
    - Files Analyzed
    - Consensus Findings (HIGH)
    - Unique Insights (VERIFY)
    - Conflicts (NEEDS REVIEW)
    - Technology Patterns
    - Related Artifacts
    - Timeline

**Phase 6: Present & Offer Ideation**
14. Show synthesis report to user
15. Ask what to do next via AskUserQuestion (offer ideation)

**Phase 7: Implementation Ideation (If Requested)**
16. Enter plan mode + select 3-5 domain experts
17. Deploy experts IN PARALLEL (Task tool with run_in_background)
18. Collect results (TaskOutput) + synthesize with confidence scoring
19. Present Implementation Ideation Report
20. Confirm interest in proceeding
21. Recommend artifact type based on expert consensus
22. Create artifact if user confirms

---

### KEY FILES

| File | Purpose |
|------|---------|
| `docs/10-research/` | Directory containing all research notes |
| `docs/10-research/README.md` | Index of research with metadata |
| `docs/10-research/*.md` | Individual research files to analyze |

---

### REMEMBER AFTER COMPACTION

- `/agileflow:research:synthesize` IS ACTIVE - cross-research analysis
- Validate TOPIC or FILES first
- Search and select relevant research files
- Extract metadata from each file
- Apply confidence scoring: HIGH (2+ agree), UNIQUE (1 file), CONFLICT (disagree)
- Show synthesis BEFORE offering artifacts
- Flag conflicts for human review
- Offer Implementation Ideation with multi-expert analysis (like /research:import)
- If ideation requested: enter plan mode + deploy 3-5 domain experts IN PARALLEL
- Synthesize expert results with confidence scoring (HIGH = 2+ agree)
- Present Implementation Ideation Report with expert consensus
- Recommend artifact type based on expert consensus (not always ADR)
- End with AskUserQuestion for next steps

<!-- COMPACT_SUMMARY_END -->

---

## Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| TOPIC | No* | Keyword to search research files (*one of TOPIC or FILES required) |
| FILES | No* | Comma-separated list of specific files to analyze |

**Examples:**
```
/agileflow:research:synthesize TOPIC="authentication"
/agileflow:research:synthesize TOPIC="performance"
/agileflow:research:synthesize FILES="20260117-rlm.md,20260109-rag.md"
```

---

## IMMEDIATE ACTIONS

Upon invocation, execute these steps:

### Step 1: Create Todo List

```xml
<invoke name="TaskCreate/TaskUpdate">
<parameter name="todos">[
  {"content": "Validate TOPIC or FILES input", "status": "in_progress", "activeForm": "Validating inputs"},
  {"content": "Search/select research files", "status": "pending", "activeForm": "Selecting files"},
  {"content": "Extract metadata from each file", "status": "pending", "activeForm": "Extracting metadata"},
  {"content": "Analyze for consensus/conflicts", "status": "pending", "activeForm": "Analyzing patterns"},
  {"content": "Generate synthesis report", "status": "pending", "activeForm": "Generating report"},
  {"content": "Present synthesis and offer next steps", "status": "pending", "activeForm": "Presenting synthesis"}
]</parameter>
</invoke>
```

### Step 2: Validate Inputs

**If TOPIC provided:**
- Store topic keyword
- Proceed to search

**If FILES provided:**
- Parse comma-separated list
- Validate each file exists in `docs/10-research/`
- Proceed with valid files

**If NEITHER provided:**
```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "What topic would you like to synthesize research about?",
  "header": "Topic",
  "multiSelect": false,
  "options": [
    {"label": "Enter topic keyword", "description": "Search research files by keyword (use 'Other' to type)"},
    {"label": "List all research first", "description": "Show research index to pick files"},
    {"label": "Analyze ALL research", "description": "Synthesize entire research library"}
  ]
}]</parameter>
</invoke>
```

### Step 3: Search/Select Research Files

**If TOPIC search:**
1. List all files in `docs/10-research/` and `docs/10-research/prompts/` (if exists)
2. For each file, check if topic keyword appears in:
   - Filename
   - First `# ` header (title)
   - `## Summary` section
   - `## Key Findings` section
3. Collect matching files

**Present matches:**
```
Found N research files matching "[TOPIC]":

| # | Date | Title | Summary |
|---|------|-------|---------|
| 1 | 2026-01-17 | RLM - Recursive Language Models | Breakthrough approach... |
| 2 | 2026-01-09 | Training vs RAG | Three approaches... |
```

**If 5+ matches, ask for confirmation:**
```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "Found N matching files. Analyze all or select specific ones?",
  "header": "Selection",
  "multiSelect": false,
  "options": [
    {"label": "Analyze all N files (Recommended)", "description": "Comprehensive synthesis"},
    {"label": "Let me pick specific files", "description": "I'll tell you which ones"},
    {"label": "Narrow search - different keyword", "description": "Try more specific topic"}
  ]
}]</parameter>
</invoke>
```

### Step 4: Extract Metadata

For each selected file, read and extract:

```javascript
// Pseudocode for metadata extraction
{
  path: "20260117-rlm.md",
  date: "2026-01-17",  // From filename YYYYMMDD
  title: "RLM - Recursive Language Models",  // From # header
  status: "Active",  // From **Status**: field
  summary: "Breakthrough approach for AI agents...",  // First paragraph of ## Summary
  key_findings: [
    "Context rot is function of context AND task complexity",
    "REPL + recursion enables intelligent search",
    "Model documents as dependency graphs"
  ],
  recommended_approach: "Use REPL with recursion for complex documents",
  technologies: ["AI", "LLM", "Python", "REPL"],
  related_adrs: ["ADR-0008"],
  related_stories: [],
  sources: ["Video transcript"],
  age_days: 0
}
```

### Step 5: Synthesis Analysis

**5a. Find Consensus (HIGH confidence)**
- Group findings by similarity
- Mark as HIGH if finding appears in 2+ files
- Example: "Use caching" in file1 + "Add cache layer" in file2 = consensus

**5b. Identify Unique Insights**
- Findings only appearing in 1 file
- Check age: older = potentially outdated, newer = potentially valuable new insight
- Flag for verification

**5c. Detect Conflicts**
- Different recommendations for same topic
- Example: "Use Redis" vs "Use in-memory cache" for caching
- Flag with both positions and reasons

**5d. Extract Patterns**
- Common technologies across files
- Timeline of research (oldest → newest)
- Related artifacts mentioned

### Step 6: Generate Synthesis Report

Format the synthesis:

```markdown
## Research Synthesis: [TOPIC]

**Generated**: YYYY-MM-DD
**Files Analyzed**: N research notes
**Date Range**: [oldest] → [newest]

---

### Files Analyzed

| Date | Title | Status | Age |
|------|-------|--------|-----|
| 2026-01-17 | RLM - Recursive Language Models | Active | 0 days |
| 2026-01-09 | Training vs RAG | Active | 8 days |

---

### Consensus Findings (HIGH CONFIDENCE)

These findings appear in 2+ research notes:

1. **[Finding Statement]**
   - Sources: file1.md (line X), file2.md (line Y)
   - Context: [Brief explanation of agreement]

2. **[Finding Statement]**
   - Sources: file1.md, file3.md
   - Context: [Brief explanation]

---

### Unique Insights (VERIFY)

Findings that appear in only one research note:

1. **[Finding Statement]** - Source: file.md
   - Age: N days
   - Assessment: [Specialized topic / Newer research / Consider reviewing]

---

### Conflicts Detected (NEEDS REVIEW)

Different approaches recommended for the same topic:

1. **[Topic: Caching Strategy]**
   | File | Recommendation | Reason |
   |------|----------------|--------|
   | file1.md | Use Redis | Scalability for distributed systems |
   | file2.md | Use in-memory | Simplicity for single-node |

   **Resolution suggestion**: Consider your deployment architecture

---

### Technology Patterns

| Technology | Mentions | First Seen | Most Recent |
|------------|----------|------------|-------------|
| Next.js | 5 files | 2025-12-01 | 2026-01-17 |
| React | 4 files | 2025-12-01 | 2026-01-15 |

---

### Related Artifacts

**ADRs mentioned**: ADR-0001, ADR-0003, ADR-0008
**Stories mentioned**: US-0042, US-0055
**Epics mentioned**: EP-0004, EP-0007

---

### Timeline

```
2025-12-01  ────────────────────────────  2026-01-17
   │                                          │
   ├─ First research: [topic]                 │
   │                                          │
   └──────────────────────────────────────────┴─ Latest: [topic]
```
```

### Step 7: Present and Offer Next Steps

Show the full synthesis report, then:

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "Synthesis of '[TOPIC]': [N] consensus findings, [M] conflicts across [K] files. What next?",
  "header": "Next step",
  "multiSelect": false,
  "options": [
    {"label": "Implementation ideation with [detected-type] experts (Recommended)", "description": "Deploy [3-5] experts ([expert list]) to analyze [N] consensus findings for your codebase"},
    {"label": "Save synthesis report", "description": "Save to docs/10-research/[YYYYMMDD]-synthesis-[slug].md"},
    {"label": "Flag [M] conflicts for review", "description": "Mark conflicting research on [conflict topics] for update"},
    {"label": "Try different topic", "description": "Current: '[TOPIC]' matched [K] files - try different keywords"},
    {"label": "Done", "description": "Synthesis complete, [N] consensus + [M] conflicts documented"}
  ]
}]</parameter>
</invoke>
```

**Key**: Same smart population rules as RULE #6 above. Populate all `[bracketed]` values with actual data from the synthesis. If no conflicts (M=0), replace "Flag conflicts" with "Synthesize with additional files". Auto-detect expert type from synthesis findings.

**If "Implementation ideation"**: Continue to Step 8.
**If "Save synthesis report"**: Save and update index (see Saving section below).
**If other**: Handle accordingly.

---

### Step 8: Enter Plan Mode and Select Experts

```xml
<invoke name="EnterPlanMode"/>
```

Then immediately gather project context:

```bash
node .agileflow/scripts/obtain-context.js babysit
```

**Auto-detect research type and select experts:**

Analyze the TOPIC and synthesis findings to determine research type, then select 3-5 experts:

| Research Type | Detection Keywords | Experts |
|--------------|-------------------|---------|
| **Security/Compliance** | auth, oauth, jwt, encryption, vulnerability, compliance, csrf, xss | security, api, testing, compliance |
| **Performance** | cache, optimize, latency, throughput, benchmark, profiling | performance, database, api, monitoring |
| **Architecture/Framework** | migrate, upgrade, framework, refactor, redesign, architecture | api, database, performance, security |
| **UI/Frontend** | component, styling, accessibility, ux, design system, responsive | ui, api, testing, accessibility |
| **Database** | schema, migration, query, index, model, postgres, mongo | database, api, performance, datamigration |
| **Full-Stack (default)** | multiple domains or unclear | api, ui, database, testing, security |

---

### Step 9: Deploy Experts in Parallel

**CRITICAL**: Deploy ALL selected experts in a SINGLE message using the Task tool.

Each expert receives this prompt template:

```
EXPERTISE FIRST: Read your expertise.yaml file if it exists at .agileflow/expertise/{domain}.yaml

RESEARCH SYNTHESIS: {synthesis report summary}
CONSENSUS FINDINGS: {list of HIGH confidence findings}
CONFLICTS: {list of conflicts found}
PROJECT CONTEXT: {from obtain-context.js output}

TASK: Analyze this research synthesis from your {DOMAIN} perspective:

1. **Implementation Fit**: How well do the consensus findings fit the current codebase?
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

---

### Step 10: Collect Results and Synthesize

Collect all expert outputs using TaskOutput, then synthesize:

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

### Step 11: Present Implementation Ideation Report

```markdown
## Implementation Ideation Report

**Research Synthesis**: {TOPIC}
**Experts Consulted**: {list of 3-5 experts with badges}
**Consensus Level**: {High/Medium/Low based on agreement}

---

### High-Confidence Implementation Steps
*Agreed by 2+ experts*

1. **{Step title}**
   - Experts: {badges}
   - Files: `path/to/file1.ts`, `path/to/file2.ts`
   - Effort: {averaged estimate}
   - Approach: {consensus approach}

---

### Domain-Specific Considerations

**Security** (security expert):
- {key consideration}
- Mitigation: {recommended approach}

**Performance** (performance expert):
- {optimization opportunity}

**Testing** (testing expert):
- {coverage requirements}
- {edge cases}

---

### Risks & Gotchas

| Risk | Expert(s) | Severity | Mitigation |
|------|-----------|----------|------------|
| {risk 1} | security | High | {mitigation} |

---

### Effort Estimate Summary

| Expert | Estimate | Notes |
|--------|----------|-------|
| {expert} | {estimate} | {notes} |
| **Consensus** | **{averaged}** | {range} |

---

### Recommended Artifact

Based on expert consensus: **{ADR/Epic/Story/Practice}**
**Reason**: {why this artifact type}
```

---

### Step 12: Confirm and Create Artifact

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "[N] experts analyzed '[TOPIC]' ([CONSENSUS_LEVEL] consensus). Proceed with implementation?",
  "header": "Proceed?",
  "multiSelect": false,
  "options": [
    {"label": "Yes - Create [RECOMMENDED_ARTIFACT] (Recommended)", "description": "[N] high-confidence steps identified across [M] files"},
    {"label": "Modify approach first", "description": "Adjust [specific area of disagreement or concern]"},
    {"label": "Save analysis to synthesis file", "description": "Append ideation report to [FILENAME] for later"},
    {"label": "Cancel", "description": "Exit plan mode, synthesis already shown"}
  ]
}]</parameter>
</invoke>
```

**Key**: Populate `[N]` with expert count, `[TOPIC]` with research topic, `[CONSENSUS_LEVEL]` with High/Medium/Low. For "Create", use the actual recommended artifact type. For "Modify", reference specific disagreement areas from expert results.

**If "Yes"**: Present intelligent artifact selection:

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "Expert consensus recommends [ARTIFACT_TYPE] for '[TOPIC]'. What would you like to create?",
  "header": "Create",
  "multiSelect": false,
  "options": [
    {"label": "[Recommended artifact]: [suggested title] (Recommended)", "description": "[N] experts agreed - [brief reason from consensus]"},
    {"label": "Create Epic + Stories instead", "description": "Break into [estimated N] stories across [domains detected]"},
    {"label": "Create single Story instead", "description": "Track as one work item (~[effort estimate])"},
    {"label": "Create Practice doc instead", "description": "Document as guidelines in docs/02-practices/"},
    {"label": "Skip artifact creation", "description": "Synthesis + ideation report saved, implement later"}
  ]
}]</parameter>
</invoke>
```

**Key**: First option MUST be the actual expert-recommended artifact with a suggested title. Include expert count and brief consensus reason. For alternatives, populate with specifics from expert analysis. Remove the recommended artifact from the alternatives list.

**If "Save analysis only"**: Append Implementation Ideation Report to the synthesis file, exit plan mode.
**If "Cancel"**: Exit plan mode.

After artifact creation, exit plan mode and confirm:

```
Created [ARTIFACT] from synthesis "[TOPIC]"

**Multi-Expert Analysis Summary:**
- Experts consulted: {list}
- Consensus level: {High/Medium/Low}
- Key insights preserved: {count}

**Artifacts:**
- Synthesis: docs/10-research/YYYYMMDD-synthesis-topic.md
- [Artifact]: [path or ID]
```

---

## Saving Synthesis Report

If user chooses to save:

**Filename format**: `YYYYMMDD-synthesis-[topic-slug].md`

**Add to docs/10-research/README.md index (5-column format):**
```markdown
| Date | Topic | Type | Path | Summary |
|------|-------|------|------|---------|
| 2026-01-17 | Synthesis: Authentication | Synthesis | [20260117-synthesis-authentication.md](./20260117-synthesis-authentication.md) | Cross-research synthesis of N files... |
```

**Mark as synthesis type** in file header:
```markdown
# Synthesis: [Topic]

**Type**: Synthesis (cross-research analysis)
**Date**: YYYY-MM-DD
**Files Analyzed**: N
**Consensus Items**: N
**Conflicts Found**: N
```

---

## Rules

- **Read actual file contents** - Don't guess based on titles
- **Apply confidence scoring** - HIGH/UNIQUE/CONFLICT
- **Flag conflicts explicitly** - They need human review
- **Show synthesis before artifacts** - Diff-first principle
- **Link to source files** - Always reference original research
- **Age-aware analysis** - Older research may be outdated

---

## Related Commands

- `/agileflow:research:list` - Show all research notes
- `/agileflow:research:view` - Read specific research note
- `/agileflow:research:analyze` - Analyze single research for implementation
- `/agileflow:research:import` - Import new research
- `/agileflow:research:ask` - Generate research prompt for web AI
