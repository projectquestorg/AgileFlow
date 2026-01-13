# Context Engineering for Coding Agents

**Import Date**: 2026-01-13
**Topic**: Context Engineering for Coding Agents
**Source**: Conference talk transcript (Dex - AI Engineer conference)
**Content Type**: transcript

---

## Summary

This talk by Dex (12 Factor Agents, context engineering pioneer) presents advanced techniques for maximizing AI coding agent effectiveness in brownfield codebases. The core thesis is that LLMs are stateless - the only way to improve output is to improve input context. Most teams experience "slop" (low-quality AI output requiring constant rework) because they fail to manage context windows properly.

The talk introduces the "dumb zone" concept - when you fill more than ~40% of your context window, agent performance degrades significantly. The solution is **frequent intentional compaction**: systematically compressing context through the Research-Plan-Implement (RPI) workflow. Each phase produces a markdown artifact that compresses the previous phase's work, allowing fresh context windows to start with compressed truth rather than raw exploration.

Key insight: Bad research leads to 100s of bad code lines. Human review should focus on the highest-leverage points (research and plans) rather than generated code. This is also how teams maintain "mental alignment" - everyone understanding how the codebase evolves - without reading every line of AI-generated code.

---

## Key Findings

### The Slop Problem
- Survey of 100,000 developers found AI coding leads to massive rework and codebase churn
- Works great for greenfield (new dashboards, simple apps)
- Struggles with brownfield (10-year-old Java codebases, complex systems)
- "Tech debt factory" - shipping fast but accumulating rework

### LLMs Are Stateless
- Every tool call decision is influenced ONLY by current context
- Better tokens in → better tokens out (no memory between calls)
- Negative trajectory problem: if you keep correcting the agent, it learns "I do wrong thing, human yells" and continues the pattern

### The Dumb Zone (~40% context utilization)
- Context windows have diminishing returns after ~40% filled
- Too many MCPs = working entirely in the dumb zone
- Sub-agents are for **context control**, NOT anthropomorphizing roles

### Context Optimization Hierarchy
Optimize context for (in priority order):
1. **Correctness** - no incorrect information (worst thing possible)
2. **Completeness** - no missing information
3. **Size** - minimize noise
4. **Trajectory** - maintain positive momentum

### Sub-Agents Done Right
- NOT for "frontend sub-agent, backend sub-agent, QA sub-agent"
- ARE for forking context to explore, then returning compressed findings
- Example: "Go find how X works" → sub-agent explores entire codebase → returns "the file you want is here"

### Research-Plan-Implement (RPI) Workflow
1. **Research**: Understand how system works, find right files, stay objective
   - Output: Markdown doc with exact files and line numbers
2. **Plan**: Outline exact steps with code snippets, testing strategy
   - Output: Plan file with actual code changes
3. **Implement**: Execute the plan (dumb model can do this)
   - Keep context low throughout

### Compaction Types
- **Research compaction**: Compress understanding of codebase
- **Plan compaction**: Compress intent into executable steps
- **Intentional compaction**: Proactively compress before hitting dumb zone

### Documentation Hierarchy (Lies Scale)
From most truthful to most lies:
1. Actual code (source of truth)
2. Function names
3. Comments
4. Documentation ← most lies

Prefer on-demand compressed context over maintained documentation.

### Progressive Disclosure for Onboarding
- Put CLAUDE.md in repo root with minimal context
- Additional context files at each directory level
- Agent pulls only what it needs, stays in smart zone

### Mental Alignment
- Code review's true purpose: keeping team on same page about how/why codebase changes
- With 2-3x more code shipping, review plans instead of all code
- Include AMP threads on PRs to show journey, not just diff

### Leverage Math
- Bad line of code = 1 bad line
- Bad part of plan = 100+ bad lines
- Bad line of research = entire direction is hosed

### Spec-Driven Development is "Semantically Diffused"
- Term means 100 different things to different people
- Like "agent" - originally useful, now meaningless
- Focus on the principles (compaction, context engineering) not the label

### Scaling Guide
| Task Complexity | Approach |
|-----------------|----------|
| Button color change | Just talk to agent |
| Simple feature | Quick plan |
| Medium feature, multiple repos | Research → Plan |
| Complex brownfield | Full RPI with iteration |

### It Takes Reps
- No perfect prompt exists
- Will get it wrong many times
- Pick one tool, get repetitions
- Don't minmax across multiple AI tools

---

## Implementation Approach

1. **Start with the dumb zone awareness**: Monitor context utilization
2. **Restructure documentation**: Progressive disclosure instead of monolithic CLAUDE.md
3. **Build compaction into workflow**: Research and plan phases before coding
4. **Use sub-agents for exploration**: Fork context, return compressed findings
5. **Move human review upstream**: Focus on research/plan, not generated code
6. **Track trajectory**: Start fresh when conversation goes negative

---

## Code Snippets

*No code snippets in this talk - it's conceptual/workflow-focused.*

---

## Action Items

- [ ] Audit current CLAUDE.md for size - is it consuming smart zone?
- [ ] Implement progressive disclosure pattern for context files
- [ ] Add research phase before complex features
- [ ] Create plan template that includes actual code snippets
- [ ] Set up sub-agent exploration for codebase understanding
- [ ] Track context window utilization during work
- [ ] Review plans/research with team, not just code

---

## Risks & Gotchas

- **40% is approximate**: Varies by task complexity
- **Don't outsource thinking**: AI amplifies your thinking (or lack thereof)
- **Parquet Java lesson**: Some problems require whiteboard first, even with RPI
- **Tools that "spew markdown"**: Not all planning is good planning
- **Senior/junior rift**: Staff engineers cleaning up cursor slop creates cultural tension
- **Cultural change needed**: Must come from technical leadership

---

## Memorable Quotes

> "LLMs are stateless. The only way to get better performance out of an LLM is to put better tokens in."

> "Sub-agents are not for anthropomorphizing roles. They are for controlling context."

> "AI cannot replace thinking. It can only amplify the thinking you have done or the lack of thinking you have done."

> "A bad line of code is a bad line of code. A bad part of a plan could be a hundred bad lines of code."

> "If you can't figure this out, you're hosed."

---

## Story Suggestions

### Potential Practice Doc: Context Engineering for AgileFlow

**Practice doc topics:**
- How to structure CLAUDE.md with progressive disclosure
- When to use research phase vs direct implementation
- Sub-agent patterns for codebase exploration
- Plan file template with code snippets

---

## References

- Source: Conference talk transcript (AI Engineer)
- Speaker: Dex (12 Factor Agents)
- Import date: 2026-01-13
- Related:
  - [Context Engineering Principles](./20260109-context-engineering-principles.md)
  - [Thread-Based Engineering](./20260113-thread-based-engineering-agentic-workflows.md)
