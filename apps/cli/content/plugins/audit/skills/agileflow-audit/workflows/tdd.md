# TDD Workflow — Test-Driven Development

**Triggers:** "start TDD for this story", "I want to do test-driven development", "RED GREEN REFACTOR", "write failing tests first", "help me do TDD on US-XXXX"

**Goal:** Guide the user through strict RED → GREEN → REFACTOR phases for a story, enforcing phase gates and preventing premature implementation.

## Inputs needed

| Input    | Required | How to get it                            |
| -------- | -------- | ---------------------------------------- |
| story ID | Yes      | Ask: "Which story are we doing TDD for?" |

## Steps

1. Ask for the story ID if not provided. Load the story and its acceptance criteria from `docs/09-agents/status.json`.

2. **Initialize RED phase.** Display the rules clearly:
   - RED phase: write failing tests ONLY. No implementation code.
   - Tests must describe behavior from the AC, not the implementation.
   - All tests must fail when run right now (that's the point).

3. Work with the user to write failing tests for each acceptance criterion. Suggest test names and structure based on the AC text. Do NOT write implementation code in this phase.

4. After tests are written, run the test suite. Confirm that the new tests fail. If any new test passes without implementation, the test is likely testing the wrong thing — discuss and revise.

5. Ask the user: [A] Advance to GREEN phase (tests are failing as expected), [B] Add more tests, [C] Revise a test.

6. **GREEN phase.** Rules:
   - Write the minimum code necessary to make the failing tests pass.
   - No extra features, no refactoring, no improvements — just make tests green.
   - Run tests after each small change to track progress.

7. Run tests. Confirm all previously-failing tests now pass. If not, identify which tests still fail and what the error is. Continue implementation until all tests pass.

8. Ask the user: [A] Advance to REFACTOR phase (all tests passing), [B] Fix a remaining failure first.

9. **REFACTOR phase.** Rules:
   - Clean up the code: improve names, remove duplication, simplify logic.
   - Run tests after every change to confirm they stay green.
   - Refactoring must not change behavior — only improve structure.

10. After refactoring, run the full test suite. If all tests pass, the TDD cycle is complete.

11. Present completion: tests written, tests passing, code refactored. Suggest running the story audit workflow to verify AC coverage before marking the story complete.

## Phase gates (hard constraints)

- Cannot enter GREEN without confirmed failing tests in RED.
- Cannot enter REFACTOR without all target tests passing in GREEN.
- Cannot mark complete without all tests passing after REFACTOR.

## Output

Tests written for each AC. All tests passing after GREEN. Code cleaned up after REFACTOR. Story ready for audit.

## Fallbacks

**If interactive prompts (AskUserQuestion) are unavailable:**
Present options as a numbered list in your response. Ask the user to reply with a number. Example:

```
How would you like to proceed?
1. Save and continue
2. Review before saving
3. Discard
```
