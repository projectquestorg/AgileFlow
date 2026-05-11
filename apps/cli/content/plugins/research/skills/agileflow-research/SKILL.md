---
name: agileflow-research
version: 1.0.0
category: agileflow/research
description: |
  Use when the user needs external knowledge before implementing:
  unfamiliar libraries, API integrations, architectural patterns, or
  technical decisions requiring research. Also manages a research
  knowledge base for the project.
triggers:
  keywords:
    - research
    - how does this work
    - best practice for
    - how to integrate
    - need to look up
    - unfamiliar with
    - find out about
    - what's the right way
    - external api
    - documentation for
    - library comparison
  priority: 55
provides:
  agents: []
learns:
  enabled: true
  file: _learnings/research.yaml
  maxEntries: 30
depends:
  skills: []
  plugins: [research]
---

# AgileFlow Research

Technical research assistant and knowledge base manager. Formulates
research prompts for external lookup, imports findings, synthesizes
across sources, and persists results for future sessions.

## When this skill activates

- User encounters an unfamiliar library, API, or pattern
- User is stuck after 2+ failed fix attempts (escalate to research)
- User asks "how does X work" for something outside the codebase
- User says "I have research to import" or pastes a large block of findings
- User wants to find patterns or consensus across multiple research notes
- User wants to turn saved research into an implementation plan
- Babysit mentor detects an unfamiliar pattern that needs external info

## Research workflow

| Step          | Trigger                                                    | What it does                                                                       |
| ------------- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| 1. Ask        | User says "generate a research prompt" or "I'm stuck on X" | Formulate a 200+ line prompt for external AI tools — see `workflows/ask.md`        |
| 2. Import     | User says "I have research to import" or pastes findings   | Save external findings to `docs/10-research/` — see `workflows/import.md`          |
| 3. Analyze    | User says "analyze my research on X"                       | Deploy domain experts to map findings to the codebase — see `workflows/analyze.md` |
| 4. Synthesize | User says "synthesize my research on X"                    | Find consensus and conflicts across multiple notes — see `workflows/synthesize.md` |

## Research prompt quality rules

A good research prompt includes:

- 50+ lines of actual relevant code
- The exact error or unknown (full stack trace if applicable)
- What has already been tried
- Library versions
- 3+ specific questions (not "how do I fix this?")

**Bad:** "How do I fix OAuth in Next.js?"
**Good:** Full code + error + "tried X and Y, still getting Z — specifically: (1) why does the callback URL mismatch... (2) is this a cookie SameSite issue... (3) does NextAuth v4 handle this differently?"

## Stuck detection

Trigger research automatically when:

- Same error appears after 2+ different fix attempts
- "Cannot find module" for an unfamiliar package
- Cryptic library error with no obvious cause
- OAuth, SSO, or payment provider integration errors

## Integration

- **agileflow-engineering** — research is the input; engineering is the output; always resolve unknowns via research before delegating implementation
- **agileflow-planning** — use research findings to sharpen impact analysis and estimation; concrete technical knowledge produces more reliable effort estimates
- **agileflow-council** — feed research output into a council session when the decision involves real strategic trade-offs beyond a single technical question
- **agileflow-adr** — after research produces a clear answer, document the chosen approach as an ADR so the decision is recorded and doesn't need to be re-researched
- **agileflow-debug** — the primary stuck-detection escape hatch; when debug attempts fail twice, escalate to research with a 200+ line prompt including full context
- **agileflow-migration** — run research before planning any major library or framework migration; version-specific gotchas and community patterns are exactly what research surfaces
- **agileflow-ideation** — use research during ideation to validate ideas against market data, competitor analysis, and user research before committing to build them
- **agileflow-ads** — research competitor ad strategies and platform benchmarks before planning or auditing ad campaigns

## References

Load these files when you need deeper context for the relevant task:

| File                                  | When to load                                                                                        |
| ------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `references/research-prompt-guide.md` | Writing a research prompt — required components, quality checklist, when to escalate vs keep trying |

## Workflows

Follow these step-by-step when the user initiates the matching action:

| File                      | When to follow                                                                            |
| ------------------------- | ----------------------------------------------------------------------------------------- |
| `workflows/ask.md`        | User needs to formulate a research prompt for external lookup (ChatGPT, Claude web, etc.) |
| `workflows/import.md`     | User has content to save — YouTube transcript, article, AI answer, meeting notes          |
| `workflows/analyze.md`    | User wants to analyze existing research notes for patterns or decisions                   |
| `workflows/synthesize.md` | User wants to combine multiple research notes on the same topic into one                  |
