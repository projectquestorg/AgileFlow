---
description: Full multi-platform paid advertising audit with 6 parallel analyzers, industry detection, weighted Ads Health Score 0-100, and prioritized action plan
argument-hint: "<account-data> [PLATFORMS=all]"
compact_context:
  priority: high
  preserve_rules:
    - "ACTIVE COMMAND: /agileflow:ads:audit - Full paid advertising audit"
    - "CRITICAL: Deploy 6 analyzers IN PARALLEL in ONE message with multiple Task calls"
    - "CRITICAL: Wait for all results before running consensus (use TaskOutput with block=true)"
    - "CRITICAL: Weighted scoring - Tracking 25%, Wasted Spend 20%, Structure 15%, Creative 15%, Budget 15%, Compliance 10%"
    - "MUST detect industry type before deploying analyzers"
    - "Pass all analyzer outputs to ads-consensus for final report"
    - "Quality Gates: No optimization without tracking, 3x Kill Rule, Broad Match needs Smart Bidding"
  state_fields:
    - platforms
    - industry_type
    - analyzers_deployed
    - health_score
---

# /agileflow:ads:audit

Deploy 6 specialized advertising analyzers in parallel to audit ad accounts, then synthesize results through consensus into a weighted Ads Health Score (0-100) with prioritized action plan.

---

## Quick Reference

```
/agileflow:ads:audit <account-data>                       # Full audit (all platforms detected)
/agileflow:ads:audit <account-data> PLATFORMS=google,meta  # Specific platforms only
```

---

## How It Works

```
+-----------------------------------------------------------------+
|                    /agileflow:ads:audit                          |
|                                                                  |
|  1. Parse account data (pasted, file, or described)              |
|  2. Detect industry type and active platforms                    |
|  3. Deploy 6 analyzers IN PARALLEL                               |
|  4. Collect all results                                          |
|  5. Run consensus -> weighted Ads Health Score                   |
|  6. Generate Ads Audit Report + action plan                      |
+-----------------------------------------------------------------+

   +----------+ +----------+ +-----------+
   |  Google  | |   Meta   | |  Budget   |
   |  74 chks | |  46 chks | |  24 chks  |
   +----+-----+ +----+-----+ +-----+-----+
        |            |             |
   +----+-----+ +----+-----+ +----+------+
   | Creative | | Tracking | | Compliance|
   |  21 chks | |   7 chks | |  18 chks  |
   +----+-----+ +----+-----+ +-----+-----+
        |            |             |
        +------------+-------------+
                     |
              +------+------+
              | Ads         |
              | Consensus   |
              | (weighted   |
              |  scoring)   |
              +-------------+
```

---

## Arguments

| Argument | Values | Default | Description |
|----------|--------|---------|-------------|
| account-data | Text, file path, or description | Required | Account data to audit |
| PLATFORMS | google,meta,linkedin,tiktok,microsoft,youtube | all detected | Limit to specific platforms |

---

## Step-by-Step Process

### STEP 1: Parse Account Data

Accept data in any format:
- **Pasted CSV/text** - Parse columns and metrics
- **File path** - Read CSV/JSON export files
- **Plain description** - Extract account details from narrative
- **Multiple sources** - Combine data from different platforms

If no data provided, ask:
```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "Please provide your ad account data. What format works best?",
  "header": "Account Data",
  "multiSelect": false,
  "options": [
    {"label": "Paste account data (Recommended)", "description": "Copy/paste from Google Ads, Meta Ads Manager, etc."},
    {"label": "Describe my setup", "description": "I'll describe my campaigns, targeting, and results"},
    {"label": "Point to exported files", "description": "I have CSV/JSON exports from ad platforms"}
  ]
}]</parameter>
</invoke>
```

### STEP 2: Detect Industry & Platforms

From the account data, identify:
- **Industry**: SaaS, E-commerce, Local Services, B2B, Healthcare, Finance, Education
- **Active platforms**: Which ad platforms have campaigns
- **Account maturity**: New (< 3 months), Growing (3-12 months), Mature (12+ months)

### STEP 3: Deploy 6 Analyzers in Parallel

**CRITICAL**: Deploy ALL 6 analyzers in a SINGLE message with multiple Task calls.

```xml
<invoke name="Task">
<parameter name="description">Google Ads audit analysis</parameter>
<parameter name="prompt">TASK: Audit Google Ads account data.

INDUSTRY: {detected industry}
ACCOUNT DATA:
{google_ads_data}

Apply all 74 checks across 6 categories: Conversion Tracking (25%), Wasted Spend (25%), Account Structure (15%), Keyword Strategy (15%), Ad Copy Quality (10%), Campaign Settings (10%).

Enforce quality gates: tracking required, no Broad Match without Smart Bidding, 3x Kill Rule.

OUTPUT your findings with Google Ads Score X/100.</parameter>
<parameter name="subagent_type">ads-audit-google</parameter>
<parameter name="run_in_background">true</parameter>
</invoke>

<invoke name="Task">
<parameter name="description">Meta Ads audit analysis</parameter>
<parameter name="prompt">TASK: Audit Meta/Facebook Ads account data.

INDUSTRY: {detected industry}
ACCOUNT DATA:
{meta_ads_data}

Apply all 46 checks across 4 categories: Pixel & CAPI (30%), Creative Strategy (25%), Account Structure (25%), Audience Targeting (20%).

Enforce quality gates: Pixel required, domain verification, learning phase, Special Ad Categories.

OUTPUT your findings with Meta Ads Score X/100.</parameter>
<parameter name="subagent_type">ads-audit-meta</parameter>
<parameter name="run_in_background">true</parameter>
</invoke>

<invoke name="Task">
<parameter name="description">Budget and bidding audit</parameter>
<parameter name="prompt">TASK: Audit budget allocation and bidding strategy.

INDUSTRY: {detected industry}
PLATFORMS: {active platforms}
ACCOUNT DATA:
{all_budget_data}

Apply all 24 checks across 4 categories: Budget Allocation (35%), Bidding Strategy (30%), Scaling & Pacing (20%), Platform Mix (15%).

Enforce platform minimums and scaling rules.

OUTPUT your findings with Budget Score X/100.</parameter>
<parameter name="subagent_type">ads-audit-budget</parameter>
<parameter name="run_in_background">true</parameter>
</invoke>

<invoke name="Task">
<parameter name="description">Creative quality audit</parameter>
<parameter name="prompt">TASK: Audit creative quality across platforms.

INDUSTRY: {detected industry}
PLATFORMS: {active platforms}
ACCOUNT DATA:
{creative_data}

Apply all 21 checks across 4 categories: Ad Copy Effectiveness (30%), Visual & Format Compliance (25%), Platform Requirements (25%), Performance & Testing (20%).

Check safe zones, character limits, and restricted content.

OUTPUT your findings with Creative Score X/100.</parameter>
<parameter name="subagent_type">ads-audit-creative</parameter>
<parameter name="run_in_background">true</parameter>
</invoke>

<invoke name="Task">
<parameter name="description">Conversion tracking audit</parameter>
<parameter name="prompt">TASK: Audit conversion tracking across all platforms.

PLATFORMS: {active platforms}
ACCOUNT DATA:
{tracking_data}

Apply all 7 critical tracking checks: tags installed, events defined, deduplication, attribution, freshness, privacy, server-side.

This is the FOUNDATION check - all other optimizations depend on tracking accuracy.

OUTPUT your findings with Tracking Score X/100.</parameter>
<parameter name="subagent_type">ads-audit-tracking</parameter>
<parameter name="run_in_background">true</parameter>
</invoke>

<invoke name="Task">
<parameter name="description">Compliance and benchmarks audit</parameter>
<parameter name="prompt">TASK: Audit compliance and performance benchmarks.

INDUSTRY: {detected industry}
PLATFORMS: {active platforms}
ACCOUNT DATA:
{compliance_data}

Apply all 18 checks across 4 categories: Platform Policy (35%), Regulatory Compliance (30%), Performance Benchmarks (20%), Account Health (15%).

Flag any legal risk items explicitly.

OUTPUT your findings with Compliance Score X/100.</parameter>
<parameter name="subagent_type">ads-audit-compliance</parameter>
<parameter name="run_in_background">true</parameter>
</invoke>
```

### STEP 4: Collect Results

Wait for all analyzers to complete using TaskOutput with block=true. Collect all 6 outputs:

```xml
<invoke name="TaskOutput">
<parameter name="task_id">{google_task_id}</parameter>
<parameter name="block">true</parameter>
<parameter name="timeout">120000</parameter>
</invoke>

<invoke name="TaskOutput">
<parameter name="task_id">{meta_task_id}</parameter>
<parameter name="block">true</parameter>
<parameter name="timeout">120000</parameter>
</invoke>

<invoke name="TaskOutput">
<parameter name="task_id">{budget_task_id}</parameter>
<parameter name="block">true</parameter>
<parameter name="timeout">120000</parameter>
</invoke>

<invoke name="TaskOutput">
<parameter name="task_id">{creative_task_id}</parameter>
<parameter name="block">true</parameter>
<parameter name="timeout">120000</parameter>
</invoke>

<invoke name="TaskOutput">
<parameter name="task_id">{tracking_task_id}</parameter>
<parameter name="block">true</parameter>
<parameter name="timeout">120000</parameter>
</invoke>

<invoke name="TaskOutput">
<parameter name="task_id">{compliance_task_id}</parameter>
<parameter name="block">true</parameter>
<parameter name="timeout">120000</parameter>
</invoke>
```

Store each output for the consensus step.

### STEP 5: Run Consensus Coordinator

Pass all analyzer outputs to the consensus coordinator:

```xml
<invoke name="Task">
<parameter name="description">Ads audit consensus and scoring</parameter>
<parameter name="prompt">You are the Ads Consensus Coordinator.

INDUSTRY: {detected industry}
PLATFORMS: {active platforms}
ACCOUNT MATURITY: {maturity}

## Analyzer Outputs

### Google Ads Results:
{google_output}

### Meta Ads Results:
{meta_output}

### Budget & Bidding Results:
{budget_output}

### Creative Quality Results:
{creative_output}

### Conversion Tracking Results:
{tracking_output}

### Compliance Results:
{compliance_output}

---

Follow your consensus process:
1. Confirm industry classification
2. Parse all findings into normalized structure
3. Calculate category scores (each out of 100)
4. Apply weights: Tracking 25%, Wasted Spend 20%, Structure 15%, Creative 15%, Budget 15%, Compliance 10%
5. Compute overall Ads Health Score 0-100
6. Enforce quality gates (tracking, 3x kill rule, compliance)
7. Cross-reference findings flagged by multiple analyzers
8. Prioritize: Critical -> High -> Medium -> Low
9. Generate action plan with quick wins and estimated impact
10. Save report to docs/08-project/ads-audits/ads-audit-{YYYYMMDD}.md</parameter>
<parameter name="subagent_type">ads-consensus</parameter>
</invoke>
```

### STEP 6: Present Results

After consensus completes, show summary and offer next steps:

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "Ads Audit complete: Health Score {X}/100 ({grade}). Industry: {type}. {N} findings ({critical} critical, {high} high). Est. monthly waste: ${amount}.",
  "header": "Next steps",
  "multiSelect": false,
  "options": [
    {"label": "Fix {critical} Critical issues now (Recommended)", "description": "{top_issue_summary}"},
    {"label": "Deep-dive into {platform} ({lowest_score}/100)", "description": "Lowest scoring platform needs attention"},
    {"label": "Optimize budget allocation", "description": "Run /agileflow:ads:budget for detailed reallocation plan"},
    {"label": "Plan new campaign strategy", "description": "Run /agileflow:ads:plan for industry-specific templates"}
  ]
}]</parameter>
</invoke>
```

---

## Scoring System

**Health Score**: `100 - (Critical*5.0 + High*3.0 + Medium*1.5 + Low*0.5)` per category

**Grades**: A (90-100), B (80-89), C (70-79), D (60-69), F (<60)

**Category Weights**: Tracking 25%, Wasted Spend 20%, Structure 15%, Creative 15%, Budget 15%, Compliance 10%

---

<!-- COMPACT_SUMMARY_START -->
## Compact Summary

**Command**: `/agileflow:ads:audit` - Full multi-platform ads audit with 6 parallel analyzers

**Quick Usage**:
```
/agileflow:ads:audit <account-data>                # Full audit
/agileflow:ads:audit <data> PLATFORMS=google,meta   # Specific platforms
```

**What It Does**: Parse data -> Detect industry -> Deploy 6 analyzers in parallel -> Consensus weights scores -> Ads Health Score 0-100 -> Prioritized action plan

**Analyzers (all 6 deploy in parallel)**:
- `ads-audit-google` - 74 checks: tracking, spend, structure, keywords, ads, settings
- `ads-audit-meta` - 46 checks: Pixel/CAPI, creative, structure, audience
- `ads-audit-budget` - 24 checks: allocation, bidding, scaling, platform mix
- `ads-audit-creative` - 21 checks: copy, visuals, platform specs, testing
- `ads-audit-tracking` - 7 checks: tags, events, dedup, attribution, privacy
- `ads-audit-compliance` - 18 checks: policy, regulatory, benchmarks, health

**Category Weights**: Tracking 25%, Wasted Spend 20%, Structure 15%, Creative 15%, Budget 15%, Compliance 10%

**Output**: `docs/08-project/ads-audits/ads-audit-{YYYYMMDD}.md`
<!-- COMPACT_SUMMARY_END -->
