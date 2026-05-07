# Ideate Workflow — Feature Discovery and Ideation Session

**Triggers:** "run ideation", "brainstorm features", "discover new ideas", "ideation session", "what could we build next", "feature discovery for [topic]"

**Goal:** Run a structured discovery session — brainstorm new feature ideas, optionally research them, and generate a product brief — all tracked in the ideation history.

## Inputs needed

| Input | Required | How to get it                                             |
| ----- | -------- | --------------------------------------------------------- |
| topic | No       | Ask: "What area should we ideate around?"                 |
| scope | No       | Default: all. Options: all, specific area, single feature |

## Steps

1. Ask the user: "What area should we ideate around?" Options: [A] The whole product (discover broad opportunities), [B] A specific feature area (user onboarding, checkout, settings, etc.), [C] A specific user problem I have in mind.

2. Read the project structure to understand what already exists. Read `package.json`, key source directories, and any existing ideation history in `.agileflow/ideation/`.

3. **Brainstorm phase.** Generate 10–15 ideas across these categories:
   - Feature gaps (things similar products have that this one doesn't)
   - UX improvements (friction points in existing flows)
   - Growth opportunities (viral loops, referral mechanics, power user features)
   - Integration opportunities (third-party services that would add value)
   - Technical improvements that unlock user value (performance, reliability)

4. Present the ideas in a ranked list. Ask the user: [A] Generate a product brief for [idea], [B] Research [idea] more deeply, [C] Brainstorm more in a specific category, [D] Browse ideation history.

5. If the user picks an idea for a brief, run the ideate-brief sub-workflow: expand the idea into a full product brief with problem statement, proposed solution, user stories, success metrics, and effort estimate.

6. Save the session to `.agileflow/ideation/<timestamp>-session.md` with the topic, generated ideas, and any briefs created.

7. Ask: [A] Create an Epic from this brief (recommended if ready to plan), [B] Save as ideation history for later, [C] Run the feature brainstorm audit for deeper analysis.

## Output

Ranked list of ideation ideas. Optional product brief for selected idea. Session saved to `.agileflow/ideation/`. Optional Epic created.

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
