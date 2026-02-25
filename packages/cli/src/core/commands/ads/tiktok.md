---
description: TikTok Ads audit with 8 checks for learning phase management, budget minimums, creative safe zones, and platform-specific optimization
argument-hint: "<account-data>"
compact_context:
  priority: medium
  preserve_rules:
    - "ACTIVE COMMAND: /agileflow:ads:tiktok - TikTok Ads audit"
    - "Inline command - 8 checks, no separate agent needed"
    - "Min budget: $50/day campaign, $20/day ad group"
    - "Learning phase: 50 conversions in 7 days"
  state_fields:
    - tiktok_score
---

# /agileflow:ads:tiktok

Run an inline audit on a TikTok Ads account with 8 focused checks. TikTok requires creative-first strategy and strict learning phase management.

---

## Quick Reference

```
/agileflow:ads:tiktok <account-data>                  # TikTok Ads audit
```

---

## The 8 Checks

| # | Check | Severity | Pass Criteria |
|---|-------|----------|---------------|
| TT-1 | TikTok Pixel installed | CRITICAL | Pixel on all pages, Events API preferred |
| TT-2 | Learning phase management | CRITICAL | 50 conversions in 7 days per ad group |
| TT-3 | Budget meets minimum | CRITICAL | $50/day campaign, $20/day ad group |
| TT-4 | Creative safe zones | HIGH | Key content within center 720x900px |
| TT-5 | Video-first creatives | HIGH | All ads are video (no static images) |
| TT-6 | UGC/authentic style | HIGH | Native-feeling content (not polished ads) |
| TT-7 | Sound-on design | MEDIUM | Audio is integral, not optional |
| TT-8 | Creative refresh < 14 days | HIGH | New creatives every 1-2 weeks |

---

## Process

### STEP 1: Apply All 8 Checks

Review the account data against each check. For TikTok specifically:

**Learning phase is critical**:
- TikTok needs 50 conversions in 7 days per ad group to exit learning
- At $20/day minimum: $140/week = 50 conversions needed
- That requires CPA < $2.80 - often unrealistic
- **Solution**: Optimize for upper-funnel events (View Content, Add to Cart) until volume builds

**Creative safe zones**:
```
+---------------------------+
|      Username (130px)     |
|                           |
|    +----------------+     |
|    |                |     |
|    |   SAFE ZONE    |     |
|    |  720 x 900px   |     |
|    |                |     |
|    +----------------+     |
|                     |btns |
|   CTA + Nav (170px) |     |
+---------------------------+
```

**Creative best practices**:
- First 3 seconds: Hook with pattern interrupt
- 15-30 second sweet spot for most objectives
- Vertical 9:16 only (no landscape)
- Captions/text overlay for sound-off viewing
- Trend-aware content outperforms polished ads

### STEP 2: Score

```
TikTok Score = 100 - sum(severity_deductions)
```

Deductions: CRITICAL (-15), HIGH (-8), MEDIUM (-4), LOW (-2)

### STEP 3: Output

```markdown
## TikTok Ads Audit

**TikTok Score**: {X}/100

| Check | Status | Notes |
|-------|--------|-------|
| TT-1 Pixel/Events API | PASS/FAIL | {details} |
| TT-2 Learning phase | PASS/FAIL | {conversion volume} |
| TT-3 Budget minimum | PASS/FAIL | ${daily}/day |
| TT-4 Safe zones | PASS/FAIL | {creative analysis} |
| TT-5 Video-first | PASS/FAIL | {format types} |
| TT-6 UGC style | PASS/FAIL | {creative style} |
| TT-7 Sound-on | PASS/FAIL | {audio strategy} |
| TT-8 Creative refresh | PASS/FAIL | {last refresh date} |

### Key Recommendations
1. {Top priority fix}
2. {Second priority}
3. {Third priority}

### TikTok-Specific Tips
- "Don't make ads, make TikToks" - native > polished
- Spark Ads (boosting organic) often outperform traditional ads
- Creative fatigue hits faster on TikTok (7-14 days vs 30 on Meta)
- Use Creative Center for trending sounds and formats
```

---

<!-- COMPACT_SUMMARY_START -->
## Compact Summary

**Command**: `/agileflow:ads:tiktok` - TikTok Ads audit

**Checks**: 8 (inline, no separate agent)

**Key**: $50/day min, 50 conv/7 days learning, video-only, UGC style

**Quick Usage**: `/agileflow:ads:tiktok <account-data>`
<!-- COMPACT_SUMMARY_END -->
