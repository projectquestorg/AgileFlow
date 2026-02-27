---
description: Deep single-page SEO analysis across 6 dimensions - on-page, content, technical, schema, images, and performance
argument-hint: "URL [FOCUS=all|on-page|content|technical|schema|images|performance]"
compact_context:
  priority: medium
  preserve_rules:
    - "ACTIVE COMMAND: /agileflow:seo:page - Single page SEO analysis"
    - "Fetch the page with WebFetch, then analyze across 6 dimensions"
    - "FOCUS parameter narrows analysis to specific dimension"
    - "Output a scored report card per dimension"
  state_fields:
    - target_url
    - focus
    - page_scores
---

# /agileflow:seo:page

Deep analysis of a single page across 6 SEO dimensions. More thorough than the full-site audit for individual pages.

---

## Quick Reference

```
/agileflow:seo:page https://example.com/about              # Full 6-dimension analysis
/agileflow:seo:page https://example.com/blog/post FOCUS=content   # Content quality only
/agileflow:seo:page https://example.com/product FOCUS=schema      # Schema markup only
/agileflow:seo:page https://example.com FOCUS=on-page             # On-page SEO elements
```

---

## Arguments

| Argument | Values | Default | Description |
|----------|--------|---------|-------------|
| URL | Any valid page URL | Required | Page to analyze |
| FOCUS | all, on-page, content, technical, schema, images, performance | all | Which dimension(s) to analyze |

---

## Analysis Dimensions

### 1. On-Page SEO

Analyze the fundamental on-page elements:

| Element | Check | Good | Issue |
|---------|-------|------|-------|
| **Title tag** | Present, 30-60 chars, keyword-forward | Unique, relevant | Missing, duplicate, wrong length |
| **Meta description** | Present, 120-160 chars, has CTA | Compelling, keyword-rich | Missing, duplicate, wrong length |
| **H1** | Exactly 1, contains target keyword | Clear, descriptive | Missing, multiple, keyword-stuffed |
| **H2-H6** | Logical hierarchy, no skipped levels | Organized structure | Skipped levels, flat structure |
| **Internal links** | 2-10 per page, descriptive anchors | Relevant, contextual | None, generic "click here" |
| **External links** | Authoritative sources | Relevant citations | Broken, spammy |
| **URL** | Clean, short, keyword-relevant | Descriptive path | Parameters, long, irrelevant |
| **Canonical** | Self-referencing or correct target | Present, valid | Missing, pointing wrong |
| **Open Graph** | og:title, og:description, og:image | All present | Missing key tags |

### 2. Content Quality

Assess using E-E-A-T framework (see eeat-framework.md reference):
- Word count vs page type minimum
- Content uniqueness (not boilerplate)
- Readability level
- Author attribution
- E-E-A-T signals present
- AI citation readiness (134-167 word blocks)

### 3. Technical

Page-level technical checks:
- HTTP status code
- Response time / TTFB
- HTTPS
- Mobile viewport
- Canonical tag correctness
- Robots directives (index/noindex)
- Structured data presence
- Language declaration

### 4. Schema

Structured data on this specific page:
- What JSON-LD/Microdata is present
- Validation of existing schema
- Missing schema opportunities for this page type
- Rich result eligibility

### 5. Images

All images on the page:
- Alt text quality
- Width/height attributes
- Format (WebP/AVIF vs legacy)
- Lazy loading
- LCP image optimization

### 6. Performance

Page-level performance indicators:
- Render-blocking resources
- Script loading (async/defer)
- Image optimization
- Third-party resources
- Font loading
- Estimated CWV impact

---

## Process

### STEP 1: Fetch the Page

Use WebFetch to retrieve the target URL. Extract full HTML content.

### STEP 2: Analyze Per Focus

If `FOCUS=all`, analyze all 6 dimensions. Otherwise, analyze only the specified dimension.

For each dimension, produce a score out of 100 and a findings list.

### STEP 3: Generate Report Card

Output a report card:

```markdown
# Page SEO Report: {URL}

## Report Card

| Dimension | Score | Key Finding |
|-----------|-------|-------------|
| On-Page SEO | {X}/100 | {top issue or "All good"} |
| Content Quality | {X}/100 | {top issue or "All good"} |
| Technical | {X}/100 | {top issue or "All good"} |
| Schema | {X}/100 | {top issue or "All good"} |
| Images | {X}/100 | {top issue or "All good"} |
| Performance | {X}/100 | {top issue or "All good"} |

**Page Score: {average}/100**

---

## Detailed Findings

### On-Page SEO ({X}/100)

| Element | Status | Details |
|---------|--------|---------|
| Title | {pass/fail} | "{actual title}" ({length} chars) |
| Meta Description | {pass/fail} | "{actual}" ({length} chars) |
| H1 | {pass/fail} | "{actual H1}" |
| ...

[Findings for each dimension]

---

## Quick Fixes

1. {Highest impact, easiest fix}
2. {Next priority}
3. {Next priority}
```

### STEP 4: Offer Next Steps

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "Page analysis complete: {URL} scored {X}/100. Lowest dimension: {dim} ({score}/100).",
  "header": "Next steps",
  "multiSelect": false,
  "options": [
    {"label": "Fix {top_issue} (Recommended)", "description": "{specific fix description}"},
    {"label": "Generate schema markup", "description": "Create JSON-LD for this page type"},
    {"label": "Run full site audit", "description": "/agileflow:seo:audit {domain}"},
    {"label": "Analyze another page", "description": "Run /agileflow:seo:page on a different URL"}
  ]
}]</parameter>
</invoke>
```

---

<!-- COMPACT_SUMMARY_START -->
## Compact Summary

**Command**: `/agileflow:seo:page` - Single page SEO analysis across 6 dimensions

**Dimensions**: On-Page, Content, Technical, Schema, Images, Performance

**Usage**: `/agileflow:seo:page URL [FOCUS=dimension]`

**Output**: Scored report card per dimension + prioritized fixes
<!-- COMPACT_SUMMARY_END -->
