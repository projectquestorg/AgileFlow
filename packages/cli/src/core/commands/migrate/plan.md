---
description: Generate step-by-step migration roadmap with risk assessment, rollback strategy, and execution order from scan results
argument-hint: "[scan-report|package-name] [SCOPE=full|incremental]"
---

# /agileflow:migrate:plan

Generate a detailed migration plan with step-by-step execution order, risk assessment, rollback strategies, and dependency mapping from scan results or specific upgrade targets.

---

## Quick Reference

```
/agileflow:migrate:plan                                    # Plan from latest scan report
/agileflow:migrate:plan react                              # Plan React upgrade specifically
/agileflow:migrate:plan next@15                            # Plan Next.js 15 migration
/agileflow:migrate:plan . SCOPE=incremental                # Incremental migration (phase by phase)
/agileflow:migrate:plan typescript@5.5                     # Plan TypeScript upgrade
```

---

## How It Works

1. **Read scan results** or analyze specific upgrade target
2. **Map dependencies** between migration steps
3. **Assess risk** for each step (data loss, downtime, breaking changes)
4. **Design rollback** strategy for each step
5. **Order execution** by dependency and risk (safest first)
6. **Estimate effort** per step

---

## Step-by-Step Process

### STEP 1: Parse Arguments

```
TARGET = scan report path, package name, or package@version
SCOPE = full (all at once) or incremental (phased)
```

### STEP 2: Research Migration Path

Delegate to `agileflow-research` agent:
- Read official migration guides for the target upgrade
- Find known issues and workarounds
- Check community experience (GitHub issues, blog posts)
- Identify breaking changes between current and target versions

### STEP 3: Map Dependencies

Build a dependency graph of migration steps:
- Which steps must happen before others
- Which steps can run in parallel
- Which steps affect shared code

### STEP 4: Assess Risk

For each migration step:

| Risk Level | Criteria |
|------------|----------|
| **High** | Data migration, schema changes, auth changes |
| **Medium** | API changes, dependency swaps, config changes |
| **Low** | Syntax updates, import changes, type updates |

### STEP 5: Generate Migration Plan

```markdown
# Migration Plan: {Target}

**Generated**: {date}
**Current State**: {current versions/patterns}
**Target State**: {target versions/patterns}
**Estimated Effort**: {total estimate}
**Risk Level**: {overall risk}

## Pre-Migration Checklist
- [ ] Full test suite passing
- [ ] Database backup created
- [ ] Feature flags for gradual rollout
- [ ] Rollback procedure documented

## Phase 1: {Name} (Risk: Low)
### Step 1.1: {Action}
- **What**: {specific change}
- **Files affected**: {list}
- **Risk**: {description}
- **Rollback**: {how to undo}
- **Verification**: {how to confirm success}

### Step 1.2: {Action}
...

## Phase 2: {Name} (Risk: Medium)
...

## Phase 3: {Name} (Risk: High)
...

## Post-Migration Verification
- [ ] All tests passing
- [ ] No deprecated API warnings
- [ ] Performance benchmarks stable
- [ ] Monitoring shows no regressions
```

Save to `docs/08-project/migrations/plan-{target}-{YYYYMMDD}.md`

### STEP 6: Offer Next Steps

```
Migration plan generated: [N] phases, [M] steps. Estimated effort: [estimate].

Options:
- Generate codemods for Phase 1 (Recommended)
- Create stories from migration steps
- Review plan in detail
- Save plan and done
```

---

## Related Commands

- `/agileflow:migrate:scan` - Detect migration opportunities
- `/agileflow:migrate:codemods` - Generate AST-based codemods
- `/agileflow:migrate:validate` - Post-migration verification
- `/agileflow:research:ask` - Deep research on specific migration topics
