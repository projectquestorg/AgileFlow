# Validate Workflow — Post-Migration Verification

**Triggers:** "validate the migration", "did the upgrade succeed", "check migration is complete", "run post-migration checks", "verify nothing broke after upgrading"

**Goal:** Run comprehensive checks after a migration — tests, type checking, linting, build, and deprecated API scan — then report PASS / PARTIAL / FAIL with specific issues.

## Inputs needed

| Input  | Required | How to get it                                                   |
| ------ | -------- | --------------------------------------------------------------- |
| target | No       | Auto-detect from migration plan or ask: "What did you migrate?" |
| strict | No       | Default: false. Strict mode = zero warnings tolerance           |

## Steps

1. Identify the migration target. Look for a migration plan file in `docs/04-architecture/migration-*.md`. If not found, ask: "What did you migrate? (e.g., react@18, next@15)"

2. Run all validation checks in sequence (each must pass before reporting):

   | Check           | Command                  | Pass Criteria                           |
   | --------------- | ------------------------ | --------------------------------------- |
   | Tests           | `npm test`               | All passing (no regressions)            |
   | Type check      | `npx tsc --noEmit`       | Zero type errors                        |
   | Lint            | `npm run lint`           | Zero errors (warnings OK unless strict) |
   | Build           | `npm run build`          | Exits 0                                 |
   | Deprecated scan | Re-scan for old patterns | Zero deprecated APIs in migrated areas  |

3. Compare before/after metrics if a migration plan exists:
   - Test count: same or more (not fewer — regression risk if tests disappeared)
   - Build size: within 10% (flag large increases)
   - Type errors: zero new errors

4. Generate the Validation Report:

   ```
   # Migration Validation Report
   Generated / Migration / Status: PASS | PARTIAL | FAIL

   ## Check Results
   | Check | Status | Details |
   |-------|--------|---------|
   | Tests | PASS | 247 passing, 0 failing |
   | Types | PASS | 0 errors |
   | Lint | WARN | 3 warnings (non-blocking) |
   | Build | PASS | 2.1MB (+0.3%) |
   | Deprecated | PASS | 0 remaining |

   ## Issues Found
   [Only populated if status != PASS]
   ```

5. Present the report. Ask the user:
   - If PASS: [A] Merge to main, [B] Create a summary ADR documenting the migration decision
   - If PARTIAL: [A] Fix the remaining issues (list them with suggested fixes), [B] Accept as-is and document the known issues
   - If FAIL: [A] Show me what failed and help fix it, [B] Roll back the migration

## Output

Validation report with PASS/PARTIAL/FAIL status for all checks. Specific issue details for any failures. Recommendation on whether to merge or roll back.

## Fallbacks

**If interactive prompts (AskUserQuestion) are unavailable:**
Present options as a numbered list in your response. Ask the user to reply with a number. Example:

```
How would you like to proceed?
1. Save and continue
2. Review before saving
3. Discard
```
