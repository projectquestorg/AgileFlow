---
description: Multi-agent code quality analysis with health scorecard — naming conventions, duplication, comment quality, plus cross-audit insights from security, logic, architecture, and test suites
argument-hint: "[file|directory] [DEPTH=quick|deep] [FOCUS=style|full|naming|duplication|comments] [MODEL=haiku|sonnet|opus]"
compact_context:
  priority: high
  preserve_rules:
    - "ACTIVE COMMAND: /agileflow:code:quality - Multi-agent code quality analysis with health scorecard"
    - "CRITICAL: Deploy analyzers IN PARALLEL in ONE message with multiple Task calls"
    - "CRITICAL: Wait for all results before running consensus (use TaskOutput with block=true)"
    - "CRITICAL: DEPTH=quick runs 3 style analyzers only; DEPTH=deep also orchestrates security, logic, architecture, test consensus coordinators"
    - "MUST parse arguments: TARGET (file/dir), DEPTH (quick/deep), FOCUS (style|full|naming|duplication|comments)"
    - "Pass consensus all analyzer outputs (and deep audit summaries), let it synthesize the unified scorecard"
    - "FOCUS=style runs only the 3 style analyzers; FOCUS=full runs style + cross-audits; FOCUS=naming|duplication|comments runs single analyzer"
  state_fields:
    - target_path
    - depth
    - focus_areas
    - analyzers_deployed
    - findings_collected
    - cross_audit_results
---

# /agileflow:code:quality

Deploy style analyzers (naming, duplication, comments) in parallel, optionally orchestrate cross-audit insights from security/logic/architecture/test suites, then synthesize all results through consensus voting into a unified Code Quality Health Scorecard.

---

## Quick Reference

```
/agileflow:code:quality src/                       # Quick style scan (3 analyzers)
/agileflow:code:quality . DEPTH=deep               # Full scorecard with cross-audits
/agileflow:code:quality lib/ FOCUS=naming           # Focus on naming only
/agileflow:code:quality . FOCUS=duplication          # Focus on DRY violations
/agileflow:code:quality src/ DEPTH=deep FOCUS=full   # Explicit full analysis
/agileflow:code:quality . MODEL=sonnet               # Use Sonnet for analyzers
```

---

## How It Works

```
┌─────────────────────────────────────────────────────────────┐
│                 /agileflow:code:quality                      │
│                                                              │
│  1. Parse arguments (target, depth, focus)                   │
│  2. Deploy style analyzers IN PARALLEL                       │
│  3. (Deep only) Delegate to cross-audit consensus agents     │
│  4. Collect all findings                                     │
│  5. Run quality-consensus to produce unified scorecard       │
└─────────────────────────────────────────────────────────────┘

      STYLE ANALYZERS (always)        CROSS-AUDITS (deep only)
   ┌────────┐ ┌─────────┐ ┌────────┐  ┌──────────┐ ┌───────┐
   │ Naming │ │ Duplic. │ │Comments│  │ Security │ │ Logic │
   └───┬────┘ └────┬────┘ └───┬────┘  └─────┬────┘ └───┬───┘
       │           │          │              │          │
       │           │          │         ┌────┴──┐ ┌────┴──┐
       │           │          │         │ Arch  │ │ Test  │
       │           │          │         └───┬───┘ └───┬───┘
       └───────────┼──────────┘             │         │
                   │         ┌──────────────┘         │
                   ▼         ▼                        ▼
            ┌──────────────────────────┐
            │  Quality Consensus       │
            │  (scores, grades,        │
            │   cross-domain insights) │
            └──────────────────────────┘
```

---

## Arguments

| Argument | Values | Default | Description |
|----------|--------|---------|-------------|
| TARGET | file/directory | `.` | What to analyze |
| DEPTH | quick, deep | quick | quick = 3 style analyzers; deep = style + 4 cross-audits |
| FOCUS | style, full, naming, duplication, comments | style (quick) / full (deep) | Which analyzers to deploy |
| MODEL | haiku, sonnet, opus | haiku | Model for analyzer subagents |

**FOCUS behavior**:

| FOCUS | DEPTH=quick | DEPTH=deep |
|-------|-------------|------------|
| `style` (default for quick) | 3 style analyzers | 3 style analyzers (no cross-audits) |
| `full` (default for deep) | Same as style | 3 style analyzers + 4 cross-audit summaries |
| `naming` | quality-analyzer-naming only | quality-analyzer-naming only |
| `duplication` | quality-analyzer-duplication only | quality-analyzer-duplication only |
| `comments` | quality-analyzer-comments only | quality-analyzer-comments only |

---

## Step-by-Step Process

### STEP 1: Parse Arguments

```
TARGET = first argument or current directory
DEPTH = quick (default) or deep
FOCUS = style (default at quick) or full (default at deep) or single analyzer
MODEL = haiku (default)
```

**Analyzer Selection**:

| Condition | Style Analyzers | Cross-Audits |
|-----------|----------------|--------------|
| `DEPTH=quick` + `FOCUS=style` | naming, duplication, comments | None |
| `DEPTH=deep` + `FOCUS=full` | naming, duplication, comments | security, logic, architecture, test |
| `DEPTH=deep` + `FOCUS=style` | naming, duplication, comments | None |
| `FOCUS=naming` | naming only | None |
| `FOCUS=duplication` | duplication only | None |
| `FOCUS=comments` | comments only | None |

---

### STEP 2: Deploy Analyzers in Parallel

**CRITICAL**: Deploy ALL selected analyzers in a SINGLE message with multiple Task calls.

**Prompt template for style analyzers**:

```
TASK: Analyze the following code for {QUALITY_DOMAIN} issues.

TARGET: {file_path or directory}
DEPTH: {quick|deep}

{For quick depth}: Focus on STRUCTURAL and DEGRADED severity issues only. Skip STYLE-level cosmetic findings.
{For deep depth}: Be comprehensive. Include SMELL and STYLE severity findings.

Read the target files and apply your analysis methodology.

OUTPUT your findings in your standard format (FINDING-N with location, severity, confidence, category, code, explanation, remediation).

If no issues found, output: "No {QUALITY_DOMAIN} issues found in {TARGET}"
```

**Example deployment (DEPTH=quick, FOCUS=style — deploys all 3)**:

```xml
<invoke name="Task">
<parameter name="description">Naming convention analysis</parameter>
<parameter name="prompt">TASK: Analyze the following code for NAMING CONVENTION issues.
TARGET: src/
DEPTH: quick
Focus on STRUCTURAL and DEGRADED severity issues only...
...</parameter>
<parameter name="subagent_type">quality-analyzer-naming</parameter>
<parameter name="run_in_background">true</parameter>
</invoke>

<invoke name="Task">
<parameter name="description">Code duplication analysis</parameter>
<parameter name="prompt">TASK: Analyze the following code for CODE DUPLICATION issues.
TARGET: src/
DEPTH: quick
...</parameter>
<parameter name="subagent_type">quality-analyzer-duplication</parameter>
<parameter name="run_in_background">true</parameter>
</invoke>

<invoke name="Task">
<parameter name="description">Comment quality analysis</parameter>
<parameter name="prompt">TASK: Analyze the following code for COMMENT QUALITY issues.
TARGET: src/
DEPTH: quick
...</parameter>
<parameter name="subagent_type">quality-analyzer-comments</parameter>
<parameter name="run_in_background">true</parameter>
</invoke>
```

**For DEPTH=deep with FOCUS=full, ALSO deploy cross-audit tasks**:

```xml
<invoke name="Task">
<parameter name="description">Security quick summary for quality scorecard</parameter>
<parameter name="prompt">You are the Security Consensus Coordinator, being asked for a QUICK SUMMARY for the Code Quality Health Scorecard.

TARGET: {target_path}

Do a lightweight security scan of the target. You have Read, Glob, Grep tools.

OUTPUT a brief summary in this exact format:
SECURITY_SCORE: {0-100}
FINDING_COUNT: {N}
TOP_ISSUES:
- {one-line summary of most critical issue}
- {one-line summary of second issue}
- {one-line summary of third issue}

Focus on CRITICAL and HIGH severity only. Be concise — this feeds into a composite scorecard, not a full audit.</parameter>
<parameter name="subagent_type">security-consensus</parameter>
<parameter name="run_in_background">true</parameter>
</invoke>

<invoke name="Task">
<parameter name="description">Logic quick summary for quality scorecard</parameter>
<parameter name="prompt">You are the Logic Consensus Coordinator, being asked for a QUICK SUMMARY for the Code Quality Health Scorecard.

TARGET: {target_path}

Do a lightweight logic analysis of the target. You have Read, Glob, Grep tools.

OUTPUT a brief summary in this exact format:
LOGIC_SCORE: {0-100}
FINDING_COUNT: {N}
TOP_ISSUES:
- {one-line summary of most critical issue}
- {one-line summary of second issue}
- {one-line summary of third issue}

Focus on CONFIRMED and LIKELY issues. Be concise.</parameter>
<parameter name="subagent_type">logic-consensus</parameter>
<parameter name="run_in_background">true</parameter>
</invoke>

<invoke name="Task">
<parameter name="description">Architecture quick summary for quality scorecard</parameter>
<parameter name="prompt">You are the Architecture Consensus Coordinator, being asked for a QUICK SUMMARY for the Code Quality Health Scorecard.

TARGET: {target_path}

Do a lightweight architecture analysis of the target. You have Read, Glob, Grep tools.

OUTPUT a brief summary in this exact format:
ARCHITECTURE_SCORE: {0-100}
FINDING_COUNT: {N}
TOP_ISSUES:
- {one-line summary of most critical issue}
- {one-line summary of second issue}
- {one-line summary of third issue}

Focus on STRUCTURAL issues. Be concise.</parameter>
<parameter name="subagent_type">arch-consensus</parameter>
<parameter name="run_in_background">true</parameter>
</invoke>

<invoke name="Task">
<parameter name="description">Test quality quick summary for quality scorecard</parameter>
<parameter name="prompt">You are the Test Consensus Coordinator, being asked for a QUICK SUMMARY for the Code Quality Health Scorecard.

TARGET: {target_path}

Do a lightweight test quality analysis of the target. You have Read, Glob, Grep tools.

OUTPUT a brief summary in this exact format:
TEST_SCORE: {0-100}
FINDING_COUNT: {N}
TOP_ISSUES:
- {one-line summary of most critical issue}
- {one-line summary of second issue}
- {one-line summary of third issue}

Focus on coverage gaps and fragility. Be concise.</parameter>
<parameter name="subagent_type">test-consensus</parameter>
<parameter name="run_in_background">true</parameter>
</invoke>
```

### STEP 3: Collect Results

Wait for all analyzers to complete:

```xml
<invoke name="TaskOutput">
<parameter name="task_id">{naming_id}</parameter>
<parameter name="block">true</parameter>
</invoke>

<invoke name="TaskOutput">
<parameter name="task_id">{duplication_id}</parameter>
<parameter name="block">true</parameter>
</invoke>

<invoke name="TaskOutput">
<parameter name="task_id">{comments_id}</parameter>
<parameter name="block">true</parameter>
</invoke>

<!-- If deep + full, also collect cross-audit results -->
<invoke name="TaskOutput">
<parameter name="task_id">{security_id}</parameter>
<parameter name="block">true</parameter>
</invoke>

<!-- ... collect all cross-audit results ... -->
```

### STEP 4: Run Consensus Coordinator

Pass all outputs to the quality consensus coordinator:

```xml
<invoke name="Task">
<parameter name="description">Quality audit consensus</parameter>
<parameter name="prompt">You are the Quality Consensus Coordinator.

TARGET: {target_path}
DEPTH: {depth}

## Style Analyzer Outputs

### Naming Analyzer Results:
{naming_output}

### Duplication Analyzer Results:
{duplication_output}

### Comment Quality Analyzer Results:
{comments_output}

{If deep + full depth, also include:}
## Cross-Audit Summaries

### Security Summary:
{security_summary}

### Logic Summary:
{logic_summary}

### Architecture Summary:
{architecture_summary}

### Test Quality Summary:
{test_summary}

---

Follow your consensus process:
1. Detect project conventions from the codebase
2. Parse all findings into normalized structure
3. Group related findings by location
4. Vote on confidence (CONFIRMED if 2+ agree, LIKELY if 1 with evidence)
5. Filter by project type relevance
6. Compute per-dimension scores and composite score
7. Generate the Code Quality Health Scorecard
8. Save report to docs/08-project/quality-audits/quality-scorecard-{YYYYMMDD}.md
</parameter>
<parameter name="subagent_type">quality-consensus</parameter>
</invoke>
```

### STEP 5: Present Results

After consensus completes, show the scorecard summary and offer next steps:

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "Quality audit complete: {score}/100 (Grade {grade}). {total_findings} findings across {dimensions} dimensions.",
  "header": "Next steps",
  "multiSelect": false,
  "options": [
    {"label": "Fix {structural_count} structural issues now (Recommended)", "description": "{top_issue_summary}"},
    {"label": "Create stories for all findings", "description": "Track {total} findings in backlog"},
    {"label": "Re-run with DEPTH=deep", "description": "Add security, logic, architecture, test cross-audits"},
    {"label": "Save report and done", "description": "Report saved to docs/08-project/quality-audits/"}
  ]
}]</parameter>
</invoke>
```

---

## Example Output

```
📊 Code Quality Health Scorecard: src/
══════════════════════════════════════════════════════════════

Deploying 3 style analyzers (quick mode)...
✓ Naming Convention Analyzer
✓ Code Duplication Analyzer
✓ Comment Quality Analyzer

Running consensus...
✓ Consensus complete
✓ Project type detected: TypeScript Node.js Library

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 CODE QUALITY SCORE: 82/100 — Grade B
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

| Dimension    | Score  | Findings | Top Issue                    |
|-------------|--------|----------|------------------------------|
| Naming      | 88/100 | 3        | Generic 'data' in 2 services |
| Duplication | 74/100 | 5        | Validation logic in 4 files  |
| Comments    | 86/100 | 4        | 15-line commented-out block  |

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔧 FIX IMMEDIATELY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. Validation logic duplicated across 4 route handlers [CONFIRMED]
   Locations: routes/users.js:28, routes/admin.js:15, routes/orders.js:22, routes/products.js:31
   Fix: Extract to shared validateInput() utility

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️  FIX THIS SPRINT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

2. Misleading function name: getUser() creates record if missing [LIKELY]
3. 15-line commented-out code block in auth-service.ts [LIKELY]
4. Stale comment references deleted validateInput function [LIKELY]

[Full report saved to docs/08-project/quality-audits/quality-scorecard-20260329.md]
```

---

<!-- COMPACT_SUMMARY_START -->
## Compact Summary

**Command**: `/agileflow:code:quality` - Code quality health scorecard with style analysis and cross-audit insights

**Quick Usage**:
```
/agileflow:code:quality src/                        # Quick (3 style analyzers)
/agileflow:code:quality . DEPTH=deep                # Full scorecard with cross-audits
/agileflow:code:quality lib/ FOCUS=naming            # Single dimension
```

**What It Does**: Deploy style analyzers in parallel -> Each checks naming, duplication, or comments -> (Deep) also get security/logic/architecture/test summaries -> Quality consensus produces unified health scorecard with composite score, grade, and cross-domain insights

**Style Analyzers (always)**:
- `quality-analyzer-naming` - Misleading names, inconsistent casing, abbreviation overuse, generic identifiers
- `quality-analyzer-duplication` - Copy-pasted code, near-duplicate functions, DRY violations
- `quality-analyzer-comments` - Commented-out code, stale comments, missing JSDoc, noise comments

**Cross-Audits (deep only)**:
- `security-consensus` - Quick security scan summary
- `logic-consensus` - Quick logic analysis summary
- `arch-consensus` - Quick architecture health summary
- `test-consensus` - Quick test quality summary

**Severity Levels** (maintainability-oriented):
- STRUCTURAL: Actively impeding development (misleading names causing bugs, duplicated business logic)
- DEGRADED: Growing maintenance burden (stale comments, config duplication)
- SMELL: Minor quality concern (generic names, noise comments)
- STYLE: Cosmetic (convention violations)

**Confidence Levels**:
- CONFIRMED: 2+ analyzers flag same area -> High priority
- LIKELY: 1 analyzer with evidence -> Medium priority
- INVESTIGATE: 1 analyzer, weak evidence -> Low priority

**Scoring**: Quick = 3 dimensions (naming 35%, duplication 35%, comments 30%). Deep = 7 dimensions (style 40%, cross-audits 60%).
**Grades**: A (90-100), B (80-89), C (70-79), D (60-69), F (<60)

**Output**: `docs/08-project/quality-audits/quality-scorecard-{YYYYMMDD}.md`
<!-- COMPACT_SUMMARY_END -->

---

## Boundary Rules (No Overlap)

- **vs code:security**: Does NOT find vulnerabilities — security cross-audit is a summary score, not a replacement
- **vs code:logic**: Does NOT find logic bugs — logic cross-audit is a summary score
- **vs code:architecture**: Does NOT measure coupling/layering — architecture cross-audit is a summary score
- **vs code:test**: Does NOT assess test quality directly — test cross-audit is a summary score
- **vs code:completeness**: Does NOT find dead handlers or stubs — focus is naming/duplication/comments only

---

## Related Commands

- `/agileflow:code:security` - Deep security vulnerability analysis
- `/agileflow:code:logic` - Deep logic bug analysis
- `/agileflow:code:architecture` - Deep architecture health analysis
- `/agileflow:code:test` - Deep test quality analysis
- `/agileflow:review` - Code review (includes some quality checks)
