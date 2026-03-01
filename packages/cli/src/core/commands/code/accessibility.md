---
description: Multi-agent WCAG accessibility analysis with consensus voting for finding a11y barriers across semantic structure, ARIA, visual, keyboard, and forms
argument-hint: "[file|directory] [DEPTH=quick|deep|ultradeep] [FOCUS=semantic|aria|visual|keyboard|forms|all] [MODEL=haiku|sonnet|opus]"
compact_context:
  priority: high
  preserve_rules:
    - "ACTIVE COMMAND: /agileflow:code:accessibility - Multi-agent WCAG accessibility analysis"
    - "CRITICAL: Deploy analyzers IN PARALLEL in ONE message with multiple Task calls"
    - "CRITICAL: Wait for all results before running consensus (use TaskOutput with block=true)"
    - "CRITICAL: Severity scale: BLOCKER | MAJOR | MINOR | ENHANCEMENT"
    - "MUST parse arguments: TARGET (file/dir), DEPTH (quick/deep/ultradeep), FOCUS (semantic|aria|visual|keyboard|forms|all)"
    - "Pass consensus all analyzer outputs, let it synthesize the final report"
  state_fields:
    - target_path
    - depth
    - focus_areas
    - analyzers_deployed
    - findings_collected
---

# /agileflow:code:accessibility

Deploy multiple specialized WCAG accessibility analyzers in parallel to find a11y barriers, then synthesize results through consensus voting into a prioritized Accessibility Audit Report.

---

## Quick Reference

```
/agileflow:code:accessibility app/                               # Analyze app directory (quick, all 5 analyzers)
/agileflow:code:accessibility . DEPTH=deep                       # Deep analysis - comprehensive findings
/agileflow:code:accessibility src/ FOCUS=keyboard,aria            # Focus on specific areas
/agileflow:code:accessibility . DEPTH=deep FOCUS=all              # Comprehensive full audit
/agileflow:code:accessibility . DEPTH=ultradeep                   # Each analyzer in its own tmux session
/agileflow:code:accessibility components/ FOCUS=forms             # Check forms accessibility
```

---

## How It Works

```
┌─────────────────────────────────────────────────────────────┐
│                /agileflow:code:accessibility                 │
│                                                              │
│  1. Parse arguments (target, depth, focus)                   │
│  2. Deploy analyzers IN PARALLEL                             │
│  3. Collect all findings                                     │
│  4. Run consensus coordinator to validate & prioritize       │
│  5. Generate actionable Accessibility Audit Report           │
└─────────────────────────────────────────────────────────────┘

   ┌──────────┐ ┌──────┐ ┌────────┐ ┌──────────┐ ┌───────┐
   │ Semantic │ │ ARIA │ │ Visual │ │ Keyboard │ │ Forms │
   └────┬─────┘ └──┬───┘ └───┬────┘ └────┬─────┘ └───┬───┘
        │          │         │           │            │
        └──────────┴─────────┼───────────┴────────────┘
                             ▼
              ┌──────────────────────┐
              │  Consensus Coordinator│
              │  (validates, votes,  │
              │   maps to WCAG 2.2)  │
              └──────────────────────┘
```

---

## Arguments

| Argument | Values | Default | Description |
|----------|--------|---------|-------------|
| TARGET | file/directory | `.` | What to analyze |
| DEPTH | quick, deep, ultradeep | quick | quick = focus on BLOCKER/MAJOR, deep = all severities, ultradeep = separate tmux |
| FOCUS | semantic,aria,visual,keyboard,forms,all | all | Which analyzers to deploy |
| MODEL | haiku, sonnet, opus | haiku | Model for analyzer subagents |

---

## Step-by-Step Process

### STEP 1: Parse Arguments

```
TARGET = first argument or current directory
DEPTH = quick (default) or deep or ultradeep
FOCUS = all (default) or comma-separated list
```

**Analyzer Selection**:

| Condition | Analyzers Deployed |
|-----------|-------------------|
| `FOCUS=all` | All 5: semantic, aria, visual, keyboard, forms |
| `FOCUS=semantic` | a11y-analyzer-semantic only |
| `FOCUS=aria` | a11y-analyzer-aria only |
| `FOCUS=visual` | a11y-analyzer-visual only |
| `FOCUS=keyboard` | a11y-analyzer-keyboard only |
| `FOCUS=forms` | a11y-analyzer-forms only |
| `FOCUS=keyboard,forms` | Deploy specified analyzers |

**DEPTH behavior**:
- `quick` (default): Focus on BLOCKER and MAJOR issues only.
- `deep`: Include MINOR and ENHANCEMENT findings.
- `ultradeep`: Spawn each analyzer as a separate Claude Code session in tmux.

**ULTRADEEP mode** (DEPTH=ultradeep):
1. Show cost estimate: `node .agileflow/scripts/spawn-audit-sessions.js --audit=accessibility --target=TARGET --focus=FOCUS --model=MODEL --dry-run`
2. Confirm with user before launching
3. Spawn sessions: `node .agileflow/scripts/spawn-audit-sessions.js --audit=accessibility --target=TARGET --focus=FOCUS --model=MODEL`
4. Monitor sentinel files in `docs/09-agents/ultradeep/{trace_id}/` for completion
5. Collect all findings and run consensus coordinator
6. If tmux unavailable, fall back to `DEPTH=deep` with warning

### STEP 2: Deploy Analyzers in Parallel

**CRITICAL**: Deploy ALL selected analyzers in a SINGLE message with multiple Task calls.

**Prompt template for each analyzer**:

```
TASK: Analyze the following code for {A11Y_DOMAIN} accessibility issues.

TARGET: {file_path or directory}
DEPTH: {quick|deep}

{For quick depth}: Focus on BLOCKER and MAJOR severity issues only. Skip enhancements.
{For deep depth}: Be comprehensive. Include MINOR and ENHANCEMENT findings.

Read the target files and apply your analysis methodology.

OUTPUT your findings in your standard format (FINDING-N with location, severity, confidence, WCAG SC, code, explanation, remediation).

If no issues found, output: "No {A11Y_DOMAIN} accessibility issues found in {TARGET}"
```

**Deploy all 5 analyzers** using these subagent types:
- `a11y-analyzer-semantic` - Heading hierarchy, landmarks, document structure
- `a11y-analyzer-aria` - ARIA roles, states, properties, live regions
- `a11y-analyzer-visual` - Color contrast, motion, color-only info
- `a11y-analyzer-keyboard` - Focus management, tab order, keyboard access
- `a11y-analyzer-forms` - Labels, errors, autocomplete, validation

### STEP 3: Collect Results

Wait for all analyzers to complete using TaskOutput with `block=true`.

### STEP 4: Run Consensus Coordinator

Pass all analyzer outputs to the consensus coordinator:

```xml
<invoke name="Task">
<parameter name="description">Accessibility audit consensus</parameter>
<parameter name="prompt">You are the Accessibility Consensus Coordinator.

TARGET: {target_path}
DEPTH: {depth}

## Analyzer Outputs

### Semantic Analyzer Results:
{semantic_output}

### ARIA Analyzer Results:
{aria_output}

### Visual Analyzer Results:
{visual_output}

### Keyboard Analyzer Results:
{keyboard_output}

### Forms Analyzer Results:
{forms_output}

---

Follow your consensus process:
1. Detect framework and component libraries
2. Parse all findings into normalized structure
3. Group related findings by component/area
4. Vote on confidence (CONFIRMED if 2+ agree, LIKELY if 1 with evidence)
5. Filter by framework (Radix, Headless UI, etc.)
6. Map findings to WCAG 2.2 success criteria
7. Generate the final Accessibility Audit Report
8. Save report to docs/08-project/a11y-audits/a11y-audit-{YYYYMMDD}.md
</parameter>
<parameter name="subagent_type">a11y-consensus</parameter>
</invoke>
```

### STEP 5: Present Results

After consensus completes, show the report summary and offer next steps:

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "Accessibility audit complete: [N] findings ([blockers] Blockers, [major] Major). [files_count] files analyzed. WCAG Level A: [pass/fail].",
  "header": "Next steps",
  "multiSelect": false,
  "options": [
    {"label": "Fix [blockers] Blocker issues now (Recommended)", "description": "[top_issue_summary] - [WCAG SC]"},
    {"label": "Create stories for all findings", "description": "Track [blockers] blocker + [major] major priority items in backlog"},
    {"label": "Re-run with DEPTH=deep", "description": "Current was quick - deep includes MINOR and ENHANCEMENT findings"},
    {"label": "Save report and done", "description": "Report saved to docs/08-project/a11y-audits/"}
  ]
}]</parameter>
</invoke>
```

---

## Example Output

```
♿ Accessibility Audit: app/
══════════════════════════════════════════════════════════════

Deploying 5 accessibility analyzers (quick mode)...
✓ Semantic Analyzer
✓ ARIA Analyzer
✓ Visual Analyzer
✓ Keyboard Analyzer
✓ Forms Analyzer

Running consensus...
✓ Consensus complete
✓ Framework detected: Next.js + shadcn/ui (Radix-based)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ACCESSIBILITY SUMMARY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

| Severity | Count | WCAG Level |
|----------|-------|------------|
| Blocker  | 2     | A          |
| Major    | 4     | A/AA       |
| Minor    | 3     | AA         |

Total: 9 findings (3 false positives excluded - Radix handles ARIA)
WCAG 2.2 Level A: FAIL (2 blockers)
WCAG 2.2 Level AA: FAIL

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FIX IMMEDIATELY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. Modal missing focus trap [CONFIRMED by Keyboard, ARIA]
   Location: components/Modal.tsx:28
   SC 2.1.2 | Level A
   Fix: Add FocusTrap component or use Dialog from Radix

2. Form inputs without labels [CONFIRMED by Forms, Semantic]
   Location: app/settings/page.tsx:45
   SC 1.3.1, 4.1.2 | Level A
   Fix: Add Label components with htmlFor associations

[Full report saved to docs/08-project/a11y-audits/a11y-audit-20260301.md]
```

---

<!-- COMPACT_SUMMARY_START -->
## Compact Summary

**Command**: `/agileflow:code:accessibility` - Multi-agent WCAG accessibility analysis with consensus

**Quick Usage**:
```
/agileflow:code:accessibility app/                        # Quick scan (all 5 analyzers)
/agileflow:code:accessibility . DEPTH=deep                # Comprehensive analysis
/agileflow:code:accessibility components/ FOCUS=keyboard   # Specific area
```

**What It Does**: Deploy a11y analyzers in parallel -> Each checks different WCAG areas -> Consensus validates, filters by framework, maps to WCAG 2.2 -> Actionable Accessibility Audit Report

**Analyzers (all 5)**:
- `a11y-analyzer-semantic` - Headings, landmarks, semantic elements
- `a11y-analyzer-aria` - ARIA roles, states, live regions, widget patterns
- `a11y-analyzer-visual` - Contrast, motion, color-only info, focus indicators
- `a11y-analyzer-keyboard` - Focus management, tab order, keyboard-only access
- `a11y-analyzer-forms` - Labels, errors, autocomplete, validation

**Severity Levels** (impact-oriented):
- BLOCKER: No access at all (missing keyboard support, no labels)
- MAJOR: Significant barrier (skipped headings, missing landmarks)
- MINOR: Degraded experience (redundant ARIA, missing autocomplete)
- ENHANCEMENT: Best practice improvement

**Output**: `docs/08-project/a11y-audits/a11y-audit-{YYYYMMDD}.md`
<!-- COMPACT_SUMMARY_END -->

---

## Boundary Rules (No Overlap)

- **vs code:security**: No XSS, injection, auth issues - those are security domain
- **vs code:performance**: No bundle size, rendering perf - those are performance domain
- **vs code:test**: No test coverage, test quality - those are test domain
- **Focus on WCAG conformance and assistive technology access**

---

## Related Commands

- `/agileflow:code:security` - Security vulnerability analysis
- `/agileflow:code:logic` - Logic bug analysis
- `/agileflow:code:performance` - Performance bottleneck analysis
- `/agileflow:review` - Code review (includes basic a11y checks)
