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

| #    | Check                        | Severity | Pass Criteria                                       |
| ---- | ---------------------------- | -------- | --------------------------------------------------- |
| MS-1 | UET tag installed            | CRITICAL | Universal Event Tracking tag on all pages           |
| MS-2 | Search partner performance   | HIGH     | Syndication partners monitored, disabled if poor    |
| MS-3 | Import quality from Google   | HIGH     | No broken bid strategies or unsupported features    |
| MS-4 | Bid adjustments set          | MEDIUM   | Microsoft-specific bids (not just Google copy)      |
| MS-5 | LinkedIn profile targeting   | HIGH     | LinkedIn demographics used for B2B targeting        |
| MS-6 | Audience ads opt-in reviewed | MEDIUM   | Microsoft Audience Network reviewed for performance |
| MS-7 | Conversion goals defined     | HIGH     | Microsoft-native conversion tracking active         |

---

## Process

### STEP 0: Gather Account Data (if not provided)

If the user hasn't provided account data, ask:

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[
  {
    "question": "To audit your Microsoft Ads account, I need some information. What can you share?",
    "header": "Microsoft Account Data",
    "multiSelect": false,
    "options": [
      {"label": "Paste from Microsoft Ads (Recommended)", "description": "Campaigns tab → export, or paste the campaign table with spend, clicks, conversions, CPA"},
      {"label": "Describe my setup", "description": "Tell me: was this imported from Google? What's your daily spend, UET tag status, and whether you're using LinkedIn profile targeting"}
    ]
  },
  {
    "question": "What's your setup situation?",
    "header": "Context",
    "multiSelect": false,
    "options": [
      {"label": "Imported from Google Ads (most common)", "description": "I'll check import quality, unsupported features, and Microsoft-specific optimizations you're missing"},
      {"label": "Built natively in Microsoft Ads", "description": "I'll run full checks including LinkedIn targeting, search partners, and conversion goals"},
      {"label": "Not sure — just audit it all", "description": "Run all 7 checks and I'll figure out the setup from the data"}
    ]
  }
]</parameter>
</invoke>
```

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

| Check                   | Status    | Notes                     |
| ----------------------- | --------- | ------------------------- |
| MS-1 UET tag            | PASS/FAIL | {details}                 |
| MS-2 Search partners    | PASS/FAIL | {partner performance}     |
| MS-3 Import quality     | PASS/FAIL | {import issues found}     |
| MS-4 Bid adjustments    | PASS/FAIL | {Microsoft-specific bids} |
| MS-5 LinkedIn targeting | PASS/FAIL | {targeting usage}         |
| MS-6 Audience Network   | PASS/FAIL | {opt-in status}           |
| MS-7 Conversion goals   | PASS/FAIL | {goals defined}           |

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

### STEP 4: Next Steps

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "Microsoft Ads audit complete: {X}/100. {N} issues found. Top issue: {top_issue}.",
  "header": "What to do next",
  "multiSelect": false,
  "options": [
    {"label": "Fix {top_issue} (Recommended)", "description": "{specific fix — e.g., 'Enable LinkedIn profile targeting for your B2B campaigns — it\\'s Microsoft\\'s biggest differentiator'}"},
    {"label": "Run full multi-platform audit including Google", "description": "Run /agileflow:ads:audit to see Microsoft alongside Google and Meta with a unified health score"},
    {"label": "Check if Google-to-Microsoft import is losing data", "description": "Run /agileflow:ads:track to verify UET tag is firing and conversion goals match Google's setup"},
    {"label": "Generate Microsoft-optimized ad copy", "description": "Microsoft audiences respond differently — run /agileflow:ads:generate PLATFORM=microsoft"}
  ]
}]</parameter>
</invoke>
```

---

<!-- COMPACT_SUMMARY_START -->

## Compact Summary

**Command**: `/agileflow:ads:microsoft` - Microsoft Ads audit

**Checks**: 7 (inline, no separate agent)

**Key**: UET tag, import quality, LinkedIn targeting, search partners

**Quick Usage**: `/agileflow:ads:microsoft <account-data>`

<!-- COMPACT_SUMMARY_END -->
