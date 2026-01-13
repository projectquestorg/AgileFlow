# Thread-Based Engineering - Agentic Workflows Framework

**Import Date**: 2026-01-13
**Topic**: Thread-Based Engineering mental framework for measuring agentic engineering improvement
**Source**: YouTube transcript - Andy (IndyDevDan)
**Content Type**: Video transcript

---

## Summary

Thread-Based Engineering is a mental framework for understanding and measuring improvement when working with AI coding agents. A **thread** is defined as a unit of engineering work over time, conducted by you and your agents. You show up at two mandatory nodes: the **prompt/plan** (beginning) and the **review/validation** (end). The middle is your agent doing work through tool calls.

The framework identifies **6 thread types** that represent different patterns of agentic work:
1. **Base Thread**: Single prompt → agent work → review
2. **P-Thread (Parallel)**: Multiple concurrent threads of work
3. **C-Thread (Chained)**: Multi-phase work with intentional checkpoints
4. **F-Thread (Fusion)**: Same prompt to multiple agents, then combine results
5. **B-Thread (Big)**: Meta-structure where prompts fire off other prompts (sub-agents)
6. **L-Thread (Long)**: High-autonomy, extended duration work (hours to days)

Plus a teaser **Z-Thread (Zero-touch)**: Maximum trust where the review step is eliminated entirely.

The key insight: **tool calls roughly equal impact**. Pre-2023, engineers were the tool calls. Now agents make the tool calls while engineers prompt and review. The framework connects to Boris Jaworsky's Claude Code setup (5 terminals, 5-10 background Claude sessions) and the Ralph Wiggum pattern (loop + stop hook for autonomous execution).

---

## Key Findings

### The 6 Thread Types

| Thread | Name | Description | Use Case |
|--------|------|-------------|----------|
| **Base** | Standard | Single prompt → work → review | Default for all work |
| **P** | Parallel | Multiple threads running simultaneously | Scale output, code review |
| **C** | Chained | Multi-phase with checkpoints | Production-sensitive work, context overflow |
| **F** | Fusion | Same prompt to N agents, combine results | Rapid prototyping, confidence building |
| **B** | Big | Nested threads (agents calling agents) | Orchestrator patterns, teams of agents |
| **L** | Long | High autonomy, extended duration | Overnight runs, complex features |
| **Z** | Zero-touch | No review step (maximum trust) | Advanced: when systems are fully trusted |

### 4 Ways to Improve as an Agentic Engineer

1. **Run MORE threads** - Spin up additional terminals, worktrees, background agents
2. **Run LONGER threads** - Better prompts, context management, tooling
3. **Run THICKER threads** - Sub-agents, orchestrators, agent teams
4. **Run FEWER checkpoints** - Build trust, reduce human-in-the-loop reviews

### Boris Jaworsky Setup (Claude Code Creator)

- Runs 5 Claude Codes in terminal (tabs 1-5)
- Runs 5-10 additional Claude Codes in web interface (background)
- Uses `@` symbol to kick off background sessions
- Always uses Opus 4.5
- Sets up specific permissions (not dangerously skip)
- Key tip: "Give it a way to verify its work"

### Connections to Existing Patterns

| Pattern | Thread Type | Notes |
|---------|-------------|-------|
| Ralph Wiggum | L-Thread + C-Thread | Loop over agent, stop hook for continuation |
| Sub-agents | B-Thread | Primary agent prompts sub-agents |
| Orchestrator | B-Thread | Higher-level coordination |
| Best-of-N | F-Thread | Multiple attempts, choose best |
| Agent Sandbox | F-Thread | Rapid prototyping in isolated environments |
| Plan-Build | C-Thread | Intentional phase separation |

### The Core Four

Everything in agentic engineering boils down to:
1. **Context** - What the agent knows
2. **Model** - Which LLM (Opus 4.5, etc.)
3. **Prompt** - What you ask
4. **Tools** - What actions the agent can take

---

## Implementation Approach

### Applying Thread Types in Practice

**Base Thread (Default)**
- Every prompt you send starts a base thread
- Track tool calls as proxy for work done

**P-Thread Implementation**
- Multiple terminal windows with Claude Code
- Git worktrees for isolated branches
- Use `/session:new` to spin up parallel sessions

**C-Thread Implementation**
- Use AskUserQuestion tool for checkpoints
- System notifications when phases complete
- Stop hooks for automated phase transitions

**F-Thread Implementation**
- Pthread skill/alias to spawn multiple agents
- Agent sandboxes for isolated attempts
- Consolidate results: best-of-N or cherry-pick

**B-Thread Implementation**
- Orchestrator agent pattern
- Sub-agents with Task tool
- Plan agent → Build agent → Review agent chains

**L-Thread Implementation**
- Ralph Wiggum stop hook pattern
- Clear prompts with validation loops
- Max iterations as safety guardrail

---

## Code Snippets

(No code provided in transcript - this is a conceptual framework)

---

## Action Items

- [ ] Audit current workflow against thread types - what threads are you running?
- [ ] Set up parallel terminal workflow (P-Thread)
- [ ] Review `/session:new` for worktree-based parallelism
- [ ] Ensure stop hooks are configured for L-Thread capability
- [ ] Consider agent sandbox setup for F-Thread prototyping
- [ ] Track tool calls as improvement metric

---

## Risks & Gotchas

- **Z-Thread caution**: Don't aim for zero-touch prematurely. Build trust incrementally.
- **C-Thread overhead**: Checkpoints cost time/energy. Use only when necessary (production-sensitive, context overflow).
- **F-Thread cost**: Running N agents costs N× compute. Balance confidence vs. cost.
- **L-Thread guardrails**: ALWAYS set max_iterations. Runaway agents can waste tokens.

---

## Relevance to AgileFlow

This framework **directly validates AgileFlow's architecture**:

| AgileFlow Feature | Thread Type Support |
|-------------------|---------------------|
| `/session:new` with worktrees | P-Thread (parallel sessions) |
| Orchestrator agent | B-Thread (meta-structure) |
| `/agileflow:babysit` with experts | B-Thread + C-Thread |
| Ralph Loop (ralph-loop.js) | L-Thread + C-Thread |
| Multi-expert analysis | F-Thread (fusion) |
| AskUserQuestion checkpoints | C-Thread phases |

**Potential enhancements:**
- Add thread-type metrics to session tracking
- Tool call counting as improvement metric
- P-Thread orchestration commands

---

## References

- Source: YouTube transcript - IndyDevDan (Andy Devdan)
- Related research: [20260101-claude-code-stop-hooks-ralph-loop.md](./20260101-claude-code-stop-hooks-ralph-loop.md)
- Related research: [20260109-ralph-wiggum-autonomous-ai-loops.md](./20260109-ralph-wiggum-autonomous-ai-loops.md)
- Related research: [20251225-top-2pct-agentic-engineer-2026.md](./20251225-top-2pct-agentic-engineer-2026.md)
- Import date: 2026-01-13
