<p align="center">
  <img src="assets/banner.png" alt="AgileFlow" />
</p>

[![npm version](https://img.shields.io/npm/v/agileflow?color=brightgreen)](https://www.npmjs.com/package/agileflow)
[![Commands](https://img.shields.io/badge/commands-73-blue)](docs/04-architecture/commands.md)
[![Agents/Experts](https://img.shields.io/badge/agents%2Fexperts-29-orange)](docs/04-architecture/subagents.md)
[![Skills](https://img.shields.io/badge/skills-dynamic-purple)](docs/04-architecture/skills.md)

**AI-driven agile development for Claude Code, Cursor, Windsurf, OpenAI Codex CLI, and more.** Combining Scrum, Kanban, ADRs, and docs-as-code principles into one framework-agnostic system.

---

## Quick Start

### Installation

```bash
npx agileflow@latest setup
```

That's it! The `npx` command always fetches the latest version.

**Updates:**
```bash
npx agileflow@latest update
```

### After Setup

```bash
/agileflow:help              # View all commands
/agileflow:babysit           # Interactive mentor for implementation
/agileflow:configure         # Configure hooks, status line, etc.
```

### Supported IDEs

| IDE | Status | Config Location |
|-----|--------|-----------------|
| Claude Code | Supported | `.claude/commands/agileflow/` |
| Cursor | Supported | `.cursor/rules/agileflow/` |
| Windsurf | Supported | `.windsurf/workflows/agileflow/` |
| OpenAI Codex CLI | Supported | `.codex/skills/` |

---

## Why AgileFlow?

AgileFlow combines three proven methodologies:

- **Agile (Scrum/Kanban)** - Break work into Epics → Stories → Acceptance Criteria
- **ADRs** - Record architectural decisions so future teams don't re-debate
- **Docs-as-Code** - Humans and AI agents coordinate via versioned files

**Key Benefits:**
- Clear priorities and testable increments
- Durable memory and decision history
- Multi-agent collaboration via message bus
- Works with any tech stack or framework

---

## Core Components

| Component | Count | Description |
|-----------|-------|-------------|
| [Commands](docs/04-architecture/commands.md) | 73 | Slash commands for agile workflows |
| [Agents/Experts](docs/04-architecture/subagents.md) | 29 | Specialized agents with self-improving knowledge bases |
| [Skills](docs/04-architecture/skills.md) | Dynamic | Generated on-demand with `/agileflow:skill:create` |

---

## Documentation

Full documentation lives in [`docs/04-architecture/`](docs/04-architecture/):

### Reference
- [Commands](docs/04-architecture/commands.md) - All 73 slash commands
- [Agents/Experts](docs/04-architecture/subagents.md) - 29 specialized agents with self-improving knowledge
- [Skills](docs/04-architecture/skills.md) - Dynamic skill generator with MCP integration

### Architecture
- [AgileFlow CLI Overview](docs/04-architecture/agileflow-cli-overview.md) - System architecture
- [Agent Expert System](docs/04-architecture/agent-expert-system.md) - Self-improving agents
- [Multi-Expert Orchestration](docs/04-architecture/multi-expert-orchestration.md) - Parallel expert analysis
- [Multi-Session Coordination](docs/04-architecture/multi-session-coordination.md) - Parallel Claude Code sessions

### Configuration
- [Configuration System](docs/04-architecture/configuration-system.md) - 8 configuration agents
- [Hooks System](docs/04-architecture/hooks-system.md) - Event-driven automation
- [Session Harness](docs/04-architecture/session-harness.md) - Test verification and sessions
- [PreCompact Context](docs/04-architecture/precompact-context.md) - Context preservation during compacts

---

## Examples

### Create an Epic with Stories
```bash
/agileflow:epic EPIC=EP-0001 TITLE="User Authentication" OWNER=AG-API GOAL="Secure login"
```

### Work on a Story
```bash
/agileflow:assign STORY=US-0001 NEW_OWNER=AG-UI NEW_STATUS=in-progress
# ... implement ...
/agileflow:status STORY=US-0001 STATUS=in-review SUMMARY="Login form complete"
```

### Use Multi-Expert Analysis
```bash
/agileflow:multi-expert Is this authentication implementation secure?
```

### Work in Parallel Sessions
```bash
/agileflow:session:new       # Create isolated workspace
/agileflow:session:status    # View all sessions
```

---

## Project Structure

After running `agileflow setup`:

```
docs/
  00-meta/             # Templates, conventions
  01-brainstorming/    # Ideas and sketches
  02-practices/        # Testing, git, CI practices
  03-decisions/        # ADRs
  04-architecture/     # Architecture documentation
  05-epics/            # Epic definitions
  06-stories/          # User stories
  07-testing/          # Test cases
  08-project/          # Roadmap, backlog
  09-agents/           # Agent status, message bus
  10-research/         # Research notes
```

---

## Online Documentation

Visit [docs.agileflow.projectquestorg.com](https://docs.agileflow.projectquestorg.com) for the full documentation site.

---

## License

MIT

## Support

For issues or questions, visit the [GitHub repository](https://github.com/projectquestorg/AgileFlow).
