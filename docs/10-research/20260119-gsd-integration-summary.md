# GSD Integration Summary (TL;DR)

**Date**: 2026-01-19
**Full Analysis**: [20260119-gsd-agileflow-integration-analysis.md](./20260119-gsd-agileflow-integration-analysis.md)

---

## 30-Second Summary

GSD has **3 killer features** AgileFlow should adopt:
1. **Audit cycle** before completion (verify, discuss, learn)
2. **50% context rule** (warn when approaching limits)
3. **Phase tracking** (research → plan → execute → audit)

AgileFlow already beats GSD on: domain experts, team coordination, parallel orchestration.

---

## What to Build First

### 1. Context Budget Warning (1-2 hours)
```bash
# In obtain-context.js, add:
⚠️ Context usage: 52% (approaching 50% threshold)
→ Consider: delegate to sub-agent or compact conversation
```

**Why**: Immediate value, prevents degradation, easy to implement.

---

### 2. Audit Command (2-4 hours)
```bash
/agileflow:audit US-####

# Checks:
- Tests passing?
- AC met?
- No regressions?
- Learnings to capture?

# Output: PASS/FAIL + next action
```

**Why**: Explicit verification prevents premature completion.

---

### 3. Phase Handoff Summaries (2 hours)
```bash
# When moving story between phases, prompt:
"Summarize what was accomplished in this phase"

# Captured to bus/log.jsonl
{"type":"phase_handoff","story":"US-####","from":"plan","to":"execute","summary":"..."}
```

**Why**: Clear context transfer, reduces "what was I doing?" moments.

---

## What NOT to Build

### ❌ Don't Replace Story Status with Phase
- Keep status (ready, in-progress, done)
- Add phase as separate field (research, plan, execute)
- They serve different purposes

### ❌ Don't Copy GSD's 4-Agent Model
- AgileFlow's 29 domain experts > GSD's 4 generic agents
- Keep existing architecture

### ❌ Don't Enforce Strict Phase Sequencing
- Some stories don't need research (bug fixes)
- Make phases optional, recommend for complex work

---

## Implementation Roadmap

| Week | Feature | Effort | Value |
|------|---------|--------|-------|
| 1 | Context budget warning | LOW | HIGH |
| 1 | Phase handoff summaries | LOW | MEDIUM |
| 2-3 | Audit command | MEDIUM | HIGH |
| 3-4 | Research-first epic planning | MEDIUM | MEDIUM |
| Later | Phase field in status.json | HIGH | LOW |

**Total**: ~2-3 weeks for high-value features

---

## Key Insights

### What GSD Does Better
1. **Explicit verification** (audit → complete → discuss)
2. **Context management** (50% rule enforced)
3. **Phase structure** (clear workflow progression)

### What AgileFlow Does Better
1. **Domain expertise** (29 experts vs 4)
2. **Team coordination** (status.json, bus, handoffs)
3. **Parallel orchestration** (multi-expert, nested loops)
4. **Self-improvement** (expertise files + Stop hook)

### Core Philosophy Difference
- **GSD**: Context-first, phase-driven, solo developer
- **AgileFlow**: Story-first, expert-driven, team coordination

Both are valid. AgileFlow can adopt GSD's best parts without losing its strengths.

---

## Action Items

- [ ] Add context budget calculation to `obtain-context.js`
- [ ] Create `/agileflow:audit` command
- [ ] Add phase handoff prompts to `/agileflow:status`
- [ ] Update `/agileflow:epic` to check for research notes
- [ ] (Later) Add `phase` field to status.json schema

---

## Related Docs

- [Full Analysis](./20260119-gsd-agileflow-integration-analysis.md) (7,000 words, detailed comparison)
- [GSD Workflow System](./20260119-gsd-claude-code-workflow-system.md) (original research)
- [Agent Expert System](../04-architecture/agent-expert-system.md)
- [Ralph Loop](../04-architecture/ralph-loop.md)

---

**Bottom Line**: Build the audit system and context warnings. They're low effort, high value, and fill real gaps in AgileFlow.
