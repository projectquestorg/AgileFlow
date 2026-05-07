# Multi-Expert Workflow — Parallel Domain Expert Analysis

**Triggers:** "get multiple experts to look at this", "multi-expert analysis", "deploy domain experts on", "get high confidence on", "ask security AND performance about this", "is our auth implementation secure"

**Goal:** Select 3–5 domain experts based on the question, deploy them simultaneously, and synthesize their independent findings into a confidence-scored report.

## Inputs needed

| Input    | Required | How to get it       |
| -------- | -------- | ------------------- |
| question | Yes      | Ask if not provided |

## Available experts

Security, API, Testing, Database, Performance, CI/CD, DevOps, Accessibility, Architecture, UI, Mobile, Monitoring, Documentation, Integrations

## Steps

1. Get the question from the user if not provided.

2. Detect which domains are relevant from the question. Use these keyword signals:
   - **Security**: auth, JWT, OAuth, vulnerability, XSS, CSRF, secure, encrypt, password, token
   - **Performance**: slow, cache, optimize, latency, bundle, memory, render, query
   - **API**: endpoint, REST, GraphQL, versioning, rate limit, payload
   - **Testing**: coverage, unit test, integration test, mock, assertion, flaky
   - **Database**: schema, migration, query, index, join, N+1, postgres, mongo
   - **Architecture**: coupling, dependency, patterns, layering, circular, complexity
   - **Accessibility**: ARIA, keyboard, screen reader, WCAG, contrast, focus
   - **UI**: component, styling, responsive, layout, UX, design

3. Select 3–5 experts (maximum 5 to avoid synthesis overhead). Tell the user: "I'll deploy these experts: [list]. Approve or adjust?" Options: [A] Looks good, deploy, [B] Add [expert], [C] Remove [expert].

4. Deploy all selected experts simultaneously. Each expert receives: the question, project context, and their specific domain lens. They are asked to: observe what they see in their domain, flag concerns or issues, provide specific recommendations with file paths if applicable, and state their confidence level (High/Medium/Low) with reasoning.

5. Collect all expert outputs. Synthesize with confidence scoring:
   - **HIGH confidence**: 3+ experts agree on the same finding or recommendation
   - **MEDIUM confidence**: 2 experts agree
   - **UNIQUE insight**: 1 expert identified something the others didn't — flag for verification
   - **Disagreement**: experts reached different conclusions on the same point — flag for human review

6. Present the synthesis report:
   - **Key Findings** (HIGH confidence) — findings confirmed by multiple experts
   - **Unique Insights** — single-expert findings worth reviewing
   - **Disagreements** — where experts diverged and why
   - **Recommended Actions** — specific, prioritized steps with confidence ratings

7. Ask the user: [A] Act on the top recommendation, [B] Drill into a specific expert's findings, [C] Run a second round with additional context, [D] Save this analysis.

## Confidence scoring explained

- HIGH (3+ experts agree): Act on this confidently
- MEDIUM (2 experts agree): Likely valid, review the reasoning
- UNIQUE (1 expert, with evidence): Interesting — verify before acting
- DISAGREEMENT: Don't act until resolved — present both positions to the user

## Output

Synthesis report with confidence-scored findings. Prioritized action list. The analysis is available for appending to research notes or linking to a story.

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
