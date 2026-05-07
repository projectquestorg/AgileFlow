# RPI Workflow Reference

**Load this when:** guiding a user through Research → Plan → Implement,
or when the task involves unfamiliar territory that needs external research first.

## What RPI is

RPI = **Research → Plan → Implement**

A structured workflow for tackling unfamiliar technical problems where diving
straight into implementation leads to wasted effort. Particularly effective when:

- Working with an unfamiliar library, API, or pattern
- The architecture has multiple viable approaches with real tradeoffs
- Previous attempts at similar work failed unexpectedly
- The problem domain is complex enough that assumptions are risky

## The three phases

### Phase 1: Research

**Goal:** Understand the problem space before writing a single line of code.

Activities:

- Run `/agileflow:research:ask` with a detailed prompt (200+ lines, 50+ lines of code, exact errors, 3+ specific questions)
- Import findings via `/agileflow:research:import`
- Check existing research notes via `/agileflow:research:list`
- Synthesize across multiple sources via `/agileflow:research:synthesize`

**Research prompt quality checklist:**

```
⬜ 50+ lines of actual relevant code included
⬜ Exact error messages with full stack traces
⬜ Library versions specified
⬜ What has already been tried
⬜ 3+ specific questions (not "how do I fix this?")
⬜ Context: what the code is supposed to do
```

**Phase exits when:** you have enough information to write a confident plan.

### Phase 2: Plan

**Goal:** Design the implementation before touching production code.

Activities:

- Enter plan mode: `EnterPlanMode`
- Explore 3–5 key files (understand patterns, conventions, dependencies)
- Write the plan: steps, files to change, decisions made, testing approach
- Include a flow verification step for user-facing features
- Exit plan mode: `ExitPlanMode`

**Plan quality checklist:**

```
⬜ Implementation steps are specific (not "update the auth module")
⬜ Files to be changed are listed
⬜ Key decisions are documented with rationale
⬜ Testing approach is defined
⬜ Flow verification step included (for user-facing work)
⬜ Rollback approach noted for risky changes
```

**Phase exits when:** plan is approved by user.

### Phase 3: Implement

**Goal:** Execute the plan with high confidence, minimal surprises.

Activities:

- Follow the plan — don't improvise unless you find something unexpected
- If something unexpected: pause, assess, update plan if needed
- Delegate to domain experts via Task tool
- Run tests after implementation
- Run audits (logic, flow, security as relevant)

## Context health and RPI

RPI is especially important when context is getting long (>70% full).
The "dumb zone" in long contexts causes planning to degrade.

Signs you're in the dumb zone:

- Suggestions that contradict earlier decisions
- Forgetting what was already implemented
- Inconsistent approach across files

When in the dumb zone: `/agileflow:compress` to compact context before continuing,
or `/agileflow:context:full` to review what's been established.

## When to skip RPI

RPI adds overhead — don't use it for:

- Simple one-liner fixes
- Familiar patterns you've done many times in this codebase
- Changes with obvious, single implementation path
- Urgent hotfixes where deliberation costs more than the risk

Use RPI for:

- Unfamiliar libraries or APIs (>60% of the time)
- Architecture decisions
- Anything that failed when tried before
- Complex multi-file refactors

## RPI and impact analysis

Before Phase 2 (Planning), if the work touches existing code:

1. Run `/agileflow:impact` to understand blast radius
2. Incorporate impact findings into the plan
3. Add tests for high-impact areas

High-impact = many downstream dependencies = higher risk = more careful plan.
