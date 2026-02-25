---
description: Campaign planning with industry-specific templates, multi-step discovery, budget allocation, and platform recommendations
argument-hint: "[INDUSTRY=auto] [BUDGET=monthly] [GOAL=conversions]"
compact_context:
  priority: medium
  preserve_rules:
    - "ACTIVE COMMAND: /agileflow:ads:plan - Campaign planning"
    - "Use AskUserQuestion for multi-step discovery flow"
    - "Apply industry-specific templates and platform recommendations"
    - "Include budget allocation matrix and timeline"
  state_fields:
    - industry
    - budget
    - goal
    - platforms
---

# /agileflow:ads:plan

Generate a comprehensive paid advertising campaign plan with industry-specific templates, platform recommendations, budget allocation, and timeline.

---

## Quick Reference

```
/agileflow:ads:plan                                     # Interactive planning (recommended)
/agileflow:ads:plan INDUSTRY=saas BUDGET=5000           # Direct with parameters
/agileflow:ads:plan INDUSTRY=ecommerce GOAL=roas        # E-commerce with ROAS goal
```

---

## Multi-Step Discovery Flow

### STEP 1: Business Discovery

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[
  {
    "question": "What type of business are you advertising for?",
    "header": "Industry",
    "multiSelect": false,
    "options": [
      {"label": "SaaS / Software", "description": "Software product, free trials, demos, subscriptions"},
      {"label": "E-commerce / Retail", "description": "Physical or digital products, online store"},
      {"label": "Local Services", "description": "Service-area business, appointments, phone calls"},
      {"label": "B2B / Enterprise", "description": "Long sales cycle, demos, enterprise deals"}
    ]
  },
  {
    "question": "What's your primary advertising goal?",
    "header": "Goal",
    "multiSelect": false,
    "options": [
      {"label": "Lead generation (Recommended for most)", "description": "Collect leads, demos, sign-ups"},
      {"label": "Direct sales / ROAS", "description": "Drive purchases with measurable return"},
      {"label": "Brand awareness", "description": "Reach and frequency for brand building"},
      {"label": "App installs", "description": "Drive mobile app downloads"}
    ]
  },
  {
    "question": "What's your monthly advertising budget?",
    "header": "Budget",
    "multiSelect": false,
    "options": [
      {"label": "$1,000 - $5,000", "description": "Starter budget - focus on 1-2 platforms"},
      {"label": "$5,000 - $20,000", "description": "Growth budget - 2-3 platforms recommended"},
      {"label": "$20,000 - $100,000", "description": "Scale budget - multi-platform strategy"},
      {"label": "$100,000+", "description": "Enterprise budget - full platform coverage"}
    ]
  }
]</parameter>
</invoke>
```

### STEP 2: Platform Selection

Based on industry and budget, recommend platforms:

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "Based on {industry} with ${budget}/mo budget, which platforms do you want to include?",
  "header": "Platforms",
  "multiSelect": true,
  "options": [
    {"label": "Google Ads (Recommended)", "description": "Search intent capture - best for {reason}"},
    {"label": "Meta Ads (Recommended)", "description": "Prospecting and retargeting - {audience_size}"},
    {"label": "LinkedIn Ads", "description": "B2B targeting - min $50/day recommended"},
    {"label": "TikTok Ads", "description": "Younger demographics - min $50/day campaign"}
  ]
}]</parameter>
</invoke>
```

### STEP 3: Generate Campaign Plan

Based on discoveries, generate the full plan.

---

## Industry Templates

### SaaS / Software
```markdown
## Campaign Structure: SaaS

### Google Ads (40% of budget)
- **Search - Brand**: Protect brand terms, tCPA bidding
- **Search - Non-Brand (High Intent)**: "buy", "pricing", "vs", "alternative" keywords
- **Search - Non-Brand (Research)**: "how to", "best", "what is" keywords
- **Performance Max**: Product feed + audience signals

### Meta Ads (35% of budget)
- **Prospecting - Lookalike**: LAL from trial signups/demos
- **Prospecting - Interest**: Job titles, competitor interests
- **Retargeting - Website**: 30/60/90 day windows
- **Retargeting - Engagement**: Video viewers, page engagers

### LinkedIn Ads (25% of budget)
- **Sponsored Content**: Thought leadership, case studies
- **Lead Gen Forms**: Direct lead capture (no landing page)
- **Retargeting**: Website visitors, engagement audiences

### KPIs
| Metric | Target |
|--------|--------|
| CPL (MQL) | $50-150 |
| CPL (SQL) | $150-400 |
| Trial-to-Paid | 15-25% |
| ROAS (12mo LTV) | 5:1+ |
```

### E-commerce / Retail
```markdown
## Campaign Structure: E-commerce

### Google Ads (50% of budget)
- **Shopping / PMax**: Product feed campaigns
- **Search - Brand**: Brand protection
- **Search - Non-Brand**: Product + category keywords
- **Dynamic Search Ads**: Keyword gap coverage

### Meta Ads (40% of budget)
- **Advantage+ Shopping**: Automated catalog sales
- **Prospecting - Lookalike**: LAL from purchasers
- **Retargeting - DPA**: Dynamic product ads
- **Retargeting - Cart Abandonment**: 7/14/30 day

### TikTok (10% of budget)
- **Spark Ads**: Boost organic UGC
- **Collection Ads**: Catalog-driven

### KPIs
| Metric | Target |
|--------|--------|
| ROAS | 3:1 - 5:1 |
| CPA (Purchase) | < $30-80 |
| AOV:CPA | > 3:1 |
| Cart Abandonment Recovery | 10-15% |
```

### Local Services
```markdown
## Campaign Structure: Local Services

### Google Ads (60% of budget)
- **Search - Service**: "[service] near me", "[service] [city]"
- **Search - Brand**: Brand protection
- **Local Service Ads**: Google Guaranteed (if eligible)
- **Call-Only Campaigns**: Direct phone calls

### Meta Ads (30% of budget)
- **Prospecting - Radius**: 15-30 mile radius targeting
- **Retargeting - Website**: Visitors who didn't convert
- **Lead Gen Forms**: Quick contact form

### Microsoft Ads (10% of budget)
- **Search Import**: Import Google campaigns

### KPIs
| Metric | Target |
|--------|--------|
| CPL | $15-50 |
| Cost Per Call | $20-60 |
| Booking Rate | 25-40% |
| Customer LTV:CPA | > 5:1 |
```

### B2B / Enterprise
```markdown
## Campaign Structure: B2B

### LinkedIn Ads (40% of budget)
- **Sponsored Content**: Whitepapers, case studies
- **Lead Gen Forms**: Gated content
- **ABM Campaigns**: Matched audiences for target accounts
- **Retargeting**: Website visitors

### Google Ads (35% of budget)
- **Search - High Intent**: "enterprise [solution]", "[category] software"
- **Search - Competitor**: "[competitor] alternative"
- **Display - Remarketing**: Content downloaders
- **YouTube**: Product demos

### Meta Ads (25% of budget)
- **Prospecting - LAL**: From CRM customer list
- **Retargeting**: Website + LinkedIn crossover
- **Content Distribution**: Webinar/event promotion

### KPIs
| Metric | Target |
|--------|--------|
| CPL (MQL) | $100-300 |
| CPL (SQL) | $300-1000 |
| Pipeline Contribution | 30-50% |
| Deal Close Rate | 10-20% |
```

---

## Budget Allocation Matrix

| Monthly Budget | Platforms | Allocation |
|---------------|-----------|------------|
| $1K-5K | 1-2 | 70% primary / 30% secondary |
| $5K-20K | 2-3 | 50% / 30% / 20% |
| $20K-100K | 3-4 | 40% / 25% / 20% / 15% |
| $100K+ | 4-6 | Proportional to ROAS by platform |

Within each platform:
- **70%** Proven campaigns (known performers)
- **20%** Testing (new audiences, creatives, keywords)
- **10%** Experimental (new platforms, formats, strategies)

---

## Output Format

```markdown
# Paid Advertising Campaign Plan

**Industry**: {type}
**Monthly Budget**: ${amount}
**Goal**: {primary goal}
**Platforms**: {selected platforms}
**Timeline**: {3/6/12 month}

---

## Executive Summary
{2-3 sentences on the strategy}

---

## Platform Breakdown

### {Platform 1} ({X}% - ${amount}/mo)
{Campaign structure from template}

### {Platform 2} ({X}% - ${amount}/mo)
{Campaign structure from template}

---

## Launch Timeline

### Week 1-2: Foundation
- [ ] Set up conversion tracking on all platforms
- [ ] Create audiences and upload customer lists
- [ ] Build campaign structures (no ads yet)

### Week 3-4: Launch
- [ ] Launch brand campaigns first
- [ ] Activate retargeting campaigns
- [ ] Begin prospecting with proven audiences

### Month 2: Optimize
- [ ] Review search terms, add negatives
- [ ] Identify winning/losing creatives
- [ ] Adjust bids based on early data

### Month 3: Scale
- [ ] Scale winners (20% budget increase/week max)
- [ ] Pause underperformers (3x Kill Rule)
- [ ] Test new audiences and creatives

---

## Measurement Framework

| KPI | Target | Measurement |
|-----|--------|------------|
| {kpi} | {target} | {how to measure} |

---

## Budget Scaling Rules

1. Only scale campaigns that have exited learning phase
2. Maximum 20% budget increase per week
3. 3x Kill Rule: Pause campaigns with CPA > 3x target
4. Minimum 2 weeks of data before major changes
5. Never scale and test simultaneously on same campaign
```

---

<!-- COMPACT_SUMMARY_START -->
## Compact Summary

**Command**: `/agileflow:ads:plan` - Campaign planning with industry templates

**Input**: Industry + budget + goal (interactive discovery or parameters)

**Output**: Full campaign plan with platform allocation, structure, timeline, and KPIs

**Usage**: `/agileflow:ads:plan [INDUSTRY=auto] [BUDGET=monthly] [GOAL=conversions]`
<!-- COMPACT_SUMMARY_END -->
