# Agent Capabilities Matrix

This document provides a comprehensive overview of all AgileFlow agents, their tools, models, and specializations.

## Quick Reference

| Agent | Model | Tools | Primary Use Case |
|-------|-------|-------|------------------|
| orchestrator | sonnet | Task, TaskOutput | Coordinate parallel experts (delegation only) |
| multi-expert | sonnet | Full + Task/TaskOutput | Deploy 3-5 experts, synthesize results |
| epic-planner | sonnet | Read, Write, Edit, Glob, Grep | Break down features into epics/stories |
| mentor | sonnet | Full | Guide implementation from idea to PR |
| api | haiku | Full | Backend APIs, business logic, data models |
| ui | haiku | Full | Frontend components, styling, accessibility |
| database | haiku | Full | Schema design, migrations, query optimization |
| testing | haiku | Full | Test strategy, patterns, coverage |
| security | haiku | Full | Vulnerability analysis, auth/authz |
| devops | haiku | Full + Web | Deployment, CI/CD, dependency management |
| research | haiku | Core + Web | Technical research, ChatGPT prompts |
| codebase-query | haiku | Read, Glob, Grep | Read-only codebase exploration |

**Legend:**
- **Full**: Read, Write, Edit, Bash, Glob, Grep
- **Core**: Read, Write, Edit, Glob, Grep
- **Web**: WebFetch, WebSearch

---

## Agent Categories

### Orchestration & Planning (sonnet models)

These agents coordinate work and plan features. Use sonnet model for complex reasoning.

| Agent | Tools | Description |
|-------|-------|-------------|
| **orchestrator** | Task, TaskOutput | Pure coordinator - CANNOT read/write files. Delegates ALL work to domain experts. |
| **multi-expert** | Full + Task, TaskOutput | Deploys 3-5 experts on same problem, synthesizes with confidence scoring. |
| **epic-planner** | Core | Breaks features into epics and stories, writes acceptance criteria, maps dependencies. |
| **mentor** | Full | End-to-end implementation guide from idea to PR, creates missing epics/stories. |

### Development Specialists (haiku models)

Domain-specific agents for implementation work.

| Agent | Tools | Description |
|-------|-------|-------------|
| **api** | Full | Backend APIs, business logic, data models, database access (AG-API owner). |
| **ui** | Full | Frontend components, styling, theming, accessibility (AG-UI owner). |
| **database** | Full | Schema design, migrations, query optimization, data modeling. |
| **mobile** | Full | React Native, Flutter, cross-platform mobile development. |
| **integrations** | Full | Third-party APIs, webhooks, payment processors, external services. |

### Quality & Security (haiku models)

Agents focused on quality assurance and security.

| Agent | Tools | Description |
|-------|-------|-------------|
| **testing** | Full | Test strategy, patterns, coverage optimization (behavior-focused). |
| **qa** | Full | Test planning, quality metrics, regression testing, release validation. |
| **security** | Full | Vulnerability analysis, auth patterns, pre-release security audits. |
| **accessibility** | Full | WCAG compliance, inclusive design, assistive technology support. |
| **compliance** | Full | GDPR, HIPAA, SOC2, audit trails, regulatory compliance. |

### Infrastructure & DevOps (haiku models)

Agents for infrastructure, deployment, and operations.

| Agent | Tools | Description |
|-------|-------|-------------|
| **ci** | Full | CI/CD workflows, test infrastructure, linting, coverage (AG-CI owner). |
| **devops** | Full + Web | Deployment setup, dependency management, technical debt tracking. |
| **monitoring** | Full | Observability, logging, alerting rules, metrics dashboards. |
| **performance** | Full | Optimization, profiling, benchmarking, scalability. |
| **datamigration** | Full | Zero-downtime migrations, data validation, rollback strategies. |

### Documentation & Research (haiku models)

Agents for documentation and information gathering.

| Agent | Tools | Description |
|-------|-------|-------------|
| **documentation** | Full | Technical docs, API documentation, user guides, tutorials. |
| **research** | Core + Web | Technical research, ChatGPT prompt building, research notes. |
| **adr-writer** | Core | Architecture Decision Records, documenting trade-offs and alternatives. |
| **readme-updater** | Full | Auditing and updating documentation files across project. |

### Design & Product (haiku models)

Agents for product and design work.

| Agent | Tools | Description |
|-------|-------|-------------|
| **design** | Full | UI/UX design systems, visual design, design patterns, design docs. |
| **product** | Full | Requirements analysis, user stories, acceptance criteria clarity. |

### Specialized Agents (haiku models)

Purpose-built agents for specific tasks.

| Agent | Tools | Description |
|-------|-------|-------------|
| **codebase-query** | Read, Glob, Grep | READ-ONLY exploration. Translates natural language to code queries. |
| **refactor** | Full | Technical debt cleanup, legacy code modernization, code quality. |
| **analytics** | Full | Event tracking, data analysis, metrics dashboards, user behavior. |

## Tool Availability Matrix

| Agent | Read | Write | Edit | Bash | Glob | Grep | Task | TaskOutput | WebFetch | WebSearch |
|-------|:----:|:-----:|:----:|:----:|:----:|:----:|:----:|:----------:|:--------:|:---------:|
| orchestrator | | | | | | | ✓ | ✓ | | |
| multi-expert | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | | |
| epic-planner | ✓ | ✓ | ✓ | | ✓ | ✓ | | | | |
| mentor | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | | | | |
| api | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | | | | |
| ui | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | | | | |
| database | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | | | | |
| testing | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | | | | |
| security | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | | | | |
| devops | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | | | ✓ | ✓ |
| research | ✓ | ✓ | ✓ | | ✓ | ✓ | | | ✓ | ✓ |
| codebase-query | ✓ | | | | ✓ | ✓ | | | | |
| ci | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | | | | |
| qa | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | | | | |
| compliance | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | | | | |
| monitoring | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | | | | |
| performance | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | | | | |
| datamigration | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | | | | |
| documentation | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | | | | |
| adr-writer | ✓ | ✓ | ✓ | | ✓ | ✓ | | | | |
| readme-updater | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | | | | |
| design | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | | | | |
| product | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | | | | |
| accessibility | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | | | | |
| mobile | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | | | | |
| integrations | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | | | | |
| refactor | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | | | | |
| analytics | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | | | | |

---

## Model Selection Guide

| Model | When to Use | Agents |
|-------|-------------|--------|
| **sonnet** | Complex reasoning, planning, coordination, synthesis | orchestrator, multi-expert, epic-planner, mentor |
| **haiku** | Domain-specific implementation, fast execution | All other agents (26 total) |

### Why Sonnet for Orchestration?

- Complex multi-step planning requires deeper reasoning
- Synthesis of multiple expert opinions needs nuanced judgment
- Breaking down features requires architectural understanding
- Mentoring through implementation needs comprehensive context

### Why Haiku for Domain Specialists?

- Fast execution for implementation tasks
- Domain expertise encoded in expertise.yaml files
- Hooks validate output quality
- Cost-effective for high-volume operations

---

## Agent Selection Decision Tree

```
What do you need?
├── Coordinate multiple experts?
│   ├── Pure delegation (no file access) → orchestrator
│   └── Synthesize with confidence scoring → multi-expert
├── Plan features/stories?
│   ├── Break down large features → epic-planner
│   └── Guide implementation end-to-end → mentor
├── Write code?
│   ├── Backend/API → api
│   ├── Frontend/UI → ui
│   ├── Database/Schema → database
│   ├── Mobile app → mobile
│   └── Third-party integrations → integrations
├── Ensure quality?
│   ├── Write tests → testing
│   ├── Plan test strategy → qa
│   ├── Security review → security
│   └── Accessibility audit → accessibility
├── Infrastructure work?
│   ├── CI/CD setup → ci
│   ├── Deployment/DevOps → devops
│   ├── Monitoring/Observability → monitoring
│   └── Performance optimization → performance
├── Documentation?
│   ├── Technical docs → documentation
│   ├── Architecture decisions → adr-writer
│   └── README updates → readme-updater
├── Research?
│   └── Technical research with web access → research
└── Explore codebase (read-only)?
    └── Query code without modifications → codebase-query
```

---

## Usage Examples

### Spawning an Agent

```typescript
// Using Task tool
<invoke name="Task">
  <parameter name="description">Implement login API endpoint</parameter>
  <parameter name="prompt">Implement POST /api/auth/login with JWT tokens...</parameter>
  <parameter name="subagent_type">agileflow-api</parameter>
</invoke>
```

### Parallel Expert Deployment

```typescript
// Deploy multiple experts in background
<invoke name="Task">
  <parameter name="description">Security analysis</parameter>
  <parameter name="prompt">Analyze authentication security...</parameter>
  <parameter name="subagent_type">agileflow-security</parameter>
  <parameter name="run_in_background">true</parameter>
</invoke>

<invoke name="Task">
  <parameter name="description">Performance analysis</parameter>
  <parameter name="prompt">Profile API performance...</parameter>
  <parameter name="subagent_type">agileflow-performance</parameter>
  <parameter name="run_in_background">true</parameter>
</invoke>
```

### Collecting Results

```typescript
// Wait for background task
<invoke name="TaskOutput">
  <parameter name="task_id">{task_id}</parameter>
  <parameter name="block">true</parameter>
</invoke>
```

---

## Agent Communication

Agents communicate through:

1. **Bus Messages** (`docs/09-agents/bus/log.jsonl`)
   - Handoffs between agents
   - Blocker notifications
   - Status updates

2. **Status JSON** (`docs/09-agents/status.json`)
   - Story ownership
   - Current status
   - Dependencies

3. **Comms Notes** (`docs/09-agents/comms/`)
   - Detailed handoff documentation
   - Blockers and context

---

## Summary Statistics

| Metric | Count |
|--------|-------|
| Total Agents | 30 |
| Sonnet Agents | 4 |
| Haiku Agents | 26 |
| Agents with Web Access | 2 |
| Agents with Task/TaskOutput | 2 |
| Read-Only Agents | 1 |
| Full-Toolset Agents | 23 |

---

*Last updated: 2026-01-21*
