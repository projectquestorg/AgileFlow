# GSD + AgileFlow Integration Analysis

**Date**: 2026-01-19
**Analyst**: Multi-Expert (Claude Code)
**Source**: GSD research note + AgileFlow architecture docs

---

## Executive Summary

GSD (Get Stuff Done) and AgileFlow are complementary workflow systems with distinct philosophies. GSD excels at **phased solo development** with strict context management, while AgileFlow excels at **story-driven team coordination** with domain expert specialization. Key integration opportunities exist around milestone tracking, context budgeting, and workflow phases.

**Key Finding**: AgileFlow already implements many GSD concepts (sub-agents, context preservation, phased handoffs) but could benefit from:
1. **Explicit milestone workflow** (audit → complete → discuss)
2. **50% context rule** enforcement
3. **Phase-based story progression** (research → requirements → plan → execute)

---

## Comparison Matrix

| Dimension | GSD | AgileFlow | Winner |
|-----------|-----|-----------|--------|
| **Philosophy** | Phased workflows, context-first | Story-driven, expert specialization | - |
| **Context Mgmt** | 50% rule, phase isolation | PreCompact, unified context gathering | GSD (explicit budgets) |
| **Tracking** | Milestones per phase | User stories + epics | AgileFlow (richer) |
| **Agents** | 4 specialized (Executor, Verifier, Debugger, Researcher) | 29+ domain experts | AgileFlow (broader) |
| **Parallelization** | Phase-based parallel plans | Multi-expert orchestration | AgileFlow (more mature) |
| **Completion** | Audit → complete → discuss cycle | Story lifecycle (ready → in-progress → in-review → done) | GSD (explicit verification) |
| **Use Case** | Solo developer, greenfield projects | Team coordination, existing codebases | - |

---

## What GSD Does Better

### 1. Milestone Audit Cycle
**GSD Pattern:**
```
audit milestone → complete milestone → discuss milestone → new milestone
```

**Value:**
- Explicit verification step before marking done
- Reflection/learnings captured in "discuss" phase
- Clear checkpoints prevent premature completion

**AgileFlow Gap:**
- Stories transition `in-review → done` without structured audit
- No explicit "discuss what we learned" step
- Ralph Loop validates tests but not broader completion criteria

**Integration Opportunity**: Add `/agileflow:audit US-####` command (see Recommendation #1)

---

### 2. 50% Context Rule
**GSD Pattern:**
- Never exceed 50% context utilization
- Phase boundaries reset context
- Sub-agents offload to preserve budget

**Value:**
- Prevents degradation in "dumb zone" (>50% usage)
- Explicit threshold for decision-making
- Built-in forcing function for modularity

**AgileFlow Gap:**
- PreCompact preserves context but no budget enforcement
- No warning when approaching context limits
- No explicit guidance on when to delegate vs continue

**Integration Opportunity**: Add context budget tracking (see Recommendation #2)

---

### 3. Phased Workflow Structure
**GSD Phases:**
```
new project → research project → define requirements → create roadmap →
plan phase → execute phase → audit milestone → complete milestone
```

**Value:**
- Clear progression with handoff points
- Each phase has defined input/output
- Natural documentation boundaries

**AgileFlow Gap:**
- Stories can start at any phase (no enforced research → requirements flow)
- Epic planning doesn't enforce research-first
- `/agileflow:babysit` can jump straight to implementation

**Integration Opportunity**: Add phase field to stories (see Recommendation #3)

---

## What AgileFlow Does Better

### 1. Domain Expert Specialization
**AgileFlow Strength:**
- 29 specialized domain experts (UI, API, Database, Security, CI, etc.)
- Each has expertise.yaml with accumulated knowledge
- Self-improving agents via Stop hook

**GSD Limitation:**
- Only 4 generic agents (Executor, Verifier, Debugger, Researcher)
- No domain-specific knowledge accumulation
- No self-improvement mechanism

**Why AgileFlow Wins:**
- Deep domain expertise beats generic execution
- Expertise files compound value over time
- Automatic learning via Stop hook (v2.75+)

---

### 2. Multi-Expert Orchestration
**AgileFlow Strength:**
- Parallel deployment of 3-5 experts with `run_in_background: true`
- Join strategies (all, first, any, majority)
- Conflict resolution and synthesis
- Nested loop mode for quality gates (v2.85+)

**GSD Limitation:**
- Parallel plan execution but no synthesis framework
- No explicit conflict resolution
- No quality gate loops

**Why AgileFlow Wins:**
- More sophisticated orchestration patterns
- Handles disagreements explicitly
- Quality gates with iteration (coverage loops, visual verification)

---

### 3. Team Coordination Infrastructure
**AgileFlow Strength:**
- `status.json` for story tracking across agents
- `bus/log.jsonl` for agent messaging
- Handoff protocol between agents
- WIP limits (max 2 stories per agent)
- Blocker/unblock workflow

**GSD Limitation:**
- Solo developer focused
- No multi-agent coordination
- No shared state management

**Why AgileFlow Wins:**
- Built for team collaboration
- Rich coordination primitives
- Prevents agent overload

---

### 4. Story-Driven Development
**AgileFlow Strength:**
- Definition of Ready (AC + test stub + no blockers)
- Definition of Done (merged to main, tests passing)
- Epic → Story decomposition
- Acceptance criteria in Given/When/Then
- Test-driven with Ralph Loop

**GSD Limitation:**
- Milestones are high-level
- No structured story format
- No explicit AC

**Why AgileFlow Wins:**
- Granular, testable units of work
- Clear success criteria
- Better for iterative development

---

## Integration Opportunities

### Priority 1: Milestone Audit System (MEDIUM effort)

**Concept**: Add explicit audit cycle before marking stories complete

**Implementation**:
```bash
# New command
/agileflow:audit US-####

# Workflow
1. Check Definition of Done (tests pass, AC met, no regressions)
2. Generate audit report (files changed, test coverage, review comments)
3. Prompt: "Mark complete? Discuss learnings?"
4. If YES → update status.json, append learning to expertise
5. If NO → list gaps, remain in-review
```

**Benefits**:
- Prevents premature completion
- Captures learnings consistently
- Aligns with GSD's explicit verification

**Files to Create**:
- `packages/cli/src/core/commands/audit.md` (command)
- `scripts/audit-story.js` (audit logic)

**Effort**: Medium (2-4 hours)

---

### Priority 2: Context Budget Tracking (LOW effort)

**Concept**: Warn when approaching 50% context utilization

**Implementation**:
```javascript
// scripts/obtain-context.js additions

const contextBudget = {
  total: 200000, // Sonnet 4.5 context window
  used: calculateUsedTokens(), // Estimate from status.json + bus + files
  percentage: (used / total) * 100,
  threshold: 50
};

if (contextBudget.percentage > 50) {
  console.warn("⚠️ Context usage: ${contextBudget.percentage}% (>50% threshold)");
  console.warn("Consider: delegate to sub-agent, compact conversation, archive old stories");
}
```

**Benefits**:
- Proactive context management
- Explicit budget awareness
- Prevents degradation

**Files to Modify**:
- `packages/cli/scripts/obtain-context.js` (add budget calculation)

**Effort**: Low (1-2 hours)

---

### Priority 3: Story Phase Field (HIGH effort)

**Concept**: Add `phase` field to stories for workflow tracking

**Implementation**:
```json
// status.json schema addition
{
  "id": "US-0042",
  "title": "Add user profile",
  "status": "ready",
  "phase": "plan",  // NEW: research | requirements | plan | execute | audit | complete
  "owner": "AG-API",
  ...
}
```

**Workflow Enforcement**:
- Stories start in `research` phase
- Must complete research before moving to `requirements`
- Must have requirements before `plan`
- Must have plan before `execute`
- Must audit before `complete`

**Benefits**:
- Prevents skipping critical steps
- Clear documentation trail
- Aligns with GSD phases

**Files to Modify**:
- `packages/cli/scripts/validate-status.js` (schema validation)
- `packages/cli/src/core/commands/story.md` (add phase selection)
- `packages/cli/src/core/commands/babysit.md` (enforce phase progression)

**Effort**: High (6-8 hours)

---

### Priority 4: Research-First Epic Planning (MEDIUM effort)

**Concept**: Enforce research phase before epic creation

**Implementation**:
```bash
# Modified workflow
/agileflow:epic NEW TITLE="User Authentication"

# Check if research exists
→ Search docs/10-research/ for related notes
→ If none found: "No research found. Run /agileflow:research:ask first?"
→ If stale (>90 days): "Research is 120 days old. Refresh before planning?"
→ If fresh: Proceed with epic creation
```

**Benefits**:
- Prevents uninformed planning
- Encourages research culture
- Reduces rework

**Files to Modify**:
- `packages/cli/src/core/commands/epic.md` (add research check)
- `packages/cli/scripts/obtain-context.js` (detect stale research)

**Effort**: Medium (3-4 hours)

---

### Priority 5: Phase Summary Handoffs (LOW effort)

**Concept**: Require summary when transitioning story phases

**Implementation**:
```bash
# When moving US-0042 from 'plan' → 'execute'
/agileflow:status STORY=US-0042 STATUS=in-progress PHASE=execute

# Prompt: "Provide phase handoff summary"
# Template:
## Phase Complete: Plan

### Summary
- Identified 4 implementation steps
- Files to change: src/api/profile.ts, src/components/ProfilePage.tsx
- Dependencies: None

### Handoff to Execute Phase
- API endpoint defined at /api/profile
- React component structure designed
- Test stubs created

### Risks
- Profile update requires transaction for data integrity
```

**Benefits**:
- Clear context transfer
- Reduces "what was I doing?" moments
- Aligns with GSD handoff pattern

**Files to Modify**:
- `packages/cli/src/core/commands/status.md` (add summary prompt)
- `docs/09-agents/bus/log.jsonl` (append phase_handoff events)

**Effort**: Low (2 hours)

---

## Potential Conflicts & Redundancies

### Conflict 1: Phase vs Status
**Issue**: GSD uses phases (plan → execute), AgileFlow uses status (ready → in-progress)

**Resolution**: Make phase orthogonal to status
- Phase = which stage of workflow (research, plan, execute)
- Status = work state (ready, in-progress, blocked, done)
- Example: Story can be `status: in-progress, phase: research`

---

### Conflict 2: Milestones vs Epics
**Issue**: GSD milestones are similar to AgileFlow epics

**Resolution**: Map concepts
- GSD Milestone ≈ AgileFlow Epic
- GSD Phase ≈ AgileFlow Story with explicit phase field
- Keep both: Epics group stories, Milestones mark major deliverables

---

### Redundancy: Sub-Agent Patterns
**Issue**: Both systems use sub-agents for delegation

**Resolution**: AgileFlow's approach is more mature
- Keep AgileFlow's 29 domain experts
- Keep expertise files and self-improvement
- Optionally: Add GSD-style Verifier agent for audit phase

---

## Recommended Priority Order

| Priority | Feature | Effort | Impact | Timeline |
|----------|---------|--------|--------|----------|
| **1** | Context Budget Tracking | LOW | HIGH | Week 1 |
| **2** | Milestone Audit System | MEDIUM | HIGH | Week 2-3 |
| **3** | Phase Summary Handoffs | LOW | MEDIUM | Week 1 |
| **4** | Research-First Epic Planning | MEDIUM | MEDIUM | Week 3-4 |
| **5** | Story Phase Field | HIGH | LOW | Month 2 |

**Rationale**:
1. **Context Budget** (Priority 1): Quick win, immediate value, prevents degradation
2. **Audit System** (Priority 2): Addresses major GSD strength, improves quality
3. **Phase Handoffs** (Priority 3): Low effort, incremental value
4. **Research-First** (Priority 4): Cultural shift, moderate implementation
5. **Phase Field** (Priority 5): High effort, low urgency (can simulate with story titles)

---

## Anti-Patterns to Avoid

### ❌ Don't: Copy GSD's 4-Agent Model
**Why**: AgileFlow's 29 domain experts are more powerful
**Do Instead**: Keep existing experts, optionally add Verifier for audits

### ❌ Don't: Enforce Strict Phase Sequencing
**Why**: Some stories don't need research (bug fixes, trivial changes)
**Do Instead**: Make phases optional, recommend for complex work

### ❌ Don't: Replace Story Status with Phase
**Why**: They serve different purposes (workflow stage vs work state)
**Do Instead**: Add phase as orthogonal field

### ❌ Don't: Rigidly Enforce 50% Context Rule
**Why**: Some tasks legitimately need more context
**Do Instead**: Warn at 50%, require confirmation at 70%, hard stop at 85%

---

## Correct Patterns to Follow

### ✅ Do: Add Explicit Audit Step
**Why**: Verification prevents technical debt
**How**: `/agileflow:audit` command before marking done

### ✅ Do: Track Context Budget
**Why**: Proactive management prevents degradation
**How**: Display in status line, warn in obtain-context.js

### ✅ Do: Capture Phase Learnings
**Why**: Builds institutional knowledge
**How**: Prompt for summary on phase transitions

### ✅ Do: Recommend Research for Complex Stories
**Why**: Informed decisions save rework
**How**: Check for research in `/agileflow:babysit`, suggest if missing

---

## Conclusion

**GSD and AgileFlow are complementary**. AgileFlow's strengths (domain experts, team coordination, story-driven) already surpass GSD's, but GSD's explicit milestone audits, context budgeting, and phase structure offer valuable enhancements.

**Top 3 Takeaways**:
1. **Add audit cycle** before marking stories complete
2. **Track context budget** to prevent degradation
3. **Recommend research** before complex epic planning

**Implementation Strategy**:
- Start with low-effort wins (context budget, phase handoffs)
- Validate value with audit system
- Consider phase field as future enhancement

**Estimated Total Effort**: 2-3 weeks for Priority 1-4 features

---

## Related Research

- [GSD Workflow System](./20260119-gsd-claude-code-workflow-system.md)
- [AgileFlow Agent Expert System](../04-architecture/agent-expert-system.md)
- [Ralph Loop](../04-architecture/ralph-loop.md)
- [PreCompact Context](../04-architecture/precompact-context.md)
- [Context Engineering for Coding Agents](./20260113-context-engineering-coding-agents.md)

---

## Appendix: Quick Reference

### GSD Commands to Consider
| GSD Command | AgileFlow Equivalent | Gap? |
|-------------|---------------------|------|
| `/gsd:audit-milestone` | (none) | ✅ Add |
| `/gsd:complete-milestone` | `/agileflow:status STATUS=done` | ✅ Enhance |
| `/gsd:discuss-milestone` | (none) | ✅ Add |
| `/gsd:new-project` | `/agileflow:setup-system` | ✅ Exists |
| `/gsd:research-project` | `/agileflow:research:ask` | ✅ Exists |
| `/gsd:define-requirements` | `/agileflow:story` with AC | ✅ Exists |
| `/gsd:create-roadmap` | `/agileflow:epic` + roadmap.md | ✅ Exists |
| `/gsd:plan-phase` | `/agileflow:babysit` (implicit) | ✅ Exists |
| `/gsd:execute-phase` | `/agileflow:babysit` | ✅ Exists |

### AgileFlow Commands GSD Lacks
| AgileFlow Command | Value | GSD Has Equivalent? |
|-------------------|-------|---------------------|
| `/agileflow:multi-expert` | Parallel domain analysis | ❌ No |
| `/agileflow:board` | Visual kanban | ❌ No |
| `/agileflow:handoff` | Agent coordination | ❌ No |
| `/agileflow:blockers` | Dependency tracking | ❌ No |
| `/agileflow:velocity` | Team metrics | ❌ No |
| `/agileflow:impact` | Change analysis | ❌ No |
| `/agileflow:packages` | Dependency audits | ❌ No |

**Verdict**: AgileFlow has richer command set for team coordination, GSD has stronger milestone verification.
