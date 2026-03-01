---
description: Multi-agent architecture health analysis with consensus voting for coupling, layering, complexity, anti-patterns, and circular dependencies
argument-hint: "[file|directory] [DEPTH=quick|deep|ultradeep] [FOCUS=coupling|layering|complexity|patterns|circular|all] [MODEL=haiku|sonnet|opus]"
compact_context:
  priority: high
  preserve_rules:
    - "ACTIVE COMMAND: /agileflow:code:architecture - Multi-agent architecture health analysis"
    - "CRITICAL: Deploy analyzers IN PARALLEL in ONE message with multiple Task calls"
    - "CRITICAL: Wait for all results before running consensus (use TaskOutput with block=true)"
    - "CRITICAL: Severity scale: STRUCTURAL | DEGRADED | SMELL | STYLE"
    - "MUST parse arguments: TARGET (file/dir), DEPTH (quick/deep/ultradeep), FOCUS (coupling|layering|complexity|patterns|circular|all)"
    - "Pass consensus all analyzer outputs, let it synthesize the final report"
  state_fields:
    - target_path
    - depth
    - focus_areas
    - analyzers_deployed
    - findings_collected
---

# /agileflow:code:architecture

Deploy multiple specialized architecture analyzers in parallel to assess structural health, then synthesize results through consensus voting into a prioritized Architecture Audit Report with a health score.

---

## Quick Reference

```
/agileflow:code:architecture src/                               # Analyze src directory (quick, all 5 analyzers)
/agileflow:code:architecture . DEPTH=deep                       # Deep analysis - all severity levels
/agileflow:code:architecture src/ FOCUS=coupling,circular        # Focus on specific areas
/agileflow:code:architecture . DEPTH=deep FOCUS=all              # Comprehensive full audit
/agileflow:code:architecture . DEPTH=ultradeep                   # Each analyzer in its own tmux session
/agileflow:code:architecture lib/ FOCUS=complexity               # Check complexity only
```

---

## How It Works

```
┌─────────────────────────────────────────────────────────────┐
│                /agileflow:code:architecture                  │
│                                                              │
│  1. Parse arguments (target, depth, focus)                   │
│  2. Deploy analyzers IN PARALLEL                             │
│  3. Collect all findings                                     │
│  4. Run consensus coordinator to validate & score            │
│  5. Generate Architecture Audit Report with health score     │
└─────────────────────────────────────────────────────────────┘

   ┌──────────┐ ┌──────────┐ ┌────────────┐ ┌──────────┐ ┌──────────┐
   │ Coupling │ │ Layering │ │ Complexity │ │ Patterns │ │ Circular │
   └────┬─────┘ └────┬─────┘ └─────┬──────┘ └────┬─────┘ └────┬─────┘
        │            │             │              │            │
        └────────────┴─────────────┼──────────────┴────────────┘
                                   ▼
                    ┌──────────────────────┐
                    │  Consensus Coordinator│
                    │  (validates, scores, │
                    │   generates report)  │
                    └──────────────────────┘
```

---

## Arguments

| Argument | Values | Default | Description |
|----------|--------|---------|-------------|
| TARGET | file/directory | `.` | What to analyze |
| DEPTH | quick, deep, ultradeep | quick | quick = STRUCTURAL/DEGRADED only, deep = all severities, ultradeep = separate tmux |
| FOCUS | coupling,layering,complexity,patterns,circular,all | all | Which analyzers to deploy |
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
| `FOCUS=all` | All 5: coupling, layering, complexity, patterns, circular |
| `FOCUS=coupling` | arch-analyzer-coupling only |
| `FOCUS=layering` | arch-analyzer-layering only |
| `FOCUS=complexity` | arch-analyzer-complexity only |
| `FOCUS=patterns` | arch-analyzer-patterns only |
| `FOCUS=circular` | arch-analyzer-circular only |

**DEPTH behavior**:
- `quick` (default): Focus on STRUCTURAL and DEGRADED issues only.
- `deep`: Include SMELL and STYLE findings.
- `ultradeep`: Spawn each analyzer as a separate Claude Code session in tmux.

**ULTRADEEP mode** (DEPTH=ultradeep):
1. Show cost estimate: `node .agileflow/scripts/spawn-audit-sessions.js --audit=architecture --target=TARGET --focus=FOCUS --model=MODEL --dry-run`
2. Confirm with user before launching
3. Spawn sessions: `node .agileflow/scripts/spawn-audit-sessions.js --audit=architecture --target=TARGET --focus=FOCUS --model=MODEL`
4. Monitor sentinel files for completion
5. Collect all findings and run consensus coordinator
6. If tmux unavailable, fall back to `DEPTH=deep` with warning

### STEP 2: Deploy Analyzers in Parallel

**CRITICAL**: Deploy ALL selected analyzers in a SINGLE message with multiple Task calls.

**Prompt template for each analyzer**:

```
TASK: Analyze the following code for {ARCH_DOMAIN} issues.

TARGET: {file_path or directory}
DEPTH: {quick|deep}

{For quick depth}: Focus on STRUCTURAL and DEGRADED severity issues only. Skip style improvements.
{For deep depth}: Be comprehensive. Include SMELL and STYLE findings.

Read the target files and apply your analysis methodology.

OUTPUT your findings in your standard format (FINDING-N with location, severity, confidence, metric, code, explanation, remediation).

If no issues found, output: "No {ARCH_DOMAIN} issues found in {TARGET}"
```

**Deploy all 5 analyzers** using these subagent types:
- `arch-analyzer-coupling` - Fan-in/fan-out, module independence
- `arch-analyzer-layering` - Layer violations, import direction
- `arch-analyzer-complexity` - Cyclomatic/cognitive complexity, file size
- `arch-analyzer-patterns` - God objects, feature envy, anti-patterns
- `arch-analyzer-circular` - Circular deps, import cycles

### STEP 3: Collect Results

Wait for all analyzers to complete using TaskOutput with `block=true`.

### STEP 4: Run Consensus Coordinator

Pass all analyzer outputs to the consensus coordinator:

```xml
<invoke name="Task">
<parameter name="description">Architecture audit consensus</parameter>
<parameter name="prompt">You are the Architecture Consensus Coordinator.

TARGET: {target_path}
DEPTH: {depth}

## Analyzer Outputs

### Coupling Analyzer Results:
{coupling_output}

### Layering Analyzer Results:
{layering_output}

### Complexity Analyzer Results:
{complexity_output}

### Anti-Patterns Analyzer Results:
{patterns_output}

### Circular Dependencies Analyzer Results:
{circular_output}

---

Follow your consensus process:
1. Detect architecture pattern (Clean, MVC, Feature-based, etc.)
2. Parse all findings into normalized structure
3. Group related findings by module/area
4. Vote on confidence (CONFIRMED if 2+ agree, LIKELY if 1 with evidence)
5. Filter by architecture pattern relevance
6. Compute Architecture Health Score (0-100)
7. Generate the final Architecture Audit Report
8. Save report to docs/08-project/arch-audits/arch-audit-{YYYYMMDD}.md
</parameter>
<parameter name="subagent_type">arch-consensus</parameter>
</invoke>
```

### STEP 5: Present Results

After consensus completes, show the report summary and offer next steps:

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "Architecture audit complete: Health Score [N]/100 ([rating]). [N] findings across [files_count] files. Pattern: [arch_type].",
  "header": "Next steps",
  "multiSelect": false,
  "options": [
    {"label": "Fix [structural] Structural issues now (Recommended)", "description": "[top_issue_summary]"},
    {"label": "Create stories for all findings", "description": "Track [structural] structural + [degraded] degraded items in backlog"},
    {"label": "Re-run with DEPTH=deep", "description": "Current was quick - deep includes SMELL and STYLE findings"},
    {"label": "Save report and done", "description": "Report saved to docs/08-project/arch-audits/"}
  ]
}]</parameter>
</invoke>
```

---

<!-- COMPACT_SUMMARY_START -->
## Compact Summary

**Command**: `/agileflow:code:architecture` - Multi-agent architecture health analysis with consensus

**Quick Usage**:
```
/agileflow:code:architecture src/                         # Quick scan (all 5 analyzers)
/agileflow:code:architecture . DEPTH=deep                 # Comprehensive analysis
/agileflow:code:architecture lib/ FOCUS=coupling,circular  # Specific areas
```

**What It Does**: Deploy arch analyzers in parallel -> Each checks different structural aspects -> Consensus validates, computes health score -> Architecture Audit Report

**Analyzers (all 5)**:
- `arch-analyzer-coupling` - Fan-in/fan-out, tight coupling, shared state
- `arch-analyzer-layering` - Layer violations, import direction, mixed concerns
- `arch-analyzer-complexity` - Cyclomatic complexity, file size, nesting depth
- `arch-analyzer-patterns` - God objects, feature envy, data clumps, repeated switches
- `arch-analyzer-circular` - Import cycles, barrel file cycles, initialization order

**Severity Levels**:
- STRUCTURAL: Architecture actively impeding development
- DEGRADED: Growing problems, increasing maintenance cost
- SMELL: Early warning signs
- STYLE: Convention/consistency issues

**Output**: `docs/08-project/arch-audits/arch-audit-{YYYYMMDD}.md`
<!-- COMPACT_SUMMARY_END -->

---

## Boundary Rules (No Overlap)

- **vs code:security**: No vulnerability analysis - that's security domain
- **vs code:logic**: No logic bugs or edge cases - that's logic domain
- **vs code:performance**: No runtime performance - that's performance domain
- **Focus on structural health** - coupling, layering, complexity, patterns, cycles

---

## Related Commands

- `/agileflow:code:security` - Security vulnerability analysis
- `/agileflow:code:logic` - Logic bug analysis
- `/agileflow:code:performance` - Performance bottleneck analysis
- `/agileflow:impact` - Change impact analysis
- `/agileflow:deps` - Dependency graph visualization
