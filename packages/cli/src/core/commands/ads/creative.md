---
description: Cross-platform creative quality review with 21 checks for ad copy effectiveness, visual compliance, format coverage, and performance testing
argument-hint: "<account-data>"
compact_context:
  priority: medium
  preserve_rules:
    - "ACTIVE COMMAND: /agileflow:ads:creative - Creative quality review"
    - "Delegate to ads-audit-creative agent for 21 checks"
  state_fields:
    - creative_score
---

# /agileflow:ads:creative

Run a creative quality audit across all ad platforms using the `ads-audit-creative` agent with 21 checks.

---

## Quick Reference

```
/agileflow:ads:creative <account-data>                # Cross-platform creative review
```

---

## Process

### STEP 1: Validate Input

If no data provided, ask the user to share:
- Ad copy (headlines, descriptions, primary text)
- Creative assets (image specs, video details)
- Platform-specific formatting
- Performance metrics (CTR, CPC, frequency)

### STEP 2: Deploy Creative Analyzer

```xml
<invoke name="Task">
<parameter name="description">Creative quality audit</parameter>
<parameter name="prompt">TASK: Audit creative quality across all platforms.

ACCOUNT DATA:
{creative_data}

Apply ALL 21 checks across 4 categories:
- Ad Copy Effectiveness (30%) - 7 checks
- Visual & Format Compliance (25%) - 6 checks
- Platform-Specific Requirements (25%) - 4 checks
- Performance & Testing (20%) - 4 checks

Check safe zones (TikTok, Meta Stories), character limits, and restricted content.

OUTPUT: Full findings with Creative Score X/100</parameter>
<parameter name="subagent_type">ads-audit-creative</parameter>
</invoke>
```

### STEP 3: Present Results

Show Creative Score and offer actionable next steps.

---

## 21 Checks Overview

| Category | Weight | Checks | Focus |
|----------|--------|--------|-------|
| Ad Copy Effectiveness | 30% | 7 | Value prop, CTA, social proof, keyword alignment |
| Visual & Format | 25% | 6 | Resolution, text overlay, brand, mobile-first |
| Platform Requirements | 25% | 4 | Format coverage, native style, char limits, compliance |
| Performance & Testing | 20% | 4 | Diversity, winner ID, refresh cadence, A/B testing |

---

<!-- COMPACT_SUMMARY_START -->
## Compact Summary

**Command**: `/agileflow:ads:creative` - Cross-platform creative quality review

**Agent**: `ads-audit-creative` (21 checks, 4 categories)

**Quick Usage**: `/agileflow:ads:creative <account-data>`
<!-- COMPACT_SUMMARY_END -->
