---
description: Budget allocation and bidding strategy optimizer with industry benchmarks, platform minimums, scaling rules, and reallocation recommendations
argument-hint: "<account-data>"
compact_context:
  priority: medium
  preserve_rules:
    - "ACTIVE COMMAND: /agileflow:ads:budget - Budget & bidding strategy"
    - "Delegate to ads-audit-budget agent for 24 checks"
    - "Include platform minimums and scaling rules"
  state_fields:
    - budget_score
    - total_spend
---

# /agileflow:ads:budget

Run a budget allocation and bidding strategy audit using the `ads-audit-budget` agent with 24 checks, including industry benchmarks and specific reallocation recommendations.

---

## Quick Reference

```
/agileflow:ads:budget <account-data>                  # Full budget audit
```

---

## Process

### STEP 1: Validate Input

If no data provided, ask for:
- Monthly spend per platform
- Campaign-level budgets and performance
- Bid strategies in use
- Conversion data (volume, CPA, ROAS)
- Industry and target metrics

### STEP 2: Deploy Budget Analyzer

```xml
<invoke name="Task">
<parameter name="description">Budget and bidding audit</parameter>
<parameter name="prompt">TASK: Audit budget allocation and bidding strategy.

ACCOUNT DATA:
{budget_data}

Apply ALL 24 checks across 4 categories:
- Budget Allocation (35%) - 8 checks
- Bidding Strategy (30%) - 8 checks
- Scaling & Pacing (20%) - 4 checks
- Platform Mix (15%) - 4 checks

Enforce platform minimums, scaling rules, and 3x Kill Rule.
Include specific dollar reallocation recommendations.

OUTPUT: Full findings with Budget Score X/100</parameter>
<parameter name="subagent_type">ads-audit-budget</parameter>
</invoke>
```

### STEP 3: Present Results

Show Budget Score with specific reallocation recommendations.

---

## Platform Minimums

| Platform | Campaign Minimum | Ad Set/Group Minimum |
|----------|-----------------|---------------------|
| Google Ads | $10/day | $5/day |
| Meta Ads | $20/day | $10/day |
| LinkedIn Ads | $50/day | $25/day |
| TikTok Ads | $50/day campaign | $20/day ad group |
| Microsoft Ads | $10/day | $5/day |

## Scaling Rules

1. Max 20% budget increase per week
2. Only scale campaigns that exited learning phase
3. 3x Kill Rule: Pause if CPA > 3x target
4. Minimum 2 weeks data before major changes

---

<!-- COMPACT_SUMMARY_START -->
## Compact Summary

**Command**: `/agileflow:ads:budget` - Budget & bidding strategy audit

**Agent**: `ads-audit-budget` (24 checks, 4 categories)

**Quick Usage**: `/agileflow:ads:budget <account-data>`
<!-- COMPACT_SUMMARY_END -->
