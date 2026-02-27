---
description: Programmatic SEO quality gates - validate bulk-generated pages for uniqueness, thin content, duplicate titles, and scale limits
argument-hint: "URL [MAX_SAMPLE=20]"
compact_context:
  priority: medium
  preserve_rules:
    - "ACTIVE COMMAND: /agileflow:seo:programmatic - Programmatic SEO QA"
    - "Check quality gates from quality-gates.md reference"
    - "Sample pages to assess uniqueness and content quality"
    - "Flag when thresholds are exceeded"
  state_fields:
    - target_url
    - max_sample
    - pages_sampled
    - gate_violations
---

# /agileflow:seo:programmatic

Quality gate enforcement for programmatic SEO. Validate bulk-generated pages for uniqueness, thin content, duplicate elements, and scale safety limits.

---

## Quick Reference

```
/agileflow:seo:programmatic https://example.com               # Sample 20 pages for QA
/agileflow:seo:programmatic https://example.com MAX_SAMPLE=50  # Larger sample
```

---

## Arguments

| Argument | Values | Default | Description |
|----------|--------|---------|-------------|
| URL | Any valid URL | Required | Site with programmatic pages |
| MAX_SAMPLE | 5-100 | 20 | Number of pages to sample and analyze |

---

## Quality Gates (from quality-gates.md)

| Metric | Warning | Hard Stop |
|--------|---------|-----------|
| Pages without audit | 100+ | 500+ |
| Unique content per page | < 40% | < 20% |
| Location pages | 30+ | 50+ |
| Thin pages (< 300 words) | 10+ | 50+ |
| Duplicate title tags | 5+ | 20+ |
| Duplicate meta descriptions | 10+ | 30+ |
| Pages with no internal links in | 5+ | 20+ |
| 404 errors | 5+ | 20+ |

---

## Process

### STEP 1: Discover Programmatic Pages

Fetch sitemap to identify programmatic page patterns:
- `/locations/*`, `/cities/*` (location pages)
- `/products/*`, `/categories/*` (product pages)
- `/topics/*`, `/tags/*` (topic pages)
- Any repeating URL pattern with varying slugs

### STEP 2: Sample Pages

Select a representative sample:
- Random selection across the pattern
- Include first, middle, and last pages
- Include edge cases (short slugs, long slugs)

### STEP 3: Analyze Each Sampled Page

For each page, check:

| Check | What | Threshold |
|-------|------|-----------|
| **Word count** | Total content words | ≥ 300 (product), ≥ 500 (location) |
| **Unique content %** | Content not shared with template | ≥ 40% |
| **Title uniqueness** | Not identical to other sampled pages | Unique |
| **Meta description** | Present and unique | Not duplicate |
| **Internal links** | Links pointing to this page | ≥ 1 |
| **Structured data** | Schema present and valid | Present |
| **Content quality** | Not just template with city name swapped | Substantive |

### STEP 4: Aggregate and Report

```markdown
# Programmatic SEO QA: {URL}

## Pages Sampled: {N} of ~{total estimated}

## Quality Gate Results

| Gate | Status | Value | Threshold |
|------|--------|-------|-----------|
| Unique content | PASS/WARN/FAIL | {avg}% | ≥ 40% |
| Thin content | PASS/WARN/FAIL | {N} pages < 300w | < 10 |
| Duplicate titles | PASS/WARN/FAIL | {N} duplicates | < 5 |
| Duplicate descriptions | PASS/WARN/FAIL | {N} duplicates | < 10 |
| Internal links | PASS/WARN/FAIL | {N} orphans | < 5 |
| Schema present | PASS/WARN/FAIL | {N} missing | 0 |

## Sample Analysis

| Page | Words | Unique % | Title Unique | Schema |
|------|-------|----------|-------------|--------|
| /locations/new-york | 450 | 52% | Yes | Yes |
| /locations/los-angeles | 420 | 48% | Yes | Yes |
| /locations/chicago | 280 | 35% | No (dup) | No |

## Recommendations

1. {Priority recommendation}
2. {Next priority}
3. {Next priority}
```

---

<!-- COMPACT_SUMMARY_START -->
## Compact Summary

**Command**: `/agileflow:seo:programmatic` - Programmatic SEO quality gates

**Checks**: Content uniqueness, thin pages, duplicate titles/descriptions, orphan pages

**Usage**: `/agileflow:seo:programmatic URL [MAX_SAMPLE=20]`
<!-- COMPACT_SUMMARY_END -->
