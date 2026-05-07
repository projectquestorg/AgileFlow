# Performance Budget Guide

**Load this when:** Auditing web performance, setting performance targets, or evaluating Lighthouse scores.

## Lighthouse Score Thresholds

| Score  | Label             | Action                             |
| ------ | ----------------- | ---------------------------------- |
| 90–100 | Good              | Monitor; optimize incrementally    |
| 50–89  | Needs improvement | Prioritize fixes; target 90+       |
| 0–49   | Poor              | Immediate attention; block deploys |

---

## Core Web Vitals Thresholds (field data)

| Metric | Good   | Needs Work | Poor   | What it measures             |
| ------ | ------ | ---------- | ------ | ---------------------------- |
| LCP    | ≤2.5s  | 2.5–4s     | >4s    | Largest visible content load |
| INP    | ≤200ms | 200–500ms  | >500ms | Interaction to Next Paint    |
| CLS    | ≤0.1   | 0.1–0.25   | >0.25  | Layout shift score           |
| FCP    | ≤1.8s  | 1.8–3s     | >3s    | First visible content        |
| TTFB   | ≤800ms | 800ms–1.8s | >1.8s  | Server response time         |

**Note:** INP replaced FID as a Core Web Vital in March 2024.

---

## Resource Budget Targets (per page, gzipped)

| Resource            | Recommended budget | Maximum |
| ------------------- | ------------------ | ------- |
| Total page weight   | <500 KB            | 1 MB    |
| JavaScript (total)  | <200 KB            | 350 KB  |
| CSS (total)         | <50 KB             | 100 KB  |
| Images (total)      | <200 KB            | —       |
| Fonts               | <50 KB             | 100 KB  |
| Third-party scripts | <50 KB             | 100 KB  |
| HTTP requests       | <50                | <100    |

---

## Lighthouse Audit Categories and Key Checks

### Performance

- [ ] LCP element identified and optimized
- [ ] Unused JavaScript removed (tree-shaking, code splitting)
- [ ] Images: WebP/AVIF, lazy-loaded, explicit dimensions
- [ ] Render-blocking resources eliminated
- [ ] Server response time (TTFB) <200ms
- [ ] Efficient cache policy on static assets (max-age ≥1 year)
- [ ] No layout shifts from late-loading ads/embeds/fonts

### Accessibility (score target: 100)

- [ ] All images have alt text
- [ ] Buttons and links have accessible names
- [ ] Sufficient color contrast (4.5:1 normal, 3:1 large text)
- [ ] Form inputs have associated labels
- [ ] Logical heading hierarchy

### Best Practices (score target: 100)

- [ ] HTTPS enforced
- [ ] No deprecated APIs
- [ ] No browser errors in console
- [ ] No vulnerable libraries (npm audit)

### SEO (score target: 100)

- [ ] Title and meta description present
- [ ] Viewport meta tag set
- [ ] Links crawlable
- [ ] robots.txt valid

---

## JavaScript Budget Breakdown

| Category                     | Max size (gzipped) |
| ---------------------------- | ------------------ |
| Framework (React/Vue/Svelte) | 45 KB              |
| App code (first chunk)       | 50 KB              |
| Routing library              | 10 KB              |
| State management             | 10 KB              |
| UI component library         | 30 KB              |
| Analytics/tracking           | 15 KB              |
| Remaining third-party        | 40 KB              |

**Tooling:** `bundlephobia.com`, `webpack-bundle-analyzer`, `vite-bundle-visualizer`

---

## Image Optimization Checklist

- [ ] Format: WebP for photos, AVIF where supported, SVG for icons/logos
- [ ] Responsive images: `srcset` with 1x, 2x breakpoints
- [ ] Lazy loading: `loading="lazy"` on all below-fold images
- [ ] Explicit `width` and `height` to prevent CLS
- [ ] LCP image: preloaded with `<link rel="preload">`
- [ ] Max dimensions match display size (no oversized images)

---

## Font Loading Strategy

```html
<!-- Step 1: Preconnect to font origin -->
<link rel="preconnect" href="https://fonts.googleapis.com" />

<!-- Step 2: Preload critical font files -->
<link rel="preload" as="font" href="/fonts/brand.woff2" crossorigin />

<!-- Step 3: font-display: swap or optional -->
@font-face { font-display: swap; }
```

**font-display values:**
| Value | Behavior | Use when |
|-------|----------|----------|
| `swap` | FOUT; text always visible | Body text |
| `optional` | Skips if slow | Non-critical decorative |
| `block` | FOIT; invisible until loaded | Icons (avoid for text) |

---

## Performance Budget Enforcement

```json
// lighthouserc.json
{
  "assert": {
    "assertions": {
      "categories:performance": ["error", { "minScore": 0.9 }],
      "resource-summary:script:size": ["error", { "maxNumericValue": 350000 }],
      "resource-summary:total:size": ["error", { "maxNumericValue": 1000000 }]
    }
  }
}
```

CI tools: `@lhci/cli` (Lighthouse CI), `bundlesize`, `size-limit`
