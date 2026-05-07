# Plan Workflow — Migration Planning

**Triggers:** "plan the migration to React 18", "create a migration plan", "how do we upgrade to Next.js 15", "migration roadmap for TypeScript 5.5", "step-by-step upgrade plan"

**Goal:** Generate a detailed migration plan with step-by-step execution order, dependency mapping, risk assessment, rollback strategies, and effort estimates.

## Inputs needed

| Input  | Required | How to get it                                                               |
| ------ | -------- | --------------------------------------------------------------------------- |
| target | Yes      | Ask: "What are you migrating to? (e.g., react@18, next@15, typescript@5.5)" |
| scope  | No       | Default: full. Options: full (all at once), incremental (phased)            |

## Steps

1. Ask for the migration target if not provided.

2. Read the current state: `package.json` for current versions, key source files to understand usage patterns.

3. Research the migration path. Look up official migration guides for the target upgrade, known breaking changes between current and target versions, community-reported issues, and workarounds.

4. Ask: "Migration scope?" Options: [A] Full migration (all at once — recommended for small projects), [B] Incremental (phased — recommended for large projects or high-risk upgrades).

5. Map dependencies between migration steps — which steps must happen before others, which can run in parallel, which affect shared code.

6. Assess risk for each step:
   - **High**: data migration, schema changes, auth changes, API contract changes
   - **Medium**: dependency swaps, config changes, API client changes
   - **Low**: syntax updates, import path changes, type annotation updates

7. Design a rollback strategy for each high-risk step.

8. Generate the Migration Plan document:

   ```
   # Migration Plan: [Target]
   Generated / Current State / Target State / Estimated Effort / Overall Risk

   ## Pre-Migration Checklist
   - [ ] All tests passing before starting
   - [ ] Feature branch created
   - [ ] Backup/snapshot if applicable

   ## Phase 1: [Description]
   Step 1: [title] — Risk: Low/Med/High — Effort: Xh
     - What to do
     - Rollback: [how to undo]
   Step 2: ...

   ## Validation Checkpoints
   [After each phase: tests to run, things to verify]

   ## Rollback Plan
   [How to revert entirely if needed]
   ```

9. Show the plan to the user. Ask: [A] Start Phase 1 now, [B] Save plan to `docs/04-architecture/migration-<target>.md`, [C] Adjust the scope or approach.

## Output

Migration Plan document with phases, risk assessments, rollback strategies, and effort estimates. Optional: saved to `docs/04-architecture/`. Ready to execute phase by phase.

## Fallbacks

**If interactive prompts (AskUserQuestion) are unavailable:**
Present options as a numbered list in your response. Ask the user to reply with a number. Example:

```
How would you like to proceed?
1. Save and continue
2. Review before saving
3. Discard
```
