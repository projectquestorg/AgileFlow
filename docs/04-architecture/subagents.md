# Subagents Reference

AgileFlow includes **29 specialized subagents** that operate in separate context windows for focused work.

---

## How Subagents Work

Subagents are spawned via the Task tool and run in their own context:

```
Use the database subagent to design the user sessions schema
```

Each subagent:
- Has domain-specific expertise and mental models
- Operates in a separate context window
- Can read/write files and run commands
- Self-improves by updating expertise files after tasks

See [Agent Expert System](./agent-expert-system.md) for details on expertise files.

---

## Core Implementation Agents

### `ui` - UI/Presentation Layer

Front-end components, styling, theming, and accessibility.

**Expertise:**
- Component architecture and patterns
- Styling systems (Tailwind, CSS-in-JS)
- WCAG 2.1 AA accessibility
- State management
- Responsive design

**Invocation:** `Use the ui subagent to implement this UI feature`

---

### `api` - Services/Data Layer

Backend APIs, business logic, data models, and API tests.

**Expertise:**
- REST/GraphQL API design
- Request validation
- Error handling patterns
- Authentication/authorization
- API testing

**Invocation:** `Use the api subagent to implement this API endpoint`

---

### `database` - Database & Data Layer

Schema design, migrations, query optimization, and data modeling.

**Expertise:**
- Schema design patterns
- Migration strategies
- Query optimization
- Indexing strategies
- ORM patterns (Prisma, TypeORM, etc.)

**Invocation:** `Use the database subagent to design this schema`

---

### `ci` - CI/CD & Quality

CI/CD pipelines, linting, type checking, and test coverage.

**Expertise:**
- GitHub Actions / GitLab CI
- Test automation
- Code quality tools
- Coverage reporting
- Release automation

**Invocation:** `Use the ci subagent to set up the test pipeline`

---

## Orchestration & Planning Agents

### `mentor` - End-to-End Implementation Mentor

Guides feature implementation from idea to PR.

**Capabilities:**
- Story creation and validation
- Implementation planning
- Code review guidance
- PR preparation

**Invocation:** `Use the mentor subagent to guide me through this feature`

---

### `epic-planner` - Epic & Story Planning

Breaks down features into epics and stories with acceptance criteria.

**Capabilities:**
- Feature decomposition
- Story writing with AC
- Effort estimation
- Dependency mapping

**Invocation:** `Use the epic-planner subagent to plan this feature`

---

### `adr-writer` - Architecture Decision Records

Documents technical decisions, trade-offs, and alternatives.

**Capabilities:**
- Decision documentation
- Trade-off analysis
- Alternative exploration
- Consequence tracking

**Invocation:** `Use the adr-writer subagent to document this decision`

---

### `research` - Research & Knowledge Management

Conducts technical research, builds research prompts, saves notes.

**Capabilities:**
- Technical research
- Best practices discovery
- Research note organization
- Knowledge synthesis

**Invocation:** `Use the research subagent to research authentication approaches`

---

### `multi-expert` - Cross-Domain Orchestration

Deploys 3-5 domain experts on the same problem and synthesizes results.

**When to use:**
- Complex cross-domain questions
- Architecture reviews
- Security audits
- Performance analysis

**Invocation:** `/agileflow:multi-expert Is this implementation secure?`

See [Multi-Expert Orchestration](./multi-expert-orchestration.md) for details.

---

## All 29 Specialized Agents

| Agent | Focus Area |
|-------|------------|
| `ui` | Frontend components, styling, accessibility |
| `api` | Backend APIs, business logic, data models |
| `database` | Schema design, migrations, query optimization |
| `ci` | CI/CD pipelines, quality automation |
| `devops` | Infrastructure, deployment, automation |
| `security` | Auth, vulnerabilities, compliance |
| `testing` | Test strategies, coverage, mocking |
| `performance` | Profiling, caching, optimization |
| `mobile` | React Native, Flutter, mobile-specific |
| `integrations` | Third-party APIs, webhooks |
| `refactor` | Technical debt, code quality |
| `design` | Design systems, UI/UX patterns |
| `accessibility` | WCAG compliance, assistive tech |
| `analytics` | Event tracking, metrics dashboards |
| `datamigration` | ETL, zero-downtime migrations |
| `monitoring` | Observability, logging, alerting |
| `compliance` | GDPR, HIPAA, SOC2, audit trails |
| `qa` | Test planning, release readiness |
| `product` | Requirements, user stories, AC |
| `documentation` | Technical docs, API docs, guides |
| `mentor` | End-to-end implementation guidance |
| `epic-planner` | Feature breakdown, story creation |
| `adr-writer` | Architecture decision records |
| `research` | Technical research, best practices |
| `readme-updater` | Documentation maintenance |
| `multi-expert` | Cross-domain expert orchestration |
| `orchestrator` | Multi-agent coordination and delegation |

---

## When to Use Subagents vs Commands

**Use Subagents when:**
- Complex, multi-step implementation work
- Specialized tasks requiring focused expertise
- Work benefiting from separate context
- Tasks needing to run commands or write code

**Use Commands when:**
- Quick, single-purpose actions
- Status updates and assignments
- Generating templates or prompts
- Simple file operations

---

## Configuration Agents

AgileFlow also includes **8 configuration agents** for setup tasks:

| Agent | Purpose |
|-------|---------|
| `configuration:hooks` | Event-driven automation setup |
| `configuration:precompact` | Context preservation during compacts |
| `configuration:status-line` | Custom Claude Code status bar |
| `configuration:git-config` | Git repository setup |
| `configuration:ci` | CI/CD workflow configuration |
| `configuration:archival` | Auto-archival of completed stories |
| `configuration:attribution` | Git attribution preferences |
| `configuration:verify` | Configuration verification |

Access via: `/agileflow:configure`

See [Configuration System](./configuration-system.md) for details.

---

## Related Documentation

- [Commands](./commands.md) - 68 slash commands
- [Agent Expert System](./agent-expert-system.md) - Self-improving expertise
- [Multi-Expert Orchestration](./multi-expert-orchestration.md) - Parallel expert analysis
