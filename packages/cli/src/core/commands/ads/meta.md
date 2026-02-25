---
description: Meta/Facebook Ads deep-dive audit with 46 deterministic checks across Pixel/CAPI tracking, creative strategy, account structure, and audience targeting
argument-hint: "<account-data>"
compact_context:
  priority: medium
  preserve_rules:
    - "ACTIVE COMMAND: /agileflow:ads:meta - Meta Ads deep-dive"
    - "Delegate to ads-audit-meta agent for 46 checks"
    - "Quality gates: Pixel required, domain verified, learning phase, Special Ad Categories"
  state_fields:
    - meta_score
---

# /agileflow:ads:meta

Run a deep-dive audit on a Meta/Facebook Ads account using the `ads-audit-meta` agent with 46 deterministic checks across 4 categories.

---

## Quick Reference

```
/agileflow:ads:meta <account-data>                    # Full Meta Ads audit
```

---

## Process

### STEP 1: Validate Input

If no account data provided, ask the user to paste or describe their Meta Ads setup including:
- Pixel and CAPI setup
- Campaign objectives and structure
- Audience targeting (LAL, custom, interest)
- Creative assets and formats
- Budget and performance metrics

### STEP 2: Deploy Meta Ads Analyzer

```xml
<invoke name="Task">
<parameter name="description">Meta Ads deep-dive audit</parameter>
<parameter name="prompt">TASK: Run a comprehensive Meta/Facebook Ads audit.

ACCOUNT DATA:
{account_data}

Apply ALL 46 checks across 4 weighted categories:
- Pixel & CAPI Tracking (30%) - 12 checks
- Creative Strategy (25%) - 14 checks
- Account Structure (25%) - 10 checks
- Audience Targeting (20%) - 10 checks

Enforce ALL quality gates:
1. Pixel installed and firing
2. Domain verified
3. Learning phase healthy (50 conversions/week)
4. Special Ad Categories declared

OUTPUT: Full findings with Meta Ads Score X/100</parameter>
<parameter name="subagent_type">ads-audit-meta</parameter>
</invoke>
```

### STEP 3: Present Results

Show the Meta Ads Score and key findings, then offer next steps.

---

## 46 Checks Overview

| Category | Weight | Checks | Focus |
|----------|--------|--------|-------|
| Pixel & CAPI Tracking | 30% | 12 | Pixel, CAPI, EMQ, AEM, dedup, privacy |
| Creative Strategy | 25% | 14 | Diversity, video, formats, refresh, DCO |
| Account Structure | 25% | 10 | CBO, objectives, consolidation, learning phase |
| Audience Targeting | 20% | 10 | LAL, custom, overlap, retargeting, exclusions |

---

<!-- COMPACT_SUMMARY_START -->
## Compact Summary

**Command**: `/agileflow:ads:meta` - Meta/Facebook Ads deep-dive audit

**Agent**: `ads-audit-meta` (46 checks, 4 categories)

**Quick Usage**: `/agileflow:ads:meta <account-data>`
<!-- COMPACT_SUMMARY_END -->
