---
description: Google Ads deep-dive audit with 74 deterministic checks across conversion tracking, spend efficiency, account structure, keywords, ad copy, and settings
argument-hint: "<account-data>"
compact_context:
  priority: medium
  preserve_rules:
    - "ACTIVE COMMAND: /agileflow:ads:google - Google Ads deep-dive"
    - "Delegate to ads-audit-google agent for 74 checks"
    - "Quality gates: tracking required, no Broad without Smart Bidding, 3x Kill Rule"
  state_fields:
    - google_score
---

# /agileflow:ads:google

Run a deep-dive audit on a Google Ads account using the `ads-audit-google` agent with 74 deterministic checks across 6 categories.

---

## Quick Reference

```
/agileflow:ads:google <account-data>                  # Full Google Ads audit
```

---

## Process

### STEP 1: Validate Input

If no account data provided, ask the user to paste or describe their Google Ads setup including:
- Campaign types and objectives
- Budget and spend data
- Keyword match types and Quality Scores
- Ad copy and extensions
- Conversion tracking setup
- Bid strategies in use

### STEP 2: Deploy Google Ads Analyzer

```xml
<invoke name="Task">
<parameter name="description">Google Ads deep-dive audit</parameter>
<parameter name="prompt">TASK: Run a comprehensive Google Ads audit.

ACCOUNT DATA:
{account_data}

Apply ALL 74 checks across 6 weighted categories:
- Conversion Tracking (25%) - 12 checks
- Wasted Spend (25%) - 15 checks
- Account Structure (15%) - 12 checks
- Keyword Strategy (15%) - 14 checks
- Ad Copy Quality (10%) - 11 checks
- Campaign Settings (10%) - 10 checks

Enforce ALL quality gates:
1. No optimization without conversion tracking
2. No Broad Match without Smart Bidding
3. 3x Kill Rule for CPA
4. Brand/non-brand separation

OUTPUT: Full findings with Google Ads Score X/100</parameter>
<parameter name="subagent_type">ads-audit-google</parameter>
</invoke>
```

### STEP 3: Present Results

Show the Google Ads Score and key findings, then offer next steps:

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "Google Ads Audit: Score {X}/100. {N} findings ({critical} critical). Quality gates: {status}.",
  "header": "Next steps",
  "multiSelect": false,
  "options": [
    {"label": "Fix critical issues (Recommended)", "description": "{top issues}"},
    {"label": "Run full multi-platform audit", "description": "Check all platforms together"},
    {"label": "Optimize budget allocation", "description": "Run /agileflow:ads:budget"},
    {"label": "Review creative quality", "description": "Run /agileflow:ads:creative"}
  ]
}]</parameter>
</invoke>
```

---

## 74 Checks Overview

| Category | Weight | Checks | Focus |
|----------|--------|--------|-------|
| Conversion Tracking | 25% | 12 | Tag, enhanced conversions, CAPI, consent mode |
| Wasted Spend | 25% | 15 | Negatives, search terms, 3x rule, QS, network |
| Account Structure | 15% | 12 | Naming, ad groups, PMax isolation, experiments |
| Keyword Strategy | 15% | 14 | Match types, QS distribution, intent alignment |
| Ad Copy Quality | 10% | 11 | RSAs, headlines, CTAs, extensions, testing |
| Campaign Settings | 10% | 10 | Bidding, location, auto-apply, remarketing |

---

<!-- COMPACT_SUMMARY_START -->
## Compact Summary

**Command**: `/agileflow:ads:google` - Google Ads deep-dive audit

**Agent**: `ads-audit-google` (74 checks, 6 categories)

**Quick Usage**: `/agileflow:ads:google <account-data>`
<!-- COMPACT_SUMMARY_END -->
