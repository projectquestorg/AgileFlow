# Audit Workflow — Full Website SEO Audit

**Triggers:** "run an SEO audit", "audit my website for SEO", "what are my SEO issues", "SEO health score", "check SEO for example.com", "full SEO review"

**Goal:** Deploy 6 SEO analyzers in parallel against a website, synthesize results into a weighted health score (0–100), and produce a prioritized action plan.

## Inputs needed

| Input     | Required | How to get it                            |
| --------- | -------- | ---------------------------------------- |
| URL       | Yes      | Ask: "Which website URL should I audit?" |
| depth     | No       | Default: quick. Options: quick, deep     |
| max pages | No       | Default: 50                              |

## Steps

1. Ask for the URL if not provided.

2. Fetch the homepage to detect the business type (e-commerce, B2B SaaS, local services, publisher, portfolio, etc.). Also fetch `robots.txt` and `sitemap.xml`.

3. Ask: "Depth?" Options: [A] Quick — 6 analyzers, standard depth, fast results (recommended), [B] Deep — more thorough checks per analyzer.

4. Deploy all 6 analyzers simultaneously:
   - **Technical analyzer** — crawlability, indexability, HTTPS, redirects, canonical tags, Core Web Vitals indicators, mobile viewport
   - **Content analyzer** — title tags, meta descriptions, heading structure, content quality, E-E-A-T signals, word count by page type
   - **Schema analyzer** — structured data presence, correct schema types for business type, markup validity
   - **Performance analyzer** — page speed signals, LCP, CLS, FID, render-blocking resources
   - **Images analyzer** — alt text coverage, file sizes, next-gen formats, lazy loading
   - **Sitemap analyzer** — sitemap presence, coverage, freshness, robots.txt consistency

5. Collect all outputs. Apply weighted scoring: Technical 20%, Content 20%, Schema 15%, Performance 15%, Images 15%, Sitemap 15%.

6. Apply business-type-specific benchmarks. An e-commerce site needs Product schema; a local business needs LocalBusiness schema; a publisher needs Article schema.

7. Generate the SEO Health Score (0–100) with category breakdown and prioritized action plan:
   - **P0** (0–59 score): Blocking issues — fix immediately
   - **P1** (60–74): High-impact improvements
   - **P2** (75–89): Medium-impact optimizations
   - **P3** (90–100): Fine-tuning

8. Ask: [A] Walk me through fixing the P0 issues, [B] Analyze a specific page in depth (use the page analysis workflow), [C] Show full findings per analyzer, [D] Save the audit report.

## Output

SEO Health Score (0–100) with weighted category scores. Prioritized action plan. Business-type-specific recommendations. Baseline for tracking improvement over time.

## Fallbacks

**If interactive prompts (AskUserQuestion) are unavailable:**
Present options as a numbered list in your response. Ask the user to reply with a number. Example:

```
How would you like to proceed?
1. Fix the P0 findings now
2. Review full findings first
3. Export report only
```

**If agent spawning (Task tool / multi-agent) is unavailable:**
Perform each analysis inline and sequentially instead of spawning parallel agents.
Work through the key checks for each domain yourself using the reference files in `references/`.
Consolidate findings into the same structured output format — the user gets the same result, just slower.
