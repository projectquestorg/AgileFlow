---
name: reviewing-changes
description: Review the actual diff of a change, branch, or pull request for correctness bugs, regressions, scope mistakes, missing behavior, and security issues where relevant, and report prioritized findings. Use when the user asks to review, check, or look over code changes, a diff, a branch, or a PR before merging. Not for explaining unfamiliar code or writing new features.
---

# Reviewing changes

Review what actually changed. Findings must be grounded in the diff and the code it touches.

## Workflow

1. **Get the real diff.** Pick the right base: uncommitted work (`git diff`, `git diff --staged`), a branch (`git diff <base>...HEAD`), or a PR (its diff via the hosting tool if available). Confirm the base with the user only if it is genuinely ambiguous.
2. **Understand the intent.** Read the PR description, commit messages, linked issue, or the user's summary. A change can be correct code and still fail its purpose.
3. **Read beyond the hunks where needed.** Open the surrounding functions and the callers of changed signatures. Many real bugs live in the lines the diff did not touch.
4. **Check, in priority order:**
   - **Correctness:** wrong logic, broken edge cases (empty, null, boundaries, error paths), incorrect async/ordering, state left inconsistent.
   - **Regressions:** behavior that callers or users relied on and that changed without intent.
   - **Missing behavior:** parts of the stated goal not implemented; tests absent for new logic that is easy to test.
   - **Scope mistakes:** unrelated edits, drive-by refactors, debug leftovers, accidental file changes (lockfiles, generated files, secrets).
   - **Security,** when the change touches input handling, auth, permissions, secrets, queries, shell commands, or file paths.
5. **Confirm before reporting.** For each suspected issue, re-read the code or run a quick check to make sure it is real. Drop anything you cannot substantiate or mark it clearly as a question.

## Constraints

- Do not run a generic checklist of every audit category. Spend attention where this diff carries risk.
- Do not pad with style nits the project's formatter or linter already handles. Mention style only when it harms clarity or breaks a local convention.
- Do not edit code unless the user asked for fixes. Reviewing and fixing are separate steps.
- Every finding needs a location (`path:line`) and a concrete failure scenario: what input or sequence breaks, and what happens.

## Report format

Findings ordered by severity:

- **Blocking:** will cause incorrect behavior, data loss, security exposure, or a clear regression.
- **Should fix:** real problems with limited impact, or missing tests for risky logic.
- **Consider:** optional improvements, kept short.

Then a one-line overall verdict (e.g. ready to merge, needs changes, needs discussion). If nothing significant was found, say so plainly rather than inventing findings.

## Done when

The full diff against the correct base has been read, every reported finding has a location and a concrete failure scenario, and the user has a severity-ordered list with an overall verdict.
