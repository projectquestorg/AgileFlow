# Impact Workflow — Code Change Impact Analysis

**Triggers:** "what will this change break", "impact analysis", "what tests should I run", "show me what depends on this file", "check for breaking changes", "what's affected by my changes"

**Goal:** Build a dependency graph for recently changed files, identify direct and indirect callers, detect breaking changes, and produce a risk-scored impact report with actionable test recommendations.

## Inputs needed

| Input         | Required | How to get it                                 |
| ------------- | -------- | --------------------------------------------- |
| changed files | No       | Auto-detected from `git diff` if not provided |
| base branch   | No       | Default: `main`                               |
| run tests     | No       | Default: yes if tests are found               |

## Steps

1. Detect changed files. If files are not specified, run `git diff <base> --name-only` to get the list. If no changes are staged, ask: "Which files should I analyze? (paste paths or describe the change)"

2. For each changed file, build the dependency graph:
   - **Direct imports**: which files import this file
   - **Indirect imports**: files that import the direct importers (2 levels deep)
     Show the graph as a table: changed file → callers → callers-of-callers.

3. Detect breaking changes in each modified file:
   - Function signature changes (parameters added/removed/reordered)
   - Exported type modifications
   - Return type changes
   - Removed exports
     Mark each as: breaking (callers will fail) or non-breaking (additive change).

4. Find related tests:
   - Unit tests that import or reference the changed files
   - Integration tests in the same module area
   - E2E tests that exercise the affected user flows
     Use both pattern matching (file naming conventions) and coverage mapping if available.

5. Generate the impact report with risk scores:
   - **Critical**: breaking changes with known callers
   - **Recommended**: non-breaking changes but callers should be tested
   - **Optional**: test files in the same area, low change risk

6. Show the impact report. Ask: [A] Run the affected tests now (recommended), [B] Show me the full caller list for a specific file, [C] Just the report — I'll run tests myself.

7. If running tests, execute the critical and recommended test files. Report results: pass/fail with counts and any new failures.

## Output

Impact report with changed files, dependency graph (2 levels), breaking change detection, related tests by risk level. Optional: test run results.

## Fallbacks

**If interactive prompts (AskUserQuestion) are unavailable:**
Present options as a numbered list in your response. Ask the user to reply with a number. Example:

```
How would you like to proceed?
1. Save and continue
2. Review before saving
3. Discard
```
