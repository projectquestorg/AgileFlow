# Thread-Based Engineering

A mental framework for measuring improvement when working with AI coding agents.

> **Research**: [20260113-thread-based-engineering-agentic-workflows.md](../10-research/20260113-thread-based-engineering-agentic-workflows.md)
> **Source**: IndyDevDan (Andy Devdan)

---

## Overview

**Thread-Based Engineering** defines a **thread** as a unit of engineering work over time, conducted by you and your agents. You show up at two mandatory nodes:

1. **Beginning**: The prompt or plan
2. **End**: The review or validation

The middle is your agent doing work through **tool calls**.

```
┌─────────┐     ┌─────────────────┐     ┌─────────┐
│ PROMPT  │ ──▶ │  AGENT WORK     │ ──▶ │ REVIEW  │
│ (you)   │     │  (tool calls)   │     │ (you)   │
└─────────┘     └─────────────────┘     └─────────┘
```

**Key insight**: Tool calls roughly equal impact. Pre-2023, engineers were the tool calls. Now agents make the tool calls while engineers prompt and review.

---

## The 6 Thread Types

| Thread | Name | Description | Complexity |
|--------|------|-------------|------------|
| **Base** | Standard | Single prompt → agent work → review | Simple |
| **P** | Parallel | Multiple threads running simultaneously | Medium |
| **C** | Chained | Multi-phase work with intentional checkpoints | Medium |
| **F** | Fusion | Same prompt to multiple agents, combine results | Advanced |
| **B** | Big | Meta-structure: prompts fire off other prompts | Advanced |
| **L** | Long | High-autonomy, extended duration work | Advanced |
| **Z** | Zero-touch | Maximum trust, no review step | Expert |

---

## Thread Types in AgileFlow

### Base Thread (Default)

**Every prompt is a base thread.** Nothing special to configure.

```bash
# You're already running base threads
claude "What does this codebase do?"
```

**When to use**: Default for all simple tasks.

---

### P-Thread (Parallel)

Run multiple agents simultaneously on different tasks.

**AgileFlow Features**:
- `/agileflow:session:new` - Create parallel worktree sessions
- `Task(run_in_background: true)` - Spawn async sub-agents
- `/agileflow:multi-expert` - Multiple domain experts analyze in parallel

**Example - Parallel Worktrees**:
```bash
# Terminal 1: Main session
/agileflow:babysit  # Working on US-0042

# Terminal 2: New parallel session
/agileflow:session:new
# → Creates ../project-2 worktree
# → Registers Session 2 in registry
```

**Example - Parallel Sub-Agents**:
```xml
<!-- Spawn multiple experts simultaneously -->
<invoke name="Task">
  <parameter name="subagent_type">agileflow-api</parameter>
  <parameter name="run_in_background">true</parameter>
  <parameter name="prompt">Review the authentication flow</parameter>
</invoke>

<invoke name="Task">
  <parameter name="subagent_type">agileflow-security</parameter>
  <parameter name="run_in_background">true</parameter>
  <parameter name="prompt">Audit the authentication flow</parameter>
</invoke>
```

**When to use**:
- Code review from multiple perspectives
- Running independent tasks simultaneously
- Scaling output through parallelism

---

### C-Thread (Chained)

Multi-phase work with intentional checkpoints between phases.

**AgileFlow Features**:
- `EnterPlanMode` / `ExitPlanMode` - Plan then execute
- `AskUserQuestion` - Checkpoint for user input
- Stop hooks - Automated phase transitions

**Example - Plan-Execute Pattern**:
```
Phase 1: Planning
→ EnterPlanMode
→ Explore codebase
→ Design approach
→ ExitPlanMode (checkpoint: user approval)

Phase 2: Execution
→ Implement plan
→ Run tests
→ AskUserQuestion (checkpoint: continue or adjust?)

Phase 3: Review
→ Final verification
→ PR creation
```

**When to use**:
- Production-sensitive work (migrations, deploys)
- Work that exceeds context window
- High-risk changes requiring validation between steps

**Anti-pattern**: Don't use C-threads for simple tasks. Checkpoints cost time/energy.

---

### F-Thread (Fusion)

Send the same (or similar) prompt to multiple agents, then combine results.

**AgileFlow Features**:
- `/agileflow:multi-expert` - 3-5 domain experts analyze same problem
- Orchestrator with `join_strategy: majority` - Consensus-based decisions

**Example - Multi-Expert Analysis**:
```bash
/agileflow:multi-expert Is our authentication implementation secure?
```

The multi-expert agent:
1. Spawns 3-5 domain experts (security, api, testing, etc.)
2. Each analyzes independently
3. Synthesizes results with confidence scoring:
   - **HIGH**: 3+ experts agree
   - **MEDIUM**: 2 experts agree
   - **LOW**: 1 expert only

**When to use**:
- Critical decisions requiring high confidence
- Rapid prototyping (compare approaches)
- Architecture reviews
- Security audits

**Cost consideration**: Running N agents costs N× compute. Balance confidence vs. cost.

---

### B-Thread (Big/Nested)

Meta-structure where prompts fire off other prompts. Agents calling agents.

**AgileFlow Features**:
- `/agileflow:babysit` with orchestrator delegation
- `agileflow-orchestrator` - Pure orchestrator (only Task/TaskOutput)
- Nested loops (agent-loop.js)

**Example - Orchestrator Pattern**:
```
User: "Add user profile with API and UI"
       ↓
Babysit (mentor)
       ↓
Task(subagent_type: "agileflow-orchestrator")
       ↓
Orchestrator spawns in parallel:
  ├─ Task(agileflow-api) → Creates /api/profile endpoint
  ├─ Task(agileflow-ui) → Creates ProfilePage component
  └─ Task(agileflow-testing) → Writes tests
       ↓
Orchestrator synthesizes results
       ↓
Returns unified outcome to mentor
```

**Nested Loops** (stable v2.85+):
```
Orchestrator → Domain Expert with quality gate
                    ↓
              agent-loop.js
              (isolated state per expert)
                    ↓
              Iterate until gate passes:
                - coverage ≥ 80%
                - visual verification
                - all tests passing
```

**When to use**:
- Multi-domain features (API + UI + Database)
- Complex orchestration
- Team-of-agents patterns

---

### L-Thread (Long)

High-autonomy, extended duration work. Runs for hours to days.

**AgileFlow Features**:
- `/agileflow:babysit EPIC=EP-XXXX MODE=loop MAX=20`
- `ralph-loop.js` - Autonomous story processing
- Stop hooks - Re-feed context after completion

**Example - Ralph Loop**:
```bash
# Autonomous overnight execution
/agileflow:babysit EPIC=EP-0042 MODE=loop MAX=20
```

The loop:
1. Picks first "ready" story
2. Implements with tests
3. Stop hook runs: tests pass? → mark complete, load next
4. Loop continues until epic done or max iterations

**Boris Jaworsky Setup**:
- 5 Claude Codes in terminal (tabs 1-5)
- 5-10 additional in web interface (background)
- Stop hook for verification
- 1+ day runs are common

**When to use**:
- Well-defined epics with clear acceptance criteria
- Test-driven development (tests define "done")
- Overnight batch processing

**Safety**: ALWAYS set max_iterations. Runaway agents waste tokens.

---

### Z-Thread (Zero-Touch)

**Advanced/Future**: Maximum trust where the review step is eliminated.

```
┌─────────┐     ┌─────────────────┐
│ PROMPT  │ ──▶ │  AGENT WORK     │ ──▶ (deployed)
│ (you)   │     │  (tool calls)   │
└─────────┘     └─────────────────┘
                       │
                 No review needed
```

**Not yet implemented** in AgileFlow. Requires:
- High trust in agent + tooling
- Comprehensive automated verification
- Clear rollback mechanisms

**The goal**: Build trust incrementally until review step becomes optional.

---

## Decision Tree: Which Thread to Use?

```
START
  │
  ├─▶ Is this a simple, single task?
  │     └─▶ YES → Base Thread
  │
  ├─▶ Can work be done in parallel?
  │     └─▶ YES → P-Thread (parallel sessions/agents)
  │
  ├─▶ Is this production-sensitive or very large?
  │     └─▶ YES → C-Thread (chained phases)
  │
  ├─▶ Need high confidence from multiple perspectives?
  │     └─▶ YES → F-Thread (fusion/multi-expert)
  │
  ├─▶ Spans multiple domains (API + UI + DB)?
  │     └─▶ YES → B-Thread (orchestrator)
  │
  ├─▶ Well-defined work that can run autonomously?
  │     └─▶ YES → L-Thread (ralph loop)
  │
  └─▶ OTHERWISE → Base Thread
```

---

## 4 Ways to Improve as an Agentic Engineer

The Thread-Based Engineering framework gives you four concrete ways to measure improvement:

### 1. Run MORE Threads

**Indicator**: How many parallel sessions/agents can you manage?

| Level | Threads | Example |
|-------|---------|---------|
| Beginner | 1 | Single Claude Code terminal |
| Intermediate | 2-3 | Main + worktree sessions |
| Advanced | 5+ | Boris setup: 5 terminal + 5-10 web |

**AgileFlow tools**:
- `/agileflow:session:new` for worktrees
- `Task(run_in_background: true)` for parallel agents

### 2. Run LONGER Threads

**Indicator**: How many tool calls before needing human intervention?

| Level | Duration | Tool Calls |
|-------|----------|------------|
| Beginner | Minutes | 5-20 |
| Intermediate | Hours | 50-200 |
| Advanced | Days | 500+ |

**AgileFlow tools**:
- Ralph Loop with MAX=20+
- Clear acceptance criteria
- Automated test verification

### 3. Run THICKER Threads

**Indicator**: How many nested threads per prompt?

| Level | Depth | Pattern |
|-------|-------|---------|
| Beginner | 1 | Direct prompting |
| Intermediate | 2 | Sub-agents |
| Advanced | 3+ | Orchestrator → experts → sub-tasks |

**AgileFlow tools**:
- `agileflow-orchestrator` for B-threads
- Nested loops for quality gates

### 4. Run FEWER Checkpoints

**Indicator**: How much can you trust without reviewing?

| Level | Checkpoints | Trust |
|-------|-------------|-------|
| Beginner | Every step | Low |
| Intermediate | Key decisions | Medium |
| Advanced | Exceptions only | High |

**AgileFlow tools**:
- Stop hooks for automated verification
- Quality gates (tests, coverage, visual)
- Discretion conditions

---

## Measuring Improvement (Proxy Metrics)

Until Claude Code exposes tool call metrics API, use these proxies:

| Metric | What It Measures | How to Track |
|--------|------------------|--------------|
| Sessions per day | Parallelism | `/agileflow:session:history` |
| Stories per session | Throughput | `status.json` completed counts |
| Loop iterations | Autonomy duration | `ralph_loop.iteration` in session state |
| Multi-expert usage | Fusion frequency | Count `/agileflow:multi-expert` invocations |

**Future**: When Claude Code API exposes tool call counts, track:
- Tool calls per session
- Max chain length
- Cost per story

---

## Quick Reference

| I want to... | Use this thread type | AgileFlow command |
|--------------|----------------------|-------------------|
| Do a simple task | Base | (default) |
| Work on multiple things | P-Thread | `/agileflow:session:new` |
| Break work into phases | C-Thread | `EnterPlanMode` |
| Get high-confidence answer | F-Thread | `/agileflow:multi-expert` |
| Coordinate multiple domains | B-Thread | Orchestrator via babysit |
| Run autonomously overnight | L-Thread | `/agileflow:babysit MODE=loop` |

---

## The Core Four

Everything in agentic engineering boils down to four elements:

1. **Context** - What the agent knows
2. **Model** - Which LLM (Claude Opus 4.5, etc.)
3. **Prompt** - What you ask
4. **Tools** - What actions the agent can take

Thread types are patterns built on top of these fundamentals.

---

## References

- Research: [20260113-thread-based-engineering-agentic-workflows.md](../10-research/20260113-thread-based-engineering-agentic-workflows.md)
- Parallel patterns: [async-agent-spawning.md](./async-agent-spawning.md)
- Best-of-N: [best-of-n-pattern.md](./best-of-n-pattern.md)
- Trust metrics: [trust-metrics.md](./trust-metrics.md)
