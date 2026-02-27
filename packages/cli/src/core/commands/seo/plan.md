---
description: Strategic SEO planning with industry-specific templates, competitive positioning, and prioritized roadmap generation
argument-hint: "URL [TIMEFRAME=3mo|6mo|12mo]"
compact_context:
  priority: medium
  preserve_rules:
    - "ACTIVE COMMAND: /agileflow:seo:plan - Strategic SEO planning"
    - "Detect business type first, then apply industry template"
    - "Generate prioritized roadmap with timeframe milestones"
    - "Reference audit results if available"
  state_fields:
    - target_url
    - business_type
    - timeframe
---

# /agileflow:seo:plan

Generate a strategic SEO plan with industry-specific templates, competitive positioning analysis, and a prioritized improvement roadmap.

---

## Quick Reference

```
/agileflow:seo:plan https://example.com                      # 6-month SEO plan (default)
/agileflow:seo:plan https://example.com TIMEFRAME=3mo         # 3-month sprint plan
/agileflow:seo:plan https://example.com TIMEFRAME=12mo        # Annual SEO strategy
```

---

## Arguments

| Argument | Values | Default | Description |
|----------|--------|---------|-------------|
| URL | Any valid URL | Required | Site to plan for |
| TIMEFRAME | 3mo, 6mo, 12mo | 6mo | Planning horizon |

---

## Process

### STEP 1: Assess Current State

Fetch the site and determine:
- Business type (SaaS, Local, E-commerce, Publisher, Agency)
- Current SEO maturity (based on quick checks)
- Existing audit results (check `docs/08-project/seo-audits/`)

### STEP 2: Apply Industry Template

| Business Type | Priority Areas | Key Strategies |
|--------------|---------------|----------------|
| **SaaS** | Content marketing, technical SEO, schema | Blog strategy, documentation SEO, product schema |
| **Local Business** | Local SEO, Google Business, reviews | NAP consistency, local schema, review generation |
| **E-commerce** | Product SEO, site structure, CWV | Product schema, faceted navigation, page speed |
| **Publisher** | Content quality, E-E-A-T, freshness | Author pages, topic clusters, article schema |
| **Agency** | Authority, portfolio SEO, local | Case studies, service pages, expertise signals |

### STEP 3: Generate Roadmap

Break the plan into phases:

**3-Month Plan**:
- Month 1: Critical fixes (blocking issues)
- Month 2: Foundation (technical + schema)
- Month 3: Content optimization

**6-Month Plan**:
- Month 1-2: Critical fixes + technical foundation
- Month 3-4: Content strategy + schema implementation
- Month 5-6: Authority building + performance optimization

**12-Month Plan**:
- Q1: Foundation (technical + critical fixes)
- Q2: Content + schema
- Q3: Authority + link building
- Q4: Advanced optimization + monitoring

### STEP 4: Output Plan

```markdown
# SEO Strategy: {URL}

## Business Type: {type}
## Timeframe: {timeframe}
## Current Maturity: {Beginner/Intermediate/Advanced}

---

## Executive Summary

{2-3 sentence overview of the site's SEO status and key opportunities}

---

## Phase 1: {title} (Month 1-X)

### Goals
- {Goal 1}
- {Goal 2}

### Actions
- [ ] {Specific action with expected impact}
- [ ] {Specific action}
- [ ] {Specific action}

### KPIs
- {Metric to track}
- {Metric to track}

---

## Phase 2: {title} (Month X-Y)

[Same structure]

---

## Content Strategy

### Topic Clusters
| Pillar | Supporting Content | Target Keywords |
|--------|-------------------|----------------|
| {topic} | {subtopics} | {keywords} |

### Content Calendar
| Month | Content Type | Topic | Goal |
|-------|-------------|-------|------|
| 1 | {type} | {topic} | {goal} |

---

## Technical Priorities

[Ranked list from audit findings or quick assessment]

---

## Measurement Framework

| KPI | Current | Target ({timeframe}) |
|-----|---------|---------------------|
| Organic traffic | Baseline | +X% |
| Indexed pages | {N} | {target} |
| Core Web Vitals | {status} | All Good |
| Schema types | {N} | {target} |
```

---

<!-- COMPACT_SUMMARY_START -->
## Compact Summary

**Command**: `/agileflow:seo:plan` - Strategic SEO planning

**Input**: URL + timeframe (3mo/6mo/12mo)

**Output**: Industry-specific roadmap with phases, content strategy, and KPIs

**Usage**: `/agileflow:seo:plan URL [TIMEFRAME=6mo]`
<!-- COMPACT_SUMMARY_END -->
