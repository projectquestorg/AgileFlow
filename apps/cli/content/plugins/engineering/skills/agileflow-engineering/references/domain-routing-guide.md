# Domain Routing Guide

**Load this when:** deciding which expert to delegate to, or whether to use
the orchestrator for multi-domain work.

## Single-domain routing

| Work involves...                                            | Route to                   | Notes                       |
| ----------------------------------------------------------- | -------------------------- | --------------------------- |
| SQL schema, migrations, indexes, ORM queries                | `agileflow-database`       | Always for schema changes   |
| REST endpoints, GraphQL, business logic, request handling   | `agileflow-api`            | Backend routes and services |
| React/Vue/Angular components, CSS, theming, accessibility   | `agileflow-ui`             | Frontend presentation layer |
| React Native, Flutter, iOS, Android, cross-platform         | `agileflow-mobile`         | Mobile-specific concerns    |
| Auth flows, authorization, vulnerability analysis, pen test | `agileflow-security`       | Any security-sensitive code |
| Profiling, caching, query optimization, bundle size         | `agileflow-performance`    | Performance bottlenecks     |
| Stripe, Twilio, SendGrid, OAuth, external APIs              | `agileflow-integrations`   | Third-party service wiring  |
| GDPR, HIPAA, SOC2, audit logging, compliance docs           | `agileflow-compliance`     | Regulatory requirements     |
| Prometheus, Grafana, Datadog, logging, alerting             | `agileflow-monitoring`     | Observability setup         |
| Legacy code cleanup, extracting functions, naming           | `agileflow-refactor`       | Technical debt work         |
| Codebase exploration, finding patterns, understanding code  | `agileflow-codebase-query` | Discovery and research      |

## Multi-domain routing → orchestrator

Use `agileflow-orchestrator` when work spans 2+ domains:

| Example work                  | Domains involved                 |
| ----------------------------- | -------------------------------- |
| New user profile feature      | API + UI (+ DB if schema change) |
| Payment integration           | API + Security + Integrations    |
| Real-time notifications       | API + UI + Monitoring            |
| New data model with endpoints | DB + API                         |
| Auth system                   | API + Security + UI              |
| Performance investigation     | DB + Performance + Monitoring    |

## Parallel vs sequential expert execution

```
Independent domains → run in PARALLEL (faster)
  Example: UI component + API endpoint (neither needs the other's output)

Dependent domains → run SEQUENTIALLY
  Example: DB schema → API endpoint → UI (each builds on previous)
  Common order: Database → API → UI → Tests
```

## When to involve security

**Always involve `agileflow-security` when:**

- Authentication or session management changes
- New API endpoints that accept user input
- File upload functionality
- Payment or financial data handling
- User permission or role changes
- New third-party integrations that receive webhooks
- Any data encryption or key management

Security review doesn't block other experts — run it in parallel with API/UI work,
then review findings before committing.

## Testing

`agileflow-testing` is for test strategy and comprehensive test suites.
For quick test additions alongside implementation, the domain expert handles it directly.

Use `agileflow-testing` when:

- Coverage is systematically low and needs a strategy
- Complex testing setup (mocking, fixtures, test data)
- End-to-end test suite design
- Test quality audit results show structural problems

## When to use multi-expert vs orchestrator

| Need                                             | Use                       |
| ------------------------------------------------ | ------------------------- |
| Implement a feature across 2+ domains            | `agileflow-orchestrator`  |
| Get multiple opinions/analysis on the same thing | `/agileflow:multi-expert` |
| Review code for correctness                      | `agileflow-code-reviewer` |
| Architecture decision                            | `/agileflow:council`      |

## Escalation triggers

Escalate from single expert to orchestrator mid-task if:

- Expert discovers the work spans more domains than expected
- Schema change is needed (always add `agileflow-database`)
- Security issue found (always add `agileflow-security`)
- Performance problem discovered (add `agileflow-performance`)
