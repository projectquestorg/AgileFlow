---
description: Multi-agent user flow integrity analysis - traces user journeys end-to-end through code to find silently broken flows
argument-hint: "[file|directory] [DEPTH=quick|deep|ultradeep|extreme] [FLOWS=signup,checkout,...] [MODEL=haiku|sonnet|opus]"
compact_context:
  priority: high
  preserve_rules:
    - "ACTIVE COMMAND: /agileflow:code:flows - Multi-agent user flow integrity analysis"
    - "CRITICAL: Run flow-analyzer-discovery FIRST, then deploy concern analyzers IN PARALLEL"
    - "CRITICAL: Wait for all results before running flow-consensus (use TaskOutput with block=true)"
    - "CRITICAL: Severity scale: BROKEN > DEGRADED > CONFUSING > FRICTION"
    - "CRITICAL: Confidence scoring: CONFIRMED (2+ agree on same flow step), LIKELY (1 with evidence), INVESTIGATE (1 weak)"
    - "MUST parse arguments: TARGET (file/dir), DEPTH (quick/deep/ultradeep), FLOWS (optional filter)"
    - "Discovery runs first to produce flow map, then concern analyzers receive the flow map"
    - "DEPTH GATE: ultradeep/extreme MUST spawn tmux sessions via spawn-audit-sessions.js — NEVER deploy in-process"
    - "Use check-sessions.js to monitor spawned tmux sessions — NEVER write custom polling scripts"
  state_fields:
    - target_path
    - depth
    - flows_filter
    - flow_map
    - analyzers_deployed
    - findings_collected
---

# /agileflow:code:flows

Deploy a flow discovery agent followed by specialized concern analyzers in parallel to trace user journeys end-to-end through your codebase, then synthesize results through consensus voting into a prioritized Flow Integrity Report with per-journey verdicts.

---

## Quick Reference

```
/agileflow:code:flows app/                                    # Analyze app directory (quick, core 4 analyzers)
/agileflow:code:flows . DEPTH=deep                            # Deep analysis - all 6 analyzers
/agileflow:code:flows src/ FLOWS=signup,checkout               # Focus on specific flows
/agileflow:code:flows . DEPTH=deep FLOWS=all                   # Comprehensive full audit
```

---

## How It Works

```
┌─────────────────────────────────────────────────────────────┐
│                  /agileflow:code:flows                       │
│                                                              │
│  1. Parse arguments (target, depth, flows filter)            │
│  2. Run DISCOVERY AGENT (finds all user flows)               │
│  3. Deploy CONCERN ANALYZERS in parallel (with flow map)     │
│  4. Run CONSENSUS to validate, correlate, & produce verdicts │
│  5. Generate actionable Flow Integrity Report                │
└─────────────────────────────────────────────────────────────┘

                    ┌───────────────┐
                    │   Discovery   │ ← Runs FIRST
                    │  (flow map)   │
                    └───────┬───────┘
                            │ flow map passed to all analyzers
          ┌─────────┬───────┼───────┬──────────┐
          ▼         ▼       ▼       ▼          ▼
     ┌─────────┐ ┌────────┐ ┌──────┐ ┌──────┐
     │ Wiring  │ │Feedback│ │Persis│ │Errors│ (quick = core 4)
     └────┬────┘ └───┬────┘ └──┬───┘ └──┬───┘
          │          │         │        │
     ┌────┴──────┐ ┌─┴────────────┐          (deep adds 2)
     │Navigation │ │Authorization │
     └────┬──────┘ └─┬────────────┘
          │          │
          └────┬─────┘
               ▼
     ┌──────────────────────┐
     │   Flow Consensus     │
     │ (verdicts per journey│
     │  + ranked findings)  │
     └──────────────────────┘
```

---

## Arguments

| Argument | Values | Default | Description |
|----------|--------|---------|-------------|
| TARGET | file/directory | `.` | What to analyze |
| DEPTH | quick, deep, ultradeep, extreme | quick | quick = core 4, deep = all 6, ultradeep = tmux sessions, extreme = partitioned |
| FLOWS | comma-separated flow names | all | Filter to specific flows (e.g., `signup,checkout`) |
| MODEL | haiku, sonnet, opus | haiku | Model for analyzer subagents |

---

## Severity Scale (User Experience Impact)

| Severity | Definition | Example |
|----------|------------|---------|
| **BROKEN** | Flow silently fails - user action has no effect or causes data loss | Payment API never called, form data only in state (lost on refresh) |
| **DEGRADED** | Flow completes but loses data, skips steps, or produces wrong result | Fields silently dropped, success shown before API responds |
| **CONFUSING** | Flow works but user gets wrong feedback or ends up in wrong place | Generic error message, redirect to homepage instead of dashboard |
| **FRICTION** | Flow works correctly but the experience is unnecessarily painful | No loading indicator, dead-end error page, no retry option |

---

## Step-by-Step Process

### STEP 1: Parse Arguments

```
TARGET = first argument or current directory
DEPTH = quick (default) or deep
FLOWS = all (default) or comma-separated list
```

**Analyzer Selection**:

| Condition | Analyzers Deployed |
|-----------|-------------------|
| `DEPTH=quick` (default) | wiring, feedback, persistence, errors (core 4) |
| `DEPTH=deep` | All 6 analyzers (adds navigation, authorization) |
| Specific FLOWS | All selected analyzers, but filtered to specified flows only |

---

### DEPTH ROUTING GATE

| DEPTH | Route |
|-------|-------|
| `quick` or `deep` | Continue to STEP 2 below |
| `ultradeep` | STOP. Follow ULTRADEEP instructions below. Do NOT proceed to STEP 2. |
| `extreme` | STOP. Follow EXTREME instructions below. Do NOT proceed to STEP 2. |

**ULTRADEEP mode** (DEPTH=ultradeep):
1. Show cost estimate:
   ```bash
   node .agileflow/scripts/spawn-audit-sessions.js --audit=flows --target=TARGET --model=MODEL --dry-run
   ```
2. Confirm with user before launching
3. Spawn sessions:
   ```bash
   node .agileflow/scripts/spawn-audit-sessions.js --audit=flows --target=TARGET --model=MODEL --json
   ```
4. Wait for completion:
   ```bash
   node .agileflow/scripts/check-sessions.js wait TRACE_ID --timeout=1800
   ```
5. Parse results, pass to consensus
6. Falls back to `deep` if tmux unavailable

**EXTREME mode** (DEPTH=extreme):
1. Partition codebase into logical domains
2. Run all analyzers per partition
3. Same spawn/wait pattern as ultradeep with `--depth=extreme --partitions=...`

**CRITICAL**: STEP 2 is for `quick`/`deep` ONLY.

---

### STEP 2: Run Discovery Agent

**IMPORTANT**: Discovery runs FIRST, before any concern analyzers. The concern analyzers need the flow map.

```xml
<invoke name="Task">
<parameter name="description">Discover user flows</parameter>
<parameter name="prompt">TASK: Discover all user-facing flows in this codebase.

TARGET: {target_path}
{If FLOWS specified}: FILTER: Only discover these flows: {flows_filter}

Scan the codebase for all user-initiated actions (forms, buttons, CRUD, auth flows, etc.).
Group related actions into higher-level journeys.
Output the flow map in your standard format.

Be exhaustive - find ALL user-facing flows.</parameter>
<parameter name="subagent_type">flow-analyzer-discovery</parameter>
</invoke>
```

Wait for discovery to complete before proceeding.

### STEP 3: Deploy Concern Analyzers in Parallel

**CRITICAL**: Deploy ALL selected analyzers in a SINGLE message with multiple Task calls. Pass the flow map from discovery to each analyzer.

**Prompt template for each analyzer**:

```
TASK: Analyze the following user flows for {CONCERN} issues.

TARGET: {target_path}
DEPTH: {quick|deep}

## Flow Map (from discovery)
{paste the full flow map output from Step 2}

{For quick depth}: Focus on BROKEN and DEGRADED severity issues only. Skip CONFUSING and FRICTION.
{For deep depth}: Be comprehensive. Include CONFUSING and FRICTION findings.

For each discovered journey and action, trace through the code and check for {CONCERN} issues.

OUTPUT your findings in your standard format.
If no issues found, output: "No {CONCERN} issues found in any flows"
```

**Example deployment (DEPTH=quick - deploys core 4)**:

```xml
<invoke name="Task">
<parameter name="description">Flow wiring analysis</parameter>
<parameter name="prompt">TASK: Analyze user flows for CHAIN CONNECTIVITY issues...
{flow map}
...</parameter>
<parameter name="subagent_type">flow-analyzer-wiring</parameter>
<parameter name="run_in_background">true</parameter>
</invoke>

<invoke name="Task">
<parameter name="description">Flow feedback analysis</parameter>
<parameter name="prompt">TASK: Analyze user flows for USER FEEDBACK STATE issues...
{flow map}
...</parameter>
<parameter name="subagent_type">flow-analyzer-feedback</parameter>
<parameter name="run_in_background">true</parameter>
</invoke>

<invoke name="Task">
<parameter name="description">Flow persistence analysis</parameter>
<parameter name="prompt">TASK: Analyze user flows for DATA PERSISTENCE issues...
{flow map}
...</parameter>
<parameter name="subagent_type">flow-analyzer-persistence</parameter>
<parameter name="run_in_background">true</parameter>
</invoke>

<invoke name="Task">
<parameter name="description">Flow error path analysis</parameter>
<parameter name="prompt">TASK: Analyze user flows for ERROR HANDLING AND RECOVERY issues...
{flow map}
...</parameter>
<parameter name="subagent_type">flow-analyzer-errors</parameter>
<parameter name="run_in_background">true</parameter>
</invoke>
```

**For DEPTH=deep, also deploy**:

```xml
<invoke name="Task">
<parameter name="description">Flow navigation analysis</parameter>
<parameter name="prompt">TASK: Analyze user flows for NAVIGATION AND ROUTING issues...
{flow map}
...</parameter>
<parameter name="subagent_type">flow-analyzer-navigation</parameter>
<parameter name="run_in_background">true</parameter>
</invoke>

<invoke name="Task">
<parameter name="description">Flow authorization analysis</parameter>
<parameter name="prompt">TASK: Analyze user flows for AUTHORIZATION HANDLING issues...
{flow map}
...</parameter>
<parameter name="subagent_type">flow-analyzer-authorization</parameter>
<parameter name="run_in_background">true</parameter>
</invoke>
```

### STEP 4: Collect Results

Wait for all analyzers to complete using TaskOutput with block=true.

### STEP 5: Run Consensus Coordinator

Pass the flow map AND all analyzer outputs to the consensus coordinator:

```xml
<invoke name="Task">
<parameter name="description">Flow integrity consensus</parameter>
<parameter name="prompt">You are the Flow Integrity Consensus Coordinator.

TARGET: {target_path}
DEPTH: {depth}

## Flow Map (from discovery)
{discovery_output}

## Analyzer Outputs

### Wiring Analyzer Results:
{wiring_output}

### Feedback Analyzer Results:
{feedback_output}

### Persistence Analyzer Results:
{persistence_output}

### Errors Analyzer Results:
{errors_output}

{If deep depth:}
### Navigation Analyzer Results:
{navigation_output}

### Authorization Analyzer Results:
{authorization_output}

---

Follow your consensus process:
1. Parse the flow map to understand all journeys
2. Normalize all findings
3. Correlate findings per journey
4. Vote on confidence (CONFIRMED if 2+ analyzers flag same flow step)
5. Produce journey verdicts (PASS/WARNING/DEGRADED/BROKEN)
6. Generate the final Flow Integrity Report
7. Save report to docs/08-project/flow-audits/flow-audit-{YYYYMMDD}.md
</parameter>
<parameter name="subagent_type">flow-consensus</parameter>
</invoke>
```

### STEP 6: Present Results

After consensus completes, show the report summary and offer next steps:

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "Flow audit complete: [journeys_count] journeys analyzed, [pass_count] passing, [broken_count] broken. [findings_count] findings across [analyzers_count] analyzers.",
  "header": "Next steps",
  "multiSelect": false,
  "options": [
    {"label": "Fix [broken_count] broken flows now (Recommended)", "description": "[top_journey]: [top_issue] - most impactful for users"},
    {"label": "Create stories for all findings", "description": "Track [total] findings across [journeys] in backlog"},
    {"label": "Re-run with DEPTH=deep", "description": "Current was quick (4 analyzers) - deep adds Navigation, Authorization"},
    {"label": "Save report and done", "description": "Report saved to docs/08-project/flow-audits/"}
  ]
}]</parameter>
</invoke>
```

---

## Example Output

```
Flow Integrity Audit: src/
══════════════════════════════════════════════════════════════

Phase 1: Discovering user flows...
✓ Found 8 journeys, 12 standalone actions

Phase 2: Deploying 4 concern analyzers (quick mode)...
✓ Wiring Analyzer
✓ Feedback Analyzer
✓ Persistence Analyzer
✓ Errors Analyzer

Phase 3: Running consensus...
✓ Consensus complete

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 FLOW VERDICTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

| Journey          | Steps | Verdict   | Worst Finding                         |
|------------------|-------|-----------|---------------------------------------|
| User Signup      | 4     | PASS      | -                                     |
| Checkout         | 6     | BROKEN    | Payment API never called (Step 4)     |
| Password Reset   | 3     | DEGRADED  | Token expiry not validated (Step 2)   |
| Settings Save    | 2     | CONFUSING | "Saved!" shown before API responds    |
| User Profile     | 3     | PASS      | -                                     |
| Onboarding       | 5     | DEGRADED  | Step 3 skippable without completing 2 |
| Contact Form     | 2     | BROKEN    | Backend receives but never saves      |
| Account Delete   | 3     | PASS      | -                                     |

Summary: 3/8 passing, 2 broken, 2 degraded, 1 warning

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🚨 SHIP BLOCKERS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. Checkout: Payment API never called [CONFIRMED by Wiring, Feedback]
   Flow: Cart → Shipping → Payment → ✗ (Step 4 breaks)
   Location: pages/checkout/payment.tsx:67
   The payment handler sets loading state and shows "Processing..."
   but the actual charge API call is missing. User sees success page
   but is never charged. Order is created without payment.

2. Contact Form: Message data never persisted [CONFIRMED by Wiring, Persistence]
   Flow: Fill form → Submit → ✗ (data lost)
   Location: pages/contact.tsx:23 → api/contact.ts:8
   Backend receives the message, validates it, returns 200,
   but never writes to database. User thinks message was sent.

[Full report saved to docs/08-project/flow-audits/flow-audit-20260329.md]
```

---

<!-- COMPACT_SUMMARY_START -->
## Compact Summary

**Command**: `/agileflow:code:flows` - Multi-agent user flow integrity analysis

**Quick Usage**:
```
/agileflow:code:flows app/                          # Quick scan (discovery + 4 core analyzers)
/agileflow:code:flows . DEPTH=deep                  # All 6 analyzers
/agileflow:code:flows src/ FLOWS=signup,checkout     # Focus specific flows
```

**What It Does**: Discovery agent finds user flows → Concern analyzers trace each flow end-to-end → Consensus produces per-journey verdicts + ranked findings

**Architecture**: Discovery FIRST → then concern analyzers in PARALLEL → then consensus

**Analyzers (Core 4 - quick mode)**:
- `flow-analyzer-wiring` - Is the full chain connected? UI → API → DB → response → UI
- `flow-analyzer-feedback` - Loading states, success/error messages at every step
- `flow-analyzer-persistence` - Data actually saved and retrievable
- `flow-analyzer-errors` - Graceful failure handling, recovery options

**Analyzers (Deep mode adds 2)**:
- `flow-analyzer-navigation` - Redirects, guards, step progression
- `flow-analyzer-authorization` - Logged-out users, expired sessions, permissions

**Severity Scale** (user experience impact):
- BROKEN: Flow silently fails, user action has no effect or causes data loss
- DEGRADED: Flow completes but loses data, skips steps, or wrong result
- CONFUSING: Flow works but wrong feedback or wrong destination
- FRICTION: Flow works but unnecessarily painful

**Output**: Per-journey verdict table + detailed findings, saved to `docs/08-project/flow-audits/`
<!-- COMPACT_SUMMARY_END -->

---

## Boundary Rules (No Overlap)

- **vs code:completeness**: Completeness finds MISSING code (empty handlers, no endpoint). Flows finds BROKEN chains (code exists but doesn't connect, or connects but gives wrong feedback)
- **vs code:security**: No vulnerability scanning, injection, auth bypass - those are security domain
- **vs code:logic**: No race conditions, type bugs, edge cases - those are logic domain
- **vs code:performance**: No slow queries, memory leaks, bundle size - those are performance domain
- **vs code:test**: No missing tests, weak assertions - those are test domain
- **This audit asks**: Does the user's journey complete correctly? Is feedback accurate? Does data persist? Can the user recover from errors?

---

## Integration with Babysit

When `/agileflow:babysit` completes implementation, suggest a quick flow audit:

```
📍 Implementation complete. Running quick flow audit on modified paths...

🔍 Flow Integrity Results:
━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ 3/3 affected journeys passing
⚠️  1 CONFUSING issue:
   - Settings Save: Success toast shown before API responds
     Step 2 of Settings Save journey | Confidence: LIKELY (Feedback)

Fix before merging? [Y/n]
```

---

## Related Commands

- `/agileflow:code:completeness` - Find missing/empty implementations (similar architecture)
- `/agileflow:code:logic` - Find logic bugs in existing code
- `/agileflow:code:security` - Find security vulnerabilities
- `/agileflow:code:performance` - Find performance bottlenecks
- `/agileflow:browser-qa` - Actually run flows in a browser (runtime verification)
