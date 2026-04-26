---
name: agileflow-adr
version: 2.0.0
category: agileflow/core
description: |
  Use when the user is debating a technology / architecture / trade-off
  decision (database choice, framework, API style, infra) or wants to
  formalize one as an Architecture Decision Record. Writes the ADR to
  docs/03-decisions/ in MADR format.
triggers:
  keywords:
    - architecture decision
    - architectural decision
    - which should we use
    - record this decision
    - trade-off between
    - which framework
    - which database
    - rest vs graphql
    - sql vs nosql
    - adr for
  priority: 50
  exclude:
    - decision tree (algorithmic)
    - decisive moment
provides:
  agents: []
learns:
  enabled: true
  file: _learnings/adr.yaml
  maxEntries: 50
depends:
  skills: []
  plugins: [core]
---

<!-- {{PERSONALIZATION_BLOCK}} -->

# AgileFlow ADR Writer

Captures architectural / technical decisions as formal Architecture
Decision Records in `docs/03-decisions/` (MADR format). Decisions stay
immutable once accepted; if context changes, supersede with a new ADR
and link the chain.

## When this skill activates

- User is comparing options ("PostgreSQL vs MongoDB", "REST vs GraphQL")
- User asks "which X should we use?" with at least two real candidates
- User wants to record a decision they've already made
- Discussion of trade-offs, drivers, or constraints
- Should NOT activate on unrelated mentions of "decision" — `exclude`
  keywords damp casual / algorithmic uses.

## What this skill does

1. Detect that a decision is being made (or asked about).
2. Extract the four MADR elements: context/problem, decision drivers,
   considered options, chosen option + justification.
3. Ask clarifying questions if any are missing or ambiguous.
4. Read `docs/03-decisions/` to find the next ADR number and any
   related ADRs to cross-link.
5. Show the proposed ADR and wait for explicit approval.
6. Write `docs/03-decisions/ADR-####-<slug>.md` in MADR format.

## Self-improving learnings

`.agileflow/skills/_learnings/adr.yaml` records preferences:
- Default `Status:` value (Proposed vs Accepted)
- Whether to require all four MADR sections or allow brief mode
- Preferred date format
- Whether to include Deciders names by default

## ADR format (MADR)

```markdown
# [ADR-0001] Title

**Date**: YYYY-MM-DD
**Status**: Proposed | Accepted | Deprecated | Superseded
**Deciders**: Names of people involved
**Tags**: architecture, database, api, …

## Context and Problem Statement
[Describe the context and problem. What are we trying to solve? Why now?]

## Decision Drivers
- [e.g., Performance requirements]
- [e.g., Team expertise]
- [e.g., Cost constraints]

## Considered Options
- [Option 1]
- [Option 2]
- [Option 3]

## Decision Outcome

**Chosen option**: [Option X]

**Justification**: [Why this option best satisfies the drivers]

### Positive Consequences
- [Good outcome 1]
- [Good outcome 2]

### Negative Consequences
- [Bad outcome 1] — Mitigation: [plan, if any]
- [Bad outcome 2]

## Pros and Cons of the Options

### [Option 1]
**Pros**: …
**Cons**: …

### [Option 2]
**Pros**: …
**Cons**: …

## Links
- [Related ADRs]
- [Relevant documentation]
- [External resources]
```

## Statuses

- **Proposed** — Under discussion, not yet decided
- **Accepted** — Decision made and ratified
- **Deprecated** — No longer relevant; kept for history
- **Superseded** — Replaced by a newer ADR (link forward to it)

## When to write the ADR vs ask first

Write it now (with `Status: Accepted`):
- The user has already made a clear decision and wants to record it
- The user explicitly asks for the ADR

Ask first (then write with `Status: Proposed` or `Accepted`):
- Multiple options are still in play
- Drivers / constraints aren't clear yet
- The chosen option's justification is one-line ("we like it more")

## Quality checklist

- [ ] Problem statement is concrete (not "improve performance")
- [ ] At least 2 real options considered (single-option ADRs are a
      smell — note that the alternative was "do nothing" or "status
      quo")
- [ ] Each option has explicit pros AND cons
- [ ] Decision drivers explicitly stated
- [ ] Chosen option's justification ties back to drivers
- [ ] Negative consequences acknowledged with mitigations where possible
- [ ] File path: `docs/03-decisions/ADR-####-<slug>.md` (4-digit pad)
- [ ] User approved the diff before write

## Integration

- **agileflow-story-writer** — completed ADRs inform Technical Notes
  in stories
- **agileflow-epic-planner** — major epics often spawn one or more
  ADRs at planning time
- **agileflow-status-updater** — flipping an ADR from Proposed to
  Accepted is a status mutation through that skill

## Notes

- Capture decisions even if they seem small. Future you (or a new
  hire) won't remember why you chose option B in three months.
- Be honest about negative consequences — undocumented downsides are
  the source of "why is this code like this?" frustration.
- ADRs are **immutable** once accepted. To change a decision, create a
  new ADR with `Status: Accepted`, set the old ADR to `Superseded`,
  and link them.
- Include the deciders' names. Accountability matters; so does
  knowing who to ask.
- Date the ADR — context erodes; the date is the timestamp on the
  thinking, not just the file.
