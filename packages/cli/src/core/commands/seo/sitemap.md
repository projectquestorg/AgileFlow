---
description: XML sitemap validation, URL coverage analysis, quality gate enforcement, and sitemap generation assistance
argument-hint: "URL [GENERATE=true]"
compact_context:
  priority: medium
  preserve_rules:
    - "ACTIVE COMMAND: /agileflow:seo:sitemap - Sitemap validation"
    - "Deploy seo-analyzer-sitemap for comprehensive sitemap audit"
    - "Check existence, structure, coverage, quality gates"
    - "If GENERATE=true, help create or fix the sitemap"
  state_fields:
    - target_url
    - generate
    - sitemap_found
---

# /agileflow:seo:sitemap

Validate XML sitemap structure, assess URL coverage, enforce quality gates, and optionally generate or fix sitemaps.

---

## Quick Reference

```
/agileflow:seo:sitemap https://example.com                   # Validate existing sitemap
/agileflow:seo:sitemap https://example.com GENERATE=true      # Also generate improvements
```

---

## Arguments

| Argument | Values | Default | Description |
|----------|--------|---------|-------------|
| URL | Any valid URL (domain) | Required | Site to analyze |
| GENERATE | true, false | false | Generate or fix sitemap XML |

---

## Process

### STEP 1: Deploy Sitemap Analyzer

```xml
<invoke name="Task">
<parameter name="description">Sitemap validation analysis</parameter>
<parameter name="prompt">TASK: Validate XML sitemap comprehensively.

TARGET URL: {url}

Check:
1. Locate sitemap: robots.txt Sitemap: directive, /sitemap.xml, /sitemap_index.xml
2. Structure: Valid XML, correct namespace, proper elements
3. URL quality: Status codes, canonical match, not noindexed, HTTPS
4. Coverage: Important pages included, no orphans
5. Quality: lastmod dates present and valid, under 50k URLs / 50MB
6. robots.txt: Sitemap declared in robots.txt

Quality gates:
- Non-200 URLs: Warning >5%, Critical >15%
- Missing lastmod: Warning >20%, Critical >50%
- Stale lastmod (>1 year): Warning >30%, Critical >60%
- Duplicate URLs: Any = Warning

OUTPUT: Sitemap Score X/100 with detailed findings.</parameter>
<parameter name="subagent_type">seo-analyzer-sitemap</parameter>
</invoke>
```

### STEP 2: Present Results and Optionally Generate

If GENERATE=true and issues found, help create a corrected sitemap or generate one from scratch based on discovered pages.

---

## Quality Gates

| Metric | Warning | Critical |
|--------|---------|----------|
| Non-200 URLs | > 5% | > 15% |
| Missing lastmod | > 20% | > 50% |
| Stale lastmod | > 30% | > 60% |
| Not in robots.txt | Always | - |
| No sitemap at all | - | Always |

---

<!-- COMPACT_SUMMARY_START -->
## Compact Summary

**Command**: `/agileflow:seo:sitemap` - XML sitemap validation

**Checks**: Existence, XML structure, URL coverage, lastmod quality, robots.txt reference

**Usage**: `/agileflow:seo:sitemap URL [GENERATE=true]`
<!-- COMPACT_SUMMARY_END -->
