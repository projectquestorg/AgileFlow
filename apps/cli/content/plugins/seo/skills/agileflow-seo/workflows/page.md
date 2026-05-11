# Page Workflow — Single Page SEO Analysis

**Triggers:** "analyze this page for SEO", "check the SEO on /about", "deep SEO analysis for this URL", "is this page optimized", "on-page SEO for example.com/product", "why isn't this page ranking"

**Goal:** Deep, scored analysis of a single page across 6 SEO dimensions — produces a report card with specific, copy-paste-ready fixes ordered by impact.

## Inputs needed

| Input          | Required | How to get it                                                                                                 |
| -------------- | -------- | ------------------------------------------------------------------------------------------------------------- |
| URL            | Yes      | Ask for it if not provided                                                                                    |
| target keyword | No       | Ask: "What keyword are you trying to rank this page for?" — changes relevance scoring                         |
| context        | No       | "Why are you analyzing this page?" — surfaces whether it's a ranking drop, pre-launch review, or optimization |

## Steps

1. **If URL is not provided**, ask: _"Which page URL should I analyze?"_ If they say the page isn't ranking, also ask: _"What keyword are you trying to rank it for?"_ — this context changes every recommendation.

2. **Fetch the page.** Check HTTP status, response time, HTTPS. Extract full HTML. If the page returns non-200, diagnose the status code issue before proceeding.

3. **Analyze all 6 dimensions:**

   **On-Page SEO**
   - Title tag: present? 30–60 chars? keyword-forward? unique?
   - Meta description: present? 120–160 chars? has CTA?
   - H1: exactly 1? contains target keyword?
   - H2–H6: logical hierarchy, no skipped levels?
   - Internal links: 2–10 per page, descriptive anchors?
   - URL: clean, short, keyword-relevant?
   - Canonical: self-referencing or correct target?
   - Open Graph: og:title, og:description, og:image all present?

   **Content Quality**
   - Word count vs page type minimum (homepage: 300+, blog: 800+, product: 500+)
   - Content uniqueness — not boilerplate
   - Readability level appropriate for audience
   - E-E-A-T signals: author attribution, expertise indicators, trust signals
   - AI citation readiness: 134–167 word structured blocks

   **Technical**
   - HTTP status code and response time / TTFB
   - Mobile viewport configured
   - Robots directives (index/noindex)
   - Structured data presence

   **Schema Markup**
   - Correct schema type for page content
   - Required properties present
   - No validation errors
   - Matches visible page content

   **Images**
   - Alt text present on all meaningful images
   - File sizes reasonable (< 200KB for hero images)
   - Next-gen formats (WebP/AVIF)
   - Lazy loading on below-fold images
   - Responsive image attributes

   **Performance**
   - Core Web Vitals indicators from page source
   - Render-blocking resources
   - Unminified JS/CSS
   - Missing compression signals

4. **Score each dimension 0–100.** Thresholds: 90+ excellent, 75–89 good, 60–74 needs work, below 60 critical.

5. **Present the report card:**

   ```
   Page: example.com/pricing
   Target keyword: project management software

   Dimension       Score   Top Issue
   On-Page SEO     84      H1 missing target keyword
   Content         71      Word count below minimum (320 vs 800+)
   Technical       95      —
   Schema          45      Product schema missing price property
   Images          60      6 images missing alt text
   Performance     78      Render-blocking CSS (2 files)

   Overall: 72/100
   ```

6. **List specific fixes ordered by impact** — critical issues first, then quick wins, then fine-tuning. For each fix, include the exact change needed (not just "fix the H1" — say "Change H1 from 'Our Pricing Plans' to 'Project Management Software — Pricing'").

7. **Guide next step with AskUserQuestion:**

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "{page} scored {X}/100. {top_issue} is the biggest drag. Here's what to fix first:",
  "header": "Next action",
  "multiSelect": false,
  "options": [
    {"label": "Fix {top_issue} now (Recommended)", "description": "{exact change needed + expected impact}"},
    {"label": "Generate {missing_schema_type} schema for this page", "description": "I'll produce ready-to-use JSON-LD — copy it into your <head>"},
    {"label": "Compare this page against a ranking competitor", "description": "Find a competitor ranking for {target_keyword} — I'll show you the gap"},
    {"label": "Run full site audit to see site-wide patterns", "description": "Check if these issues affect other pages too — full health score for the whole domain"}
  ]
}]</parameter>
</invoke>
```

## Output

Per-dimension scores (0–100) with specific findings. Prioritized fix list with exact changes. Overall page score. If target keyword was provided, keyword-specific recommendations.

## Fallbacks

**If AskUserQuestion is unavailable:**
Present options as a numbered list. Example:

```
What would you like to do next?
1. Fix the top issue now
2. Generate schema markup for this page
3. Run a full site audit
```
