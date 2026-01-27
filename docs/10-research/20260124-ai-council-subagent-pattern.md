# AI Council Pattern - Using Sub-agents for Decision Making

**Import Date**: 2026-01-24
**Topic**: Sub-agents for Non-Technical Decision Making
**Source**: YouTube video transcript (Prompt Advisors)
**Content Type**: Video transcript

---

## Summary

This research documents a pattern for using Claude Code sub-agents beyond traditional technical tasks like code review and testing. The core concept is building an "AI Council" - multiple sub-agents with different perspectives (optimist, devil's advocate, neutral analyst) that work in parallel to evaluate ideas and inform decision-making.

The key insight is that sub-agents maintain fresh context windows, avoiding the quality degradation that occurs when a single conversation approaches 40-50% context usage. By distributing reasoning across separate agents, each operates in its "prime real estate" of context, producing higher quality analysis.

A simple but effective monitoring technique uses a shared markdown file (`shared_reasoning.md`) where each agent documents its thinking process, enabling transparency without complex surveillance infrastructure.

---

## Key Findings

- **Context window degradation**: Claude's quality decreases notably around 40-50% context usage, with significant degradation at 80-90%
- **Sub-agents preserve quality**: Each agent runs with fresh context, maintaining peak performance
- **Hire agents like employees**: Only create sub-agents for tasks that deserve independent, mutually exclusive execution
- **Shared reasoning file**: Simple markdown file where agents document their thinking - low-resolution but effective monitoring
- **Council composition**: Three agent archetypes work well together:
  - **Optimist Strategist**: Explores best possible outcomes while grounding in actionable pathways
  - **Devil's Advocate**: Critical examination, stress-testing optimism, surfacing hidden risks
  - **Neutral Analyst**: Objective analysis, maps trade-offs, synthesizes perspectives, anchors to evidence
- **Debate mode**: Agents can "fight" each other by responding to each other's arguments in the shared file
- **Production reality**: For most non-technical applications, 5-6 sub-agents is typically sufficient
- **Test in fresh sessions**: Always validate agent configurations in new sessions to ensure CLAUDE.md instructions work

---

## Implementation Approach

### Step 1: Create Sub-agent Definitions

Use `/agents` > "Create new agent" > Project level for agents specific to this project.

**Optimist Strategist** (green indicator, Sonnet model):
- Explores best possible outcomes
- Grounds optimism in actionable pathways
- Identifies what needs to happen for success

**Devil's Advocate** (red indicator, Sonnet model):
- Critical examination of ideas
- Stress-tests optimistic projections
- Surfaces hidden risks and blind spots
- Nuanced pessimism (not pure negativity)

**Neutral Analyst** (blue indicator, Sonnet model):
- Objective, evidence-based analysis
- Maps trade-offs between perspectives
- Synthesizes insights from all viewpoints

### Step 2: Create Shared Reasoning File

Create `shared_reasoning.md` in project root where agents document:
- Session date
- Idea under review
- Each agent's reasoning process
- Key considerations and insights
- Confidence levels for conclusions

### Step 3: Configure CLAUDE.md

Update CLAUDE.md to include:
- Magic phrase trigger (e.g., "agents gather" or "council assemble")
- Instructions for parallel agent invocation
- Requirements for documenting in shared_reasoning.md
- Output format for council reports

### Step 4: Invocation Pattern

When triggered, the orchestrator:
1. Launches all council agents in parallel
2. Each agent documents reasoning in shared file
3. Each agent returns full perspective report
4. Orchestrator synthesizes balanced consensus view
5. Provides actionable recommendation based on shared middle ground

---

## Code Snippets

### Example CLAUDE.md Section

```markdown
## Agent Council System

When user says "agents gather" or "council assemble":
1. Launch all council agents in parallel
2. Each agent documents reasoning in shared_reasoning.md
3. Each agent returns full report with their perspective
4. Synthesize a balanced view with persistent record

### Council Members
- @optimist - Optimist Strategist (positive outcomes, actionable paths)
- @devil - Devil's Advocate (risks, blind spots, critical examination)
- @neutral - Neutral Analyst (objective, evidence-based, synthesizer)
```

### Shared Reasoning File Structure

```markdown
# Shared Reasoning Log

## Session: [Date]
### Idea Under Review: [Description]

---

## Optimist Strategist Reasoning
**Key Considerations**: [list]
**Analysis Process**: [steps taken]
**Critical Insight**: [main finding]
**Confidence Level**: [percentage]

---

## Devil's Advocate Reasoning
**Key Considerations**: [list]
**Analysis Process**: [steps taken]
**Critical Insight**: [main finding]
**Confidence Level**: [percentage]

---

## Neutral Analyst Reasoning
**Key Considerations**: [list]
**Analysis Process**: [steps taken]
**Critical Insight**: [main finding]
**Confidence Level**: [percentage]

---

## Consensus & Recommendation
[Synthesized view finding common ground]
```

---

## Action Items

- [ ] Create optimist-strategist.md sub-agent definition
- [ ] Create devils-advocate.md sub-agent definition
- [ ] Create neutral-analyst.md sub-agent definition
- [ ] Create shared_reasoning.md template
- [ ] Update CLAUDE.md with council invocation rules
- [ ] Test council in fresh session (not same session as setup)
- [ ] Document magic phrase trigger in project documentation

---

## Risks & Gotchas

- **Testing trap**: Don't test agents in same session where you set them up - context may compensate for incomplete setup
- **Over-engineering**: Don't create 50-100 agents; 5-6 is typically sufficient for non-technical use
- **Compaction uncertainty**: Compaction behavior is non-deterministic - sub-agents help avoid this entirely
- **Model selection**: Use cheaper models (Sonnet) for council agents since complex reasoning isn't always needed
- **Context window math**: 200K token limit means sub-agents can each use ~50K tokens without quality degradation

---

## Story Suggestions

### Potential Practice Doc: AI Council Pattern for Decision Making

Document the pattern for creating decision-making councils with:
- Agent archetype definitions (optimist/devil's advocate/neutral)
- Shared reasoning file template
- CLAUDE.md configuration examples
- Best practices for council composition

---

## References

- Source: YouTube video transcript (Prompt Advisors channel)
- Import date: 2026-01-24
- Related: Multi-agent orchestration, context engineering, sub-agent patterns
