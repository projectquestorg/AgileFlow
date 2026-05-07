# Features Workflow — Multi-Agent Feature Brainstorm Audit

**Triggers:** "find missing features", "feature brainstorm audit", "what features should we add", "analyze the app for feature gaps", "UX audit for features", "what are we missing compared to competitors"

**Goal:** Deploy multiple specialized brainstorm analyzers in parallel against the codebase or a specific directory, deduplicate and prioritize their findings through a consensus pass, and produce a Feature Brainstorm Report with HIGH_VALUE / MEDIUM_VALUE / NICE_TO_HAVE / SPECULATIVE ratings.

## Inputs needed

| Input       | Required | How to get it                                                      |
| ----------- | -------- | ------------------------------------------------------------------ |
| target path | No       | Default: `.` (whole project). Can be a file or directory           |
| depth       | No       | Default: quick (3 core analyzers). Options: deep (all 5 analyzers) |
| focus       | No       | Default: all. Options: features, ux, market, growth, integration   |

## Steps

1. Ask the user: "What should I analyze?" Options: [A] The whole project (recommended), [B] A specific directory (e.g., `app/`, `src/`), [C] A specific file.

2. Ask: "Depth?" Options: [A] Quick — 3 core analyzers, fast results (recommended for first pass), [B] Deep — all 5 analyzers, comprehensive coverage.

3. Ask: "Focus area?" Options: [A] All areas, [B] Feature gaps only, [C] UX improvements, [D] Market-standard patterns, [E] Growth opportunities, [F] Integration gaps.

4. Read the target path to understand what the application currently does.

5. Deploy analyzers simultaneously based on depth/focus selection:
   - **Features analyzer** — what features are absent that similar apps have
   - **UX analyzer** — friction points, missing affordances, incomplete flows
   - **Market analyzer** — market-standard patterns and competitive gaps (deep only)
   - **Growth analyzer** — viral loops, retention mechanics, power user features (deep only)
   - **Integration analyzer** — third-party services that would add obvious value (deep only)

6. Collect all outputs. Run consensus coordination: deduplicate suggestions that multiple analyzers identified, vote on priority, assign value ratings:
   - **HIGH_VALUE**: 2+ analyzers identified it, clear user benefit, feasible
   - **MEDIUM_VALUE**: 1 analyzer with strong evidence or 2 with weaker evidence
   - **NICE_TO_HAVE**: low complexity, minor improvement
   - **SPECULATIVE**: interesting but needs validation

7. Present the Feature Brainstorm Report:
   - HIGH_VALUE features with implementation complexity estimate
   - MEDIUM_VALUE features grouped by theme
   - NICE_TO_HAVE quick wins
   - Summary: N total ideas, X high-value, Y medium-value

8. Ask the user: [A] Create an Epic for the top HIGH_VALUE feature, [B] Generate product briefs for multiple features, [C] Save the report, [D] Narrow to a specific category.

## Output

Feature Brainstorm Report with prioritized, deduplicated suggestions. Value ratings (HIGH_VALUE / MEDIUM_VALUE / NICE_TO_HAVE / SPECULATIVE). Implementation complexity estimates. Optional Epic or product brief for selected features.

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
