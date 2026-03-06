---
description: CPC-first test planning — structured test matrix with budget allocation, CPC thresholds, winner/kill rules, and graduation criteria
argument-hint: "[BUDGET=100] [DURATION=3d] [VARIANTS=from-generate]"
compact_context:
  priority: medium
  preserve_rules:
    - "ACTIVE COMMAND: /agileflow:ads:test-plan - CPC-first test planning"
    - "Generate structured test matrix with decision criteria"
    - "CPC threshold methodology: $100/3-day test, winner/kill rules"
    - "Output includes budget allocation, measurement criteria, graduation rules"
  state_fields:
    - test_budget
    - duration
    - variants
    - platform
---

# /agileflow:ads:test-plan

Generate a structured A/B testing plan with budget allocation, CPC-first decision criteria, winner/kill rules, and graduation strategy. Based on the CPC-first testing methodology where cheap clicks validate messaging before optimizing for conversions.

---

## Quick Reference

```
/agileflow:ads:test-plan                                               # Interactive (recommended)
/agileflow:ads:test-plan BUDGET=300 DURATION=5d                        # Custom budget/duration
/agileflow:ads:test-plan VARIANTS=from-generate                        # Use variants from /ads:generate
/agileflow:ads:test-plan BUDGET=100 PLATFORM=meta                      # Meta-specific test plan
```

---

## Arguments

| Argument | Values | Default | Description |
|----------|--------|---------|-------------|
| BUDGET | Dollar amount | $100 | Total test budget per round |
| DURATION | Days | 3d | Test duration before decision |
| VARIANTS | from-generate, manual, or count | from-generate | Source of ad variants to test |
| PLATFORM | meta, google, linkedin, tiktok | meta | Platform to test on |

---

## CPC-First Testing Methodology

### Why CPC First?

```
Traditional: Optimize for conversions → need 50+ conversions per variant → $$$
CPC-First:   Optimize for clicks → need 100+ clicks per variant → $

CPC validates MESSAGE RESONANCE at 1/50th the cost.
Only graduate winners to conversion optimization.
```

### The 3-Stage Funnel

```
Stage 1: CPC Test ($100, 3 days)
  → Does the message resonate? (CTR + CPC)
  → Kill: CPC > 2x average
  → Graduate: CPC < average AND CTR > 1%

Stage 2: Landing Page Test ($300, 7 days)
  → Do clicks convert? (CVR + CPA)
  → Kill: CVR < 1% after 200+ clicks
  → Graduate: CPA < 2x target

Stage 3: Scale Test ($1000+, 14 days)
  → Does it scale profitably? (ROAS + volume)
  → Kill: ROAS < 1.5x at 2x budget
  → Graduate: ROAS > 2x → move to always-on
```

---

## Multi-Step Discovery Flow

### STEP 1: Test Context

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[
  {
    "question": "What stage of testing are you at?",
    "header": "Test Stage",
    "multiSelect": false,
    "options": [
      {"label": "Stage 1: Message testing (Recommended)", "description": "CPC-first — validate which angles/hooks resonate before spending on conversions"},
      {"label": "Stage 2: Landing page testing", "description": "I have winning ad copy, now testing landing page variants"},
      {"label": "Stage 3: Scale testing", "description": "I have winning ads + landing pages, testing budget scaling"},
      {"label": "Full funnel from scratch", "description": "Generate a complete 3-stage test plan"}
    ]
  },
  {
    "question": "How many ad variants do you want to test?",
    "header": "Variants",
    "multiSelect": false,
    "options": [
      {"label": "Use variants from /ads:generate (Recommended)", "description": "Pull variants from the most recent ads-copy generation"},
      {"label": "5 variants (minimum viable test)", "description": "Test 5 angles with $20 each"},
      {"label": "10 variants (standard test)", "description": "Test 10 variants with $10 each"},
      {"label": "20 variants (comprehensive)", "description": "Test 20 variants — requires $200+ budget"}
    ]
  }
]</parameter>
</invoke>
```

### STEP 2: Check for Existing Variants

If VARIANTS=from-generate, look for recent ad copy:

```
docs/08-project/ads-copy/ads-copy-{YYYYMMDD}.md
```

If found, extract angle names and variant counts. If not found, suggest running `/agileflow:ads:generate` first.

### STEP 3: Generate Test Plan

Based on stage, budget, and variants, generate the test matrix.

---

## Output Format

```markdown
# Ad Testing Plan

**Generated**: {YYYY-MM-DD}
**Platform**: {platform}
**Total Budget**: ${total across all stages}
**Methodology**: CPC-First → CVR → Scale

---

## Stage 1: Message Resonance Test (CPC-First)

**Budget**: ${budget}
**Duration**: {duration}
**Objective**: Traffic (optimize for link clicks)
**Bidding**: Lowest cost (no cap)

### Test Matrix

| Variant | Angle | Headline | Daily Budget | Min Clicks | Decision By |
|---------|-------|----------|-------------|------------|-------------|
| A | Pain Point | "{headline}" | ${daily} | 33 | {date} |
| B | Outcome | "{headline}" | ${daily} | 33 | {date} |
| C | Social Proof | "{headline}" | ${daily} | 33 | {date} |
| D | Urgency | "{headline}" | ${daily} | 33 | {date} |
| E | Contrarian | "{headline}" | ${daily} | 33 | {date} |

### Decision Criteria

| Metric | Kill | Hold | Graduate |
|--------|------|------|----------|
| **CPC** | > ${2x_avg} | ${avg} - ${2x_avg} | < ${avg} |
| **CTR** | < 0.5% | 0.5% - 1.0% | > 1.0% |
| **Impressions** | < 500 (insufficient data) | 500-1000 | > 1000 |

### Decision Rules

1. **Kill immediately** if CPC > 2x average after 50+ clicks
2. **Hold** if CPC is average but CTR is borderline — extend 2 more days
3. **Graduate** if CPC < average AND CTR > 1.0% — move to Stage 2
4. **Minimum data**: Do NOT make decisions with < 100 impressions per variant
5. **Time minimum**: Run at least 48 hours to capture day-of-week variance

### Expected Outcomes

At $100 budget with ~$1.50 CPC:
- ~67 total clicks across 5 variants
- ~13 clicks per variant (marginal — consider $200 for statistical confidence)
- Expected: 1-2 clear winners, 1-2 kills, 1-2 holds

### Budget Scaling (if budget allows)

| Budget | Variants | Clicks/Variant | Confidence |
|--------|----------|---------------|------------|
| $100 | 5 | ~13 | Low (directional only) |
| $200 | 5 | ~27 | Medium (clear signal) |
| $300 | 5 | ~40 | High (statistically significant) |
| $500 | 10 | ~33 | High (wider angle coverage) |

---

## Stage 2: Conversion Validation Test

**Budget**: ${stage2_budget}
**Duration**: 7 days
**Objective**: Conversions (optimize for leads/purchases)
**Bidding**: Target CPA (set at 1.5x current CPA)

### Graduates from Stage 1
{Only variants that passed Stage 1 criteria}

| Variant | Angle | Stage 1 CPC | Stage 1 CTR | Daily Budget |
|---------|-------|-------------|-------------|-------------|
| {winner} | {angle} | ${cpc} | {ctr}% | ${daily} |

### Decision Criteria

| Metric | Kill | Hold | Graduate |
|--------|------|------|----------|
| **CPA** | > 3x target | 1.5x - 3x target | < 1.5x target |
| **CVR** | < 1% after 200+ clicks | 1% - 3% | > 3% |
| **ROAS** (e-commerce) | < 1:1 | 1:1 - 2:1 | > 2:1 |

### The 3x Kill Rule

> **If any campaign's CPA exceeds 3x your target CPA, pause it immediately.**
> No exceptions. No "let it learn longer." Kill it, iterate the creative, relaunch.

---

## Stage 3: Scale Test

**Budget**: ${stage3_budget}
**Duration**: 14 days
**Objective**: Profitable scale
**Bidding**: Target CPA or Target ROAS

### Scaling Rules

1. **20% Rule**: Never increase budget more than 20% per day
2. **Learning Phase**: After budget changes, wait 3-5 days before judging
3. **Diminishing Returns**: Track CPA at each budget level:

| Budget Level | Expected CPA | Actual CPA | CPA Delta | Action |
|-------------|-------------|-----------|-----------|--------|
| Baseline ${x} | ${target} | — | — | — |
| +20% ${x*1.2} | ${target*1.1} | — | — | Continue if < 1.5x |
| +20% ${x*1.44} | ${target*1.2} | — | — | Pause if > 2x |
| +20% ${x*1.73} | ${target*1.3} | — | — | — |

4. **Exit criteria**: Stop scaling when CPA increase per 20% budget step exceeds 15%

---

## Test Calendar

| Week | Stage | Action | Budget | Key Metric |
|------|-------|--------|--------|-----------|
| 1 | Setup | Create campaigns, install tracking | $0 | Pixel fires ✓ |
| 1-2 | Stage 1 | CPC message test | ${s1} | CPC + CTR |
| 2 | Decision | Kill/Hold/Graduate | — | — |
| 2-3 | Stage 2 | Conversion test (winners) | ${s2} | CPA + CVR |
| 3 | Decision | Kill/Graduate | — | — |
| 4-5 | Stage 3 | Scale test | ${s3} | ROAS at scale |
| 6 | Evergreen | Move winners to always-on | ${ongoing} | Monitor weekly |

---

## Tracking Requirements

Before starting ANY test:

- [ ] Conversion pixel/tag installed and firing
- [ ] Conversion events defined (lead, purchase, sign-up)
- [ ] UTM parameters on all ad URLs: `utm_source={platform}&utm_medium=paid&utm_campaign={test_name}&utm_content={variant}`
- [ ] Google Analytics or equivalent receiving data
- [ ] Baseline metrics recorded (current CPC, CTR, CPA if available)

---

## Post-Test Analysis Template

After each stage, record:

| Variant | Impressions | Clicks | CTR | CPC | Conversions | CVR | CPA | Decision |
|---------|------------|--------|-----|-----|------------|-----|-----|----------|
| A | — | — | — | — | — | — | — | Kill/Hold/Graduate |
```

Save test plan to `docs/08-project/ads-test-plans/test-plan-{YYYYMMDD}.md`.

---

## Present Results

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "Test plan generated: {N} variants across {stages} stages, ${total_budget} total budget, {duration} timeline. Ready to launch?",
  "header": "Next steps",
  "multiSelect": false,
  "options": [
    {"label": "Generate ad variants to test (Recommended)", "description": "Run /agileflow:ads:generate to create the ad copy for this test plan"},
    {"label": "Adjust budget or duration", "description": "Modify the test parameters before finalizing"},
    {"label": "Review tracking setup", "description": "Verify conversion tracking is properly configured before testing"},
    {"label": "Export for platform", "description": "Format the test plan as platform-specific campaign structure"}
  ]
}]</parameter>
</invoke>
```

---

<!-- COMPACT_SUMMARY_START -->
## Compact Summary

**Command**: `/agileflow:ads:test-plan` - CPC-first A/B test planning

**Methodology**: Stage 1 (CPC message test, $100/3d) → Stage 2 (CVR validation, $300/7d) → Stage 3 (Scale test, $1000+/14d)

**Key Rules**: 3x Kill Rule, 20% scaling rule, 48h minimum data, 100+ impressions before decisions

**Output**: Test matrix with decision criteria, scaling rules, and timeline

**Usage**: `/agileflow:ads:test-plan [BUDGET=100] [DURATION=3d] [VARIANTS=from-generate]`

**File**: `docs/08-project/ads-test-plans/test-plan-{YYYYMMDD}.md`
<!-- COMPACT_SUMMARY_END -->
