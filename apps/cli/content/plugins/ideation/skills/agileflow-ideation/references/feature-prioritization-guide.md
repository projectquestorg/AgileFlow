# Feature Prioritization Guide

**Load this when:** prioritizing features from a backlog, choosing between
competing ideas, or building a scoring model for a brainstorm.

## RICE scoring

**R**each × **I**mpact × **C**onfidence ÷ **E**ffort

| Factor         | What it measures           | Scale                                              |
| -------------- | -------------------------- | -------------------------------------------------- |
| **Reach**      | Users affected per quarter | Count (e.g., 500 users)                            |
| **Impact**     | Effect on the metric       | 3=massive, 2=high, 1=medium, 0.5=low, 0.25=minimal |
| **Confidence** | How sure you are           | 100%=high, 80%=medium, 50%=low                     |
| **Effort**     | Person-months              | Estimate directly                                  |

```
RICE = (Reach × Impact × Confidence%) / Effort
```

Higher = higher priority. Compare features to each other, not absolute values.

**Example:**

```
Feature: Email digest notifications
Reach: 2,000 users/quarter
Impact: 1 (medium — improves retention, not conversion)
Confidence: 80%
Effort: 0.5 person-months

RICE = (2000 × 1 × 0.8) / 0.5 = 3,200
```

## ICE scoring (faster, less precise)

**I**mpact × **C**onfidence × **E**ase

All on a 1-10 scale. Ease = 10 minus effort (10=trivial, 1=massive).

Good for quick team alignment or solo backlog grooming.

## Value vs effort matrix

```
HIGH IMPACT
    │  Quick wins ⭐  │  Major bets 🔮  │
    │  (do first)     │  (plan carefully)│
    │─────────────────┼─────────────────│
    │  Maybe later    │  Avoid ❌       │
    │  (deprioritize) │  (cut)          │
LOW IMPACT
         LOW EFFORT        HIGH EFFORT
```

**Quick wins**: Ship these first. High return for low investment.
**Major bets**: Worth doing but need careful planning. Sequence after quick wins.
**Maybe later**: Low impact, low effort. Do only if bandwidth allows.
**Avoid**: Cut from backlog. High effort, low return.

## Kano model — feature delight mapping

| Category        | User reaction if absent | User reaction if present | Example                   |
| --------------- | ----------------------- | ------------------------ | ------------------------- |
| **Basic**       | Angry/dissatisfied      | Indifferent              | App doesn't crash         |
| **Performance** | Less satisfied          | More satisfied           | Faster load time          |
| **Excitement**  | Not missed              | Delighted                | Dark mode, magic features |

**Strategy:**

- Basic features: fix first, never ship without
- Performance features: invest proportionally to impact
- Excitement features: differentiators, keep some for launch moments

## Jobs-to-be-done framing

Before scoring, define the job:

```
When [situation], I want to [motivation], so I can [expected outcome].
```

**Example:**

```
When I receive a new order at 2am, I want to get a notification on my phone,
so I can decide whether to wake my team for urgent fulfillment.
```

Features that serve a well-defined JTBD rank higher — they have a clear user need.
Features without a JTBD are often solution-first thinking (someone wanted to build it,
not someone needed it).

## Dependency sequencing

Some features must come before others:

```
OAuth integration
  └─ Social login (requires OAuth)
       └─ "Continue with Google" button (requires social login)

DB schema: user preferences table
  └─ API: save/load preferences
       └─ UI: preferences panel
```

Always map blockers before scoring — a high-RICE feature blocked by 3 other features
effectively has the sum of all their effort.

## Balancing the portfolio

Don't optimize only for highest RICE. Balance across:

| Category       | Target mix | Purpose                     |
| -------------- | ---------- | --------------------------- |
| Quick wins     | 30-40%     | Momentum, visible progress  |
| Major bets     | 20-30%     | Competitive differentiation |
| Debt/stability | 15-20%     | Sustain velocity            |
| Experiments    | 10-15%     | Learning, discovery         |

A backlog with only quick wins stagnates. A backlog with only major bets ships nothing.

## When to cut a feature

Cut (or park for 6+ months) when:

- RICE score is in the bottom 25% of the backlog
- No clear JTBD — "it would be nice to have"
- Blocked by 3+ other features with unknown timelines
- Similar feature exists and usage is <5%
- Team can't explain who specifically would use it

**Parking ≠ deleting.** Move to "icebox" with the original request and date.
Revisit quarterly. If still unasked for, delete.

## Communicating prioritization decisions

When a stakeholder's feature gets deprioritized:

1. Acknowledge the request by name
2. Show where it landed in scoring (transparent)
3. Explain what beat it and why
4. Give a realistic timeline (or honest "not this quarter")
5. Offer an alternative if one exists

Never just say "we'll get to it." Give a date or a condition: "we'll revisit when X is shipped."
