# Run Audit Workflow — Story Completion Verification

**Triggers:** "audit this story", "verify the story is done", "run the audit for US-XXXX", "check acceptance criteria", "did we pass the GSD audit", "confirm story complete"

**Goal:** Verify a story is genuinely done by running tests, checking every acceptance criterion, capturing learnings, and issuing a PASS or FAIL verdict.

## Inputs needed

| Input    | Required | How to get it                                      |
| -------- | -------- | -------------------------------------------------- |
| story ID | Yes      | Ask: "Which story should I audit? (e.g., US-0042)" |

## Steps

1. Ask for the story ID if not provided.

2. Load the story from `docs/09-agents/status.json` and confirm it exists. Read the story's acceptance criteria verbatim — never guess or infer them.

3. Run the project's test suite (use the test command from `environment.json` or package.json scripts). Capture: pass count, fail count, duration. If tests fail, list which tests failed with their error messages.

4. Display each acceptance criterion as a checkbox and ask the user to verify each one manually. Present them as: [A] All criteria verified, [B] Let me go through each one. For each criterion the user marks as unverified, note it as a blocking issue.

5. Ask the user: "Any learnings or technical debt to capture from this story?" Record their response to the session log.

6. Issue the verdict:
   - **PASS**: All tests pass AND all AC verified
   - **FAIL**: Any test failing OR any AC unverified

7. Present the result:
   - PASS: List what passed, suggest marking the story complete (update status to `done`), ask if they want to create a PR.
   - FAIL: List blocking issues (failed tests or unverified AC), suggest what to fix next.

## Output

PASS/FAIL report with test counts and AC status. On PASS, story is ready to be marked complete. On FAIL, specific blocking issues are listed with recommended next actions.

## Fallbacks

**If interactive prompts (AskUserQuestion) are unavailable:**
Present options as a numbered list in your response. Ask the user to reply with a number. Example:

```
How would you like to proceed?
1. Fix the P0 findings now
2. Review full findings first
3. Export report only
```

**If agent spawning (Task tool / multi-agent) is unavailable:**
Perform each analysis inline and sequentially instead of spawning parallel agents.
Work through the key checks for each domain yourself using the reference files in `references/`.
Consolidate findings into the same structured output format — the user gets the same result, just slower.
