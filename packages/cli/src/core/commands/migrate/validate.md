---
description: Post-migration verification - run tests, check for deprecated usage, validate types, and confirm migration completeness
argument-hint: "[migration-plan|package-name] [--strict]"
---

# /agileflow:migrate:validate

Run comprehensive post-migration verification to confirm the migration was successful - tests pass, no deprecated APIs remain, types check, and no regressions introduced.

---

## Quick Reference

```
/agileflow:migrate:validate                                # Validate latest migration
/agileflow:migrate:validate react                          # Validate React migration
/agileflow:migrate:validate next@15                        # Validate Next.js 15 migration
/agileflow:migrate:validate . --strict                     # Strict mode - zero warnings
```

---

## How It Works

1. **Run test suite** - Full test run to catch regressions
2. **Re-scan for deprecated usage** - Verify no deprecated APIs remain
3. **Type check** - Run TypeScript/type checker for type errors
4. **Lint check** - Run linter for new issues
5. **Build check** - Verify production build succeeds
6. **Generate validation report** - Pass/fail with details

---

## Step-by-Step Process

### STEP 1: Parse Arguments

```
TARGET = migration plan path, package name, or current directory
STRICT = --strict flag (zero warnings tolerance)
```

### STEP 2: Run Validation Checks

Execute all checks and collect results:

| Check | Command | Pass Criteria |
|-------|---------|--------------|
| Tests | `npm test` | All passing |
| Type check | `npx tsc --noEmit` | No errors |
| Lint | `npm run lint` | No errors (warnings OK unless strict) |
| Build | `npm run build` | Exits 0 |
| Deprecated scan | Re-run `/agileflow:migrate:scan` | No critical findings |

### STEP 3: Compare Before/After

If a migration plan exists, compare:
- Test count: same or more (not fewer)
- Build size: within 10% (flag large increases)
- Type errors: zero new errors
- Deprecated usage: reduced to zero for migrated items

### STEP 4: Generate Validation Report

```markdown
# Migration Validation Report

**Generated**: {date}
**Migration**: {target}
**Status**: {PASS | PARTIAL | FAIL}

## Check Results

| Check | Status | Details |
|-------|--------|---------|
| Tests | {pass/fail} | {N} passing, {M} failing |
| Types | {pass/fail} | {N} errors |
| Lint | {pass/fail} | {N} errors, {M} warnings |
| Build | {pass/fail} | Build size: {N} |
| Deprecated scan | {pass/fail} | {N} remaining items |

## Failures (if any)

### Test Failures
{list of failing tests with details}

### Type Errors
{list of new type errors}

### Remaining Deprecated Usage
{list of deprecated items still in codebase}

## Verdict

{Overall assessment and recommended next steps}
```

Save to `docs/08-project/migrations/validation-{YYYYMMDD}.md`

### STEP 5: Offer Next Steps

```
Migration validation: [STATUS]. [N]/[M] checks passed.

Options:
- Fix failing tests (Recommended)
- Fix remaining deprecated usage
- Accept partial migration and create stories for remaining work
- Mark migration as complete
```

---

## Related Commands

- `/agileflow:migrate:scan` - Detect migration opportunities
- `/agileflow:migrate:plan` - Generate migration roadmap
- `/agileflow:migrate:codemods` - Generate AST-based codemods
- `/agileflow:verify` - Run project tests
