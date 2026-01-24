# Synthesis: Context Engineering (v2)

**Type**: Synthesis (cross-research analysis)
**Date**: 2026-01-23
**Files Analyzed**: 7
**Consensus Items**: 5
**Conflicts Found**: 2 (1 resolved, 1 new)
**Prior Synthesis**: 20260117-synthesis-context-engineering.md

---

## Summary

Updated cross-document synthesis of context engineering research from 7 files spanning 2026-01-09 to 2026-01-19. Builds on the prior synthesis (2026-01-17) which covered 3 files. Key additions: Thread-Based Engineering mental model, RLM (Recursive Language Models) theory and implementation.

**Major resolution**: The prior synthesis flagged 40% vs 70% context threshold as a conflict. RLM research resolves this by introducing task complexity as the second variable - it's not a fixed threshold but a function of **both** context size **and** task complexity (internal document self-referencing).

---

## Files Analyzed

| Date | Title | Source | Status |
|------|-------|--------|--------|
| 2026-01-09 | [Context Engineering Principles](./20260109-context-engineering-principles.md) | YouTube transcript | Active |
| 2026-01-13 | [Context Engineering for Coding Agents](./20260113-context-engineering-coding-agents.md) | Conference talk (Dex) | Active |
| 2026-01-13 | [Context Engineering for Rapid Prototyping](./20260113-context-engineering-rpi.md) | Tutorial video | Active |
| 2026-01-13 | [Thread-Based Engineering](./20260113-thread-based-engineering-agentic-workflows.md) | YouTube (IndyDevDan) | Active |
| 2026-01-17 | [RLM - Recursive Language Models](./20260117-rlm-recursive-language-models.md) | Video transcript | Active |
| 2026-01-17 | [Prior Synthesis: Context Engineering](./20260117-synthesis-context-engineering.md) | Synthesis | Superseded by this file |
| 2026-01-19 | [RLM Claude Code Implementation](./20260119-rlm-claude-code-implementation.md) | Tutorial video | Active |

---

## Consensus Findings (HIGH CONFIDENCE)

These findings appear in 3+ research notes:

### 1. Progressive Disclosure is Critical
**Sources**: 4 files (principles, coding-agents, rpi, rlm)

Reveal only what's needed for the current task. First file calls it "the #1 principle", Dex recommends directory-level CLAUDE.md files, RLM takes it further with "context virtualization" (document stored outside LLM, only relevant chunks fed in).

### 2. Sub-Agents for Context Control, Not Roles
**Sources**: 4 files (principles, coding-agents, thread-based, rlm-implementation)

*Not* "frontend agent, backend agent, QA agent" - sub-agents are for forking context to explore, then returning compressed findings. Thread-based engineering calls this "B-Thread" (Big Thread). RLM implementation uses Haiku sub-agent specifically for search operations.

### 3. Research Before Implementation (RPI Pattern)
**Sources**: 3 files (coding-agents, rpi, thread-based)

Front-load research into artifacts before coding:
- Dex: Research → Plan → Implement workflow
- RPI: Perplexity → spec.md → Claude Code ("Prompt Playbook")
- Thread-based: C-Thread (Chained) with intentional checkpoints

### 4. Context Window Has Practical Limits << Advertised
**Sources**: 4 files (principles, coding-agents, rlm, rlm-implementation)

| File | Threshold | Context |
|------|-----------|---------|
| principles | 70% | "Attention budget" - hallucinations above |
| coding-agents | 40% | "Dumb zone" for complex brownfield |
| RLM | Complexity-dependent | Context rot + task complexity interaction |

**Resolution**: 40% is target for complex work; 70% is hard limit. RLM argues it's not just size but **task complexity** (internal self-referencing) that causes context rot.

### 5. Structured Note-Taking / External Artifacts
**Sources**: 4 files (principles, coding-agents, rpi, rlm-implementation)

Externalize context to markdown files that survive compaction. The RLM pattern takes this further: virtualize data as Python objects completely outside LLM context.

---

## Unique Insights (VERIFY)

| Finding | Source | Age | Assessment |
|---------|--------|-----|------------|
| **6 Thread Types** (Base/P/C/F/B/L/Z) | thread-based | 10 days | Comprehensive mental model for agentic work |
| **REPL + Recursion** for complex docs | RLM | 6 days | Novel approach beyond RAG |
| **Leverage Math**: Bad research = 100s bad code lines | coding-agents | 10 days | Key insight for review prioritization |
| **File Format Token Efficiency** (YAML > MD > XML > JSON) | principles | 14 days | Practical, actionable |
| **Context Virtualization** via Python pickle | rlm-implementation | 4 days | Implementation pattern for RLM |
| **Documentation Feeding**: @api-docs.md pattern | rpi | 10 days | Solves training cutoff |

---

## Conflicts Detected (NEEDS REVIEW)

### 1. Context Utilization Threshold (RESOLVED)

| File | Threshold | Use Case |
|------|-----------|----------|
| principles | 70% | General guidance |
| coding-agents | 40% | Complex brownfield codebases |
| RLM | Complexity-dependent | Size × complexity interaction |

**Resolution**: The RLM research resolves this - it's not a fixed threshold but a function of **both** context size **and** task complexity (internal document self-referencing). Use 40% for complex multi-hop reasoning, 70% for simpler tasks.

### 2. RAG vs RLM for Document Search (NEW)

| Approach | Files | Argument |
|----------|-------|----------|
| RAG is sufficient | (implicit in earlier research) | Works for semantic similarity |
| RAG fails for complexity | RLM, rlm-implementation | Can't do multi-hop logical reasoning |

**Resolution**: RAG works for simple lookups; RLM with programmatic search needed for complex, cross-referenced documents (legal contracts, codebases).

---

## Technology Patterns

| Concept | Mentions | First Seen | Most Recent |
|---------|----------|------------|-------------|
| Progressive Disclosure | 5 files | 2026-01-09 | 2026-01-19 |
| Sub-Agent Isolation | 5 files | 2026-01-09 | 2026-01-19 |
| RPI Workflow | 3 files | 2026-01-13 | 2026-01-17 |
| Compaction | 3 files | 2026-01-09 | 2026-01-17 |
| REPL/Programmatic Search | 2 files | 2026-01-17 | 2026-01-19 |
| Thread-Based Engineering | 1 file | 2026-01-13 | 2026-01-13 |
| Context Virtualization | 2 files | 2026-01-17 | 2026-01-19 |

---

## Evolution Since Prior Synthesis (2026-01-17)

The prior synthesis covered 3 files. This updated synthesis adds:

1. **Thread-Based Engineering** - Mental model for measuring agentic improvement (6 thread types)
2. **RLM Theory** - Why context + complexity causes rot, dependency graph model
3. **RLM Implementation** - Practical Claude Code implementation with REPL + sub-agent

**Key advancement**: The prior synthesis flagged 40% vs 70% as a conflict. The RLM research **resolves this** by introducing task complexity as the second variable.

---

## Related Artifacts

- **Epic**: EP-0014 (Context Engineering Workflow Enhancements - COMPLETE)
- **ADR**: ADR-0008 (RLM Pattern Alignment)
- **Prior Synthesis**: 20260117-synthesis-context-engineering.md (superseded)

---

## Actionable Recommendations

Based on this synthesis:

| Priority | Action | Based On | Status |
|----------|--------|----------|--------|
| HIGH | Implement context virtualization for `/agileflow:research:analyze` | RLM implementation | ✅ COMPLETE (EP-0027) |
| HIGH | Add task complexity assessment to context health | RLM theory | ✅ COMPLETE (US-0183) |
| MEDIUM | Create Thread Type tracking in session metrics | thread-based | PENDING |
| MEDIUM | Document "Prompt Playbook" pattern (Perplexity → spec → Claude) | rpi | PENDING |
| LOW | Audit JSON configs for YAML conversion | principles | PENDING |

### Implementation Notes (2026-01-23)

**EP-0027: RLM Document Analysis System** - COMPLETE

Implemented:
- `document-repl.js` - REPL engine for virtualized document operations (~700 lines)
- `rlm-subcore.md` - Haiku sub-agent for search-only operations
- `/agileflow:rlm` - Main command for RLM document analysis
- Task complexity indicator in status line (◆HIGH/◇MED based on scoring)
- RLM integration in `/agileflow:research:analyze` (auto-detect when needed)
- 40 unit tests for document-repl.js

Key files:
- `packages/cli/scripts/document-repl.js`
- `packages/cli/src/core/agents/rlm-subcore.md`
- `packages/cli/src/core/commands/rlm.md`
- `packages/cli/scripts/agileflow-statusline.sh` (complexity assessment)

---

## References

- Generated by `/agileflow:research:synthesize TOPIC="context engineering"`
- RLM concepts applied: dependency graph over documents, cross-document pattern detection
- Prior synthesis: [20260117-synthesis-context-engineering.md](./20260117-synthesis-context-engineering.md)
