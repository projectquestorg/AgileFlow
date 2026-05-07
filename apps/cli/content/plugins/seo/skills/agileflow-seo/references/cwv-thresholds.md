# Core Web Vitals Thresholds Reference

**Load this when:** analyzing page performance, interpreting CWV scores,
or recommending specific fixes. Google uses CrUX (field data) for ranking —
lab data is directional only.

## The three Core Web Vitals

### LCP — Largest Contentful Paint

_Measures loading performance_

| Score             | Threshold   | User experience               |
| ----------------- | ----------- | ----------------------------- |
| Good              | ≤ 2.5s      | Fast — ranks well             |
| Needs improvement | 2.5s – 4.0s | Noticeable delay              |
| Poor              | > 4.0s      | Frustrating — ranking penalty |

**What counts as LCP element:**

- `<img>` elements
- `<image>` inside SVG
- `<video>` poster images
- Block-level elements with background images
- Block-level elements containing text

**Common LCP culprits and fixes:**

| Cause                     | Fix                                                             |
| ------------------------- | --------------------------------------------------------------- |
| Render-blocking CSS/JS    | Defer non-critical JS, inline critical CSS                      |
| Slow server TTFB          | CDN, server-side caching, reduce redirects                      |
| Unoptimized hero image    | WebP/AVIF, `fetchpriority="high"`, no lazy loading on LCP image |
| Client-side rendering     | SSR or SSG for above-the-fold content                           |
| Web fonts blocking render | `font-display: swap`, preload critical fonts                    |

**Never lazy-load the LCP image.** This is one of the most common mistakes.

### INP — Interaction to Next Paint

_Measures responsiveness (replaced FID in March 2024)_

| Score             | Threshold     | User experience      |
| ----------------- | ------------- | -------------------- |
| Good              | ≤ 200ms       | Feels instant        |
| Needs improvement | 200ms – 500ms | Noticeable lag       |
| Poor              | > 500ms       | Janky — users notice |

INP measures the worst interaction across the entire page visit, not just the first.

**Common INP culprits and fixes:**

| Cause                         | Fix                                             |
| ----------------------------- | ----------------------------------------------- |
| Long JavaScript tasks (>50ms) | Break up with `setTimeout`, `scheduler.yield()` |
| Heavy event handlers          | Debounce, throttle, move work off main thread   |
| Forced style recalculation    | Batch DOM reads/writes, avoid layout thrashing  |
| Large React re-renders        | `React.memo`, `useMemo`, virtualize long lists  |
| Third-party scripts           | Load async, defer, or use Partytown             |

### CLS — Cumulative Layout Shift

_Measures visual stability_

| Score             | Threshold  | User experience         |
| ----------------- | ---------- | ----------------------- |
| Good              | ≤ 0.1      | Stable                  |
| Needs improvement | 0.1 – 0.25 | Noticeable shifts       |
| Poor              | > 0.25     | Jarring — content jumps |

**Common CLS culprits and fixes:**

| Cause                               | Fix                                                    |
| ----------------------------------- | ------------------------------------------------------ |
| Images without dimensions           | Always set `width` and `height` attributes             |
| Ads / embeds without reserved space | Reserve space with `min-height` container              |
| Fonts causing FOUT                  | `font-display: optional` or preload fonts              |
| Dynamically injected content        | Insert above-the-fold content only on user interaction |
| Animations using `top`/`left`       | Use `transform` instead — doesn't cause layout         |

## Field vs lab data

| Type                 | Source                            | Used for Google ranking?                  |
| -------------------- | --------------------------------- | ----------------------------------------- |
| **Field (CrUX)**     | Real user measurements via Chrome | ✅ YES — this is what matters for ranking |
| **Lab (Lighthouse)** | Simulated test environment        | ❌ NO — directional only                  |

If lab data shows Good but field data shows Poor: real users on real devices/networks
are the problem. Common causes: mobile networks, older devices, third-party scripts.

**Always check CrUX field data** via:

- Google Search Console → Core Web Vitals report
- PageSpeed Insights (shows both field and lab)
- `web-vitals` JS library for real user monitoring

## Passing threshold for Google ranking

Google uses the 75th percentile of field data. A page "passes" when
at least 75% of real user visits meet the Good threshold.

A site with 1,000 daily visitors needs 750 visits with LCP ≤ 2.5s to pass LCP.

## CWV impact on rankings

CWV is a **tiebreaker**, not a primary ranking signal. A page with great
content and poor CWV will outrank a page with poor content and great CWV.
But when content is equal, CWV determines the winner.

Fix CWV for user experience first, SEO second.
