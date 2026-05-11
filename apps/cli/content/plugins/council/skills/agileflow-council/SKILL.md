---
name: agileflow-council
version: 1.0.0
category: agileflow/council
description: |
  Use when the user faces an architectural decision, strategic tradeoff,
  or ambiguous technical question. Convenes a panel of perspective agents
  (optimist, contrarian, technical, revenue, moonshot, compounder,
  advocate, analyst) and synthesizes their views into a actionable
  recommendation.
triggers:
  keywords:
    - what should i do
    - best approach
    - which option
    - tradeoffs
    - architecture decision
    - should we
    - council
    - get opinions
    - strategic decision
    - multiple perspectives
    - second opinion
    - right approach
  priority: 65
provides:
  agents: []
learns:
  enabled: true
  file: _learnings/council.yaml
  maxEntries: 30
depends:
  skills: []
  plugins: [council]
---

# AgileFlow Council

Multi-perspective decision engine. When faced with a hard choice,
convene the council: each agent argues from a distinct strategic lens,
then the analyst synthesizes into a ranked recommendation.

## When this skill activates

- User asks "what should I do" or "which approach is better"
- User describes a technical or architectural tradeoff
- User wants a second opinion or multiple viewpoints
- User faces a build-vs-buy, refactor-vs-rewrite, or similar decision
- Babysit mentor detects an ambiguous technical question

## Council perspectives

| Agent      | Lens                                                |
| ---------- | --------------------------------------------------- |
| Technical  | Engineering feasibility, system design, tech debt   |
| Revenue    | What ships and sells within 90 days                 |
| Optimist   | Best-case opportunities and success paths           |
| Advocate   | Devil's advocate — risks, blind spots, stress tests |
| Contrarian | Challenges consensus, questions assumptions         |
| Compounder | Long-term moats and compounding advantages          |
| Moonshot   | 10x moves and category-defining bets                |
| Analyst    | Neutral synthesis and evidence-based recommendation |

## How to guide the user

1. Clarify the decision: what are the options, what constraints exist
2. Run `/agileflow:council` with the full context
3. Present the synthesis — don't just list all perspectives, lead with the recommendation
4. If user disagrees with synthesis, note it and proceed with their preference (don't re-argue)

## Multi-expert vs Council

- **Council** — strategic decisions, architectural choices, "what should we build"
- **Multi-expert** (`/agileflow:multi-expert`) — analysis questions, "is this correct", code review

## Integration

- **agileflow-research** — run before convening the council when the decision domain is unfamiliar; facts sharpen the perspectives and reduce speculation
- **agileflow-adr** — after council reaches a decision, create an ADR to record the rationale, alternatives, and trade-offs; council generates the content, adr structures and stores it
- **agileflow-story-writer** — once the council chooses a direction, the next step is usually to write the stories that implement it
- **agileflow-epic-planner** — if the chosen direction is large, route to epic-planner to break it into milestones before any coding begins
- **agileflow-planning** — use alongside council for prioritisation decisions (what to build next, what to defer) that require both strategic input and delivery metrics
- **agileflow-ideation** — use ideation first when options haven't been generated yet; convene the council after ideation produces the candidate ideas to evaluate
- **agileflow-babysit-mentor** — mentor triggers council automatically when the user asks "right approach?" during implementation; council resolves the ambiguity, mentor resumes execution

## References

Load these files when you need deeper context for the relevant task:

| File                                  | When to load                                                                                                              |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `references/perspective-guide.md`     | Before or during a council session — describes what each of the 8 perspectives optimizes for and how to read their output |
| `references/when-to-convene-guide.md` | User asks if they should run a council — decision tree for council vs just deciding                                       |
| `references/decision-log-template.md` | After a council session — template for recording the decision, rationale, and alternatives considered                     |

## Workflows

Follow these step-by-step when the user initiates the matching action:

| File                   | When to follow                                                                                     |
| ---------------------- | -------------------------------------------------------------------------------------------------- |
| `workflows/convene.md` | User wants a council session — how to gather context, run perspectives in parallel, and synthesize |
