# Convene Workflow — AI Council for Strategic Decisions

**Triggers:** "convene the council", "agents gather", "council assemble", "get three perspectives on", "I need balanced advice on", "strategic decision about", "should we adopt X", "GraphQL vs REST", "build vs buy"

**Goal:** Deploy three AI council perspectives (Optimist, Devil's Advocate, Neutral Analyst) on a strategic question, then synthesize into a recommendation with confidence level.

## Inputs needed

| Input    | Required | How to get it                                                                              |
| -------- | -------- | ------------------------------------------------------------------------------------------ |
| question | Yes      | Ask if not provided: "What decision or question should the council deliberate on?"         |
| mode     | No       | Default: parallel. Options: parallel (single round), debate (agents respond to each other) |
| rounds   | No       | Only for debate mode. Default: 2                                                           |

## When to use this workflow

Best for strategic, non-technical decisions where balanced perspectives matter:

- Architecture decisions ("Should we adopt microservices?")
- Technology choices ("GraphQL vs REST for our API?")
- Process decisions ("Should we implement feature flags?")
- Business tradeoffs ("Build vs buy for this feature?")

Not for: code implementation tasks, simple questions with clear answers, or research tasks.

## Steps

1. Get the question from the user if not already stated. If the question is vague, help them sharpen it: "Is this primarily a technical decision, a resource decision, or a strategic direction decision?"

2. Ask the user: "Which mode? [A] Parallel (all three perspectives at once, then synthesis — recommended for most decisions), [B] Debate (agents respond to each other across multiple rounds — better for nuanced tradeoffs)."

3. Create a session folder at `.agileflow/council/sessions/<timestamp>/`.

4. **Parallel mode:** Deploy all three council members simultaneously:
   - **Optimist Strategist** — best-case scenarios, opportunities, success pathways, why this could work
   - **Devil's Advocate** — risks, blind spots, assumptions to stress-test, why this could fail
   - **Neutral Analyst** — trade-off analysis, evidence synthesis, decision criteria, what data would change the answer

   Each member receives: the full question, project context (read `package.json` or `CLAUDE.md`), and their specific role prompt.

5. **Debate mode:** Run the first round as parallel above. Then share each agent's perspective with the others and run a second round where they respond to what the others said. Repeat for the configured number of rounds.

6. Collect all perspectives. Write them to `shared_reasoning.md` in the session folder.

7. Synthesize:
   - **Common Ground** — what all three perspectives agree on
   - **Key Tensions** — where they fundamentally differ and why
   - **Recommendation** — a specific decision with confidence level (High/Medium/Low) and the reasoning

8. Present the full deliberation with: individual perspective summaries, synthesis section, and recommended next steps.

9. Ask the user: [A] Proceed with the recommendation, [B] Dig into the Devil's Advocate concerns, [C] Request a second debate round, [D] Save this session.

## Output

Deliberation written to `.agileflow/council/sessions/<timestamp>/shared_reasoning.md`. Synthesis with recommendation and confidence level. Next steps.

## Fallbacks

**If interactive prompts (AskUserQuestion) are unavailable:**
Present options as a numbered list in your response. Ask the user to reply with a number. Example:

```
How would you like to proceed?
1. Fix the P0 findings now
2. Review full findings first
3. Export report only
```

**If agent spawning (Task tool / multi-agent) is unavailable:**
Perform each analysis inline and sequentially instead of spawning parallel agents.
Work through the key checks for each domain yourself using the reference files in `references/`.
Consolidate findings into the same structured output format — the user gets the same result, just slower.
