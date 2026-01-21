# AI-Driven Development Workflow

Best practices for the new developer role: planning-first, supervised implementation, and end-of-cycle testing.

**Source**: [AI-Driven Development Workflows Research](../10-research/20260121-ai-driven-development-workflows.md)

---

## The "Disappearing Middle"

Traditional software development had three phases:
- **Beginning**: Requirements gathering, planning
- **Middle**: Writing code (took weeks/months, most friction)
- **End**: Testing, review

AI agents have collapsed the middle. Implementation happens in minutes, not months. This shifts developer work to the **ends**:

```
OLD:  Planning (10%) → Coding (80%) → Testing (10%)
NEW:  Planning (40%) → Supervision (20%) → Testing (40%)
```

---

## Planning-First Approach

### Pre-Implementation Checklist

Before enabling supervised implementation (bypass permission mode):

- [ ] **Problem clarity**: Can you explain the problem in one sentence?
- [ ] **Customer understanding**: Do you know what users actually want?
- [ ] **Interaction model**: How will users interact with this feature?
- [ ] **Separate documents**: Have you created distinct docs for:
  - Technical specifications
  - Risk assessments
  - Constraints and trade-offs
- [ ] **Acceptance criteria**: Are ACs specific and testable?

### Document Structure

Don't cram everything into one file. Create separate documents:

| Document | Purpose | Location |
|----------|---------|----------|
| Tech Spec | What to build, architecture decisions | `docs/04-architecture/` |
| Risk Assessment | What could go wrong, mitigations | Story file or ADR |
| Constraints | Performance, cost, time trade-offs | Story file |
| Acceptance Criteria | How to verify completion | Story file |

**Why separate documents?** Agents navigate better when context is structured. A single massive document causes attention drift.

---

## Context Engineering

### The Core Skill

Context engineering replaces learning new frameworks as the primary developer skill.

**Components to master:**
- `CLAUDE.md` - Project guidance (keep high-level)
- Slash commands - Reusable workflows
- Skills - Complex multi-step operations
- MCPs - External tool integration
- Sub-agents - Isolated context for parallel work

### AgileFlow Implementation

| Principle | AgileFlow Feature |
|-----------|------------------|
| Progressive disclosure | `/agileflow:rpi` loads context per phase |
| Structured note-taking | 15-folder `docs/` hierarchy |
| Sub-agent isolation | Multi-expert delegation via `/agileflow:babysit` |
| Context preservation | PreCompact hooks extract summaries |
| Reusable commands | 72+ slash commands |

**See also**: [Context Engineering Guidelines](./context-engineering.md)

---

## Supervised Implementation

### When to Use Bypass Permission Mode

Enable bypass permission mode (auto-approve tool calls) when:

1. **Plan is comprehensive** - All edge cases documented
2. **ACs are specific** - No ambiguity in expected behavior
3. **Constraints are explicit** - Performance, security requirements clear
4. **Tests exist** - TDD approach, tests define expected behavior

### How to Supervise

```
1. Refine plan until fully satisfactory
2. Enable bypass permission mode
3. Let agent implement specs in single run
4. Monitor via IDE (now a "code viewer")
5. Review output, don't intervene mid-implementation
```

**Key insight**: The IDE has transformed from a code-writing tool to a code-viewing tool. Your job is review, not writing.

---

## Test-Driven Development (TDD)

### The TDD Workflow

Tests should **specify** implementation, not just **verify** it.

```
1. Write test cases from acceptance criteria
2. Clear context (start fresh session)
3. Ask agent to make tests pass
4. Agent cannot modify tests
5. Tests define the iteration goal
```

**Why clear context?** Prevents agent from "knowing" how tests were written. Forces implementation to genuinely satisfy tests.

### Test Types

| Type | Purpose | When to Use |
|------|---------|-------------|
| **Blackbox** | User perspective, functionality | User stories as guides |
| **Whitebox** | Architecture, performance | Internal code review |

### AgileFlow Commands

- `/agileflow:verify` - Run tests, update story status
- `/agileflow:audit` - Tests + AC verification + learnings
- `/agileflow:tests` - Set up test infrastructure
- `/agileflow:review` - AI-powered code review

### TDD Mode in Story Creation

TDD mode automatically generates test stubs from acceptance criteria.

**Smart defaults by owner:**
| Owner Type | TDD Default |
|------------|-------------|
| AG-API, AG-UI, AG-DATABASE, AG-TESTING, AG-SECURITY | `true` |
| AG-DOCUMENTATION, AG-RESEARCH, AG-DEVOPS | `false` |

```bash
# TDD=true is automatic for code owners like AG-API
/agileflow:story EPIC=EP-0042 STORY=US-0100 TITLE="User Login" OWNER=AG-API AC="Given user on login page, When valid credentials entered, Then dashboard shown"

# Explicitly enable/disable with TDD=true or TDD=false
/agileflow:story ... OWNER=AG-DEVOPS TDD=true  # Force TDD for devops story
```

**What TDD=true does:**
1. Parses acceptance criteria (Given/When/Then)
2. Generates framework-specific test file (`__tests__/US-0100.test.ts`)
3. Creates pending tests for each AC (marked `.skip`)
4. Adds TDD badge to story file
5. Sets `tdd_mode: true` in status.json

**Generated test structure:**
```typescript
describe('US-0100: User Login', () => {
  // AC1: valid login shows dashboard
  describe('valid login shows dashboard', () => {
    it.skip('should dashboard shown', () => {
      // Given: user on login page
      // When: valid credentials entered
      // Then: dashboard shown
      expect(true).toBe(true); // TODO: Implement
    });
  });
});
```

**Workflow after TDD story creation:**
1. Review generated tests
2. Start fresh context (clear conversation)
3. Tell agent: "Make all tests in `__tests__/US-0100.test.ts` pass"
4. Agent implements without knowing how tests were generated

---

## End-of-Cycle Review

### Review Pressure Shift

With faster implementation, code review becomes critical. Unreviewed code leads to:
- Degraded performance
- Hidden costs
- Technical debt accumulation

### Structured Review Process

```yaml
Before marking complete:
  - Tests passing? (/agileflow:verify)
  - ACs verified? (/agileflow:audit)
  - Code reviewed? (/agileflow:review)
  - Learnings captured? (audit step)
```

### AgileFlow Audit Cycle

The `/agileflow:audit` command implements the GSD verification pattern:

1. **Run tests** - Automated pass/fail
2. **Check ACs** - User confirms each criterion met
3. **Capture learnings** - What worked, what didn't
4. **Verdict** - PASS/FAIL with blocking issues

---

## Quick Reference

### Starting a Task

```yaml
1. Understand the problem (not just the solution)
2. Create separate docs (spec, risks, constraints)
3. Write acceptance criteria
4. Write tests first (TDD)
5. Enable supervised implementation
```

### During Implementation

```yaml
- Monitor, don't intervene
- IDE is for reviewing, not writing
- Let agent complete the implementation
- Save questions for review phase
```

### After Implementation

```yaml
1. Run /agileflow:verify
2. Run /agileflow:audit
3. Run /agileflow:review
4. Capture learnings
5. Mark story complete
```

---

## Metrics

**Industry validation:**
- Microsoft: 20-30% AI-generated code
- Claude Code creator: 100% AI-written contributions in recent month
- Teams using structured workflows report fewer bugs, faster delivery

**Key insight**: This only works with comprehensive planning. Poor plans = poor AI output.

---

## Related

- [Context Engineering Guidelines](./context-engineering.md)
- [Plan Mode Best Practices](./plan-mode.md)
- [Testing Practices](./testing.md)
- [AI-Driven Development Research](../10-research/20260121-ai-driven-development-workflows.md)
