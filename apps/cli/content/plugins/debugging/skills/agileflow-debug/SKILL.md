---
name: agileflow-debug
version: 1.0.0
category: agileflow/debugging
description: |
  Use when the user reports a bug, error, unexpected behaviour, or
  wants to understand why something isn't working. Applies the
  scientific debugging method: form a hypothesis, reproduce the
  issue, isolate the cause, verify the fix, and prevent regression.
triggers:
  keywords:
    - debug
    - not working
    - error
    - bug
    - broken
    - why is this failing
    - investigate
    - something's wrong
    - unexpected behaviour
    - exception
    - crash
    - failing test
    - stack trace
    - cannot figure out
    - help me understand why
  priority: 50
  exclude:
    - debug mode (configuration context, not debugging a bug)
    - bug report (filing a ticket, not debugging code)
provides:
  agents: []
learns:
  enabled: true
  file: _learnings/debug.yaml
  maxEntries: 50
depends:
  skills: []
  plugins: [core]
---

# AgileFlow Debug

Applies the scientific debugging method to any bug or error: reproduce → isolate → hypothesise → verify → fix → prevent regression.

## When this skill activates

- User reports something isn't working and wants help finding the cause
- User pastes an error message, stack trace, or logs and wants an explanation
- User describes unexpected behaviour ("this should return X but returns Y")
- A test is failing and the user isn't sure why
- User is stuck and wants a systematic approach to a hard bug
- User wants to know the root cause before applying a fix

## Opening discovery flow

**When invoked without enough context, ask once to gather what's needed.**

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[
  {
    "question": "What's happening?",
    "header": "Bug description",
    "multiSelect": false,
    "options": [
      {"label": "I have an error message or stack trace — I'll paste it", "description": "Share the full error and I'll analyse it, identify the root cause, and suggest a fix"},
      {"label": "Something behaves wrong — not what I expect (Recommended)", "description": "Describe what you expect vs what actually happens — I'll form hypotheses and help isolate the cause"},
      {"label": "A test is failing and I don't know why", "description": "Paste the failing test + error output and I'll trace through the failure"},
      {"label": "The bug is intermittent / flaky", "description": "Intermittent bugs are usually race conditions, timing issues, or shared state — I'll help diagnose"},
      {"label": "I know what's wrong but need help fixing it safely", "description": "Describe the root cause and I'll help you fix it without introducing new issues"}
    ]
  }
]</parameter>
</invoke>
```

## The scientific debugging method

Never guess at a fix. Always follow: **Reproduce → Isolate → Hypothesise → Test the hypothesis → Fix → Verify → Prevent regression.**

```
Reproduce
  └─ Can you make it fail consistently?
     ├─ No → Gather more data (logs, conditions)
     └─ Yes → Isolate

Isolate
  └─ What is the smallest failing case?
     └─ Binary-search the code path to find where good data goes bad

Hypothesise
  └─ Form a specific, testable hypothesis:
     "I believe X is causing Y because of Z"

Test
  └─ Prove or disprove the hypothesis without changing production code
     ├─ Disproved → form the next hypothesis
     └─ Proved → Fix

Fix
  └─ Change the minimum code needed to fix the root cause
     (not a workaround, not patching the symptom)

Verify
  └─ Confirm the original issue is gone
  └─ Confirm nothing else broke (run tests)

Prevent
  └─ Add a test that would have caught this bug
  └─ Ask: could this same class of bug exist elsewhere?
```

## Hypothesis formation

A good hypothesis is:

- **Specific**: not "something is wrong with the database" but "the query returns stale data because the Redis cache is not invalidated when a user updates their profile"
- **Testable**: you can prove or disprove it with a specific action
- **Falsifiable**: if X is the cause, then Y should be true; if Y is not true, X is not the cause

**Bad hypothesis:** "The API might be broken"
**Good hypothesis:** "The `getUser` function returns the wrong user because the session `userId` is not being updated after an email change"

Form 1–3 hypotheses in priority order. Test the most likely one first.

## Binary search debugging

When a bug is somewhere in a large code path, use binary search to find it:

1. Identify the start of the bad path (where input is definitely correct)
2. Identify the end (where output is definitely wrong)
3. Add a probe (log, assertion, breakpoint) at the midpoint
4. Is the data correct at the midpoint?
   - Yes → bug is in the second half
   - No → bug is in the first half
5. Repeat until the exact line is found

This is almost always faster than reading the code top-to-bottom trying to spot the bug.

## Error message analysis

When the user provides an error message or stack trace:

1. **Read the error type** — TypeError, NullPointerException, IndexError → tells you the category
2. **Find the first line that is in the application code** — ignore framework/library frames above it
3. **Read the message literally** — "Cannot read properties of undefined (reading 'email')" means a variable is undefined; ask what it should have been at that point
4. **Trace backward** — where was that variable set? What could make it undefined?

Common error → root cause translations:

| Error                                 | Likely root cause                                                 |
| ------------------------------------- | ----------------------------------------------------------------- |
| `Cannot read properties of undefined` | Object that should have been fetched from DB is null/undefined    |
| `ECONNREFUSED`                        | Service not running, wrong port, or firewall                      |
| `UNIQUE constraint failed`            | Duplicate insert — race condition or missing check                |
| `JWT expired`                         | Token expiry handling missing or clock skew                       |
| `TypeError: X is not a function`      | Wrong import, wrong export type, or circular dependency           |
| `Maximum call stack size exceeded`    | Infinite recursion — function calls itself directly or indirectly |
| `Promise rejected with non-Error`     | `.catch(err => ...)` where `err` is a string, not an Error object |

## Intermittent bug strategies

Flaky bugs are often:

| Category                      | Diagnosis approach                                                               |
| ----------------------------- | -------------------------------------------------------------------------------- |
| **Race condition**            | Add logging around concurrent operations; use `--runInBand` to serialise tests   |
| **Timer / clock dependency**  | Check if code depends on `Date.now()` or `setTimeout` — use fake timers in tests |
| **Shared mutable state**      | Check for module-level singletons, global variables, or test state leaking       |
| **External service**          | Add retry logging; confirm the external service is stable                        |
| **Order dependency in tests** | Run tests in reverse or random order to find the dependency                      |

## Logging strategy

When the root cause isn't obvious from reading the code:

1. **Log at the entry point** — log the inputs to the function where you think the bug is
2. **Log at the decision point** — log the value of the condition in every important `if` statement
3. **Log at the exit point** — log what the function returns
4. **Compare** — where does the actual data diverge from what you expected?

**Good log message:**

```
[getUser] id=42, cache_hit=false, db_result=null (user does not exist)
```

**Bad log message:**

```
error occurred
```

## Fix strategy

After identifying the root cause:

1. **Fix the root cause** — not a workaround (removing the symptom without fixing the cause creates a new bug later)
2. **Fix the minimum code** — a large fix for a small bug often introduces new bugs
3. **Preserve the contract** — if fixing a function, don't change its inputs/outputs unless necessary
4. **Update tests** — if a test failed, update it to reflect correct behaviour; if no test caught the bug, add one

## Self-improving learnings

`_learnings/debug.yaml` records:

- Recurring bug patterns in this codebase
- Common root causes for this project's tech stack
- False leads to avoid (previous hypotheses that turned out to be wrong)
- Areas of the codebase that are frequently buggy

## References

| File                                 | When to load                                                                         |
| ------------------------------------ | ------------------------------------------------------------------------------------ |
| `references/debugging-strategies.md` | Choosing the right debugging strategy for the error type and environment             |
| `references/common-patterns.md`      | Common bug patterns by category — race conditions, null handling, async errors, etc. |

## Workflows

| File                         | When to follow                                                                 |
| ---------------------------- | ------------------------------------------------------------------------------ |
| `workflows/debug-issue.md`   | Systematic debugging flow from "something's wrong" to root cause and fix       |
| `workflows/reproduce-bug.md` | Creating a minimal reproduction case for a hard-to-isolate or intermittent bug |
