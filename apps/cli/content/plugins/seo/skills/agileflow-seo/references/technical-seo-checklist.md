# Technical SEO Checklist

**Load this when:** Auditing technical SEO, diagnosing crawl or indexation issues, or building an SEO-ready site.

## Crawlability

- [ ] `robots.txt` exists at `/robots.txt` and is valid
- [ ] `robots.txt` does not block important resources (CSS, JS, images)
- [ ] No `noindex` directives on pages that should be indexed
- [ ] No `Disallow: /` in production `robots.txt` (common staging leftover)
- [ ] Internal links use crawlable `<a href>` tags (not JS-only navigation)
- [ ] No crawl traps: infinite pagination, session ID URLs, calendar archives
- [ ] Site crawl depth: important pages reachable within 3 clicks from homepage

### robots.txt format

```
User-agent: *
Disallow: /admin/
Disallow: /api/
Allow: /api/public/

User-agent: Googlebot
Disallow: /staging/

Sitemap: https://example.com/sitemap.xml
```

---

## Indexation

- [ ] XML sitemap exists and submitted to Google Search Console
- [ ] Sitemap includes only canonical, indexable URLs
- [ ] Sitemap excludes 404s, 301s, and `noindex` pages
- [ ] Sitemap updated automatically on content publish
- [ ] `<link rel="canonical">` on every page pointing to the preferred URL
- [ ] No duplicate content from `www` vs. non-`www` (redirect to one)
- [ ] No duplicate content from `http` vs. `https` (redirect to HTTPS)
- [ ] No duplicate content from trailing slash vs. no trailing slash

### Canonical tag format

```html
<link rel="canonical" href="https://example.com/page/" />
```

---

## URL Structure

| Best practice                | Rule                                                           |
| ---------------------------- | -------------------------------------------------------------- |
| Use hyphens, not underscores | `/my-page` not `/my_page`                                      |
| Lowercase only               | `/about` not `/About`                                          |
| Short and descriptive        | `/blog/seo-guide` not `/blog/post-123-seo-guide-for-beginners` |
| Include keyword              | `/blog/technical-seo-checklist`                                |
| No stop words                | Avoid "a", "the", "and" where possible                         |
| Consistent trailing slash    | Pick one, redirect the other, use canonical                    |

---

## HTTPS and Security

- [ ] Site fully on HTTPS with valid certificate
- [ ] No mixed content (HTTP resources on HTTPS pages)
- [ ] HSTS header set
- [ ] Certificate is not expiring within 30 days
- [ ] HTTPS redirect chain is a single 301 (not 301 → 301 → 200)

---

## Page Speed (Technical SEO Impact)

- [ ] Core Web Vitals passing (LCP <2.5s, INP <200ms, CLS <0.1)
- [ ] Time to First Byte (TTFB) <800ms
- [ ] Server-side or edge caching for static/semi-static pages
- [ ] Images lazy-loaded, correctly sized
- [ ] `<link rel="preload">` on LCP element (hero image, critical font)
- [ ] No render-blocking scripts in `<head>` without `async` or `defer`

---

## Mobile

- [ ] Responsive design (passes Google Mobile-Friendly Test)
- [ ] Viewport meta tag: `<meta name="viewport" content="width=device-width, initial-scale=1">`
- [ ] Tap targets ≥48px
- [ ] Font size ≥16px for body text
- [ ] No horizontal scroll on mobile
- [ ] Mobile and desktop serve same content (no mobile-only exclusions)

---

## Structured Data

- [ ] `Organization` schema on homepage
- [ ] `WebSite` schema with `SearchAction` for sitelinks search box
- [ ] `Article` / `BlogPosting` schema on blog posts
- [ ] `Product` / `Offer` schema on product pages
- [ ] `FAQPage` schema on FAQ sections
- [ ] `BreadcrumbList` schema on deep pages
- [ ] No schema errors (validate at schema.org/validator or Rich Results Test)

---

## International SEO

- [ ] `hreflang` tags for multilingual content
- [ ] `hreflang` includes `x-default` for fallback
- [ ] Language codes are ISO 639-1 (e.g., `en`, `fr`, not `english`)
- [ ] Regional targeting set in Google Search Console per property

---

## Redirects

| Rule                                | Requirement                      |
| ----------------------------------- | -------------------------------- |
| Use 301 for permanent moves         | Not 302 (temporary)              |
| No redirect chains >2 hops          | A → B → C should be A → C        |
| No redirect loops                   | A → B → A                        |
| 404s on truly gone pages            | Don't 301 to homepage            |
| Verify old URL equity passes to new | Check crawl tool after migration |

---

## Core Technical SEO Monitoring

| What to monitor         | Tool                    | Frequency    |
| ----------------------- | ----------------------- | ------------ |
| Crawl errors            | Google Search Console   | Weekly       |
| Index coverage          | Google Search Console   | Weekly       |
| Core Web Vitals (field) | CrUX / GSC              | Monthly      |
| Sitemap errors          | GSC / crawl tool        | Monthly      |
| Broken internal links   | Screaming Frog / Ahrefs | Monthly      |
| New 404s                | GSC                     | Weekly       |
| Soft 404s               | GSC                     | Monthly      |
| Manual actions          | GSC                     | Weekly alert |
