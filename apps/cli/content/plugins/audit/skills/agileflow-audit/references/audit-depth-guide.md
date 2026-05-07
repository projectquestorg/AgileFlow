# Audit Depth & Routing Guide

**Load this when:** deciding which audit to run, at what depth, and in what order.

## Which audit for which situation

| Situation                        | Start here                                |
| -------------------------------- | ----------------------------------------- |
| Just shipped a feature           | logic + flow (catch bugs before users do) |
| Pre-PR / pre-merge               | security + logic + test                   |
| User-facing forms added          | accessibility + flow                      |
| New API endpoints                | security + api-quality                    |
| Database query changes           | performance (query analyzer)              |
| Auth/payment code touched        | security (always)                         |
| Lots of new files                | architecture + completeness               |
| Tests feel thin                  | test quality                              |
| Full release / audit request     | `/agileflow:audit` (all)                  |
| Something feels wrong but unsure | logic (broadest coverage)                 |

## Depth levels

| Depth            | What it means                                    | When to use                      |
| ---------------- | ------------------------------------------------ | -------------------------------- |
| `DEPTH=quick`    | Top-level scan, highest-confidence findings only | After implementation, pre-commit |
| `DEPTH=standard` | Default — balanced coverage                      | Normal development               |
| `DEPTH=deep`     | Exhaustive, includes low-confidence signals      | Pre-release, security reviews    |

## Audit panel structure

Each audit type runs multiple specialized analyzers then a consensus agent:

```
/agileflow:code:security
  ├── security-analyzer-auth
  ├── security-analyzer-authz
  ├── security-analyzer-injection
  ├── security-analyzer-input
  ├── security-analyzer-api
  ├── security-analyzer-secrets
  ├── security-analyzer-infra
  ├── security-analyzer-deps
  └── security-consensus  ← deduplicates + prioritizes + maps to OWASP/CWE

/agileflow:code:logic
  ├── logic-analyzer-edge
  ├── logic-analyzer-flow
  ├── logic-analyzer-invariant
  ├── logic-analyzer-race
  ├── logic-analyzer-type
  └── logic-consensus

/agileflow:code:performance
  ├── perf-analyzer-queries
  ├── perf-analyzer-rendering
  ├── perf-analyzer-memory
  ├── perf-analyzer-network
  ├── perf-analyzer-caching
  ├── perf-analyzer-bundle
  ├── perf-analyzer-assets
  ├── perf-analyzer-compute
  └── perf-consensus

/agileflow:code:accessibility
  ├── a11y-analyzer-aria
  ├── a11y-analyzer-forms
  ├── a11y-analyzer-keyboard
  ├── a11y-analyzer-semantic
  ├── a11y-analyzer-visual
  └── a11y-consensus  ← maps to WCAG 2.2 success criteria

/agileflow:code:legal
  ├── legal-analyzer-privacy (GDPR, CCPA)
  ├── legal-analyzer-security (breach notification, PCI)
  ├── legal-analyzer-terms
  ├── legal-analyzer-consumer (dark patterns, FTC)
  ├── legal-analyzer-a11y (ADA, Section 508)
  ├── legal-analyzer-licensing (OSS)
  ├── legal-analyzer-international (LGPD, PIPL)
  ├── legal-analyzer-ai (EU AI Act)
  ├── legal-analyzer-content (DMCA, DSA)
  └── legal-consensus

/agileflow:code:flows
  ├── flow-analyzer-discovery  ← maps all user journeys first
  ├── flow-analyzer-wiring     ← UI → API → DB → response chain
  ├── flow-analyzer-navigation ← routing and redirects
  ├── flow-analyzer-persistence ← data actually saved?
  ├── flow-analyzer-feedback   ← loading/success/error states
  ├── flow-analyzer-errors     ← graceful failure paths
  ├── flow-analyzer-authorization ← auth gates on each step
  └── flow-consensus

/agileflow:code:architecture
  ├── arch-analyzer-circular
  ├── arch-analyzer-complexity
  ├── arch-analyzer-coupling
  ├── arch-analyzer-layering
  ├── arch-analyzer-patterns
  └── arch-consensus

/agileflow:code:completeness
  ├── completeness-analyzer-stubs
  ├── completeness-analyzer-handlers
  ├── completeness-analyzer-routes
  ├── completeness-analyzer-api
  ├── completeness-analyzer-state
  ├── completeness-analyzer-imports
  ├── completeness-analyzer-conditional
  └── completeness-consensus

/agileflow:code:quality
  ├── quality-analyzer-naming
  ├── quality-analyzer-duplication
  ├── quality-analyzer-comments
  └── quality-consensus

/agileflow:code:test
  ├── test-analyzer-coverage
  ├── test-analyzer-assertions
  ├── test-analyzer-fragility
  ├── test-analyzer-mocking
  ├── test-analyzer-patterns
  ├── test-analyzer-structure
  ├── test-analyzer-maintenance
  ├── test-analyzer-integration
  └── test-consensus

/agileflow:code:api
  ├── api-quality-analyzer-conventions
  ├── api-quality-analyzer-docs
  ├── api-quality-analyzer-errors
  ├── api-quality-analyzer-pagination
  ├── api-quality-analyzer-versioning
  └── api-quality-consensus
```

## Priority system

| Priority      | Action                            |
| ------------- | --------------------------------- |
| P0 / Critical | Fix immediately — do not commit   |
| P1 / High     | Fix this session before merging   |
| P2 / Medium   | Fix this sprint                   |
| P3 / Low      | Track, fix when touching the area |

## After audit findings

1. Present P0/P1 findings with specific fix recommendations
2. Ask if user wants to fix P0s now (always recommend yes)
3. After fixes: re-run the specific analyzer (not the full audit) to confirm
4. P2/P3: create stories or add to tech debt backlog
