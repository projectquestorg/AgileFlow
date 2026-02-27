---
description: Multi-language SEO validation - hreflang tag correctness, reciprocity checks, language code validation, and international targeting
argument-hint: "URL"
compact_context:
  priority: medium
  preserve_rules:
    - "ACTIVE COMMAND: /agileflow:seo:hreflang - Multi-language SEO"
    - "Check hreflang tags, reciprocity, language codes, x-default"
    - "Verify all language versions reference each other"
  state_fields:
    - target_url
    - languages_found
    - reciprocity_issues
---

# /agileflow:seo:hreflang

Validate multi-language SEO implementation: hreflang tags, reciprocity, language codes, x-default, and international targeting.

---

## Quick Reference

```
/agileflow:seo:hreflang https://example.com                  # Check hreflang implementation
/agileflow:seo:hreflang https://example.com/es/              # Check from Spanish version
```

---

## Arguments

| Argument | Values | Default | Description |
|----------|--------|---------|-------------|
| URL | Any valid URL | Required | Page to check hreflang |

---

## What Gets Checked

### 1. Hreflang Tag Detection

Look for hreflang in three possible locations:
- HTML `<head>`: `<link rel="alternate" hreflang="es" href="...">`
- HTTP headers: `Link: <...>; rel="alternate"; hreflang="es"`
- XML sitemap: `<xhtml:link rel="alternate" hreflang="es" href="..."/>`

### 2. Validation Rules

| Rule | Check | Common Error |
|------|-------|-------------|
| **Valid language codes** | ISO 639-1 (2-letter) | "eng" instead of "en" |
| **Valid region codes** | ISO 3166-1 (2-letter) | "uk" instead of "gb" |
| **x-default present** | Fallback for unmatched | Missing x-default |
| **Self-referencing** | Page includes itself | Missing self-reference |
| **Reciprocity** | A→B means B→A | One-way hreflang |
| **Consistent URLs** | Match canonical | hreflang to non-canonical |
| **Absolute URLs** | Full https:// URLs | Relative paths |
| **Return 200** | All hreflang URLs live | 404 or redirect targets |

### 3. Reciprocity Check

For each language version:
1. Fetch the page
2. Check that it links back to all other versions
3. Flag any broken reciprocity chains

```
Page A (en) → B (es), C (fr)
Page B (es) → A (en), C (fr)  ← Must reference A and C
Page C (fr) → A (en), B (es)  ← Must reference A and B
```

### 4. Common Issues

| Issue | Severity | Fix |
|-------|----------|-----|
| Missing x-default | HIGH | Add x-default pointing to canonical version |
| Broken reciprocity | HIGH | Ensure all versions reference each other |
| Invalid language code | MEDIUM | Use ISO 639-1 codes |
| hreflang to redirect | MEDIUM | Point to final destination URL |
| hreflang to noindex | HIGH | Don't noindex alternate versions |
| Mixed implementation | LOW | Use one method consistently |

---

## Process

### STEP 1: Fetch the Target Page

Use WebFetch to retrieve the page. Extract hreflang tags from HTML head.

### STEP 2: Map All Language Versions

Build a matrix of all language versions and their hreflang references.

### STEP 3: Verify Reciprocity

Fetch each alternate version and verify it references back to all other versions.

### STEP 4: Output Report

```markdown
# Hreflang Analysis: {URL}

## Language Versions Found

| Language | Region | URL | Status |
|----------|--------|-----|--------|
| en | - | https://example.com/ | 200 |
| es | - | https://example.com/es/ | 200 |
| fr | FR | https://example.com/fr/ | 200 |
| x-default | - | https://example.com/ | 200 |

## Reciprocity Matrix

| Page | → en | → es | → fr | → x-default |
|------|------|------|------|-------------|
| /en/ | self | yes | yes | yes |
| /es/ | yes | self | NO | yes |
| /fr/ | yes | yes | self | yes |

## Issues Found

[Detailed findings]

## Hreflang Score: X/100
```

---

<!-- COMPACT_SUMMARY_START -->
## Compact Summary

**Command**: `/agileflow:seo:hreflang` - Multi-language SEO validation

**Checks**: hreflang tags, reciprocity, language codes, x-default, canonical consistency

**Usage**: `/agileflow:seo:hreflang URL`
<!-- COMPACT_SUMMARY_END -->
