# Context Engineering: Research-Plan-Implement (RPI) Workflow

This practice guide documents Dex's RPI workflow for maximizing AI coding agent effectiveness. Based on research from [Context Engineering for Coding Agents](../10-research/20260113-context-engineering-coding-agents.md).

---

## Overview

LLMs are stateless - every tool call decision is influenced ONLY by the current context window. The only way to get better output is to provide better input context. Most teams experience "slop" (low-quality AI output requiring constant rework) because they fail to manage context windows properly.

The solution: **Frequent Intentional Compaction** through the Research-Plan-Implement workflow.

---

## The Dumb Zone Problem

When you fill more than ~40% of your context window, agent performance degrades significantly.

| Context Utilization | Performance |
|--------------------|-------------|
| 0-40% | **Smart Zone** - Full reasoning capability |
| 40-70% | **Diminishing Returns** - Reduced quality |
| 70%+ | **Dumb Zone** - Significant degradation |

### How Context Gets Filled
- File searching and reading
- Understanding code flow
- Editing files
- Test and build output
- MCP tool responses (especially JSON-heavy ones)

### Signs You're In The Dumb Zone
- Agent starts making obvious mistakes
- Responses become repetitive or generic
- Claude says "I understand your concern" after corrections
- Tool calls become less accurate

---

## The Solution: Frequent Intentional Compaction

Instead of waiting until auto-compact at ~90%, **proactively compress context at phase boundaries**.

Each phase produces a markdown artifact that compresses the previous phase's understanding. Fresh context windows can start with compressed truth rather than raw exploration.

---

## The Three Phases

### Phase 1: Research

**Purpose**: Understand how the system works before changing it.

**When to use**:
- Complex features in brownfield code
- Unfamiliar areas of the codebase
- Multi-repo or cross-domain work

**Commands**:
```
/agileflow:research:ask [topic]     # Generate research prompt for external AI
# Paste results from ChatGPT/Claude/Perplexity
/agileflow:research:import [topic]  # Save and format research
```

**Output**: `docs/10-research/YYYYMMDD-topic.md` containing:
- Exact files and line numbers that matter
- How the system works (based on code, not docs)
- Key patterns and constraints discovered

**Then**: Start a **new conversation** for the plan phase. The research artifact is your compressed context.

### Phase 2: Plan

**Purpose**: Compress intent into executable steps before writing code.

**When to use**:
- Any feature beyond trivial changes
- After completing research phase
- Before multi-file modifications

**Commands**:
```
EnterPlanMode                       # Read-only exploration mode
/agileflow:mentor                   # Orchestrated planning with mentor
```

**Output**: Plan file containing:
- Exact steps with file names and line numbers
- **Actual code snippets** (not pseudocode)
- Testing strategy per change
- Edge cases and risks

**Then**: Review the plan with your team (or yourself). Start a **new conversation** for implementation.

### Phase 3: Implement

**Purpose**: Execute the plan step-by-step.

**When to use**:
- After plan is reviewed and approved
- With fresh context window

**Commands**:
```
# Reference your plan file
"Implement the plan from [plan-file.md], starting with step 1"
```

**Guidelines**:
- Keep context low - the plan has compressed all the intent
- Test after each change
- Follow the plan exactly (don't deviate without replanning)
- A weak model can execute a good plan

---

## Sub-Agent Exploration Pattern

Sub-agents are for **context control**, NOT for anthropomorphizing roles.

### Wrong Way
```
"Create a frontend sub-agent and a backend sub-agent"
```

### Right Way
```
"Fork a sub-agent to explore how authentication works, then return:
- Which files handle auth
- The key function names and signatures
- Any relevant configuration"
```

### Pattern
1. Fork context with sub-agent (Task tool)
2. Sub-agent explores fully (lots of tokens consumed)
3. Returns **compressed findings** (few tokens)
4. Main agent continues with fresh context + compressed knowledge

---

## Scaling Guide

| Task Complexity | Approach |
|-----------------|----------|
| Button color change | Just talk to agent directly |
| Single-file fix | Quick plan (mental or brief) |
| Multi-file feature | Plan → Implement |
| Complex brownfield | Research → Plan → Implement |
| Multi-repo integration | Full RPI with iteration |

### It Takes Reps
- No perfect prompt exists
- You will get the balance wrong many times
- Pick one tool and build experience
- Don't minmax across multiple AI tools

---

## Leverage Math

```
Bad line of code        = 1 bad line
Bad part of plan        = 100+ bad lines
Bad line of research    = entire direction is hosed
```

Human review should focus on the **highest leverage points**:
1. Research quality (is our understanding correct?)
2. Plan quality (are these the right steps?)
3. Code quality (implementation details)

---

## Anti-Patterns

### Anthropomorphizing Sub-Agents
```
# Don't do this:
"Create a frontend sub-agent, a backend sub-agent, and a QA sub-agent"

# Do this instead:
"Fork a sub-agent to explore how the API endpoints work"
```

### Negative Trajectory
If you keep correcting the agent and it keeps making mistakes, the model sees:
```
Human: Do X
Agent: [does wrong thing]
Human: No, I said X!
Agent: [does wrong thing]
Human: WRONG!
```

The next most likely token is... another wrong thing. **Start fresh instead.**

### Ignoring "I Understand Your Concern"
When Claude says this, you're in a negative trajectory. Time to:
1. Compact intentionally
2. Start a new conversation
3. Provide clearer context up front

### Skipping Plan Review
Bad plans produce hundreds of bad lines of code. Always review before implementing.

### Documentation Over Code
From most truthful to most lies:
1. Actual code (source of truth)
2. Function names
3. Comments
4. Documentation

Prefer on-demand compressed context (research phase) over maintained documentation.

---

## Mental Alignment

Code review's true purpose: keeping the team on the same page about how and why the codebase is changing.

With 2-3x more code shipping via AI:
- Review **plans** with peers, not just diffs
- Include your journey (research, reasoning) on PRs
- Plans serve as compressed explanation of intent

---

## Related Commands

| Command | Purpose |
|---------|---------|
| `/agileflow:research:ask` | Generate research prompts |
| `/agileflow:research:import` | Save research artifacts |
| `/agileflow:research:analyze` | Analyze for implementation |
| `/agileflow:mentor` | Orchestrated development |
| `/agileflow:compress` | Status.json compaction |
| `EnterPlanMode` | Read-only exploration |

---

## Related Research

- [Context Engineering for Coding Agents](../10-research/20260113-context-engineering-coding-agents.md) - Source research
- [Context Engineering Principles](../10-research/20260109-context-engineering-principles.md) - General framework
- [Thread-Based Engineering](../10-research/20260113-thread-based-engineering-agentic-workflows.md) - Measurement framework
