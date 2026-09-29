# Measuring performance

Read the section you need. The goal is numbers you can trust and compare, not the most sophisticated tool.

## Benchmark hygiene

- Measure the real code path with realistic input sizes and shapes (skewed keys, long strings, many small items versus few large ones). A benchmark on 10 items says nothing about 50,000.
- Warm up before measuring (JIT compilers, caches, connection pools), then repeat: report the median and the spread (min and max, or p95), not one run.
- Change one thing at a time and rerun the same command with the same input and seed. Keep generated inputs deterministic (a fixed seed).
- Use production-like settings: optimized builds, no debug logging, no profiler attached while timing (profilers add overhead).
- Close obvious noise sources: other heavy processes, thermal throttling on laptops, first-run disk caches. If the spread stays larger than the effect, run more iterations or measure a larger workload.
- For latency, look at percentiles, not only the mean. For throughput under concurrency, measure concurrently; a blocking synchronous call can be fast alone and slow for everyone else.
- Compare outputs of the old and new implementation on the same input (or run the tests) so a faster wrong answer is caught.

## Growth check

Run the benchmark at two or three sizes (n, 2n, 4n). Time roughly proportional to n is linear; quadrupling per doubling is quadratic and usually means a lookup or copy inside a loop (`array.find`, `includes`, `indexOf`, spreading or concatenating an accumulator, string concatenation in a loop, N+1 queries).

## Profilers

| Ecosystem | CPU | Memory / allocations | Notes |
| --- | --- | --- | --- |
| Node.js | `node --cpu-prof script.js` (open the `.cpuprofile` in Chrome DevTools), `node --prof` + `node --prof-process` | `node --heap-prof`, `--inspect` heap snapshots | `performance.now()` around stages for quick timings |
| Browser | DevTools Performance panel | DevTools Memory panel | Record with CPU throttling to expose slow paths |
| Python | `python -m cProfile -s cumtime`, `py-spy record` | `tracemalloc`, `memray` | `timeit` for micro-benchmarks |
| Go | `go test -bench . -cpuprofile cpu.out`, `go tool pprof` | `-memprofile`, `pprof -alloc_space` | `benchstat` to compare runs |
| Rust | `cargo bench` (criterion), `perf`, `cargo flamegraph` | `dhat`, `heaptrack` | Build with `--release` |
| JVM | async-profiler, JFR | JFR allocation events | Use JMH for micro-benchmarks |
| Databases | `EXPLAIN ANALYZE` (Postgres), `EXPLAIN` (MySQL, SQLite), slow query log | | Check index use and row estimates |
| Any Linux process | `perf record -g`, `perf top` | `/usr/bin/time -v` (peak RSS) | |

## Reading a profile

- Sort by self time to find where CPU is actually spent, and by total (inclusive) time to find which caller is responsible.
- A hot spot inside a library is usually caused by how it is called (too often, with too much data); look one frame up.
- Garbage collection time that grows with input size points at allocation in a loop.
