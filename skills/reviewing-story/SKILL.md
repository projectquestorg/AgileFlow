---
name: reviewing-story
description: Judge whether an AgileFlow Work story was actually delivered by checking its implementation against each acceptance criterion and the Definition of Done with evidence, then recommending or applying the right status. Use when the user asks whether a specific story is done, asks to review a story's implementation, or asks to close or accept a story. Not for a general review of a diff or PR that is not tied to a story, or for implementing the story.
---

# Reviewing a story

The question is "did the code deliver the story?", not only "is this code clean?". Judge each acceptance criterion against evidence.

## Workflow

1. **Read the story** (`agileflow work show <id> --body`, or the file in `<root>/03-stories/`; `work.root` in `agileflow.yaml`, default `docs/agile`).
2. **Read its epic and relevant decisions**, and the Definition of Done in `00-product/product.md`.
3. **Inspect the implementation:** the diff for the story (branch, PR, or recent commits) and the code it touches, including paths the diff did not change but the criteria depend on.
4. **Verify each acceptance criterion** separately. For each one, find the code that implements it and evidence that it works: an existing or new focused test, a command, or direct inspection of a clear code path.
5. **Identify missing behavior and regressions:** criteria with no implementation, partial implementations, broken constraints, and behavior the change broke.
6. **Run focused verification where useful** (the relevant tests, a quick script). Do not run everything by default.
7. **Update verified criteria:** check (`- [x]`) only criteria you verified. Uncheck a criterion that is checked but not actually met. These checkbox edits are part of the review record.
8. **Recommend or apply the correct status.** A story with any unmet or unverified criterion is not done: keep it `in-review`, or move it back to `in-progress` when work is missing. Mark `done` (`agileflow work status <id> done`, or edit only the `status:` line) only when every criterion is verified and the Definition of Done is met; if the user only asked for a review, recommend instead of applying.

## Report format

```
Acceptance Criteria
PASS  Google appears on login.            (test: login.test.js "shows providers")
FAIL  Existing email collision path is not handled.   (src/auth/link.js:42 creates a duplicate user)
Story is not done.
```

Then the recommended or applied status, and what is needed to close the story.

## Constraints

- Never mark a story done because the code looks reasonable or the tests pass in general; every criterion needs its own evidence.
- Do not fix the code while reviewing unless the user asks; report what is missing.
- Do not rewrite the story's criteria to match what was built.

## Done when

Every acceptance criterion has a verdict with evidence, the checkboxes reflect only verified criteria, and the story's status is recommended or applied consistently with those verdicts.
