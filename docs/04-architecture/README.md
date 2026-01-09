# Architecture Documentation

System architecture, component design, and technical documentation for AgileFlow.

---

## Reference Documentation

| Document | Description |
|----------|-------------|
| [Commands](./commands.md) | All 69 slash commands |
| [Subagents](./subagents.md) | All 28 specialized agents |
| [Skills](./skills.md) | Dynamic skill generator |

---

## System Architecture

| Document | Description |
|----------|-------------|
| [AgileFlow CLI Overview](./agileflow-cli-overview.md) | High-level system architecture |
| [Command & Agent Flow](./command-agent-flow.md) | How commands and agents work together |
| [Monorepo Setup](./monorepo-setup.md) | Repository structure |

---

## Agent Systems

| Document | Description |
|----------|-------------|
| [Agent Expert System](./agent-expert-system.md) | Self-improving agents with expertise files |
| [Multi-Expert Orchestration](./multi-expert-orchestration.md) | Parallel expert analysis and synthesis |
| [Babysit Mentor System](./babysit-mentor-system.md) | End-to-end implementation mentor |
| [Ralph Loop](./ralph-loop.md) | Autonomous story processing with test validation |
| [Unified Context Gathering](./unified-context-gathering.md) | How agents gather project context |

---

## Configuration & Session

| Document | Description |
|----------|-------------|
| [Configuration System](./configuration-system.md) | 8 configuration agents |
| [Hooks System](./hooks-system.md) | Event-driven automation |
| [Session Harness](./session-harness.md) | Test verification and session continuity |
| [PreCompact Context](./precompact-context.md) | Context preservation during compacts |

---

## Internal Systems

| Document | Description |
|----------|-------------|
| [Dynamic Content Injection](./dynamic-content-injection.md) | Auto-updating command/agent lists |

---

## Quick Reference

### System Layers

```
Presentation    →  Slash Commands, CLI Interface
Orchestration   →  Babysit, Multi-Expert, Session
Agent           →  28 Domain Experts
Expert          →  Expertise Files, Mental Models
Storage         →  status.json, docs/, bus/
```

### Key Components

- **Commands**: 69 slash commands for agile workflows
- **Agents**: 28 domain-specialized experts
- **Skills**: Dynamic generation via `/agileflow:skill:create`
- **Experts**: Self-improving knowledge bases per domain
- **State**: JSON-based tracking (status.json, bus/log.jsonl)

### Data Flow

```
User Request → Command Parser → Agent Router → Expert System → Output
                                     ↓
                              State Updates (status.json)
```

---

## Diagram Conventions

All architecture docs use [Mermaid.js](https://mermaid.js.org/) for diagrams.

See [Mermaid Research](../10-research/20251216-mermaid-js-diagramming.md) for syntax reference.

---

## Related Documentation

- [Research Notes](../10-research/) - Technical investigations
- [Decisions (ADRs)](../03-decisions/) - Architecture Decision Records
- [Practices](../02-practices/) - Development practices
