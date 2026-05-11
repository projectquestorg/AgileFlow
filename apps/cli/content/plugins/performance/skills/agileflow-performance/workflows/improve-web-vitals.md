# Workflow: Improve Core Web Vitals

**Triggers:** "Lighthouse score is failing", "CWV is red in Search Console", "LCP is too slow", "CLS keeps shifting", "INP is failing", user pastes a Lighthouse report or CrUX data

**Goal:** Identify which Core Web Vital is failing, diagnose the root cause using attribution data, apply targeted fixes, and verify improvement in field data — not just lab scores.

---

## Inputs needed

| Input                                     | Required  | How to get it                                                |
| ----------------------------------------- | --------- | ------------------------------------------------------------ |
| Which metric is failing (LCP / INP / CLS) | Yes       | Lighthouse report, CrUX data, Search Console, or user report |
| Current metric value                      | Yes       | From any of the above sources                                |
| URL or page type                          | Yes       | The specific page (homepage, product page, checkout, etc.)   |
| Tech stack                                | Preferred | Knowing React/Next.js vs plain HTML changes the fix approach |
| Lighthouse report (full JSON or HTML)     | Preferred | Paste or share — provides the "Opportunities" section        |

---

## Steps

### Step 1: Run Lighthouse and record the baseline

If the user does not already have a report:

```bash
# Run 3 times and take the median — Lighthouse has ±15% variance
npx lighthouse https://yoursite.com/page --output=json --output-path=report.json --chrome-flags="--headless"

# Or for a quick score check:
npx lighthouse https://yoursite.com/page --output=html --view
```

**Record the baseline values for all three Core Web Vitals:**

```
Baseline (date):
  LCP: ___ s  (good < 2.5 s)
  INP: ___ ms (good < 200 ms)
  CLS: ___    (good < 0.1)
  TTFB: ___ ms
  FCP: ___ s
```

Note: Lighthouse INP is not reliable in lab mode — use Chrome DevTools Performance → "Interaction to Next Paint" or field data from CrUX/RUM for INP diagnosis.

### Step 2: Identify the failing metric

**Triage by severity** — fix the worst metric first, but be aware that some fixes affect multiple metrics.

```
Is LCP > 2.5 s? → Follow §LCP Diagnosis
Is INP > 200 ms? → Follow §INP Diagnosis
Is CLS > 0.1? → Follow §CLS Diagnosis
All three failing? → Start with LCP (loading is usually the root cause)
```

---

### LCP Diagnosis

**Step LCP-1: Identify the LCP element**

In Chrome DevTools, look for the "LCP" marker in the Performance recording. Or run:

```js
// Paste in DevTools console
new PerformanceObserver((list) => {
  for (const entry of list.getEntries()) {
    console.log("LCP element:", entry.element);
    console.log("LCP time:", entry.startTime);
  }
}).observe({ type: "largest-contentful-paint", buffered: true });
```

**Step LCP-2: Decompose LCP time into phases**

```js
import { onLCP } from "web-vitals/attribution";

onLCP(({ value, attribution }) => {
  const {
    timeToFirstByte,
    resourceLoadDelay,
    resourceLoadDuration,
    elementRenderDelay,
  } = attribution;
  console.table({
    timeToFirstByte,
    resourceLoadDelay,
    resourceLoadDuration,
    elementRenderDelay,
  });
});
```

| Phase                  | High value means...                                                     | Fix                                             |
| ---------------------- | ----------------------------------------------------------------------- | ----------------------------------------------- |
| `timeToFirstByte`      | Server is slow; CDN is not being used; origin is far from user          | CDN, edge caching, SSR optimization             |
| `resourceLoadDelay`    | LCP resource not discovered early; preload not set; lazy-load blocking  | `<link rel="preload">`, remove `loading="lazy"` |
| `resourceLoadDuration` | Resource is too large; connection is slow                               | Image optimization, compression, CDN            |
| `elementRenderDelay`   | Render-blocking resource; JavaScript blocking paint; hydration blocking | Defer scripts, eliminate blocking resources     |

**Step LCP-3: Apply the fix for the dominant phase**

See `references/web-vitals-guide.md` §LCP and `references/optimization-patterns.md` §Image optimization for implementation details.

**Most common LCP fixes (in order of impact):**

1. Preload the LCP image: `<link rel="preload" as="image" href="..." fetchpriority="high">`
2. Remove `loading="lazy"` from the LCP image
3. Convert the LCP image to WebP/AVIF and compress it
4. Move the LCP image to static HTML (out of JavaScript rendering)
5. Add a CDN or improve TTFB if `timeToFirstByte` > 600 ms
6. Eliminate render-blocking `<script>` and `<link>` tags above the LCP element

---

### INP Diagnosis

**Note on lab vs field:** Lighthouse lab INP is unreliable because it simulates a single interaction. Use field data (CrUX or your RUM `web-vitals` instrumentation) to confirm INP is actually a problem in production. In DevTools, use the INP overlay.

**Step INP-1: Find the slow interaction**

```js
import { onINP } from "web-vitals/attribution";

onINP(({ value, attribution }) => {
  const {
    interactionTarget,
    inputDelay,
    processingDuration,
    presentationDelay,
    interactionType,
  } = attribution;
  console.log(`INP: ${value}ms`);
  console.log(`Target: ${interactionTarget}`);
  console.log(`Type: ${interactionType}`);
  console.table({ inputDelay, processingDuration, presentationDelay });
});
```

**Step INP-2: Identify which phase dominates**

| Phase                | High value means...                                               | Fix                                              |
| -------------------- | ----------------------------------------------------------------- | ------------------------------------------------ |
| `inputDelay`         | Another long task was running when the user interacted            | Break up long tasks with `scheduler.yield()`     |
| `processingDuration` | The event handler itself is slow                                  | Optimize the handler; move work to a web worker  |
| `presentationDelay`  | The browser took a long time to paint after the handler completed | Reduce DOM size; avoid forced synchronous layout |

**Step INP-3: Profile the slow interaction**

1. Open Chrome DevTools → Performance
2. Click "Record", perform the slow interaction, stop
3. Find the "Interaction" track — click the INP interaction bar
4. In the Summary panel, note the three phases
5. Find the longest task in "Main" during the processing phase
6. Click into the flame chart to find the slow function

**Step INP-4: Apply the fix**

- Long task in `inputDelay`: find what was running before the interaction — use `scheduler.yield()` to break it up
- Long event handler: profile it with the flame chart; look for synchronous loops, heavy DOM manipulation, or synchronous network calls
- High `presentationDelay`: check DOM node count (> 1500 nodes is a warning sign); look for layout-triggering reads after writes

---

### CLS Diagnosis

**Step CLS-1: Identify what is shifting**

```js
import { onCLS } from "web-vitals/attribution";

onCLS(({ value, attribution }) => {
  console.log(`CLS: ${value}`);
  if (attribution.largestShiftTarget) {
    console.log("Largest shift target:", attribution.largestShiftTarget);
    console.log("Largest shift value:", attribution.largestShiftEntry?.value);
    console.log(
      "Largest shift time:",
      attribution.largestShiftEntry?.startTime,
    );
  }
});
```

Or in Chrome DevTools:

1. Open DevTools → Rendering tab → check "Layout Shift Regions" (highlights shifting elements with blue overlay)
2. Reload the page and watch which elements flash blue

**Step CLS-2: Determine the cause of the shift**

| Observation                               | Cause                                   | Fix                                                         |
| ----------------------------------------- | --------------------------------------- | ----------------------------------------------------------- |
| Shift happens immediately on load         | Image without width/height              | Add explicit `width` and `height` attributes                |
| Shift happens 1–3 s after load            | Ad or embed loading                     | Reserve space with `min-height`                             |
| Shift happens when user scrolls           | Lazy-loaded image without dimensions    | Add dimensions; or use `aspect-ratio` in CSS                |
| Shift happens when content appears at top | Dynamic content injected above fold     | Inject below existing content; use fixed/sticky positioning |
| Shift happens when font loads             | Font swap (FOUT)                        | Use `font-display: optional` or size-adjust                 |
| Shift is triggered by a user interaction  | Not counted in CLS — this is acceptable | No fix needed                                               |

**Step CLS-3: Apply the fix**

See `references/web-vitals-guide.md` §CLS for implementation details.

**Most common CLS fixes:**

1. Add `width` and `height` to all `<img>` tags (or `aspect-ratio` in CSS)
2. Add `min-height` to ad slots and dynamic content containers
3. Use `font-display: optional` for web fonts
4. Switch layout animations from `margin`/`top`/`height` to `transform: translate()`
5. Reserve space for late-loading embeds (Twitter, YouTube, maps)

---

### Step 3: Verify the fix in the lab

After applying the fix:

```bash
# Run Lighthouse 3 times, take the median
npx lighthouse https://yoursite.com/page --output=json --chrome-flags="--headless"
```

Record the after values:

```
After fix (date):
  LCP: ___ s  (Δ: ___ s, ___%)
  INP: ___ ms (Δ: ___ ms, ___%)
  CLS: ___    (Δ: ___, ___%)
```

If the metric did not improve by more than 10%, the fix did not address the root cause. Go back to Step 2.

### Step 4: Verify in field data

Lab scores and field scores can diverge by 50% or more. **Do not declare the problem solved until field data confirms it.**

**How to check field data:**

1. **Google Search Console** → Core Web Vitals report — shows pass/fail by URL group. Updates weekly with a 28-day rolling window.

2. **PageSpeed Insights** (https://pagespeed.web.dev) — shows both lab (Lighthouse) and field (CrUX) data for any public URL.

3. **CrUX Dashboard** in Looker Studio — month-by-month breakdown by form factor.

4. **Your own RUM** using the `web-vitals` library:

```js
import { onLCP, onINP, onCLS } from "web-vitals";

function sendToAnalytics(metric) {
  navigator.sendBeacon(
    "/analytics",
    JSON.stringify({
      name: metric.name,
      value: metric.value,
      rating: metric.rating, // 'good', 'needs-improvement', 'poor'
      id: metric.id,
      page: location.pathname,
    }),
  );
}

onLCP(sendToAnalytics);
onINP(sendToAnalytics);
onCLS(sendToAnalytics);
```

**Timeline expectation:** CrUX field data has a 28-day rolling window. A fix deployed today will be fully reflected in CrUX in ~28 days. Your own RUM shows improvement immediately.

### Step 5: Prevent regression

After a successful fix, add a performance budget to CI to catch regressions automatically:

**Lighthouse CI budget:**

```json
// lighthouserc.json
{
  "ci": {
    "assert": {
      "assertions": {
        "largest-contentful-paint": ["error", { "maxNumericValue": 2500 }],
        "cumulative-layout-shift": ["error", { "maxNumericValue": 0.1 }],
        "total-blocking-time": ["warn", { "maxNumericValue": 200 }]
      }
    }
  }
}
```

```yaml
# .github/workflows/lighthouse.yml
- name: Run Lighthouse CI
  run: npx lhci autorun
  env:
    LHCI_GITHUB_APP_TOKEN: ${{ secrets.LHCI_GITHUB_APP_TOKEN }}
```

### Step 6: Next steps

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "Lab metrics are improved. What would you like to do next?",
  "header": "Next step",
  "multiSelect": false,
  "options": [
    {"label": "Set up RUM to monitor field data (Recommended)", "description": "Add the web-vitals library to collect real user metrics and send them to your analytics backend"},
    {"label": "Add Lighthouse CI to prevent regression", "description": "Configure @lhci/cli in GitHub Actions to fail PRs that regress performance"},
    {"label": "Investigate another failing metric", "description": "I can walk through LCP, INP, or CLS diagnosis for a different page or metric"},
    {"label": "Check field data now", "description": "I'll show you how to read PageSpeed Insights or your Search Console CWV report"},
    {"label": "Done for now", "description": "Field data will update in CrUX over the next 28 days"}
  ]
}]</parameter>
</invoke>
```

---

## Fallbacks

**If AskUserQuestion is unavailable:**

```
Core Web Vitals investigation complete.

Failing metric identified: LCP = 4.2 s (target: < 2.5 s)
Root cause: Hero image not preloaded; browser discovers it 2.1 s into page load
Fix applied: Added <link rel="preload" as="image" fetchpriority="high">; removed loading="lazy"; converted to WebP
Lab result: LCP = 1.9 s (-55%)

Next steps:
1. Verify in field data: check PageSpeed Insights or Search Console CWV (28-day lag)
2. Prevent regression: add Lighthouse CI budget (maxNumericValue: 2500 for LCP)
3. Set up web-vitals RUM for real-time field monitoring

Reply with a step number to continue, or describe the next issue.
```
