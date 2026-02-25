---
description: Paid advertising audit & planning toolkit - multi-platform account audits, campaign planning, budget optimization, and competitive intelligence
argument-hint: "[subcommand] [account-data]"
compact_context:
  priority: medium
  preserve_rules:
    - "ACTIVE COMMAND: /agileflow:ads - Paid advertising router"
    - "Route to the appropriate sub-command based on user intent"
    - "If no sub-command specified, show the quick reference guide"
  state_fields:
    - subcommand
    - platforms
---

# /agileflow:ads

Paid advertising audit & planning toolkit for multi-platform account optimization. Routes to specialized sub-commands.

---

## Quick Reference

```
/agileflow:ads:audit <account-data>                    # Full multi-platform audit (6 parallel analyzers)
/agileflow:ads:plan                                     # Campaign planning with industry templates
/agileflow:ads:google <account-data>                    # Google Ads deep-dive (74 checks)
/agileflow:ads:meta <account-data>                      # Meta/Facebook audit (46 checks)
/agileflow:ads:creative <account-data>                  # Cross-platform creative review (21 checks)
/agileflow:ads:budget <account-data>                    # Budget allocation & bidding strategy
/agileflow:ads:landing <URL>                            # Landing page optimization
/agileflow:ads:competitor <industry>                    # Competitive intelligence
/agileflow:ads:linkedin <account-data>                  # LinkedIn audit (9 checks)
/agileflow:ads:tiktok <account-data>                    # TikTok audit (8 checks)
/agileflow:ads:microsoft <account-data>                 # Microsoft Ads audit (7 checks)
/agileflow:ads:youtube <account-data>                   # YouTube audit
```

---

## Sub-Commands

| Command | Purpose | When to Use |
|---------|---------|-------------|
| **audit** | Full multi-platform audit with Ads Health Score | Starting point for any account |
| **plan** | Campaign planning with industry templates | New campaigns or restructuring |
| **google** | Google Ads deep-dive (74 checks) | Google-specific optimization |
| **meta** | Meta/Facebook audit (46 checks) | Meta-specific optimization |
| **creative** | Cross-platform creative quality | Creative strategy improvement |
| **budget** | Budget & bidding strategy | Spend optimization |
| **landing** | Landing page optimization | Conversion rate improvement |
| **competitor** | Competitive intelligence | Market positioning |
| **linkedin** | LinkedIn Ads audit | LinkedIn-specific optimization |
| **tiktok** | TikTok Ads audit | TikTok-specific optimization |
| **microsoft** | Microsoft Ads audit | Microsoft-specific optimization |
| **youtube** | YouTube Ads audit | Video campaign optimization |

---

## Account Data Formats

The ads commands accept account data in several formats:

1. **Pasted text** - Copy/paste from ad platform exports (CSV, tables)
2. **File path** - Point to exported CSV/JSON files
3. **Structured description** - Describe your account setup in plain text
4. **Screenshots** - Describe what you see in platform dashboards

For best results, include:
- Campaign names, types, and objectives
- Budget and spend data
- Conversion tracking setup
- Targeting settings
- Ad creative details
- Performance metrics (CPA, ROAS, CTR, CVR)

---

## Routing Logic

If the user provides data without a sub-command, determine intent:

1. **"audit my ads"** -> `/agileflow:ads:audit`
2. **"plan a campaign"** -> `/agileflow:ads:plan`
3. **"check my Google Ads"** -> `/agileflow:ads:google`
4. **"Meta" / "Facebook ads"** -> `/agileflow:ads:meta`
5. **"creative review"** -> `/agileflow:ads:creative`
6. **"budget" / "spend" / "bidding"** -> `/agileflow:ads:budget`
7. **"landing page"** -> `/agileflow:ads:landing`
8. **"competitor" / "competitive"** -> `/agileflow:ads:competitor`
9. **"LinkedIn"** -> `/agileflow:ads:linkedin`
10. **"TikTok"** -> `/agileflow:ads:tiktok`
11. **"Microsoft" / "Bing"** -> `/agileflow:ads:microsoft`
12. **"YouTube" / "video ads"** -> `/agileflow:ads:youtube`
13. **Unclear** -> Show the quick reference and ask which analysis they want

---

## If No Sub-Command Specified

Show the quick reference table above and ask:

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "Which advertising analysis would you like to run?",
  "header": "Ads Analysis",
  "multiSelect": false,
  "options": [
    {"label": "Full multi-platform audit (Recommended)", "description": "Comprehensive 6-analyzer audit with Ads Health Score 0-100"},
    {"label": "Campaign planning", "description": "Industry-specific campaign templates with budget allocation"},
    {"label": "Platform-specific audit", "description": "Deep-dive into Google, Meta, LinkedIn, TikTok, Microsoft, or YouTube"},
    {"label": "Budget & bidding strategy", "description": "Optimize spend allocation and bidding across platforms"}
  ]
}]</parameter>
</invoke>
```

---

<!-- COMPACT_SUMMARY_START -->
## Compact Summary

**Command**: `/agileflow:ads` - Paid advertising audit & planning router

**Sub-commands**: audit, plan, google, meta, creative, budget, landing, competitor, linkedin, tiktok, microsoft, youtube

**Quick start**: `/agileflow:ads:audit <account-data>` for full analysis
<!-- COMPACT_SUMMARY_END -->
