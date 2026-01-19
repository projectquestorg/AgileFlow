# GSD (Get Stuff Done) - Claude Code Workflow System

**Date**: 2026-01-19
**Source**: YouTube Livestream by Tash (4+ hours)
**Topic**: Meta-prompting system for Claude Code development workflows

## Executive Summary

GSD is a comprehensive meta-prompting framework for Claude Code that implements phased development workflows, sub-agent architecture, context management, and milestone-based completion tracking. The system emphasizes staying under 50% context utilization through structured phases and delegated sub-agents.

## Key Concepts

### 1. Core Philosophy

- **Context Budget**: Stay under 50% context utilization at all times
- **Phased Development**: Break work into discrete phases with clear boundaries
- **Sub-Agent Delegation**: Use specialized agents for specific tasks
- **Milestone Tracking**: Track progress through defined milestones per phase

### 2. Workflow Phases

The GSD system defines a structured workflow progression:

```
new project → research project → define requirements → create roadmap → plan phase → execute phase → audit milestone → complete milestone
```

**Phase Details:**

| Phase | Purpose | Output |
|-------|---------|--------|
| New Project | Initialize project structure | Project skeleton, CLAUDE.md |
| Research Project | Gather technical context | Research notes, API docs |
| Define Requirements | Capture what needs to be built | Requirements document |
| Create Roadmap | High-level feature breakdown | Roadmap with milestones |
| Plan Phase | Detailed planning for current phase | Phase plan with tasks |
| Execute Phase | Implementation work | Working code |
| Audit Milestone | Verify completion criteria | Audit report |
| Complete Milestone | Mark work as done | Updated status |

### 3. Sub-Agent Architecture

GSD uses specialized sub-agents for different tasks:

| Agent | Role | When Used |
|-------|------|-----------|
| GSD Executor | Runs implementation tasks | During execute phase |
| GSD Verifier | Validates work completion | During audit milestone |
| GSD Debugger | Fixes issues and errors | When tests fail |
| GSD Researcher | Gathers information | During research phase |

### 4. Parallel Plan Execution

Multiple plans within a phase can execute simultaneously:
- Each plan runs as independent sub-agent
- Results aggregated at phase completion
- Parallelization reduces total execution time

### 5. Milestone Workflow

```
audit milestone → complete milestone → discuss milestone → new milestone
```

- **Audit**: Review what was accomplished vs. planned
- **Complete**: Mark milestone as done, update tracking
- **Discuss**: Reflect on learnings, identify gaps
- **New**: Plan next milestone

## Installation & Setup

GSD is installed as a Claude Code command system:

1. Clone/copy GSD commands to `.claude/commands/gsd/`
2. Commands appear as `/gsd:*` in Claude Code
3. Run `/gsd:new-project` to initialize

## Key Techniques

### Context Management

1. **Phase Isolation**: Each phase starts with fresh context
2. **Summary Handoffs**: End each phase with summary for next phase
3. **Sub-Agent Delegation**: Offload tasks to reduce main context
4. **50% Rule**: Never exceed 50% context utilization

### Structured Prompting

GSD uses structured prompts with:
- Clear phase boundaries
- Explicit completion criteria
- Context-aware instructions
- Handoff summaries

### Progress Tracking

Track progress via:
- Roadmap documents (high-level)
- Phase plans (detailed)
- Milestone status (completion)
- Audit reports (verification)

## Demo Application: Sample Digger

The livestream demonstrated building "Sample Digger" - a Mac app for AI-powered local music sample generation:

**Tech Stack:**
- Swift/SwiftUI for Mac native app
- MusicGPT/MusicGen (Meta's AI music model)
- Local inference (no API calls)
- CoreML for on-device processing

**Features Built:**
- Audio sample generation from text prompts
- Local model download and caching
- Waveform visualization
- Sample library management
- Export to audio formats

## Tools Mentioned

### Claude Code Router

Tool for using different AI models with Claude Code interface:
- Swap models (MiniMax, Gemini, etc.) while keeping Claude Code UX
- Useful for cost optimization or capability comparison
- Maintains familiar workflow with different backends

### MCP Integration

GSD integrates with MCP servers for:
- File system access
- External API calls
- Tool execution

## Key Insights

### 1. Meta-Prompting Value

> "The system prompt is the most valuable real estate in AI development"

GSD's value is in the structured meta-prompts that guide Claude through complex workflows.

### 2. Context Efficiency

> "50% context is where things start degrading"

Keeping context lean prevents the "dumb zone" where model performance drops.

### 3. Phased Approach Benefits

- Clear boundaries prevent scope creep
- Easier to audit and verify
- Natural checkpoints for course correction
- Parallel execution opportunities

### 4. Sub-Agent Patterns

Sub-agents provide:
- Context isolation (fresh start)
- Specialized focus (one job)
- Parallel execution (concurrent work)
- Clear handoffs (structured summaries)

## Comparison to AgileFlow

| Aspect | GSD | AgileFlow |
|--------|-----|-----------|
| Philosophy | Phased workflows | Story-driven development |
| Context Mgmt | 50% rule, phases | PreCompact, sub-agents |
| Tracking | Milestones | User stories, epics |
| Agents | 4 specialized | 25+ domain experts |
| Focus | Solo development | Team/project workflows |

## Action Items

- [ ] **Evaluate GSD Phases**: Consider if phased workflow model could enhance AgileFlow
- [ ] **50% Context Rule**: Validate if this threshold applies to AgileFlow patterns
- [ ] **Milestone Concept**: Explore adding milestone tracking to story workflow
- [ ] **Parallel Execution**: Research opportunities for parallel plan execution

## Code Snippets

### Phase Transition Pattern

```markdown
## Phase Complete: Research

### Summary
- Explored MusicGPT library capabilities
- Identified CoreML conversion requirements
- Documented API endpoints

### Handoff to Next Phase
Context for Define Requirements:
- Model: MusicGPT (Meta's MusicGen)
- Platform: macOS 14+
- Key constraint: Offline-first

### Recommended Next Command
/gsd:define-requirements
```

### Sub-Agent Delegation

```markdown
## Delegating to GSD Executor

Task: Implement audio waveform visualization
Context: Using SwiftUI, AVFoundation
Constraints: Real-time updates, <16ms frame budget

Expected Output:
- WaveformView.swift component
- Unit tests
- Integration with player
```

## Related Research

- [Context Engineering for Coding Agents](./20260113-context-engineering-coding-agents.md) - Dex's RPI workflow
- [Ralph Loop + TDD](./20260109-ralph-loop-tdd-ui-workflow.md) - Autonomous loop patterns
- [Thread-Based Engineering](./20260113-thread-based-engineering-agentic-workflows.md) - Agentic workflow mental models

## Source

YouTube livestream: "Building Apps with GSD and Claude Code" by Tash (~4 hours)
- Demonstrates complete app build from scratch
- Shows GSD workflow in practice
- Includes Swift/SwiftUI Mac development
