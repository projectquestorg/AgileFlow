---
name: refactoring-safely
description: Restructure existing code (extract, rename, move, split, deduplicate, or untangle it) without changing its intended behavior, by pinning that behavior with existing or new characterization tests first, changing it in small verified steps, and stopping to report when behavior would have to change. Use when the user asks to refactor, restructure, clean up, reorganize, extract, split, deduplicate, or reduce the complexity of working code. Not for fixing bugs (diagnosing-bugs), adding features, or re-explaining something more simply (simplifying-explanations).
---

# Refactoring safely

A refactor changes structure, not behavior. The proof is the same observable behavior before and after.

## Workflow

1. **Scope it.** Restate the structural goal and its boundary: which files or modules change, and which interfaces must stay identical (exports, signatures, CLI output, HTTP responses, file formats, error types and messages that callers match on). If the goal needs a public interface to change, search the whole repository for its consumers first.
2. **Establish a green baseline.** Find the tests that exercise the code and run them before touching anything. If they already fail, stop and report it: a pre-existing failure hides any regression you introduce, and fixing it is a separate change.
3. **Pin what is not covered.** If the paths you will touch have no tests, write characterization tests first that record current observable behavior, including edge cases, error paths, and side effects and their order. Pin what the code does, even where it looks odd; note the oddity instead of changing it.
4. **Change in small steps.** One transformation at a time (extract, rename, move, inline, replace duplication with a shared helper), rerunning the relevant tests after each. When renaming or moving, also search for string references: dynamic imports, config keys, route or event names, docs.
5. **Preserve the unglamorous details:** error types and messages, ordering, when side effects happen, defaults, null and undefined handling, sync versus async, and anything logged that something else consumes.
6. **Stop if behavior must change.** If a step cannot be done without changing behavior, or you find a bug, do not fold it into the refactor. Report the behavior involved, why, and the options (keep it, or change it in a separate step), and ask before going further.
7. **Verify the contract.** Rerun the baseline tests plus your characterization tests, and the type-check, lint, or build where the project has them. Read your own diff looking for accidental behavior changes.

## Constraints

- Do not mix a refactor with bug fixes, features, dependency upgrades, or formatting sweeps of untouched code.
- Do not change existing test assertions to get green; a test that must change means behavior changed. Updating imports or names of moved internals is fine.
- Stay within the requested area; list further opportunities instead of doing them.
- Keep public interfaces stable unless the user asked to change them, and then update every consumer in the same change.

## Report

- **Structure:** one line per transformation.
- **Behavior contract:** tests run before and after with their results, and characterization tests added.
- **Not preserved or not verified:** any behavior change the user approved, pre-existing failures, bugs found, and follow-ups not done.

## Done when

The code has the requested structure, the same tests (existing plus characterization tests) pass before and after, public interfaces are unchanged or every consumer was updated at the user's request, and any behavior change, pre-existing failure, or bug found is reported instead of silently included.
