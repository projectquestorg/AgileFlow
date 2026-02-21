---
description: Run agentic browser tests against a running web application using YAML test scenarios
argument-hint: "[SCENARIO=<path.yaml>] [URL=<base-url>] [STORY=<US-ID>] [RETRIES=<1-3>]"
compact_context:
  priority: high
  preserve_rules:
    - "ACTIVE COMMAND: /agileflow:browser-qa - Agentic browser testing orchestration"
    - "MUST verify Playwright is installed before running"
    - "MUST create evidence directory before test execution"
    - "80% pass rate threshold for validation"
    - "Results are informational - NEVER block CI merge"
    - "Store all evidence in .agileflow/ui-review/runs/<timestamp>/"
  state_fields:
    - scenarios_found
    - execution_results
    - evidence_path
---

# /agileflow-browser-qa

Run agentic browser tests using the Bowser four-layer pattern. Discovers YAML test specs, executes them via Playwright, captures screenshot evidence, and reports results.

<!-- COMPACT_SUMMARY_START -->
## Compact Summary
**Command**: `/agileflow:browser-qa` - Agentic browser testing
**Quick Usage**: `/agileflow:browser-qa SCENARIO=specs/login-flow.yaml URL=http://localhost:3000`
**What It Does**: Execute browser test scenarios, capture screenshots, report with pass rates
<!-- COMPACT_SUMMARY_END -->

## When to Use

- Validate user stories with real browser interaction
- Capture visual evidence for UAT sign-off
- Run exploratory tests on complex multi-step workflows
- Check accessibility in a running application
- Verify design tokens in computed styles

## Prompt

ROLE: Browser QA Orchestrator - you coordinate agentic browser testing using the Bowser four-layer pattern.

### STEP 0: Gather Context

```bash
node .agileflow/scripts/obtain-context.js browser-qa
```

### STEP 1: Verify Prerequisites

Check that Playwright is available:

```bash
npx playwright --version 2>/dev/null || echo "PLAYWRIGHT_NOT_FOUND"
```

If Playwright is not found, inform the user:

```
Playwright is required for browser-qa testing.

Install it:
  npm install --save-optional playwright
  npx playwright install chromium

Then retry: /agileflow:browser-qa
```

**STOP HERE** if Playwright is not available. Do not proceed without it.

### STEP 2: Discover Test Scenarios

If `SCENARIO` argument is provided:
- Read the specified YAML file
- Validate it has required fields: `test_id`, `name`, `steps`, `url`

If no `SCENARIO` provided:
- Search for specs: `Glob ".agileflow/ui-review/specs/**/*.yaml"`
- Also check: `Glob "docs/07-testing/agentic/**/*.yaml"`
- List found scenarios and ask user which to run (or "all")

If `STORY` argument is provided:
- Filter scenarios matching that story_id
- If none found, suggest creating a spec from the story's acceptance criteria

### STEP 3: Create Evidence Directory

```bash
mkdir -p .agileflow/ui-review/runs/$(date +%Y-%m-%d_%H-%M-%S)
```

Store the timestamp path for later use.

### STEP 4: Execute Scenarios

For each scenario, spawn a browser-qa agent:

```
Task(
  description: "Browser QA: {scenario_name}",
  prompt: "Execute browser test scenario.

SCENARIO FILE: {scenario_path}
BASE URL: {url_override_or_from_spec}
EVIDENCE DIR: {evidence_dir}/{test_id}/
MAX RETRIES: {retries_arg_or_2}

Steps:
1. Read the scenario YAML
2. Navigate to the base URL
3. Execute each step in order
4. Capture screenshots at marked steps
5. Record timing and pass/fail for each step
6. On failure: classify error, retry if attempts remain
7. Generate results.json in evidence directory
8. Return summary with pass rate

IMPORTANT:
- Use Playwright CLI commands (npx playwright screenshot, etc.)
- Capture screenshot evidence at EVERY step marked screenshot: true
- If URL is not reachable, report as infrastructure error and skip
- 80% pass rate threshold for validation",
  subagent_type: "agileflow-browser-qa",
  run_in_background: true
)
```

**CRITICAL**: If multiple scenarios, deploy ALL agents in a SINGLE message (parallel execution).

### STEP 5: Collect Results

Wait for all browser-qa agents to complete:

```
TaskOutput(task_id: "...", block: true)
```

### STEP 6: Synthesize Results

Combine all scenario results into a summary report:

```markdown
## Browser QA Summary

**Run**: {timestamp}
**Scenarios**: {total} executed
**Overall**: {passed}/{total} scenarios validated

| Scenario | Story | Pass Rate | Status | Evidence |
|----------|-------|-----------|--------|----------|
| Login Flow | US-0050 | 87% | VALIDATED | runs/2026.../AGENTIC-001/ |
| Signup Flow | US-0051 | 67% | WARNING | runs/2026.../AGENTIC-002/ |

### Evidence Directory
`.agileflow/ui-review/runs/{timestamp}/`

### Recommendations
- [scenario-specific recommendations]
```

### STEP 7: Update Status

If scenarios have `story_id` fields, update `docs/09-agents/status.json`:
- Add `agentic_test_status` field: `"validated"`, `"failed"`, or `"warning"`
- Do NOT modify existing `test_status` field (that's for Jest tests)

### STEP 8: Cleanup Old Evidence

Run retention cleanup - remove evidence older than 30 days:

```bash
find .agileflow/ui-review/runs/ -maxdepth 1 -type d -mtime +30 -exec rm -rf {} + 2>/dev/null || true
```

---

## Arguments

| Argument | Required | Description | Default |
|----------|----------|-------------|---------|
| `SCENARIO` | No | Path to YAML test spec | Auto-discover |
| `URL` | No | Base URL override | From spec file |
| `STORY` | No | Filter by story ID | All scenarios |
| `RETRIES` | No | Max retries per scenario (1-3) | 2 |

---

## Expected Output

### Success - All Scenarios Pass

```
Browser QA Complete
====================================

Run: 2026-02-16 14:30:00
Evidence: .agileflow/ui-review/runs/2026-02-16_14-30-00/

Results:
  VALIDATED  Login Flow (87% pass rate) - US-0050
  VALIDATED  Signup Flow (93% pass rate) - US-0051
  VALIDATED  Dashboard Nav (80% pass rate) - US-0052

Overall: 3/3 scenarios validated
Status: docs/09-agents/status.json updated
```

### Partial - Some Scenarios Fail

```
Browser QA Complete (with warnings)
====================================

Results:
  VALIDATED  Login Flow (87% pass rate)
  WARNING    Signup Flow (73% pass rate) - investigate
  FAILED     Checkout (50% pass rate) - potential bug

Overall: 1/3 validated, 1 warning, 1 failed
Action: Review failed scenarios in evidence directory
```

### Error - Playwright Not Found

```
Playwright not installed.

Install: npm install --save-optional playwright
         npx playwright install chromium

Then retry: /agileflow:browser-qa
```

---

## Related Commands

- `/agileflow:verify` - Run deterministic tests (Jest)
- `/agileflow:multi-expert` - Multi-expert analysis
- `/agileflow:review` - Code review
- `/agileflow:status` - Update story status
