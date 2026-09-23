---
name: verifying-changes
description: Verify that a code change really works by exercising the changed behavior directly (smallest meaningful proof, not the whole test suite). Use when the user asks to verify, confirm, check, test, prove, or make sure a change works or does what it should (e.g. "make sure the new limit actually works", "confirm the flag really skips uploads"), or when substantive runtime behavior changed and evidence is needed. Not for comment, formatting, or documentation-only edits.
---

# Verifying changes

Prove the requested behavior works. Prefer the smallest meaningful proof over running every test.

## When this applies

Use it when runtime behavior changed: logic, data handling, APIs, UI behavior, CLI output, config that affects execution. Skip it for comments, formatting, docs, or renames that tooling already checks; say so briefly instead.

## Workflow

1. **State the claim.** Write one or two sentences describing the behavior that should now be true, taken from the user's request, not from the implementation.
2. **Pick the smallest meaningful proof** that would fail if the claim were false. In rough order of preference:
   - an existing targeted test that exercises the changed path;
   - a new focused test when none exists and the project has a test setup for that area;
   - running the actual entry point (CLI command, HTTP request, script, UI flow) and observing the output;
   - type-check or build, only as a supplement: it proves the code compiles, not that it behaves.
3. **Run it** and read the actual output. Do not assume a pass from exit codes alone when output is available.
4. **Check the obvious neighbor.** Run the tests for the directly modified module(s) to catch immediate regressions. Widen only if the change touches shared code.
5. **Report** what ran and what it showed.

## Constraints

- A proof that would pass even if the change were reverted proves nothing. When in doubt, confirm the check exercises the changed code.
- Do not run the entire suite by default in large repositories; run it when the change is broad or the user asks.
- Do not claim something is verified that was only reasoned about. Say "not verified" and why (missing credentials, no runnable environment, external service).
- If verification fails, report the failure with its output. Do not silently start rewriting the change unless the user asked you to fix failures.
- Do not weaken or delete tests to get a pass.

## Report

- **Claim:** what should be true.
- **Evidence:** the exact command(s) run and the relevant result lines.
- **Not verified:** anything left unproven and why.

## Done when

There is direct, observed evidence (command output, test result, or observed behavior) that the requested behavior works, and any part that could not be verified is explicitly named for the user.
