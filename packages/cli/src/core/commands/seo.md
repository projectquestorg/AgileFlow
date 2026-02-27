---
description: SEO analysis toolkit - comprehensive website audits, page analysis, schema validation, AI search optimization, and more
argument-hint: "[subcommand] [URL]"
compact_context:
  priority: medium
  preserve_rules:
    - "ACTIVE COMMAND: /agileflow:seo - SEO analysis router"
    - "Route to the appropriate sub-command based on user intent"
    - "If no sub-command specified, show the quick reference guide"
  state_fields:
    - subcommand
    - target_url
---

# /agileflow:seo

SEO analysis toolkit for comprehensive website optimization. Routes to specialized sub-commands.

---

## Quick Reference

```
/agileflow:seo:audit https://example.com                  # Full site audit (6 parallel analyzers)
/agileflow:seo:page https://example.com/about              # Single page deep analysis
/agileflow:seo:schema https://example.com                  # Schema/structured data validation
/agileflow:seo:geo https://example.com                     # AI search optimization (GEO)
/agileflow:seo:technical https://example.com               # Technical SEO deep-dive
/agileflow:seo:content https://example.com                 # E-E-A-T & content quality
/agileflow:seo:images https://example.com                  # Image optimization analysis
/agileflow:seo:sitemap https://example.com                 # Sitemap validation
/agileflow:seo:hreflang https://example.com                # Multi-language SEO
/agileflow:seo:plan https://example.com                    # Strategic SEO planning
/agileflow:seo:programmatic https://example.com            # Programmatic SEO quality gates
/agileflow:seo:competitor https://example.com              # Competitor comparison pages
```

---

## Sub-Commands

| Command | Purpose | When to Use |
|---------|---------|-------------|
| **audit** | Full site audit with health score | Starting point for any site |
| **page** | Single page analysis (6 dimensions) | Optimize a specific page |
| **schema** | Structured data validation + generation | Rich results optimization |
| **geo** | AI search platform optimization | Optimize for ChatGPT, AI Overviews |
| **technical** | Crawlability, indexing, security | Technical foundation issues |
| **content** | E-E-A-T scoring + content quality | Content strategy improvement |
| **images** | Alt text, sizing, formats, lazy loading | Image-heavy pages |
| **sitemap** | XML sitemap validation | Crawl coverage concerns |
| **hreflang** | Multi-language/region SEO | International sites |
| **plan** | Strategic SEO roadmap | Planning SEO improvements |
| **programmatic** | Bulk page quality gates | Programmatic SEO at scale |
| **competitor** | Comparison page generation | Competitive positioning |

---

## Routing Logic

If the user provides a URL without a sub-command, determine intent:

1. **"audit my site"** → `/agileflow:seo:audit`
2. **"check this page"** → `/agileflow:seo:page`
3. **"structured data" / "schema" / "JSON-LD"** → `/agileflow:seo:schema`
4. **"AI search" / "GEO" / "ChatGPT"** → `/agileflow:seo:geo`
5. **"technical" / "crawl" / "robots"** → `/agileflow:seo:technical`
6. **"content quality" / "E-E-A-T"** → `/agileflow:seo:content`
7. **"images" / "alt text"** → `/agileflow:seo:images`
8. **"sitemap"** → `/agileflow:seo:sitemap`
9. **"international" / "hreflang" / "languages"** → `/agileflow:seo:hreflang`
10. **"strategy" / "plan" / "roadmap"** → `/agileflow:seo:plan`
11. **Unclear** → Show the quick reference and ask which analysis they want

---

## If No Sub-Command Specified

Show the quick reference table above and ask:

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "Which SEO analysis would you like to run?",
  "header": "SEO Analysis",
  "multiSelect": false,
  "options": [
    {"label": "Full site audit (Recommended)", "description": "Comprehensive 6-analyzer audit with health score 0-100"},
    {"label": "Single page analysis", "description": "Deep-dive into one specific page across 6 dimensions"},
    {"label": "Schema validation", "description": "Check structured data, flag deprecated types, generate JSON-LD"},
    {"label": "AI search optimization (GEO)", "description": "Optimize for ChatGPT, AI Overviews, Perplexity"}
  ]
}]</parameter>
</invoke>
```

---

<!-- COMPACT_SUMMARY_START -->
## Compact Summary

**Command**: `/agileflow:seo` - SEO analysis router

**Sub-commands**: audit, page, schema, geo, technical, content, images, sitemap, hreflang, plan, programmatic, competitor

**Quick start**: `/agileflow:seo:audit https://example.com` for full analysis
<!-- COMPACT_SUMMARY_END -->
