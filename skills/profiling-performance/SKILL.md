---
name: profiling-performance
description: Make slow or resource-hungry code faster with measurements instead of guesses, by establishing a reproducible baseline, finding the bottleneck with profiling evidence, making a targeted change, and measuring again to report before and after numbers. Use when the user says something is slow, times out, or uses too much CPU or memory, or asks to profile, benchmark, speed up, or optimize code. Not for fixing incorrect results (diagnosing-bugs), restructuring code without a performance goal (refactoring-safely), or explaining performance concepts.
---

# Profiling performance

No measurement, no optimization. Every change must be justified by a profile and proven by a before-and-after number.

## Workflow

1. **Define the target.** Which operation, which metric (latency, throughput, peak memory, CPU, startup time), which workload (input sizes and shapes that match real use), and the goal if the user has one. If no workload is given, derive a realistic one from the code, tests, fixtures, or the user's description, and state it.
2. **Build a reproducible baseline.** A benchmark or command that runs the real operation on that workload, warms up, repeats several times, and reports the median and spread, in production-like mode (no debug flags or dev builds). Record the numbers. If run-to-run noise is larger than the gain you are looking for, stabilize the measurement before going on. `references/measurement.md` covers benchmark hygiene and profilers per ecosystem.
3. **Find the bottleneck with evidence:** a CPU or allocation profile, timers around stages, query logs or query plans. Check how cost grows with input size (double the input: roughly double the time is linear, four times is quadratic). Name the hot spot and the share of time it takes before changing anything.
4. **Check that the cost is not deliberate or external.** Some costs are the point: password hashing, cryptographic work factors, required fsyncs, rate limits. Others live outside the code: the database server, the network, a third-party API, the machine. Report these with the evidence and the options, and ask before trading away security, durability, or correctness for speed.
5. **Make one targeted change** at the bottleneck: a better algorithm or data structure, removing repeated work, batching I/O or queries, streaming instead of buffering. Keep the results identical and run the relevant tests.
6. **Measure again** with the same benchmark and workload. Keep the change only if the gain clearly exceeds the noise; otherwise revert it and say so. Repeat steps 3 to 6 only while the goal is unmet and a clear hot spot remains.

## Constraints

- No speculative micro-optimizations: do not touch code the profile does not show as hot, and do not trade readability for gains you have not measured.
- Behavior stays the same, including output order, rounding, and error handling. If a faster approach changes results, ask first.
- Name the trade-offs (memory for speed, cache staleness, added complexity) and ask before adding a dependency or a cache that needs invalidation.
- Keep benchmark scaffolding out of the change unless the project already keeps benchmarks; say where it lives if you keep it.

## Report

- **Target and workload:** operation, metric, input sizes.
- **Baseline:** the exact command and its numbers (median and spread).
- **Bottleneck:** the evidence (profile excerpt or stage timings) and why it is slow.
- **Change and result:** what changed, the after numbers from the same command, the speedup, and the tests run.
- **Not done:** deliberate or external costs found, trade-offs declined, remaining hot spots.

## Done when

A reproducible baseline and an after measurement from the same benchmark show the effect of each kept change, the bottleneck is backed by profiling evidence, behavior is unchanged (tests pass), and anything deliberate, external, or not improved is reported with its evidence.
