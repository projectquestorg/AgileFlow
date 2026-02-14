<p align="center">
  <img src="assets/banner.png" alt="AgileFlow" />
</p>

[![npm version](https://img.shields.io/npm/v/agileflow?color=brightgreen)](https://www.npmjs.com/package/agileflow)
[![Commands](https://img.shields.io/badge/commands-94-blue)](https://docs.agileflow.projectquestorg.com/docs/commands)
[![Agents/Experts](https://img.shields.io/badge/agents%2Fexperts-55-orange)](https://docs.agileflow.projectquestorg.com/docs/agents)
[![Skills](https://img.shields.io/badge/skills-dynamic-purple)](https://docs.agileflow.projectquestorg.com/docs/features/skills)

**AI-driven agile development for Claude Code, Cursor, Windsurf, OpenAI Codex, and more.** Combining Scrum, Kanban, ADRs, and docs-as-code principles into one framework-agnostic system.

---

## Quick Start

```bash
npx agileflow@latest setup
```

That's it! The `npx` command always fetches the latest version.

**Updates:** `npx agileflow@latest update`

```bash
/agileflow:help              # View all commands
/agileflow:babysit           # Interactive mentor for implementation
/agileflow:configure         # Configure hooks, status line, etc.
```

### Supported IDEs

| IDE | Status | Config Location |
|-----|--------|-----------------|
| Claude Code | Supported | `.claude/commands/agileflow/` |
| Cursor | Supported | `.cursor/commands/agileflow/` |
| Windsurf | Supported | `.windsurf/workflows/agileflow/` |
| OpenAI Codex | Supported | `.codex/skills/` and `~/.codex/prompts/` |

---

## Why AgileFlow?

Traditional project management tools create friction between planning and execution. AgileFlow eliminates this gap by embedding project management directly into your AI-assisted coding workflow.

- **No context switching** - Manage epics, stories, and status without leaving your terminal
- **AI-native workflows** - Purpose-built for Claude Code's capabilities
- **Docs-as-code** - All project artifacts live in your repository as plain text
- **Intelligent agents** - 55 specialized AI agents for different domains
- **Framework-agnostic** - Works with any tech stack

---

## Core Components

| Component | Count | Description |
|-----------|-------|-------------|
| [Commands](https://docs.agileflow.projectquestorg.com/docs/commands) | 94 | Slash commands for agile workflows |
| [Agents/Experts](https://docs.agileflow.projectquestorg.com/docs/agents) | 55 | Specialized agents with self-improving knowledge bases |
| [Skills](https://docs.agileflow.projectquestorg.com/docs/features/skills) | Dynamic | Generated on-demand with `/agileflow:skill:create` |

---

## Features

| Feature | Description | Docs |
|---------|-------------|------|
| Agent Expertise | Self-improving agents that maintain domain knowledge | [Learn more](https://docs.agileflow.projectquestorg.com/docs/features/agent-expertise-system) |
| Agent Teams | Multi-domain expert coordination with quality gates | [Learn more](https://docs.agileflow.projectquestorg.com/docs/features/agent-teams) |
| Skills System | Custom AI prompts that learn from your feedback | [Learn more](https://docs.agileflow.projectquestorg.com/docs/features/skills) |
| Parallel Sessions | Isolated workspaces with boundary protection | [Learn more](https://docs.agileflow.projectquestorg.com/docs/features/parallel-sessions) |
| Loop Mode | Autonomous story execution until epic completion | [Learn more](https://docs.agileflow.projectquestorg.com/docs/features/loop-mode) |
| AI Council | Three-perspective strategic decision analysis | [Learn more](https://docs.agileflow.projectquestorg.com/docs/features) |
| Logic Audit | Multi-agent logic bug detection with consensus voting | [Learn more](https://docs.agileflow.projectquestorg.com/docs/features) |
| Damage Control | Block destructive commands with PreToolUse hooks | [Learn more](https://docs.agileflow.projectquestorg.com/docs/features/damage-control) |
| Smart Detection | Contextual feature recommendations with 42 detectors | [Learn more](https://docs.agileflow.projectquestorg.com/docs/features) |
| Visual Mode | Screenshot verification for UI development | [Learn more](https://docs.agileflow.projectquestorg.com/docs/features/visual-mode) |
| Context Preservation | Preserve state during automatic context compaction | [Learn more](https://docs.agileflow.projectquestorg.com/docs/features/compact-context) |
| Research Pipeline | Structured research workflow with synthesis | [Learn more](https://docs.agileflow.projectquestorg.com/docs/features) |
| Automations | Scheduled recurring tasks without a daemon | [Learn more](https://docs.agileflow.projectquestorg.com/docs/features) |
| IDE Integrations | Claude Code, Cursor, Windsurf, OpenAI Codex support | [Learn more](https://docs.agileflow.projectquestorg.com/docs/features/ide-integrations) |

See the [full features overview](https://docs.agileflow.projectquestorg.com/docs/features) for details.

---

## Examples

```bash
# Create an epic
/agileflow:epic EPIC=EP-0001 TITLE="User Authentication" OWNER=AG-API GOAL="Secure login"

# Work on a story
/agileflow:babysit

# Multi-expert analysis
/agileflow:multi-expert Is this authentication implementation secure?

# AI Council for strategic decisions
/agileflow:council Should we use microservices or a monolith?

# Parallel sessions
/agileflow:session:new
```

---

## Documentation

Full documentation at **[docs.agileflow.projectquestorg.com](https://docs.agileflow.projectquestorg.com)**.

| Section | Link |
|---------|------|
| Getting Started | [docs.agileflow.projectquestorg.com/docs/getting-started](https://docs.agileflow.projectquestorg.com/docs/getting-started) |
| Installation | [docs.agileflow.projectquestorg.com/docs/installation](https://docs.agileflow.projectquestorg.com/docs/installation) |
| Commands | [docs.agileflow.projectquestorg.com/docs/commands](https://docs.agileflow.projectquestorg.com/docs/commands) |
| Agents | [docs.agileflow.projectquestorg.com/docs/agents](https://docs.agileflow.projectquestorg.com/docs/agents) |
| Features | [docs.agileflow.projectquestorg.com/docs/features](https://docs.agileflow.projectquestorg.com/docs/features) |

---

## License

MIT

## Support

- [Documentation](https://docs.agileflow.projectquestorg.com) - Full docs site
- [GitHub Issues](https://github.com/projectquestorg/AgileFlow/issues) - Bug reports and feature requests
