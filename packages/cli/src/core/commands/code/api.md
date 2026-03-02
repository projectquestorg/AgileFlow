---
description: Multi-agent API design quality analysis with consensus voting for REST conventions, error handling, versioning, pagination, and documentation
argument-hint: "[file|directory] [DEPTH=quick|deep|ultradeep|extreme] [FOCUS=conventions|errors|versioning|pagination|docs|all] [MODEL=haiku|sonnet|opus]"
compact_context:
  priority: high
  preserve_rules:
    - "ACTIVE COMMAND: /agileflow:code:api - Multi-agent API design quality analysis"
    - "CRITICAL: Deploy analyzers IN PARALLEL in ONE message with multiple Task calls"
    - "CRITICAL: Wait for all results before running consensus (use TaskOutput with block=true)"
    - "CRITICAL: Severity scale: BREAKING | INCONSISTENT | GAP | POLISH"
    - "MUST parse arguments: TARGET (file/dir), DEPTH (quick/deep/ultradeep), FOCUS (conventions|errors|versioning|pagination|docs|all)"
    - "Pass consensus all analyzer outputs, let it synthesize the final report"
  state_fields:
    - target_path
    - depth
    - focus_areas
    - analyzers_deployed
    - findings_collected
---

# /agileflow:code:api

Deploy multiple specialized API quality analyzers in parallel to assess API design maturity, then synthesize results through consensus voting into a prioritized API Quality Report with a maturity score.

---

## Quick Reference

```
/agileflow:code:api app/api/                                  # Analyze API routes (quick, all 5 analyzers)
/agileflow:code:api . DEPTH=deep                               # Deep analysis - all severity levels
/agileflow:code:api routes/ FOCUS=conventions,errors            # Focus on specific areas
/agileflow:code:api . DEPTH=deep FOCUS=all                     # Comprehensive full audit
/agileflow:code:api . DEPTH=ultradeep                           # Each analyzer in its own tmux session
/agileflow:code:api src/api/ FOCUS=pagination                   # Check pagination only
```

---

## How It Works

```
┌─────────────────────────────────────────────────────────────┐
│                    /agileflow:code:api                       │
│                                                              │
│  1. Parse arguments (target, depth, focus)                   │
│  2. Deploy analyzers IN PARALLEL                             │
│  3. Collect all findings                                     │
│  4. Run consensus coordinator to validate & score            │
│  5. Generate API Quality Report with maturity score          │
└─────────────────────────────────────────────────────────────┘

   ┌────────────┐ ┌────────┐ ┌────────────┐ ┌────────────┐ ┌──────┐
   │Conventions │ │ Errors │ │ Versioning │ │ Pagination │ │ Docs │
   └─────┬──────┘ └───┬────┘ └─────┬──────┘ └─────┬──────┘ └──┬───┘
         │            │            │               │           │
         └────────────┴────────────┼───────────────┴───────────┘
                                   ▼
                    ┌──────────────────────┐
                    │  Consensus Coordinator│
                    │  (validates, scores, │
                    │   endpoint matrix)   │
                    └──────────────────────┘
```

---

## Arguments

| Argument | Values | Default | Description |
|----------|--------|---------|-------------|
| TARGET | file/directory | `.` | What to analyze |
| DEPTH | quick, deep, ultradeep | quick | quick = BREAKING/INCONSISTENT only, deep = all severities, ultradeep = separate tmux |
| FOCUS | conventions,errors,versioning,pagination,docs,all | all | Which analyzers to deploy |
| MODEL | haiku, sonnet, opus | haiku | Model for analyzer subagents |

---

## Step-by-Step Process

### STEP 1: Parse Arguments

```
TARGET = first argument or current directory
DEPTH = quick (default) or deep or ultradeep
FOCUS = all (default) or comma-separated list
```

**Analyzer Selection**:

| Condition | Analyzers Deployed |
|-----------|-------------------|
| `FOCUS=all` | All 5: conventions, errors, versioning, pagination, docs |
| `FOCUS=conventions` | api-quality-analyzer-conventions only |
| `FOCUS=errors` | api-quality-analyzer-errors only |
| `FOCUS=versioning` | api-quality-analyzer-versioning only |
| `FOCUS=pagination` | api-quality-analyzer-pagination only |
| `FOCUS=docs` | api-quality-analyzer-docs only |

**DEPTH behavior**:
- `quick` (default): Focus on BREAKING and INCONSISTENT issues only.
- `deep`: Include GAP and POLISH findings.
- `ultradeep`: Spawn each analyzer as a separate Claude Code session in tmux.

**ULTRADEEP mode** (DEPTH=ultradeep):
1. Show cost estimate:
   ```bash
   node .agileflow/scripts/spawn-audit-sessions.js --audit=api --target=TARGET --focus=FOCUS --model=MODEL --dry-run
   ```
2. Confirm with user before launching
3. Spawn sessions (use `--json` to capture trace ID):
   ```bash
   node .agileflow/scripts/spawn-audit-sessions.js --audit=api --target=TARGET --focus=FOCUS --model=MODEL --json
   ```
   Parse the JSON output to get `traceId`. Example: `{"ok":true,"traceId":"abc123ef",...}`
4. Wait for all analyzers to complete:
   ```bash
   node .agileflow/scripts/lib/tmux-audit-monitor.js wait TRACE_ID --timeout=1800
   ```
   - Exit 0 = all complete (JSON results on stdout)
   - Exit 1 = timeout (partial results on stdout, `missing` array shows what's left)
   - To check progress without blocking: `node .agileflow/scripts/lib/tmux-audit-monitor.js status TRACE_ID`
   - To retry stalled analyzers: `node .agileflow/scripts/lib/tmux-audit-monitor.js retry TRACE_ID`
5. Parse `results` array from the JSON output. Pass all findings to consensus coordinator (same as deep mode).
6. If tmux unavailable (spawn exits code 2), fall back to `DEPTH=deep` with warning

**EXTREME mode** (DEPTH=extreme):
Partition-based multi-agent audit. Instead of 1 analyzer per tmux window, the codebase is split into partitions and each partition runs ALL analyzers.
1. Scan the target directory to understand the codebase structure:
   - Use Glob to find top-level source directories
   - Group related directories into 3-7 logical partitions (coherent domains: auth, api, ui, etc.)
   - If user provided PARTITIONS=N (a number), split into exactly N partitions
   - If user provided PARTITIONS=dir1,dir2,dir3, use those exact directories
2. Show the partition plan and agent count to the user, confirm before launching:
   Example: "5 partitions x 5 analyzers = 25 agents. Estimated cost: $X. Proceed?"
3. Spawn sessions with partitions:
   ```bash
   node .agileflow/scripts/spawn-audit-sessions.js --audit=api --target=TARGET --depth=extreme --partitions=dir1,dir2,dir3 --model=MODEL --json
   ```
4. Wait and collect results (same as ultradeep - use tmux-audit-monitor.js)
5. Run consensus on combined results from all partitions

**PARTITIONS argument** (only used with DEPTH=extreme):
| Value | Behavior |
|-------|----------|
| Not set | AI decides partitions (3-7 based on codebase size) |
| `PARTITIONS=5` | AI creates exactly 5 partitions |
| `PARTITIONS=src/auth,src/api,lib` | Use these exact directories |

### STEP 2: Deploy Analyzers in Parallel

**CRITICAL**: Deploy ALL selected analyzers in a SINGLE message with multiple Task calls.

**Prompt template for each analyzer**:

```
TASK: Analyze the following code for {API_DOMAIN} quality issues.

TARGET: {file_path or directory}
DEPTH: {quick|deep}

{For quick depth}: Focus on BREAKING and INCONSISTENT severity issues only. Skip polish items.
{For deep depth}: Be comprehensive. Include GAP and POLISH findings.

Read the target files and apply your analysis methodology.

OUTPUT your findings in your standard format (FINDING-N with location, severity, confidence, endpoint, code, explanation, remediation).

If no issues found, output: "No {API_DOMAIN} issues found in {TARGET}"
```

**Deploy all 5 analyzers** using these subagent types:
- `api-quality-analyzer-conventions` - REST naming, HTTP methods, URL structure
- `api-quality-analyzer-errors` - Error format, status codes, error handling
- `api-quality-analyzer-versioning` - Breaking changes, deprecation, backward compat
- `api-quality-analyzer-pagination` - Cursor/offset, limits, totals, collections
- `api-quality-analyzer-docs` - OpenAPI coverage, examples, documentation

### STEP 3: Collect Results

Wait for all analyzers to complete using TaskOutput with `block=true`.

### STEP 4: Run Consensus Coordinator

Pass all analyzer outputs to the consensus coordinator:

```xml
<invoke name="Task">
<parameter name="description">API quality audit consensus</parameter>
<parameter name="prompt">You are the API Quality Consensus Coordinator.

TARGET: {target_path}
DEPTH: {depth}

## Analyzer Outputs

### Conventions Analyzer Results:
{conventions_output}

### Error Handling Analyzer Results:
{errors_output}

### Versioning Analyzer Results:
{versioning_output}

### Pagination Analyzer Results:
{pagination_output}

### Documentation Analyzer Results:
{docs_output}

---

Follow your consensus process:
1. Detect API type (REST, GraphQL, gRPC, tRPC, Hybrid)
2. Parse all findings into normalized structure
3. Group related findings by endpoint
4. Vote on confidence (CONFIRMED if 2+ agree, LIKELY if 1 with evidence)
5. Filter by API type relevance
6. Compute API Maturity Score (0-100)
7. Generate endpoint matrix with quality grades
8. Generate the final API Quality Report
9. Save report to docs/08-project/api-audits/api-audit-{YYYYMMDD}.md
</parameter>
<parameter name="subagent_type">api-quality-consensus</parameter>
</invoke>
```

### STEP 5: Present Results

After consensus completes, show the report summary and offer next steps:

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "API quality audit complete: Maturity Score [N]/100 ([rating]). [endpoints] endpoints analyzed. API type: [type].",
  "header": "Next steps",
  "multiSelect": false,
  "options": [
    {"label": "Fix [breaking] Breaking issues now (Recommended)", "description": "[top_issue_summary]"},
    {"label": "Create stories for all findings", "description": "Track [breaking] breaking + [inconsistent] inconsistent items"},
    {"label": "Re-run with DEPTH=deep", "description": "Current was quick - deep includes GAP and POLISH findings"},
    {"label": "Save report and done", "description": "Report saved to docs/08-project/api-audits/"}
  ]
}]</parameter>
</invoke>
```

---

<!-- COMPACT_SUMMARY_START -->
## Compact Summary

**Command**: `/agileflow:code:api` - Multi-agent API design quality analysis with consensus

**Quick Usage**:
```
/agileflow:code:api app/api/                            # Quick scan (all 5 analyzers)
/agileflow:code:api . DEPTH=deep                        # Comprehensive analysis
/agileflow:code:api routes/ FOCUS=conventions,errors     # Specific areas
```

**What It Does**: Deploy API quality analyzers in parallel -> Each checks different API design aspects -> Consensus validates, computes maturity score, builds endpoint matrix -> API Quality Report

**Analyzers (all 5)**:
- `api-quality-analyzer-conventions` - REST naming, HTTP methods, URL structure, consistency
- `api-quality-analyzer-errors` - Error format, status codes, error handling, validation feedback
- `api-quality-analyzer-versioning` - Breaking changes, deprecation, backward compatibility
- `api-quality-analyzer-pagination` - Collection endpoints, page sizes, metadata, consistency
- `api-quality-analyzer-docs` - OpenAPI coverage, examples, request/response schemas

**Severity Levels**:
- BREAKING: Clients break or can't use the API correctly
- INCONSISTENT: Mixed patterns across endpoints
- GAP: Missing best practice or feature
- POLISH: Minor improvement opportunity

**Output**: `docs/08-project/api-audits/api-audit-{YYYYMMDD}.md`
<!-- COMPACT_SUMMARY_END -->

---

## Boundary Rules (No Overlap)

- **vs code:security**: No injection, auth bypass, XSS - those are security domain
- **vs code:performance**: No N+1 queries, slow endpoints - those are performance domain
- **vs code:completeness**: No missing handlers or dead endpoints - those are completeness domain
- **Focus on API design quality** - conventions, errors, versioning, pagination, documentation

---

## Related Commands

- `/agileflow:code:security` - Security vulnerability analysis (includes API security)
- `/agileflow:code:performance` - Performance analysis (includes query optimization)
- `/agileflow:code:completeness` - Completeness analysis (includes endpoint mismatches)
- `/agileflow:docs` - Documentation synchronization
