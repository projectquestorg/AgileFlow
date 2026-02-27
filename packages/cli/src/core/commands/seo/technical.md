---
description: Deep technical SEO analysis - crawlability, indexability, security headers, URL structure, mobile-friendliness, and rendering
argument-hint: "URL [FOCUS=crawl|index|security|urls|mobile|rendering|all]"
compact_context:
  priority: medium
  preserve_rules:
    - "ACTIVE COMMAND: /agileflow:seo:technical - Technical SEO deep-dive"
    - "Deploy seo-analyzer-technical agent for comprehensive assessment"
    - "8 categories: crawl, index, security, urls, mobile, rendering, international, performance"
  state_fields:
    - target_url
    - focus
    - tech_score
---

# /agileflow:seo:technical

Deep technical SEO analysis covering crawlability, indexability, security headers, URL structure, mobile-friendliness, JavaScript rendering, and international signals.

---

## Quick Reference

```
/agileflow:seo:technical https://example.com                 # Full 8-category assessment
/agileflow:seo:technical https://example.com FOCUS=crawl      # Crawlability only
/agileflow:seo:technical https://example.com FOCUS=security   # Security headers only
/agileflow:seo:technical https://example.com FOCUS=mobile     # Mobile-friendliness only
```

---

## Arguments

| Argument | Values | Default | Description |
|----------|--------|---------|-------------|
| URL | Any valid URL | Required | Site to analyze |
| FOCUS | crawl, index, security, urls, mobile, rendering, international, all | all | Narrow to specific area |

---

## Process

### STEP 1: Deploy Technical Analyzer

```xml
<invoke name="Task">
<parameter name="description">Technical SEO deep-dive</parameter>
<parameter name="prompt">TASK: Perform a deep technical SEO analysis.

TARGET URL: {url}
FOCUS: {focus or "all 8 categories"}

Analyze all 8 categories in depth:
1. Crawlability: robots.txt, meta robots, canonicals, redirect chains, crawl budget
2. Indexability: noindex directives, orphan pages, sitemap coverage, crawl depth
3. Security: HTTPS, HSTS, X-Content-Type-Options, CSP, X-Frame-Options, Referrer-Policy
4. URL Structure: Cleanliness, hierarchy, parameters, consistency, depth
5. Mobile: Viewport, responsive design, tap targets, font sizes, no horizontal scroll
6. JavaScript Rendering: Client-side content, JS-dependent elements, hydration
7. International: hreflang, language tags, geo-targeting, content localization
8. Performance Indicators: TTFB, render-blocking, resource hints, compression

For each category, provide specific findings with evidence and a category score out of 100.

OUTPUT: Technical SEO Score X/100 with category breakdown.</parameter>
<parameter name="subagent_type">seo-analyzer-technical</parameter>
</invoke>
```

### STEP 2: Present Results

Show the technical assessment with category scores and offer targeted fixes.

---

## 8 Categories

| Category | Weight | Key Checks |
|----------|--------|-----------|
| Crawlability | 25% | robots.txt, canonicals, redirects |
| Indexability | 20% | noindex, orphans, sitemap coverage |
| Security | 15% | HTTPS, HSTS, CSP, security headers |
| URL Structure | 15% | Clean URLs, hierarchy, consistency |
| Mobile | 15% | Viewport, responsive, tap targets |
| JS Rendering | 5% | Client-side content visibility |
| International | 3% | hreflang, language declarations |
| Performance | 2% | TTFB, resource hints, compression |

---

<!-- COMPACT_SUMMARY_START -->
## Compact Summary

**Command**: `/agileflow:seo:technical` - Deep technical SEO analysis

**8 Categories**: Crawlability, Indexability, Security, URLs, Mobile, JS Rendering, International, Performance

**Usage**: `/agileflow:seo:technical URL [FOCUS=category]`
<!-- COMPACT_SUMMARY_END -->
