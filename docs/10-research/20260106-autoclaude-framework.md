# AutoClaude Framework

**Import Date**: 2026-01-06
**Topic**: AutoClaude Autonomous Multi-Agent Coding Framework
**Source**: YouTube video transcript (World of AI channel)
**Content Type**: Video transcript

---

## Summary

AutoClaude is an autonomous multi-agent coding framework that extends Claude Code with agent orchestration, planning layers, validation loops, and a visual UI. Unlike basic Claude Code usage, AutoClaude can plan, build, and validate software end-to-end with minimal human intervention, managing multiple Claude Code sessions simultaneously through a Kanban board interface.

The framework differentiates itself from "Ralph loop" style continuous execution - it handles task components autonomously but won't persist indefinitely burning tokens. It offers features like isolated workspaces, self-validating QA, AI-powered mergers, a memory layer (via Graphite MCP or local Ollama embeddings), and GitHub/GitLab integration.

AutoClaude is free and open-source, with both standalone app and CLI-only installation options. It supports model fallback (Opus 4.5 → Sonnet 4.5) when rate limits are hit, and can run up to 12 Claude Code agents simultaneously with real-time terminal visibility.

---

## Key Findings

- **Multi-Agent Orchestration**: Runs up to 12 Claude Code agents simultaneously with live terminal previews
- **Kanban UI**: Visual task management showing planning, coding, and validation phases
- **Spec-Driven Development**: Uses specification-first approach similar to OpenSpec/BMAD patterns
- **Model Fallback**: Intelligently transitions to backup models (e.g., Sonnet 4.5) when rate limits hit
- **Memory Layer**: Optional persistent memory via Graphite MCP server or local Ollama embeddings
- **Git Integration**: Direct GitHub/GitLab authentication and repository management
- **Human Review Mode**: Can pause for human approval on each change
- **Ideation Feature**: Generates improvement ideas categorized by code, UX/UI, security, and performance
- **Roadmap Generation**: Creates phased feature roadmaps with priorities
- **Security Scanning**: Validates code for security risks (found critical API exposure in demo)
- **MCP Support**: Works with MCP servers like Context7 for library recommendations

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                    AutoClaude UI                        │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐     │
│  │   Kanban    │  │   Agent     │  │   Ideation  │     │
│  │   Board     │  │  Terminals  │  │   Panel     │     │
│  └─────────────┘  └─────────────┘  └─────────────┘     │
├─────────────────────────────────────────────────────────┤
│                 Agent Orchestrator                       │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐   │
│  │ Planning│  │ Coding  │  │   QA    │  │ Merging │   │
│  │  Agent  │  │  Agent  │  │  Agent  │  │  Agent  │   │
│  └─────────┘  └─────────┘  └─────────┘  └─────────┘   │
├─────────────────────────────────────────────────────────┤
│         Claude Code Sessions (up to 12)                 │
├─────────────────────────────────────────────────────────┤
│  Memory Layer    │  Git Integration  │  MCP Servers    │
│  (Graphite/      │  (GitHub/GitLab)  │  (Context7)     │
│   Ollama)        │                   │                  │
└─────────────────────────────────────────────────────────┘
```

---

## Prerequisites

1. **Claude Account**: Pro/Max plan OR free account with API billing
2. **Claude Code**: Install via `npm install -g @anthropic-ai/claude-code`
3. **Git**: Required for project initialization
4. **Python 3.12+**: Required dependency

---

## Installation Options

### Option 1: Standalone App (Recommended)
- Download from releases page
- Beta releases available for latest features
- Full UI experience

### Option 2: CLI Only
- No UI, terminal-based workflow
- Lighter weight

---

## Configuration

### Agent Settings
- **Profile**: Optimized/Auto mode recommended
- **Model Selection**: Per-phase model assignment (Planning/Coding/QA)
- **Fallback Models**: Auto-transition when limits hit

### Memory Settings
- Graphite MCP server integration
- Local Ollama embedding provider
- OpenAI embeddings (recommended)

### Git Settings
- GitHub/GitLab CLI authentication
- Repository linking

---

## Workflow

1. **Create Task**: Describe what you want to build
2. **Planning Phase**: AutoClaude creates spec-driven plans for sub-agents
3. **Coding Phase**: Multiple agents work on components
4. **Validation Phase**: QA agent validates with tests
5. **Review**: Human review mode available
6. **Merge**: AI-powered merging of agent work

---

## Action Items

- [ ] Research AutoClaude GitHub repository for installation details
- [ ] Evaluate AutoClaude vs AgileFlow feature overlap
- [ ] Consider integrating similar Kanban visualization into AgileFlow
- [ ] Explore Graphite MCP server for memory layer ideas
- [ ] Investigate model fallback patterns for AgileFlow agents
- [ ] Review ideation/security scanning features for potential adoption

---

## Risks & Gotchas

- **API Key Setup**: Manual API key paste required if not using Pro/Max subscription
- **Beta Bugs**: Beta releases have more features but potentially more issues
- **Token Usage**: Autonomous operation can consume significant tokens
- **Not Ralph Loop**: Won't persist indefinitely like Ralph loop pattern - bounded autonomy

---

## Comparison: AutoClaude vs AgileFlow

| Feature | AutoClaude | AgileFlow |
|---------|------------|-----------|
| Multi-agent orchestration | Visual UI | CLI-based |
| Kanban board | Built-in | External tools |
| Memory layer | Graphite/Ollama | Not implemented |
| Model fallback | Automatic | Manual |
| Spec-driven development | Built-in | Via skills |
| Git integration | GitHub/GitLab | Git hooks |
| Security scanning | Built-in | Manual review |
| Ideation | Categorized | Manual brainstorm |
| Open source | Yes | Yes |

---

## Story Suggestions

### Potential Epic: Visual Agent Dashboard

**US-XXXX**: Kanban Board for Agent Tasks
- AC: Given multiple agents running, when user opens dashboard, then see all tasks with status

**US-XXXX**: Agent Terminal Live Preview
- AC: Given agents working, when user views terminals, then see real-time output

**US-XXXX**: Model Fallback Configuration
- AC: Given rate limit hit, when agent needs to continue, then automatically switch to fallback model

---

## References

- Source: YouTube video transcript (World of AI channel)
- Import date: 2026-01-06
- Related: [Claude Code Stop Hooks & Ralph Loop](./20260101-claude-code-stop-hooks-ralph-loop.md)
