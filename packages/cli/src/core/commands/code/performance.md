---
description: Multi-agent performance bottleneck analysis with consensus voting for finding optimization opportunities
argument-hint: "[file|directory] [DEPTH=quick|deep] [FOCUS=queries|rendering|memory|bundle|compute|network|caching|assets|all]"
compact_context:
  priority: high
  preserve_rules:
    - "ACTIVE COMMAND: /agileflow:audit:performance - Multi-agent performance bottleneck analysis"
    - "CRITICAL: Deploy analyzers IN PARALLEL in ONE message with multiple Task calls"
    - "CRITICAL: Wait for all results before running consensus (use TaskOutput with block=true)"
    - "CRITICAL: Confidence scoring: CONFIRMED (2+ agree), LIKELY (1 with evidence), INVESTIGATE (1 weak)"
    - "MUST parse arguments: TARGET (file/dir), DEPTH (quick/deep), FOCUS (queries|rendering|memory|bundle|compute|network|caching|assets|all)"
    - "Pass consensus all analyzer outputs, let it synthesize the final report"
  state_fields:
    - target_path
    - depth
    - focus_areas
    - analyzers_deployed
    - findings_collected
---

# /agileflow:audit:performance

Deploy multiple specialized performance analyzers in parallel to find bottlenecks and optimization opportunities, then synthesize results through consensus voting into a prioritized Performance Audit Report.

---

## Quick Reference

```
/agileflow:audit:performance app/                                # Analyze app directory (quick, core 5 analyzers)
/agileflow:audit:performance . DEPTH=deep                        # Deep analysis - all 8 analyzers
/agileflow:audit:performance src/ FOCUS=queries,memory            # Focus on specific areas
/agileflow:audit:performance . DEPTH=deep FOCUS=all               # Comprehensive full audit
/agileflow:audit:performance app/api/ FOCUS=queries               # Check API queries specifically
```

---

## How It Works

```
+-------------------------------------------------------------+
|                 /agileflow:audit:performance                  |
|                                                               |
|  1. Parse arguments (target, depth, focus)                    |
|  2. Deploy analyzers IN PARALLEL                              |
|  3. Collect all findings                                      |
|  4. Run consensus coordinator to validate & prioritize        |
|  5. Generate actionable Performance Audit Report              |
+-------------------------------------------------------------+

   +---------+ +----------+ +--------+ +--------+ +---------+
   | Queries | | Rendering| | Memory | | Bundle | | Compute |
   +----+----+ +----+-----+ +---+----+ +---+----+ +----+----+
        |           |           |          |           |
   +----+---+ +----+---+ +----+---+                (deep only)
   | Network| | Caching| | Assets |
   +---+----+ +---+----+ +---+----+
       |           |          |
       +-----------+----------+
                   v
        +----------------------+
        | Consensus Coordinator|
        | (validates, votes,   |
        |  generates report)   |
        +----------------------+
```

---

## Arguments

| Argument | Values | Default | Description |
|----------|--------|---------|-------------|
| TARGET | file/directory | `.` | What to analyze |
| DEPTH | quick, deep | quick | quick = core 5 analyzers, deep = all 8 |
| FOCUS | queries,rendering,memory,bundle,compute,network,caching,assets,all | all | Which analyzers to deploy |

---

## Step-by-Step Process

### STEP 1: Parse Arguments

```
TARGET = first argument or current directory
DEPTH = quick (default) or deep
FOCUS = all (default) or comma-separated list
```

**Analyzer Selection**:

| Condition | Analyzers Deployed |
|-----------|-------------------|
| `DEPTH=quick` + `FOCUS=all` | queries, rendering, memory, bundle, compute (core 5) |
| `DEPTH=deep` + `FOCUS=all` | All 8 analyzers |
| `FOCUS=queries` | perf-analyzer-queries only |
| `FOCUS=rendering` | perf-analyzer-rendering only |
| `FOCUS=memory` | perf-analyzer-memory only |
| `FOCUS=bundle` | perf-analyzer-bundle only |
| `FOCUS=compute` | perf-analyzer-compute only |
| `FOCUS=network` | perf-analyzer-network only |
| `FOCUS=caching` | perf-analyzer-caching only |
| `FOCUS=assets` | perf-analyzer-assets only |
| `FOCUS=queries,memory` | Comma-separated: deploy specified analyzers |

**DEPTH behavior**:
- `quick` (default): Deploy core 5 analyzers. Focus on CRITICAL/HIGH issues only.
- `deep`: Deploy all 8 analyzers. Include MEDIUM/LOW findings.

### STEP 2: Deploy Analyzers in Parallel

**CRITICAL**: Deploy ALL selected analyzers in a SINGLE message with multiple Task calls.

**Prompt template for each analyzer**:

```
TASK: Analyze the following code for {PERFORMANCE_DOMAIN} bottlenecks.

TARGET: {file_path or directory}
DEPTH: {quick|deep}

{For quick depth}: Focus on CRITICAL and HIGH severity issues only. Skip micro-optimizations.
{For deep depth}: Be comprehensive. Include MEDIUM and LOW severity findings.

Read the target files and apply your analysis methodology.

OUTPUT your findings in your standard format (FINDING-N with location, severity, confidence, code, explanation, remediation).

If no issues found, output: "No {PERFORMANCE_DOMAIN} bottlenecks found in {TARGET}"
```

**Example deployment (DEPTH=quick, FOCUS=all - deploys core 5)**:

```xml
<invoke name="Task">
<parameter name="description">Query performance analysis</parameter>
<parameter name="prompt">TASK: Analyze the following code for QUERY PERFORMANCE bottlenecks.
TARGET: src/
DEPTH: quick
Focus on CRITICAL and HIGH severity issues only...
...</parameter>
<parameter name="subagent_type">perf-analyzer-queries</parameter>
<parameter name="run_in_background">true</parameter>
</invoke>

<invoke name="Task">
<parameter name="description">Rendering performance analysis</parameter>
<parameter name="prompt">TASK: Analyze the following code for RENDERING PERFORMANCE bottlenecks.
TARGET: src/
DEPTH: quick
...</parameter>
<parameter name="subagent_type">perf-analyzer-rendering</parameter>
<parameter name="run_in_background">true</parameter>
</invoke>

<invoke name="Task">
<parameter name="description">Memory leak analysis</parameter>
<parameter name="prompt">TASK: Analyze the following code for MEMORY LEAK and RETENTION bottlenecks.
TARGET: src/
DEPTH: quick
...</parameter>
<parameter name="subagent_type">perf-analyzer-memory</parameter>
<parameter name="run_in_background">true</parameter>
</invoke>

<invoke name="Task">
<parameter name="description">Bundle size analysis</parameter>
<parameter name="prompt">TASK: Analyze the following code for BUNDLE SIZE bottlenecks.
TARGET: src/
DEPTH: quick
...</parameter>
<parameter name="subagent_type">perf-analyzer-bundle</parameter>
<parameter name="run_in_background">true</parameter>
</invoke>

<invoke name="Task">
<parameter name="description">Compute performance analysis</parameter>
<parameter name="prompt">TASK: Analyze the following code for COMPUTE PERFORMANCE bottlenecks.
TARGET: src/
DEPTH: quick
...</parameter>
<parameter name="subagent_type">perf-analyzer-compute</parameter>
<parameter name="run_in_background">true</parameter>
</invoke>
```

**For DEPTH=deep, also deploy**:

```xml
<invoke name="Task">
<parameter name="description">Network performance analysis</parameter>
<parameter name="prompt">TASK: Analyze the following code for NETWORK PERFORMANCE bottlenecks...
...</parameter>
<parameter name="subagent_type">perf-analyzer-network</parameter>
<parameter name="run_in_background">true</parameter>
</invoke>

<invoke name="Task">
<parameter name="description">Caching analysis</parameter>
<parameter name="prompt">TASK: Analyze the following code for CACHING OPPORTUNITIES...
...</parameter>
<parameter name="subagent_type">perf-analyzer-caching</parameter>
<parameter name="run_in_background">true</parameter>
</invoke>

<invoke name="Task">
<parameter name="description">Asset optimization analysis</parameter>
<parameter name="prompt">TASK: Analyze the following code for ASSET OPTIMIZATION opportunities...
...</parameter>
<parameter name="subagent_type">perf-analyzer-assets</parameter>
<parameter name="run_in_background">true</parameter>
</invoke>
```

### STEP 3: Collect Results

Wait for all analyzers to complete:

```xml
<invoke name="TaskOutput">
<parameter name="task_id">{queries_id}</parameter>
<parameter name="block">true</parameter>
</invoke>

<invoke name="TaskOutput">
<parameter name="task_id">{rendering_id}</parameter>
<parameter name="block">true</parameter>
</invoke>

<!-- ... collect all results ... -->
```

### STEP 4: Run Consensus Coordinator

Pass all analyzer outputs to the consensus coordinator:

```xml
<invoke name="Task">
<parameter name="description">Performance audit consensus</parameter>
<parameter name="prompt">You are the Performance Consensus Coordinator.

TARGET: {target_path}
DEPTH: {depth}

## Analyzer Outputs

### Query Performance Analyzer Results:
{queries_output}

### Rendering Performance Analyzer Results:
{rendering_output}

### Memory Analyzer Results:
{memory_output}

### Bundle Size Analyzer Results:
{bundle_output}

### Compute Performance Analyzer Results:
{compute_output}

{If deep depth, also include:}
### Network Performance Analyzer Results:
{network_output}

### Caching Analyzer Results:
{caching_output}

### Asset Optimization Analyzer Results:
{assets_output}

---

Follow your consensus process:
1. Detect project type from the codebase
2. Parse all findings into normalized structure
3. Group related findings by location
4. Vote on confidence (CONFIRMED if 2+ agree, LIKELY if 1 with evidence)
5. Filter by project type relevance
6. Estimate performance impact for each finding
7. Generate the final Performance Audit Report
8. Save report to docs/08-project/perf-audits/perf-audit-{YYYYMMDD}.md
</parameter>
<parameter name="subagent_type">perf-consensus</parameter>
</invoke>
```

### STEP 5: Present Results

After consensus completes, show the report summary and offer next steps:

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "Performance audit complete: [N] findings ([critical] Critical, [high] High). [files_count] files analyzed. Project type: [type].",
  "header": "Next steps",
  "multiSelect": false,
  "options": [
    {"label": "Fix [critical] Critical issues now (Recommended)", "description": "[top_issue_summary]"},
    {"label": "Create stories for all findings", "description": "Track [critical] critical + [high] high priority items in backlog"},
    {"label": "Re-run with DEPTH=deep on [target]", "description": "Current was quick (5 analyzers) - deep adds Network, Caching, Assets"},
    {"label": "Save report and done", "description": "Report saved to docs/08-project/perf-audits/"}
  ]
}]</parameter>
</invoke>
```

---

## Example Output

```
Performance Audit: app/
====================================================================

Deploying 5 performance analyzers (quick mode)...
* Query Performance Analyzer
* Rendering Performance Analyzer
* Memory Analyzer
* Bundle Size Analyzer
* Compute Performance Analyzer

Running consensus...
* Consensus complete
* Project type detected: Full-stack Web Application

--------------------------------------------
BOTTLENECK SUMMARY
--------------------------------------------

| Severity | Count | Category |
|----------|-------|----------|
| Critical | 1     | N+1 Queries |
| High     | 2     | Bundle Size, Memory Leak |
| Medium   | 3     | Rendering, Compute |
| Low      | 1     | Minor Optimization |

Total: 7 findings (1 false positive excluded)

--------------------------------------------
FIX IMMEDIATELY
--------------------------------------------

1. N+1 query in user list endpoint [CONFIRMED by Queries, Compute]
   Location: api/users.ts:45
   Impact: ~500ms added per request with 100 users
   Fix: Use eager loading / JOIN instead of loop query

2. Memory leak from uncleared setInterval [CONFIRMED by Memory, Compute]
   Location: services/poller.ts:28
   Impact: Memory grows ~10MB/hour, eventual OOM
   Fix: Clear interval in cleanup/destroy handler

--------------------------------------------
FIX THIS SPRINT
--------------------------------------------

3. Importing entire lodash (527KB) for one function [LIKELY - Bundle]
4. Missing React.memo on frequently re-rendered list [LIKELY - Rendering]
5. Synchronous file read in API handler [LIKELY - Compute]

[Full report saved to docs/08-project/perf-audits/perf-audit-20260220.md]
```

---

<!-- COMPACT_SUMMARY_START -->
## Compact Summary

**Command**: `/agileflow:audit:performance` - Multi-agent performance bottleneck analysis with consensus

**Quick Usage**:
```
/agileflow:audit:performance app/                        # Quick scan (core 5 analyzers)
/agileflow:audit:performance . DEPTH=deep                # All 8 analyzers
/agileflow:audit:performance src/ FOCUS=queries,memory    # Specific areas
```

**What It Does**: Deploy performance analyzers in parallel -> Each finds different bottleneck classes -> Consensus coordinator validates, filters by project type, estimates impact -> Actionable Performance Audit Report

**Analyzers (Core 5 - quick mode)**:
- `perf-analyzer-queries` - N+1 queries, unindexed lookups, missing pagination, ORM anti-patterns
- `perf-analyzer-rendering` - Unnecessary re-renders, expensive computations in render, missing memoization
- `perf-analyzer-memory` - Memory leaks, event listener cleanup, closure captures, large object retention
- `perf-analyzer-bundle` - Large imports, no tree-shaking, missing dynamic imports, duplicate deps
- `perf-analyzer-compute` - Sync I/O, CPU-intensive loops, blocking operations, missing worker threads

**Analyzers (Deep mode adds 3 more)**:
- `perf-analyzer-network` - HTTP waterfall, missing batching, no compression, large payloads
- `perf-analyzer-caching` - Missing memoization, redundant computations, no HTTP cache headers
- `perf-analyzer-assets` - Unoptimized images, render-blocking resources, missing lazy loading

**Severity Levels** (impact-oriented):
- CRITICAL: P95 latency > 2x or causes timeout/OOM
- HIGH: Measurable user-facing impact
- MEDIUM: Optimization opportunity
- LOW: Micro-optimization

**Confidence Levels**:
- CONFIRMED: 2+ analyzers agree -> High priority
- LIKELY: 1 analyzer with evidence -> Medium priority
- INVESTIGATE: 1 analyzer, weak evidence -> Low priority

**Output**: `docs/08-project/perf-audits/perf-audit-{YYYYMMDD}.md`
<!-- COMPACT_SUMMARY_END -->

---

## Boundary Rules (No Overlap)

- **vs audit:logic**: No correctness bugs — only performance implications
- **vs audit:security**: No vulnerability analysis — only efficiency
- **vs performance agent**: The `performance.md` agent is a team member for story work. This is an on-demand analysis tool

---

## Integration with Babysit

When `/agileflow:babysit` completes implementation, it can run a quick performance audit:

```
Implementation complete. Running quick performance audit...

Performance Audit Results:
=========================
No critical bottlenecks found
1 HIGH issue detected:
   - api/users.ts:45 - N+1 query in loop (100+ DB calls per request)
     Confidence: CONFIRMED (Queries + Compute analyzers)

Fix before merging? [Y/n]
```

---

## Related Commands

- `/agileflow:audit:logic` - Logic bug analysis (similar architecture)
- `/agileflow:audit:security` - Security vulnerability analysis (similar architecture)
- `/agileflow:audit:legal` - Legal compliance analysis (similar architecture)
- `/agileflow:multi-expert` - General multi-expert analysis
- `/agileflow:verify` - Run tests
