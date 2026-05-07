---
name: agileflow-retention
version: 1.0.0
category: agileflow/psychology
description: |
  Use when the user wants to improve user retention, reduce churn,
  increase engagement, design habit-forming features, or apply
  behavioral psychology to product decisions. Draws on evidence-based
  models (Hook Model, Fogg Behavior Model, Habit Loop) and competitor
  patterns from high-retention products.
triggers:
  keywords:
    - retention
    - engagement
    - habit
    - keep users
    - churn
    - activation
    - onboarding flow
    - user psychology
    - sticky features
    - daily active users
    - streak
    - progress bar
    - notification strategy
    - user motivation
  priority: 50
  exclude:
    - data retention (legal)
    - retention policy
    - memory retention
provides:
  agents: []
learns:
  enabled: true
  file: _learnings/retention.yaml
  maxEntries: 50
depends:
  skills: []
  plugins: [core]
---

# AgileFlow Retention

Applies evidence-based behavioral psychology to product design decisions — improving user retention, reducing churn, increasing engagement, and building habit-forming features that users actually want.

## When this skill activates

- User wants to reduce churn or improve D1/D7/D30 retention rates
- User is designing or auditing onboarding and activation flows
- User asks how to make a feature "sticky" or build habits
- User wants to design a streak system, notification strategy, progress indicator, or social feature
- User wants to understand why users drop off and what to do about it
- User asks about user psychology, behavioral economics, or motivation design
- Should NOT activate for data retention policies, legal retention requirements, or memory science

## What this skill does

1. Identify which psychological model fits the user's retention challenge
2. Diagnose the current funnel: where are users dropping off and why?
3. Map the product against the Hook Model, Fogg Behavior Model, and Habit Loop
4. Recommend specific mechanics with evidence from high-retention products
5. Design the trigger, action, reward, and investment for new retention features
6. Apply an ethical check: is this genuine value or dark pattern manipulation?
7. Define the measurement framework: what metric proves the mechanic works?

## The three core behavioral models

### 1. BJ Fogg's Behavior Model (B=MAP)

Behavior occurs when **Motivation**, **Ability**, and **Prompt** converge at the same moment.

The key insight: you don't need high motivation if you increase ability (reduce friction). You don't need high ability if you catch a user at peak motivation. The prompt (trigger) must fire at exactly the right moment.

**Application:** Audit each step in your activation flow for where motivation drops or where ability is too low. The fix is either to increase motivation (social proof, progress feedback) or to reduce friction (fewer steps, defaults, auto-fill).

See `references/psychology-models.md` for the full model detail.

### 2. Nir Eyal's Hook Model

**Trigger → Action → Variable Reward → Investment**

The Hook Model (from "Hooked", 2014) explains how products build unprompted usage habits. Each completed hook cycle increases habit strength. The goal over time is to replace external triggers (notifications) with internal triggers (emotional cues like boredom or FOMO).

**Application:** Map your product against all four phases. Most products have triggers and actions. Few invest in variable rewards and even fewer design for investment — but investment is what makes users feel they have something to lose by leaving.

See `references/psychology-models.md` for the full model detail.

### 3. Duhigg's Habit Loop

**Cue → Routine → Reward → Craving**

Once a habit loop is established, the brain disengages its prefrontal cortex and the basal ganglia runs the routine automatically. The craving is what drives repetition — users don't return for the reward itself; they return in anticipation of it.

**Application:** Identify the cue your product can "own" (a time of day, an emotion, an activity context), design the routine to be frictionless, deliver the reward immediately and sometimes variably.

See `references/psychology-models.md` for the full model detail.

### 4. Self-Determination Theory (SDT)

Three basic psychological needs drive intrinsic motivation: **Autonomy**, **Competence**, **Relatedness**. Products that satisfy all three build the deepest, most resilient retention because users want to be there — not because they're trapped.

**Important warning:** Extrinsic rewards (points, badges, coins) can crowd out intrinsic motivation for activities users already find interesting. Use gamification carefully.

See `references/psychology-models.md` for the full model detail.

## Key retention mechanics

| Mechanic                 | Psychological basis                       | Best example                               |
| ------------------------ | ----------------------------------------- | ------------------------------------------ |
| Streaks                  | Loss aversion (Kahneman & Tversky, 1979)  | Duolingo — 2.4× retention at 30-day streak |
| Progress bars            | Zeigarnik Effect + commitment consistency | LinkedIn profile completeness              |
| Variable rewards         | Skinner's variable ratio schedule (1938)  | Instagram like reveals, Wordle             |
| Social proof             | Cialdini's influence principles (1984)    | Airbnb "usually books within 24 hours"     |
| Personalized onboarding  | Aha moment optimization                   | Facebook: 7 friends in 10 days             |
| Behavioral notifications | Urban Airship data (2016): 2–5× lift      | Triggered > scheduled blasts               |
| Endowed progress         | Nunes & Dreze loyalty card study (2006)   | Pre-filled stamp cards                     |
| Loss aversion triggers   | Kahneman: losses felt 2× more than gains  | Duolingo streak saver notification         |

See `references/retention-patterns.md` for full implementation guides with evidence.

## Competitor patterns to learn from

| Product  | Key mechanic                   | Measurable outcome                                |
| -------- | ------------------------------ | ------------------------------------------------- |
| Duolingo | Streaks + XP + leagues         | ~50% DAU/MAU ratio                                |
| LinkedIn | Profile completeness bar       | Measurably higher registration completion         |
| Slack    | Unreads + reactions + channels | Teams sending 2,000+ messages are deeply retained |
| Strava   | Social feed + kudos + segments | Activity habit reinforcement                      |
| Spotify  | Discover Weekly + Wrapped      | Reduces genre fatigue churn                       |
| Notion   | Templates + public pages       | Lower activation friction                         |

See `references/competitor-analysis.md` for detailed breakdowns of what each product does and why it works.

## Opening discovery flow

When invoked without a specific task, ask one focused question:

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[
  {
    "question": "What retention challenge are you working on?",
    "header": "Retention focus",
    "multiSelect": false,
    "options": [
      {"label": "Audit my existing product for retention gaps (Recommended)", "description": "Map your current product against the Hook Model, Fogg, and Habit Loop — get a prioritized gap list"},
      {"label": "Design a new retention mechanic (streak, progress, notifications, etc.)", "description": "Choose a mechanic, design its trigger/reward/investment, and define how to measure it"},
      {"label": "Improve my onboarding and activation flow", "description": "Identify the 'aha moment' and redesign the path to reach it faster"},
      {"label": "Analyze competitor retention strategies", "description": "Deep-dive on how a specific high-retention product keeps users coming back"},
      {"label": "Understand the psychology behind a specific mechanic", "description": "Get the research, models, and evidence behind streaks, variable rewards, social proof, etc."}
    ]
  }
]</parameter>
</invoke>
```

**Route based on answer:**

| Answer                 | Next action                                                                 |
| ---------------------- | --------------------------------------------------------------------------- |
| Audit existing product | Follow `workflows/retention-audit.md`                                       |
| Design new mechanic    | Follow `workflows/design-retention-feature.md`                              |
| Onboarding/activation  | Start with aha moment identification, then Fogg audit                       |
| Competitor analysis    | Load `references/competitor-analysis.md`                                    |
| Psychology explanation | Load `references/psychology-models.md` + `references/retention-patterns.md` |

## Ethical framework

Retention mechanics exist on a spectrum from **genuine value** to **manipulation**:

**Genuine value:** The mechanic improves the user's actual experience. Streaks work for Duolingo because they help users actually learn a language. Users would thank you for designing this.

**Engagement bait:** The mechanic keeps users in the product without delivering real value. Infinite scroll with algorithmically outraged content keeps users engaged but doesn't serve them.

**Dark patterns:** The mechanic exploits psychological vulnerabilities to extract value from users (dark subscriptions, artificial urgency, hidden cancellations).

For every mechanic you design, apply this test: **"Would a user who understood exactly what you were doing thank you for it?"**

If yes: ship it.
If no: redesign until the answer is yes, or don't build it.

## Retention metric hierarchy

Define your primary retention metric before designing any mechanic:

| Metric                | Definition                                   | Best for                            |
| --------------------- | -------------------------------------------- | ----------------------------------- |
| **D1 retention**      | % of day-1 users who return on day 2         | Mobile apps, early activation       |
| **D7 retention**      | % of week-1 users who return on day 8        | Apps requiring habit formation      |
| **D30 retention**     | % of month-1 users who return on day 31      | SaaS, subscription products         |
| **DAU/MAU ratio**     | % of monthly users who are also daily users  | Engagement depth (40%+ = excellent) |
| **Session frequency** | Average sessions per user per week           | Communication, utility apps         |
| **Churn rate**        | % of active users who stop using in a period | Subscription products               |

Always tie mechanics to a specific metric. "Improve engagement" is not a goal; "increase D7 retention from 22% to 35%" is a goal.

## Quality checklist

Before shipping a retention mechanic:

- [ ] Target metric is defined and baselined
- [ ] Psychological model is identified (Hook / Fogg / Habit Loop / SDT)
- [ ] Trigger is designed (external → internal over time)
- [ ] Friction in the action phase is minimized (Fogg's 6 simplicity factors)
- [ ] Reward is variable or surprising (not predictable)
- [ ] Investment layer designed (user leaves something behind that increases value)
- [ ] Ethical test passed ("Would users thank you for this?")
- [ ] Measurement plan exists (A/B test or cohort analysis)
- [ ] Feature does not exploit psychological vulnerabilities

## Self-improving learnings

`_learnings/retention.yaml` records:

- Product type and primary retention metric in use
- Which psychological models the team has found most applicable
- Mechanic implementations that have been tried and their outcomes
- Team's ethical bar for retention mechanics

Apply on invocation; update on correction with confidence (high / medium / low).

## Integration

- **agileflow-epic-planner** — retention initiative becomes an epic with measurable success metrics
- **agileflow-story-writer** — individual retention mechanics become user stories with ACs tied to the retention metric
- **agileflow-pr-reviewer** — notifications and behavioral triggers get a second review for dark patterns

## References

Load these files when you need deeper context:

| File                                | When to load                                                                                                                                                     |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `references/psychology-models.md`   | Understanding the theoretical foundation — Fogg B=MAP, Hook Model, Habit Loop, SDT — with citations and application guidance                                     |
| `references/retention-patterns.md`  | Specific mechanics with evidence: streaks, progress bars, variable rewards, social proof, endowed progress — each with study references and implementation steps |
| `references/competitor-analysis.md` | How high-retention products (Duolingo, LinkedIn, Slack, Strava, Spotify, Notion) implement these mechanics in practice                                           |

## Workflows

Follow these step-by-step when the user initiates the matching action:

| File                                    | When to follow                                                                                                                                   |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `workflows/retention-audit.md`          | User wants to audit their existing product for retention gaps — maps against Hook Model, Fogg, Habit Loop, and specific mechanics                |
| `workflows/design-retention-feature.md` | User wants to design a new retention mechanic — from model selection through trigger design, reward structure, investment layer, and measurement |
