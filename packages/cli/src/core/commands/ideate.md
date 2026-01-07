---
description: Generate categorized improvement ideas using multi-expert analysis
argument-hint: [SCOPE=all|security|perf|code|ux] [DEPTH=quick|deep] [OUTPUT=report|stories|both]
compact_context:
  priority: high
  preserve_rules:
    - "ACTIVE COMMAND: /agileflow:ideate - Ideation orchestrator with multi-expert analysis"
    - "CRITICAL: Deploy experts IN PARALLEL in ONE message with multiple Task calls"
    - "CRITICAL: Wait for all results before synthesis (use TaskOutput with block=true)"
    - "CRITICAL: Confidence scoring: HIGH (2+ experts agree) | MEDIUM (1 expert with evidence) | LOW (vague, exclude)"
    - "MUST parse arguments: SCOPE (all/security/perf/code/ux) | DEPTH (quick/deep) | OUTPUT (report/stories/both)"
    - "MUST categorize by domain: Security, Performance, Code Quality, UX, Testing, API/Architecture"
    - "MUST estimate effort for each idea: High/Medium/Low impact"
    - "Optional: Generate stories for HIGH-confidence items (if OUTPUT=stories or both)"
  state_fields:
    - scope
    - depth
    - output_mode
    - selected_experts
    - ideas_generated
---

# /agileflow:ideate

Deploy multiple domain experts in parallel to generate categorized improvement suggestions for your codebase. Inspired by AutoClaude's ideation feature.

---

## STEP 0: Gather Context

```bash
node .agileflow/scripts/obtain-context.js ideate
```

---

<!-- COMPACT_SUMMARY_START -->
## Compact Summary

**Command**: `/agileflow:ideate` - Generate improvement ideas via multi-expert analysis

**Quick Usage**:
```
/agileflow:ideate SCOPE=all DEPTH=quick OUTPUT=report
```

**What It Does**: Deploy 4-6 domain experts → Each generates 3-5 ideas → Synthesize with confidence scoring → Categorized report

**Arguments**:
- `SCOPE=all|security|perf|code|ux` (default: all)
- `DEPTH=quick|deep` (default: quick)
- `OUTPUT=report|stories|both` (default: report)

### Tool Usage Examples

**Task** (deploy expert in parallel):
```xml
<invoke name="Task">
<parameter name="description">Security ideation analysis</parameter>
<parameter name="prompt">Generate 3-5 specific improvement ideas for this codebase from a SECURITY perspective...</parameter>
<parameter name="subagent_type">agileflow-security</parameter>
<parameter name="run_in_background">true</parameter>
</invoke>
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
<parameter name="file_path">/path/to/docs/08-project/ideation-YYYYMMDD.md</parameter>
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
**Confidence**: High (2+ experts agree), Medium (1 expert with evidence)
**Output**: `docs/08-project/ideation-<YYYYMMDD>.md` | Optional stories
<!-- COMPACT_SUMMARY_END -->

---

## How It Works

```
┌─────────────────────────────────────────────────────────────┐
│                    USER: /agileflow:ideate                  │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│              IDEATION ORCHESTRATOR                          │
│  1. Parse SCOPE to determine which experts                  │
│  2. Deploy 4-6 experts IN PARALLEL                          │
│  3. Each expert generates 3-5 improvement ideas             │
│  4. Collect and synthesize with confidence scoring          │
│  5. Generate categorized report                             │
└─────────────────────────────────────────────────────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        ▼                   ▼                   ▼
┌───────────┐       ┌───────────┐       ┌───────────┐
│  Security │       │Performance│       │  Refactor │
│  Expert   │       │  Expert   │       │  Expert   │
│           │       │           │       │           │
│ 3-5 ideas │       │ 3-5 ideas │       │ 3-5 ideas │
└───────────┘       └───────────┘       └───────────┘
        │                   │                   │
        └───────────────────┼───────────────────┘
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                   SYNTHESIS ENGINE                          │
│  • Find overlapping ideas (HIGH CONFIDENCE)                 │
│  • Flag unique insights with evidence (MEDIUM)              │
│  • Discard vague suggestions (excluded)                     │
│  • Categorize by domain                                     │
│  • Estimate effort for each idea                            │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                   IDEATION REPORT                           │
│  📊 Total Ideas: X (High: Y, Medium: Z)                     │
│  🎯 High-Confidence Improvements (agreed by 2+ experts)     │
│  💡 Medium-Confidence Opportunities (single expert)         │
│  📋 Suggested Stories (if OUTPUT=stories)                   │
└─────────────────────────────────────────────────────────────┘
```

---

## Prompt

ROLE: Ideation Orchestrator

You coordinate multiple domain experts to generate improvement suggestions for the codebase, then synthesize their findings into a prioritized, actionable report.

### STEP 1: PARSE ARGUMENTS

Parse the input arguments:

**SCOPE** (which experts to deploy):
| SCOPE | Experts |
|-------|---------|
| `all` (default) | security, performance, refactor, ui, testing, api (6 experts) |
| `security` | security, api, testing (3 experts) |
| `perf` | performance, database, api (3 experts) |
| `code` | refactor, testing, api (3 experts) |
| `ux` | ui, accessibility, api (3 experts) |

**DEPTH**:
- `quick` (default): Each expert generates 3 ideas, focuses on high-impact only
- `deep`: Each expert generates 5 ideas, includes lower-priority items

**OUTPUT**:
- `report` (default): Generate ideation report only
- `stories`: Generate stories for high-confidence items
- `both`: Report + stories

### STEP 2: DEPLOY EXPERTS IN PARALLEL

**CRITICAL**: Deploy ALL experts in a SINGLE message with multiple Task tool calls.

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

**Example deployment for SCOPE=all**:

```xml
<invoke name="Task">
<parameter name="description">Security ideation</parameter>
<parameter name="prompt">[prompt with domain=security]</parameter>
<parameter name="subagent_type">agileflow-security</parameter>
<parameter name="run_in_background">true</parameter>
</invoke>

<invoke name="Task">
<parameter name="description">Performance ideation</parameter>
<parameter name="prompt">[prompt with domain=performance]</parameter>
<parameter name="subagent_type">agileflow-performance</parameter>
<parameter name="run_in_background">true</parameter>
</invoke>

<invoke name="Task">
<parameter name="description">Code quality ideation</parameter>
<parameter name="prompt">[prompt with domain=refactor/code quality]</parameter>
<parameter name="subagent_type">agileflow-refactor</parameter>
<parameter name="run_in_background">true</parameter>
</invoke>

<invoke name="Task">
<parameter name="description">UX ideation</parameter>
<parameter name="prompt">[prompt with domain=ui/ux]</parameter>
<parameter name="subagent_type">agileflow-ui</parameter>
<parameter name="run_in_background">true</parameter>
</invoke>

<invoke name="Task">
<parameter name="description">Testing ideation</parameter>
<parameter name="prompt">[prompt with domain=testing]</parameter>
<parameter name="subagent_type">agileflow-testing</parameter>
<parameter name="run_in_background">true</parameter>
</invoke>

<invoke name="Task">
<parameter name="description">API/Architecture ideation</parameter>
<parameter name="prompt">[prompt with domain=api/architecture]</parameter>
<parameter name="subagent_type">agileflow-api</parameter>
<parameter name="run_in_background">true</parameter>
</invoke>
```

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

| Confidence | Criteria | Action |
|------------|----------|--------|
| **HIGH** | 2+ experts suggest similar idea | Include prominently, recommend immediate action |
| **MEDIUM** | 1 expert with specific evidence (file paths, metrics) | Include as opportunity |
| **LOW** | 1 expert, vague/no evidence | Exclude from report |

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

### STEP 5: GENERATE OUTPUT

**Report Format**:

```markdown
# Ideation Report

**Generated**: {YYYY-MM-DD}
**Scope**: {scope}
**Depth**: {quick|deep}
**Experts Consulted**: {list of experts}
**Total Ideas**: {X} (High-Confidence: {Y}, Medium-Confidence: {Z})

---

## 🎯 High-Confidence Improvements
*Agreed by multiple experts - prioritize these*

### 1. {Title}
**Category**: {category} | **Impact**: High | **Effort**: {estimate}
**Experts**: {expert1}, {expert2}
**Files**: `{path1}`, `{path2}`
**Why**: {reason}
**Approach**: {brief approach}

### 2. {Title}
...

---

## 💡 Medium-Confidence Opportunities
*Single expert with evidence - worth exploring*

### {N}. {Title}
**Category**: {category} | **Impact**: {level} | **Effort**: {estimate}
**Expert**: {expert}
**Files**: `{path}`
**Why**: {reason}
**Approach**: {brief approach}

---

## 📊 Summary by Category

| Category | High | Medium | Total |
|----------|------|--------|-------|
| 🔒 Security | X | Y | Z |
| ⚡ Performance | X | Y | Z |
| 🧹 Code Quality | X | Y | Z |
| ... | | | |

---

## 📋 Recommended Next Steps

1. Address high-confidence security items first
2. Schedule performance improvements for next sprint
3. Add code quality items to tech debt backlog
```

**Save report to**: `docs/08-project/ideation-{YYYYMMDD}.md`

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
  "question": "What would you like to do with these ideas?",
  "header": "Next Steps",
  "multiSelect": false,
  "options": [
    {"label": "Create stories for high-confidence items", "description": "Generate stories in docs/06-stories/"},
    {"label": "Create epic grouping all improvements", "description": "Bundle into EP-XXXX: Ideation Improvements"},
    {"label": "Run deeper analysis on specific category", "description": "Re-run with SCOPE={category} DEPTH=deep"},
    {"label": "Save report and done", "description": "Keep the report, no further action"}
  ]
}]</parameter>
</invoke>
```

---

## Example Execution

**User**: `/agileflow:ideate SCOPE=all DEPTH=quick OUTPUT=report`

**Step 1**: Parse → SCOPE=all (6 experts), DEPTH=quick (3 ideas each), OUTPUT=report

**Step 2**: Deploy 6 experts in parallel

**Step 3**: Collect results (~18 raw ideas)

**Step 4**: Synthesize:
- 4 ideas mentioned by 2+ experts → HIGH confidence
- 8 ideas with specific evidence → MEDIUM confidence
- 6 ideas too vague → excluded

**Step 5**: Generate report with 12 ideas, saved to `docs/08-project/ideation-20260106.md`

**Step 6**: Skipped (OUTPUT=report only)

**Step 7**: Present next steps via AskUserQuestion

---

## Arguments

| Argument | Values | Default | Description |
|----------|--------|---------|-------------|
| SCOPE | all, security, perf, code, ux | all | Which domains to analyze |
| DEPTH | quick, deep | quick | Number of ideas per expert (3 vs 5) |
| OUTPUT | report, stories, both | report | What to generate |

{{argument}}
