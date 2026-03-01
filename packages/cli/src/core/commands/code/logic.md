---
description: Multi-agent logic analysis with consensus voting for finding logic bugs
argument-hint: "[file|directory] [DEPTH=quick|deep|ultradeep] [FOCUS=edge|invariant|flow|type|race|all] [MODEL=haiku|sonnet|opus]"
compact_context:
  priority: high
  preserve_rules:
    - "ACTIVE COMMAND: /agileflow:code:logic - Multi-agent logic analysis"
    - "CRITICAL: Deploy analyzers IN PARALLEL in ONE message with multiple Task calls"
    - "CRITICAL: Wait for all results before running consensus (use TaskOutput with block=true)"
    - "CRITICAL: Confidence scoring: CONFIRMED (2+ agree), LIKELY (1 with evidence), INVESTIGATE (1 weak)"
    - "MUST parse arguments: TARGET (file/dir), DEPTH (quick/deep/ultradeep), FOCUS (edge/invariant/flow/type/race/all)"
    - "Pass consensus all analyzer outputs, let it synthesize the final report"
  state_fields:
    - target_path
    - depth
    - focus_areas
    - analyzers_deployed
    - findings_collected
---

# /agileflow:code:logic

Deploy multiple specialized logic analyzers in parallel to find bugs, then synthesize results through consensus voting.

---

## Quick Reference

```
/agileflow:code:logic src/utils.js                    # Analyze single file
/agileflow:code:logic src/ DEPTH=deep                 # Deep analysis of directory
/agileflow:code:logic . FOCUS=race,type               # Focus on race conditions and type issues
/agileflow:code:logic src/cart.js DEPTH=quick         # Quick scan of specific file
/agileflow:code:logic . DEPTH=ultradeep               # Each analyzer in its own tmux session
/agileflow:code:logic src/ MODEL=sonnet               # Use Sonnet for all analyzers
```

---

## How It Works

```
┌─────────────────────────────────────────────────────────────┐
│                 /agileflow:code:logic                       │
│                                                              │
│  1. Parse arguments (target, depth, focus)                   │
│  2. Deploy 5 analyzers IN PARALLEL                           │
│  3. Collect all findings                                     │
│  4. Run consensus coordinator to validate & prioritize       │
│  5. Generate actionable report                               │
└─────────────────────────────────────────────────────────────┘

        ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐
        │  Edge   │  │Invariant│  │  Flow   │  │  Type   │  │  Race   │
        │Analyzer │  │Analyzer │  │Analyzer │  │Analyzer │  │Analyzer │
        └────┬────┘  └────┬────┘  └────┬────┘  └────┬────┘  └────┬────┘
             │            │            │            │            │
             └────────────┴────────────┼────────────┴────────────┘
                                       ▼
                          ┌─────────────────────────┐
                          │   Consensus Coordinator │
                          │   (validates, votes,    │
                          │    generates report)    │
                          └─────────────────────────┘
```

---

## Arguments

| Argument | Values | Default | Description |
|----------|--------|---------|-------------|
| TARGET | file/directory | `.` | What to analyze |
| DEPTH | quick, deep, ultradeep | quick | quick = high-impact only, deep = comprehensive, ultradeep = separate tmux sessions |
| FOCUS | edge,invariant,flow,type,race,all | all | Which analyzers to deploy |
| MODEL | haiku, sonnet, opus | haiku | Model for analyzer subagents. Default preserves existing behavior. |

---

## Step-by-Step Process

### STEP 1: Parse Arguments

```
TARGET = first argument or current directory
DEPTH = quick (default), deep, or ultradeep
FOCUS = all (default) or comma-separated list
```

**ULTRADEEP mode** (DEPTH=ultradeep):
1. Show cost estimate:
   ```bash
   node .agileflow/scripts/spawn-audit-sessions.js --audit=logic --target=TARGET --focus=FOCUS --model=MODEL --dry-run
   ```
2. Confirm with user before launching
3. Spawn sessions (use `--json` to capture trace ID):
   ```bash
   node .agileflow/scripts/spawn-audit-sessions.js --audit=logic --target=TARGET --focus=FOCUS --model=MODEL --json
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

**Analyzer Selection by FOCUS**:

| FOCUS | Analyzers |
|-------|-----------|
| `all` | edge, invariant, flow, type, race (5 total) |
| `edge` | logic-analyzer-edge only |
| `invariant` | logic-analyzer-invariant only |
| `flow` | logic-analyzer-flow only |
| `type` | logic-analyzer-type only |
| `race` | logic-analyzer-race only |
| `edge,type` | logic-analyzer-edge + logic-analyzer-type |

### STEP 2: Deploy Analyzers in Parallel

**CRITICAL**: Deploy ALL selected analyzers in a SINGLE message with multiple Task calls.

**Prompt template for each analyzer**:

```
TASK: Analyze the following code for {FOCUS_AREA} issues.

TARGET: {file_path or directory}
DEPTH: {quick|deep}

{For quick depth}: Focus on high-impact issues only (P0/P1). Skip minor concerns.
{For deep depth}: Be comprehensive. Include P2 issues and potential concerns.

Read the target files and apply your analysis methodology.

OUTPUT your findings in your standard format (FINDING-N with location, severity, code, explanation, fix).

If no issues found, output: "No {FOCUS_AREA} issues found in {TARGET}"
```

**Example deployment (FOCUS=all)**:

```xml
<invoke name="Task">
<parameter name="description">Edge case analysis</parameter>
<parameter name="prompt">TASK: Analyze the following code for EDGE CASE issues...
TARGET: src/utils.js
DEPTH: quick
...</parameter>
<parameter name="subagent_type">logic-analyzer-edge</parameter>
<parameter name="run_in_background">true</parameter>
</invoke>

<invoke name="Task">
<parameter name="description">Invariant analysis</parameter>
<parameter name="prompt">TASK: Analyze the following code for INVARIANT issues...
TARGET: src/utils.js
DEPTH: quick
...</parameter>
<parameter name="subagent_type">logic-analyzer-invariant</parameter>
<parameter name="run_in_background">true</parameter>
</invoke>

<invoke name="Task">
<parameter name="description">Control flow analysis</parameter>
<parameter name="prompt">TASK: Analyze the following code for CONTROL FLOW issues...
TARGET: src/utils.js
DEPTH: quick
...</parameter>
<parameter name="subagent_type">logic-analyzer-flow</parameter>
<parameter name="run_in_background">true</parameter>
</invoke>

<invoke name="Task">
<parameter name="description">Type safety analysis</parameter>
<parameter name="prompt">TASK: Analyze the following code for TYPE SAFETY issues...
TARGET: src/utils.js
DEPTH: quick
...</parameter>
<parameter name="subagent_type">logic-analyzer-type</parameter>
<parameter name="run_in_background">true</parameter>
</invoke>

<invoke name="Task">
<parameter name="description">Race condition analysis</parameter>
<parameter name="prompt">TASK: Analyze the following code for RACE CONDITION issues...
TARGET: src/utils.js
DEPTH: quick
...</parameter>
<parameter name="subagent_type">logic-analyzer-race</parameter>
<parameter name="run_in_background">true</parameter>
</invoke>
```

### STEP 3: Collect Results

Wait for all analyzers to complete:

```xml
<invoke name="TaskOutput">
<parameter name="task_id">{edge_id}</parameter>
<parameter name="block">true</parameter>
</invoke>

<invoke name="TaskOutput">
<parameter name="task_id">{invariant_id}</parameter>
<parameter name="block">true</parameter>
</invoke>

<!-- ... collect all results ... -->
```

### STEP 4: Run Consensus Coordinator

Pass all analyzer outputs to the consensus coordinator:

```xml
<invoke name="Task">
<parameter name="description">Logic audit consensus</parameter>
<parameter name="prompt">You are the Logic Consensus Coordinator.

TARGET: {target_path}
DEPTH: {depth}

## Analyzer Outputs

### Edge Analyzer Results:
{edge_output}

### Invariant Analyzer Results:
{invariant_output}

### Flow Analyzer Results:
{flow_output}

### Type Analyzer Results:
{type_output}

### Race Analyzer Results:
{race_output}

---

Follow your consensus process:
1. Parse all findings
2. Group related findings by location
3. Vote on confidence (CONFIRMED if 2+ agree, LIKELY if 1 with evidence)
4. Resolve any contradictions
5. Generate the final Logic Audit Report
</parameter>
<parameter name="subagent_type">logic-consensus</parameter>
</invoke>
```

### STEP 5: Present Results

After consensus completes, show the report summary and offer next steps:

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "Logic audit: [N] findings ([critical] CONFIRMED, [likely] LIKELY). [files_count] files analyzed.",
  "header": "Next steps",
  "multiSelect": false,
  "options": [
    {"label": "Fix [critical] CONFIRMED issues now (Recommended)", "description": "[top_issue_summary] at [file:line] - [fix_hint]"},
    {"label": "Create [N] stories for all findings", "description": "Track [critical] critical + [high] high priority items in backlog"},
    {"label": "Re-run with DEPTH=deep on [target]", "description": "Current was quick - deep adds P2 issues and comprehensive coverage"},
    {"label": "Save report and done", "description": "Report saved to docs/08-project/logic-audits/"}
  ]
}]</parameter>
</invoke>
```

---

## Example Output

```
🔍 Logic Audit: src/cart.js
══════════════════════════════════════════════════════════════

Deploying 5 logic analyzers...
✓ Edge Analyzer
✓ Invariant Analyzer
✓ Flow Analyzer
✓ Type Analyzer
✓ Race Analyzer

Running consensus...
✓ Consensus complete

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 SUMMARY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

| Priority | Count |
|----------|-------|
| Critical | 1     |
| High     | 2     |
| Medium   | 3     |
| Low      | 1     |

Total: 7 findings (2 false positives excluded)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🚨 CRITICAL (Fix Immediately)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. Race condition in addItem [CONFIRMED by Invariant, Race]
   Location: cart.js:42
   Impact: Lost cart items when adding quickly
   Fix: Add operation serialization

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️  HIGH PRIORITY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

2. Empty cart not handled in checkout [CONFIRMED by Edge, Flow]
3. Type coercion in price calculation [LIKELY - Type]

[Full report saved to docs/08-project/logic-audits/logic-audit-20260203.md]
```

---

<!-- COMPACT_SUMMARY_START -->
## Compact Summary

**Command**: `/agileflow:code:logic` - Multi-agent logic analysis with consensus

**Quick Usage**:
```
/agileflow:code:logic src/utils.js                # Single file
/agileflow:code:logic src/ DEPTH=deep            # Deep analysis
/agileflow:code:logic . FOCUS=race,type          # Specific analyzers
```

**What It Does**: Deploy 5 logic analyzers in parallel → Each finds different bug classes → Consensus coordinator validates and prioritizes → Actionable report

**Analyzers**:
- `logic-analyzer-edge` - Boundary conditions, off-by-one
- `logic-analyzer-invariant` - State consistency, contracts
- `logic-analyzer-flow` - Dead code, infinite loops, missing returns
- `logic-analyzer-type` - Type coercion, null propagation
- `logic-analyzer-race` - Race conditions, async issues

**Confidence Levels**:
- CONFIRMED: 2+ analyzers agree → High priority
- LIKELY: 1 analyzer with evidence → Medium priority
- INVESTIGATE: 1 analyzer, weak evidence → Low priority

**Output**: `docs/08-project/logic-audits/logic-audit-{YYYYMMDD}.md`
<!-- COMPACT_SUMMARY_END -->

---

## Integration with Babysit

When `/agileflow:babysit` completes implementation, it can run a quick logic audit:

```
📍 Implementation complete. Running quick logic audit...

🔍 Logic Audit Results:
━━━━━━━━━━━━━━━━━━━━━━
✅ No critical issues found
⚠️  1 LIKELY issue detected:
   - cart.js:42 - Array index could be -1 if items empty
     Confidence: 2/3 (Edge, Flow agree; Invariant disagrees)

Proceed with tests? [Y/n]
```

To integrate with babysit, add to implementation workflow:
1. Complete implementation
2. Run `/agileflow:code:logic {changed_files} DEPTH=quick`
3. If critical issues → block, show findings
4. If no critical → proceed to tests

---

## Related Commands

- `/agileflow:review` - Code review (includes some logic checks)
- `/agileflow:multi-expert` - General multi-expert analysis
- `/agileflow:ideate:new` - Improvement ideation
- `/agileflow:verify` - Run tests
