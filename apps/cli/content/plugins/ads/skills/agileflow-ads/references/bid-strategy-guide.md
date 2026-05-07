# Bid Strategy Guide

**Load this when:** recommending or diagnosing bidding strategies across platforms.

## Google Ads bid strategies

### Decision tree

```
Do you have conversion tracking?
├── NO  → Manual CPC or Maximize Clicks (gather data first)
└── YES → How many conversions/month?
    ├── <30/month  → Manual CPC with ECPC, or Target Impression Share for brand
    ├── 30–50/month → Target CPA (borderline — watch learning phase)
    └── 50+/month  → Smart Bidding (tCPA, tROAS, or Maximize Conversions)
```

### Smart Bidding strategies

| Strategy                      | Use when                                       | Avoid when                                           |
| ----------------------------- | ---------------------------------------------- | ---------------------------------------------------- |
| **Maximize Conversions**      | New campaigns, want volume, no CPA target yet  | CPA matters — it'll spend to budget regardless       |
| **Target CPA**                | Know your target CPA, 50+ monthly conversions  | <30 conversions/month — insufficient signal          |
| **Target ROAS**               | Ecommerce with revenue values, 50+ conversions | Revenue values not tracked accurately                |
| **Maximize Conversion Value** | Want revenue volume, have revenue tracking     | CPA efficiency matters more than raw revenue         |
| **Target Impression Share**   | Brand campaigns, competitor conquest           | Performance campaigns — wastes budget on impressions |
| **Enhanced CPC**              | Manual bidding with slight automation          | You have enough conversions for full smart bidding   |

### Learning phase rules

- Learning phase: ~1–2 weeks after any significant change
- Need 50+ conversions in learning phase to exit cleanly
- **Never** make major changes (bid, budget, targeting) during learning phase
- Budget changes >20% restart learning phase
- Audience changes restart learning phase

### Broad Match + Smart Bidding rule

**Never use Broad Match without Smart Bidding.** Broad Match without tCPA/tROAS
has no guardrails — it will find irrelevant traffic and waste budget.

Broad Match + tCPA or tROAS = safe. Google's algorithm self-corrects.
Broad Match + Manual CPC = guaranteed waste.

## Meta bid strategies

| Strategy                     | Use when                                                            |
| ---------------------------- | ------------------------------------------------------------------- |
| **Highest Volume** (default) | Learning phase, new campaigns, maximizing results within budget     |
| **Cost per Result Goal**     | You have a CPA target and enough historical data (100+ conversions) |
| **ROAS Goal**                | Ecommerce with revenue tracking, 100+ purchase events               |
| **Bid Cap**                  | Strict CPA control needed, willing to sacrifice volume              |

### Meta learning phase

- Needs 50 optimization events per ad set per week to exit learning
- Consolidate ad sets — too many competing for the same audience fragments data
- Avoid editing during learning: budget, bid, creative, audience changes restart it

### Advantage+ Shopping (ASC) — when to use

Use when:

- Ecommerce with 100+ monthly purchases
- You've maxed out manual campaigns
- Want to test broad creative with algorithm-driven targeting

Avoid when:

- Brand safety is critical (less control)
- Niche B2B audience (algorithm needs volume to work)

## LinkedIn bid strategies

| Strategy             | Use when                                       |
| -------------------- | ---------------------------------------------- |
| **Maximum Delivery** | New campaigns, awareness, learning phase       |
| **Target Cost**      | Stable campaigns with established CPL baseline |
| **Manual Bidding**   | Specific placement control needed              |

LinkedIn's CPCs are high by default. Start with Maximum Delivery and
optimize creatives before touching bids.

## Cross-platform budget allocation

### Starting allocation for a new account

```
Total budget = $X/month

If testing (first 30 days):
  Google Search:   50% — highest intent
  Meta:            30% — retargeting + lookalikes
  Reserve:         20% — keep for winning channels

After 60 days with data:
  Double down on channels hitting target CPA
  Cut channels at 2x target CPA with no improvement
```

### Budget change rules

- Never increase budget >20% per week (learning phase)
- To scale fast: duplicate campaign, set new budget on duplicate
- Seasonal increases: plan 2 weeks ahead (learning phase needs time)

## Warning signs in bidding

| Signal                          | Likely cause               | Fix                             |
| ------------------------------- | -------------------------- | ------------------------------- |
| CPA suddenly doubles            | Learning phase reset       | Wait 2 weeks, don't touch       |
| Spend stops before daily budget | Bids too low for auction   | Raise bid or switch to Maximize |
| High spend, zero conversions    | Tracking broken            | Fix tracking before optimizing  |
| High CTR, low conversion rate   | Landing page mismatch      | Fix LP, not the ads             |
| Low CTR, high CVR               | Good intent, poor creative | Improve ad copy                 |
