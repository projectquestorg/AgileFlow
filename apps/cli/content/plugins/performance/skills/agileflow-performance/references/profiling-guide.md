# Profiling Guide

**Load this when:** choosing a profiling tool, reading a flame chart, taking heap snapshots, interpreting APM traces, or establishing a performance baseline for any layer of the stack.

---

## Frontend profiling

### Chrome DevTools — Performance tab

The Performance tab is the primary tool for diagnosing runtime rendering problems: janky animations, slow interactions, layout thrashing, and long tasks.

**How to take a useful recording:**

1. Open DevTools → Performance tab
2. Tick "Screenshots" and "Web Vitals" in the capture bar
3. Click the record button, perform the interaction you are investigating, then stop
4. Use "CPU: 4x slowdown" in the throttle menu to simulate mid-range devices (where real users feel the pain)

**Reading the flame chart:**

- The x-axis is time; the y-axis is the call stack (callers above, callees below)
- Wide bars = long-running functions — these are your candidates
- Red triangles on frames signal "long tasks" (> 50 ms on the main thread)
- Look at the "Main" track; ignore "Worker" tracks unless you explicitly use web workers
- "Layout" and "Recalculate Style" bars indicate forced reflow — check if they are triggered by JavaScript reading layout properties mid-frame (getBoundingClientRect, offsetHeight)

**Long task threshold:** Any task > 50 ms is a long task and blocks user input. Tasks > 200 ms are serious; > 500 ms is a critical blocking problem.

**Identifying the culprit:**

1. Find the widest red bar in the Main thread
2. Click it — the Summary panel shows the function and file
3. Click the file link to jump to source
4. Look at "Bottom-Up" tab to find where total time is actually spent (vs. self time)

---

### Lighthouse CI

Lighthouse provides lab measurements for Core Web Vitals and a prioritized list of opportunities.

**Running Lighthouse:**

```bash
# CLI (most reliable — eliminates browser extension interference)
npx lighthouse https://yoursite.com --output=html --output-path=./report.html --chrome-flags="--headless"

# Or via CI
npm install -D @lhci/cli
npx lhci autorun
```

**What to look at first:**

1. Performance score — a weighted composite; useful directionally, not as a target
2. **Opportunities** — concrete fixes with estimated time savings
3. **Diagnostics** — structural issues (render-blocking resources, excessive DOM size, no image sizing)
4. **Core Web Vitals** — LCP, INP, CLS with attribution

**Key thresholds:**

| Metric | Good     | Needs work    | Poor     |
| ------ | -------- | ------------- | -------- |
| LCP    | < 2.5 s  | 2.5 – 4.0 s   | > 4.0 s  |
| INP    | < 200 ms | 200 – 500 ms  | > 500 ms |
| CLS    | < 0.1    | 0.1 – 0.25    | > 0.25   |
| FCP    | < 1.8 s  | 1.8 – 3.0 s   | > 3.0 s  |
| TTFB   | < 800 ms | 800 ms – 1.8s | > 1.8 s  |

**Important:** Lighthouse is a lab tool. Use Chrome User Experience Report (CrUX) or your RUM data for field measurements. Lab and field can diverge significantly due to device and network mix.

---

### Web Vitals attribution

The `web-vitals` library (v3+) provides attribution data telling you exactly which element caused the LCP, which interaction caused a slow INP, and which elements shifted for CLS.

```js
import { onLCP, onINP, onCLS } from "web-vitals/attribution";

onLCP(({ value, attribution }) => {
  console.log("LCP element:", attribution.lcpEntry?.element);
  console.log(
    "LCP phases:",
    attribution.timeToFirstByte,
    attribution.resourceLoadDelay,
    attribution.resourceLoadDuration,
    attribution.elementRenderDelay,
  );
});

onINP(({ value, attribution }) => {
  console.log("INP interaction target:", attribution.interactionTarget);
  console.log(
    "INP phases: input delay",
    attribution.inputDelay,
    "processing time",
    attribution.processingDuration,
    "presentation delay",
    attribution.presentationDelay,
  );
});

onCLS(({ value, attribution }) => {
  attribution.largestShiftTarget &&
    console.log("CLS culprit:", attribution.largestShiftTarget);
});
```

Send these values to your analytics backend to build a real-user performance dashboard.

---

### React DevTools Profiler

For React applications, the React DevTools Profiler reveals which components are rendering unnecessarily and how long each render takes.

**How to use:**

1. Install React DevTools browser extension
2. Open DevTools → Profiler tab
3. Enable "Record why each component rendered" in settings
4. Click record, perform the interaction, stop
5. Look for components with high "render duration" and "rendered by" showing a parent re-render that should have been prevented

**What to look for:**

- Components that render on every keystroke when they only depend on a debounced value
- Components that receive a new object reference on every render (breaks `React.memo`)
- Long render durations (> 16 ms) that push you past a frame budget

**why-did-you-render:**

```bash
npm install @welldone-software/why-did-you-render
```

Add to your app entry point (development only) and it logs detailed reasons for unexpected re-renders.

---

### Bundle analysis

Large JavaScript bundles are the leading cause of slow Time to Interactive, especially on mobile.

**webpack-bundle-analyzer:**

```bash
npm install -D webpack-bundle-analyzer
# Add to webpack config:
const { BundleAnalyzerPlugin } = require('webpack-bundle-analyzer');
plugins: [new BundleAnalyzerPlugin()]
```

**Vite / Rollup:**

```bash
npm install -D rollup-plugin-visualizer
# vite.config.js:
import { visualizer } from 'rollup-plugin-visualizer';
plugins: [visualizer({ open: true, gzipSize: true })]
```

**source-map-explorer** (framework-agnostic):

```bash
npm install -D source-map-explorer
npx source-map-explorer dist/static/js/*.js
```

**What to look for in the bundle report:**

- Unexpectedly large packages (moment.js, lodash — often replaceable with smaller alternatives)
- Libraries included in multiple chunks (deduplication issue)
- Packages imported in full when only one function is needed (`import _ from 'lodash'` vs `import debounce from 'lodash/debounce'`)
- Code that should be lazy-loaded appearing in the initial bundle

---

### Network waterfall (DevTools Network tab)

**Key signals:**

- Render-blocking resources: `<script>` without `defer`/`async`, `<link rel="stylesheet">` in `<head>` — these delay first paint
- Long chains of sequential requests (A loads B loads C) — use `<link rel="preload">` to break chains
- Large uncompressed assets — check that gzip/brotli is enabled on your server
- Uncached resources that should be cached — check `Cache-Control` headers
- HTTP/1.1 with many requests — migrate to HTTP/2 for free multiplexing

---

## Backend profiling

### Node.js: built-in `--prof` flag

```bash
node --prof server.js
# ... generate load ...
node --prof-process isolate-*.log > processed.txt
```

The processed output shows a "ticks" breakdown: which functions consume what percentage of CPU time. Look for high percentages in your application code (not V8 internals).

### Node.js: clinic.js

clinic.js is the most developer-friendly Node.js profiling suite.

```bash
npm install -g clinic

# CPU flame graph — identify hot functions
clinic flame -- node server.js

# Async/event loop profiling — find event loop delays
clinic bubbleprof -- node server.js

# Memory profiling — heap allocation tracking
clinic heapprofiler -- node server.js
```

**Reading a clinic flame graph:**

- Width = time spent in that function (as % of total)
- Flat tops = "on-CPU" time; "frozen" or narrow functions = waiting (I/O)
- Look for wide plateaus in your application code

### Python: cProfile + py-spy

**cProfile** (built-in, zero dependencies):

```bash
python -m cProfile -o profile.out -s cumulative your_script.py
python -m pstats profile.out
# In pstats: sort cumtime, stats 20
```

**py-spy** (sampling profiler, zero overhead, attaches to running process):

```bash
pip install py-spy
py-spy record -o profile.svg --pid <PID>   # flame graph
py-spy top --pid <PID>                      # live top-like view
```

**memory_profiler** (line-by-line memory usage):

```bash
pip install memory_profiler
@profile  # decorate the function
python -m memory_profiler your_script.py
```

### Go: pprof

```go
import _ "net/http/pprof"
// In main(): go http.ListenAndServe(":6060", nil)
```

```bash
# CPU profile (30 seconds of load)
go tool pprof http://localhost:6060/debug/pprof/profile?seconds=30

# Heap profile
go tool pprof http://localhost:6060/debug/pprof/heap

# Goroutine profile (find goroutine leaks)
go tool pprof http://localhost:6060/debug/pprof/goroutine

# In pprof interactive mode:
top20        # top 20 functions by CPU/memory
web          # open flame graph in browser (requires graphviz)
list funcName # source-level annotation
```

### Database: EXPLAIN ANALYZE

**PostgreSQL:**

```sql
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT u.*, p.* FROM users u
JOIN posts p ON p.user_id = u.id
WHERE u.created_at > '2024-01-01'
ORDER BY u.created_at DESC
LIMIT 50;
```

**What to look for:**

- `Seq Scan` on a large table = missing index (check rows scanned vs rows returned ratio)
- `Sort` with `external merge` = sort spilled to disk; increase `work_mem` or add index
- `Hash Join` vs `Nested Loop` — nested loop is efficient with small inner sets and indexes; hash join is better for large sets
- `rows=X` vs `actual rows=Y` — large discrepancy means stale statistics; run `ANALYZE table_name`
- `Buffers: shared hit=X read=Y` — high `read` values mean data is not in buffer cache

**MySQL:**

```sql
EXPLAIN FORMAT=JSON
SELECT * FROM orders WHERE customer_id = 123 AND status = 'pending';
```

**Slow query log:**

```sql
-- PostgreSQL: enable in postgresql.conf
log_min_duration_statement = 100  -- log queries > 100ms

-- MySQL: enable in my.cnf
slow_query_log = 1
long_query_time = 0.1
log_queries_not_using_indexes = 1
```

**pg_stat_statements** (PostgreSQL extension — most useful for finding the globally slowest queries):

```sql
CREATE EXTENSION pg_stat_statements;

-- Top 10 slowest queries by total time
SELECT query, calls, total_exec_time, mean_exec_time, rows
FROM pg_stat_statements
ORDER BY total_exec_time DESC
LIMIT 10;
```

### APM tools: Datadog, New Relic, Sentry Performance

APM tools provide distributed traces across service boundaries — invaluable for microservices where the slow part is not obvious.

**What to look for in APM traces:**

- Spans with high self-time (excluding children) — the code in that span is slow
- Long DB spans — check the query; correlate with EXPLAIN ANALYZE
- High span counts within one request — classic N+1 signature (many small DB spans)
- External HTTP spans with high latency — third-party API is the bottleneck, not your code
- Gaps between spans — time spent that isn't attributed (often serialization, middleware, or queue wait)

---

## Memory profiling

### Heap snapshots (Chrome DevTools / Node.js)

**In Chrome DevTools (browser-side leaks):**

1. Open DevTools → Memory tab
2. Take Snapshot 1 (baseline)
3. Perform the action you suspect leaks memory (e.g. navigate to a page and back several times)
4. Force garbage collection (trash icon in Memory tab)
5. Take Snapshot 2
6. Select Snapshot 2, choose "Comparison" view to see what was allocated and not freed

**In Node.js:**

```js
const v8 = require("v8");
const fs = require("fs");

// Take a heap snapshot
const snapshotStream = v8.writeHeapSnapshot();
console.log("Snapshot written to:", snapshotStream);
```

Or use `--inspect` and connect Chrome DevTools to the Node.js process.

### Allocation timeline

DevTools Memory → "Allocation instrumentation on timeline": records every allocation in real time. Use this when you know a leak exists but not where — filter by constructor type to narrow down.

### Common memory leak patterns

| Pattern                                  | Symptom                                                     | Fix                                                                    |
| ---------------------------------------- | ----------------------------------------------------------- | ---------------------------------------------------------------------- |
| Event listener not removed               | Memory grows after DOM element "removed" from view          | `removeEventListener` in cleanup; use `AbortController`                |
| Closure retaining large scope            | Function keeps reference to large object in outer scope     | Restructure to avoid capturing large objects in closures               |
| Global array / map growth                | `window.myCache` or module-level Map grows unbounded        | Add eviction policy (LRU, TTL) or use `WeakMap`                        |
| `setInterval` / `setTimeout` not cleared | Timer fires after component is unmounted                    | Store the return value; call `clearInterval`/`clearTimeout` in cleanup |
| WeakMap vs Map for caches                | Map keeps keys alive; WeakMap allows GC                     | Use `WeakMap` when keys are objects whose lifetime you don't control   |
| React: missing `useEffect` cleanup       | Subscription, listener, or timer set up but never torn down | Return a cleanup function from `useEffect`                             |
| Node.js: stream not consumed             | Stream buffer grows because consumer is slow                | Use backpressure; call `stream.resume()` if data is not needed         |
