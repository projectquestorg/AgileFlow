# Impact Workflow — Code Change Impact Analysis

**Triggers:** "what will this change break", "impact analysis", "what files depend on this", "check for regressions before I merge", "what else might be affected", "dependency graph for [file]"

**Goal:** Build a dependency graph for changed files, detect breaking changes, find related tests, and generate a risk-scored impact report so the user knows exactly what to test before merging.

## Inputs needed

| Input         | Required | How to get it                                |
| ------------- | -------- | -------------------------------------------- |
| changed files | No       | Auto-detected from `git diff` against `main` |
| base branch   | No       | Default: `main`                              |
| run tests     | No       | Ask the user                                 |

## Steps

1. Detect changed files. Run `git diff main --name-only`. If no changes are staged or if the user specified particular files, use those. If the working tree is clean, ask: "Which files should I analyze?"

2. For each changed file, find what imports it (direct callers). Then find what imports those callers (indirect callers — 2 levels max). Show the dependency chain as a table with file paths and the line numbers where they import the changed file.

3. Detect breaking changes in each modified file by comparing the current version to the base branch version:
   - Function parameters added, removed, or reordered
   - Exported type or interface modifications
   - Return type changes
   - Removed exports or renamed exports
     Label each: **Breaking** (callers will likely fail) or **Non-breaking** (additive change only).

4. Find related tests using both pattern-matching (test files that reference the changed file by name) and directory proximity (tests in the same module area).

5. Assign risk scores:
   - **Critical**: breaking changes with identified callers
   - **Recommended**: non-breaking changes in highly-used files
   - **Optional**: test files in the vicinity, low likelihood of impact

6. Present the impact report. Example format:

   ```
   Changed: src/auth/session.ts
   Direct callers (3): src/api/users.ts, src/middleware/auth.ts, src/pages/login.tsx
   Indirect callers (5): ...
   Breaking changes: parameter type in getUserSession() changed
   Related tests: tests/auth/session.test.ts (critical), tests/api/users.test.ts (recommended)
   ```

7. Ask: [A] Run the critical and recommended tests now, [B] Show me the full caller list for a specific file, [C] I'll run tests myself — just give me the list.

8. If running tests, execute them and report the results. Flag any new failures compared to the base branch.

## Output

Impact report with dependency graph (2 levels), breaking change detection, related tests by risk level (Critical / Recommended / Optional). Optional: test run with pass/fail results.

## Fallbacks

**If interactive prompts (AskUserQuestion) are unavailable:**
Present options as a numbered list in your response. Ask the user to reply with a number. Example:

```
How would you like to proceed?
1. Save and continue
2. Review before saving
3. Discard
```
