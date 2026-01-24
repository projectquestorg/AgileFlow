---
description: Convene AI Council for strategic decisions with three perspectives (Optimist, Advocate, Analyst)
argument-hint: <question> [--mode parallel|debate] [--rounds N]
compact_context:
  priority: high
  preserve_rules:
    - "ACTIVE COMMAND: /agileflow:council - AI Council for strategic decisions"
    - "CRITICAL: Deploy ALL 3 council agents in SINGLE message with parallel Task calls"
    - "MUST wait for all agents via TaskOutput with block=true before synthesis"
    - "Council members: council-optimist, council-advocate, council-analyst"
    - "Modes: parallel (default, single round) or debate (multi-round deliberation)"
    - "Session folder: .agileflow/council/sessions/{timestamp}/"
  state_fields:
    - session_id
    - question
    - mode
    - rounds
    - council_results
---

# /agileflow:council

Convene an AI Council for strategic decisions. Three perspectives (Optimist, Devil's Advocate, Neutral Analyst) deliberate in parallel to provide balanced, high-quality recommendations.

<!-- COMPACT_SUMMARY_START -->
## Compact Summary

**Command**: `/agileflow:council` - Deploy 3-perspective AI Council for strategic decisions

**Magic Phrases**: "agents gather", "council assemble", "convene the council"

**Quick Usage**:
```
/agileflow:council Should we adopt microservices architecture?
/agileflow:council --mode debate --rounds 2 Is GraphQL better than REST for our API?
```

**Council Members**:
| Role | Agent | Focus |
|------|-------|-------|
| Optimist Strategist | council-optimist | Best-case scenarios, opportunities, success pathways |
| Devil's Advocate | council-advocate | Risks, blind spots, stress-testing assumptions |
| Neutral Analyst | council-analyst | Trade-offs, evidence synthesis, decision criteria |

**Modes**:
- **parallel** (default): All 3 agents deliberate once, then synthesize
- **debate**: Multiple rounds where agents respond to each other's perspectives

**Critical Rules**:
- Deploy ALL 3 agents in ONE message with multiple Task calls (not sequential)
- Wait for all results before synthesis (use TaskOutput with block=true)
- Create session folder in `.agileflow/council/sessions/{timestamp}/`
- Write perspectives to `shared_reasoning.md` in session folder

**Output Structure**:
```markdown
## AI Council Deliberation: [Question]

### Perspectives
- Optimist: [summary]
- Advocate: [summary]
- Analyst: [summary]

### Synthesis
- Common Ground: [what all agree on]
- Key Tensions: [where they differ]
- Recommendation: [decision with confidence]

### Next Steps
1. [action]
2. [action]
```

<!-- COMPACT_SUMMARY_END -->

---

## When to Use

The AI Council is designed for **strategic, non-technical decisions** where balanced perspectives matter:

- **Architecture decisions**: "Should we adopt microservices?"
- **Technology choices**: "GraphQL vs REST for our API?"
- **Process decisions**: "Should we implement feature flags?"
- **Business tradeoffs**: "Build vs buy for this feature?"
- **Strategy questions**: "Should we prioritize mobile or web?"

**NOT for**:
- Code implementation (use domain experts)
- Simple questions with clear answers
- Tasks requiring codebase changes
- Research tasks (use `/agileflow:research:ask`)

---

## How It Works

```
┌─────────────────────────────────────────────────────────────┐
│                    USER QUESTION                             │
│          "Should we adopt microservices?"                    │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                    COUNCIL ORCHESTRATOR                      │
│  1. Create session: .agileflow/council/sessions/{ts}/        │
│  2. Initialize shared_reasoning.md from template             │
│  3. Log to bus: {"type":"council","event":"init"}           │
│  4. Deploy 3 agents IN PARALLEL                              │
└─────────────────────────────────────────────────────────────┘
                            │
            ┌───────────────┼───────────────┐
            ▼               ▼               ▼
    ┌───────────────┐ ┌───────────────┐ ┌───────────────┐
    │   OPTIMIST    │ │   ADVOCATE    │ │   ANALYST     │
    │   STRATEGIST  │ │ (Devil's Adv) │ │   (Neutral)   │
    ├───────────────┤ ├───────────────┤ ├───────────────┤
    │ Opportunities │ │ Risks         │ │ Trade-offs    │
    │ Success paths │ │ Blind spots   │ │ Evidence      │
    │ Enablers      │ │ Stress tests  │ │ Criteria      │
    │ Best case     │ │ Mitigations   │ │ Synthesis     │
    └───────────────┘ └───────────────┘ └───────────────┘
            │               │               │
            └───────────────┼───────────────┘
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                    SYNTHESIS                                 │
│  • Common Ground (all 3 agree) = HIGH CONFIDENCE             │
│  • Optimist Unique = OPPORTUNITIES                           │
│  • Advocate Unique = RISKS TO MONITOR                        │
│  • Analyst Assessment = RECOMMENDATION                       │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                    FINAL OUTPUT                              │
│  📊 Confidence: High/Medium/Low                              │
│  ✅ Common Ground (all agree)                                │
│  🚀 Opportunities (optimist)                                 │
│  ⚠️ Risks (advocate)                                         │
│  📋 Recommendation (analyst)                                 │
│  📌 Next Steps                                               │
└─────────────────────────────────────────────────────────────┘
```

---

## Usage

### Basic (Parallel Mode)

```
/agileflow:council Should we adopt microservices architecture?
```

All 3 council members deliberate once in parallel, then results are synthesized.

### Debate Mode

```
/agileflow:council --mode debate --rounds 2 Should we use GraphQL?
```

Multiple rounds where council members can respond to each other's perspectives:
1. Round 1: Initial perspectives
2. Round 2: Responses and rebuttals
3. Final synthesis

### Magic Phrases

You can also invoke the council with natural language:
- "agents gather" + question
- "council assemble" + question
- "convene the council" + question

Example: "Agents gather - should we implement feature flags?"

---

## Arguments

| Argument | Default | Description |
|----------|---------|-------------|
| `<question>` | (required) | The strategic question to deliberate |
| `--mode` | `parallel` | Deliberation mode: `parallel` or `debate` |
| `--rounds` | `1` | Number of rounds for debate mode (1-3) |

---

## Orchestration Instructions

When this command is invoked:

### STEP 1: Create Session

```bash
# Create session folder with timestamp
SESSION_ID=$(date +%Y%m%d-%H%M%S)
mkdir -p .agileflow/council/sessions/$SESSION_ID
```

Initialize `shared_reasoning.md` from template:
- Replace `{{session_id}}` with timestamp
- Replace `{{question}}` with user question
- Replace `{{mode}}` with parallel or debate
- Replace `{{rounds}}` with number

### STEP 2: Log to Bus

Append to `docs/09-agents/bus/log.jsonl`:
```jsonl
{"ts":"<ISO>","type":"council","event":"init","session_id":"<SESSION_ID>","question":"<QUESTION>","mode":"<MODE>"}
```

### STEP 3: Deploy Council (CRITICAL - PARALLEL)

Deploy ALL 3 agents in a SINGLE message with multiple Task calls:

```xml
<invoke name="Task">
  <parameter name="description">Council Optimist perspective</parameter>
  <parameter name="prompt">
You are the Optimist Strategist in an AI Council deliberation.

SESSION: .agileflow/council/sessions/{SESSION_ID}/
QUESTION: {QUESTION}

Read your agent definition first:
- .agileflow/agents/council-optimist.md

Then write your perspective to:
- .agileflow/council/sessions/{SESSION_ID}/shared_reasoning.md

Focus on:
1. Key opportunities (at least 3)
2. Success pathways
3. Enablers in the codebase
4. Addressing anticipated concerns

Ground all optimism in evidence.
  </parameter>
  <parameter name="subagent_type">agileflow-council-optimist</parameter>
  <parameter name="run_in_background">true</parameter>
</invoke>

<invoke name="Task">
  <parameter name="description">Council Advocate perspective</parameter>
  <parameter name="prompt">
You are the Devil's Advocate in an AI Council deliberation.

SESSION: .agileflow/council/sessions/{SESSION_ID}/
QUESTION: {QUESTION}

Read your agent definition first:
- .agileflow/agents/council-advocate.md

Then write your perspective to:
- .agileflow/council/sessions/{SESSION_ID}/shared_reasoning.md

Focus on:
1. Key risks (at least 3 with mitigations)
2. Blind spots and assumptions
3. Stress tests and edge cases
4. Alternative approaches

Be constructive - offer solutions, not just criticism.
  </parameter>
  <parameter name="subagent_type">agileflow-council-advocate</parameter>
  <parameter name="run_in_background">true</parameter>
</invoke>

<invoke name="Task">
  <parameter name="description">Council Analyst perspective</parameter>
  <parameter name="prompt">
You are the Neutral Analyst in an AI Council deliberation.

SESSION: .agileflow/council/sessions/{SESSION_ID}/
QUESTION: {QUESTION}

Read your agent definition first:
- .agileflow/agents/council-analyst.md

Then write your perspective to:
- .agileflow/council/sessions/{SESSION_ID}/shared_reasoning.md

Focus on:
1. Evidence summary (for and against)
2. Trade-off analysis with quantification
3. Decision criteria
4. Synthesis and recommendation

Be objective - follow the evidence.
  </parameter>
  <parameter name="subagent_type">agileflow-council-analyst</parameter>
  <parameter name="run_in_background">true</parameter>
</invoke>
```

### STEP 4: Collect Results

Wait for all 3 agents to complete:

```xml
<invoke name="TaskOutput">
  <parameter name="task_id">{optimist_task_id}</parameter>
  <parameter name="block">true</parameter>
</invoke>

<invoke name="TaskOutput">
  <parameter name="task_id">{advocate_task_id}</parameter>
  <parameter name="block">true</parameter>
</invoke>

<invoke name="TaskOutput">
  <parameter name="task_id">{analyst_task_id}</parameter>
  <parameter name="block">true</parameter>
</invoke>
```

### STEP 5: Debate Mode (If Applicable)

If mode is `debate` and rounds > 1, for each additional round:

1. Log round start: `{"type":"council","event":"debate_round","round":N}`
2. Have each agent read others' perspectives and respond
3. Collect updated responses
4. Repeat for specified rounds

### STEP 6: Synthesize

Read the complete `shared_reasoning.md` and create final synthesis:

1. **Common Ground**: Points where all 3 agree (HIGH CONFIDENCE)
2. **Opportunities**: Unique insights from Optimist
3. **Risks**: Unique insights from Advocate
4. **Trade-offs**: Assessment from Analyst
5. **Recommendation**: Final decision with confidence level
6. **Next Steps**: Actionable items

### STEP 7: Log Completion

```jsonl
{"ts":"<ISO>","type":"council","event":"synthesis_complete","session_id":"<SESSION_ID>","confidence":"<HIGH|MEDIUM|LOW>"}
```

### STEP 8: Offer Next Steps

After presenting synthesis, offer:
- `/agileflow:adr` - Create an ADR documenting this decision
- `/agileflow:epic` - Create an epic to implement the decision
- `/agileflow:story` - Create stories for immediate actions

---

## Output Format

```markdown
## AI Council Deliberation

**Question**: [Original question]
**Session**: [Session ID]
**Mode**: [parallel/debate]

---

### Council Perspectives

#### Optimist Strategist
**Summary**: [1-2 sentence summary]

**Key Opportunities**:
1. [Opportunity] - Evidence: [source]
2. [Opportunity] - Evidence: [source]
3. [Opportunity] - Evidence: [source]

**Success Pathway**: [Brief description]

---

#### Devil's Advocate
**Summary**: [1-2 sentence summary]

**Key Risks**:
1. [Risk] - Mitigation: [approach]
2. [Risk] - Mitigation: [approach]
3. [Risk] - Mitigation: [approach]

**Stress Tests**: [Key scenarios tested]

---

#### Neutral Analyst
**Summary**: [1-2 sentence summary]

**Trade-offs**:
| Factor | For | Against | Weight |
|--------|-----|---------|--------|
| [Factor] | [Pro] | [Con] | [H/M/L] |

**Decision Criteria**: [Key factors]

---

### Synthesis

#### Common Ground (High Confidence)
*All 3 council members agree:*
- [Point 1]
- [Point 2]

#### Opportunities (Optimist Unique)
- [Opportunity not covered by others]

#### Risks to Monitor (Advocate Unique)
- [Risk that needs attention]

#### Key Trade-offs
- [Trade-off 1]: [Assessment]
- [Trade-off 2]: [Assessment]

---

### Recommendation

**Decision**: [Clear recommendation]
**Confidence**: [High/Medium/Low]

**Rationale**:
1. [Key reason 1]
2. [Key reason 2]
3. [Key reason 3]

---

### Next Steps

1. [Immediate action]
2. [Follow-up action]
3. [Validation action]

---

### Session Files

- Session: `.agileflow/council/sessions/[SESSION_ID]/`
- Full deliberation: `shared_reasoning.md`

---

**Want to document this decision?** Run `/agileflow:adr` to create an Architecture Decision Record.
```

---

## Why Three Perspectives?

| Perspective | Purpose | Counterbalances |
|-------------|---------|-----------------|
| **Optimist** | Ensures opportunities aren't missed | Claude's risk aversion |
| **Advocate** | Prevents groupthink and blind spots | Claude's "yes person" tendency |
| **Analyst** | Grounds decision in evidence | Emotional or biased reasoning |

Together, they produce balanced, high-quality recommendations.

---

## Benefits

1. **Context Quality**: Each agent runs with fresh context (avoids 40-50% degradation)
2. **Balanced Perspectives**: Forces consideration of multiple viewpoints
3. **Transparency**: `shared_reasoning.md` provides audit trail
4. **Non-Technical Decisions**: Fills gap - domain experts handle code, council handles strategy
5. **Debate Mode**: Deeper analysis through multiple rounds

---

## Related Commands

- `/agileflow:choose` - Single-perspective decision making
- `/agileflow:multi-expert` - Domain expert analysis (technical)
- `/agileflow:adr` - Document architectural decisions
- `/agileflow:research:ask` - Research before deciding
- `/agileflow:rpi` - Research-Plan-Implement workflow

---

## Examples

### Example 1: Architecture Decision

```
/agileflow:council Should we migrate from monolith to microservices?
```

The council will analyze:
- **Optimist**: Scalability benefits, team autonomy, deployment flexibility
- **Advocate**: Complexity increase, distributed systems challenges, team readiness
- **Analyst**: Current pain points, team capacity, incremental migration options

### Example 2: Technology Choice

```
/agileflow:council --mode debate --rounds 2 GraphQL vs REST for our public API?
```

Round 1: Initial perspectives
Round 2: Respond to each other's arguments
Final: Synthesized recommendation with confidence

### Example 3: Process Decision

```
/agileflow:council Should we adopt trunk-based development?
```

The council evaluates from three angles to provide balanced guidance.
