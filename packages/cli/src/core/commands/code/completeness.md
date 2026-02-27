---
description: Multi-agent analysis for forgotten features, dead handlers, stub code, and incomplete implementations
argument-hint: "[file|directory] [DEPTH=quick|deep] [FOCUS=handlers|routes|api|stubs|state|imports|conditional|all]"
compact_context:
  priority: high
  preserve_rules:
    - "ACTIVE COMMAND: /agileflow:code:completeness - Multi-agent forgotten features analysis"
    - "CRITICAL: Deploy analyzers IN PARALLEL in ONE message with multiple Task calls"
    - "CRITICAL: Wait for all results before running consensus (use TaskOutput with block=true)"
    - "CRITICAL: Severity scale: BROKEN > INCOMPLETE > PLACEHOLDER > DORMANT"
    - "CRITICAL: Confidence scoring: CONFIRMED (2+ agree), LIKELY (1 with evidence), INVESTIGATE (1 weak)"
    - "MUST parse arguments: TARGET (file/dir), DEPTH (quick/deep), FOCUS (handlers|routes|api|stubs|state|imports|conditional|all)"
    - "Pass consensus all analyzer outputs, let it synthesize the final report"
  state_fields:
    - target_path
    - depth
    - focus_areas
    - analyzers_deployed
    - findings_collected
---

# /agileflow:code:completeness

Deploy multiple specialized completeness analyzers in parallel to find forgotten features, dead handlers, stub code, and incomplete implementations, then synthesize results through consensus voting into a prioritized Completeness Audit Report.

---

## Quick Reference

```
/agileflow:code:completeness app/                                    # Analyze app directory (quick, core 5 analyzers)
/agileflow:code:completeness . DEPTH=deep                            # Deep analysis - all 7 analyzers
/agileflow:code:completeness src/ FOCUS=handlers,routes               # Focus on specific areas
/agileflow:code:completeness . DEPTH=deep FOCUS=all                   # Comprehensive full audit
/agileflow:code:completeness components/ FOCUS=stubs,state            # Check stubs and unused state
```

---

## How It Works

```
┌─────────────────────────────────────────────────────────────┐
│              /agileflow:code:completeness                    │
│                                                              │
│  1. Parse arguments (target, depth, focus)                   │
│  2. Deploy analyzers IN PARALLEL                             │
│  3. Collect all findings                                     │
│  4. Run consensus coordinator to validate & prioritize       │
│  5. Generate actionable Completeness Audit Report            │
└─────────────────────────────────────────────────────────────┘

   ┌──────────┐ ┌────────┐ ┌─────┐ ┌───────┐ ┌───────┐
   │ Handlers │ │ Routes │ │ API │ │ Stubs │ │ State │
   └────┬─────┘ └───┬────┘ └──┬──┘ └───┬───┘ └───┬───┘
        │           │         │        │         │
   ┌────┴───┐ ┌─────┴──────┐                      (deep only)
   │Imports │ │Conditional │
   └────┬───┘ └─────┬──────┘
        │           │
        └─────┬─────┘
              ▼
   ┌──────────────────────┐
   │ Consensus Coordinator │
   │ (validates, votes,   │
   │  generates report)   │
   └──────────────────────┘
```

---

## Arguments

| Argument | Values | Default | Description |
|----------|--------|---------|-------------|
| TARGET | file/directory | `.` | What to analyze |
| DEPTH | quick, deep | quick | quick = core 5 analyzers, deep = all 7 |
| FOCUS | handlers,routes,api,stubs,state,imports,conditional,all | all | Which analyzers to deploy |

---

## Severity Scale (Production Readiness)

| Severity | Definition | Example |
|----------|------------|---------|
| **BROKEN** | Visibly broken in production - user encounters crash or non-functional element | Empty onClick handler, API call to non-existent endpoint |
| **INCOMPLETE** | Feature exists but silently does nothing or loses data | Form submits but handler is noop, state set but never read |
| **PLACEHOLDER** | Development stub shipped to production | `TODO: implement`, `throw new Error('Not implemented')`, hardcoded mock data |
| **DORMANT** | Unused code that should be alive or removed | Dead export, hardcoded false feature flag, commented-out feature |

---

## Step-by-Step Process

### STEP 1: Parse Arguments

```
TARGET = first argument or current directory
DEPTH = quick (default) or deep
FOCUS = all (default) or comma-separated list
```

**Analyzer Selection**:

| Condition | Analyzers Deployed |
|-----------|-------------------|
| `DEPTH=quick` + `FOCUS=all` | handlers, routes, api, stubs, state (core 5) |
| `DEPTH=deep` + `FOCUS=all` | All 7 analyzers |
| `FOCUS=handlers` | completeness-analyzer-handlers only |
| `FOCUS=routes` | completeness-analyzer-routes only |
| `FOCUS=api` | completeness-analyzer-api only |
| `FOCUS=stubs` | completeness-analyzer-stubs only |
| `FOCUS=state` | completeness-analyzer-state only |
| `FOCUS=imports` | completeness-analyzer-imports only |
| `FOCUS=conditional` | completeness-analyzer-conditional only |
| `FOCUS=handlers,routes` | Comma-separated: deploy specified analyzers |

**DEPTH behavior**:
- `quick` (default): Deploy core 5 analyzers. Focus on BROKEN/INCOMPLETE issues only.
- `deep`: Deploy all 7 analyzers. Include PLACEHOLDER/DORMANT findings.

### STEP 2: Deploy Analyzers in Parallel

**CRITICAL**: Deploy ALL selected analyzers in a SINGLE message with multiple Task calls.

**Prompt template for each analyzer**:

```
TASK: Analyze the following code for {COMPLETENESS_DOMAIN} issues.

TARGET: {file_path or directory}
DEPTH: {quick|deep}

{For quick depth}: Focus on BROKEN and INCOMPLETE severity issues only. Skip PLACEHOLDER and DORMANT.
{For deep depth}: Be comprehensive. Include PLACEHOLDER and DORMANT findings.

Read the target files and apply your analysis methodology.

OUTPUT your findings in your standard format (FINDING-N with location, severity, confidence, code, explanation, remediation).

If no issues found, output: "No {COMPLETENESS_DOMAIN} issues found in {TARGET}"
```

**Example deployment (DEPTH=quick, FOCUS=all - deploys core 5)**:

```xml
<invoke name="Task">
<parameter name="description">Dead handler analysis</parameter>
<parameter name="prompt">TASK: Analyze the following code for DEAD/EMPTY EVENT HANDLER issues.
TARGET: src/
DEPTH: quick
Focus on BROKEN and INCOMPLETE severity issues only...
...</parameter>
<parameter name="subagent_type">completeness-analyzer-handlers</parameter>
<parameter name="run_in_background">true</parameter>
</invoke>

<invoke name="Task">
<parameter name="description">Dead route analysis</parameter>
<parameter name="prompt">TASK: Analyze the following code for DEAD NAVIGATION AND BROKEN LINK issues.
TARGET: src/
DEPTH: quick
...</parameter>
<parameter name="subagent_type">completeness-analyzer-routes</parameter>
<parameter name="run_in_background">true</parameter>
</invoke>

<invoke name="Task">
<parameter name="description">API endpoint mismatch analysis</parameter>
<parameter name="prompt">TASK: Analyze the following code for FRONTEND-BACKEND ENDPOINT MISMATCH issues.
TARGET: src/
DEPTH: quick
...</parameter>
<parameter name="subagent_type">completeness-analyzer-api</parameter>
<parameter name="run_in_background">true</parameter>
</invoke>

<invoke name="Task">
<parameter name="description">Stub code analysis</parameter>
<parameter name="prompt">TASK: Analyze the following code for PLACEHOLDER/STUB CODE issues.
TARGET: src/
DEPTH: quick
...</parameter>
<parameter name="subagent_type">completeness-analyzer-stubs</parameter>
<parameter name="run_in_background">true</parameter>
</invoke>

<invoke name="Task">
<parameter name="description">Unused state analysis</parameter>
<parameter name="prompt">TASK: Analyze the following code for UNUSED STATE DECLARATION issues.
TARGET: src/
DEPTH: quick
...</parameter>
<parameter name="subagent_type">completeness-analyzer-state</parameter>
<parameter name="run_in_background">true</parameter>
</invoke>
```

**For DEPTH=deep, also deploy**:

```xml
<invoke name="Task">
<parameter name="description">Dead import/export analysis</parameter>
<parameter name="prompt">TASK: Analyze the following code for DEAD EXPORT AND MODULE issues...
...</parameter>
<parameter name="subagent_type">completeness-analyzer-imports</parameter>
<parameter name="run_in_background">true</parameter>
</invoke>

<invoke name="Task">
<parameter name="description">Dead feature branch analysis</parameter>
<parameter name="prompt">TASK: Analyze the following code for DEAD FEATURE BRANCH issues...
...</parameter>
<parameter name="subagent_type">completeness-analyzer-conditional</parameter>
<parameter name="run_in_background">true</parameter>
</invoke>
```

### STEP 3: Collect Results

Wait for all analyzers to complete:

```xml
<invoke name="TaskOutput">
<parameter name="task_id">{handlers_id}</parameter>
<parameter name="block">true</parameter>
</invoke>

<invoke name="TaskOutput">
<parameter name="task_id">{routes_id}</parameter>
<parameter name="block">true</parameter>
</invoke>

<!-- ... collect all results ... -->
```

### STEP 4: Run Consensus Coordinator

Pass all analyzer outputs to the consensus coordinator:

```xml
<invoke name="Task">
<parameter name="description">Completeness audit consensus</parameter>
<parameter name="prompt">You are the Completeness Consensus Coordinator.

TARGET: {target_path}
DEPTH: {depth}

## Analyzer Outputs

### Handlers Analyzer Results:
{handlers_output}

### Routes Analyzer Results:
{routes_output}

### API Analyzer Results:
{api_output}

### Stubs Analyzer Results:
{stubs_output}

### State Analyzer Results:
{state_output}

{If deep depth, also include:}
### Imports Analyzer Results:
{imports_output}

### Conditional Analyzer Results:
{conditional_output}

---

Follow your consensus process:
1. Detect project type from the codebase
2. Parse all findings into normalized structure
3. Group related findings by location
4. Vote on confidence (CONFIRMED if 2+ agree, LIKELY if 1 with evidence)
5. Apply intentionality filtering (exclude test stubs, abstract methods, generated code)
6. Classify user impact (user-blocking, user-confusing, data-silent, developer-only)
7. Filter by project type relevance
8. Generate the final Completeness Audit Report
9. Save report to docs/08-project/completeness-audits/completeness-audit-{YYYYMMDD}.md
</parameter>
<parameter name="subagent_type">completeness-consensus</parameter>
</invoke>
```

### STEP 5: Present Results

After consensus completes, show the report summary and offer next steps:

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "Completeness audit complete: [N] findings ([broken] Broken, [incomplete] Incomplete). [files_count] files analyzed. Project type: [type].",
  "header": "Next steps",
  "multiSelect": false,
  "options": [
    {"label": "Fix [broken] Broken issues now (Recommended)", "description": "[top_issue_summary] - most impactful for users"},
    {"label": "Create stories for all findings", "description": "Track [broken] broken + [incomplete] incomplete items in backlog"},
    {"label": "Re-run with DEPTH=deep on [target]", "description": "Current was quick (5 analyzers) - deep adds Imports, Conditional"},
    {"label": "Save report and done", "description": "Report saved to docs/08-project/completeness-audits/"}
  ]
}]</parameter>
</invoke>
```

---

## Example Output

```
🔍 Completeness Audit: app/
══════════════════════════════════════════════════════════════

Deploying 5 completeness analyzers (quick mode)...
✓ Handlers Analyzer
✓ Routes Analyzer
✓ API Analyzer
✓ Stubs Analyzer
✓ State Analyzer

Running consensus...
✓ Consensus complete
✓ Project type detected: Full-stack Web Application

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 COMPLETENESS SUMMARY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

| Severity    | Count | User Impact            |
|-------------|-------|------------------------|
| Broken      | 2     | user-blocking          |
| Incomplete  | 3     | user-confusing         |
| Placeholder | 1     | data-silent            |
| Dormant     | 4     | developer-only         |

Total: 10 findings (3 intentional exclusions)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🚨 SHIP BLOCKERS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. Empty onClick handler on "Delete Account" button [CONFIRMED by Handlers, Stubs]
   Location: components/Settings.tsx:45
   Severity: BROKEN | Impact: user-blocking
   Remediation: Complete → implement delete API call | Remove → hide button

2. fetch('/api/payments') but no /api/payments route exists [CONFIRMED by API, Routes]
   Location: pages/checkout.tsx:28 → app/api/ (missing)
   Severity: BROKEN | Impact: user-blocking
   Remediation: Complete → create API route | Remove → disable checkout

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️  FIX BEFORE RELEASE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

3. Form onSubmit only sets loading state, never calls API [LIKELY - Handlers]
   Location: components/ContactForm.tsx:22
   Severity: INCOMPLETE | Impact: user-confusing

4. useState for `searchResults` - setter called but value never rendered [LIKELY - State]
   Location: pages/search.tsx:8
   Severity: INCOMPLETE | Impact: data-silent

5. "TODO: implement pagination" in production component [LIKELY - Stubs]
   Location: components/UserList.tsx:67
   Severity: PLACEHOLDER | Impact: user-confusing

[Full report saved to docs/08-project/completeness-audits/completeness-audit-20260220.md]
```

---

<!-- COMPACT_SUMMARY_START -->
## Compact Summary

**Command**: `/agileflow:code:completeness` - Multi-agent forgotten features analysis with consensus

**Quick Usage**:
```
/agileflow:code:completeness app/                           # Quick scan (core 5 analyzers)
/agileflow:code:completeness . DEPTH=deep                   # All 7 analyzers
/agileflow:code:completeness src/ FOCUS=handlers,routes      # Specific areas
```

**What It Does**: Deploy completeness analyzers in parallel -> Each finds different incomplete implementation classes -> Consensus coordinator validates, filters by project type, classifies user impact -> Actionable Completeness Audit Report

**Analyzers (Core 5 - quick mode)**:
- `completeness-analyzer-handlers` - Dead/empty event handlers, console-only handlers
- `completeness-analyzer-routes` - Dead navigation, broken links, missing pages
- `completeness-analyzer-api` - Frontend-backend endpoint mismatches, orphaned endpoints
- `completeness-analyzer-stubs` - TODO/FIXME, empty function bodies, mock data in production
- `completeness-analyzer-state` - Unused useState/useReducer, orphaned context providers

**Analyzers (Deep mode adds 2 more)**:
- `completeness-analyzer-imports` - Dead exports, unused dependencies, orphaned modules
- `completeness-analyzer-conditional` - Dead feature flags, unreachable code, commented-out features

**Severity Scale** (production readiness):
- BROKEN: Visibly broken in production (crash or non-functional element)
- INCOMPLETE: Feature silently does nothing or loses data
- PLACEHOLDER: Dev stub shipped to production
- DORMANT: Unused code that should be alive or removed

**Confidence Levels**:
- CONFIRMED: 2+ analyzers agree -> High priority
- LIKELY: 1 analyzer with evidence -> Medium priority
- INVESTIGATE: 1 analyzer, weak evidence -> Low priority

**Output**: `docs/08-project/completeness-audits/completeness-audit-{YYYYMMDD}.md`
<!-- COMPACT_SUMMARY_END -->

---

## Boundary Rules (No Overlap)

- **vs code:security**: No vulnerabilities, XSS, injection, auth bypass - those are security domain
- **vs code:logic**: No race conditions, type bugs, edge cases, control flow - those are logic domain
- **vs code:performance**: No slow queries, memory leaks, bundle size - those are performance domain
- **vs code:test**: No missing tests, weak assertions, test patterns - those are test domain
- **vs code:legal**: No compliance, GDPR, licensing - those are legal domain
- **This audit asks**: Are features fully wired up? Do buttons work? Is stub code shipped?

---

## Integration with Babysit

When `/agileflow:babysit` completes implementation, it can run a quick completeness audit:

```
📍 Implementation complete. Running quick completeness audit...

🔍 Completeness Audit Results:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ No broken features found
⚠️  1 INCOMPLETE issue detected:
   - components/Settings.tsx:45 - onClick handler only logs, no API call
     Severity: INCOMPLETE | Confidence: CONFIRMED (Handlers + Stubs)

Fix before merging? [Y/n]
```

---

## Related Commands

- `/agileflow:code:security` - Security vulnerability analysis (similar architecture)
- `/agileflow:code:logic` - Logic bug analysis (similar architecture)
- `/agileflow:code:performance` - Performance bottleneck analysis (similar architecture)
- `/agileflow:code:test` - Test quality analysis (similar architecture)
- `/agileflow:code:legal` - Legal compliance analysis (similar architecture)
- `/agileflow:review` - Code review (includes some completeness checks)
- `/agileflow:multi-expert` - General multi-expert analysis
