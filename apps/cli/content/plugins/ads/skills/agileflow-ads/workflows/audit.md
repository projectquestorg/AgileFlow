# Audit Workflow — Paid Advertising Account Audit

**Triggers:** "audit my ads", "run an ads audit", "review my Google Ads", "check my Meta campaigns", "ads health score", "what's wrong with my advertising"

**Goal:** Deploy 6 specialized advertising analyzers in parallel against the user's account data, synthesize results into a weighted Ads Health Score (0–100), and produce a prioritized action plan with specific, dollar-impact estimates where possible.

## Inputs needed

| Input                  | Required | How to get it                                              |
| ---------------------- | -------- | ---------------------------------------------------------- |
| account data           | Yes      | CSV export, pasted table, or described setup               |
| platform(s)            | No       | Auto-detect from data, or already captured in opening flow |
| industry + KPI targets | No       | Ask conversationally — changes benchmarks significantly    |

## Steps

1. **If account data is not provided**, ask specifically — don't make them guess what format to use:

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "To audit your account, I need your campaign data. What's easiest?",
  "header": "Account data",
  "multiSelect": false,
  "options": [
    {"label": "Paste a CSV export (Recommended)", "description": "Google Ads: Campaigns tab → Download. Meta: Ads Manager → Columns → Export. Even a partial export works."},
    {"label": "Paste the performance table from your dashboard", "description": "Copy/paste the text from your campaigns view — I'll parse it"},
    {"label": "Describe your setup", "description": "Tell me: platforms, monthly spend, ROAS/CPA, campaign types, and main goals"},
    {"label": "I have a file — share the path", "description": "Point me to an exported CSV and I'll read it directly"}
  ]
}]</parameter>
</invoke>
```

2. **Gather context** — ask conversationally before running analyzers:
   - Industry / vertical (e-commerce, SaaS, local services, lead gen, B2B?)
   - Monthly ad spend range
   - Primary KPI: ROAS target, CPA target, or lead volume goal?
   - How long have these campaigns been running?

   These change benchmarks significantly. A 3x ROAS for e-commerce is average; for SaaS it's strong. Skip if already captured in the opening flow.

3. **Detect active platforms** from the data. If the user specified platforms in the opening flow, use those.

4. **Deploy all 6 analyzers simultaneously** — no need to ask for depth, run quick by default:
   - **Google analyzer** — campaign structure, keyword strategy, quality scores, ad copy, wasted spend (74 checks)
   - **Meta analyzer** — audience targeting, creative fatigue, objectives, pixel/CAPI setup (46 checks)
   - **Budget analyzer** — spend distribution, scaling rules, bid strategy efficiency (24 checks)
   - **Creative analyzer** — copy quality, CTR patterns, creative fatigue, A/B test coverage
   - **Tracking analyzer** — pixel/tag setup, conversion tracking accuracy, attribution model
   - **Compliance analyzer** — policy violations, restricted content, account health flags

5. **Apply quality gates automatically:**
   - Flag if tracking is broken — optimization recommendations are unreliable without it
   - Apply 3x Kill Rule: campaigns with CPA > 3x target for 2+ weeks → flag for pause
   - Flag Broad Match keywords without Smart Bidding
   - Flag recent changes that may have reset learning phase

6. **Weighted scoring:** Tracking 25%, Wasted Spend 20%, Structure 15%, Creative 15%, Budget 15%, Compliance 10%.

7. **Present the Ads Health Score (0–100):**

   ```
   Ads Health Score: 61/100 — needs work

   Category       Score   Top Issue
   Tracking        45      Google conversion tag missing on /checkout
   Wasted Spend    52      4 campaigns at 4-6x target CPA — $3,200/mo estimated waste
   Structure       74      7 ad groups with single ads — no rotation testing
   Creative        68      Meta creative sets showing 90%+ impression share (fatigue)
   Budget          71      3 campaigns in learning phase — avoid budget changes
   Compliance      90      —
   ```

8. **Prioritized action plan:**
   - **P0** (immediate blockers): Broken tracking, policy violations, campaigns burning budget with zero conversions
   - **P1** (high ROI quick wins): Kill Rule candidates, wasted spend, broken attribution
   - **P2** (structural improvements): Campaign organization, bidding strategy, audience targeting
   - **P3** (creative and testing): Copy refresh, A/B test setup, creative rotation

9. **Guide next step with AskUserQuestion** — specific to actual findings:

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "Ads Health Score: {X}/100. {p0_count} immediate blockers, {p1_count} high-ROI quick wins. Biggest issue: {top_finding}.",
  "header": "What to fix first",
  "multiSelect": false,
  "options": [
    {"label": "Fix {top_p0_issue} now (Recommended)", "description": "{specific fix — e.g., 'Add Google conversion tag to /checkout — without this, all ROAS data is wrong'}"},
    {"label": "Pause {n} campaigns failing the 3x Kill Rule", "description": "{specific campaigns} spending {estimated_waste}/mo with {n} conversions — cut waste before optimizing"},
    {"label": "Deep-dive into {lowest_category} ({score}/100)", "description": "Worst area — I'll walk through every finding with specific fixes"},
    {"label": "Generate fresh ad copy to test against current", "description": "40+ headline/body/CTA variants for your top campaigns — use existing copy as the baseline"}
  ]
}]</parameter>
</invoke>
```

Customize every option. Don't show kill rule option if no campaigns qualify. Don't show copy generation if they just came from the generate workflow.

## Output

Ads Health Score (0–100) with weighted category scores. Prioritized action plan (P0–P3). Platform-specific findings. Estimated wasted spend where calculable. Baseline for future audits.

## Fallbacks

**If AskUserQuestion is unavailable:**
Present options as a numbered list. Example:

```
What would you like to tackle first?
1. Fix the P0 issues now
2. Pause the Kill Rule campaigns
3. Deep-dive into the worst category
```

**If agent spawning is unavailable:**
Run each analysis inline sequentially using the reference files in `references/`. Consolidate into the same output format — same result, just slower.
