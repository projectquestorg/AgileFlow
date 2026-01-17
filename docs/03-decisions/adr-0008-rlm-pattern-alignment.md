# ADR-0008: RLM Pattern Alignment for Multi-Agent Orchestration

**Status**: Accepted
**Date**: 2026-01-17
**Decision Makers**: Development Team
**Research**: [RLM - Recursive Language Models](../10-research/20260117-rlm-recursive-language-models.md)
**Related**: [ADR-0003: Multi-Agent Orchestration Pattern](./adr-0003-multi-agent-orchestration.md)

---

## Context

The RLM (Recursive Language Models) paper presents a framework for AI agents handling high-complexity documents through code execution + recursion. Key insight: **context rot is a function of BOTH context size AND task complexity**.

After analysis, we discovered that **AgileFlow already implements ~80% of RLM core concepts** through its multi-agent orchestration system, but uses different terminology. This ADR documents the alignment to:

1. Provide common vocabulary for discussing these patterns
2. Validate our architectural choices against published research
3. Identify future enhancement opportunities

### RLM Core Concepts

From the research:
- **REPL environment**: Read-Evaluate-Print-Loop for programmatic document operations
- **Recursion**: Main model hands off to smaller models for focused subtasks
- **Dependency graphs**: Model complex documents as graphs, not linear text
- **Guardrails**: Depth limits, synchronous execution, max iterations

---

## Decision

**Document the terminology mapping between RLM and AgileFlow; no immediate code changes.**

This decision recognizes that AgileFlow's multi-agent architecture is already well-aligned with RLM patterns. Future enhancements (research synthesis, budget management) are documented as backlog items.

---

## Terminology Mapping

| RLM Concept | AgileFlow Equivalent | Implementation Location | Maturity |
|-------------|---------------------|-------------------------|----------|
| **REPL environment** | Task/TaskOutput tools | All agents via Task tool | ✅ Complete |
| **Read operation** | Read file tools, grep, glob | Agent tool access | ✅ Complete |
| **Evaluate operation** | Agent analysis + code execution | Bash, domain logic | ✅ Complete |
| **Print operation** | TaskOutput collection | `TaskOutput(block=true)` | ✅ Complete |
| **Loop operation** | Nested agent loops | `orchestrator.md:462-651` | ✅ Complete |
| **Recursion** | Agent → subagent spawning | Task tool with `run_in_background` | ✅ Complete |
| **Parallel evaluation** | Multi-expert deployment | `multi-expert.md`, `run_in_background` | ✅ Complete |
| **Join strategies** | strategy: all/first/any/majority | `orchestrator.md:257-400` | ✅ Complete |
| **Depth limits** | max_iterations=5, max_concurrent=3 | `orchestrator.md` nested loop config | ✅ Complete |
| **Synchronous workflow** | TaskOutput blocking | Default Task behavior | ✅ Complete |
| **Dependency graphs** | status.json blockers + impact analysis | `status.json`, `impact.md` | ⚠️ Functional |
| **Context preservation** | expertise.yaml + session harness | Expert knowledge files | ✅ Complete |
| **Result synthesis** | Confidence scoring | `multi-expert.md:251-300` | ✅ Complete |
| **Budget/token management** | — | Not implemented | ❌ Gap |
| **Result caching** | Message bus (limited) | `bus/log.jsonl` | ⚠️ Limited |

### Architectural Mapping

```
RLM Architecture                    AgileFlow Architecture
─────────────────                   ──────────────────────
User Query                    ←→    User Request
   ↓                                    ↓
REPL Environment              ←→    Task Tool (spawns agent)
   ↓                                    ↓
Read/Evaluate/Print           ←→    Agent uses Read/Write/Bash/etc.
   ↓                                    ↓
Recursive Handoff             ←→    Task(subagent_type=..., run_in_background)
   ↓                                    ↓
Sub-REPL (smaller model)      ←→    Domain Expert (haiku/sonnet)
   ↓                                    ↓
Result Collection             ←→    TaskOutput(block=true)
   ↓                                    ↓
Synthesis                     ←→    Orchestrator synthesizes results
```

---

## Options Considered

### Option A: Document Alignment Only (Selected)
- Create terminology mapping
- No code changes
- Reference for future decisions
- **Selected**: Low cost, high value for team alignment

### Option B: Add Research Synthesis Command
- New `/agileflow:research:synthesize` for cross-document queries
- **Deferred**: Valuable but not urgent; add to backlog

### Option C: Add Budget Management
- Token tracking across agent spawns
- **Deferred**: Complex; requires Claude API changes for token counting

### Option D: Full RLM Enhancement Suite
- B + C + query interface + deeper impact analysis
- **Deferred**: Significant effort; evaluate after core features mature

---

## Consequences

### Benefits

1. **Common Vocabulary**
   - Team can discuss patterns using established RLM terminology
   - Easier to communicate with external developers familiar with the paper

2. **Architectural Validation**
   - Confirms AgileFlow's multi-agent design aligns with research
   - Provides confidence in current approach

3. **Future Roadmap**
   - Documents enhancement opportunities (budget management, synthesis)
   - Backlog items for when capacity allows

4. **Knowledge Transfer**
   - New team members can understand system through RLM lens
   - Research note + ADR provides complete context

### Trade-offs

1. **No Immediate Feature Benefit**
   - This ADR doesn't add functionality
   - Mitigated: Low effort (1 day); high documentation value

2. **Terminology Divergence**
   - AgileFlow uses "multi-agent" not "REPL"
   - Mitigated: Mapping table bridges vocabularies

---

## Enhancement Opportunities (Future Backlog)

### 1. Research Document Synthesis
**RLM Concept**: Build dependency graphs across documents
**AgileFlow Enhancement**: `/agileflow:research:synthesize` command
- Query: "What patterns appear across my OAuth and session research?"
- Detect conflicts before implementation
- **Effort**: 3-5 days

### 2. Budget/Token Management
**RLM Concept**: Prevent runaway recursion through budgets
**AgileFlow Enhancement**: Token tracking in orchestrator
- Propagate budget from parent → child agents
- Warn before exceeding limits
- **Effort**: 5-8 days

### 3. Query Interface for Codebase
**RLM Concept**: Intelligent search over complex documents
**AgileFlow Enhancement**: Codebase query system
- "What files touch authentication?"
- Replaces load-everything approach in `obtain-context.js`
- **Effort**: 5-8 days

### 4. Deeper Impact Analysis
**RLM Concept**: Model dependencies as graphs
**AgileFlow Enhancement**: Extend `/agileflow:impact`
- 3+ level dependency analysis with smart pruning
- Circular dependency visualization
- **Effort**: 3-5 days

---

## Key Files Reference

| File | Purpose | RLM Alignment |
|------|---------|---------------|
| `packages/cli/src/core/agents/orchestrator.md` | Pure REPL wrapper (Task/TaskOutput only) | ✅ Core recursion |
| `packages/cli/src/core/agents/multi-expert.md` | Parallel expert deployment | ✅ Parallel eval |
| `packages/cli/src/core/agents/mentor.md` | End-to-end orchestration | ✅ REPL environment |
| `packages/cli/scripts/obtain-context.js` | Context gathering | ⚠️ Could use query interface |
| `docs/09-agents/status.json` | Dependency tracking | ✅ Dependency graph |
| `docs/09-agents/bus/log.jsonl` | Agent coordination | ⚠️ Limited caching |

---

## Related Documents

- [Research: RLM - Recursive Language Models](../10-research/20260117-rlm-recursive-language-models.md)
- [ADR-0003: Multi-Agent Orchestration Pattern](./adr-0003-multi-agent-orchestration.md)
- [Research: Training Knowledge vs RAG](../10-research/20260109-training-knowledge-llm-weights-vs-rag.md)
- [Orchestrator Agent](../../packages/cli/src/core/agents/orchestrator.md)
- [Multi-Expert Agent](../../packages/cli/src/core/agents/multi-expert.md)
