---
description: Landing page optimization audit for ad campaigns - Core Web Vitals, CTA effectiveness, trust signals, mobile experience, and message match
argument-hint: "<URL>"
compact_context:
  priority: medium
  preserve_rules:
    - "ACTIVE COMMAND: /agileflow:ads:landing - Landing page optimization"
    - "Use WebFetch to analyze the actual landing page"
    - "Check CWV, CTA, trust signals, mobile, message match"
  state_fields:
    - target_url
    - landing_score
---

# /agileflow:ads:landing

Audit a landing page for paid advertising effectiveness. Analyzes the page for conversion rate optimization factors that directly impact ad campaign performance.

---

## Quick Reference

```
/agileflow:ads:landing https://example.com/offer           # Audit landing page
```

---

## Process

### STEP 1: Fetch Landing Page

Use WebFetch to retrieve the target URL. Extract:
- Page structure (H1, form, CTA buttons)
- Load performance indicators
- Trust signals (testimonials, badges, reviews)
- Mobile responsiveness indicators
- Form fields and friction points

### STEP 2: Run 15 Checks

| # | Check | Severity | Pass Criteria |
|---|-------|----------|---------------|
| LP-1 | Page loads < 3 seconds | HIGH | LCP < 2.5s, FCP < 1.8s |
| LP-2 | Single clear CTA | HIGH | One primary CTA visible above fold |
| LP-3 | Headline matches ad copy | CRITICAL | H1 reflects the ad's promise |
| LP-4 | Mobile responsive | HIGH | Viewport meta + responsive design |
| LP-5 | Form friction | HIGH | < 5 form fields for lead gen |
| LP-6 | Trust signals present | MEDIUM | Testimonials, reviews, badges, logos |
| LP-7 | No navigation distractions | MEDIUM | Minimal or no top navigation |
| LP-8 | Social proof | MEDIUM | Customer count, ratings, case studies |
| LP-9 | Urgency element | LOW | Deadline, limited availability (if genuine) |
| LP-10 | Phone number visible | MEDIUM | Click-to-call for service businesses |
| LP-11 | Privacy policy linked | HIGH | Required for ad platform compliance |
| LP-12 | SSL certificate | CRITICAL | HTTPS required |
| LP-13 | No broken images/links | HIGH | All resources load correctly |
| LP-14 | Thank you page/confirmation | MEDIUM | Post-conversion confirmation page |
| LP-15 | Tracking pixels present | CRITICAL | GTM/Pixel/tag detected on page |

### STEP 3: Score and Report

```markdown
## Landing Page Audit: {URL}

**Landing Page Score**: {X}/100

| Check | Status | Severity | Notes |
|-------|--------|----------|-------|
| LP-1 Page speed | PASS/FAIL | HIGH | {LCP time} |
| ... | ... | ... | ... |

### Critical Issues
{List any CRITICAL failures}

### Quick Wins
{Easy fixes that improve conversion rate}

### Message Match Analysis
- **Ad headline**: {if provided}
- **Landing page H1**: {extracted}
- **Match quality**: {Strong/Weak/Mismatch}

### Conversion Rate Optimization Suggestions
1. {Specific suggestion with expected impact}
2. {Suggestion}
3. {Suggestion}
```

### STEP 4: Offer Next Steps

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "Landing page score: {X}/100. {N} issues found. What would you like to do?",
  "header": "Next steps",
  "multiSelect": false,
  "options": [
    {"label": "Fix critical issues (Recommended)", "description": "{top issue}"},
    {"label": "Run full ads audit", "description": "Check ad account + landing page together"},
    {"label": "Test another landing page", "description": "Compare multiple landing pages"},
    {"label": "Optimize for specific platform", "description": "Platform-specific landing page requirements"}
  ]
}]</parameter>
</invoke>
```

---

<!-- COMPACT_SUMMARY_START -->
## Compact Summary

**Command**: `/agileflow:ads:landing` - Landing page optimization for ads

**Input**: URL of landing page

**Output**: 15-check audit with CRO suggestions

**Quick Usage**: `/agileflow:ads:landing <URL>`
<!-- COMPACT_SUMMARY_END -->
