# Page Workflow — Single Page SEO Analysis

**Triggers:** "analyze this page for SEO", "check the SEO on /about", "deep SEO analysis for this URL", "is this page optimized", "on-page SEO for example.com/product", "why isn't this page ranking"

**Goal:** Perform a deep, scored analysis of a single page across 6 SEO dimensions and produce a report card with specific, actionable recommendations for each dimension.

## Inputs needed

| Input | Required | How to get it                                                                              |
| ----- | -------- | ------------------------------------------------------------------------------------------ |
| URL   | Yes      | Ask: "Which page URL should I analyze?"                                                    |
| focus | No       | Default: all dimensions. Options: on-page, content, technical, schema, images, performance |

## Steps

1. Ask for the URL if not provided. Ask: "Any specific dimension to focus on, or analyze all 6?"

2. Fetch the page. Check HTTP status, response time, and HTTPS. Extract the full HTML.

3. Analyze across the selected dimensions (all 6 by default):

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
   - HTTP status code
   - Response time / TTFB
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

4. Score each dimension 0–100. Use these thresholds: 90+ excellent, 75–89 good, 60–74 needs work, below 60 critical issue.

5. Present the report card:

   ```
   Page: [URL]

   Dimension       Score   Top Issue
   On-Page SEO     84      H1 missing target keyword
   Content         71      Word count below minimum (320 vs 800+)
   Technical       95      —
   Schema          45      Product schema missing price property
   Images          60      6 images missing alt text
   Performance     78      Render-blocking CSS (2 files)

   Overall: 72/100
   ```

6. List specific fixes ordered by impact: [critical issues first, then quick wins, then fine-tuning].

7. Ask: [A] Fix the top issue now, [B] Compare this page against a competitor URL, [C] Run the full site audit to see site-wide patterns.

## Output

Per-dimension scores (0–100) with specific findings. Prioritized fix list. Overall page score. Actionable recommendations for each issue found.

## Fallbacks

**If interactive prompts (AskUserQuestion) are unavailable:**
Present options as a numbered list in your response. Ask the user to reply with a number. Example:

```
How would you like to proceed?
1. Save and continue
2. Review before saving
3. Discard
```
