# Workflow: Profile and Fix

**Triggers:** "this is slow", "the API is timing out", "memory keeps growing", "the query takes forever", user describes lag or jank in any layer of the stack

**Goal:** Establish a measurable baseline, identify the actual bottleneck through profiling, apply a targeted fix, and verify the improvement with numbers.

---

## Inputs needed

| Input                                          | Required  | How to get it                                                           |
| ---------------------------------------------- | --------- | ----------------------------------------------------------------------- |
| Domain: frontend / backend / database / memory | Yes       | Ask if not specified                                                    |
| Description of what is slow                    | Yes       | User description or monitoring alert                                    |
| Existing profiling data                        | No        | Flame chart, APM trace, slow query log — paste or describe if available |
| Tech stack (language, framework, DB)           | Yes       | Read `package.json`, `go.mod`, `pyproject.toml`, or ask                 |
| Environment details                            | Preferred | Production vs staging; estimated traffic volume; hardware specs         |

---

## Steps

### Step 1: Establish a baseline

**Never skip this step.** Without a before number, you cannot confirm any fix helped.

Choose the measurement method for your domain:

| Domain   | Measurement method                                                              |
| -------- | ------------------------------------------------------------------------------- |
| Frontend | Lighthouse CLI (3 runs, take median); Chrome DevTools Performance recording     |
| Backend  | `wrk` or `autocannon` benchmark against the endpoint; APM p50/p95 from traces   |
| Database | `EXPLAIN (ANALYZE, BUFFERS)` output with actual timing; slow query log entry    |
| Memory   | Heap snapshot size at steady state; RSS trend in APM or `process.memoryUsage()` |

**Record the baseline:**

```
Baseline (2026-05-08):
  Metric: LCP / p95 latency / query time / heap size
  Value: [before number]
  Environment: [how measured]
  URL / endpoint / query: [what was measured]
```

If the user already has baseline data, skip to Step 3.

### Step 2: Identify the bottleneck

Load `references/profiling-guide.md` for tool-specific guidance. Quick decision tree:

**Frontend — which sub-problem?**

```
Is Lighthouse LCP > 2.5 s?
  → Is TTFB > 600 ms? → Server / CDN problem (see Step 3 TTFB fixes)
  → Is the LCP image lazy-loaded or discovered late? → Preload fix
  → Is there a render-blocking script or CSS? → Deferral fix
  → Is the LCP image too large? → Image optimization

Is INP > 200 ms?
  → Open Chrome DevTools → Performance → record the slow interaction
  → Look for long tasks (red triangles) during the interaction
  → Find the widest bar in the event handler call stack

Is CLS > 0.1?
  → Open DevTools → Performance → look for "Layout Shift" events
  → Use web-vitals attribution to find the shifting element
```

**Backend — which sub-problem?**

```
Is the endpoint slow on every request?
  → Profile with clinic flame / py-spy / pprof
  → Is CPU high? → Hot function in flame chart → optimize the algorithm
  → Is CPU low but still slow? → I/O wait → check DB queries, external HTTP calls

Is it slow only under load?
  → Check connection pool exhaustion (pool size vs concurrent requests)
  → Check event loop lag (clinic bubbleprof for Node.js)
  → Check DB lock contention (pg_locks, SHOW PROCESSLIST for MySQL)
```

**Database — which sub-problem?**

```
Run EXPLAIN (ANALYZE, BUFFERS) on the slow query.
  → "Seq Scan" on a large table? → Add an index
  → Many small queries for same table? → N+1 pattern → batch or JOIN
  → "Sort" with "external merge"? → Add index on sort column or increase work_mem
  → Rows estimated vs actual differ wildly? → Run ANALYZE on the table
```

**Memory — which sub-problem?**

```
Is heap growing continuously?
  → Take two heap snapshots (before and after the growth period)
  → Compare in Chrome DevTools Memory → "Comparison" view
  → Find the object type with the largest delta
  → Use "Retainers" to find what is keeping it alive

Is heap growing only under specific actions?
  → Use "Allocation instrumentation on timeline"
  → Filter by the object type identified above
  → Find the allocation call site in the flame chart
```

### Step 3: Form a hypothesis

Before changing anything, write down your hypothesis. This forces clarity and makes the result interpretable.

```
Hypothesis: The LCP is slow because the hero image (620 KB JPEG) is not preloaded
and the browser discovers it late in the HTML parse.

Expected fix: Add <link rel="preload" as="image"> for the hero image.
Expected improvement: LCP should drop from 4.2 s → ~2.0 s by eliminating
the ~2 s resource load delay phase.
```

If you cannot form a specific hypothesis, go back to Step 2 — the bottleneck is not yet identified.

### Step 4: Apply ONE change

**Do not apply multiple changes at once.** You will not know which one helped (or hurt).

Make the single change implied by your hypothesis. Common targeted changes:

**Frontend:**

- Add `<link rel="preload" as="image">` for the LCP image
- Remove `loading="lazy"` from the LCP image
- Add `defer` to a synchronous `<script>` tag
- Split a large component into a lazy-loaded chunk
- Add explicit `width`/`height` to images causing CLS
- Break up a long task with `scheduler.yield()`

**Backend:**

- Add caching with Redis for a frequently-read endpoint
- Move synchronous CPU work to a worker thread
- Increase the database connection pool size
- Add `defer`/`async` to non-critical startup tasks

**Database:**

- Add a covering index on the filtered + selected columns
- Rewrite a correlated subquery as a JOIN
- Replace N separate queries with a single batch query
- Add `LIMIT` to a query that was fetching all rows

**Memory:**

- Add `removeEventListener` in a component cleanup function
- Add a TTL to a module-level cache Map
- Return a cleanup function from a `useEffect`
- Replace a `setInterval` with a `setTimeout` that reschedules itself with a guard

### Step 5: Measure again

Repeat the exact same measurement from Step 1 in the same environment. Record the result.

```
After fix (2026-05-08):
  Metric: LCP
  Value: [after number]
  Change: [delta and % improvement]
  Environment: [same as baseline]
```

**Is the improvement real?**

- Run Lighthouse at least 3 times and take the median (lab results have ±15% variance)
- For backend benchmarks, run with the same concurrency and duration as the baseline
- For database queries, run `EXPLAIN ANALYZE` multiple times (first run may be cold-cache)

If the improvement is within noise (< 10%), the change did not help. Revert and re-investigate.

### Step 6: Check for regressions

Verify that the fix did not introduce a problem in a related metric:

| If you optimized | Also check                                                                  |
| ---------------- | --------------------------------------------------------------------------- |
| LCP              | CLS (did preloading change layout?) and INP                                 |
| INP              | TBT and LCP (did breaking up tasks delay the paint?)                        |
| CLS              | LCP (did reserving space affect element discovery timing?)                  |
| Bundle size      | App functionality (did tree shaking remove a needed export?)                |
| DB query         | Application correctness (does the optimized query return the same results?) |
| Caching          | Data freshness (is staleness now a problem?)                                |

Run the test suite after any code change. A fast but broken feature is not an improvement.

### Step 7: Document the result

Add a note to `_learnings/performance.yaml` with the finding. If this was a significant architecture decision (adding Redis, redesigning a query pattern, adding a CDN), create an ADR with `/agileflow:adr`.

```yaml
# _learnings/performance.yaml entry:
- date: 2026-05-08
  metric: LCP
  url: /
  before: 4.2s
  after: 1.9s
  change: -55%
  fix: "Preloaded hero image; removed lazy-load; converted to WebP"
  tools_used: Lighthouse CLI
```

### Step 8: Present the result and next steps

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "Fix applied and verified. LCP improved from 4.2 s → 1.9 s (-55%). What next?",
  "header": "Next step",
  "multiSelect": false,
  "options": [
    {"label": "Investigate the next bottleneck (Recommended)", "description": "Lighthouse still flags INP at 320 ms — I can guide you through fixing that next"},
    {"label": "Verify in field data", "description": "I'll show you how to check CrUX or set up web-vitals RUM to confirm this improvement reflects in real user data"},
    {"label": "Create an ADR for this optimization", "description": "Document the decision and rationale for future maintainers"},
    {"label": "Write a benchmark test to lock in this gain", "description": "Add a Lighthouse budget or k6 threshold to CI so this regression is caught automatically"},
    {"label": "Done for now", "description": "Close out the investigation"}
  ]
}]</parameter>
</invoke>
```

---

## Fallbacks

**If AskUserQuestion is unavailable:**

Present findings as a numbered summary:

```
Profiling complete. Here is what was found and fixed:

Baseline: LCP = 4.2 s (measured with Lighthouse CLI, median of 3 runs)
Bottleneck: Hero image (620 KB JPEG) discovered late; no preload; lazy-load attribute present
Fix applied: Added <link rel="preload">, removed loading="lazy", converted to WebP (190 KB)
Result: LCP = 1.9 s (-55%)
No regressions: CLS unchanged at 0.02; INP unchanged at 180 ms; tests pass

Suggested next steps:
1. Verify improvement in CrUX field data (updates monthly in Search Console)
2. Investigate INP — Lighthouse shows 180 ms (passing) but p95 may be higher in the field
3. Set up a Lighthouse budget in CI to prevent LCP regression

Reply with a number to continue, or describe the next issue to investigate.
```
