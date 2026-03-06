---
description: Ads performance tracker — ingest performance CSVs, establish baselines, detect winners and anomalies, output KPI dashboard with trend analysis
argument-hint: "<performance-data> [PERIOD=7d] [BASELINE=auto]"
compact_context:
  priority: medium
  preserve_rules:
    - "ACTIVE COMMAND: /agileflow:ads:track - Performance tracking and winner detection"
    - "Ingest CSV/pasted performance data, establish baselines, detect anomalies"
    - "Winner detection: statistical significance, cost efficiency, trend direction"
    - "Delegate to ads-performance-tracker agent for analysis"
    - "State persisted in docs/08-project/ads-tracking/"
  state_fields:
    - period
    - baseline
    - campaigns_tracked
    - winners
    - anomalies
---

# /agileflow:ads:track

Ingest ad performance data (CSVs or pasted), establish baselines, detect winners and anomalies, and output a KPI dashboard with trend analysis and actionable recommendations.

---

## Quick Reference

```
/agileflow:ads:track <performance-data>                                # Analyze performance data
/agileflow:ads:track <csv-file> PERIOD=30d                             # 30-day trend analysis
/agileflow:ads:track <data> BASELINE=last-report                       # Compare against last saved baseline
/agileflow:ads:track compare <old-csv> <new-csv>                       # Period-over-period comparison
```

---

## Arguments

| Argument | Values | Default | Description |
|----------|--------|---------|-------------|
| performance-data | CSV, pasted text, or file path | Required | Performance metrics to analyze |
| PERIOD | 1d, 7d, 14d, 30d, 90d | 7d | Analysis period |
| BASELINE | auto, last-report, or specific date | auto | Baseline for comparison |
| FORMAT | dashboard, csv, both | dashboard | Output format |

---

## Data Formats Accepted

### CSV Export (preferred)
```csv
Campaign,Ad Set,Ad,Impressions,Clicks,CTR,CPC,Spend,Conversions,CVR,CPA,ROAS,Date
Brand - Search,Brand Terms,Ad 1,15234,1843,12.1%,$0.45,$829,234,12.7%,$3.54,8.2,2026-02-28
```

### Pasted Table
```
Campaign         | Spend  | Clicks | CPA    | ROAS
Brand Search     | $829   | 1,843  | $3.54  | 8.2x
Non-Brand Search | $2,341 | 987    | $15.20 | 2.1x
Meta Prospecting | $1,560 | 2,104  | $28.40 | 1.4x
```

### Platform-Specific Exports
- Google Ads: Campaign/Ad Group/Keyword reports
- Meta Ads Manager: Campaign/Ad Set/Ad performance export
- LinkedIn: Campaign Manager CSV export
- TikTok: Business Center export

---

## Analysis Framework

### STEP 1: Parse & Normalize Data

Delegate to the `ads-performance-tracker` agent:

```xml
<invoke name="Agent">
<parameter name="description">Analyze ad performance data</parameter>
<parameter name="prompt">TASK: Analyze ad performance data and generate KPI dashboard.

PERFORMANCE DATA:
{data}

PERIOD: {period}
BASELINE: {baseline}

Follow the full analysis framework in your instructions.

OUTPUT: Complete KPI dashboard with winner detection, anomaly alerts, and recommendations.</parameter>
<parameter name="subagent_type">ads-performance-tracker</parameter>
</invoke>
```

### STEP 2: Establish Baselines

If this is the first analysis or BASELINE=auto:
- Calculate median and mean for each metric across all campaigns
- Set thresholds at 1 standard deviation from mean
- Save baseline to `docs/08-project/ads-tracking/baseline-{YYYYMMDD}.json`

If BASELINE=last-report:
- Load the most recent baseline from `docs/08-project/ads-tracking/`
- Compare current metrics against saved baseline

### STEP 3: Winner Detection

Apply statistical winner detection:

| Metric | Winner Threshold | Confidence Requirement |
|--------|-----------------|----------------------|
| CPC | < 0.7x median CPC | 100+ clicks |
| CTR | > 1.5x median CTR | 1000+ impressions |
| CVR | > 1.5x median CVR | 50+ clicks |
| CPA | < 0.7x median CPA | 20+ conversions |
| ROAS | > 1.5x median ROAS | $500+ spend |

**Winner Classification:**
| Class | Criteria | Action |
|-------|----------|--------|
| **Strong Winner** | Beats threshold on 3+ metrics | Scale 20%/week |
| **Emerging Winner** | Beats threshold on 1-2 metrics | Continue monitoring |
| **Stable Performer** | Within 1 SD of median on all metrics | Maintain |
| **Underperformer** | Below median on 2+ metrics | Optimize or pause |
| **Kill** | CPA > 3x target OR ROAS < 0.5x target | Pause immediately |

### STEP 4: Anomaly Detection

Flag anomalies when:
- **Spend spike**: Daily spend > 2x average (possible budget cap issue)
- **CTR drop**: CTR drops > 30% day-over-day (ad fatigue, audience saturation)
- **CPC surge**: CPC increases > 50% week-over-week (competition, quality score)
- **Conversion drop**: Conversions drop > 40% with stable traffic (tracking break, landing page issue)
- **ROAS collapse**: ROAS drops below 1:1 (unprofitable, needs immediate action)

### STEP 5: Trend Analysis

For each campaign, calculate:
- **7-day rolling average** for CPC, CTR, CVR, CPA
- **Trend direction**: Improving, Stable, Declining
- **Velocity**: Rate of change (slow, moderate, rapid)
- **Projected trajectory**: If trend continues, estimated metrics in 7/14/30 days

---

## Output Format

```markdown
# Ads Performance Dashboard

**Generated**: {YYYY-MM-DD}
**Period**: {start_date} to {end_date} ({N} days)
**Platforms**: {platforms}
**Total Spend**: ${total_spend}
**Baseline**: {baseline_source}

---

## Executive Summary

| Metric | Current | Baseline | Change | Trend |
|--------|---------|----------|--------|-------|
| Total Spend | ${current} | ${baseline} | {+/-}% | {→/↑/↓} |
| Avg CPC | ${current} | ${baseline} | {+/-}% | {→/↑/↓} |
| Avg CTR | {current}% | {baseline}% | {+/-}% | {→/↑/↓} |
| Total Conversions | {current} | {baseline} | {+/-}% | {→/↑/↓} |
| Avg CPA | ${current} | ${baseline} | {+/-}% | {→/↑/↓} |
| Blended ROAS | {current}x | {baseline}x | {+/-}% | {→/↑/↓} |

---

## Winner Detection

### Strong Winners (scale these)
| Campaign | CPC | CTR | CVR | CPA | ROAS | Action |
|----------|-----|-----|-----|-----|------|--------|
| {name} | ${cpc} ✅ | {ctr}% ✅ | {cvr}% ✅ | ${cpa} ✅ | {roas}x | Scale 20%/wk |

### Emerging Winners (monitor closely)
| Campaign | CPC | CTR | CVR | CPA | ROAS | Action |
|----------|-----|-----|-----|-----|------|--------|
| {name} | ${cpc} | {ctr}% ✅ | {cvr}% | ${cpa} | {roas}x | Continue 7d |

### Kill List (pause immediately)
| Campaign | Issue | CPA vs Target | Spend Wasted | Action |
|----------|-------|--------------|-------------|--------|
| {name} | CPA 3.2x target | ${cpa} vs ${target} | ${wasted} | **PAUSE NOW** |

---

## Anomaly Alerts

| Alert | Campaign | Metric | Expected | Actual | Severity |
|-------|----------|--------|----------|--------|----------|
| ⚠️ | {name} | CPC | ${expected} | ${actual} | HIGH |
| 🔴 | {name} | Conversions | {expected} | {actual} | CRITICAL |

---

## Campaign Performance

### {Campaign Name}

| Metric | Value | vs Baseline | Trend (7d) |
|--------|-------|-------------|------------|
| Spend | ${spend} | {+/-}% | {→/↑/↓} |
| Impressions | {impr} | {+/-}% | {→/↑/↓} |
| Clicks | {clicks} | {+/-}% | {→/↑/↓} |
| CTR | {ctr}% | {+/-}% | {→/↑/↓} |
| CPC | ${cpc} | {+/-}% | {→/↑/↓} |
| Conversions | {conv} | {+/-}% | {→/↑/↓} |
| CVR | {cvr}% | {+/-}% | {→/↑/↓} |
| CPA | ${cpa} | {+/-}% | {→/↑/↓} |
| ROAS | {roas}x | {+/-}% | {→/↑/↓} |

**Classification**: {Strong Winner / Emerging / Stable / Underperformer / Kill}

---

## Budget Reallocation Recommendation

| Campaign | Current Budget | Recommended | Change | Reason |
|----------|---------------|-------------|--------|--------|
| {winner} | ${current} | ${recommended} | +20% | Strong winner, scale |
| {loser} | ${current} | ${recommended} | -100% | 3x kill rule |

**Estimated Impact**: Reallocating ${amount} from underperformers to winners = estimated {X}% CPA reduction

---

## Recommendations

### Immediate (this session)
1. **Pause {campaign}** — CPA ${X} exceeds 3x target (${target})
2. **Scale {campaign}** — Strong winner, increase budget 20%

### This Week
3. **Refresh creative for {campaign}** — CTR declining 15% WoW (ad fatigue)
4. **Check tracking for {campaign}** — Conversions dropped 40% with stable clicks

### This Month
5. **Test new angles** — Run /agileflow:ads:generate + /agileflow:ads:test-plan
6. **Platform diversification** — {platform} ROAS declining, test {other_platform}
```

Save dashboard to `docs/08-project/ads-tracking/dashboard-{YYYYMMDD}.md`.
Save baseline to `docs/08-project/ads-tracking/baseline-{YYYYMMDD}.json`.

---

## Present Results

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "Performance dashboard generated. {winners} winners, {kills} to kill, {anomalies} anomalies. Total spend: ${spend}, blended ROAS: {roas}x.",
  "header": "Next steps",
  "multiSelect": false,
  "options": [
    {"label": "Pause kill-list campaigns now (Recommended)", "description": "Stop wasting ${wasted_amount}/mo on {kill_count} underperforming campaigns"},
    {"label": "Generate replacement ad copy", "description": "Run /agileflow:ads:generate for fatigued campaigns"},
    {"label": "Create test plan for winners", "description": "Run /agileflow:ads:test-plan to scale winning angles"},
    {"label": "Run full ads audit", "description": "Run /agileflow:ads:audit for comprehensive 190-check analysis"}
  ]
}]</parameter>
</invoke>
```

---

<!-- COMPACT_SUMMARY_START -->
## Compact Summary

**Command**: `/agileflow:ads:track` - Performance tracking with winner detection

**Input**: Performance CSV/data from ad platforms

**Analysis**: Baselines, winner detection (5 classes), anomaly alerts, trend analysis, budget reallocation

**Key Rules**: 3x Kill Rule for CPA, 20% max scaling per week, 100+ clicks for CPC confidence

**Output**: KPI dashboard + baseline JSON + recommendations

**Usage**: `/agileflow:ads:track <data> [PERIOD=7d] [BASELINE=auto]`

**Files**: `docs/08-project/ads-tracking/dashboard-{YYYYMMDD}.md`, `baseline-{YYYYMMDD}.json`
<!-- COMPACT_SUMMARY_END -->
