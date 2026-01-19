---
description: Audit story completion - tests + acceptance criteria verification (GSD pattern)
argument-hint: STORY=<US-ID>
compact_context:
  priority: high
  preserve_rules:
    - "STORY ID is REQUIRED - always ask if missing"
    - "Run STEP 0 context activation before any other action"
    - "Execute 4-step audit: tests, AC check, learnings, verdict"
    - "Generate clear PASS/FAIL report with visual indicators"
    - "On PASS, suggest marking story complete"
  state_fields:
    - story_id
    - audit_result
    - tests_passed
    - ac_verified
---

# Story Audit

Verify story completion through the GSD (Get Stuff Done) audit cycle: run tests, check acceptance criteria, capture learnings, and provide clear PASS/FAIL verdict.

---

## STEP 0: Gather Context

```bash
node .agileflow/scripts/obtain-context.js audit
```

This gathers git status, stories/epics, session state, and registers for PreCompact.

---

<!-- COMPACT_SUMMARY_START -->

## Compact Summary

**Role**: Story Auditor - GSD verification cycle before completion

**Critical Behavioral Rules**:
1. ALWAYS run STEP 0 activation before any other action
2. STORY ID is REQUIRED - ask user if not provided
3. Execute 4-step audit: tests, AC check, learnings, verdict
4. Generate clear PASS/FAIL report with visual indicators
5. On PASS, suggest marking story complete

**Workflow**:
1. **Parse Story**: Get story ID from argument or ask user
2. **Run Tests**: Execute test command from environment.json
3. **Check AC**: Display acceptance criteria, ask user to verify each
4. **Capture Learnings**: Prompt for insights and technical debt
5. **Verdict**: PASS if tests pass AND all AC verified, otherwise FAIL
6. **Next Steps**: Suggest marking complete (PASS) or fixing issues (FAIL)

**Audit Result Values**:
- `PASS`: Tests passing + All AC verified
- `FAIL`: Tests failing OR Any AC unverified

**Output Format Requirements**:
- Display test results with counts and duration
- Show each AC with checkbox status
- Clear PASS/FAIL verdict with blocking issues if any
- Actionable next steps

**Integration**:
- Uses: environment.json (test config), status.json (story/AC data)
- Logs to: docs/09-agents/bus/log.jsonl (learnings)
- Related: /agileflow:verify, /agileflow:story-validate, /agileflow:status

**Tool Usage Examples**:

TodoWrite:
```xml
<invoke name="TodoWrite">
<parameter name="todos">[
  {"content": "Parse story ID and load story data", "status": "in_progress", "activeForm": "Loading story"},
  {"content": "Run project tests", "status": "pending", "activeForm": "Running tests"},
  {"content": "Verify acceptance criteria with user", "status": "pending", "activeForm": "Verifying AC"},
  {"content": "Capture learnings", "status": "pending", "activeForm": "Capturing learnings"},
  {"content": "Generate audit verdict and next steps", "status": "pending", "activeForm": "Generating verdict"}
]</parameter>
</invoke>
```

AskUserQuestion (AC Verification):
```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "Verify each acceptance criterion is met for US-0129:",
  "header": "AC Check",
  "multiSelect": true,
  "options": [
    {"label": "AC1: Create audit.md", "description": "File exists in commands/"},
    {"label": "AC2: Accept story ID", "description": "Argument parsing works"},
    {"label": "AC3: Run tests", "description": "Tests execute and report"},
    {"label": "AC4: Check AC met", "description": "AC verification works"}
  ]
}]</parameter>
</invoke>
```

<!-- COMPACT_SUMMARY_END -->

---

## Prompt

ROLE: Story Auditor

INPUTS
STORY=<US-ID>   Required - story to audit

TODO LIST TRACKING
**CRITICAL**: Immediately create a todo list using TodoWrite tool:
```
1. Parse story ID and load story data
2. Run project tests
3. Verify acceptance criteria with user
4. Capture learnings
5. Generate audit verdict and next steps
```

ACTIONS

### Step 1: Parse Story ID

If STORY argument not provided, ask user:
```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "Which story would you like to audit?",
  "header": "Story ID",
  "multiSelect": false,
  "options": [
    {"label": "Enter story ID", "description": "e.g., US-0129"}
  ]
}]</parameter>
</invoke>
```

Load story from `docs/09-agents/status.json`:
- Verify story exists
- Get title, epic, acceptance_criteria array
- Check current status (should be in_progress or ready)

### Step 2: Run Tests

Read `docs/00-meta/environment.json` for test configuration:
- `test_command` - Command to run (e.g., "npm test")
- `test_timeout_ms` - Maximum wait time

Execute tests:
```bash
# Run with timeout, capture exit code
timeout 120s npm test 2>&1
EXIT_CODE=$?
```

Parse results:
- Exit code 0 = PASSING
- Exit code non-zero = FAILING
- Extract pass/fail counts if possible (Jest/Pytest patterns)

### Step 3: Verify Acceptance Criteria

Display each AC from status.json and ask user to verify:

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "Verify each acceptance criterion is met for {{STORY_ID}}:",
  "header": "AC Check",
  "multiSelect": true,
  "options": [
    {"label": "{{AC_1}}", "description": "Mark if complete"},
    {"label": "{{AC_2}}", "description": "Mark if complete"},
    {"label": "{{AC_3}}", "description": "Mark if complete"}
  ]
}]</parameter>
</invoke>
```

Calculate verification rate:
- Count selected (verified) vs total AC
- 100% = All verified
- <100% = Partial

### Step 4: Capture Learnings

Prompt user for insights:

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "What did you learn during this story? (Select or enter custom)",
  "header": "Learnings",
  "multiSelect": false,
  "options": [
    {"label": "Enter learnings", "description": "Share insights, patterns discovered, or improvements"},
    {"label": "No learnings to capture", "description": "Skip this step"}
  ]
}]</parameter>
</invoke>
```

If learnings provided, log to `docs/09-agents/bus/log.jsonl`:
```json
{
  "type": "audit_learnings",
  "story": "US-0129",
  "timestamp": "2026-01-19T12:00:00Z",
  "learnings": "User's learnings text here",
  "tests_passed": true,
  "ac_verified": 7,
  "ac_total": 7
}
```

### Step 5: Generate Verdict

**PASS Criteria**:
- Tests passing (exit code 0)
- All AC verified (100%)

**FAIL Criteria**:
- Tests failing (exit code non-zero)
- OR any AC unverified (<100%)

---

## Output Format

### PASS Report

```
========================================
      STORY AUDIT: US-0129
========================================

TESTS
Command: npm test
Result: PASSED (2,201 passed, 0 failed)
Duration: 45.2s

ACCEPTANCE CRITERIA
[x] Create packages/cli/src/core/commands/audit.md
[x] Accept story ID as argument
[x] Run tests and report pass/fail
[x] Check acceptance criteria met
[x] Prompt for learnings to capture
[x] Output: PASS/FAIL with recommended next action
[x] On PASS, suggest marking story complete

AC Verification: 7/7 (100%)

========================================
      AUDIT RESULT: PASS
========================================
Tests: PASSING
AC: ALL VERIFIED (7/7)

Learnings captured:
- GSD audit pattern successfully integrated

NEXT STEPS:
1. Mark story complete: /agileflow:status US-0129 STATUS=done
2. Review epic progress: /agileflow:epic EP-0022
```

### FAIL Report

```
========================================
      STORY AUDIT: US-0129
========================================

TESTS
Command: npm test
Result: FAILED (40 passed, 3 failed)
Duration: 12.8s

ACCEPTANCE CRITERIA
[x] Create packages/cli/src/core/commands/audit.md
[x] Accept story ID as argument
[x] Run tests and report pass/fail
[ ] Check acceptance criteria met
[ ] Prompt for learnings to capture
[x] Output: PASS/FAIL with recommended next action
[x] On PASS, suggest marking story complete

AC Verification: 5/7 (71%)

========================================
      AUDIT RESULT: FAIL
========================================
Tests: FAILING (3 failed)
AC: PARTIAL (5/7)

BLOCKING ISSUES:
- Test: audit.test.ts:42 - Expected PASS verdict
- AC: "Check acceptance criteria met" - Not implemented
- AC: "Prompt for learnings" - Missing

NEXT STEPS:
1. Fix failing tests
2. Complete missing AC items
3. Re-run: /agileflow:audit US-0129
```

---

## Post-Audit Actions

### If PASS

Offer to mark story complete:

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "Story US-0129 passed audit! What would you like to do?",
  "header": "Next Steps",
  "multiSelect": false,
  "options": [
    {"label": "Mark complete (Recommended)", "description": "Update status to done"},
    {"label": "View epic progress", "description": "Check EP-0022 status"},
    {"label": "Done", "description": "Exit without changes"}
  ]
}]</parameter>
</invoke>
```

If "Mark complete":
1. Update status.json: `status: "done"`, add `completed_at` timestamp
2. Add audit summary to story
3. Log completion to bus/log.jsonl

### If FAIL

Offer to help fix issues:

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "Story US-0129 failed audit. What would you like to do?",
  "header": "Fix Issues",
  "multiSelect": false,
  "options": [
    {"label": "Fix failing tests", "description": "I'll help debug test failures"},
    {"label": "Review AC requirements", "description": "Check what's missing"},
    {"label": "Done", "description": "Exit and fix later"}
  ]
}]</parameter>
</invoke>
```

---

## Error Handling

### Story Not Found
```
Story US-9999 not found in status.json

Available in_progress stories:
- US-0129: Create /agileflow:audit command
- US-0130: Add phase handoff summaries

Run: /agileflow:audit US-0129
```

### No Test Configuration
```
No test configuration found.

Run /agileflow:session:init to configure:
- test_command
- test_timeout_ms

Or manually create docs/00-meta/environment.json
```

### Story Already Complete
```
Story US-0129 is already marked as 'done'

To re-audit, first change status:
/agileflow:status US-0129 STATUS=in_progress

Then run audit again.
```

---

## Related Commands

- `/agileflow:verify` - Run tests only (no AC check)
- `/agileflow:story-validate` - Validate story structure before development
- `/agileflow:status` - Update story status
- `/agileflow:epic` - View epic progress
