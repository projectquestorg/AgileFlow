# Estimation Guide

**Load this when:** Estimating stories, running planning poker, calculating velocity, or explaining estimation to a team.

## Story Points vs. Time

| Approach                | When to use                                            | Pitfall                                               |
| ----------------------- | ------------------------------------------------------ | ----------------------------------------------------- |
| Story points (relative) | Stable team, ongoing product work                      | Points become proxies for hours (defeats the purpose) |
| Time estimates (hours)  | Fixed-price projects, new teams, external stakeholders | Anchors thinking to clock time, not complexity        |
| T-shirt sizing          | Early discovery, pre-refinement                        | Too coarse for sprint planning                        |

**Recommendation:** Use story points for sprint work. Convert to time only for external commitments, using historical velocity.

---

## Fibonacci Scale Reference

| Points | Complexity signal            | Typical scope                                 |
| ------ | ---------------------------- | --------------------------------------------- |
| 1      | Trivial, fully understood    | Config change, copy update, one-line fix      |
| 2      | Simple, low uncertainty      | Small UI change, simple utility function      |
| 3      | Moderate, some unknowns      | New component with tests, API endpoint        |
| 5      | Complex or cross-cutting     | Feature with multiple states, auth changes    |
| 8      | Large, significant unknowns  | New domain area, integration with third-party |
| 13     | Very large — should be split | Multiple independent deliverables visible     |
| 21+    | Must split before estimation | Epic-level work                               |

**Rule:** If a story is 13+, split it. If team can't agree within 3 points, the story needs more refinement, not more debate.

---

## Planning Poker Protocol

1. Product owner reads story + acceptance criteria aloud
2. Team asks clarifying questions (2–3 minutes)
3. Everyone picks a card privately — reveal simultaneously
4. If consensus (within 1 Fibonacci step): accept, move on
5. If spread >2 steps: highest and lowest estimates explain reasoning (2 min each)
6. Re-estimate once — if still no consensus, take the average or timebox the story
7. Log any risk flags raised during discussion

**Cards:** 0, 1, 2, 3, 5, 8, 13, 20, 40, 100, ?, ∞ (I need a break)

- `?` = "I don't understand enough to estimate"
- `∞` = "This needs to be split before I can estimate"

---

## Velocity Calculation

```
Team velocity = average story points completed per sprint
              (exclude incomplete stories from numerator)

Recommended window: rolling last 3–5 sprints
Exclude: sprints with >25% team absence, onboarding sprints
```

### Example

| Sprint | Completed pts | Notes             |
| ------ | ------------- | ----------------- |
| S-14   | 34            | —                 |
| S-15   | 29            | 1 person on leave |
| S-16   | 38            | —                 |
| S-17   | 36            | —                 |

Rolling avg (last 3): (38 + 36 + 29) / 3 = **34 pts/sprint**
Planning capacity: **28–34 pts** (use 80–100% of velocity for healthy sprint)

---

## Cone of Uncertainty

Estimate confidence degrades as project size grows and time extends:

| Phase                       | Accuracy range      |
| --------------------------- | ------------------- |
| Initial concept             | ±75% (0.25x – 4x)   |
| Product definition complete | ±25% (0.75x – 1.5x) |
| Requirements complete       | ±10% (0.9x – 1.1x)  |
| Design complete             | ±5% (0.95x – 1.05x) |

**Implication:** Any estimate made before requirements are complete is a rough order of magnitude, not a commitment. Plan buffers accordingly.

---

## Estimation Anti-Patterns

| Anti-pattern                                 | Effect                               | Fix                                     |
| -------------------------------------------- | ------------------------------------ | --------------------------------------- |
| Estimating in hours while tracking in points | Hours anchor to time, not complexity | Commit to one unit                      |
| Averaging without outlier discussion         | Hides risk signals                   | Discuss spread, then re-estimate        |
| Manager adjusts estimates                    | Destroys team trust and accuracy     | Product owner clarifies, team estimates |
| Velocity as a commitment target              | Creates velocity gaming              | Treat velocity as forecast, not quota   |
| Estimating unrefined stories                 | High variance, misleading plans      | Refine before sprint planning           |
| Including unfinished stories in velocity     | Inflates apparent velocity           | Count only completed stories            |

---

## Time-to-Point Conversion (for external forecasting only)

```
Story hours ≈ points × (team hours/day × sprint days) / velocity

Example:
  4 devs × 6 productive hours × 10 days = 240 dev-hours per sprint
  Velocity = 34 points
  1 point ≈ 7 dev-hours

Use this for rough external estimates only — never share points-to-hours
mapping with stakeholders as a precise conversion.
```
