# AgileFlow Docs Site: SEO Improvement Ideas

**Date**: 2026-01-19
**Site**: https://agileflow.dev (Next.js 15 + Fumadocs)
**Current Status**: Basic SEO implemented, opportunities for enhancement

---

## IMPROVEMENT #1: Dynamic Sitemap Generation

### Title
Generate Dynamic Sitemap for Search Engine Discovery

### Category
SEO

### Impact
**High** - Sitemaps are critical for search engines to discover and crawl all pages efficiently. Without a sitemap, crawlers may miss deep documentation pages.

### Effort
**Hours** (2-3 hours) - Implement Next.js sitemap generation using the App Router

### Files Affected
- `/home/coder/AgileFlow/apps/docs/app/sitemap.ts` (create)
- `/home/coder/AgileFlow/apps/docs/next.config.mjs` (update robots config)

### Why
**Current State**: No sitemap found. The site has 100+ documentation pages (commands, agents, features) that search engines may not discover without one.

**Impact**: With 100+ MDX pages across `/commands/`, `/agents/`, and `/features/` sections, a sitemap ensures Google indexes all content consistently and discovers new pages on updates.

### Approach
1. Create `/app/sitemap.ts` using Next.js `MetadataRoute.Sitemap` API (available in Next.js 13.4+)
2. Generate entries dynamically from Fumadocs `source.pageTree` to include all documentation pages
3. Set priorities: homepage (1.0), main docs (0.9), subpages (0.7) to guide crawler focus

**Example Implementation**:
```typescript
// app/sitemap.ts
import { MetadataRoute } from 'next'
import { source } from '@/lib/source'

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = 'https://agileflow.dev'

  const pages = source.getPages()
  const entries = pages.map(page => ({
    url: `${baseUrl}${page.url}`,
    lastModified: new Date(),
    changeFrequency: 'weekly' as const,
    priority: page.url === '/' ? 1.0 : 0.8,
  }))

  return [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 1.0,
    },
    ...entries,
  ]
}
```

**Validation**: Submit at https://www.google.com/webmasters/ to verify indexing.

---

## IMPROVEMENT #2: Per-Page Structured Data (JSON-LD)

### Title
Add JSON-LD Structured Data for Documentation Pages

### Category
SEO

### Impact
**High** - Structured data enables rich snippets in search results, improving CTR and helping Google understand page content better.

### Effort
**Days** (1-2 days) - Add schema generation logic to MDX rendering pipeline

### Files Affected
- `/home/coder/AgileFlow/apps/docs/app/(docs)/[[...slug]]/page.tsx` (update)
- `/home/coder/AgileFlow/apps/docs/mdx-components.tsx` (optional)

### Why
**Current State**: Layout has basic OG tags but no JSON-LD structured data. Commands and agents are not tagged with `BreadcrumbList`, `Article`, or `FAQPage` schemas.

**Impact**: Enables Google to show breadcrumb navigation in SERP, understand article metadata, and surface FAQ content in knowledge panels—boosting CTR by 20-30%.

### Approach
1. Extend `generateMetadata` function to emit `application/ld+json` script tags with:
   - `BreadcrumbList` schema for navigation hierarchy (Commands > epic > description)
   - `Article` schema for all documentation pages (articleBody, dateModified, author)
   - Optional `FAQPage` schema for pages with Q&A sections (future)
2. Generate from MDX frontmatter (title, description, slug)
3. Include canonical URL in schema to avoid duplication issues

**Example Schema**:
```typescript
// In generateMetadata function
const breadcrumbSchema = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://agileflow.dev' },
    { '@type': 'ListItem', position: 2, name: 'Commands', item: 'https://agileflow.dev/commands' },
    { '@type': 'ListItem', position: 3, name: doc.title, item: absoluteUrl(page.url) },
  ],
}
```

**Validation**: Use Google's Structured Data Testing Tool or Rich Results Test.

---

## IMPROVEMENT #3: Robots.txt with Sitemap Reference

### Title
Create Robots.txt with Sitemap and Crawl Rules

### Category
SEO

### Impact
**Medium** - Guides search engine crawlers, prevents crawling of low-value pages (registry, examples), saves crawl budget.

### Effort
**Hours** (30 minutes to 1 hour)

### Files Affected
- `/home/coder/AgileFlow/apps/docs/app/robots.ts` (create)

### Why
**Current State**: No robots.txt found. Without one, Google allocates crawl budget blindly, potentially wasting resources on example pages or auto-generated registry content.

**Impact**: Saves ~20% of crawl budget by blocking examples, registry JSON files, and allowing prioritization of high-value documentation.

### Approach
1. Create `/app/robots.ts` using Next.js `MetadataRoute.Robots`
2. Allow: `/commands/*`, `/agents/*`, `/features/*`, `/installation/*`
3. Disallow: `/view/*` (low-value preview pages), `/public/r/*` (registry JSON)
4. Reference sitemap URL to ensure discovery

**Example Implementation**:
```typescript
// app/robots.ts
import { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/view/', '/public/r/', '/admin/'],
      },
    ],
    sitemap: 'https://agileflow.dev/sitemap.xml',
  }
}
```

---

## IMPROVEMENT #4: Canonical URLs with Trailing Slash Consistency

### Title
Normalize URLs and Implement Canonical Tags

### Category
SEO

### Impact
**Medium** - Prevents duplicate content penalties from trailing slash inconsistencies and protocol variants (http vs https).

### Effort
**Hours** (1-2 hours) - Add middleware or config-level redirect rules

### Files Affected
- `/home/coder/AgileFlow/apps/docs/next.config.mjs` (update redirects)
- `/home/coder/AgileFlow/apps/docs/middleware.ts` (create, if needed)

### Why
**Current State**: Current redirect rules exist (`/docs` → `/`) but no normalization for trailing slashes. Pages may be accessible with and without trailing slashes, creating duplicate content.

**Example Issue**: Both `https://agileflow.dev/commands/epic` and `https://agileflow.dev/commands/epic/` may be crawlable.

**Impact**: Risk of duplicate content signals to Google. Canonical tags + redirects eliminate this, consolidating link juice.

### Approach
1. Update `next.config.mjs` `redirects()` to normalize trailing slashes (choose one convention, e.g., no trailing slash)
2. Add `trailingSlash: false` to Next.js config or implement middleware
3. Ensure all OG tags and metadata use the canonical URL variant
4. Add explicit `<link rel="canonical" />` to layout (usually automatic in Next.js, but verify)

**Example Config**:
```typescript
// next.config.mjs
redirects() {
  return [
    // Existing redirects...
    {
      source: '/:path+/', // Remove trailing slash
      destination: '/:path+',
      permanent: true,
    },
  ]
}
```

---

## IMPROVEMENT #5: Dynamic OG Images with Page-Specific Metadata

### Title
Enhance Open Graph Images with Page Category Tags

### Category
SEO

### Impact
**Medium** - Improves social media CTR and user perception of shared links; increases organic reach via social signals.

### Effort
**Hours** (1-2 hours) - Extend existing `/og` route handler

### Files Affected
- `/home/coder/AgileFlow/apps/docs/app/og/route.tsx` (update)
- `/home/coder/AgileFlow/apps/docs/app/(docs)/[[...slug]]/page.tsx` (update metadata)

### Why
**Current State**: OG images are generated dynamically but lack page type indicators (command, agent, feature). All images look similar, reducing CTR differentiation.

**Current Output**: Generic black background with title + description.

**Improvement**: Add visual category badges (Commands, Agents, Features, Guides) to OG images so users can distinguish page types in search results and social feeds.

### Approach
1. Extend `/og` route handler to accept `category` query parameter
2. Update MDX metadata generation to pass category (derived from URL path)
3. Add category badge/color to OG image JSX based on page type:
   - Commands: Blue badge
   - Agents: Purple badge
   - Features: Green badge
   - Guides: Orange badge
4. Include AgileFlow logo prominently for brand recognition

**Example Metadata Update**:
```typescript
// In generateMetadata function
const category = page.url.includes('/commands/') ? 'Command'
               : page.url.includes('/agents/') ? 'Agent'
               : 'Guide'

openGraph: {
  images: [
    {
      url: `/og?title=${encodeURIComponent(doc.title)}&description=${encodeURIComponent(doc.description)}&category=${category}`,
    },
  ],
}
```

**Validation**: Check OG images using Facebook Sharing Debugger or Twitter Card Validator.

---

## Summary Table

| # | Improvement | Impact | Effort | Priority | Est. CTR Gain |
|---|---|---|---|---|---|
| 1 | Dynamic Sitemap | High | Hours | P0 | +10-15% (discoverability) |
| 2 | JSON-LD Structured Data | High | Days | P0 | +20-30% (rich snippets) |
| 3 | Robots.txt | Medium | Hours | P1 | +5% (crawl efficiency) |
| 4 | Canonical URLs | Medium | Hours | P1 | +3-5% (dedupe penalty) |
| 5 | Enhanced OG Images | Medium | Hours | P2 | +5-10% (social CTR) |

---

## Implementation Roadmap

### Phase 1 (Week 1) - Foundation
- Improvement #1: Sitemap generation
- Improvement #2: JSON-LD structured data
- **Expected Result**: Better indexing + rich snippet eligibility

### Phase 2 (Week 2) - Optimization
- Improvement #3: Robots.txt rules
- Improvement #4: Canonical URL normalization
- **Expected Result**: Cleaner crawl patterns + duplicate prevention

### Phase 3 (Week 3) - Enhancement
- Improvement #5: Enhanced OG images with category tags
- **Expected Result**: Improved social sharing CTR

---

## Validation & Monitoring

After each implementation:

1. **Sitemap**: Submit to Google Search Console, verify all pages indexed
2. **Structured Data**: Use Google's Rich Results Test for schema validation
3. **Robots.txt**: Check crawl stats in GSC; verify disallowed pages don't appear in index
4. **Canonical URLs**: Monitor crawl errors in GSC for duplicate URL warnings
5. **OG Images**: Test with Facebook Sharing Debugger and Twitter Card Validator

Monitor in Search Console:
- Total indexed pages (expect +50-100 with sitemap)
- Crawl budget efficiency (should improve with robots.txt)
- Discover query performance over 4-6 weeks

---

## Files Needing Updates

```
apps/docs/
├── app/
│   ├── sitemap.ts (CREATE)
│   ├── robots.ts (CREATE)
│   ├── og/
│   │   └── route.tsx (UPDATE - add category badge)
│   └── (docs)/
│       └── [[...slug]]/
│           └── page.tsx (UPDATE - add structured data, category)
├── next.config.mjs (UPDATE - add redirect rules)
└── middleware.ts (OPTIONAL - for trailing slash normalization)
```

---

## Success Metrics (Post-Implementation)

- Pages indexed: 100+ → 120+ (after sitemap)
- Rich snippet eligibility: 0 → 80%+ (after JSON-LD)
- Crawl budget waste: ~20% → <5% (after robots.txt)
- Duplicate URL warnings: Check → None (after canonicals)
- Social share CTR: Baseline → +8% (after OG enhancements)

---

**Next Steps**: Prioritize Improvements #1 and #2 (sitemap + structured data) for immediate indexing gains. These are foundational and block downstream benefits.

