---
name: agileflow-seo
version: 1.2.0
category: agileflow/seo
description: |
  Use when the user wants to audit, improve, or plan SEO for a website:
  technical SEO, Core Web Vitals, structured data, content quality,
  sitemap, images, international SEO, or competitor analysis.
triggers:
  keywords:
    - seo
    - search engine
    - google ranking
    - core web vitals
    - structured data
    - schema markup
    - sitemap
    - meta tags
    - page speed
    - crawlability
    - indexability
    - seo audit
    - hreflang
    - international seo
    - organic traffic
    - search rankings
    - rich results
    - lcp
    - cls
    - inp
  priority: 55
provides:
  agents: []
learns:
  enabled: true
  file: _learnings/seo.yaml
  maxEntries: 30
depends:
  skills: []
  plugins: [seo]
---

# AgileFlow SEO

Full-stack SEO audit and optimization assistant. Covers technical crawlability, Core Web Vitals, structured data, content quality, image optimization, and international SEO — with actionable fixes mapped to Google's documentation.

## When this skill activates

- User mentions SEO, search rankings, or organic traffic
- User asks about Core Web Vitals (LCP, INP, CLS)
- User wants to add or fix structured data / schema markup
- User asks about sitemap, robots.txt, or crawlability
- User wants to optimize images or improve page speed
- User is expanding to international markets (hreflang)
- User says their site "isn't getting traffic" or "doesn't rank"

## Opening discovery flow

**When invoked without a clear request, run this before doing anything else.** One smart question covers goal + site context simultaneously. Don't split into multiple question blocks.

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[
  {
    "question": "What are you trying to fix or improve with your SEO?",
    "header": "What's the goal?",
    "multiSelect": false,
    "options": [
      {"label": "Full site audit — show me everything (Recommended)", "description": "6-analyzer sweep → health score 0-100, prioritized findings. Best starting point if you haven't audited before."},
      {"label": "My site is slow or failing Core Web Vitals", "description": "LCP, INP, CLS analysis with specific resource-level fixes — I'll look at what's actually blocking paint"},
      {"label": "My pages aren't showing up in Google / getting indexed", "description": "Technical SEO: robots.txt, canonicals, noindex flags, sitemap coverage, redirect chains"},
      {"label": "I want to rank for specific keywords / improve content", "description": "E-E-A-T content quality, heading structure, content depth — page-by-page or site-wide"},
      {"label": "I want rich results (stars, FAQs, products) in Google", "description": "Schema markup validation + I'll generate ready-to-use JSON-LD for your page type"},
      {"label": "I'm expanding to other countries / languages", "description": "hreflang implementation, geo-targeting, language-specific content strategy"},
      {"label": "Analyze a specific page or blog post", "description": "Deep 6-dimension report card on a single URL — on-page, content, technical, schema, images, performance"}
    ]
  },
  {
    "question": "What type of site is it?",
    "header": "Site type",
    "multiSelect": false,
    "options": [
      {"label": "SaaS / Software product", "description": "Login, pricing, docs — I'll tune for SaaS: trial CTAs, feature page schema, dev docs indexing"},
      {"label": "E-commerce / online store", "description": "Products, categories, checkout — Product schema, Core Web Vitals are critical, filter page handling"},
      {"label": "Local business / service area", "description": "Physical location or service area — LocalBusiness schema, NAP consistency, Google Business signals"},
      {"label": "Blog / content publisher", "description": "Articles, guides, news — E-E-A-T signals, Article schema, content freshness, topical authority"},
      {"label": "Agency / professional services / portfolio", "description": "Services, team, case studies — expertise signals, Service schema, trust factors"},
      {"label": "Not sure yet / general website", "description": "I'll detect your site type from the URL and apply relevant benchmarks"}
    ]
  }
]</parameter>
</invoke>
```

**After they answer, ask for the URL directly** — don't make them choose between "homepage URL" and "specific page URL" as fake options. Just say: _"What's the URL? I'll fetch it and start the analysis."_

If they say they don't have a live URL: discuss strategy or review their code/content instead.

## Context to gather for deeper analysis

For anything beyond a quick single-page check, also ask these before running analyzers. Bundle into the initial conversation, not a third separate AskUserQuestion block:

| Context                                              | Why it matters                                                     |
| ---------------------------------------------------- | ------------------------------------------------------------------ |
| Monthly organic traffic (approx)                     | Helps prioritize — traffic loss is P0, growth optimization is P2   |
| Current top-ranking pages or target keywords         | Focuses audit on what actually matters to their business           |
| Recent site changes (migrations, redesigns, new CMS) | Migrations cause 80% of sudden ranking drops                       |
| Tech stack / CMS                                     | Next.js, WordPress, Shopify — affects which fixes are easy vs hard |
| Competitor URLs (optional)                           | Enables gap analysis in content + schema                           |

Ask naturally: _"A few quick context questions before I start — what's your rough monthly organic traffic, and have you made any big site changes recently (migration, redesign, new platform)?"_

## Routing by goal

| Goal selected             | Route                                                                      |
| ------------------------- | -------------------------------------------------------------------------- |
| Full audit                | Fetch URL → `/agileflow:seo:audit URL`                                     |
| Slow / CWV                | Fetch URL → `/agileflow:seo:performance URL` + `/agileflow:seo:images URL` |
| Not indexed / crawled     | Fetch URL → `/agileflow:seo:technical URL FOCUS=crawl`                     |
| Content / keyword ranking | Ask target keyword first → `/agileflow:seo:content URL TYPE={site_type}`   |
| Rich results / schema     | Fetch URL → `/agileflow:seo:schema URL GENERATE=true`                      |
| International SEO         | Ask target countries first → `/agileflow:seo:hreflang URL`                 |
| Single page analysis      | Fetch URL → `/agileflow:seo:page URL`                                      |

## After every analysis — always guide the next step

Never dump findings without guidance. After any command completes, present next steps with AskUserQuestion. Make the recommendation specific to what was actually found:

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "{Command} done. {site} scored {X}/100 — {N} findings: {critical} critical, {high} high. Biggest blocker: {top_finding}.",
  "header": "What to tackle first",
  "multiSelect": false,
  "options": [
    {"label": "Fix {top_critical_issue} now (Recommended)", "description": "{specific fix with expected impact — e.g., 'Adding missing canonical tags — affects 23 pages, prevents duplicate content penalties'}"},
    {"label": "Deep-dive into {lowest_scoring_category} ({score}/100)", "description": "Worst-scoring area — I'll give you implementation-ready fixes for every issue"},
    {"label": "Generate {missing_schema_type} schema markup", "description": "I'll produce copy-paste JSON-LD matched to your {site_type} — no manual work"},
    {"label": "Run full site audit for complete picture", "description": "You've seen one dimension — /agileflow:seo:audit covers all 6 and gives an overall health score"},
    {"label": "Analyze a competitor for gap comparison", "description": "See what {ranking competitor} is doing that you're not — schema, content structure, CWV"}
  ]
}]</parameter>
</invoke>
```

**Customize every option** based on actual findings. Don't show "Generate schema markup" if they already have perfect schema. Don't show "Full audit" if they just ran it.

## Key principles — apply these throughout

1. **Critical issues before everything else** — a noindex on the homepage outranks every other finding. P0 issues get fixed before P2 optimizations are even mentioned.
2. **Field data beats lab data** — Google uses CrUX (real user data). If CWV looks good in lab but fails in field, field is what matters.
3. **Mobile-first always** — Google indexes the mobile version. Desktop-only fixes are worth mentioning but not prioritizing.
4. **Schema creates opportunity, not traffic** — schema alone won't rank you; it enables rich results when you already rank. Don't oversell it.
5. **E-E-A-T matters most for YMYL** — health, finance, legal pages need strong author signals, expertise indicators, and trust signals. For a blog about recipes, E-E-A-T is lower priority.
6. **Recent changes = first suspect** — if rankings dropped recently, ask about migrations, redesigns, URL changes, or CMS switches before running any analyzers. That's the most common root cause.

## References

Load these when you need deeper knowledge for the relevant task:

| File                                    | When to load                                                                                                             |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `references/cwv-thresholds.md`          | Evaluating Core Web Vitals — LCP/INP/CLS thresholds, field vs lab data, common fixes per metric                          |
| `references/eeat-framework.md`          | Reviewing content quality — E-E-A-T signals per content type, YMYL requirements                                          |
| `references/schema-types.md`            | Recommending or generating schema markup — which type for which site, JSON-LD templates, Google's supported rich results |
| `references/technical-seo-checklist.md` | Deep technical audits — crawl budget, redirect chains, canonical logic, hreflang syntax                                  |
| `references/keyword-research-guide.md`  | Keyword strategy, search intent matching, gap analysis                                                                   |

## Workflows

Follow these step-by-step when the user initiates the matching action:

| File                 | When to follow                                                                                               |
| -------------------- | ------------------------------------------------------------------------------------------------------------ |
| `workflows/audit.md` | Full site SEO audit — gathers context, runs all 6 analyzers, presents health score + prioritized action plan |
| `workflows/page.md`  | Single-page analysis — deep 6-dimension report card for a specific URL                                       |
