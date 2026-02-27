# SEO Quality Gates

Reference data for programmatic SEO and content quality thresholds. Updated February 2026.

---

## On-Page Elements

### Title Tag
- **Length**: 30-60 characters
- **Requirements**: Unique per page, keyword-forward, no truncation
- **Flags**: Missing, duplicate, too short (<30), too long (>60), keyword-stuffed

### Meta Description
- **Length**: 120-160 characters
- **Requirements**: Unique per page, natural keywords, includes CTA
- **Flags**: Missing, duplicate, too short (<120), too long (>160)

### Headings
- **H1**: Exactly 1 per page, contains primary keyword
- **H2-H6**: Logical hierarchy (no skipping levels), keyword-relevant
- **Flags**: Missing H1, multiple H1s, skipped heading levels

### Alt Text
- **Length**: 10-125 characters
- **Requirements**: Descriptive, not filename-based, contextually relevant
- **Flags**: Missing, filename-based (IMG_001.jpg), too long, keyword-stuffed

### Internal Links
- **Target**: 2-10 per page (varies by content type)
- **Requirements**: Descriptive anchor text, no broken links, logical structure
- **Flags**: Orphan pages (0 internal links in), excessive links (>100)

---

## Programmatic SEO Thresholds

| Metric | Warning | Hard Stop |
|--------|---------|-----------|
| Pages without audit | 100+ | 500+ |
| Unique content per page | < 40% | < 20% |
| Location pages created | 30+ | 50+ |
| Thin pages (< 300 words) | 10+ | 50+ |
| Duplicate title tags | 5+ | 20+ |
| Duplicate meta descriptions | 10+ | 30+ |
| Pages with no internal links in | 5+ | 20+ |
| 404 errors | 5+ | 20+ |
| Redirect chains (3+ hops) | 3+ | 10+ |

---

## Content Uniqueness Requirements

| Page Type | Min Unique % | Template Allowed % |
|-----------|-------------|-------------------|
| Core pages (home, about, services) | 100% | 0% |
| Blog posts / articles | 100% | 0% |
| Product pages | 40% | 60% |
| Location pages | 40% | 60% |
| Category pages | 30% | 70% |

---

## URL Quality Standards

- **Format**: Lowercase, hyphens (not underscores), no special characters
- **Length**: Under 75 characters preferred, max 2048
- **Depth**: Max 3-4 levels from root (e.g., /category/subcategory/page)
- **Flags**: Uppercase, underscores, parameters without canonical, double slashes

---

## Crawl Budget Indicators

| Metric | Healthy | Warning | Critical |
|--------|---------|---------|----------|
| Crawl rate (pages/day) | Stable/growing | Declining >10% | Declining >30% |
| Index coverage errors | < 1% | 1-5% | > 5% |
| Soft 404s | 0 | 1-10 | > 10 |
| Blocked resources (CSS/JS) | 0 | 1-5 | > 5 |

---

## Priority Framework

| Priority | Criteria | Examples |
|----------|----------|----------|
| **Critical** | Blocks indexing or causes penalties | noindex on key pages, robots.txt blocking, manual action |
| **High** | Direct ranking impact | Missing title tags, slow LCP, broken canonical chains |
| **Medium** | Optimization opportunity | Thin content, missing schema, suboptimal alt text |
| **Low** | Nice-to-have improvement | Trailing slashes inconsistency, suboptimal URL structure |
