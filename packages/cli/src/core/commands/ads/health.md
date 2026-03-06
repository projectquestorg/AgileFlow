---
description: Unified marketing health scorecard — runs ads, SEO, landing page, and tracking audits in parallel to produce a combined score with cross-domain insights
argument-hint: "<account-data-and-url> [SCOPE=all]"
compact_context:
  priority: high
  preserve_rules:
    - "ACTIVE COMMAND: /agileflow:ads:health - Unified marketing health scorecard"
    - "CRITICAL: Deploy ads audit + SEO audit + landing page analysis IN PARALLEL"
    - "CRITICAL: Combine scores into unified Marketing Health Score with domain weights"
    - "Domain weights: Ads 40%, SEO 25%, Landing Pages 20%, Tracking 15%"
    - "Cross-domain insights: tracking gaps affect ads + SEO, landing page quality affects ad ROAS"
  state_fields:
    - ads_score
    - seo_score
    - landing_score
    - tracking_score
    - unified_score
---

# /agileflow:ads:health

Unified marketing health scorecard that orchestrates ads, SEO, landing page, and tracking audits in parallel, then synthesizes into a single Marketing Health Score with cross-domain insights.

---

## Quick Reference

```
/agileflow:ads:health <account-data> <landing-page-url>               # Full health check
/agileflow:ads:health <account-data> SCOPE=ads,seo                    # Ads + SEO only
/agileflow:ads:health <account-data> SCOPE=ads,landing                # Ads + landing pages only
```

---

## How It Works

```
+-------------------------------------------------------------------+
|                    /agileflow:ads:health                            |
|                                                                     |
|  1. Parse inputs (ad data + URLs)                                  |
|  2. Deploy domain audits IN PARALLEL                                |
|  3. Collect all domain scores                                       |
|  4. Cross-reference findings across domains                         |
|  5. Calculate unified Marketing Health Score                        |
|  6. Generate shareable scorecard                                    |
+-------------------------------------------------------------------+

    +-----------+    +----------+    +-----------+    +----------+
    |   Ads     |    |   SEO    |    |  Landing  |    | Tracking |
    |  Audit    |    |  Audit   |    |  Page     |    |  Audit   |
    | (6 agents)|    |(6 agents)|    | Analysis  |    | (shared) |
    +-----+-----+    +----+-----+    +-----+-----+    +----+-----+
          |               |               |               |
          +---------------+---------------+---------------+
                                |
                    +-----------+-----------+
                    |  Health Score         |
                    |  Synthesis &          |
                    |  Cross-Domain         |
                    |  Insights             |
                    +-----------------------+
```

---

## Arguments

| Argument | Values | Default | Description |
|----------|--------|---------|-------------|
| account-data | Text, file, or description | Required for ads | Ad account data for ads audit |
| URL | Landing page URL(s) | Optional | URLs for SEO + landing page analysis |
| SCOPE | all, ads, seo, landing, tracking | all | Which domains to include |

---

## Step-by-Step Process

### STEP 1: Parse Inputs

Accept a combination of:
- **Ad account data** (pasted, file, or described) — triggers ads audit
- **URL(s)** — triggers SEO audit + landing page analysis
- **Both** — triggers full health check

If insufficient data provided:

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[
  {
    "question": "What data do you have for the health check? More data = more comprehensive score.",
    "header": "Data Sources",
    "multiSelect": true,
    "options": [
      {"label": "Ad account data (Recommended)", "description": "Paste from Google Ads, Meta Ads Manager — enables ads audit (40% of score)"},
      {"label": "Website/landing page URL", "description": "Your main URL for SEO + landing page analysis (45% of score)"},
      {"label": "Tracking setup description", "description": "Describe your GTM, pixels, conversion events (15% of score)"}
    ]
  }
]</parameter>
</invoke>
```

### STEP 2: Deploy Domain Audits in Parallel

**CRITICAL**: Deploy ALL applicable audits in a SINGLE message with multiple Task calls using `run_in_background: true`.

#### Ads Audit (if ad data provided)

```xml
<invoke name="Task">
<parameter name="description">Ads audit for health scorecard</parameter>
<parameter name="prompt">Run a complete ads audit on this account data. Apply all checks from all 6 analyzers (Google, Meta, Budget, Creative, Tracking, Compliance). Calculate the Ads Health Score.

ACCOUNT DATA:
{account_data}

OUTPUT: Your Ads Health Score X/100 with category breakdown and top 5 findings by severity.</parameter>
<parameter name="subagent_type">ads-consensus</parameter>
<parameter name="run_in_background">true</parameter>
</invoke>
```

#### SEO Audit (if URL provided)

```xml
<invoke name="Task">
<parameter name="description">SEO audit for health scorecard</parameter>
<parameter name="prompt">Run a complete SEO audit on this URL. Apply all checks from all 6 analyzers (Technical, Content, Schema, Performance, Images, Sitemap). Calculate the SEO Health Score.

URL: {url}

OUTPUT: Your SEO Health Score X/100 with category breakdown and top 5 findings by severity.</parameter>
<parameter name="subagent_type">seo-consensus</parameter>
<parameter name="run_in_background">true</parameter>
</invoke>
```

#### Landing Page Analysis (if URL provided)

```xml
<invoke name="Task">
<parameter name="description">Landing page analysis for health scorecard</parameter>
<parameter name="prompt">Analyze this landing page for conversion optimization. Score across these dimensions:

URL: {url}

## Landing Page Scoring (100 points total)

### Above-the-Fold (30 points)
- Clear headline matching ad intent (10)
- Visible CTA above fold (10)
- Social proof visible without scrolling (5)
- Load time under 3 seconds (5)

### Message Match (25 points)
- Headline matches ad copy themes (10)
- Value proposition clarity (10)
- Single clear conversion goal (5)

### Trust & Proof (20 points)
- Customer testimonials/logos (8)
- Security badges/certifications (4)
- Clear contact information (4)
- Privacy policy linked (4)

### Form/CTA Optimization (15 points)
- Minimal form fields for stage (5)
- CTA button contrast and copy (5)
- Multiple CTAs on long pages (5)

### Mobile Experience (10 points)
- Responsive layout (4)
- Touch-friendly buttons (3)
- Fast mobile load (3)

OUTPUT: Landing Page Score X/100 with breakdown and top 5 recommendations.</parameter>
<parameter name="subagent_type">general-purpose</parameter>
<parameter name="run_in_background">true</parameter>
</invoke>
```

#### Tracking Audit (always runs if any data provided)

The tracking score is extracted from the ads audit (if run) or assessed independently from the URL/description.

### STEP 3: Collect Results

Wait for all background tasks to complete using TaskOutput with `block: true`.

### STEP 4: Cross-Domain Insights

After collecting all scores, identify cross-domain correlations:

| Pattern | Domains | Insight |
|---------|---------|---------|
| Tracking broken + low ads ROAS | Tracking + Ads | "Your ROAS numbers are unreliable — fix tracking first" |
| Slow landing page + high CPC | Landing + Ads | "Slow pages increase bounce rate, raising your CPC" |
| Missing schema + low organic | SEO + Landing | "No structured data means fewer rich snippets in SERPs" |
| Ad copy mismatch + low CVR | Ads + Landing | "Your ads promise X but landing page delivers Y" |
| No retargeting pixel + high bounce | Tracking + Landing | "Losing bounced visitors with no way to retarget them" |

### STEP 5: Calculate Unified Score

```
Marketing Health Score = sum(Domain Score * Domain Weight)
```

**Domain Weights:**
| Domain | Weight | Why |
|--------|--------|-----|
| Ads | 40% | Direct spend efficiency — highest dollar impact |
| SEO | 25% | Organic acquisition — compounding long-term value |
| Landing Pages | 20% | Conversion rate — multiplier for all traffic |
| Tracking | 15% | Data quality — foundation for all optimization |

**If a domain is excluded** (not in SCOPE or no data), redistribute its weight proportionally to included domains.

**Grade Scale:**
| Grade | Score | Meaning |
|-------|-------|---------|
| A | 90-100 | Excellent — optimized marketing funnel |
| B | 80-89 | Good — minor improvements available |
| C | 70-79 | Needs Work — significant gaps in the funnel |
| D | 60-69 | Poor — major issues across multiple domains |
| F | < 60 | Critical — fundamental problems, likely wasting significant spend |

### STEP 6: Generate Scorecard

Output a compact, shareable scorecard:

```markdown
# Marketing Health Scorecard

**Generated**: {YYYY-MM-DD}
**Account**: {name/description}
**Scope**: {domains audited}

---

## Marketing Health Score: {X}/100 ({grade})

```
Ads:      ████████████████████░░░░░░  78/100 (40%)
SEO:      ██████████████░░░░░░░░░░░░  58/100 (25%)
Landing:  ████████████████████████░░  92/100 (20%)
Tracking: ██████░░░░░░░░░░░░░░░░░░░░  25/100 (15%)
          ──────────────────────────
Overall:  ██████████████████░░░░░░░░  71/100 (C)
```

| Domain | Score | Grade | Top Issue |
|--------|-------|-------|-----------|
| **Ads** | {X}/100 | {grade} | {top finding} |
| **SEO** | {X}/100 | {grade} | {top finding} |
| **Landing Pages** | {X}/100 | {grade} | {top finding} |
| **Tracking** | {X}/100 | {grade} | {top finding} |

---

## Cross-Domain Insights

1. **{insight title}** ({domains affected})
   {description and impact}

2. **{insight title}** ({domains affected})
   {description and impact}

---

## Priority Actions (by estimated $ impact)

| # | Action | Domain | Impact | Effort |
|---|--------|--------|--------|--------|
| 1 | {action} | {domain} | {$$} | {Low/Med/High} |
| 2 | {action} | {domain} | {$$} | {Low/Med/High} |
| 3 | {action} | {domain} | {$$} | {Low/Med/High} |

---

## Domain Deep-Dives

Run individual audits for detailed findings:
- `/agileflow:ads:audit` — Full 190-check ads analysis
- `/agileflow:seo:audit` — Full 6-analyzer SEO audit
- `/agileflow:ads:landing` — Detailed landing page optimization
```

Save scorecard to `docs/08-project/health-scorecards/health-scorecard-{YYYYMMDD}.md`.

### STEP 7: Present Results

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "Marketing Health Score: {X}/100 ({grade}). Lowest domain: {domain} ({score}/100). {N} cross-domain insights found.",
  "header": "Next steps",
  "multiSelect": false,
  "options": [
    {"label": "Fix {lowest_domain} issues first (Recommended)", "description": "{top_issue} — estimated ${impact}/mo impact"},
    {"label": "Deep-dive ads audit", "description": "Run full /agileflow:ads:audit for 190-check analysis"},
    {"label": "Deep-dive SEO audit", "description": "Run full /agileflow:seo:audit for comprehensive SEO analysis"},
    {"label": "Generate fix artifacts", "description": "Auto-generate corrected ad copy, schema markup, and meta tags"}
  ]
}]</parameter>
</invoke>
```

---

<!-- COMPACT_SUMMARY_START -->
## Compact Summary

**Command**: `/agileflow:ads:health` - Unified marketing health scorecard

**What It Does**: Deploy ads + SEO + landing page + tracking audits in parallel -> cross-domain insights -> Marketing Health Score 0-100

**Domain Weights**: Ads 40%, SEO 25%, Landing Pages 20%, Tracking 15%

**Output**: Shareable scorecard with bar chart, cross-domain insights, and priority actions

**Usage**: `/agileflow:ads:health <account-data> <url> [SCOPE=all]`

**File**: `docs/08-project/health-scorecards/health-scorecard-{YYYYMMDD}.md`
<!-- COMPACT_SUMMARY_END -->
