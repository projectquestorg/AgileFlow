---
name: writing-tests
description: Write focused automated tests for existing behavior, bug regressions, boundaries, and failure cases in the repository's own test framework and conventions, and prove that each regression test fails against the bug it guards. Use when the user asks to write, add, or improve tests for existing code, to cover a function, module, edge case, or error path, or to add a regression test for a bug. Not for proving that one change just made works (verifying-changes), for diagnosing or fixing a bug (diagnosing-bugs), or for explaining testing concepts.
---

# Writing tests

A test is worth adding only if it would fail when the behavior it describes breaks. Coverage numbers are a side effect, not the goal.

## Workflow

1. **Learn the local conventions.** Find how tests run (package scripts, Makefile, CI config), where they live, how they are named, the assertion style, shared fixtures and helpers, and how the clock, randomness, network, and file system are faked. Read two or three neighboring tests and follow them. Do not add a test framework, assertion library, or mocking tool without asking.
2. **Decide which behaviors to pin.** From the code, its callers, its docs and comments, and the request, list what callers rely on: the main contract, boundaries (empty, zero, one, limits, off-by-one edges, rounding), invalid input and error paths, and state changes. Skip what existing tests already cover. Test through the public interface, not private helpers or implementation details.
3. **Write small, independent tests.** One behavior per test, named after the behavior, with minimal setup. Assert specific values, error types, and messages, not just "does not throw", truthiness, or a snapshot of everything. Keep them deterministic: no real clock, network, or dependence on test order.
4. **Prove each test can fail.**
   - **Regression test:** run it against the buggy code (before the fix, or with the fix temporarily reverted, for example `git stash` or `git show <fix>^:<file>`) and confirm it fails for the reason the bug describes; then run it with the fix and confirm it passes. Restore the fix afterwards.
   - **Other tests:** if a test passed on the first run, briefly break the behavior it asserts (or its expected value) and confirm it goes red, then restore it.
5. **Run** the new tests and the existing tests for the same module, and read the output.

## When the code disagrees with its intent

If a test shows the code does not do what its docs, types, callers, or the user say it should, you have found a bug, not a test to adjust:

- Do not write assertions that enshrine the wrong behavior, and do not loosen an assertion until it passes.
- Do not change production code to make the test pass. Report the bug with the failing output and ask whether to fix it now (fixing it is a separate task).
- If the intended behavior is genuinely unclear, ask, or pin the current behavior and label it as such in the test name and your report.

## Constraints

- Change only test files and test helpers. If code cannot be tested without a change (a hard-wired clock or network call), use an existing seam; otherwise propose the smallest change instead of making it.
- Do not delete, skip, or weaken existing tests.
- Do not test the language or framework, trivial getters, or behavior already covered.
- Leave no temporary sabotage behind: `git diff` must show only the intended test changes.

## Report

- **Tests added:** file and test names, each with the behavior it pins.
- **Evidence:** commands run and results, including the fail-before and pass-after output for every regression test.
- **Gaps and findings:** behaviors deliberately left untested and why, and any bug the tests exposed.

## Done when

The new tests follow the project's framework and conventions and pass, every regression test was seen to fail against the buggy behavior and pass with the fix, no assertion encodes behavior that contradicts the code's intent, and the user knows what is covered, what is not, and any bug the tests exposed.
