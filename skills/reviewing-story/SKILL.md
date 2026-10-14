---
name: reviewing-story
description: Judge whether an AgileFlow Work story was actually delivered by checking its implementation against each acceptance criterion and the Definition of Done with evidence, then recommending or applying the right status. Use when the user asks whether a specific story is done or complete, asks to review a story's implementation, or asks to close or accept a story. Not for a general review of a diff or PR for defects that is not about a story's criteria (reviewing-changes), or for implementing or continuing the story (working-story).
---

# Reviewing a story

The question is "did the code deliver the story?", not only "is this code clean?". Every acceptance criterion needs its own evidence, recorded in the story, or an explicit "not verified".

## Workflow

1. **Read the story** (`agileflow work show <id> --body`, or the file in `<root>/03-stories/`; `work.root` in `agileflow.yaml`, default `docs/agile`). `work show` also reports each criterion as verified, stale, or not verified from the story's recorded evidence.
2. **Read its epic and relevant decisions**, and the Definition of Done in `00-product/product.md`.
3. **Inspect the implementation:** the diff for the story (branch, PR, or recent commits) and the code it touches, including paths the diff did not change but the criteria depend on.
4. **Map each acceptance criterion to concrete evidence** you obtained in this review:
   - **test:** a focused test that exercises the criterion, which you ran and saw pass (test name and file);
   - **inspection:** the implementing code at `file:line`, when the behavior is plain from the code;
   - **pr:** the pull request URL, for criteria about review or merging;
   - **manual:** a check you performed yourself, described in one line.

   A checked box, a "checked, no evidence" criterion, stale evidence (a file it covers changed since), or "the suite passes" is not evidence. Re-verify those.
5. **Identify missing behavior and regressions:** criteria with no implementation, partial implementations, broken constraints, and behavior the change broke. Run focused verification where useful; do not run everything by default.
6. **Record the evidence** for every criterion you verified: `agileflow work evidence <id> --criterion <n> --kind test|inspection|pr|manual --ref <test name, file:line, or PR URL> [--note "<one line>"] [--file <path>]`. Pass `--file` for the implementation files, so the evidence goes stale when they change. Without the CLI, write the evidence block yourself as described in `references/evidence.md`. A criterion you could not verify gets no evidence: report it as "not verified" with the reason.
7. **Update the checkboxes:** check (`- [x]`) only criteria with evidence from this review; uncheck a checked criterion that is not met or has no evidence. Recording evidence never checks boxes for you.
8. **Recommend or apply the correct status.** A story with any unmet, stale, or not-verified criterion is not done: keep it `in-review`, or move it back to `in-progress` when work is missing. Mark `done` (`agileflow work status <id> done`, or edit only the `status:` line) only when every criterion is verified and the Definition of Done is met; if the user only asked for a review, recommend instead of applying.

## Report format

```
Acceptance Criteria
VERIFIED      Google appears on login.     (test: login.test.js "shows providers", passed)
NOT VERIFIED  Existing email collision path is handled.   (src/auth/link.js:42 creates a duplicate user)
Story is not done.
```

Then the recommended or applied status, and what is needed to close the story.

## Constraints

- Never mark a story done because the code looks reasonable, the boxes are checked, or the tests pass in general; every criterion needs its own evidence.
- Do not fix the code while reviewing unless the user asks; report what is missing.
- Do not rewrite the story's criteria to match what was built, and do not edit other stories' evidence.

## Done when

Every acceptance criterion has a verdict backed by recorded evidence or an explicit "not verified", the checkboxes reflect only verified criteria, and the story's status is recommended or applied consistently with those verdicts and the Definition of Done.
