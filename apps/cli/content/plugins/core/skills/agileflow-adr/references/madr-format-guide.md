# MADR Format Guide

**Load this when:** writing an ADR, reviewing an existing one,
or explaining the MADR format to a user.

## What MADR is

MADR (Markdown Any Decision Records) — a lightweight, structured format
for capturing decisions. The key insight: decisions without context rot
into mystery. MADR forces you to record the WHY, not just the WHAT.

## Required sections

| Section                           | Purpose                     | What to write                                                                                                                |
| --------------------------------- | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| **Context and Problem Statement** | Why this decision is needed | The situation + the friction. "We need to pick a queue backend because we're hitting rate limits on synchronous processing." |
| **Decision Drivers**              | What matters most           | 3-5 bullets: performance, cost, team expertise, operational simplicity, compliance                                           |
| **Considered Options**            | What was evaluated          | At least 2. "Status quo / do nothing" counts as an option.                                                                   |
| **Decision Outcome**              | What was chosen and why     | Tie directly back to the drivers. Name the option.                                                                           |

## Optional but recommended

| Section                      | When to include                                              |
| ---------------------------- | ------------------------------------------------------------ |
| **Positive Consequences**    | Non-obvious upsides worth documenting                        |
| **Negative Consequences**    | Downsides + mitigations (being honest here builds trust)     |
| **Pros and Cons per option** | When options were close and you want the reasoning preserved |
| **Links**                    | Related ADRs, external benchmarks, issue trackers            |

## Status lifecycle

```
Proposed → Accepted → (years later) → Deprecated | Superseded
```

- **Proposed**: under active discussion
- **Accepted**: decision made, do not change — write a new ADR to override
- **Deprecated**: no longer relevant (tech removed, requirements changed)
- **Superseded by ADR-XXXX**: replaced — always link forward

## Common mistakes

| Mistake                      | Problem                                    | Fix                                                    |
| ---------------------------- | ------------------------------------------ | ------------------------------------------------------ |
| Single option considered     | Looks like rationalization                 | Add "status quo" or "do nothing" as an explicit option |
| Vague problem statement      | Future reader has no context               | Name the constraint that forced the decision           |
| No negative consequences     | Untrustworthy — every choice has tradeoffs | Document downsides + mitigation plan                   |
| Missing decision drivers     | Options can't be evaluated                 | List what matters — performance, cost, DX, compliance  |
| ADR updated after acceptance | History lost                               | Create a new ADR, set old to Superseded                |

## Numbering and naming

```
docs/03-decisions/ADR-0001-use-postgresql.md
docs/03-decisions/ADR-0002-rest-over-graphql.md
docs/03-decisions/ADR-0015-switch-to-edge-functions.md
```

- Always 4-digit zero-padded
- Slug: lowercase, hyphens, describes the decision (not "database-decision")
- Never reuse a number even after a superseded ADR is "deleted"

## Size guidelines

- **Micro ADR** (< 20 lines): small, clear decisions — OK to skip Pros/Cons per option
- **Standard ADR** (20-60 lines): most decisions
- **Extended ADR** (60-100 lines): architecture pivots, platform migrations
- **Never > 100 lines**: if it's longer, the problem statement is too broad — split it

## Cross-linking

When an ADR supersedes another:

```markdown
## Status

Accepted — supersedes [ADR-0003](ADR-0003-use-mongodb.md)
```

When an ADR is superseded:

```markdown
## Status

Superseded by [ADR-0015](ADR-0015-switch-to-postgresql.md) (2026-03)
```
