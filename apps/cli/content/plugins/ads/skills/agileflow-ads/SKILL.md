---
name: agileflow-ads
version: 1.2.0
category: agileflow/ads
description: |
  Use when the user wants to plan, audit, generate, or analyze paid
  advertising campaigns across Google, Meta, LinkedIn, TikTok,
  YouTube, or Microsoft. Covers ad copy generation, budget allocation,
  performance tracking, competitor analysis, and full account audits.
triggers:
  keywords:
    - ad campaign
    - google ads
    - meta ads
    - facebook ads
    - paid advertising
    - ad copy
    - ad budget
    - ad audit
    - ads health
    - campaign performance
    - ad creative
    - ad tracking
    - roas
    - cpa
    - ppc
    - conversion tracking
    - bid strategy
    - campaign structure
    - ad spend
  priority: 60
provides:
  agents: []
learns:
  enabled: true
  file: _learnings/ads.yaml
  maxEntries: 50
depends:
  skills: []
  plugins: [ads]
---

# AgileFlow Ads

Full-stack paid advertising assistant: audit existing accounts, generate ad copy, plan budgets, track performance, and run competitive analysis — across all major platforms.

## When this skill activates

- User mentions Google Ads, Meta, Facebook, LinkedIn, TikTok, YouTube, or Microsoft Advertising
- User wants to generate ad headlines, descriptions, or creatives
- User asks about campaign structure, bidding, or budget allocation
- User wants to audit ad account health or track conversions
- User asks about ROAS, CPA, CTR, or other ad KPIs
- User mentions wasted ad spend, poor performance, or wants to improve results

## Opening discovery flow

**When invoked without clear intent, run ONE question that captures both goal and platform.** Don't fire two separate AskUserQuestion blocks back to back.

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[
  {
    "question": "What are you trying to accomplish with your ads?",
    "header": "Goal",
    "multiSelect": false,
    "options": [
      {"label": "Audit existing campaigns — find what's broken and wasting budget (Recommended for $1K+/mo)", "description": "Health score 0-100, wasted spend estimate, prioritized fixes. I'll ask for your account data next."},
      {"label": "Write new ad copy — headlines, body, CTAs", "description": "40+ variants from your product description + ICP angles, formatted for Meta or Google upload"},
      {"label": "Plan a new campaign from scratch", "description": "Platform selection, budget allocation, campaign structure for your industry and goal"},
      {"label": "Check if my tracking / pixels are working", "description": "Verify conversion events, attribution, pixel fire — the foundation before any optimization"},
      {"label": "Improve ROAS or reduce CPA on existing campaigns", "description": "Performance analysis: bidding, targeting, creative fatigue, budget allocation"},
      {"label": "Analyze what competitors are running", "description": "What ads competitors are showing and how to outposition them"}
    ]
  },
  {
    "question": "Which platform(s) are you working with?",
    "header": "Platform",
    "multiSelect": true,
    "options": [
      {"label": "Google Ads", "description": "Search, Shopping, Performance Max, Display, YouTube"},
      {"label": "Meta / Facebook & Instagram", "description": "Facebook Ads, Instagram Ads, Advantage+ campaigns"},
      {"label": "LinkedIn", "description": "Sponsored Content, Lead Gen Forms — B2B focus"},
      {"label": "TikTok", "description": "Video-first, UGC-style creatives — younger demographics"},
      {"label": "Microsoft / Bing", "description": "Often a Google import — older, higher-income audience, lower CPCs"},
      {"label": "Not running yet — help me choose", "description": "I'll recommend platforms based on your product, audience, and budget"}
    ]
  }
]</parameter>
</invoke>
```

**Route based on answers:**

| Goal                | Next action                                                                         |
| ------------------- | ----------------------------------------------------------------------------------- |
| Audit               | Ask for account data (see below), then run audit commands                           |
| Write copy          | Ask for product description + ICP, then `/agileflow:ads:generate`                   |
| Plan campaign       | Ask budget + industry + primary goal, then `/agileflow:ads:plan`                    |
| Check tracking      | Confirm which events they care about, then `/agileflow:ads:track`                   |
| Improve ROAS/CPA    | Ask for current metrics + targets, then `/agileflow:ads:audit` (wasted spend focus) |
| Competitor analysis | Ask for their domain + your product category, then `/agileflow:ads:competitor`      |

## Gathering account data for audits

After the goal is clear, ask specifically for their data — don't make them guess what to paste:

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "To audit your account, I need your campaign data. What's easiest for you?",
  "header": "Account data",
  "multiSelect": false,
  "options": [
    {"label": "Paste a CSV export (Recommended)", "description": "Google Ads: Campaigns tab → Download. Meta: Ads Manager → Columns → Export. Even a partial export works."},
    {"label": "Paste the performance table directly", "description": "Screenshot the table or copy/paste the text from your dashboard — I'll parse it"},
    {"label": "Describe your setup", "description": "Tell me: platforms, monthly spend, current ROAS/CPA, campaign types, and main goals — I'll work from that"},
    {"label": "I have a file — share the path", "description": "Point me to an exported CSV and I'll read it directly"}
  ]
}]</parameter>
</invoke>
```

**Minimum useful data I need per platform:**

| Platform   | What to include                                                            |
| ---------- | -------------------------------------------------------------------------- |
| Google Ads | Campaign name, type, budget, impressions, clicks, conversions, CPA or ROAS |
| Meta       | Campaign name, objective, spend, results, CPR/CPA, audience description    |
| LinkedIn   | Campaign name, budget, clicks, leads, CPL, objective                       |
| TikTok     | Campaign name, daily budget, conversions, CPA, creative types used         |
| Microsoft  | Whether imported from Google, UET tag status, top campaigns                |

If only partial data is available: run the audit with what you have and explicitly flag what couldn't be assessed.

**Also ask these context questions** before running any audit — they change the benchmarks significantly:

- Industry / vertical (e-commerce, SaaS, local services, lead gen?)
- Monthly ad spend range
- Primary KPI (ROAS target, CPA target, lead volume?)
- How long have the campaigns been running?

## Which audit command to use

| Situation                                 | Command                                                                                 |
| ----------------------------------------- | --------------------------------------------------------------------------------------- |
| Running 2+ platforms, want overall health | `/agileflow:ads:audit` — runs all 6 analyzers, produces weighted score                  |
| Google-only deep dive                     | `/agileflow:ads:google` — 74 checks across campaign structure, keywords, copy, settings |
| Meta-only deep dive                       | `/agileflow:ads:meta` — 46 checks across pixel, creative, audiences, objectives         |
| Budget & bidding focused                  | `/agileflow:ads:budget` — spend efficiency, scaling rules, bid strategy alignment       |
| Creative & copy quality                   | `/agileflow:ads:creative` — copy effectiveness, format coverage, fatigue signals        |
| Tracking & attribution                    | `/agileflow:ads:track` — pixel/tag setup, conversion accuracy, attribution model        |
| Overall marketing health (ads + site)     | `/agileflow:ads:health` — combines ad data with website URL                             |
| Performance over time                     | `/agileflow:ads:track` then `/agileflow:ads:health`                                     |

TikTok, LinkedIn, and Microsoft are handled as part of `/agileflow:ads:audit` when those platforms are included in the data. Run the full audit rather than individual platform commands for secondary platforms.

## After every analysis — guide the next step

Never dump findings without a clear path forward. After any command completes:

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "Audit complete. Ads Health Score: {X}/100. {N} findings — {p0_count} immediate blockers, {p1_count} high-ROI quick wins. Biggest issue: {top_finding}.",
  "header": "What to fix first",
  "multiSelect": false,
  "options": [
    {"label": "Fix {top_p0_issue} now (Recommended)", "description": "{specific fix — e.g., 'Broken conversion tracking on Google — all ROAS numbers are unreliable until this is fixed'}"},
    {"label": "Pause {n} campaigns failing the 3x Kill Rule", "description": "{specific campaigns spending {3x CPA} with {n} conversions — cut waste before optimizing}"},
    {"label": "Deep-dive into {lowest_category} ({score}/100)", "description": "Worst-performing area — I'll walk through every finding with specific fixes"},
    {"label": "Generate new ad copy to test against current", "description": "Fresh variants for your top campaigns — I'll use your existing copy as the baseline"}
  ]
}]</parameter>
</invoke>
```

**Make every option specific** to actual findings. Don't show the kill rule option if no campaigns qualify. Don't show "generate copy" if they just came from the generate workflow.

## Key principles — apply throughout

1. **Tracking first, always** — never recommend optimization before confirming tracking works. Broken pixels mean all ROAS numbers are lies. Start here if anything is uncertain.
2. **3x Kill Rule** — campaigns with CPA > 3x target for 2+ weeks with few conversions should be paused, not tweaked. Say so directly.
3. **Learning phase protection** — don't recommend budget changes that reset Google's learning phase (typically triggered by >20% budget change). Note this whenever relevant.
4. **Broad Match needs Smart Bidding** — never recommend Broad Match keywords without tCPA or tROAS. Broad Match without Smart Bidding burns budget.
5. **No optimization without data** — minimum 2 weeks and 50+ conversions before making structural changes. Flag this if the data is too thin.
6. **Budget before creative** — a great creative with wrong targeting wastes money. Check audience + bidding before recommending new ad copy.

## Integration

- **agileflow-research** — run before competitor analysis or entering a new ad platform; gather market benchmarks and audience insights before spending
- **agileflow-seo** — cross-reference paid and organic strategy; a page that performs well organically signals strong landing page quality for ads
- **agileflow-ideation** — use when brainstorming new campaign angles, product positioning, or untapped audience segments before writing ad copy
- **agileflow-retention** — align ad campaigns with retention mechanics; acquisition ads should funnel into onboarding flows designed for habit formation
- **agileflow-docs** — document campaign strategy, budget rationale, and tracking setup so the team can replicate or audit later
- **agileflow-delivery** — coordinate ad launch with product release; ensure tracking pixels and conversion events are deployed before campaigns go live
- **agileflow-engineering** — delegate pixel implementation, server-side conversion API, or tracking tag deployment work
- **agileflow-planning** — use for quarterly ad budget planning, ROI projections, or prioritising which campaigns to run first

## References

Load these when you need deeper context:

| File                                     | When to load                                                                               |
| ---------------------------------------- | ------------------------------------------------------------------------------------------ |
| `references/platform-benchmarks.md`      | User asks about CTR, CPM, ROAS, or CPA targets — has platform-specific industry benchmarks |
| `references/bid-strategy-guide.md`       | Choosing or changing bid strategy on Google, Meta, LinkedIn, or TikTok                     |
| `references/ad-copy-formula-guide.md`    | Writing or reviewing ad copy — AIDA, PAS, headline formulas, character limits per platform |
| `references/audience-targeting-guide.md` | Setting up lookalikes, retargeting funnels, exclusion lists, audience sizing               |

## Workflows

Follow these step-by-step when the user initiates the matching action:

| File                    | When to follow                                                                                            |
| ----------------------- | --------------------------------------------------------------------------------------------------------- |
| `workflows/audit.md`    | User wants to audit an ad account — gathers data, deploys analyzers, presents health score + action plan  |
| `workflows/generate.md` | User wants to generate ad copy variants — gathers product info, produces 40+ variants, formats for upload |
