# Workflow: Debug Issue

**Triggers:** "debug", "not working", "error", "bug", "something's wrong", user pastes a stack trace or describes unexpected behaviour

**Goal:** Identify the root cause of a bug using the scientific method, fix it, and prevent regression.

---

## Inputs needed

| Input                            | Required  | How to get it                                                        |
| -------------------------------- | --------- | -------------------------------------------------------------------- |
| Bug description or error message | Yes       | User provides; or ask "What's happening vs what should happen?"      |
| Stack trace / error output       | Preferred | Ask user to paste the full error                                     |
| Steps to reproduce               | Preferred | Ask: "How do I make this fail consistently?"                         |
| Relevant source files            | Yes       | Read the files mentioned in the stack trace or described by the user |
| Recent changes                   | No        | Ask: "Did this start failing after a recent change?"                 |

---

## Steps

### Step 1: Understand the expected vs actual behaviour

Before looking at any code, get precise answers to:

- **What should happen?** (the expected outcome)
- **What actually happens?** (the actual outcome)
- **When did it start failing?** (helps decide if it's a regression)
- **Is it consistent or intermittent?**

If any of these are unclear, ask. A vague "it doesn't work" makes debugging take 5x longer.

### Step 2: Read and understand the error message

If there's an error or stack trace:

1. Find the first frame in application code (ignore framework frames)
2. Read the error message literally
3. Cross-reference with `references/common-patterns.md` — does this match a known pattern?

If there's no error message, ask:

- "Is there anything in the logs or browser console?"
- "Does the network request return an error status?"

### Step 3: Reproduce the bug

Before forming hypotheses, confirm you can reproduce:

- Read the steps the user described
- Trace through the code mentally with the given inputs
- Can you explain why the error occurs with what you know?

If you can reproduce it mentally, skip ahead to Step 4.

If you can't reproduce it:

- Ask for more specific steps
- Ask if the bug is environment-specific (local? staging? specific browser?)
- Suggest adding temporary logs to gather more data

### Step 4: Isolate the location

Use binary search to narrow the bug to a specific function or line:

1. Identify where the input enters the system (definitely correct)
2. Identify where the wrong output appears (definitely wrong)
3. Find the midpoint of the code path
4. Would the data be correct or wrong at the midpoint?

If the code path is short (<50 lines), read every line carefully instead.

### Step 5: Form 1–3 hypotheses

Write explicit hypotheses in the format:

> "I believe [X] is causing [Y] because [Z]"

Examples:

- "I believe the user ID is null because the session expires before the redirect completes"
- "I believe the total is wrong because the discount is applied after tax instead of before"
- "I believe the test is flaky because `Date.now()` is used without fake timers"

Rank them: most likely first.

### Step 6: Test the most likely hypothesis

Do NOT change production code to test a hypothesis. Instead:

- Add a temporary log statement to check the value at the suspected point
- Write a failing unit test that would prove the hypothesis
- Add an assertion before the suspected line

If the hypothesis is proved: go to Step 7.
If disproved: go back to Step 5 and form the next hypothesis.

### Step 7: Identify the root cause

The root cause is the deepest causal link — not the symptom.

| Symptom                   | Root cause (usually)                                |
| ------------------------- | --------------------------------------------------- |
| Null pointer at line 47   | Missing null check at the DB query 20 lines earlier |
| Wrong total               | Arithmetic applied in wrong order                   |
| Test fails intermittently | Shared state between tests (not isolated)           |
| 500 error on POST         | Unhandled exception escaping the try/catch          |

Do not fix the symptom — fix the root cause.

### Step 8: Fix

Apply the minimum change to fix the root cause:

1. Don't refactor while fixing — that's a separate step
2. Don't change function signatures unless the bug is in the contract
3. If the fix requires a structural change, note it but implement the safe minimal fix first

### Step 9: Verify

After applying the fix:

1. Confirm the original symptom is gone
2. Check for related code paths that might have the same bug
3. Run the test suite (or the specific test that was failing)

### Step 10: Prevent regression

Write a test that would have caught this bug:

```
Test name: '{specific behaviour that was broken}'
What it tests: The exact path that produced the bug
Assertions: Verify the correct output, not just that no error occurs
```

If no test is possible (e.g. a configuration bug), add a comment explaining the gotcha.

### Step 11: Offer next steps

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "Root cause found and fixed. {one-sentence summary of the bug and fix}.",
  "header": "Next step",
  "multiSelect": false,
  "options": [
    {"label": "Write the regression test (Recommended)", "description": "I'll add a test that would have caught this bug"},
    {"label": "Check if this bug exists elsewhere in the codebase", "description": "I'll search for similar patterns that could fail the same way"},
    {"label": "Explain the root cause in detail", "description": "Full explanation of why this happened and what the fix does"},
    {"label": "That's fixed — move on", "description": "No further investigation needed"}
  ]
}]</parameter>
</invoke>
```

---

## Escalation: when the standard flow isn't enough

If after 2–3 hypothesis cycles you haven't found the cause:

1. **Add comprehensive logging** — log every state change in the suspicious area and ask the user to run and paste the output
2. **Suggest a minimal reproduction** — follow `workflows/reproduce-bug.md` to create an isolated test case
3. **Check if it's an environment issue** — ask the user to verify versions, environment variables, and whether it fails consistently in all environments
4. **Ask if something recently changed** — run `git log --oneline --since="1 week ago"` to see recent commits

---

## Fallbacks

**If AskUserQuestion is unavailable:**

Present findings as numbered options:

```
Root cause identified: {summary}.

To proceed:
1. Apply the fix now — I'll write the corrected code
2. Write a regression test first, then fix
3. Show me the full explanation before changing anything
4. Check if this pattern exists elsewhere in the codebase

Reply with a number.
```
