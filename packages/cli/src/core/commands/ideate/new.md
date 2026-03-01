---
description: Generate categorized improvement ideas using multi-expert analysis
argument-hint: "[SCOPE=all|security|perf|code|ux] [DEPTH=quick|deep|ultradeep] [OUTPUT=report|stories|both] [HISTORY=true|false] [FOCUS=IDEA-XXXX] [MODEL=haiku|sonnet|opus]"
compact_context:
  priority: high
  preserve_rules:
    - "ACTIVE COMMAND: /agileflow:ideate:new - Ideation orchestrator with multi-expert analysis"
    - "CRITICAL: Deploy experts IN PARALLEL in ONE message with multiple Task calls"
    - "CRITICAL: Wait for all results before synthesis (use TaskOutput with block=true)"
    - "CRITICAL: Confidence scoring varies by depth: quick/deep (HIGH=2+ agree) | ultradeep (HIGH=3+ agree)"
    - "CRITICAL: Check ideation index for duplicates - show NEW vs RECURRING vs IMPLEMENTED"
    - "MUST parse arguments: SCOPE (all/security/perf/code/ux) | DEPTH (quick/deep/ultradeep) | OUTPUT (report/stories/both) | HISTORY (true/false) | FOCUS (IDEA-XXXX) | MODEL (haiku/sonnet/opus)"
    - "FOCUS mode: All experts analyze the same recurring idea - generate Implementation Brief"
    - "MUST categorize by domain: Security, Performance, Code Quality, UX, Testing, API/Architecture"
    - "MUST estimate effort for each idea: High/Medium/Low impact"
    - "MUST assign IDEA-XXXX identifiers to all ideas and update ideation index"
    - "Optional: Generate stories for HIGH-confidence items (if OUTPUT=stories or both)"
  state_fields:
    - scope
    - depth
    - output_mode
    - history_enabled
    - focus_idea
    - model
    - selected_experts
    - ideas_generated
    - new_ideas
    - recurring_ideas
---

# /agileflow:ideate:new

Deploy multiple domain experts in parallel to generate categorized improvement suggestions for your codebase. Inspired by AutoClaude's ideation feature.

---

## STEP 0: Gather Context

```bash
node .agileflow/scripts/obtain-context.js ideate
```

---

## STEP 0.5: Load Ideation Index (Deduplication)

**Purpose**: Load the ideation index to detect recurring ideas and track history.

Read the ideation index from `docs/00-meta/ideation-index.json`. If the file doesn't exist, create an empty index structure:

```json
{
  "schema_version": "1.0.0",
  "updated": "ISO timestamp",
  "ideas": {},
  "reports": {},
  "next_id": 1
}
```

**If first run**: Execute the migration script to backfill from existing reports:
```bash
node .agileflow/scripts/migrate-ideation-index.js
```

This enables:
- Assigning unique IDEA-XXXX identifiers to each idea
- Detecting ideas that recur across multiple reports
- Tracking which ideas have been implemented via linked stories/epics
- Showing status (NEW / RECURRING / IMPLEMENTED) in reports

---

## STEP 0.6: Check for FOCUS Mode (US-0209)

**If `FOCUS=IDEA-XXXX` is provided**, switch to Focused Re-ideation mode:

1. **Load the idea** using helper: `node .agileflow/scripts/lib/ideation-index.js focus IDEA-XXXX`
2. **Verify the idea exists** - if not found, show error and available ideas
3. **Skip normal ideation** - instead, ALL experts analyze THIS SPECIFIC idea
4. **Generate Implementation Brief** instead of regular report

**Focused Re-ideation Prompt for Each Expert**:

```
TASK: Analyze this SPECIFIC recurring idea and provide your expert perspective for implementation.

IDEA CONTEXT:
- ID: {IDEA-XXXX}
- Title: {title}
- Category: {category}
- Occurrences: {count} times across {reports}
- Files Affected: {files}
- Original Experts: {experts who identified it}
- Status: {pending/in-progress}

From your {DOMAIN} expertise, provide:

1. **Recommended Approach**: Your specific implementation strategy (2-3 paragraphs)
2. **Potential Blockers**: What could prevent or complicate implementation?
3. **Dependencies**: Other systems/files that need changes
4. **Effort Breakdown**:
   - Research: {hours/days}
   - Implementation: {hours/days}
   - Testing: {hours/days}
   - Total: {estimate}
5. **Risk Assessment**: HIGH/MEDIUM/LOW with explanation
6. **Quick Wins**: Any partial improvements that could be done immediately?

Be SPECIFIC - reference actual file paths, function names, and code patterns.
```

**Focused Re-ideation Output** (Implementation Brief):

```markdown
# Implementation Brief: {IDEA-XXXX}

**Idea**: {title}
**Generated**: {date}
**Consensus**: {N}/{total} experts agree on approach

---

## Executive Summary

{1-2 sentence overview of the recommended approach based on expert consensus}

---

## Background

- **First Identified**: {first_seen} in {source_report}
- **Recurrence**: Appeared {N} times across {reports}
- **Original Category**: {category}
- **Files Involved**: {files}

---

## Expert Analysis

### 🔒 Security Expert
**Approach**: {approach}
**Blockers**: {blockers}
**Effort**: {estimate}

### ⚡ Performance Expert
**Approach**: {approach}
**Blockers**: {blockers}
**Effort**: {estimate}

[... all experts ...]

---

## Consensus Recommendations

### Agreed Approach
{Areas where 2+ experts align}

### Key Blockers (Mentioned by Multiple Experts)
1. {blocker1} - mentioned by {experts}
2. {blocker2} - mentioned by {experts}

### Dependencies
{Combined dependency list from all experts}

### Effort Estimate
| Phase | Consensus Estimate | Range |
|-------|-------------------|-------|
| Research | {avg} | {min}-{max} |
| Implementation | {avg} | {min}-{max} |
| Testing | {avg} | {min}-{max} |
| **Total** | **{avg}** | **{min}-{max}** |

---

## Quick Wins
{List of immediate partial improvements identified by experts}

---

## Recommended Next Steps
1. Create story: /agileflow:story "{title}"
2. Or create epic with stories: /agileflow:epic "{title}"
```

---

<!-- COMPACT_SUMMARY_START -->
## Compact Summary

**Command**: `/agileflow:ideate:new` - Generate improvement ideas via multi-expert analysis

**Quick Usage**:
```
/agileflow:ideate:new SCOPE=all DEPTH=quick OUTPUT=report
/agileflow:ideate:new FOCUS=IDEA-0023   # Deep dive into specific idea
/agileflow:ideate:new DEPTH=ultradeep MODEL=opus   # Ultradeep with Opus in tmux sessions
```

**What It Does**: Deploy 4-15 domain experts → Each generates 3-5 ideas → Synthesize with confidence scoring → Categorized report

**Arguments**:
- `SCOPE=all|security|perf|code|ux` (default: all)
- `DEPTH=quick|deep|ultradeep` (default: quick) — ultradeep spawns 13 experts as tmux sessions
- `OUTPUT=report|stories|both` (default: report)
- `MODEL=haiku|sonnet|opus` (default: haiku) — model for expert subagents

### Tool Usage Examples

**Task** (deploy expert in parallel - include `model` if MODEL specified):
```xml
<invoke name="Task">
<parameter name="description">Security ideation analysis</parameter>
<parameter name="prompt">Generate 3-5 specific improvement ideas for this codebase from a SECURITY perspective...</parameter>
<parameter name="subagent_type">agileflow-security</parameter>
<parameter name="model">opus</parameter>
<parameter name="run_in_background">true</parameter>
</invoke>
```

**Ultradeep** (spawn tmux sessions):
```bash
node .agileflow/scripts/spawn-audit-sessions.js --audit=ideate --target=. --focus=all --model=opus --dry-run
node .agileflow/scripts/spawn-audit-sessions.js --audit=ideate --target=. --focus=all --model=opus
```

**TaskOutput** (collect results):
```xml
<invoke name="TaskOutput">
<parameter name="task_id">{id}</parameter>
<parameter name="block">true</parameter>
</invoke>
```

**Write** (save report):
```xml
<invoke name="Write">
<parameter name="file_path">/path/to/docs/08-project/ideation/ideation-YYYYMMDD.md</parameter>
<parameter name="content"># Ideation Report...</parameter>
</invoke>
```

**AskUserQuestion** (next steps):
```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{"question": "What would you like to do with these ideas?", "header": "Next Steps", "multiSelect": false, "options": [{"label": "Create stories for high-confidence items", "description": "Generate stories in docs/06-stories/"}, {"label": "Create epic grouping all improvements", "description": "Bundle into a new epic"}, {"label": "Save report and done", "description": "Just keep the report"}]}]</parameter>
</invoke>
```

**Categories**: Security, Performance, Code Quality, UX/Design, Testing, API/Architecture
**Confidence**: High (2+ experts agree; 3+ for ultradeep), Medium (1 expert with evidence)
**Output**: `docs/08-project/ideation/ideation-<YYYYMMDD>.md` | Optional stories
<!-- COMPACT_SUMMARY_END -->

---

## How It Works

```
┌─────────────────────────────────────────────────────────────┐
│                    USER: /agileflow:ideate:new              │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│              IDEATION ORCHESTRATOR                          │
│  1. Parse SCOPE, DEPTH, MODEL                               │
│  2a. quick/deep: Deploy 4-13 experts via Task (in-process)  │
│  2b. ultradeep: Spawn 13 tmux sessions via spawn-audit      │
│  3. Each expert generates 3-5 improvement ideas             │
│  4. Collect and synthesize with confidence scoring          │
│  5. Generate categorized report                             │
└─────────────────────────────────────────────────────────────┘
                            │
              ┌─────────────┴─────────────┐
              ▼                           ▼
     [quick/deep]                  [ultradeep]
   Task calls (in-proc)        tmux sessions (isolated)
        ┌───────┼───────┐        ┌───────┼───────┐
        ▼       ▼       ▼        ▼       ▼       ▼
┌───────────┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐
│  Security │ │Perf │ │ ... │ │ Sec │ │Perf │ │ ... │ x13
│ MODEL=X   │ │     │ │     │ │     │ │     │ │     │
│ 3-5 ideas │ │     │ │     │ │     │ │     │ │     │
└───────────┘ └─────┘ └─────┘ └─────┘ └─────┘ └─────┘
        │         │       │        │       │       │
        └─────────┴───────┘        └───────┴───────┘
                  │                        │
                  └────────────┬───────────┘
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                   SYNTHESIS ENGINE                          │
│  - Find overlapping ideas (HIGH CONFIDENCE)                 │
│  - Flag unique insights with evidence (MEDIUM)              │
│  - Discard vague suggestions (excluded)                     │
│  - Categorize by domain                                     │
│  - Estimate effort for each idea                            │
└─────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                   IDEATION REPORT                           │
│  Total Ideas: X (High: Y, Medium: Z)                        │
│  High-Confidence Improvements (agreed by 2+/3+ experts)     │
│  Medium-Confidence Opportunities (single expert)            │
│  Suggested Stories (if OUTPUT=stories)                       │
└─────────────────────────────────────────────────────────────┘
```

---

## Prompt

ROLE: Ideation Orchestrator

You coordinate multiple domain experts to generate improvement suggestions for the codebase, then synthesize their findings into a prioritized, actionable report.

### STEP 1: PARSE ARGUMENTS

Parse the input arguments:

**SCOPE** (which experts to deploy):
| SCOPE | Experts (quick/deep) | Experts (ultradeep adds) |
|-------|----------------------|--------------------------|
| `all` (default) | security, performance, refactor, ui, testing, api (6) | + accessibility, compliance, database, monitoring, qa, analytics, documentation (13 total) |
| `security` | security, api, testing (3) | + compliance, monitoring (5 total) |
| `perf` | performance, database, api (3) | + monitoring, analytics (5 total) |
| `code` | refactor, testing, api (3) | + documentation, qa (5 total) |
| `ux` | ui, accessibility, api (3) | + design, analytics (5 total) |

**DEPTH**:
- `quick` (default): Each expert generates 3 ideas, focuses on high-impact only
- `deep`: Each expert generates 5 ideas, includes lower-priority items
- `ultradeep`: Spawn each expert as a separate Claude Code session in tmux. Uses 13 experts (SCOPE=all) with 5 ideas each (~65 ideas). Requires tmux. Falls back to `deep` if tmux unavailable.

> **Note**: `DEPTH=ultradeep` is recommended for comprehensive audits, pre-release reviews, or quarterly codebase assessments. Each expert gets its own Claude session with full context, producing higher-quality analysis than in-process subagents.

**MODEL** (default: haiku):
- `haiku`: Fast and cost-effective. Good for quick/deep ideation.
- `sonnet`: Balanced quality and speed. Good default for deep analysis.
- `opus`: Maximum quality. Recommended for ultradeep or high-stakes ideation.

> The MODEL parameter is passed to each expert subagent. For quick/deep depths, it sets the `model` parameter on Task calls. For ultradeep, it's passed to `spawn-audit-sessions.js` which sets `--model` on each tmux Claude session.

**OUTPUT**:
- `report` (default): Generate ideation report only
- `stories`: Generate stories for high-confidence items
- `both`: Report + stories

### STEP 1.5: ULTRADEEP MODE (DEPTH=ultradeep)

**If `DEPTH=ultradeep`**, use tmux-based session spawning instead of in-process Task calls:

1. Show cost estimate:
   ```bash
   node .agileflow/scripts/spawn-audit-sessions.js --audit=ideate --target=. --focus=FOCUS_KEYS --model=MODEL --dry-run
   ```
2. Confirm with user before launching
3. Spawn sessions (use `--json` to capture trace ID):
   ```bash
   node .agileflow/scripts/spawn-audit-sessions.js --audit=ideate --target=. --focus=FOCUS_KEYS --model=MODEL --json
   ```
   Parse the JSON output to get `traceId`. Example: `{"ok":true,"traceId":"abc123ef",...}`
4. Wait for all analyzers to complete:
   ```bash
   node .agileflow/scripts/lib/tmux-audit-monitor.js wait TRACE_ID --timeout=1800
   ```
   - Exit 0 = all complete (JSON results on stdout)
   - Exit 1 = timeout (partial results on stdout, `missing` array shows what's left)
   - To check progress without blocking: `node .agileflow/scripts/lib/tmux-audit-monitor.js status TRACE_ID`
   - To retry stalled analyzers: `node .agileflow/scripts/lib/tmux-audit-monitor.js retry TRACE_ID`
5. Parse `results` array from the JSON output and proceed to STEP 4 (Synthesis).
6. If tmux unavailable (spawn exits code 2), fall back to `DEPTH=deep` with warning

**FOCUS_KEYS mapping from SCOPE**:

| SCOPE | FOCUS_KEYS for spawn-audit-sessions.js |
|-------|---------------------------------------|
| `all` | `all` (uses all 13 experts) |
| `security` | `security,api,testing,compliance,monitoring` |
| `perf` | `performance,database,api,monitoring,analytics` |
| `code` | `refactor,testing,api,documentation,qa` |
| `ux` | `ui,accessibility,api,analytics` |

> **Skip to STEP 4** after ultradeep collection. Steps 2-3 are only for quick/deep modes.

---

### STEP 2: DEPLOY EXPERTS IN PARALLEL

**For quick/deep modes only** (ultradeep uses tmux sessions above).

**CRITICAL**: Deploy ALL experts in a SINGLE message with multiple Task tool calls.

**If MODEL is specified**, pass it to each Task call via the `model` parameter.

Use this prompt template for each expert:

```
EXPERTISE FIRST: Read your expertise.yaml file if it exists at packages/cli/src/core/experts/{domain}/expertise.yaml

TASK: Generate {3|5} specific, actionable improvement ideas for this codebase from your {DOMAIN} perspective.

DEPTH: {quick|deep}

For each idea, provide:
1. **Title**: Concise name (5-10 words)
2. **Category**: Your domain (Security/Performance/Code Quality/UX/Testing/API)
3. **Impact**: High/Medium/Low
4. **Effort**: Hours/Days/Weeks
5. **Files**: Specific file paths affected
6. **Why**: One sentence on why this matters
7. **Approach**: Brief implementation approach (2-3 sentences)

RULES:
- Be SPECIFIC with file paths - no vague suggestions
- Only suggest improvements you can VERIFY exist in the codebase
- Prioritize by impact (High first)
- For "quick" depth, focus only on High/Medium impact items
- Include evidence (code patterns, metrics, file paths)

FORMAT each idea as:
---
### {Title}
**Category**: {domain} | **Impact**: {High/Medium/Low} | **Effort**: {estimate}
**Files**: `{path1}`, `{path2}`
**Why**: {reason}
**Approach**: {brief approach}
---
```

**Example deployment for SCOPE=all** (add `<parameter name="model">{MODEL}</parameter>` if MODEL is specified):

```xml
<invoke name="Task">
<parameter name="description">Security ideation</parameter>
<parameter name="prompt">[prompt with domain=security]</parameter>
<parameter name="subagent_type">agileflow-security</parameter>
<parameter name="model">{MODEL}</parameter>
<parameter name="run_in_background">true</parameter>
</invoke>

<invoke name="Task">
<parameter name="description">Performance ideation</parameter>
<parameter name="prompt">[prompt with domain=performance]</parameter>
<parameter name="subagent_type">agileflow-performance</parameter>
<parameter name="model">{MODEL}</parameter>
<parameter name="run_in_background">true</parameter>
</invoke>

<invoke name="Task">
<parameter name="description">Code quality ideation</parameter>
<parameter name="prompt">[prompt with domain=refactor/code quality]</parameter>
<parameter name="subagent_type">agileflow-refactor</parameter>
<parameter name="model">{MODEL}</parameter>
<parameter name="run_in_background">true</parameter>
</invoke>

<invoke name="Task">
<parameter name="description">UX ideation</parameter>
<parameter name="prompt">[prompt with domain=ui/ux]</parameter>
<parameter name="subagent_type">agileflow-ui</parameter>
<parameter name="model">{MODEL}</parameter>
<parameter name="run_in_background">true</parameter>
</invoke>

<invoke name="Task">
<parameter name="description">Testing ideation</parameter>
<parameter name="prompt">[prompt with domain=testing]</parameter>
<parameter name="subagent_type">agileflow-testing</parameter>
<parameter name="model">{MODEL}</parameter>
<parameter name="run_in_background">true</parameter>
</invoke>

<invoke name="Task">
<parameter name="description">API/Architecture ideation</parameter>
<parameter name="prompt">[prompt with domain=api/architecture]</parameter>
<parameter name="subagent_type">agileflow-api</parameter>
<parameter name="model">{MODEL}</parameter>
<parameter name="run_in_background">true</parameter>
</invoke>
```

> **Note**: Only include the `<parameter name="model">` line if MODEL was explicitly specified. If not specified, omit it to use the default model.

**Example deployment for SCOPE=all DEPTH=ultradeep** (13 experts via tmux):

```bash
# 1. Dry run to show cost estimate
node .agileflow/scripts/spawn-audit-sessions.js --audit=ideate --target=. --focus=all --model=opus --dry-run

# 2. After user confirms, spawn sessions
node .agileflow/scripts/spawn-audit-sessions.js --audit=ideate --target=. --focus=all --model=opus
```

Each expert gets its own Claude Code tmux session with full context window. Use the monitor script to track progress:

```bash
# Check completion status
node .agileflow/scripts/lib/tmux-audit-monitor.js status TRACE_ID
# Wait for all to complete (blocks until done or timeout)
node .agileflow/scripts/lib/tmux-audit-monitor.js wait TRACE_ID --timeout=1800
# Collect whatever results are ready
node .agileflow/scripts/lib/tmux-audit-monitor.js collect TRACE_ID
```

**For SCOPE-filtered ultradeep** (e.g., SCOPE=security):

```bash
node .agileflow/scripts/spawn-audit-sessions.js --audit=ideate --target=. --focus=security,api,testing,compliance,monitoring --model=sonnet
```

> **Fallback**: If tmux is unavailable, fall back to DEPTH=deep with in-process Task calls (6 experts). Warn the user: "tmux not available, falling back to DEPTH=deep with 6 in-process experts"

### STEP 3: COLLECT RESULTS

Wait for all experts to complete:

```xml
<invoke name="TaskOutput">
<parameter name="task_id">{security_id}</parameter>
<parameter name="block">true</parameter>
</invoke>

<invoke name="TaskOutput">
<parameter name="task_id">{performance_id}</parameter>
<parameter name="block">true</parameter>
</invoke>
<!-- ... collect all expert results ... -->
```

### STEP 4: SYNTHESIZE RESULTS

Analyze all expert ideas and synthesize:

**Confidence Scoring**:

| Confidence | Criteria (quick/deep) | Criteria (ultradeep) | Action |
|------------|----------------------|----------------------|--------|
| **HIGH** | 2+ experts suggest similar idea | 3+ experts suggest similar idea | Include prominently, recommend immediate action |
| **MEDIUM** | 1 expert with specific evidence | 1-2 experts with specific evidence | Include as opportunity |
| **LOW** | 1 expert, vague/no evidence | 1-2 experts, vague/no evidence | Exclude from report |

> For ultradeep mode, the higher threshold (3+) for HIGH confidence prevents noise from having many perspectives and ensures only truly cross-cutting concerns bubble up as top priorities.

**Overlap Detection**:
- Ideas about the same file/component from different experts = HIGH confidence
- Ideas with similar titles/approaches = potential overlap, merge
- Unique insights with evidence = valuable MEDIUM confidence

**Categorization**:
Group final ideas by category:
- 🔒 Security
- ⚡ Performance
- 🧹 Code Quality
- 🎨 UX/Design
- 🧪 Testing
- 🏗️ API/Architecture

### STEP 4.5: DEDUPLICATION & STATUS ENRICHMENT (if HISTORY=true)

For each synthesized idea, check against the ideation index:

1. **Generate Fingerprint**: Create normalized fingerprint from title + files
2. **Check for Duplicates**: Search index for ideas with similar fingerprint or title (≥75% similarity)
3. **Classify Status**:
   - **🆕 NEW**: No match in index → Assign new IDEA-XXXX, add to index
   - **🔄 RECURRING**: Match found → Record new occurrence, show first-seen date
   - **✅ IMPLEMENTED**: Match has linked story with status=completed → Mark as addressed

**Example classification logic**:
```
For each idea:
  fingerprint = hash(normalize(title) + sort(files))
  existing = findDuplicates(index, idea, threshold=0.75)

  if existing.length > 0 and existing[0].similarity > 0.9:
    # Recurring idea
    idea.id = existing[0].id
    idea.status = existing[0].status  # 'pending', 'implemented', etc.
    idea.first_seen = existing[0].first_seen
    idea.occurrence_count = existing[0].occurrences.length + 1
    addOccurrence(index, idea.id, reportName)
  else:
    # New idea
    idea.id = getNextId(index)  # IDEA-0145
    idea.status = 'pending'
    idea.first_seen = today
    addIdeaToIndex(index, idea, reportName)
```

**Save updated index** after processing all ideas

### STEP 5: GENERATE OUTPUT

**Report Format** (with History/Deduplication enabled):

```markdown
# Ideation Report

**Generated**: {YYYY-MM-DD}
**Scope**: {scope}
**Depth**: {quick|deep}
**Experts Consulted**: {list of experts}
**Total Ideas**: {X} raw → {Y} qualified (New: {A}, Recurring: {B}, Implemented: {C})

---

## 🆕 New Ideas (First Time Identified)
*These ideas haven't appeared in previous ideation reports*

### 1. {Title} [IDEA-0145]
**Category**: {category} | **Impact**: High | **Effort**: {estimate}
**Experts**: {expert1}, {expert2}
**Files**: `{path1}`, `{path2}`
**Why**: {reason}
**Approach**: {brief approach}

---

## 🔄 Recurring Ideas (Previously Identified)
*These ideas have appeared in prior reports - consider prioritizing*

### 2. {Title} [IDEA-0023]
**Status**: Pending (first seen: ideation-20260114.md, occurrences: 3)
**Category**: {category} | **Impact**: High | **Effort**: {estimate}
**Experts**: {expert1}, {expert2}
**Files**: `{path1}`, `{path2}`
**Why**: {reason}
**Approach**: {brief approach}

---

## ✅ Already Addressed
*These ideas were implemented via linked stories/epics*

### 3. {Title} [IDEA-0005]
**Implemented via**: US-0087 (completed 2026-01-14) in EP-0016
**Category**: {category}
**Original request**: {brief summary}

---

## 📊 Summary

| Status | Count | Percentage |
|--------|-------|------------|
| 🆕 New | X | Y% |
| 🔄 Recurring | X | Y% |
| ✅ Implemented | X | Y% |

| Category | New | Recurring | Implemented | Total |
|----------|-----|-----------|-------------|-------|
| 🔒 Security | X | Y | Z | W |
| ⚡ Performance | X | Y | Z | W |
| 🧹 Code Quality | X | Y | Z | W |
| 🎨 UX/Design | X | Y | Z | W |
| 🧪 Testing | X | Y | Z | W |
| 🏗️ API/Architecture | X | Y | Z | W |

---

## 📋 Recommended Next Steps

1. **Priority**: Address recurring high-confidence ideas (they keep coming up!)
2. Address new high-confidence security items
3. Schedule performance improvements for next sprint
4. Add code quality items to tech debt backlog
5. Run `/agileflow:ideate:history` to see full idea backlog
```

**Save report to**: `docs/08-project/ideation/ideation-{YYYYMMDD}.md`

**Update ideation index**: Save the updated index to `docs/00-meta/ideation-index.json`

### STEP 6: STORY GENERATION (if OUTPUT=stories or both)

For each HIGH-confidence idea, generate a story:

```markdown
---
story_id: US-XXXX
type: improvement
ideation_source: ideation-{YYYYMMDD}.md
estimate: {effort}
---

# US-XXXX: {Idea Title}

## Background
Identified in ideation report from {date}. Agreed by: {experts}.

## Acceptance Criteria
- [ ] {specific criterion based on approach}
- [ ] {criterion}
- [ ] Tests pass

## Technical Notes
{approach from ideation}

## Files to Modify
- `{path1}`
- `{path2}`
```

### STEP 7: OFFER NEXT STEPS

After generating output, present options:

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "[total] ideas from [expert_count] experts ([high] HIGH confidence, [medium] MEDIUM). [new] new, [recurring] recurring.",
  "header": "Next Steps",
  "multiSelect": false,
  "options": [
    {"label": "Create [high] stories for HIGH-confidence items (Recommended)", "description": "Top idea: [top_idea_title] ([impact] impact, agreed by [N] experts)"},
    {"label": "Create epic: '[epic_title]'", "description": "Bundle all [high] HIGH + [medium] MEDIUM items into EP-XXXX"},
    {"label": "Deep dive on [top_category] ([count] ideas)", "description": "Re-run SCOPE=[category] DEPTH=deep for more detail"},
    {"label": "Save report and done", "description": "Report saved to docs/08-project/ideation/ideation-[date].md"}
  ]
}]</parameter>
</invoke>
```

---

## Example Execution

**User**: `/agileflow:ideate:new SCOPE=all DEPTH=quick OUTPUT=report`

**Step 1**: Parse → SCOPE=all (6 experts), DEPTH=quick (3 ideas each), OUTPUT=report

**Step 2**: Deploy 6 experts in parallel

**Step 3**: Collect results (~18 raw ideas)

**Step 4**: Synthesize:
- 4 ideas mentioned by 2+ experts → HIGH confidence
- 8 ideas with specific evidence → MEDIUM confidence
- 6 ideas too vague → excluded

**Step 5**: Generate report with 12 ideas, saved to `docs/08-project/ideation/ideation-20260106.md`

**Step 6**: Skipped (OUTPUT=report only)

**Step 7**: Present next steps via AskUserQuestion

---

### Example: Ultradeep Execution

**User**: `/agileflow:ideate:new SCOPE=all DEPTH=ultradeep MODEL=opus OUTPUT=both`

**Step 1**: Parse → SCOPE=all (13 experts), DEPTH=ultradeep, MODEL=opus, OUTPUT=both

**Step 1.5**: Ultradeep mode detected:
- Run dry-run: `node .agileflow/scripts/spawn-audit-sessions.js --audit=ideate --target=. --focus=all --model=opus --dry-run`
- Show cost estimate to user, confirm before launching
- Spawn 13 tmux sessions: `node .agileflow/scripts/spawn-audit-sessions.js --audit=ideate --target=. --focus=all --model=opus`
- Monitor `docs/09-agents/ultradeep/{trace_id}/` for sentinel files

**Step 3**: Collect results from sentinel files (~65 raw ideas)

**Step 4**: Synthesize with ultradeep thresholds:
- 8 ideas mentioned by 3+ experts → HIGH confidence
- 25 ideas with 1-2 experts + evidence → MEDIUM confidence
- 32 ideas too vague or single expert without evidence → excluded

**Step 5**: Generate report with 33 ideas, saved to `docs/08-project/ideation/ideation-20260106.md`

**Step 6**: Generate 8 stories for HIGH-confidence items

**Step 7**: Present next steps via AskUserQuestion

---

## Arguments

| Argument | Values | Default | Description |
|----------|--------|---------|-------------|
| SCOPE | all, security, perf, code, ux | all | Which domains to analyze |
| DEPTH | quick, deep, ultradeep | quick | quick (3 ideas, 6 experts), deep (5 ideas, 6 experts), ultradeep (5 ideas, 13 experts via tmux) |
| OUTPUT | report, stories, both | report | What to generate |
| HISTORY | true, false | true | Enable deduplication and history tracking. Set to false for faster runs without history analysis |
| SHOW_IMPLEMENTED | true, false | false | Include already-implemented ideas in report (useful for tracking) |
| FOCUS | IDEA-XXXX | - | Focus on a specific recurring idea (activates Implementation Brief mode) |
| MODEL | haiku, sonnet, opus | haiku | Model for expert subagents. Passed to Task calls (quick/deep) or tmux sessions (ultradeep). |

{{argument}}

---

## Expected Output

### Success - Ideation Report

```
💡 Ideation Analysis: SCOPE=all DEPTH=deep
══════════════════════════════════════════════════════════════

Deploying 6 domain experts...
✓ Security Expert
✓ Performance Expert
✓ Code Quality Expert
✓ UX Expert
✓ Architecture Expert
✓ DevOps Expert

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🔒 SECURITY (2 ideas)
┌──────────────────────────────────────────────────────────────┐
│ 1. Add rate limiting to /api/auth endpoints                  │
│    Impact: HIGH | Effort: LOW | Confidence: 95%              │
│    Experts: Security ✓, DevOps ✓                             │
├──────────────────────────────────────────────────────────────┤
│ 2. Implement CSRF protection                                 │
│    Impact: HIGH | Effort: MEDIUM | Confidence: 90%           │
│    Experts: Security ✓, Code Quality ✓                       │
└──────────────────────────────────────────────────────────────┘

⚡ PERFORMANCE (1 idea)
│ 1. Add Redis caching for user sessions                       │
│    Impact: MEDIUM | Effort: MEDIUM | Confidence: 85%         │

🧹 CODE QUALITY (2 ideas)
│ 1. Extract validation logic to shared module                 │
│ 2. Add TypeScript strict mode                                │

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 Summary: 5 ideas from 6 experts
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Top recommendation: Rate limiting (#1 - 95% confidence)
Create stories for these ideas? [Y/n]
```

### Success - Stories Created

```
✓ Created US-0200: Add rate limiting to auth endpoints
✓ Created US-0201: Implement CSRF protection
✓ Created US-0202: Add Redis session caching
✓ Created US-0203: Extract validation module
✓ Created US-0204: Enable TypeScript strict mode

5 stories added to EP-0027 (Ideation Improvements)
```

### Error - Scope Invalid

```
❌ Error: Invalid scope: network

Valid scopes:
- all: Full codebase analysis
- security: Security vulnerabilities
- perf: Performance optimizations
- code: Code quality improvements
- ux: User experience enhancements

Usage: /agileflow:ideate:new SCOPE=security DEPTH=deep
```

---

## Related Commands

- `/agileflow:ideate:history` - Query ideation history and idea status (NEW!)
- `/agileflow:multi-expert` - Deploy multiple experts for analysis
- `/agileflow:story` - Create user stories from ideas
- `/agileflow:epic` - Create epic for grouped improvements
- `/agileflow:review` - AI-powered code review
- `/agileflow:debt` - Track technical debt items
