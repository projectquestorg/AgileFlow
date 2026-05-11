---
name: agileflow-performance
version: 1.0.0
category: agileflow/performance
description: |
  Use when a feature, page, or API is too slow, memory usage is growing,
  bundle size is excessive, or Core Web Vitals need improvement. Applies
  measure-first discipline: profile before optimizing, benchmark before
  and after, never optimize without data.
triggers:
  keywords:
    - performance
    - slow
    - optimize
    - bundle size
    - memory leak
    - profiling
    - benchmark
    - core web vitals
    - LCP
    - CLS
    - INP
    - FID
    - lighthouse
    - query slow
    - too large
    - loading time
    - lag
    - fps
    - jank
  priority: 50
  exclude:
    - performance review (HR)
    - team performance
provides:
  agents: []
learns:
  enabled: true
  file: _learnings/performance.yaml
  maxEntries: 50
depends:
  skills: []
  plugins: [core]
---

# AgileFlow Performance

Profile first. Optimize second. Benchmark both. This skill applies rigorous measure-first discipline to frontend rendering, backend throughput, database queries, and Core Web Vitals.

## When this skill activates

- A page, API endpoint, or function is noticeably slow or timing out
- Lighthouse or a monitoring tool flags a failing Core Web Vitals score
- Memory usage grows over time under steady load (memory leak suspected)
- Bundle size is bloating CI checks or affecting Time to Interactive
- A database query is flagged in the slow query log or an APM trace
- User reports lag, jank, or unresponsive interactions

## The golden rule

**Measure first. Never guess.**

Every optimization must start with a profile, not a hunch. The most common mistake in performance work is optimizing the wrong thing confidently. A 10x speedup on the wrong function saves nothing.

```
Profile → Identify bottleneck → Form hypothesis → Apply ONE change → Measure again → Document delta
```

Do not apply multiple changes at once. You will not know which one helped.

## Opening discovery flow

**When invoked without clear context, ask one focused question to understand scope and domain.**

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[
  {
    "question": "What kind of performance problem are you investigating?",
    "header": "Performance domain",
    "multiSelect": false,
    "options": [
      {"label": "Frontend — page feels slow or jank (Recommended starting point)", "description": "Bundle size, render performance, Core Web Vitals (LCP, INP, CLS), Time to Interactive"},
      {"label": "Backend / API — endpoint is slow or timing out", "description": "Request latency, throughput, Node.js/Python/Go profiling, async bottlenecks"},
      {"label": "Database — queries are slow or causing N+1 problems", "description": "EXPLAIN ANALYZE, missing indexes, N+1 elimination, connection pooling"},
      {"label": "Memory — usage grows over time (leak suspected)", "description": "Heap snapshots, allocation timelines, finding the retaining reference"},
      {"label": "Core Web Vitals — Lighthouse / CrUX score failing", "description": "LCP, INP, CLS diagnosis and targeted fixes with field data verification"}
    ]
  },
  {
    "question": "Do you have profiling data or benchmark numbers already?",
    "header": "Baseline",
    "multiSelect": false,
    "options": [
      {"label": "No — I need help establishing a baseline first", "description": "I'll walk you through profiling the right layer for your domain"},
      {"label": "Yes — I have a Lighthouse report / flame chart / slow query log", "description": "Paste or describe it and I'll interpret the data and suggest targeted fixes"},
      {"label": "Yes — I have before/after numbers and want help interpreting them", "description": "Share the numbers and I'll tell you if the improvement is meaningful and what to try next"}
    ]
  }
]</parameter>
</invoke>
```

**Route based on answers:**

| Domain            | Next action                                                                                                       |
| ----------------- | ----------------------------------------------------------------------------------------------------------------- |
| Frontend / bundle | Follow `workflows/profile-and-fix.md` using Chrome DevTools + Lighthouse                                          |
| Backend / API     | Follow `workflows/profile-and-fix.md` using clinic.js / pprof / py-spy                                            |
| Database          | Follow `workflows/profile-and-fix.md` using EXPLAIN ANALYZE, then `references/optimization-patterns.md` §Database |
| Memory            | Load `references/profiling-guide.md` §Memory profiling; follow heap snapshot workflow                             |
| Core Web Vitals   | Follow `workflows/improve-web-vitals.md`                                                                          |

## Performance budget

Establish a budget before optimizing. Without a target, you will never know when you are done.

| Metric                    | Good       | Needs work     | Poor              |
| ------------------------- | ---------- | -------------- | ----------------- |
| LCP                       | < 2.5 s    | 2.5 – 4.0 s    | > 4.0 s           |
| INP                       | < 200 ms   | 200 – 500 ms   | > 500 ms          |
| CLS                       | < 0.1      | 0.1 – 0.25     | > 0.25            |
| TTFB                      | < 800 ms   | 800 ms – 1.8 s | > 1.8 s           |
| JS bundle (initial, gzip) | < 200 KB   | 200 – 400 KB   | > 400 KB          |
| API p50 latency           | < 100 ms   | 100 – 500 ms   | > 500 ms          |
| API p95 latency           | < 500 ms   | 500 ms – 2 s   | > 2 s             |
| DB query (simple)         | < 10 ms    | 10 – 100 ms    | > 100 ms          |
| DB query (complex/join)   | < 100 ms   | 100 – 500 ms   | > 500 ms          |
| Heap growth (steady load) | < 10 MB/hr | 10 – 50 MB/hr  | > 50 MB/hr (leak) |

## The three domains

### Frontend

The browser is a single-threaded environment. Anything that blocks the main thread for more than 50 ms becomes a "long task" and causes jank. The critical insight: **most frontend performance problems are caused by too much JavaScript, not slow JavaScript**.

Primary tools: Chrome DevTools Performance tab, Lighthouse CI, React DevTools Profiler, webpack-bundle-analyzer / vite-bundle-visualizer.

See `references/profiling-guide.md` §Frontend profiling and `references/optimization-patterns.md` §Frontend rendering.

### Backend

Backend performance problems fall into three categories: CPU-bound (computation takes too long), I/O-bound (waiting for DB, network, filesystem), or memory-bound (GC pressure, allocations). The profile will tell you which one before you write a line of optimization code.

Primary tools: clinic.js (Node.js), py-spy / cProfile (Python), pprof (Go), APM traces (Datadog, New Relic, Sentry).

See `references/profiling-guide.md` §Backend profiling and `references/optimization-patterns.md` §Backend.

### Database

The most common database performance problems are: missing index on a filtered/sorted column, N+1 query pattern, SELECT \* where only 2 columns are needed, and offset pagination on large tables. EXPLAIN ANALYZE reveals all of these in seconds.

Primary tools: EXPLAIN ANALYZE (PostgreSQL), EXPLAIN FORMAT=JSON (MySQL), slow query log, pg_stat_statements.

See `references/profiling-guide.md` §Backend profiling §Database and `references/optimization-patterns.md` §Database.

## Anti-patterns

| Anti-pattern                        | Why it is harmful                                                                                     |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Premature optimization              | Wastes time on code that isn't the bottleneck; makes code harder to read without measurable benefit   |
| Optimizing without a baseline       | You cannot know if a change helped without a before number                                            |
| Applying multiple changes at once   | You cannot attribute the improvement to the right change                                              |
| Optimizing in production under load | Confounds profiling results; always profile in a representative but controlled environment            |
| Micro-benchmarking in isolation     | A function that runs in 1 µs in isolation may dominate wall time when called 10,000 times per request |
| Caching as the first response       | Caches hide bugs and make correctness harder to verify; optimize the source query first               |
| Ignoring field data (CrUX)          | Lab metrics (Lighthouse) can look great while real-user experience is poor due to device/network mix  |

## Self-improving learnings

`_learnings/performance.yaml` records:

- The primary tech stack (React, Next.js, Express, Django, Go, PostgreSQL, etc.)
- Performance budgets agreed for this project
- Profiling tools already installed and configured
- Known bottlenecks previously resolved (avoid re-investigating)
- Team preferences: APM tool, benchmark runner, browser target

Apply on invocation; update on correction.

## Quality checklist

Before delivering any optimization:

- [ ] Baseline measured before any change (numbers, not impressions)
- [ ] Only one change applied at a time between measurements
- [ ] After-change measurement taken in the same environment as baseline
- [ ] Improvement is statistically meaningful (not within noise margin)
- [ ] No regression introduced in other metrics (check LCP if optimizing CLS, etc.)
- [ ] Optimization does not break correctness (tests still pass)
- [ ] Change is documented with before/after numbers and rationale
- [ ] Performance budget updated if targets have shifted

## Integration

- **agileflow-test-writer** — write benchmark and load tests to lock in performance gains; a gain without a test can silently regress
- **agileflow-adr** — document architecture decisions made in the name of performance (caching layer, CDN, query redesign, data structure changes)
- **agileflow-pr-reviewer** — code review after optimisation to confirm correctness and readability are preserved alongside the performance improvement
- **agileflow-database** — query performance, index analysis, and connection pooling overlap; coordinate for storage-layer bottlenecks (N+1 queries, missing indexes)
- **agileflow-engineering** — delegate implementation of performance fixes (memoisation, code splitting, lazy loading, worker threads) to engineering
- **agileflow-refactor** — when performance problems stem from structural issues (deep coupling, repeated computation), pair with refactor to fix the root cause cleanly
- **agileflow-audit** — the performance dimension of the full audit surfaces bundle size, render, query, and asset issues; performance fixes what audit finds
- **agileflow-debug** — use debug when a performance regression appears suddenly and the cause is unclear; systematic root cause analysis before optimising
- **agileflow-seo** — Core Web Vitals (LCP, INP, CLS) directly affect search rankings; performance improvements here feed directly into SEO gains
- **agileflow-delivery** — include a performance budget check as a delivery gate for any feature touching render paths or large data payloads

## References

Load these files when you need deeper context:

| File                                  | When to load                                                                              |
| ------------------------------------- | ----------------------------------------------------------------------------------------- |
| `references/profiling-guide.md`       | Choosing profiling tools, reading flame charts, taking heap snapshots, APM interpretation |
| `references/optimization-patterns.md` | Concrete techniques for frontend rendering, backend throughput, and database queries      |
| `references/web-vitals-guide.md`      | LCP, INP, CLS deep reference — diagnosis, causes, and targeted fixes                      |

## Workflows

Follow these step-by-step when the user initiates the matching action:

| File                              | When to follow                                                                              |
| --------------------------------- | ------------------------------------------------------------------------------------------- |
| `workflows/profile-and-fix.md`    | User has a slow feature, API, query, or memory problem and needs a structured investigation |
| `workflows/improve-web-vitals.md` | User has a failing Core Web Vitals score and needs targeted improvements                    |
