---
description: Competitive intelligence for paid advertising - market positioning, messaging gaps, ad copy analysis, and strategic recommendations
argument-hint: "<industry-or-competitors>"
compact_context:
  priority: medium
  preserve_rules:
    - "ACTIVE COMMAND: /agileflow:ads:competitor - Competitive intelligence"
    - "Use WebSearch for competitor research"
    - "Focus on ad-specific competitive factors"
  state_fields:
    - industry
    - competitors
---

# /agileflow:ads:competitor

Analyze competitive landscape for paid advertising, including competitor ad strategies, messaging positioning, and market gaps.

---

## Quick Reference

```
/agileflow:ads:competitor "SaaS project management"      # Industry research
/agileflow:ads:competitor "competitor1, competitor2"       # Specific competitors
```

---

## Process

### STEP 1: Identify Competitors

If competitors not specified, use WebSearch to identify top advertisers in the space:
- Search for industry keywords and note who's advertising
- Look for "Sponsored" results on Google
- Check Meta Ad Library for active advertisers

### STEP 2: Analyze Competitor Ads

For each competitor, research:

| Factor | How to Find | What to Note |
|--------|------------|-------------|
| **Ad copy themes** | Google search, Ad Library | Headlines, CTAs, value props |
| **Landing pages** | Click through ads | Page structure, offers, forms |
| **Platforms active** | Ad libraries, social | Which platforms they invest in |
| **Offer positioning** | Ad copy, landing pages | Free trial, discount, demo |
| **Audience signals** | LinkedIn ads, social targeting | Who they're targeting |
| **Creative style** | Ad Library | Video vs image, UGC, professional |

### STEP 3: Gap Analysis

Identify opportunities the user can exploit:

```markdown
## Competitive Intelligence Report

### Competitor Overview

| Competitor | Platforms | Key Message | Offer | Ad Style |
|-----------|-----------|------------|-------|---------|
| {name} | {platforms} | {message} | {offer} | {style} |

### Messaging Gaps
{Where competitors are NOT messaging - opportunities for differentiation}

### Ad Format Gaps
{Ad types/platforms competitors aren't using}

### Positioning Recommendations
1. **Differentiate on**: {unique angle}
2. **Counter-position**: {how to position against top competitor}
3. **Underserved keyword themes**: {keyword areas competitors miss}

### Suggested Ad Copy Angles
- **Angle 1**: {headline idea} - Why: {competitive reason}
- **Angle 2**: {headline idea} - Why: {competitive reason}
- **Angle 3**: {headline idea} - Why: {competitive reason}
```

### STEP 4: Offer Next Steps

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "Competitive analysis complete. {N} competitors analyzed, {M} messaging gaps found.",
  "header": "Next steps",
  "multiSelect": false,
  "options": [
    {"label": "Build campaign plan using these insights (Recommended)", "description": "Run /agileflow:ads:plan with competitive positioning"},
    {"label": "Audit our current ads against findings", "description": "Compare your ads to competitor strategies"},
    {"label": "Deep-dive into specific competitor", "description": "More detailed analysis of one competitor"},
    {"label": "Generate ad copy based on gaps", "description": "Create ad copy exploiting found gaps"}
  ]
}]</parameter>
</invoke>
```

---

<!-- COMPACT_SUMMARY_START -->
## Compact Summary

**Command**: `/agileflow:ads:competitor` - Competitive intelligence for ads

**Input**: Industry or competitor names

**Output**: Competitor ad analysis, messaging gaps, positioning recommendations

**Quick Usage**: `/agileflow:ads:competitor <industry-or-competitors>`
<!-- COMPACT_SUMMARY_END -->
