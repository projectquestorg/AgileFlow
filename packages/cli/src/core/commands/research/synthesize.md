---
description: Synthesize insights across multiple research files
argument-hint: [TOPIC=<text> | FILES=<comma-separated>]
compact_context:
  priority: high
  preserve_rules:
    - "ACTIVE COMMAND: /agileflow:research:synthesize - Cross-research synthesis"
    - "Search docs/10-research/ for matching files by keyword or use provided FILES list"
    - "Extract metadata: date, findings, approach, sources, related items"
    - "Find CONSENSUS (2+ files agree = HIGH), UNIQUE (1 file = verify), CONFLICTS (disagreement = flag)"
    - "Show synthesis BEFORE recommending artifacts (diff-first)"
    - "Use confidence scoring: HIGH (2+ agree), UNIQUE (1 file), CONFLICT (disagree)"
    - "Always end with AskUserQuestion for next steps"
  state_fields:
    - selected_files
    - metadata_extracted
    - consensus_findings
    - conflicts_found
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

<!-- COMPACT_SUMMARY_START -->

## ⚠️ COMPACT SUMMARY - /agileflow:research:synthesize IS ACTIVE

**CRITICAL**: You are running `/agileflow:research:synthesize`. This command queries across multiple research files.

**ROLE**: Find patterns, consensus, and conflicts across research. Apply confidence scoring.

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
1. Search `docs/10-research/*.md` for files containing keyword
2. Check filename, title (# header), key findings, summary
3. Present matching files to user for confirmation

**If FILES provided:**
1. Validate each file exists in `docs/10-research/`
2. Warn if any file not found
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

### 🚨 RULE #6: END WITH AskUserQuestion

**After showing synthesis, ask what to do next:**

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "What would you like to do with this synthesis?",
  "header": "Next step",
  "multiSelect": false,
  "options": [
    {"label": "Save synthesis report", "description": "Save to docs/10-research/ as synthesis note"},
    {"label": "Create ADR from consensus", "description": "Document architectural decision"},
    {"label": "Create Epic + Stories", "description": "Break down into trackable work"},
    {"label": "Flag conflicts for review", "description": "Mark outdated research for update"},
    {"label": "Narrow scope - different topic", "description": "Try different search keywords"},
    {"label": "Done", "description": "Exit synthesis"}
  ]
}]</parameter>
</invoke>
```

---

### ANTI-PATTERNS (DON'T DO THESE)

❌ Skip validation of TOPIC/FILES
❌ Include files that don't match the topic
❌ Show generic synthesis without reading actual file contents
❌ Jump to artifact creation without showing synthesis first
❌ Ignore conflicts - they must be flagged
❌ Treat all findings as equal - use confidence scoring
❌ End without AskUserQuestion

### DO THESE INSTEAD

✅ Validate TOPIC or FILES first
✅ Search and confirm file selection
✅ Read and extract metadata from each file
✅ Apply confidence scoring (HIGH/UNIQUE/CONFLICT)
✅ Show full synthesis before offering artifacts
✅ Flag conflicts for human review
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

**Phase 6: Present & Next Steps**
14. Show synthesis report to user
15. Ask what to do next via AskUserQuestion

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
<invoke name="TodoWrite">
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
1. List all files in `docs/10-research/`
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
  "question": "What would you like to do with this synthesis?",
  "header": "Next step",
  "multiSelect": false,
  "options": [
    {"label": "Save synthesis report (Recommended)", "description": "Save to docs/10-research/ as synthesis note"},
    {"label": "Create ADR from consensus", "description": "Document architectural decision based on agreed findings"},
    {"label": "Create Epic + Stories", "description": "Break down implementation based on synthesis"},
    {"label": "Flag conflicts for review", "description": "Mark conflicting research for update"},
    {"label": "Try different topic", "description": "Synthesize different research area"},
    {"label": "Done", "description": "Exit synthesis"}
  ]
}]</parameter>
</invoke>
```

---

## Saving Synthesis Report

If user chooses to save:

**Filename format**: `YYYYMMDD-synthesis-[topic-slug].md`

**Add to docs/10-research/README.md index:**
```markdown
| Date | Topic | File | Summary |
|------|-------|------|---------|
| 2026-01-17 | Synthesis: Authentication | 20260117-synthesis-authentication.md | Cross-research synthesis of N files... |
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
