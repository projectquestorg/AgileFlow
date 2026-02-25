---
description: YouTube Ads audit for video campaign types, ad formats, targeting strategy, bidding optimization, and creative effectiveness
argument-hint: "<account-data>"
compact_context:
  priority: medium
  preserve_rules:
    - "ACTIVE COMMAND: /agileflow:ads:youtube - YouTube Ads audit"
    - "Inline command - check video formats, campaign types, targeting"
    - "YouTube runs through Google Ads platform"
  state_fields:
    - youtube_score
---

# /agileflow:ads:youtube

Run an inline audit on YouTube advertising campaigns (managed through Google Ads) focusing on video-specific optimization.

---

## Quick Reference

```
/agileflow:ads:youtube <account-data>                 # YouTube Ads audit
```

---

## The 8 Checks

| # | Check | Severity | Pass Criteria |
|---|-------|----------|---------------|
| YT-1 | Campaign type alignment | HIGH | Correct campaign type for objective |
| YT-2 | Video format coverage | HIGH | Multiple formats tested (skippable, bumper, shorts) |
| YT-3 | Targeting strategy | HIGH | Audience targeting refined beyond demographics |
| YT-4 | Bidding strategy | HIGH | CPV/CPM/tCPA based on objective |
| YT-5 | Creative hook in 5 seconds | CRITICAL | First 5 seconds grab attention (before skip) |
| YT-6 | Companion banner | MEDIUM | Companion banner uploaded for desktop |
| YT-7 | Frequency capping | HIGH | Frequency cap set (3-5 per week recommended) |
| YT-8 | Conversion tracking | CRITICAL | YouTube conversions tracked in Google Ads |

---

## Process

### STEP 1: Apply All 8 Checks

Review the account data against each check. For YouTube specifically:

**Campaign types**:
| Type | Best For | Format |
|------|---------|--------|
| Video Reach | Awareness | Bumper (6s) + In-stream |
| Video Views | Consideration | Skippable in-stream + in-feed |
| Video Action | Conversions | Skippable in-stream with CTA |
| Shorts Ads | Awareness + young demo | Vertical 60s max |
| Demand Gen | Full-funnel | YouTube + Discover + Gmail |

**Creative best practices**:
- First 5 seconds: Brand + hook (many viewers skip at 5s)
- CTA overlay throughout (not just at end)
- Mobile-first: 70%+ YouTube watching is mobile
- Captions/subtitles: Many watch without sound
- 15-30 seconds optimal for action campaigns
- Shorts: Vertical 9:16, authentic style

**Targeting options**:
- Custom Intent: Based on Google search behavior
- Affinity: Interest-based broad reach
- In-Market: Active purchase intent
- Remarketing: Website visitors, video viewers
- Customer Match: Upload customer lists
- Topic/placement: Specific channels/videos

### STEP 2: Score

```
YouTube Score = 100 - sum(severity_deductions)
```

Deductions: CRITICAL (-15), HIGH (-8), MEDIUM (-4), LOW (-2)

### STEP 3: Output

```markdown
## YouTube Ads Audit

**YouTube Score**: {X}/100

| Check | Status | Notes |
|-------|--------|-------|
| YT-1 Campaign types | PASS/FAIL | {types in use} |
| YT-2 Video formats | PASS/FAIL | {formats tested} |
| YT-3 Targeting | PASS/FAIL | {targeting methods} |
| YT-4 Bidding | PASS/FAIL | {strategies used} |
| YT-5 5-second hook | PASS/FAIL | {creative analysis} |
| YT-6 Companion banner | PASS/FAIL | {banner status} |
| YT-7 Frequency cap | PASS/FAIL | {cap settings} |
| YT-8 Conversion tracking | PASS/FAIL | {tracking status} |

### Key Recommendations
1. {Top priority fix}
2. {Second priority}
3. {Third priority}

### YouTube-Specific Tips
- Video Action campaigns drive most conversions (skippable in-stream with CTA)
- Custom Intent audiences (based on search) are YouTube's secret weapon
- Always create Shorts versions of successful long-form ads
- Test bumper ads (6s) for remarketing - cheap and high frequency
```

---

<!-- COMPACT_SUMMARY_START -->
## Compact Summary

**Command**: `/agileflow:ads:youtube` - YouTube Ads audit

**Checks**: 8 (inline, no separate agent)

**Key**: 5-second hook, campaign types, Custom Intent targeting, frequency caps

**Quick Usage**: `/agileflow:ads:youtube <account-data>`
<!-- COMPACT_SUMMARY_END -->
