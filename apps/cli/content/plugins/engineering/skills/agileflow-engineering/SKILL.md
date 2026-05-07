---
name: agileflow-engineering
version: 1.0.0
category: agileflow/engineering
description: |
  Use when the user is implementing a specific technical domain: API
  endpoints, database schema, UI components, mobile, security hardening,
  performance optimization, integrations, compliance, or refactoring.
  Routes to the right domain expert for the task.
triggers:
  keywords:
    - build api
    - database schema
    - ui component
    - refactor
    - security hardening
    - optimize
    - integration
    - mobile
    - compliance
    - monitoring
    - implement
    - build this feature
  priority: 50
provides:
  agents: []
learns:
  enabled: true
  file: _learnings/engineering.yaml
  maxEntries: 50
depends:
  skills: []
  plugins: [engineering]
---

# AgileFlow Engineering

Domain expert routing for implementation work. Delegates to the right
specialist based on what's being built.

## When this skill activates

- User wants to implement a specific technical feature
- User asks for help with a domain-specific problem (DB, API, UI, etc.)
- Babysit mentor needs to delegate implementation work

## Domain experts

| Command / Expert            | When to use                                               |
| --------------------------- | --------------------------------------------------------- |
| `/agileflow:api`            | REST endpoints, business logic, request/response handling |
| `agileflow-database`        | Schema design, migrations, query optimization             |
| `agileflow-ui`              | Components, styling, theming, accessibility               |
| `agileflow-mobile`          | React Native, Flutter, cross-platform mobile              |
| `agileflow-security`        | Auth, authorization, vulnerability analysis               |
| `agileflow-performance`     | Profiling, optimization, benchmarking                     |
| `agileflow-integrations`    | Third-party APIs, webhooks, payment processors            |
| `agileflow-compliance`      | GDPR, HIPAA, SOC2, audit trails                           |
| `agileflow-monitoring`      | Observability, logging, alerting, metrics                 |
| `/agileflow:refactor`       | Technical debt, legacy code cleanup                       |
| `/agileflow:codebase-query` | Search and understand the existing codebase               |

## Routing logic

```
Single domain (DB only)     → delegate to agileflow-database
Single domain (UI only)     → delegate to agileflow-ui
Multi-domain (API + UI)     → delegate to agileflow-orchestrator
Security concern            → always include agileflow-security
Unknown codebase pattern    → /agileflow:codebase-query first
```

## Common flows

**Add new API endpoint:**

1. `agileflow-database` (schema if needed)
2. `agileflow-api` (endpoint + business logic)
3. `agileflow-testing` (tests)

**Add UI feature:**

1. `agileflow-ui` (component + styling)
2. `agileflow-testing` (tests)
3. Accessibility audit if interactive elements added

## References

Load these files when you need deeper context for the relevant task:

| File                                 | When to load                                                                                                |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| `references/domain-routing-guide.md` | Deciding which expert to delegate to — single vs multi-domain routing, parallel vs sequential execution     |
| `references/code-review-guide.md`    | Reviewing code or preparing code for review — what to look for per layer, blocking vs non-blocking comments |
| `references/refactoring-guide.md`    | Planning a refactor — when to refactor, extract vs inline decisions, naming conventions                     |

## Workflows

Follow these step-by-step when the user initiates the matching action:

| File                    | When to follow                                                                  |
| ----------------------- | ------------------------------------------------------------------------------- |
| `workflows/impact.md`   | User wants to understand the blast radius of a change before implementing       |
| `workflows/diagnose.md` | User is stuck or wants to diagnose a bottleneck — systematic debugging approach |
