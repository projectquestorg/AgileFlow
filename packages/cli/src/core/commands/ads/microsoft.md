---
description: Microsoft Ads audit with 7 checks for search partner management, UET tag, LinkedIn targeting, and import quality from Google Ads
argument-hint: "<account-data>"
compact_context:
  priority: medium
  preserve_rules:
    - "ACTIVE COMMAND: /agileflow:ads:microsoft - Microsoft Ads audit"
    - "Inline command - 7 checks, no separate agent needed"
    - "Often imported from Google - check import quality"
  state_fields:
    - microsoft_score
---

# /agileflow:ads:microsoft

Run an inline audit on a Microsoft Ads (formerly Bing Ads) account with 7 focused checks. Microsoft Ads often runs as a Google import - verify it's optimized for the platform.

---

## Quick Reference

```
/agileflow:ads:microsoft <account-data>               # Microsoft Ads audit
```

---

## The 7 Checks

| # | Check | Severity | Pass Criteria |
|---|-------|----------|---------------|
| MS-1 | UET tag installed | CRITICAL | Universal Event Tracking tag on all pages |
| MS-2 | Search partner performance | HIGH | Syndication partners monitored, disabled if poor |
| MS-3 | Import quality from Google | HIGH | No broken bid strategies or unsupported features |
| MS-4 | Bid adjustments set | MEDIUM | Microsoft-specific bids (not just Google copy) |
| MS-5 | LinkedIn profile targeting | HIGH | LinkedIn demographics used for B2B targeting |
| MS-6 | Audience ads opt-in reviewed | MEDIUM | Microsoft Audience Network reviewed for performance |
| MS-7 | Conversion goals defined | HIGH | Microsoft-native conversion tracking active |

---

## Process

### STEP 1: Apply All 7 Checks

Review the account data against each check. For Microsoft Ads specifically:

**Import quality matters**:
- Google imports often bring unsupported features
- Automated bid strategies may not transfer correctly
- Negative keyword lists may not sync
- Review every imported campaign for Microsoft compatibility

**LinkedIn targeting advantage**:
- Microsoft Ads uniquely offers LinkedIn profile targeting
- Target by company, industry, job function
- Powerful for B2B campaigns not using LinkedIn Ads directly
- Can be layered on top of keyword targeting

**Search partners**:
- Microsoft Audience Network reaches Yahoo, AOL, DuckDuckGo
- Performance varies significantly by partner
- Review partner performance monthly
- Disable underperforming partners individually

### STEP 2: Score

```
Microsoft Score = 100 - sum(severity_deductions)
```

Deductions: CRITICAL (-15), HIGH (-8), MEDIUM (-4), LOW (-2)

### STEP 3: Output

```markdown
## Microsoft Ads Audit

**Microsoft Score**: {X}/100

| Check | Status | Notes |
|-------|--------|-------|
| MS-1 UET tag | PASS/FAIL | {details} |
| MS-2 Search partners | PASS/FAIL | {partner performance} |
| MS-3 Import quality | PASS/FAIL | {import issues found} |
| MS-4 Bid adjustments | PASS/FAIL | {Microsoft-specific bids} |
| MS-5 LinkedIn targeting | PASS/FAIL | {targeting usage} |
| MS-6 Audience Network | PASS/FAIL | {opt-in status} |
| MS-7 Conversion goals | PASS/FAIL | {goals defined} |

### Key Recommendations
1. {Top priority fix}
2. {Second priority}
3. {Third priority}

### Microsoft-Specific Tips
- LinkedIn profile targeting is Microsoft's unique advantage
- Don't just "set and forget" Google imports - optimize for Microsoft
- Search partner performance varies - monitor and exclude poor performers
- Microsoft audience skews older and higher income than Google
```

---

<!-- COMPACT_SUMMARY_START -->
## Compact Summary

**Command**: `/agileflow:ads:microsoft` - Microsoft Ads audit

**Checks**: 7 (inline, no separate agent)

**Key**: UET tag, import quality, LinkedIn targeting, search partners

**Quick Usage**: `/agileflow:ads:microsoft <account-data>`
<!-- COMPACT_SUMMARY_END -->
