---
description: Advance TDD phase (RED→GREEN→REFACTOR→COMPLETE)
argument-hint: "[<US-ID>]"
compact_context:
  priority: high
  preserve_rules:
    - "TDD phase gate: RED→GREEN requires test_status=failing"
    - "TDD phase gate: GREEN→REFACTOR requires test_status=passing"
    - "TDD phase gate: REFACTOR→COMPLETE requires test_status=passing"
    - "Always run /agileflow:verify before attempting phase advance"
    - "Show clear phase transition banner with new phase instructions"
  state_fields:
    - tdd_phase
    - test_status
---

# /agileflow:tdd-next - Advance TDD Phase

Advance to the next TDD phase with gate validation.

---

## STEP 0: Gather Context

```bash
node .agileflow/scripts/obtain-context.js tdd-next
```

---

<!-- COMPACT_SUMMARY_START -->

## Compact Summary

**Role**: TDD Phase Gate Controller

**Critical Rules**:
1. Read current `tdd_phase` and `test_status` from status.json
2. Validate transition conditions (failing/passing tests)
3. Block advancement if conditions not met
4. Update `tdd_phase` in status.json on success
5. Display new phase instructions

**Transitions**:
- RED → GREEN: `test_status` must be `"failing"`
- GREEN → REFACTOR: `test_status` must be `"passing"`
- REFACTOR → RED (new cycle): `test_status` must be `"passing"`
- REFACTOR → COMPLETE: `test_status` must be `"passing"`

<!-- COMPACT_SUMMARY_END -->

## Prompt

ROLE: TDD Phase Gate Controller

INPUTS
STORY=<US-ID>   Optional - defaults to current in_progress story with active tdd_phase

ACTIONS
1) Load story and current TDD phase from status.json
2) Determine target phase based on current phase
3) Validate gate conditions (test_status)
4) If gate passes: advance phase, show new instructions
5) If gate fails: show blocking message with remedy

---

## Usage

```
/agileflow:tdd-next           # Advance current TDD story
/agileflow:tdd-next US-0042   # Advance specific story
```

## Workflow

### 1. Find Active TDD Story

Read `docs/09-agents/status.json`. Find the story:
- If STORY specified, use that
- Otherwise, find the story with an active `tdd_phase` (not complete/cancelled)
- If multiple active, ask user to specify

### 2. Determine Target Phase

Based on current phase, determine what to advance to:

| Current | Default Next | Alternative |
|---------|-------------|-------------|
| RED | GREEN | cancel |
| GREEN | REFACTOR | cancel |
| REFACTOR | COMPLETE | RED (new cycle), cancel |

For REFACTOR, ask the user:
```json
[
  {"label": "Complete TDD (Recommended)", "description": "All tests pass, code is clean - ready for review"},
  {"label": "Start new RED→GREEN cycle", "description": "More features to add with TDD discipline"},
  {"label": "Cancel TDD", "description": "Exit TDD workflow, keep changes"}
]
```

### 3. Validate Gate Conditions

Check `test_status` in the story against transition requirements:

**RED → GREEN** (needs `test_status: "failing"`):
```
Current: 🔴 RED phase
Target:  🟢 GREEN phase
Gate:    test_status must be "failing"
Status:  test_status = "failing" ✅

Advancing to GREEN phase...
```

**Gate BLOCKED example:**
```
Current: 🔴 RED phase
Target:  🟢 GREEN phase
Gate:    test_status must be "failing"
Status:  test_status = "passing" ❌

🚫 Cannot advance: Tests must FAIL before moving to GREEN.

This means either:
  1. You haven't written tests yet (write failing tests first)
  2. Your tests pass because they don't test real behavior
  3. The implementation already exists

Action: Write tests that verify behavior not yet implemented.
Then run /agileflow:verify to confirm they fail.
```

**No test_status at all:**
```
🚫 Cannot advance: No test results found.

Run /agileflow:verify first to execute tests and record status.
Then try /agileflow:tdd-next again.
```

### 4. Advance Phase

On success, update status.json:
```json
{
  "tdd_phase": "green",
  "tdd_last_transition": "2026-02-25T..."
}
```

### 5. Display New Phase Banner

```
🟢 TDD GREEN PHASE - US-0042: [Story Title]
══════════════════════════════════════════

RED → GREEN transition complete! ✅

Write MINIMAL code to make tests pass. Rules:
  • Write the simplest implementation that passes tests
  • Do NOT refactor yet - ugly code is fine
  • Do NOT add features beyond what tests require
  • Do NOT modify test files (except removing .skip())
  • Run tests frequently

Next steps:
  1. Implement code to pass the failing tests
  2. Run /agileflow:verify to confirm tests PASS
  3. Run /agileflow:tdd-next to advance to REFACTOR
```

### 6. AskUserQuestion

After showing the transition result:

**Successful advance to GREEN:**
```json
[
  {"label": "Start implementing to pass tests (Recommended)", "description": "Write minimal code - tests define the requirements"},
  {"label": "Review the failing tests first", "description": "Read test files to understand requirements"},
  {"label": "Cancel TDD mode", "description": "Exit TDD workflow, keep test files"}
]
```

**Successful advance to REFACTOR:**
```json
[
  {"label": "Start refactoring (Recommended)", "description": "Tests pass - clean up the code while keeping them green"},
  {"label": "Run logic audit on implementation", "description": "Check for edge cases before refactoring"},
  {"label": "Skip refactor, complete TDD", "description": "Code is clean enough - finish TDD cycle"}
]
```

**Successful COMPLETE:**
```json
[
  {"label": "Run code review (Recommended)", "description": "TDD complete - review before committing"},
  {"label": "Commit changes", "description": "All tests pass, TDD cycle done"},
  {"label": "Start new TDD cycle", "description": "More features to implement for this story"}
]
```

**Gate blocked:**
```json
[
  {"label": "Run /agileflow:verify (Recommended)", "description": "Execute tests to update test_status"},
  {"label": "Review test files", "description": "Check if tests are correctly written"},
  {"label": "Cancel TDD mode", "description": "Exit TDD workflow"}
]
```

## Error Handling

### No Active TDD Story
```
❌ No active TDD workflow found.

Start TDD with: /agileflow:tdd US-0042
```

### Multiple Active TDD Stories
```
⚠️ Multiple active TDD stories found:
  🔴 US-0042: Add auth middleware (RED phase)
  🟢 US-0043: User settings API (GREEN phase)

Specify which story: /agileflow:tdd-next US-0042
```

---

## Related Commands

- `/agileflow:tdd` - Start TDD workflow
- `/agileflow:verify` - Run tests and update test_status
- `/agileflow:babysit` - Main implementation workflow
