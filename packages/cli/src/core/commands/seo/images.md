---
description: Image optimization analysis - alt text quality, sizing for CLS, WebP/AVIF format detection, lazy loading, and responsive images
argument-hint: "URL"
compact_context:
  priority: medium
  preserve_rules:
    - "ACTIVE COMMAND: /agileflow:seo:images - Image optimization analysis"
    - "Deploy seo-analyzer-images for comprehensive image audit"
    - "Check alt text, sizing, formats, lazy loading, LCP priority, responsive srcset"
  state_fields:
    - target_url
    - image_count
    - issues_found
---

# /agileflow:seo:images

Analyze image optimization on a page: alt text quality, explicit sizing for CLS prevention, modern formats (WebP/AVIF), lazy loading, LCP image priority, and responsive images.

---

## Quick Reference

```
/agileflow:seo:images https://example.com                    # Image audit for homepage
/agileflow:seo:images https://example.com/products/item       # Product page images
```

---

## Arguments

| Argument | Values | Default | Description |
|----------|--------|---------|-------------|
| URL | Any valid URL | Required | Page to analyze |

---

## Process

### STEP 1: Deploy Image Analyzer

```xml
<invoke name="Task">
<parameter name="description">Image optimization analysis</parameter>
<parameter name="prompt">TASK: Perform comprehensive image optimization analysis.

TARGET URL: {url}

For every image on the page, check:
1. Alt text: Present, descriptive (10-125 chars), not filename-based, not keyword-stuffed
2. Sizing: width and height attributes present (CLS prevention)
3. Format: WebP/AVIF (modern) vs JPEG/PNG (legacy) vs BMP/TIFF (never)
4. Lazy loading: Below-fold images have loading="lazy"
5. LCP priority: Hero/above-fold image has fetchpriority="high"
6. Responsive: srcset and sizes for responsive delivery
7. Decorative: Decorative images correctly use alt=""

Also check for:
- CSS background images (can't have alt text)
- <picture> elements with format fallbacks
- Missing <link rel="preload"> for LCP image

OUTPUT: Image Optimization Score X/100 with per-image findings.</parameter>
<parameter name="subagent_type">seo-analyzer-images</parameter>
</invoke>
```

### STEP 2: Present Results

Show image-by-image findings table and prioritized fixes.

---

## What Gets Checked

| Aspect | Weight | Impact |
|--------|--------|--------|
| Alt text quality | 30% | Accessibility + image search rankings |
| Sizing (CLS) | 20% | Core Web Vitals - layout stability |
| Modern formats | 15% | Page speed + LCP |
| Lazy loading | 15% | Page speed |
| LCP optimization | 10% | Core Web Vitals - largest paint |
| Responsive images | 10% | Mobile performance |

---

<!-- COMPACT_SUMMARY_START -->
## Compact Summary

**Command**: `/agileflow:seo:images` - Image optimization analysis

**Checks**: Alt text, sizing/CLS, WebP/AVIF, lazy loading, LCP priority, responsive srcset

**Usage**: `/agileflow:seo:images URL`
<!-- COMPACT_SUMMARY_END -->
