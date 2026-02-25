---
description: Start TDD workflow with RED→GREEN→REFACTOR phases
argument-hint: "<US-ID>"
compact_context:
  priority: high
  preserve_rules:
    - "TDD WORKFLOW ACTIVE: Enforce RED→GREEN→REFACTOR phases"
    - "RED phase: Write failing tests ONLY - no implementation code"
    - "GREEN phase: Minimal code to make tests pass - no extras"
    - "REFACTOR phase: Clean up while keeping tests green"
    - "Use /agileflow:verify to confirm test status before advancing"
    - "Use /agileflow:tdd-next to advance to next phase"
    - "Phase gates are HARD - cannot skip (RED needs failing tests, GREEN needs passing)"
  state_fields:
    - tdd_phase
    - tdd_cycles
    - test_status
---

# /agileflow:tdd - Test-Driven Development Workflow

Start a TDD workflow for a story, enforcing RED→GREEN→REFACTOR phase discipline.

---

## STEP 0: Gather Context

```bash
node .agileflow/scripts/obtain-context.js tdd
```

---

<!-- COMPACT_SUMMARY_START -->

## Compact Summary

**Role**: TDD Coach - Enforce test-first development with phase gates

**Critical Rules**:
1. Start in RED phase - write failing tests first
2. Cannot advance to GREEN without failing tests (verified by /agileflow:verify)
3. Cannot advance to REFACTOR without passing tests
4. Cannot complete without passing tests after refactor
5. Track phase in status.json story entry (`tdd_phase` field)

**Phase Summary**:
- 🔴 RED: Write tests that FAIL (test what the code SHOULD do)
- 🟢 GREEN: Write MINIMAL code to make tests PASS
- 🔵 REFACTOR: Clean up while keeping tests GREEN
- ✅ COMPLETE: All tests pass, code is clean

<!-- COMPACT_SUMMARY_END -->

## Prompt

ROLE: TDD Coach

INPUTS
STORY=<US-ID>   Required - story to start TDD for

ACTIONS
1) Load story from status.json
2) Initialize TDD RED phase for the story
3) Display phase instructions and constraints
4) Guide user through test-first development

---

## Usage

```
/agileflow:tdd US-0042
```

## Workflow

### 1. Initialize

Read `docs/09-agents/status.json` and locate the story. Set:
```json
{
  "tdd_phase": "red",
  "tdd_started_at": "2026-02-25T...",
  "tdd_cycles": 1
}
```

If the story already has an active `tdd_phase` (not complete/cancelled), resume it instead.

### 2. Display Phase Banner

Show the current phase prominently:

```
🔴 TDD RED PHASE - US-0042: [Story Title]
══════════════════════════════════════════

Write FAILING tests first. Rules:
  • Write test files ONLY - no implementation code yet
  • Tests should cover the acceptance criteria
  • Tests MUST fail when run (they test code that doesn't exist)
  • Focus on the public API - what should the code DO?

Allowed files: **/*.test.*, **/*.spec.*, **/tests/**, **/fixtures/**

Next steps:
  1. Write your failing tests
  2. Run /agileflow:verify to confirm tests FAIL
  3. Run /agileflow:tdd-next to advance to GREEN
```

### 3. Phase-Specific Guidance

#### 🔴 RED Phase
- Help user identify WHAT to test based on acceptance criteria
- Suggest test file names and locations based on project conventions
- Write test code that exercises the expected API/interface
- Tests should be meaningful - not just `expect(true).toBe(false)`
- Use the project's testing framework (detect from package.json, pytest.ini, etc.)

#### 🟢 GREEN Phase (after /agileflow:tdd-next)
- Write the simplest possible implementation to pass tests
- Resist the urge to over-engineer or optimize
- If a test needs a complex solution, the test may be too broad
- Run tests frequently during implementation

#### 🔵 REFACTOR Phase (after /agileflow:tdd-next)
- Extract common patterns into helper functions
- Improve naming and readability
- Reduce duplication
- Run tests after every change - any failure means rollback

### 4. AskUserQuestion Integration

After showing the phase banner, present smart options:

**RED phase start:**
```json
[
  {"label": "Show acceptance criteria for test planning (Recommended)", "description": "Review AC to identify what tests to write"},
  {"label": "Create test file scaffold", "description": "Generate test file structure based on story requirements"},
  {"label": "Cancel TDD mode", "description": "Exit TDD and use standard implementation workflow"}
]
```

**After tests written (RED):**
```json
[
  {"label": "Run /agileflow:verify to check tests fail (Recommended)", "description": "Tests must fail before advancing to GREEN"},
  {"label": "Write more tests", "description": "Add additional test cases"},
  {"label": "Cancel TDD mode", "description": "Exit TDD workflow"}
]
```

**After verify confirms failing (RED→GREEN):**
```json
[
  {"label": "Advance to GREEN phase (Recommended)", "description": "Tests are failing - ready to write implementation"},
  {"label": "Write more failing tests first", "description": "Add more test coverage before implementing"},
  {"label": "Cancel TDD mode", "description": "Exit TDD workflow"}
]
```

## Integration Points

### Uses
- `docs/09-agents/status.json` - Story data and TDD phase tracking
- `/agileflow:verify` - Test execution and status updates
- `/agileflow:tdd-next` - Phase advancement

### Used By
- `/agileflow:babysit` - Can suggest TDD workflow for stories
- `/agileflow:babysit STRICT=true` - TDD recommended as default approach

## Error Handling

### Story Not Found
```
❌ Story US-0099 not found in status.json

Available stories:
- US-0042: Add user authentication (ready)
- US-0043: Implement settings page (in_progress)
```

### Already in TDD
```
🔴 Resuming TDD for US-0042 (RED phase, cycle 1)

You're already in TDD mode. Current phase: RED
Write failing tests, then run /agileflow:tdd-next to advance.
```

### No Test Framework Detected
```
⚠️ No test framework detected for this project.

Run /agileflow:tests first to set up testing infrastructure,
then restart TDD with /agileflow:tdd US-0042.
```

---

## Related Commands

- `/agileflow:tdd-next` - Advance TDD phase (RED→GREEN→REFACTOR→COMPLETE)
- `/agileflow:verify` - Run tests and update test_status
- `/agileflow:tests` - Set up testing infrastructure
- `/agileflow:babysit` - Main implementation workflow (can integrate TDD)
