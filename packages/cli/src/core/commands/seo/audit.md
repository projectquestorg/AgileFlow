---
description: Full website SEO audit with 6 parallel analyzers, business type detection, weighted health score 0-100, and prioritized action plan
argument-hint: "URL [DEPTH=quick|deep] [MAX_PAGES=50]"
compact_context:
  priority: high
  preserve_rules:
    - "ACTIVE COMMAND: /agileflow:seo:audit - Full website SEO audit"
    - "CRITICAL: Deploy 6 analyzers IN PARALLEL in ONE message with multiple Task calls"
    - "CRITICAL: Wait for all results before running consensus (use TaskOutput with block=true)"
    - "CRITICAL: Weighted scoring - Technical 20%, Content 20%, Schema 15%, Performance 15%, Images 15%, Sitemap 15%"
    - "MUST parse arguments: URL (required), DEPTH (quick/deep), MAX_PAGES (default 50)"
    - "Fetch homepage FIRST to detect business type before deploying analyzers"
    - "Pass all analyzer outputs to seo-consensus for final report"
  state_fields:
    - target_url
    - depth
    - max_pages
    - business_type
    - analyzers_deployed
    - health_score
---

# /agileflow:seo:audit

Deploy 6 specialized SEO analyzers in parallel to audit a website, then synthesize results through consensus into a weighted health score (0-100) with prioritized action plan.

---

## Quick Reference

```
/agileflow:seo:audit https://example.com                     # Quick audit (all 6 analyzers)
/agileflow:seo:audit https://example.com DEPTH=deep           # Deep audit (more thorough per-analyzer)
/agileflow:seo:audit https://example.com MAX_PAGES=100        # Audit up to 100 pages
```

---

## How It Works

```
┌──────────────────────────────────────────────────────────────┐
│                    /agileflow:seo:audit                       │
│                                                               │
│  1. Parse arguments (URL, depth, max_pages)                   │
│  2. Fetch homepage → detect business type                     │
│  3. Fetch robots.txt + sitemap.xml                            │
│  4. Deploy 6 analyzers IN PARALLEL                            │
│  5. Collect all results                                       │
│  6. Run consensus → weighted health score                     │
│  7. Generate SEO Audit Report + action plan                   │
└──────────────────────────────────────────────────────────────┘

   ┌──────────┐ ┌─────────┐ ┌────────┐
   │Technical │ │ Content │ │ Schema │
   └────┬─────┘ └────┬────┘ └───┬────┘
        │            │          │
   ┌────┴──────┐ ┌───┴────┐ ┌──┴──────┐
   │Performance│ │ Images │ │ Sitemap │
   └────┬──────┘ └───┬────┘ └──┬──────┘
        │            │          │
        └────────────┼──────────┘
                     ▼
          ┌─────────────────────┐
          │  SEO Consensus      │
          │  (weighted scoring, │
          │   health score,     │
          │   action plan)      │
          └─────────────────────┘
```

---

## Arguments

| Argument | Values | Default | Description |
|----------|--------|---------|-------------|
| URL | Any valid URL | Required | Homepage URL to audit |
| DEPTH | quick, deep | quick | quick = standard analysis, deep = comprehensive |
| MAX_PAGES | 1-500 | 50 | Maximum pages to analyze |

---

## Step-by-Step Process

### STEP 1: Parse Arguments

```
URL = first argument (required - ask if missing)
DEPTH = quick (default) or deep
MAX_PAGES = 50 (default)
```

If URL is missing, ask:
```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "Which website would you like to audit?",
  "header": "Target URL",
  "multiSelect": false,
  "options": [
    {"label": "Enter URL", "description": "e.g., https://example.com"}
  ]
}]</parameter>
</invoke>
```

### STEP 2: Detect Business Type

Fetch the homepage with WebFetch and classify the business:

| Type | Indicators |
|------|-----------|
| **SaaS** | Login/signup, pricing page, docs, API references, "free trial" |
| **Local Business** | Address, phone, map, service areas, hours, "near me" |
| **E-commerce** | Products, cart, checkout, categories, prices, reviews |
| **Publisher** | Articles, blog, news, editorial, bylines, publication dates |
| **Agency** | Portfolio, services list, team page, case studies, "hire us" |

Also fetch:
- `{URL}/robots.txt` - crawl rules, sitemap location
- `{URL}/sitemap.xml` - page inventory

### STEP 3: Deploy 6 Analyzers in Parallel

**CRITICAL**: Deploy ALL 6 analyzers in a SINGLE message with multiple Task calls.

```xml
<invoke name="Task">
<parameter name="description">Technical SEO analysis</parameter>
<parameter name="prompt">TASK: Analyze technical SEO for this website.

TARGET URL: {url}
DEPTH: {quick|deep}
BUSINESS TYPE: {detected type}

Analyze: crawlability, indexability, security headers, URL structure, mobile-friendliness, and CWV indicators.

Also check robots.txt and basic crawl rules.

OUTPUT your findings in standard format with Technical SEO Score X/100.</parameter>
<parameter name="subagent_type">seo-analyzer-technical</parameter>
<parameter name="run_in_background">true</parameter>
</invoke>

<invoke name="Task">
<parameter name="description">Content quality E-E-A-T analysis</parameter>
<parameter name="prompt">TASK: Analyze content quality and E-E-A-T signals.

TARGET URL: {url}
DEPTH: {quick|deep}
BUSINESS TYPE: {detected type}

Assess: Trustworthiness (30%), Expertise (25%), Authoritativeness (25%), Experience (20%), plus content depth, readability, and AI citation readiness.

OUTPUT your findings with Content Quality Score X/100.</parameter>
<parameter name="subagent_type">seo-analyzer-content</parameter>
<parameter name="run_in_background">true</parameter>
</invoke>

<invoke name="Task">
<parameter name="description">Schema/structured data analysis</parameter>
<parameter name="prompt">TASK: Analyze schema markup and structured data.

TARGET URL: {url}
DEPTH: {quick|deep}
BUSINESS TYPE: {detected type}

Detect: existing JSON-LD/Microdata/RDFa, validate against Google standards, flag deprecated types, identify missing schema opportunities, generate ready-to-use snippets.

OUTPUT your findings with Schema Score X/100.</parameter>
<parameter name="subagent_type">seo-analyzer-schema</parameter>
<parameter name="run_in_background">true</parameter>
</invoke>

<invoke name="Task">
<parameter name="description">Image optimization analysis</parameter>
<parameter name="prompt">TASK: Analyze image optimization.

TARGET URL: {url}
DEPTH: {quick|deep}
BUSINESS TYPE: {detected type}

Check: alt text quality, image sizing (CLS), modern formats (WebP/AVIF), lazy loading, LCP image priority, responsive images.

OUTPUT your findings with Image Optimization Score X/100.</parameter>
<parameter name="subagent_type">seo-analyzer-images</parameter>
<parameter name="run_in_background">true</parameter>
</invoke>

<invoke name="Task">
<parameter name="description">Core Web Vitals performance analysis</parameter>
<parameter name="prompt">TASK: Analyze performance and Core Web Vitals.

TARGET URL: {url}
DEPTH: {quick|deep}
BUSINESS TYPE: {detected type}

Assess: LCP optimization, INP indicators, CLS risk factors, resource loading, render-blocking resources, third-party impact.

OUTPUT your findings with Performance Score X/100.</parameter>
<parameter name="subagent_type">seo-analyzer-performance</parameter>
<parameter name="run_in_background">true</parameter>
</invoke>

<invoke name="Task">
<parameter name="description">Sitemap validation analysis</parameter>
<parameter name="prompt">TASK: Analyze XML sitemap.

TARGET URL: {url}
DEPTH: {quick|deep}
BUSINESS TYPE: {detected type}

Validate: sitemap existence, XML structure, URL coverage, quality gates, robots.txt reference.

OUTPUT your findings with Sitemap Score X/100.</parameter>
<parameter name="subagent_type">seo-analyzer-sitemap</parameter>
<parameter name="run_in_background">true</parameter>
</invoke>
```

### STEP 4: Collect Results

Wait for all analyzers to complete using TaskOutput with block=true. Collect all 6 outputs.

### STEP 5: Run Consensus Coordinator

Pass all analyzer outputs to the consensus coordinator:

```xml
<invoke name="Task">
<parameter name="description">SEO audit consensus and scoring</parameter>
<parameter name="prompt">You are the SEO Consensus Coordinator.

TARGET URL: {url}
BUSINESS TYPE: {detected type}
DEPTH: {depth}

## Analyzer Outputs

### Technical SEO Results:
{technical_output}

### Content Quality Results:
{content_output}

### Schema Results:
{schema_output}

### Image Optimization Results:
{images_output}

### Performance Results:
{performance_output}

### Sitemap Results:
{sitemap_output}

---

Follow your consensus process:
1. Confirm business type classification
2. Parse all findings into normalized structure
3. Calculate category scores (each out of 100)
4. Apply weights: Technical 20%, Content 20%, Schema 15%, Performance 15%, Images 15%, Sitemap 15%
5. Compute overall Health Score 0-100
6. Cross-reference findings flagged by multiple analyzers
7. Prioritize: Critical → High → Medium → Low
8. Generate action plan with quick wins
9. Save report to docs/08-project/seo-audits/seo-audit-{YYYYMMDD}.md</parameter>
<parameter name="subagent_type">seo-consensus</parameter>
</invoke>
```

### STEP 6: Present Results

After consensus completes, show summary and offer next steps:

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "SEO Audit complete: Health Score {X}/100 ({rating}). Business type: {type}. {N} findings ({critical} critical, {high} high).",
  "header": "Next steps",
  "multiSelect": false,
  "options": [
    {"label": "Fix {critical} Critical issues now (Recommended)", "description": "{top_issue_summary}"},
    {"label": "Deep-dive into {lowest_category}", "description": "Lowest score: {category} at {score}/100"},
    {"label": "Generate schema markup for this site", "description": "Run /agileflow:seo:schema to get ready-to-use JSON-LD"},
    {"label": "Create SEO improvement plan", "description": "Run /agileflow:seo:plan for strategic roadmap"}
  ]
}]</parameter>
</invoke>
```

---

## Example Output

```
SEO Audit: https://example.com
══════════════════════════════════════════════════════════════

Business Type: SaaS
Depth: quick

Deploying 6 SEO analyzers...
✓ Technical SEO Analyzer
✓ Content Quality Analyzer
✓ Schema Analyzer
✓ Image Optimization Analyzer
✓ Performance Analyzer
✓ Sitemap Analyzer

Running consensus...
✓ Consensus complete

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
HEALTH SCORE: 72/100 (Good)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

| Category         | Score  | Weight | Weighted |
|-----------------|--------|--------|----------|
| Technical SEO   | 85/100 | 20%    | 17.0     |
| Content Quality | 68/100 | 20%    | 13.6     |
| Schema          | 45/100 | 15%    |  6.8     |
| Performance     | 78/100 | 15%    | 11.7     |
| Images          | 82/100 | 15%    | 12.3     |
| Sitemap         | 75/100 | 15%    | 11.3     |

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CRITICAL: 1 | HIGH: 3 | MEDIUM: 5 | LOW: 2
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[Full report saved to docs/08-project/seo-audits/seo-audit-20260225.md]
```

---

<!-- COMPACT_SUMMARY_START -->
## Compact Summary

**Command**: `/agileflow:seo:audit` - Full website SEO audit with 6 parallel analyzers

**Quick Usage**:
```
/agileflow:seo:audit https://example.com                # Quick audit
/agileflow:seo:audit https://example.com DEPTH=deep      # Deep audit
```

**What It Does**: Fetch homepage → Detect business type → Deploy 6 analyzers in parallel → Consensus weights scores → Health Score 0-100 → Prioritized action plan

**Analyzers (all 6 deploy in parallel)**:
- `seo-analyzer-technical` - Crawlability, indexability, security, URLs, mobile
- `seo-analyzer-content` - E-E-A-T scoring, readability, AI citation readiness
- `seo-analyzer-schema` - JSON-LD detection, validation, deprecated types
- `seo-analyzer-images` - Alt text, sizing, formats, lazy loading
- `seo-analyzer-performance` - LCP, INP, CLS, resource loading
- `seo-analyzer-sitemap` - XML validation, coverage, quality gates

**Category Weights**: Technical 20%, Content 20%, Schema 15%, Performance 15%, Images 15%, Sitemap 15%

**Output**: `docs/08-project/seo-audits/seo-audit-{YYYYMMDD}.md`
<!-- COMPACT_SUMMARY_END -->

---

## Related Commands

- `/agileflow:seo:page` - Deep-dive into a single page
- `/agileflow:seo:schema` - Generate schema markup
- `/agileflow:seo:geo` - AI search optimization
- `/agileflow:seo:plan` - Strategic SEO planning
- `/agileflow:seo:technical` - Technical SEO deep-dive
