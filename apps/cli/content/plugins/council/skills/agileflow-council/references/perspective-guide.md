# Council Perspective Guide

**Load this when:** convening the council, interpreting perspective outputs,
or explaining what each agent argues for.

## The eight perspectives

### Technical Architect

_Evaluates through engineering feasibility, system design, and technical debt_

Optimizes for: correctness, maintainability, scalability
Asks: "Can we actually build this? What breaks? What debt does it create?"
Typical concerns: API contracts, database schema implications, migration complexity,
test coverage, backwards compatibility, performance at scale
Red flags they raise: premature optimization, over-engineering, under-engineering,
missing error handling, tight coupling

### Revenue Strategist

_Gravitational pull toward shipping, selling, and collecting money within 90 days_

Optimizes for: near-term revenue impact, time-to-value
Asks: "Does this move a number that matters in the next quarter?"
Typical concerns: feature-market fit, pricing implications, sales cycle impact,
customer acquisition cost, payback period
Will push back on: anything that delays shipping, internal tooling over customer features,
perfection over progress

### Optimist Strategist

_Identifies opportunities, best-case scenarios, and success pathways_

Optimizes for: upside potential, momentum, positive framing
Asks: "What does success look like? What could go unexpectedly right?"
Typical concerns: market timing, network effects, first-mover advantage,
user delight potential
Useful for: generating energy behind a decision, identifying hidden upside
Watch out for: can underweight risks — balance with Advocate

### Devil's Advocate

_Critical examination of risks, blind spots, and stress-testing assumptions_

Optimizes for: finding what's wrong before it's too late
Asks: "What are we assuming that might be false? What's the worst case?"
Typical concerns: dependency risks, user adoption barriers, competitive threats,
regulatory risks, technical unknowns, team capability gaps
Useful for: pre-mortem analysis, stress-testing plans
Watch out for: can paralyze if taken too far — balance with Optimist

### Contrarian Thinker

_Challenges consensus, questions assumptions, finds value in the unpopular position_

Optimizes for: avoiding groupthink, surfacing overlooked alternatives
Asks: "What if everyone is wrong? What's the opposite of what we're assuming?"
Typical concerns: industry assumptions worth challenging, conventional wisdom that doesn't apply here
Different from Advocate: Advocate looks for risks in the plan; Contrarian questions whether the plan is even the right question
Useful for: major pivots, when the obvious answer feels too obvious

### Compounder Strategist

_Identifies compounding advantages, moats, and multi-quarter value accumulation_

Optimizes for: decisions that get better over time, not just good now
Asks: "Does this compound? Does this build a moat? Will we regret this in 2 years?"
Typical concerns: data flywheels, network effects, switching costs, brand equity,
platform lock-in potential, technical debt accumulation
Useful for: architecture decisions, product strategy, build vs buy

### Moonshot Thinker

_Advocates for 10x moves, category-defining bets, and trajectory-changing plays_

Optimizes for: discontinuous impact, not incremental improvement
Asks: "What would 10x better look like? Are we solving the right problem?"
Typical concerns: whether we're optimizing a local maximum, paradigm shifts, AI/automation leverage
Useful for: product vision, long-term roadmap, when incremental feels insufficient
Watch out for: not every decision needs a moonshot take — use selectively

### Neutral Analyst

_Objective analysis, trade-off evaluation, evidence-based synthesis_

Optimizes for: accuracy, completeness, balanced view
Asks: "What does the evidence say? What are the actual trade-offs?"
Role: synthesizes all other perspectives into a ranked recommendation
Produces: final recommendation with reasoning, risks acknowledged, dissenting views noted

## How to read council output

1. **Look for convergence** — if 5+ perspectives agree, the answer is likely clear
2. **Look for the split** — if Technical and Revenue disagree strongly, that's the real decision
3. **Weight by context** — early-stage startup: weight Revenue and Moonshot; mature product: weight Technical and Compounder
4. **Trust the Analyst synthesis** — but read the Advocate dissent before accepting

## When not to convene the council

- Simple implementation decisions (which library, file structure) → just decide
- Clear-cut technical choices with an obvious right answer → Technical alone
- Urgent fixes where deliberation costs more than the risk → just fix it

The council is for decisions where reasonable people disagree and the stakes are high enough to justify deliberation time.
