# Core Web Vitals Thresholds

Reference data for SEO performance analysis. Updated February 2026.

---

## Primary Metrics (75th Percentile)

| Metric | Good | Needs Improvement | Poor |
|--------|------|-------------------|------|
| **LCP** (Largest Contentful Paint) | ≤ 2.5s | 2.5s - 4.0s | > 4.0s |
| **INP** (Interaction to Next Paint) | ≤ 200ms | 200ms - 500ms | > 500ms |
| **CLS** (Cumulative Layout Shift) | ≤ 0.1 | 0.1 - 0.25 | > 0.25 |

**Note**: INP replaced FID (First Input Delay) as of March 2024.

---

## LCP Component Breakdown

| Component | Target | Description |
|-----------|--------|-------------|
| TTFB (Time to First Byte) | < 800ms | Server response time |
| Resource load delay | Minimize | Time between TTFB and resource request |
| Resource load time | Minimize | Time to download LCP resource |
| Element render delay | Minimize | Time between download and render |

**Common LCP elements**: Hero images, heading text, video poster images, background images via CSS.

---

## Industry Adoption (Oct 2025)

| Device | Meeting All Three CWV |
|--------|----------------------|
| Desktop | 57% |
| Mobile | 50% |

---

## Mobile-Specific (Dec 2025 Update)

- Mobile CWV now weighted heavier in ranking
- Mobile performance is a critical ranking factor
- Test with 4G throttling (1.6 Mbps down, 750 Kbps up, 150ms RTT)

---

## Scoring Ranges (for SEO audit)

| Score | CWV Status | Meaning |
|-------|-----------|---------|
| 90-100 | All Good | All three metrics in "Good" range |
| 70-89 | Mostly Good | 2 of 3 metrics Good, 1 Needs Improvement |
| 50-69 | Needs Work | 1+ metrics in Needs Improvement |
| 0-49 | Poor | 1+ metrics in Poor range |

---

## Data Sources

- **Field data**: Chrome User Experience Report (CrUX), PageSpeed Insights API
- **Lab data**: Lighthouse, WebPageTest, Chrome DevTools
- **Recommendation**: Always prefer field data over lab data when available
