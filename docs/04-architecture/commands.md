# Commands Reference

AgileFlow provides **69 slash commands** for agile development workflows.

---

## Core Workflow

| Command | Description |
|---------|-------------|
| `/agileflow:help` | Display system overview and available commands |
| `/agileflow:babysit` | Interactive mentor for end-to-end implementation |
| `/agileflow:configure` | Interactive configuration menu for all AgileFlow features |
| `/agileflow:diagnose` | System health diagnostics and troubleshooting |

---

## Planning & Structure

| Command | Description |
|---------|-------------|
| `/agileflow:epic` | Create a new epic with stories |
| `/agileflow:story` | Create a user story with acceptance criteria |
| `/agileflow:story-validate` | Validate story completeness before development |
| `/agileflow:sprint` | Data-driven sprint planning with velocity forecasting |
| `/agileflow:adr` | Create an Architecture Decision Record |
| `/agileflow:agent` | Onboard a new agent with profile and contract |

---

## Task Management

| Command | Description |
|---------|-------------|
| `/agileflow:assign` | Assign or reassign a story to an owner |
| `/agileflow:status` | Update story status and progress |
| `/agileflow:handoff` | Document work handoff between agents |

---

## Quality & CI

| Command | Description |
|---------|-------------|
| `/agileflow:pr` | Generate pull request description from story |
| `/agileflow:ci` | Bootstrap CI/CD workflow with testing and quality checks |
| `/agileflow:readme-sync` | Synchronize folder READMEs with contents |
| `/agileflow:tests` | Set up automated testing infrastructure |
| `/agileflow:review` | AI-powered code review with quality suggestions |
| `/agileflow:verify` | Run tests and update story test status |
| `/agileflow:baseline` | Mark current state as verified baseline |
| `/agileflow:compress` | Compress status.json to reduce token usage |

---

## Session Management

| Command | Description |
|---------|-------------|
| `/agileflow:session:init` | Initialize session harness with test verification |
| `/agileflow:session:resume` | Resume session with environment verification and context |
| `/agileflow:session:status` | View current session state and activity |
| `/agileflow:session:end` | Cleanly end session and record summary |
| `/agileflow:session:history` | View past session history and metrics |
| `/agileflow:session:new` | Create a parallel session with git worktree |

See [Session Harness](./session-harness.md) for details.

---

## Automation & DevOps

| Command | Description |
|---------|-------------|
| `/agileflow:packages` | Manage dependencies with updates and security audits |
| `/agileflow:docs` | Synchronize documentation with code changes |
| `/agileflow:impact` | Analyze change impact across codebase |
| `/agileflow:debt` | Track and prioritize technical debt items |
| `/agileflow:deploy` | Set up automated deployment pipeline |
| `/agileflow:changelog` | Auto-generate changelog from commit history |
| `/agileflow:auto` | Auto-generate stories from PRDs, mockups, or specs |
| `/agileflow:template` | Create and manage custom document templates |
| `/agileflow:feedback` | Collect and process agent feedback |
| `/agileflow:update` | Generate stakeholder progress report |

---

## Visualization & Analytics

| Command | Description |
|---------|-------------|
| `/agileflow:board` | Display visual kanban board with WIP limits |
| `/agileflow:blockers` | Track and resolve blockers with actionable suggestions |
| `/agileflow:velocity` | Track velocity and forecast sprint capacity |
| `/agileflow:metrics` | Analytics dashboard with cycle time, throughput, and flow efficiency |
| `/agileflow:retro` | Generate retrospective with Start/Stop/Continue format |
| `/agileflow:deps` | Visualize dependency graph with critical path detection |

---

## Web AI Integration

| Command | Description |
|---------|-------------|
| `/agileflow:context:full` | Generate/refresh comprehensive project context |
| `/agileflow:context:export` | Export concise context excerpt for web AI |
| `/agileflow:context:note` | Add timestamped note to context file |
| `/agileflow:research:ask` | Generate detailed 200+ line research prompt |
| `/agileflow:research:import` | Import results from web AI tools |
| `/agileflow:research:list` | View research notes index |
| `/agileflow:research:view` | Read specific research note |
| `/agileflow:whats-new` | Show recent AgileFlow updates and version history |

---

## Expert System

| Command | Description |
|---------|-------------|
| `/agileflow:multi-expert` | Deploy multiple domain experts for cross-domain analysis |
| `/agileflow:validate-expertise` | Validate expertise files for drift and staleness |

See [Agent Expert System](./agent-expert-system.md) for details.

---

## Command Syntax

Most commands accept parameters in `KEY=value` format:

```bash
/agileflow:epic EPIC=EP-0001 TITLE="User Authentication" OWNER=AG-API GOAL="Secure login"

/agileflow:status STORY=US-0001 STATUS=in-progress SUMMARY="Started implementation"

/agileflow:research:ask TOPIC="JWT best practices"
```

---

## Related Documentation

- [Subagents](./subagents.md) - 28 specialized agents
- [AgileFlow CLI Overview](./agileflow-cli-overview.md) - System architecture
- [Command & Agent Flow](./command-agent-flow.md) - How commands and agents work together
