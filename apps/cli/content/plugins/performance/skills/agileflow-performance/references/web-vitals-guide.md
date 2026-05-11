# Core Web Vitals Guide

**Load this when:** a Lighthouse report, CrUX dashboard, or monitoring alert flags a failing Core Web Vitals score, or you need to understand what each metric measures and how to fix it.

---

## Overview

Core Web Vitals are Google's user-centric performance signals. They measure real-world experience, not synthetic benchmarks. Since May 2021 they influence Google Search ranking.

**The three Core Web Vitals (as of 2024):**

| Metric | What it measures                           | Good     | Needs work   | Poor     |
| ------ | ------------------------------------------ | -------- | ------------ | -------- |
| LCP    | Loading performance (largest element)      | < 2.5 s  | 2.5 – 4.0 s  | > 4.0 s  |
| INP    | Responsiveness to all interactions         | < 200 ms | 200 – 500 ms | > 500 ms |
| CLS    | Visual stability (unexpected layout shift) | < 0.1    | 0.1 – 0.25   | > 0.25   |

**Additional metrics (not Core, but important):**

| Metric | What it measures                           | Good     | Needs work     | Poor     |
| ------ | ------------------------------------------ | -------- | -------------- | -------- |
| TTFB   | Time to First Byte (server response speed) | < 800 ms | 800 ms – 1.8 s | > 1.8 s  |
| FCP    | First Contentful Paint                     | < 1.8 s  | 1.8 – 3.0 s    | > 3.0 s  |
| TBT    | Total Blocking Time (lab proxy for INP)    | < 200 ms | 200 – 600 ms   | > 600 ms |

**Field data vs lab data:**

- **Lab (Lighthouse, WebPageTest):** controlled, reproducible, good for debugging. Does not reflect real user experience.
- **Field (CrUX, RUM):** real users, real devices, real networks. This is what Google measures for ranking. A passing Lighthouse score does not guarantee passing field CWV.

Always verify fixes in field data. The Chrome UX Report (CrUX) dashboard updates monthly. For faster feedback, use your own RUM pipeline with the `web-vitals` library.

---

## LCP — Largest Contentful Paint

### What it measures

LCP measures when the largest visible element in the viewport finishes rendering. This is the perceived "main content loaded" moment.

**Elements that qualify as LCP candidates:**

- `<img>` elements
- `<image>` inside an SVG
- `<video>` poster images
- Block-level elements with a background image (`background-image: url(...)`)
- Block-level elements containing text (`<h1>`, `<p>`, `<div>`)

The browser continuously updates the LCP candidate as the page loads. The final LCP value is reported when the user first interacts with the page.

### Common causes of slow LCP

| Cause                                | What happens                                                                  |
| ------------------------------------ | ----------------------------------------------------------------------------- |
| Slow TTFB                            | Everything is delayed; server is the bottleneck                               |
| Render-blocking resource             | CSS or synchronous script delays the browser reaching the LCP element         |
| LCP image discovered late            | The `<img>` is not in the initial HTML (set by JavaScript or lazy-loaded)     |
| LCP image is lazy-loaded             | `loading="lazy"` prevents preload; browser waits until element is in viewport |
| Large unoptimized LCP image          | Image too large; download takes too long                                      |
| LCP element rendered from JavaScript | Browser cannot fetch the resource during preload scan                         |

### Fixes for LCP

**1. Improve TTFB (if TTFB > 600 ms is contributing):**

- Use a CDN to serve HTML from an edge node close to the user
- Enable server-side rendering or static generation
- Add edge caching for your HTML (with appropriate cache-control)
- Profile the server-side rendering path (see `references/profiling-guide.md`)

**2. Preload the LCP image:**

```html
<!-- Add to <head> — this is the highest-impact LCP fix for image-heavy pages -->
<link rel="preload" as="image" href="/hero.webp" fetchpriority="high" />

<!-- For responsive images, use imagesrcset -->
<link
  rel="preload"
  as="image"
  imagesrcset="hero-400.webp 400w, hero-800.webp 800w, hero-1200.webp 1200w"
  imagesrcset="(max-width: 600px) 100vw, 800px"
  fetchpriority="high"
/>
```

**3. Never lazy-load the LCP image:**

```html
<!-- Bad — delays the most important image -->
<img src="hero.webp" loading="lazy" ... />

<!-- Good — no lazy loading for above-the-fold images -->
<img src="hero.webp" fetchpriority="high" ... />
```

**4. Optimize the image itself:**

- Convert to WebP or AVIF (30–50% smaller than JPEG at equivalent quality)
- Resize to the display dimensions (no larger)
- Enable lossless or lossy compression at 80–85% quality

**5. Eliminate render-blocking resources:**

```html
<!-- Move CSS to be non-blocking for non-critical styles -->
<link
  rel="preload"
  href="non-critical.css"
  as="style"
  onload="this.rel='stylesheet'"
/>
<!-- Inline only the critical CSS needed to render the LCP element -->
```

**6. Use SSR or SSG to put the LCP element in the initial HTML:**

- If your LCP element is rendered by JavaScript (e.g. a React component that fetches data), the browser cannot preload the image during the preload scan
- Move to SSR or static generation so the `<img>` tag is in the HTML payload

---

## INP — Interaction to Next Paint

### What it measures

INP measures the latency of all user interactions (clicks, keyboard presses, taps) throughout the page lifecycle. It reports the worst interaction (above the 98th percentile for long sessions).

INP replaced FID (First Input Delay) in March 2024. FID only measured the delay before the first interaction was processed. INP measures the full duration — from interaction to the next visual update — for every interaction.

**INP phases:**

1. **Input delay** — time from user action to when the event handler starts running (caused by other tasks on the main thread)
2. **Processing duration** — time the event handler itself takes to run
3. **Presentation delay** — time from handler completion to the next frame being painted

A good INP means all three phases are fast.

### Common causes of high INP

| Cause                                                                  | Phase affected      |
| ---------------------------------------------------------------------- | ------------------- |
| Long task running when user interacts                                  | Input delay         |
| Heavy event handler (synchronous work)                                 | Processing duration |
| Forced synchronous layout (reading layout properties after DOM change) | Processing duration |
| Too many DOM nodes (slow style recalculation)                          | Presentation delay  |
| Rendering framework doing too much work                                | All phases          |

### Fixes for INP

**1. Break up long tasks with `scheduler.yield()`:**

```js
// Long tasks block input. Break them up to yield to user input.
async function processLargeDataset(items) {
  for (let i = 0; i < items.length; i++) {
    processItem(items[i]);

    // Yield every 50 items to allow input events to be processed
    if (i % 50 === 0) {
      await scheduler.yield(); // Chrome 115+; polyfill: await new Promise(r => setTimeout(r, 0))
    }
  }
}
```

**2. Use web workers for CPU-intensive work:**

```js
// Main thread — send work to a worker
const worker = new Worker("./compute-worker.js");
worker.postMessage({ data: largeDataset });
worker.onmessage = (e) => updateUI(e.data);

// compute-worker.js — runs off the main thread
self.onmessage = (e) => {
  const result = heavyComputation(e.data.data);
  self.postMessage(result);
};
```

**3. Avoid forced synchronous layout:**

```js
// Bad — read layout property after DOM change forces synchronous reflow
element.style.height = "100px";
const width = element.offsetWidth; // forces reflow!

// Good — batch reads before writes
const width = element.offsetWidth; // read first
element.style.height = `${width / 2}px`; // write after
```

**4. Debounce high-frequency event handlers:**

```js
import debounce from "lodash/debounce";

// Don't run expensive work on every keypress
const handleSearch = debounce(async (query) => {
  const results = await fetchSearchResults(query);
  setResults(results);
}, 300);

input.addEventListener("input", (e) => handleSearch(e.target.value));
```

---

## CLS — Cumulative Layout Shift

### What it measures

CLS measures unexpected layout shifts — when visible elements move position during page load or interaction without user initiation. A high CLS means content jumps around as the page loads, causing mis-clicks and a disorienting experience.

CLS is a cumulative score, not a single event. It sums all shift scores across the page lifetime (with a session window algorithm for long-lived pages).

**Shift score calculation:** `shift score = impact fraction × distance fraction`

- Impact fraction: fraction of viewport area affected by the shift
- Distance fraction: fraction of viewport the element moved

### Common causes of CLS

| Cause                                           | Example                                                                        |
| ----------------------------------------------- | ------------------------------------------------------------------------------ |
| Images without `width` and `height`             | Browser reserves no space; image pushes content down when it loads             |
| Ads, embeds, iframes without reserved space     | Ad network injects content that pushes page layout down                        |
| Dynamic content injected above existing content | Cookie banner, notification bar, "you may also like" injected above the fold   |
| Web fonts causing FOUT/FOIT                     | Font swap causes text to reflow at different size                              |
| Animations using layout-triggering properties   | `margin`, `padding`, `width`, `height` trigger layout; use `transform` instead |

### Fixes for CLS

**1. Always specify `width` and `height` on images:**

```html
<!-- Bad — browser doesn't know image dimensions until it loads -->
<img src="product.jpg" alt="..." />

<!-- Good — browser reserves the correct space immediately -->
<img src="product.jpg" alt="..." width="800" height="600" />
```

CSS `aspect-ratio` as an alternative:

```css
img {
  aspect-ratio: 4 / 3;
  width: 100%;
  height: auto;
}
```

**2. Reserve space for ads and embeds:**

```css
/* Ad slot — reserve space so layout doesn't shift when ad loads */
.ad-slot {
  min-height: 250px; /* minimum expected ad height */
  background: #f5f5f5; /* visual placeholder */
}
```

**3. Avoid injecting content above existing content:**

```js
// Bad — notification pushes everything down
document.body.prepend(cookieBanner);

// Good — animate in from bottom or corner; don't push content
cookieBanner.style.position = "fixed";
cookieBanner.style.bottom = "0";
```

**4. Control font loading to prevent reflow:**

```css
/* font-display: optional — if font isn't ready in 100ms, use fallback indefinitely */
/* Best for CLS; may show fallback font on first visit */
@font-face {
  font-family: "MyFont";
  src: url("/fonts/myfont.woff2") format("woff2");
  font-display: optional;
}

/* font-display: swap — shows fallback, then swaps when font loads */
/* Can cause CLS if font metrics differ significantly from fallback */
```

**5. Use `transform` for animations, not layout properties:**

```css
/* Bad — triggers layout recalculation on every frame */
.animate-in {
  animation: slideIn 0.3s ease;
}
@keyframes slideIn {
  from {
    margin-top: -100px;
  }
  to {
    margin-top: 0;
  }
}

/* Good — transform is composited; never triggers layout */
.animate-in {
  animation: slideIn 0.3s ease;
}
@keyframes slideIn {
  from {
    transform: translateY(-100px);
  }
  to {
    transform: translateY(0);
  }
}
```

---

## TTFB — Time to First Byte

TTFB is not a Core Web Vital but it is the foundation of all other metrics. A slow TTFB adds directly to LCP.

**TTFB decomposition:**

```
TTFB = DNS lookup + TCP connection + TLS handshake + Server processing + First byte transferred
```

**Fixes:**

- Use a CDN — reduces DNS, TCP, TLS time by moving the server closer to the user
- Enable HTTP/2 or HTTP/3 on your origin
- Use edge caching for HTML responses (with `stale-while-revalidate`)
- Optimize server-side rendering time (profile the render path)
- Use `103 Early Hints` to let the browser start fetching sub-resources before the HTML arrives

**Good TTFB target:** < 600 ms for the server processing time component; < 800 ms total including network.

---

## Verifying improvements

**Lab verification (fast feedback loop):**

```bash
npx lighthouse https://yoursite.com --output=json | jq '.categories.performance.score'
```

**Field data verification (takes weeks — plan ahead):**

1. Chrome UX Report (CrUX) — updates monthly; available in PageSpeed Insights and Search Console
2. Google Search Console → Core Web Vitals report — shows field pass/fail by URL group
3. Your own RUM (Real User Monitoring) — immediate feedback; use `web-vitals` library to collect and send metrics

**Do not declare victory until field data confirms the improvement.** Lab and field can diverge by 50% or more on sites with a large mobile or slow-network user base.
