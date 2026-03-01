---
description: Multi-agent feature brainstorming audit - analyzes your app and suggests new features, UX improvements, integrations, and growth opportunities
argument-hint: "[file|directory] [DEPTH=quick|deep|ultradeep] [FOCUS=features|ux|market|growth|integration|all] [MODEL=haiku|sonnet|opus]"
compact_context:
  priority: high
  preserve_rules:
    - "ACTIVE COMMAND: /agileflow:ideate:features - Multi-agent feature brainstorming audit"
    - "CRITICAL: Deploy analyzers IN PARALLEL in ONE message with multiple Task calls"
    - "CRITICAL: Wait for all results before running consensus (use TaskOutput with block=true)"
    - "CRITICAL: Value scale: HIGH_VALUE > MEDIUM_VALUE > NICE_TO_HAVE > SPECULATIVE"
    - "CRITICAL: Confidence scoring: CONFIRMED (2+ agree), LIKELY (1 with evidence), SPECULATIVE (1 weak)"
    - "MUST parse arguments: TARGET (file/dir), DEPTH (quick/deep/ultradeep), FOCUS (features|ux|market|growth|integration|all), MODEL (haiku/sonnet/opus)"
    - "Pass consensus all analyzer outputs, let it synthesize the final report"
  state_fields:
    - target_path
    - depth
    - focus_areas
    - model
    - analyzers_deployed
    - findings_collected
---

# /agileflow:ideate:features

Deploy multiple specialized brainstorm analyzers in parallel to find missing features, UX improvements, market-standard patterns, growth opportunities, and integration gaps, then synthesize results through consensus into a prioritized Feature Brainstorm Report.

**Key difference from `/ideate:new`**: Ideation finds technical improvements to existing code (refactoring, security fixes, performance). Brainstorm audit finds **new product features** the app should have — what to build, not what to fix.

---

## Quick Reference

```
/agileflow:ideate:features app/                                  # Analyze app (quick, core 3 analyzers)
/agileflow:ideate:features . DEPTH=deep                          # Deep analysis - all 5 analyzers
/agileflow:ideate:features src/ FOCUS=features,ux                # Focus on feature gaps and UX
/agileflow:ideate:features . DEPTH=deep FOCUS=all                # Comprehensive brainstorm
/agileflow:ideate:features components/ FOCUS=ux                  # UX-only audit of components
/agileflow:ideate:features . DEPTH=ultradeep                     # Each analyzer in its own tmux session
/agileflow:ideate:features src/ MODEL=sonnet                     # Use Sonnet for all analyzers
/agileflow:ideate:features . DEPTH=ultradeep MODEL=opus          # Ultradeep with Opus
```

---

## How It Works

```
┌─────────────────────────────────────────────────────────────┐
│              /agileflow:ideate:features                      │
│                                                              │
│  1. Parse arguments (target, depth, focus)                   │
│  2. Deploy brainstorm analyzers IN PARALLEL                  │
│  3. Collect all feature suggestions                          │
│  4. Run consensus coordinator to deduplicate & prioritize    │
│  5. Generate actionable Feature Brainstorm Report            │
└─────────────────────────────────────────────────────────────┘

   ┌──────────┐ ┌────────┐ ┌────────┐
   │ Features │ │   UX   │ │ Market │
   └────┬─────┘ └───┬────┘ └───┬────┘
        │           │          │
   ┌────┴───┐ ┌─────┴──────────┘    (deep only)
   │ Growth │ │Integration│
   └────┬───┘ └─────┬─────┘
        │           │
        └─────┬─────┘
              ▼
   ┌──────────────────────┐
   │ Consensus Coordinator │
   │ (deduplicates, votes,│
   │  prioritizes report)  │
   └──────────────────────┘
```

---

## Arguments

| Argument | Values | Default | Description |
|----------|--------|---------|-------------|
| TARGET | file/directory | `.` | What to analyze |
| DEPTH | quick, deep, ultradeep | quick | quick = core 3, deep = all 5, ultradeep = separate tmux sessions |
| FOCUS | features,ux,market,growth,integration,all | all | Which analyzers to deploy |
| MODEL | haiku, sonnet, opus | haiku | Model for analyzer subagents. Passed to Task calls or tmux sessions. |

---

## Value Scale (Feature Priority)

| Value | Definition | Example |
|-------|-----------|---------|
| **HIGH_VALUE** | Users actively need this or will leave without it | Missing search on a list of 100+ items |
| **MEDIUM_VALUE** | Improves the experience significantly | Export to CSV for data portability |
| **NICE_TO_HAVE** | Polish that delights users | Dark mode, keyboard shortcuts |
| **SPECULATIVE** | Might be useful, needs validation | AI-powered suggestions |

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
| `DEPTH=quick` + `FOCUS=all` | features, ux, market (core 3) |
| `DEPTH=deep` + `FOCUS=all` | All 5 analyzers |
| `FOCUS=features` | brainstorm-analyzer-features only |
| `FOCUS=ux` | brainstorm-analyzer-ux only |
| `FOCUS=market` | brainstorm-analyzer-market only |
| `FOCUS=growth` | brainstorm-analyzer-growth only |
| `FOCUS=integration` | brainstorm-analyzer-integration only |
| `FOCUS=features,ux` | Comma-separated: deploy specified analyzers |

**DEPTH behavior**:
- `quick` (default): Deploy core 3 analyzers (features, ux, market). Focus on HIGH_VALUE and MEDIUM_VALUE ideas only.
- `deep`: Deploy all 5 analyzers. Include NICE_TO_HAVE and SPECULATIVE ideas.
- `ultradeep`: Spawn each analyzer as a separate Claude Code session in tmux. Uses all 5 analyzers. Requires tmux. Falls back to `deep` if tmux unavailable.

**MODEL** (default: haiku):
- `haiku`: Fast and cost-effective.
- `sonnet`: Balanced quality and speed.
- `opus`: Maximum quality. Recommended for ultradeep.

**ULTRADEEP mode** (DEPTH=ultradeep):
1. Show cost estimate: `node .agileflow/scripts/spawn-audit-sessions.js --audit=brainstorm --target=TARGET --focus=FOCUS --model=MODEL --dry-run`
2. Confirm with user before launching
3. Spawn sessions: `node .agileflow/scripts/spawn-audit-sessions.js --audit=brainstorm --target=TARGET --focus=FOCUS --model=MODEL`
4. Monitor sentinel files in `docs/09-agents/ultradeep/{trace_id}/` for completion
5. Collect all findings and run consensus coordinator (same as deep mode)
6. If tmux unavailable, fall back to `DEPTH=deep` with warning

> **Skip to STEP 4** after ultradeep collection. Steps 2-3 are only for quick/deep modes.

### STEP 2: Deploy Analyzers in Parallel

**For quick/deep modes only** (ultradeep uses tmux sessions above).

**CRITICAL**: Deploy ALL selected analyzers in a SINGLE message with multiple Task calls. **If MODEL is specified**, pass it to each Task call via the `model` parameter.

**Prompt template for each analyzer**:

```
TASK: Analyze the following app for {BRAINSTORM_DOMAIN} opportunities.

TARGET: {file_path or directory}
DEPTH: {quick|deep}

{For quick depth}: Focus on HIGH_VALUE and MEDIUM_VALUE features only. Skip NICE_TO_HAVE and SPECULATIVE.
{For deep depth}: Be comprehensive. Include all value levels.

Read the target files to understand what the app does, then apply your analysis methodology to find missing features and improvement opportunities.

OUTPUT your findings in your standard format (FINDING-N with location, category, value, effort, description, user impact, implementation hint).

If no opportunities found, output: "No {BRAINSTORM_DOMAIN} opportunities found in {TARGET}"
```

**Example deployment (DEPTH=quick, FOCUS=all - deploys core 3)**:

```xml
<invoke name="Task">
<parameter name="description">Feature gap analysis</parameter>
<parameter name="prompt">TASK: Analyze the following app for MISSING FEATURES AND INCOMPLETE WORKFLOWS.
TARGET: {target}
DEPTH: quick
Focus on HIGH_VALUE and MEDIUM_VALUE features only...
Read the target files to understand what the app does, its routes, components, models, and APIs. Then identify missing CRUD operations, half-built features, absent common patterns (search, pagination, filters), dead-end workflows, missing data features (export/import), and absent configuration options.
OUTPUT findings in your standard FINDING-N format.</parameter>
<parameter name="subagent_type">brainstorm-analyzer-features</parameter>
<parameter name="run_in_background">true</parameter>
</invoke>

<invoke name="Task">
<parameter name="description">UX improvement analysis</parameter>
<parameter name="prompt">TASK: Analyze the following app for UX IMPROVEMENT OPPORTUNITIES.
TARGET: {target}
DEPTH: quick
Focus on HIGH_VALUE and MEDIUM_VALUE improvements only...
Read the target UI files to understand the user experience. Then identify missing feedback states (loading, success, error), empty states, navigation gaps, accessibility issues, responsive design gaps, and missing user guidance (onboarding, tooltips, help text).
OUTPUT findings in your standard FINDING-N format.</parameter>
<parameter name="subagent_type">brainstorm-analyzer-ux</parameter>
<parameter name="run_in_background">true</parameter>
</invoke>

<invoke name="Task">
<parameter name="description">Market feature analysis</parameter>
<parameter name="prompt">TASK: Analyze the following app for MARKET-STANDARD FEATURES that are missing.
TARGET: {target}
DEPTH: quick
Focus on HIGH_VALUE and MEDIUM_VALUE features only...
Read the project files to infer the app category (SaaS, e-commerce, blog, tool, etc.). Then identify table-stakes features users expect in this category, competitive features that differentiate good apps, and potential differentiators.
OUTPUT findings in your standard FINDING-N format.</parameter>
<parameter name="subagent_type">brainstorm-analyzer-market</parameter>
<parameter name="run_in_background">true</parameter>
</invoke>
```

**For DEPTH=deep, also deploy**:

```xml
<invoke name="Task">
<parameter name="description">Growth feature analysis</parameter>
<parameter name="prompt">TASK: Analyze the following app for GROWTH AND ENGAGEMENT features that are missing.
TARGET: {target}
DEPTH: deep
Be comprehensive - include all value levels...
Read the codebase to map the user lifecycle (acquisition, activation, retention, revenue, referral). Then identify missing onboarding flows, notification systems, sharing mechanics, personalization features, retention hooks, and user management features.
OUTPUT findings in your standard FINDING-N format.</parameter>
<parameter name="subagent_type">brainstorm-analyzer-growth</parameter>
<parameter name="run_in_background">true</parameter>
</invoke>

<invoke name="Task">
<parameter name="description">Integration opportunity analysis</parameter>
<parameter name="prompt">TASK: Analyze the following app for MISSING INTEGRATIONS AND API EXTENSIBILITY.
TARGET: {target}
DEPTH: deep
Be comprehensive - include all value levels...
Check package.json and code for existing integrations. Then identify missing auth providers, service integrations (email, storage, analytics), data portability (import/export), API extensibility (webhooks, public API), payment integrations, and communication channels (Slack, Discord).
OUTPUT findings in your standard FINDING-N format.</parameter>
<parameter name="subagent_type">brainstorm-analyzer-integration</parameter>
<parameter name="run_in_background">true</parameter>
</invoke>
```

### STEP 3: Collect Results

Wait for all analyzers to complete:

```xml
<invoke name="TaskOutput">
<parameter name="task_id">{features_id}</parameter>
<parameter name="block">true</parameter>
</invoke>

<invoke name="TaskOutput">
<parameter name="task_id">{ux_id}</parameter>
<parameter name="block">true</parameter>
</invoke>

<!-- ... collect all results ... -->
```

### STEP 4: Run Consensus Coordinator

Pass all analyzer outputs to the consensus coordinator:

```xml
<invoke name="Task">
<parameter name="description">Brainstorm audit consensus</parameter>
<parameter name="prompt">You are the Brainstorm Consensus Coordinator.

TARGET: {target_path}
DEPTH: {depth}

## Analyzer Outputs

### Features Analyzer Results:
{features_output}

### UX Analyzer Results:
{ux_output}

### Market Analyzer Results:
{market_output}

{If deep depth, also include:}
### Growth Analyzer Results:
{growth_output}

### Integration Analyzer Results:
{integration_output}

---

Follow your consensus process:
1. Detect app category from the codebase
2. Parse all findings into normalized structure
3. Deduplicate overlapping suggestions from different analyzers
4. Vote on confidence (CONFIRMED if 2+ suggest similar feature, LIKELY if 1 with evidence)
5. Filter by app category relevance
6. Prioritize by value/effort ratio (Quick Wins first)
7. Generate the final Feature Brainstorm Report
8. Save report to docs/08-project/brainstorm-audits/brainstorm-audit-{YYYYMMDD}.md
</parameter>
<parameter name="subagent_type">brainstorm-consensus</parameter>
</invoke>
```

### STEP 5: Present Results

After consensus completes, show the report summary and offer next steps:

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "Brainstorm audit complete: [N] feature ideas ([quick_wins] quick wins, [strategic] strategic). App type: [type]. [analyzers] analyzers deployed.",
  "header": "Next steps",
  "multiSelect": false,
  "options": [
    {"label": "Create stories for top [quick_wins] quick wins (Recommended)", "description": "[top_feature_summary] - highest value, lowest effort"},
    {"label": "Create epic: 'Feature improvements'", "description": "Bundle all [N] ideas into a trackable epic with stories"},
    {"label": "Re-run with DEPTH=deep on [target]", "description": "Current was quick (3 analyzers) - deep adds Growth, Integration"},
    {"label": "Save report and done", "description": "Report saved to docs/08-project/brainstorm-audits/"}
  ]
}]</parameter>
</invoke>
```

---

## Example Output

```
💡 Feature Brainstorm Audit: app/
══════════════════════════════════════════════════════════════

Deploying 3 brainstorm analyzers (quick mode)...
✓ Features Analyzer
✓ UX Analyzer
✓ Market Analyzer

Running consensus...
✓ Consensus complete
✓ App category detected: AI/ML Web Application

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 BRAINSTORM SUMMARY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

18 raw suggestions → 12 unique features (6 merged duplicates)
- 4 CONFIRMED (2+ analyzers agree)
- 5 LIKELY (strong single-analyzer evidence)
- 3 SPECULATIVE (filtered out)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
★ QUICK WINS (High Value, Low Effort)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. Add loading spinner during model inference [CONFIRMED by Features, UX]
   Value: HIGH | Effort: SMALL (hours)
   Users see frozen UI while model processes — think the app is broken

2. Add drag-and-drop image upload [CONFIRMED by UX, Market]
   Value: HIGH | Effort: SMALL (hours)
   Users expect drag-and-drop in 2026 — file input feels dated

3. Show confidence explanation after prediction [LIKELY - UX]
   Value: MEDIUM | Effort: SMALL (hours)
   Users don't understand what "73% Cancer Cell" means in context

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎯 STRATEGIC FEATURES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

4. Batch image analysis [CONFIRMED by Features, Market]
   Value: HIGH | Effort: MEDIUM (days)
   Analyze multiple images at once — standard in medical imaging tools

5. Result history with comparison [LIKELY - Features]
   Value: HIGH | Effort: MEDIUM (days)
   Users can't review past analyses or compare results over time

[Full report saved to docs/08-project/brainstorm-audits/brainstorm-audit-20260226.md]
```

---

<!-- COMPACT_SUMMARY_START -->
## Compact Summary

**Command**: `/agileflow:ideate:features` - Multi-agent feature brainstorming audit with consensus

**Quick Usage**:
```
/agileflow:ideate:features app/                           # Quick scan (core 3 analyzers)
/agileflow:ideate:features . DEPTH=deep                   # All 5 analyzers
/agileflow:ideate:features src/ FOCUS=features,ux         # Specific areas
/agileflow:ideate:features . DEPTH=ultradeep MODEL=opus   # Ultradeep with Opus in tmux
```

**What It Does**: Deploy brainstorm analyzers in parallel -> Each finds different feature opportunities -> Consensus coordinator deduplicates, filters by app type, prioritizes -> Actionable Feature Brainstorm Report

**Key Difference from /ideate:new**: Ideation finds technical improvements to existing code. Brainstorm audit finds **new product features** the app should have.

**Analyzers (Core 3 - quick mode)**:
- `brainstorm-analyzer-features` - Missing CRUD, half-built features, incomplete workflows
- `brainstorm-analyzer-ux` - Missing feedback states, accessibility, navigation, responsive design
- `brainstorm-analyzer-market` - Table-stakes features for the app's category, competitive gaps

**Analyzers (Deep mode adds 2 more)**:
- `brainstorm-analyzer-growth` - Onboarding, notifications, sharing, retention hooks
- `brainstorm-analyzer-integration` - Auth providers, third-party services, data portability, API extensibility

**Value Scale**:
- HIGH_VALUE: Users actively need this or will leave
- MEDIUM_VALUE: Significantly improves the experience
- NICE_TO_HAVE: Polish that delights users
- SPECULATIVE: Might be useful, needs validation

**Confidence Levels**:
- CONFIRMED: 2+ analyzers agree -> High priority
- LIKELY: 1 analyzer with evidence -> Medium priority
- SPECULATIVE: 1 analyzer, weak evidence -> Low priority

**Output**: `docs/08-project/brainstorm-audits/brainstorm-audit-{YYYYMMDD}.md`
<!-- COMPACT_SUMMARY_END -->

---

## Boundary Rules (No Overlap)

- **vs code:security**: No vulnerabilities, auth bypass, injection — those are security domain
- **vs code:logic**: No race conditions, type bugs, edge cases — those are logic domain
- **vs code:performance**: No slow queries, memory leaks, bundle size — those are performance domain
- **vs code:test**: No missing tests, weak assertions — those are test domain
- **vs code:completeness**: No dead code, empty handlers, stub code — those are completeness domain
- **vs ideate:new**: No code refactoring, pattern improvements — those are technical ideation
- **This audit asks**: What features should the app have? What would make users happier?

---

## Integration with Babysit

When `/agileflow:babysit` is active, suggest brainstorm audit for greenfield projects or when user says "what should I build next":

```
📍 No active story. Would you like to brainstorm features?

🔍 Running quick brainstorm audit...

💡 3 quick win feature ideas found:
  1. Add search to project list (HIGH_VALUE, SMALL effort)
  2. Add loading states to API calls (HIGH_VALUE, SMALL effort)
  3. Add CSV export for reports (MEDIUM_VALUE, SMALL effort)

Create stories for these? [Y/n]
```

---

## Related Commands

- `/agileflow:ideate:new` - Technical improvement ideation (code quality, not features)
- `/agileflow:code:completeness` - Find broken/incomplete existing features
- `/agileflow:code:security` - Security vulnerability analysis
- `/agileflow:code:performance` - Performance bottleneck analysis
- `/agileflow:ideate:discover` - Full discovery workflow for a specific idea
- `/agileflow:story` - Create user stories from brainstorm findings
- `/agileflow:epic` - Create epic for grouped features
