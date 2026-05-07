# Audit Workflow — Paid Advertising Account Audit

**Triggers:** "audit my ads", "run an ads audit", "review my Google Ads", "check my Meta campaigns", "ads health score", "what's wrong with my advertising"

**Goal:** Deploy 6 specialized advertising analyzers in parallel against the user's ad account data, then synthesize results into a weighted Ads Health Score (0–100) with a prioritized action plan.

## Inputs needed

| Input        | Required | How to get it                                                                          |
| ------------ | -------- | -------------------------------------------------------------------------------------- |
| account data | Yes      | Ask: "Paste your ad account data, a file path, or describe your campaigns."            |
| depth        | No       | Default: quick. Ask if they want quick / deep / ultradeep                              |
| platforms    | No       | Default: auto-detect from data. Can specify: google, meta, linkedin, tiktok, microsoft |

## Steps

1. Ask the user to provide their ad account data. Accept: pasted CSV exports, account summaries, campaign descriptions, or a file path.

2. Detect the industry type from the account data (e-commerce, B2B SaaS, local services, lead gen, etc.) — this affects benchmark thresholds.

3. Detect active platforms from the data. If the user specified platforms, use those.

4. Determine audit depth. For quick (default): run all 6 analyzers with standard check depth. For deep: more thorough per-analyzer checks. For ultradeep: treat as deep but note that each analyzer may take significantly longer.

5. Deploy all 6 analyzers simultaneously against the account data:
   - **Google analyzer** — campaign structure, keyword strategy, quality scores, ad copy (74 checks)
   - **Meta analyzer** — audience targeting, creative fatigue, campaign objectives, pixel setup (46 checks)
   - **Budget analyzer** — spend distribution, wasted spend, bid strategy efficiency (24 checks)
   - **Creative analyzer** — ad copy quality, CTR patterns, creative fatigue, A/B test coverage
   - **Tracking analyzer** — pixel/tag setup, conversion tracking accuracy, attribution model
   - **Compliance analyzer** — policy violations, restricted content, account health flags

6. Collect all analyzer outputs. Apply weighted scoring: Tracking 25%, Wasted Spend 20%, Structure 15%, Creative 15%, Budget 15%, Compliance 10%.

7. Apply quality gates: flag if optimization is attempted without working tracking, apply the 3x Kill Rule (pause campaigns spending 3x target CPA with no conversions), flag Broad Match campaigns without Smart Bidding.

8. Present the Ads Health Score (0–100) with category breakdown, then the prioritized action plan ordered by impact:
   - P0: Immediate blockers (broken tracking, policy violations)
   - P1: High ROI quick wins (wasted spend, kill rules)
   - P2: Structural improvements (campaign organization, bidding strategy)
   - P3: Creative and testing opportunities

9. Ask the user: [A] Walk me through fixing the P0 issues, [B] Show me the full findings for each analyzer, [C] Generate a 30-day improvement roadmap.

## Output

Ads Health Score with weighted category scores. Prioritized action plan with P0–P3 issues. Platform-specific findings. The score serves as a baseline for future audits.

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
