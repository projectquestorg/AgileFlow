---
description: Multi-agent code analysis suite - security, logic, performance, architecture, and more
argument-hint: "[security|logic|api|architecture|performance|test|completeness|accessibility|legal]"
---

# code

Multi-agent code analysis suite. Each analyzer deploys specialized agents in parallel, then synthesizes results through consensus voting.

## Subcommands

| Command | Description |
|---------|-------------|
| `/agileflow:code:security` | Security vulnerability analysis (OWASP/CWE) |
| `/agileflow:code:logic` | Logic bug detection (race conditions, edge cases) |
| `/agileflow:code:api` | API quality analysis (conventions, docs, errors) |
| `/agileflow:code:architecture` | Architecture health (coupling, complexity, layers) |
| `/agileflow:code:performance` | Performance bottleneck detection |
| `/agileflow:code:test` | Test quality and coverage analysis |
| `/agileflow:code:completeness` | Forgotten features, dead handlers, stub code |
| `/agileflow:code:accessibility` | WCAG compliance and a11y analysis |
| `/agileflow:code:legal` | Legal compliance (GDPR, licensing, terms) |

## Quick Start

```
/agileflow:code:security src/                    # Quick security scan
/agileflow:code:logic . DEPTH=deep               # Deep logic analysis
/agileflow:code:completeness . DEPTH=extreme      # Extreme completeness audit
```

Each analyzer supports `DEPTH=quick|deep|ultradeep|extreme` and `MODEL=haiku|sonnet|opus`.
