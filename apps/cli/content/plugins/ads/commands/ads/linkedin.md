---
description: LinkedIn Ads audit with 9 checks for lead gen forms, audience targeting, budget efficiency, and CRM integration
argument-hint: "<account-data>"
compact_context:
  priority: medium
  preserve_rules:
    - "ACTIVE COMMAND: /agileflow:ads:linkedin - LinkedIn Ads audit"
    - "Inline command - 9 checks, no separate agent needed"
    - "Min budget: $50/day campaign, $25/day ad group"
  state_fields:
    - linkedin_score
---

# /agileflow:ads:linkedin

Run an inline audit on a LinkedIn Ads account with 9 focused checks. LinkedIn has the highest CPCs in paid social, so efficiency is critical.

---

## Quick Reference

```
/agileflow:ads:linkedin <account-data>                # LinkedIn Ads audit
```

---

## The 9 Checks

| #    | Check                             | Severity | Pass Criteria                                         |
| ---- | --------------------------------- | -------- | ----------------------------------------------------- |
| LI-1 | Insight Tag installed             | CRITICAL | LinkedIn Insight Tag on all pages                     |
| LI-2 | Lead Gen Forms vs landing pages   | HIGH     | Lead Gen Forms tested (typically 2-5x better CVR)     |
| LI-3 | Audience size appropriate         | HIGH     | 50K-500K for Sponsored Content                        |
| LI-4 | Company/title targeting precision | HIGH     | Targeting by job title or function, not just industry |
| LI-5 | Budget meets minimum              | CRITICAL | Minimum $50/day per campaign                          |
| LI-6 | CRM integration active            | HIGH     | Leads syncing to CRM within 24 hours                  |
| LI-7 | Content type mix                  | MEDIUM   | Single image + carousel + video tested                |
| LI-8 | Matched Audiences                 | MEDIUM   | Website retargeting + company list + LAL active       |
| LI-9 | ABM alignment                     | LOW      | Account-Based Marketing lists for enterprise          |

---

## Process

### STEP 0: Gather Account Data (if not provided)

If the user hasn't provided account data, ask:

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[
  {
    "question": "To audit your LinkedIn Ads account, I need some information. What can you share?",
    "header": "LinkedIn Account Data",
    "multiSelect": false,
    "options": [
      {"label": "Paste from Campaign Manager (Recommended)", "description": "Campaigns tab → export, or paste the table with spend, clicks, leads, CPL, and objective"},
      {"label": "Describe my setup", "description": "Tell me: daily budget, objectives (Lead Gen vs Website Conversions), targeting method, ad formats, and current CPL vs target"}
    ]
  },
  {
    "question": "What's your primary concern with LinkedIn?",
    "header": "Focus",
    "multiSelect": false,
    "options": [
      {"label": "CPL is too high / leads are too expensive", "description": "I'll focus on audience size, targeting precision, and Lead Gen Forms vs landing pages"},
      {"label": "Not getting enough leads", "description": "I'll focus on budget minimums, audience reach, and format testing"},
      {"label": "Lead quality is poor", "description": "I'll focus on targeting precision, CRM integration, and ABM alignment"},
      {"label": "Full audit", "description": "Run all 9 checks across tracking, targeting, budget, and creative"}
    ]
  }
]</parameter>
</invoke>
```

### STEP 1: Apply All 9 Checks

Review the account data against each check. For LinkedIn specifically:

**Budget reality check**: LinkedIn CPCs are $5-15 for Sponsored Content. With $50/day minimum:

- Daily clicks: ~3-10
- Monthly clicks: ~100-300
- At 5% conversion rate: ~5-15 leads/month
- **Minimum viable budget for lead gen: $100/day recommended**

**Lead Gen Forms vs Landing Pages**:

- Lead Gen Forms: 10-30% conversion rate (pre-filled data)
- Landing Pages: 2-5% conversion rate
- Always test Lead Gen Forms first on LinkedIn

### STEP 2: Score

```
LinkedIn Score = 100 - sum(severity_deductions)
```

Deductions: CRITICAL (-15), HIGH (-8), MEDIUM (-4), LOW (-2)

### STEP 3: Output

```markdown
## LinkedIn Ads Audit

**LinkedIn Score**: {X}/100

| Check                    | Status    | Notes              |
| ------------------------ | --------- | ------------------ |
| LI-1 Insight Tag         | PASS/FAIL | {details}          |
| LI-2 Lead Gen Forms      | PASS/FAIL | {details}          |
| LI-3 Audience size       | PASS/FAIL | {size estimate}    |
| LI-4 Targeting precision | PASS/FAIL | {targeting method} |
| LI-5 Budget minimum      | PASS/FAIL | ${daily}/day       |
| LI-6 CRM integration     | PASS/FAIL | {sync status}      |
| LI-7 Content types       | PASS/FAIL | {formats in use}   |
| LI-8 Matched Audiences   | PASS/FAIL | {audience types}   |
| LI-9 ABM alignment       | PASS/FAIL | {ABM status}       |

### Key Recommendations

1. {Top priority fix}
2. {Second priority}
3. {Third priority}

### LinkedIn-Specific Tips

- Use Lead Gen Forms for B2B lead generation (2-5x better CVR)
- Minimum audience size 50K for Sponsored Content
- Test Document Ads for thought leadership
- Message Ads have highest response rate but lowest scale
```

### STEP 4: Next Steps

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "LinkedIn audit complete: {X}/100. {N} issues found ({critical} critical). Current CPL: ${cpl} vs target ${target}.",
  "header": "What to do next",
  "multiSelect": false,
  "options": [
    {"label": "Fix {top_issue} (Recommended)", "description": "{specific fix — e.g., 'Switch landing page to Lead Gen Forms — LinkedIn pre-fills from profile data, typically 3x better conversion'}"},
    {"label": "Generate LinkedIn ad copy variants", "description": "Run /agileflow:ads:generate PLATFORM=linkedin — professional tone, thought leadership angles"},
    {"label": "Run full multi-platform audit", "description": "Run /agileflow:ads:audit to see LinkedIn alongside Google and Meta with a unified health score"},
    {"label": "Plan LinkedIn campaign structure", "description": "Run /agileflow:ads:plan INDUSTRY=b2b for a full LinkedIn-first campaign architecture"}
  ]
}]</parameter>
</invoke>
```

---

<!-- COMPACT_SUMMARY_START -->

## Compact Summary

**Command**: `/agileflow:ads:linkedin` - LinkedIn Ads audit

**Checks**: 9 (inline, no separate agent)

**Key**: Min $50/day, Lead Gen Forms > Landing Pages, 50K-500K audience

**Quick Usage**: `/agileflow:ads:linkedin <account-data>`

<!-- COMPACT_SUMMARY_END -->
