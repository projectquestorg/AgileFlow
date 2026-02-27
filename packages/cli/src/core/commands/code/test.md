---
description: Multi-agent test quality analysis with consensus voting for finding test suite weaknesses
argument-hint: "[file|directory] [DEPTH=quick|deep] [FOCUS=coverage|fragility|mocking|assertions|structure|integration|maintenance|patterns|all]"
compact_context:
  priority: high
  preserve_rules:
    - "ACTIVE COMMAND: /agileflow:code:test - Multi-agent test quality analysis"
    - "CRITICAL: Deploy analyzers IN PARALLEL in ONE message with multiple Task calls"
    - "CRITICAL: Wait for all results before running consensus (use TaskOutput with block=true)"
    - "CRITICAL: Confidence scoring: CONFIRMED (2+ agree), LIKELY (1 with evidence), INVESTIGATE (1 weak)"
    - "MUST parse arguments: TARGET (file/dir), DEPTH (quick/deep), FOCUS (coverage|fragility|mocking|assertions|structure|integration|maintenance|patterns|all)"
    - "Pass consensus all analyzer outputs, let it synthesize the final report"
  state_fields:
    - target_path
    - depth
    - focus_areas
    - analyzers_deployed
    - findings_collected
---

# /agileflow:code:test

Deploy multiple specialized test quality analyzers in parallel to find weaknesses in the test suite, then synthesize results through consensus voting into a prioritized Test Quality Audit Report.

---

## Quick Reference

```
/agileflow:code:test app/                                # Analyze app tests (quick, core 5 analyzers)
/agileflow:code:test . DEPTH=deep                        # Deep analysis - all 8 analyzers
/agileflow:code:test src/ FOCUS=coverage,mocking          # Focus on specific areas
/agileflow:code:test . DEPTH=deep FOCUS=all               # Comprehensive full audit
/agileflow:code:test __tests__/ FOCUS=fragility            # Check test fragility specifically
```

---

## How It Works

```
+-------------------------------------------------------------+
|                    /agileflow:code:test                      |
|                                                               |
|  1. Parse arguments (target, depth, focus)                    |
|  2. Deploy analyzers IN PARALLEL                              |
|  3. Collect all findings                                      |
|  4. Run consensus coordinator to validate & prioritize        |
|  5. Generate actionable Test Quality Audit Report             |
+-------------------------------------------------------------+

   +----------+ +----------+ +---------+ +-----------+ +-----------+
   | Coverage | | Fragility| | Mocking | | Assertions| | Structure |
   +----+-----+ +----+-----+ +----+----+ +-----+-----+ +-----+----+
        |            |            |            |              |
   +----+-------+ +--+----------+ +---+------+          (deep only)
   | Integration| | Maintenance | | Patterns |
   +-----+------+ +------+------+ +----+-----+
         |               |             |
         +---------------+-------------+
                         v
              +----------------------+
              | Consensus Coordinator|
              | (validates, votes,   |
              |  generates report)   |
              +----------------------+
```

---

## Arguments

| Argument | Values | Default | Description |
|----------|--------|---------|-------------|
| TARGET | file/directory | `.` | What to analyze |
| DEPTH | quick, deep | quick | quick = core 5 analyzers, deep = all 8 |
| FOCUS | coverage,fragility,mocking,assertions,structure,integration,maintenance,patterns,all | all | Which analyzers to deploy |

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
| `DEPTH=quick` + `FOCUS=all` | coverage, fragility, mocking, assertions, structure (core 5) |
| `DEPTH=deep` + `FOCUS=all` | All 8 analyzers |
| `FOCUS=coverage` | test-analyzer-coverage only |
| `FOCUS=fragility` | test-analyzer-fragility only |
| `FOCUS=mocking` | test-analyzer-mocking only |
| `FOCUS=assertions` | test-analyzer-assertions only |
| `FOCUS=structure` | test-analyzer-structure only |
| `FOCUS=integration` | test-analyzer-integration only |
| `FOCUS=maintenance` | test-analyzer-maintenance only |
| `FOCUS=patterns` | test-analyzer-patterns only |
| `FOCUS=coverage,mocking` | Comma-separated: deploy specified analyzers |

**DEPTH behavior**:
- `quick` (default): Deploy core 5 analyzers. Focus on CRITICAL/HIGH issues only.
- `deep`: Deploy all 8 analyzers. Include MEDIUM/LOW findings.

### STEP 2: Deploy Analyzers in Parallel

**CRITICAL**: Deploy ALL selected analyzers in a SINGLE message with multiple Task calls.

**Prompt template for each analyzer**:

```
TASK: Analyze the following test code for {TEST_QUALITY_DOMAIN} issues.

TARGET: {file_path or directory}
DEPTH: {quick|deep}

{For quick depth}: Focus on CRITICAL and HIGH severity issues only. Skip minor style issues.
{For deep depth}: Be comprehensive. Include MEDIUM and LOW severity findings.

Read the target files (both test files and source files they test) and apply your analysis methodology.

OUTPUT your findings in your standard format (FINDING-N with location, severity, confidence, code, explanation, remediation).

If no issues found, output: "No {TEST_QUALITY_DOMAIN} issues found in {TARGET}"
```

**Example deployment (DEPTH=quick, FOCUS=all - deploys core 5)**:

```xml
<invoke name="Task">
<parameter name="description">Test coverage analysis</parameter>
<parameter name="prompt">TASK: Analyze the following code for TEST COVERAGE gaps.
TARGET: src/
DEPTH: quick
Focus on CRITICAL and HIGH severity issues only...
...</parameter>
<parameter name="subagent_type">test-analyzer-coverage</parameter>
<parameter name="run_in_background">true</parameter>
</invoke>

<invoke name="Task">
<parameter name="description">Test fragility analysis</parameter>
<parameter name="prompt">TASK: Analyze the following tests for FRAGILITY issues.
TARGET: src/
DEPTH: quick
...</parameter>
<parameter name="subagent_type">test-analyzer-fragility</parameter>
<parameter name="run_in_background">true</parameter>
</invoke>

<invoke name="Task">
<parameter name="description">Mock quality analysis</parameter>
<parameter name="prompt">TASK: Analyze the following tests for MOCKING issues.
TARGET: src/
DEPTH: quick
...</parameter>
<parameter name="subagent_type">test-analyzer-mocking</parameter>
<parameter name="run_in_background">true</parameter>
</invoke>

<invoke name="Task">
<parameter name="description">Assertion quality analysis</parameter>
<parameter name="prompt">TASK: Analyze the following tests for ASSERTION QUALITY issues.
TARGET: src/
DEPTH: quick
...</parameter>
<parameter name="subagent_type">test-analyzer-assertions</parameter>
<parameter name="run_in_background">true</parameter>
</invoke>

<invoke name="Task">
<parameter name="description">Test structure analysis</parameter>
<parameter name="prompt">TASK: Analyze the following tests for STRUCTURE issues.
TARGET: src/
DEPTH: quick
...</parameter>
<parameter name="subagent_type">test-analyzer-structure</parameter>
<parameter name="run_in_background">true</parameter>
</invoke>
```

**For DEPTH=deep, also deploy**:

```xml
<invoke name="Task">
<parameter name="description">Integration test analysis</parameter>
<parameter name="prompt">TASK: Analyze the following code for INTEGRATION TEST gaps...
...</parameter>
<parameter name="subagent_type">test-analyzer-integration</parameter>
<parameter name="run_in_background">true</parameter>
</invoke>

<invoke name="Task">
<parameter name="description">Test maintenance analysis</parameter>
<parameter name="prompt">TASK: Analyze the following tests for MAINTENANCE issues...
...</parameter>
<parameter name="subagent_type">test-analyzer-maintenance</parameter>
<parameter name="run_in_background">true</parameter>
</invoke>

<invoke name="Task">
<parameter name="description">Test anti-pattern analysis</parameter>
<parameter name="prompt">TASK: Analyze the following tests for ANTI-PATTERNS...
...</parameter>
<parameter name="subagent_type">test-analyzer-patterns</parameter>
<parameter name="run_in_background">true</parameter>
</invoke>
```

### STEP 3: Collect Results

Wait for all analyzers to complete:

```xml
<invoke name="TaskOutput">
<parameter name="task_id">{coverage_id}</parameter>
<parameter name="block">true</parameter>
</invoke>

<invoke name="TaskOutput">
<parameter name="task_id">{fragility_id}</parameter>
<parameter name="block">true</parameter>
</invoke>

<!-- ... collect all results ... -->
```

### STEP 4: Run Consensus Coordinator

Pass all analyzer outputs to the consensus coordinator:

```xml
<invoke name="Task">
<parameter name="description">Test audit consensus</parameter>
<parameter name="prompt">You are the Test Quality Consensus Coordinator.

TARGET: {target_path}
DEPTH: {depth}

## Analyzer Outputs

### Coverage Analyzer Results:
{coverage_output}

### Fragility Analyzer Results:
{fragility_output}

### Mocking Analyzer Results:
{mocking_output}

### Assertions Analyzer Results:
{assertions_output}

### Structure Analyzer Results:
{structure_output}

{If deep depth, also include:}
### Integration Test Analyzer Results:
{integration_output}

### Maintenance Analyzer Results:
{maintenance_output}

### Patterns Analyzer Results:
{patterns_output}

---

Follow your consensus process:
1. Detect project type from the codebase
2. Parse all findings into normalized structure
3. Group related findings by test file
4. Vote on confidence (CONFIRMED if 2+ agree, LIKELY if 1 with evidence)
5. Filter by project type relevance
6. Assess false confidence risk for each finding
7. Generate the final Test Quality Audit Report
8. Save report to docs/08-project/test-audits/test-audit-{YYYYMMDD}.md
</parameter>
<parameter name="subagent_type">test-consensus</parameter>
</invoke>
```

### STEP 5: Present Results

After consensus completes, show the report summary and offer next steps:

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "Test audit complete: [N] findings ([critical] Critical, [high] High). [test_count] test files analyzed. Project type: [type].",
  "header": "Next steps",
  "multiSelect": false,
  "options": [
    {"label": "Fix [critical] Critical issues now (Recommended)", "description": "[top_issue_summary]"},
    {"label": "Create stories for all findings", "description": "Track [critical] critical + [high] high priority items in backlog"},
    {"label": "Re-run with DEPTH=deep on [target]", "description": "Current was quick (5 analyzers) - deep adds Integration, Maintenance, Patterns"},
    {"label": "Save report and done", "description": "Report saved to docs/08-project/test-audits/"}
  ]
}]</parameter>
</invoke>
```

---

## Example Output

```
Test Quality Audit: src/
====================================================================

Deploying 5 test quality analyzers (quick mode)...
* Coverage Analyzer
* Fragility Analyzer
* Mocking Analyzer
* Assertions Analyzer
* Structure Analyzer

Running consensus...
* Consensus complete
* Project type detected: Full-stack Web Application

--------------------------------------------
TEST QUALITY SUMMARY
--------------------------------------------

| Severity | Count | Category |
|----------|-------|----------|
| Critical | 2     | False Confidence, Missing Coverage |
| High     | 3     | Over-Mocking, Weak Assertions |
| Medium   | 2     | Fragile Tests, Structure |
| Low      | 1     | Naming |

Total: 8 findings (1 false positive excluded)

--------------------------------------------
FIX IMMEDIATELY (False Confidence Risk)
--------------------------------------------

1. Payment test mocks entire payment service — never calls real code [CONFIRMED by Mocking, Assertions]
   Location: __tests__/payment.test.ts:28
   Risk: Tests pass but payment flow is completely untested
   Fix: Test real payment service with test API keys, mock only external HTTP

2. No tests for error handling in auth middleware [CONFIRMED by Coverage, Assertions]
   Location: middleware/auth.ts (0 test coverage on catch blocks)
   Risk: Auth errors may crash the app — no test verifies graceful handling
   Fix: Add tests for expired token, invalid token, missing token scenarios

--------------------------------------------
FIX THIS SPRINT
--------------------------------------------

3. 15 tests use setTimeout assertions — timing-dependent [LIKELY - Fragility]
4. Snapshot files > 500 lines each — rubber stamp reviews [LIKELY - Assertions]
5. Mock not restored between tests — leaks into next test [LIKELY - Mocking]

[Full report saved to docs/08-project/test-audits/test-audit-20260220.md]
```

---

<!-- COMPACT_SUMMARY_START -->
## Compact Summary

**Command**: `/agileflow:code:test` - Multi-agent test quality analysis with consensus

**Quick Usage**:
```
/agileflow:code:test app/                        # Quick scan (core 5 analyzers)
/agileflow:code:test . DEPTH=deep                # All 8 analyzers
/agileflow:code:test src/ FOCUS=coverage,mocking  # Specific areas
```

**What It Does**: Deploy test quality analyzers in parallel -> Each finds different test weakness classes -> Consensus coordinator validates, filters by project type, assesses false confidence risk -> Actionable Test Quality Audit Report

**Analyzers (Core 5 - quick mode)**:
- `test-analyzer-coverage` - Untested critical paths, missing error path tests, low branch coverage
- `test-analyzer-fragility` - Timing-dependent tests, order-dependent tests, environment-dependent tests
- `test-analyzer-mocking` - Over-mocking, mock leakage, testing mocks instead of code
- `test-analyzer-assertions` - Weak assertions, missing negative tests, snapshot overuse
- `test-analyzer-structure` - Missing describe/it nesting, unclear names, code duplication

**Analyzers (Deep mode adds 3 more)**:
- `test-analyzer-integration` - Missing API tests, no E2E coverage, missing contract tests
- `test-analyzer-maintenance` - Dead tests, outdated assertions, tests passing for wrong reasons
- `test-analyzer-patterns` - Anti-patterns: testing privates, deep mock chains, God test objects

**Severity Levels** (test quality-oriented):
- CRITICAL: False confidence — tests pass but code is broken
- HIGH: Missing coverage on critical path
- MEDIUM: Test quality issue
- LOW: Improvement opportunity

**Confidence Levels**:
- CONFIRMED: 2+ analyzers agree -> High priority
- LIKELY: 1 analyzer with evidence -> Medium priority
- INVESTIGATE: 1 analyzer, weak evidence -> Low priority

**Output**: `docs/08-project/test-audits/test-audit-{YYYYMMDD}.md`
<!-- COMPACT_SUMMARY_END -->

---

## Boundary Rules (No Overlap)

- **vs code:logic**: No logic bugs in application code — only test quality
- **vs qa agent**: The `qa.md` agent is a team member for story work. This is an on-demand test analysis tool

---

## Integration with Babysit

When `/agileflow:babysit` completes implementation, it can run a quick test audit:

```
Implementation complete. Running quick test audit...

Test Quality Audit Results:
===========================
No critical test quality issues found
1 HIGH issue detected:
   - No tests for error handling in new payment endpoint
     Confidence: CONFIRMED (Coverage + Assertions analyzers)

Add error handling tests before merging? [Y/n]
```

---

## Related Commands

- `/agileflow:code:logic` - Logic bug analysis (similar architecture)
- `/agileflow:code:security` - Security vulnerability analysis (similar architecture)
- `/agileflow:code:performance` - Performance bottleneck analysis (similar architecture)
- `/agileflow:code:legal` - Legal compliance analysis (similar architecture)
- `/agileflow:verify` - Run tests
