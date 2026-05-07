---
name: agileflow-audit
version: 1.0.0
category: agileflow/audit
description: |
  Use when the user wants to audit code quality, security, performance,
  logic, accessibility, legal compliance, test coverage, architecture,
  or flow integrity. Runs multi-expert analyzer panels and produces
  prioritized findings with WCAG/OWASP/CWE mappings.
triggers:
  keywords:
    - audit
    - code review
    - security review
    - performance review
    - accessibility check
    - logic bugs
    - flow integrity
    - test coverage
    - architecture review
    - legal compliance
    - run audit
    - check my code
    - find bugs
    - code quality
  priority: 60
provides:
  agents: []
learns:
  enabled: true
  file: _learnings/audit.yaml
  maxEntries: 50
depends:
  skills: []
  plugins: [audit]
---

# AgileFlow Audit

Multi-domain code audit system. Each audit type runs a panel of
specialized analyzers then a consensus agent that deduplicates,
scores, and prioritizes findings.

## When this skill activates

- User asks to audit, review, or check code
- User wants to find bugs, vulnerabilities, or performance issues
- User asks about accessibility, legal, or compliance
- User wants to verify flow integrity or test quality
- User mentions OWASP, WCAG, CWE, or similar standards
- User says "audit this story", "did we pass", or "check acceptance criteria" — story completion audit
- User says "start TDD", "write tests first", or "RED GREEN REFACTOR" — TDD workflow

## Audit types

| Audit         | What it covers                                       |
| ------------- | ---------------------------------------------------- |
| Security      | Auth, injection, secrets, OWASP Top 10               |
| Logic         | Edge cases, race conditions, type safety, invariants |
| Performance   | Queries, rendering, memory, bundle, caching          |
| Accessibility | ARIA, keyboard, forms, visual, semantic HTML         |
| Legal         | GDPR, CCPA, licensing, consumer protection           |
| Flows         | User journey wiring, navigation, persistence         |
| Architecture  | Coupling, layering, circular deps, complexity        |
| Completeness  | Stubs, dead code, missing handlers, orphaned routes  |
| Quality       | Naming, duplication, comments                        |
| Test          | Coverage, fragility, mocking, assertions             |
| API           | REST conventions, versioning, error handling         |
| Full audit    | Runs all audit types above                           |

## How to guide the user

1. Ask what they just implemented or what concern prompted the audit
2. Pick the most relevant audit type — don't always run everything
3. After findings: present P0/P1 issues first, offer to fix them
4. After fix: suggest re-running the specific audit to confirm

## TDD

The TDD workflow enforces RED → GREEN → REFACTOR phases with hard phase gates. See `workflows/tdd.md` for the step-by-step process.

## References

Load these files when you need deeper context for the relevant task:

| File                                     | When to load                                                                   |
| ---------------------------------------- | ------------------------------------------------------------------------------ |
| `references/owasp-top10.md`              | Running a security audit — maps OWASP categories to code signals and severity  |
| `references/wcag-criteria.md`            | Running an accessibility audit — WCAG 2.2 criteria with new 2.2 additions      |
| `references/audit-depth-guide.md`        | Deciding which audit to run and at what depth — quick vs deep vs targeted      |
| `references/performance-budget-guide.md` | Running a performance audit — Lighthouse thresholds, resource budgets per type |
| `references/dependency-risk-guide.md`    | Reviewing dependencies — when to upgrade, how to triage CVEs                   |

## Workflows

Follow these step-by-step when the user initiates the matching action:

| File                     | When to follow                                                             |
| ------------------------ | -------------------------------------------------------------------------- |
| `workflows/run-audit.md` | User asks to run any audit — guides them to the right audit type and depth |
| `workflows/tdd.md`       | User wants to work in TDD mode — RED → GREEN → REFACTOR phases             |
