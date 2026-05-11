# Audit Workflow — Full Website SEO Audit

**Triggers:** "run an SEO audit", "audit my website for SEO", "what are my SEO issues", "SEO health score", "check SEO for example.com", "full SEO review"

**Goal:** Deploy 6 SEO analyzers in parallel against a website, synthesize results into a weighted health score (0–100), and produce a prioritized action plan with specific, actionable fixes.

## Inputs needed

| Input     | Required | How to get it                                                         |
| --------- | -------- | --------------------------------------------------------------------- |
| URL       | Yes      | Ask for it if not provided                                            |
| site type | No       | Auto-detect from homepage, or already captured in opening flow        |
| context   | No       | Traffic level, recent changes, target keywords — ask conversationally |

## Steps

1. **If URL is not provided**, ask: _"What's the URL? I'll fetch your site and start the analysis."_ Accept homepage or any page. Don't offer fake options for this — just ask for the URL.

2. **Gather context** (2-3 questions, conversational not interrogation):
   - _"Roughly how much organic traffic does the site get per month? And have you made any big changes recently — migration, redesign, new CMS?"_ — traffic level affects prioritization, recent changes are the #1 cause of drops
   - If they have target keywords: _"Any specific pages or keywords you want me to focus on?"_
   - Skip these if they already answered in the opening flow

3. **Fetch the homepage** to detect site type (e-commerce, SaaS, local business, publisher, etc.) if not already known. Also fetch `robots.txt` and `sitemap.xml`.

4. **Deploy all 6 analyzers simultaneously** — default to quick depth, no need to ask:
   - **Technical** — crawlability, indexability, HTTPS, redirects, canonical tags, mobile viewport, Core Web Vitals indicators
   - **Content** — title tags, meta descriptions, heading structure, content quality, E-E-A-T signals, word count by page type
   - **Schema** — structured data presence, correct schema types for detected business type, markup validity
   - **Performance** — page speed signals, LCP, CLS, FID, render-blocking resources
   - **Images** — alt text coverage, file sizes, next-gen formats (WebP/AVIF), lazy loading
   - **Sitemap** — presence, coverage, freshness, consistency with robots.txt

5. **Apply business-type-specific benchmarks.** E-commerce needs Product schema; local business needs LocalBusiness schema; publisher needs Article schema and E-E-A-T signals.

6. **Weighted scoring:** Technical 20%, Content 20%, Schema 15%, Performance 15%, Images 15%, Sitemap 15%.

7. **Present the SEO Health Score (0–100)** with category breakdown:

   ```
   Site: example.com
   Business type: SaaS

   Category       Score   Top Issue
   Technical       61      12 pages missing canonical tags
   Content         74      Meta descriptions missing on 8 pages
   Schema          45      No structured data found — rich results blocked
   Performance     82      LCP 3.1s — above 2.5s threshold
   Images          58      31 images missing alt text
   Sitemap         90      —

   Overall: 68/100 — needs work
   ```

8. **Prioritized action plan:**
   - **P0** (score < 60 or blocking issue): Fix immediately — indexing, canonical, noindex errors
   - **P1** (quick wins): High ROI, low effort — missing schema, alt text, meta descriptions
   - **P2** (structural): Performance, content depth, E-E-A-T signals
   - **P3** (fine-tuning): Sitemap freshness, internal linking optimization

9. **Guide next step with AskUserQuestion** — make it specific to actual findings:

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "Audit complete. {site} scored {X}/100 — {critical} critical issues, {high} high. Biggest blocker: {top_issue}.",
  "header": "What to tackle",
  "multiSelect": false,
  "options": [
    {"label": "Fix {top_p0_issue} now (Recommended)", "description": "{specific fix + expected impact, e.g. 'Add canonical tags to 12 pages — prevents Google from choosing the wrong version to rank'}"},
    {"label": "Generate {missing_schema_type} JSON-LD markup", "description": "I'll produce copy-paste structured data for your {page_type} — takes 2 minutes to add"},
    {"label": "Deep-dive into {lowest_category} ({score}/100)", "description": "Worst area — I'll give you implementation-ready fixes for every finding"},
    {"label": "Analyze a specific page in depth", "description": "6-dimension report card on your most important page — homepage, pricing, or top landing page"}
  ]
}]</parameter>
</invoke>
```

Customize every option — don't show schema option if schema scored 90+. Don't show the page analysis if they specifically said they want site-wide fixes.

## Output

SEO Health Score (0–100) with per-category scores. Prioritized action plan (P0–P3). Business-type-specific recommendations. Baseline for tracking improvement over time.

## Fallbacks

**If AskUserQuestion is unavailable:**
Present options as a numbered list. Example:

```
What would you like to tackle first?
1. Fix the P0 issues now
2. Generate missing schema markup
3. Deep-dive into the lowest-scoring category
```

**If agent spawning is unavailable:**
Run each analysis inline sequentially using the reference files in `references/`. Consolidate into the same output format — same result, just slower.
