---
description: Run project tests and update story test status
argument-hint: [story_id] (optional)
compact_context:
  priority: critical
  preserve_rules:
    - "ALWAYS run STEP 0 context activation before any other action"
    - "Exit code is AUTHORITATIVE (0=passing, non-zero=failing) - trust over output parsing"
    - "Read environment.json for test_command and test_timeout_ms config"
    - "Update ONLY test-related fields in status.json - preserve all other fields"
    - "If no STORY specified, update ALL in_progress stories"
    - "Generate clear visual reports with ✅/❌ indicators"
    - "Best-effort output parsing (Jest/Pytest/Cargo/Go) but exit code is final authority"
  state_fields:
    - test_status (passing/failing)
    - test_results (with passed/failed counts and exit code)
    - baseline_verified
---

# Verify Project Tests

Execute project tests and update test status for stories.

---

## STEP 0: Gather Context

```bash
node .agileflow/scripts/obtain-context.js verify
```

This gathers git status, stories/epics, session state, and registers for PreCompact.

---

<!-- COMPACT_SUMMARY_START -->

## Compact Summary

**Role**: Test Verifier - Execute project tests and update story test status

**Critical Behavioral Rules**:
1. ALWAYS run STEP 0 activation before any other action
2. Exit code is authoritative - 0 = passing, non-zero = failing
3. Preserve ALL other fields in status.json - only update test-related fields
4. Update all in_progress stories if no story_id specified
5. Generate clear visual reports with ✅/❌ indicators

**Workflow**:
1. **Pre-flight**: Check docs/00-meta/environment.json exists (session harness initialized)
2. **Load Config**: Read test_command, test_timeout_ms from environment.json
3. **Execute**: Run test command with timeout, capture stdout/stderr and exit code
4. **Parse Results**: Determine test_status from exit code (passing/failing)
5. **Update status.json**: Set test_status and test_results for target stories
6. **Update session-state.json**: Record verification in current session (if exists)
7. **Report**: Display test results, duration, updated stories with visual indicators

**Test Status Values**:
- `"passing"`: Exit code 0
- `"failing"`: Exit code non-zero, timeout, or command error

**Test Results Schema**:
```json
{
  "last_run": "2025-12-06T10:30:00Z",
  "command": "npm test",
  "passed": 42,
  "failed": 0,
  "exit_code": 0,
  "output_summary": "All tests passed (42/42)"
}
```

**Output Format Requirements**:
- Success: Show ✅ PASSED, test counts, duration, updated stories
- Failure: Show ❌ FAILED, failed test details, warning about failing stories
- Timeout: Show ⏱️ TIMEOUT, suggest increasing timeout or optimizing tests
- Not Initialized: Show warning, instruct to run /agileflow:session:init

**Framework-Specific Parsing** (best effort):
- Jest/Vitest: "Tests: X passed, Y total"
- Pytest: "X passed in Ys"
- Cargo: "test result: ok. X passed; Y failed"
- Go Test: "ok" line indicates pass

**Integration**:
- Used by: /agileflow:session:resume, /agileflow:baseline
- Uses: environment.json (config), status.json (story status), session-state.json (tracking)

**Tool Usage Examples**:

TodoWrite:
```xml
<invoke name="TodoWrite">
<parameter name="content">1. Run pre-flight checks (session harness initialized)
2. Load test configuration from environment.json
3. Execute test command with timeout
4. Parse test results (exit code + output)
5. Update status.json with test_status
6. Update session-state.json (if exists)
7. Generate and display verification report</parameter>
<parameter name="status">in-progress</parameter>
</invoke>
```

<!-- COMPACT_SUMMARY_END -->

## Prompt

ROLE: Test Verifier

INPUTS
STORY=<US-ID>   Optional - verify specific story (default: all in_progress stories)

ACTIONS
1) Run pre-flight checks (session harness initialized)
2) Load test configuration from environment.json
3) Execute test command with timeout
4) Parse test results (exit code + output)
5) Update status.json with test_status for target stories
6) Update session-state.json (if exists)
7) Generate and display verification report

---

## Command Purpose

Execute project tests and update `test_status` for stories in `docs/09-agents/status.json`. This is a core component of the **Session Harness System** (introduced in v2.24.0) that ensures test verification before and after implementation work.

## Context

- Current branch: !`git branch --show-current`
- Git status: !`git status --short`
- Last commit: !`git log -1 --oneline`

## TODO LIST TRACKING

**CRITICAL**: Immediately create a todo list using TodoWrite tool to track test verification:
```
1. Run pre-flight checks (session harness initialized)
2. Load configuration from docs/00-meta/environment.json
3. Execute test command with timeout
4. Parse test results (exit code + output)
5. Update status.json with test_status for target stories
6. Update session-state.json (if exists)
7. Generate and display verification report
```

Mark each step complete as you finish it. This ensures nothing is forgotten.

## Usage

- `/agileflow:verify` - Run all tests, update all `in_progress` stories
- `/agileflow:verify US-0042` - Run tests and update specific story's test status

## Execution Flow

### 1. Pre-flight Checks

```bash
# Check if session harness is initialized
if [ ! -f "docs/00-meta/environment.json" ]; then
  echo "⚠️  Session harness not initialized"
  echo ""
  echo "Run /agileflow:session:init to set up test verification"
  exit 1
fi
```

### 2. Load Configuration

Read `docs/00-meta/environment.json` to get:
- `test_command` - Command to run tests (e.g., "npm test", "pytest")
- `test_timeout_ms` - Maximum time to wait for tests (default: 60000)
- `project_type` - Project type for result parsing hints

### 3. Execute Tests

Run the test command with timeout:

```bash
# Example for Node.js
timeout 60s npm test 2>&1 | tee /tmp/test-output.txt
EXIT_CODE=$?
```

**IMPORTANT**: Capture both stdout and stderr. Record exit code.

### 4. Parse Test Results

**Exit Code Analysis**:
- Exit code 0 = `test_status: "passing"`
- Exit code non-zero = `test_status: "failing"`
- Timeout or command not found = `test_status: "failing"`

**Output Parsing** (best effort, exit code is authoritative):

**Jest/Vitest** (Node.js):
```
Tests: 42 passed, 42 total
Snapshots: 0 total
Time: 12.345 s
```
→ Extract: `passed: 42, failed: 0`

**Pytest** (Python):
```
42 passed in 2.5s
```
→ Extract: `passed: 42, failed: 0`

**Cargo Test** (Rust):
```
test result: ok. 42 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out
```
→ Extract: `passed: 42, failed: 0`

**Go Test**:
```
ok      github.com/user/project/pkg     2.5s
```
→ Extract: Basic pass/fail only

**If parsing fails**: Use exit code only, set counts to null, include raw output summary (first 200 chars).

### 5. Update status.json

**Target Stories**:
- If specific story_id provided: Update that story only
- If no story_id: Update all stories with `status: "in_progress"`

**Fields to Update**:
```json
{
  "story_id": "US-0042",
  "test_status": "passing" | "failing",
  "test_results": {
    "last_run": "2025-12-06T10:30:00Z",
    "command": "npm test",
    "passed": 42,
    "failed": 0,
    "exit_code": 0,
    "output_summary": "All tests passed (42/42)"
  }
}
```

**CRITICAL**: Preserve all other fields in status.json. Only update test-related fields.

### 6. Update session-state.json (if exists)

Record test verification in current session:
```json
{
  "current_session": {
    "initial_test_status": "passing",
    "baseline_verified": true
  }
}
```

### 7. Generate Report

**Success Report**:
```
🧪 Test Verification Complete

Command: npm test
Duration: 12.3s
Result: ✅ PASSED

Tests: 42 passed, 0 failed, 42 total

Updated stories:
- US-0042: passing
- US-0043: passing

All in-progress stories have passing tests ✅
```

**Failure Report**:
```
🧪 Test Verification Complete

Command: npm test
Duration: 8.7s
Result: ❌ FAILED

Tests: 40 passed, 2 failed, 42 total

Failed tests:
  ❌ auth.test.ts:42
     Expected redirect to /dashboard
     Got redirect to /login

  ❌ auth.test.ts:67
     Session token not persisting
     Cookie not set after login

Updated stories:
- US-0042: failing
- US-0043: failing

⚠️  WARNING: 2 stories now have failing tests
```

**Timeout Report**:
```
🧪 Test Verification Failed

Command: npm test
Result: ⏱️  TIMEOUT (60s)

The test suite did not complete within 60 seconds.

Updated stories:
- US-0042: failing (timeout)

⚠️  Consider:
1. Increase test_timeout_ms in environment.json
2. Optimize slow tests
3. Run specific test suites instead of all tests
```

**Not Initialized Report**:
```
⚠️  Session Harness Not Initialized

The verify command requires session harness configuration.

Run /agileflow:session:init to:
1. Detect your project type and test command
2. Create environment.json configuration
3. Enable test verification for all stories

Or manually create docs/00-meta/environment.json with:
{
  "test_command": "npm test",
  "test_timeout_ms": 60000
}
```

## Error Handling

### Command Not Found
```
❌ Test Command Failed

Command: npm test
Error: npm: command not found

Please verify:
1. Dependencies installed (run init script)
2. Test command in environment.json is correct
3. PATH includes required tools

Update environment.json if needed.
```

### Invalid status.json
```
❌ Cannot Update Status

File docs/09-agents/status.json is invalid or missing.

Run /agileflow:setup to initialize AgileFlow structure.
```

### Specific Story Not Found
```
⚠️  Story US-0099 not found in status.json

Available in_progress stories:
- US-0042: Add user profile settings
- US-0043: Implement password reset

Run without story_id to verify all in_progress stories.
```

## Integration Points

### Used By
- `/agileflow:session:resume` - Runs verify as part of session startup
- `/agileflow:baseline` - Requires passing tests before creating baseline
- Development agents - Should run verify after implementation

### Uses
- `docs/00-meta/environment.json` - Test configuration
- `docs/09-agents/status.json` - Story test status
- `docs/09-agents/session-state.json` - Session tracking (optional)

## Implementation Notes

1. **Read Files First**: Always read status.json and environment.json before starting
2. **Preserve JSON Structure**: Use exact string replacement to update fields
3. **Handle Missing Fields**: If story doesn't have test_status yet, add it
4. **Concurrent Safety**: This command modifies status.json - warn if file changes during execution
5. **Exit Code Priority**: Always trust exit code over output parsing
6. **Incremental Parsing**: Start with exit code only, add framework-specific parsing later
7. **User Feedback**: Show clear, actionable output with visual indicators (✅/❌)

## Example Execution

```
User: /agileflow:verify