---
description: Multi-agent legal risk analysis with consensus voting for finding compliance gaps
argument-hint: "[file|directory] [DEPTH=quick|deep|ultradeep] [FOCUS=privacy|terms|a11y|licensing|consumer|security|ai|content|international|all] [MODEL=haiku|sonnet|opus]"
compact_context:
  priority: high
  preserve_rules:
    - "ACTIVE COMMAND: /agileflow:code:legal - Multi-agent legal risk analysis"
    - "CRITICAL: Deploy analyzers IN PARALLEL in ONE message with multiple Task calls"
    - "CRITICAL: Wait for all results before running consensus (use TaskOutput with block=true)"
    - "CRITICAL: Confidence scoring: CONFIRMED (2+ agree), LIKELY (1 with evidence), INVESTIGATE (1 weak)"
    - "MUST parse arguments: TARGET (file/dir), DEPTH (quick/deep/ultradeep), FOCUS (privacy|terms|a11y|licensing|consumer|security|ai|content|international|all)"
    - "Pass consensus all analyzer outputs, let it synthesize the final report"
  state_fields:
    - target_path
    - depth
    - focus_areas
    - analyzers_deployed
    - findings_collected
---

# /agileflow:code:legal

Deploy multiple specialized legal risk analyzers in parallel to find compliance gaps, then synthesize results through consensus voting into a prioritized Legal Risk Report.

---

## Quick Reference

```
/agileflow:code:legal app/                                # Analyze app directory (quick, core 5 analyzers)
/agileflow:code:legal . DEPTH=deep                        # Deep analysis - all 9 analyzers
/agileflow:code:legal src/ FOCUS=privacy,a11y             # Focus on specific areas
/agileflow:code:legal . DEPTH=deep FOCUS=all              # Comprehensive full audit
/agileflow:code:legal app/page.tsx FOCUS=ai               # Check single file for AI compliance
```

---

## How It Works

```
┌─────────────────────────────────────────────────────────────┐
│                 /agileflow:code:legal                       │
│                                                              │
│  1. Parse arguments (target, depth, focus)                   │
│  2. Deploy analyzers IN PARALLEL                             │
│  3. Collect all findings                                     │
│  4. Run consensus coordinator to validate & prioritize       │
│  5. Generate actionable Legal Risk Report                    │
└─────────────────────────────────────────────────────────────┘

   ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐
   │Privacy │ │ Terms  │ │ A11y   │ │License │ │Consumer│
   └───┬────┘ └───┬────┘ └───┬────┘ └───┬────┘ └───┬────┘
       │          │          │          │          │
   ┌───┴────┐ ┌───┴────┐ ┌───┴────┐ ┌───┴────┐
   │Security│ │  AI    │ │Content │ │ Intl   │  (deep only)
   └───┬────┘ └───┬────┘ └───┬────┘ └───┬────┘
       │          │          │          │
       └──────────┴──────────┼──────────┘
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
| DEPTH | quick, deep, ultradeep | quick | quick = core 5, deep = all 9, ultradeep = separate tmux sessions |
| FOCUS | privacy,terms,a11y,licensing,consumer,security,ai,content,international,all | all | Which analyzers to deploy |
| MODEL | haiku, sonnet, opus | haiku | Model for analyzer subagents. Default preserves existing behavior. |

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
| `DEPTH=quick` + `FOCUS=all` | privacy, terms, a11y, licensing, consumer (core 5) |
| `DEPTH=deep` + `FOCUS=all` | All 9 analyzers |
| `FOCUS=privacy` | legal-analyzer-privacy only |
| `FOCUS=terms` | legal-analyzer-terms only |
| `FOCUS=a11y` | legal-analyzer-a11y only |
| `FOCUS=licensing` | legal-analyzer-licensing only |
| `FOCUS=consumer` | legal-analyzer-consumer only |
| `FOCUS=security` | legal-analyzer-security only |
| `FOCUS=ai` | legal-analyzer-ai only |
| `FOCUS=content` | legal-analyzer-content only |
| `FOCUS=international` | legal-analyzer-international only |
| `FOCUS=privacy,a11y` | Comma-separated: deploy specified analyzers |

**DEPTH behavior**:
- `quick` (default): Deploy core 5 analyzers. Focus on CRITICAL/HIGH issues only.
- `deep`: Deploy all 9 analyzers. Include MEDIUM/LOW findings.
- `ultradeep`: Spawn each analyzer as a separate Claude Code session in tmux. Requires tmux. Uses model profiles from metadata. Falls back to `deep` if tmux unavailable.

**ULTRADEEP mode** (DEPTH=ultradeep):
1. Show cost estimate: `node .agileflow/scripts/spawn-audit-sessions.js --audit=legal --target=TARGET --focus=FOCUS --model=MODEL --dry-run`
2. Confirm with user before launching
3. Spawn sessions: `node .agileflow/scripts/spawn-audit-sessions.js --audit=legal --target=TARGET --focus=FOCUS --model=MODEL`
4. Monitor sentinel files in `docs/09-agents/ultradeep/{trace_id}/` for completion
5. Collect all findings and run consensus coordinator (same as deep mode)
6. If tmux unavailable, fall back to `DEPTH=deep` with warning

### STEP 2: Deploy Analyzers in Parallel

**CRITICAL**: Deploy ALL selected analyzers in a SINGLE message with multiple Task calls.

**Prompt template for each analyzer**:

```
TASK: Analyze the following code for {LEGAL_DOMAIN} compliance risks.

TARGET: {file_path or directory}
DEPTH: {quick|deep}

{For quick depth}: Focus on CRITICAL and HIGH risk issues only. Skip advisory/best-practice items.
{For deep depth}: Be comprehensive. Include MEDIUM and LOW risk findings.

Read the target files and apply your analysis methodology.

OUTPUT your findings in your standard format (FINDING-N with location, risk level, legal basis, code, explanation, remediation).

If no issues found, output: "No {LEGAL_DOMAIN} compliance issues found in {TARGET}"
```

**Example deployment (DEPTH=quick, FOCUS=all - deploys core 5)**:

```xml
<invoke name="Task">
<parameter name="description">Privacy compliance analysis</parameter>
<parameter name="prompt">TASK: Analyze the following code for PRIVACY & DATA PROTECTION compliance risks.
TARGET: src/
DEPTH: quick
Focus on CRITICAL and HIGH risk issues only...
...</parameter>
<parameter name="subagent_type">legal-analyzer-privacy</parameter>
<parameter name="run_in_background">true</parameter>
</invoke>

<invoke name="Task">
<parameter name="description">Terms & legal docs analysis</parameter>
<parameter name="prompt">TASK: Analyze the following code for TERMS & LEGAL DOCUMENT compliance risks.
TARGET: src/
DEPTH: quick
...</parameter>
<parameter name="subagent_type">legal-analyzer-terms</parameter>
<parameter name="run_in_background">true</parameter>
</invoke>

<invoke name="Task">
<parameter name="description">Accessibility compliance analysis</parameter>
<parameter name="prompt">TASK: Analyze the following code for ACCESSIBILITY compliance risks.
TARGET: src/
DEPTH: quick
...</parameter>
<parameter name="subagent_type">legal-analyzer-a11y</parameter>
<parameter name="run_in_background">true</parameter>
</invoke>

<invoke name="Task">
<parameter name="description">License compliance analysis</parameter>
<parameter name="prompt">TASK: Analyze the following code for LICENSING & IP compliance risks.
TARGET: src/
DEPTH: quick
...</parameter>
<parameter name="subagent_type">legal-analyzer-licensing</parameter>
<parameter name="run_in_background">true</parameter>
</invoke>

<invoke name="Task">
<parameter name="description">Consumer protection analysis</parameter>
<parameter name="prompt">TASK: Analyze the following code for CONSUMER PROTECTION compliance risks.
TARGET: src/
DEPTH: quick
...</parameter>
<parameter name="subagent_type">legal-analyzer-consumer</parameter>
<parameter name="run_in_background">true</parameter>
</invoke>
```

**For DEPTH=deep, also deploy**:

```xml
<invoke name="Task">
<parameter name="description">Security legal obligations analysis</parameter>
<parameter name="prompt">TASK: Analyze the following code for SECURITY LEGAL OBLIGATION compliance risks...
...</parameter>
<parameter name="subagent_type">legal-analyzer-security</parameter>
<parameter name="run_in_background">true</parameter>
</invoke>

<invoke name="Task">
<parameter name="description">AI compliance analysis</parameter>
<parameter name="prompt">TASK: Analyze the following code for AI & ALGORITHMIC compliance risks...
...</parameter>
<parameter name="subagent_type">legal-analyzer-ai</parameter>
<parameter name="run_in_background">true</parameter>
</invoke>

<invoke name="Task">
<parameter name="description">Content & IP obligations analysis</parameter>
<parameter name="prompt">TASK: Analyze the following code for CONTENT MODERATION & IP OBLIGATION compliance risks...
...</parameter>
<parameter name="subagent_type">legal-analyzer-content</parameter>
<parameter name="run_in_background">true</parameter>
</invoke>

<invoke name="Task">
<parameter name="description">International compliance analysis</parameter>
<parameter name="prompt">TASK: Analyze the following code for INTERNATIONAL COMPLIANCE risks...
...</parameter>
<parameter name="subagent_type">legal-analyzer-international</parameter>
<parameter name="run_in_background">true</parameter>
</invoke>
```

### STEP 3: Collect Results

Wait for all analyzers to complete:

```xml
<invoke name="TaskOutput">
<parameter name="task_id">{privacy_id}</parameter>
<parameter name="block">true</parameter>
</invoke>

<invoke name="TaskOutput">
<parameter name="task_id">{terms_id}</parameter>
<parameter name="block">true</parameter>
</invoke>

<!-- ... collect all results ... -->
```

### STEP 4: Run Consensus Coordinator

Pass all analyzer outputs to the consensus coordinator:

```xml
<invoke name="Task">
<parameter name="description">Legal audit consensus</parameter>
<parameter name="prompt">You are the Legal Consensus Coordinator.

TARGET: {target_path}
DEPTH: {depth}

## Analyzer Outputs

### Privacy Analyzer Results:
{privacy_output}

### Terms Analyzer Results:
{terms_output}

### Accessibility Analyzer Results:
{a11y_output}

### Licensing Analyzer Results:
{licensing_output}

### Consumer Protection Analyzer Results:
{consumer_output}

{If deep depth, also include:}
### Security Legal Obligations Results:
{security_output}

### AI Compliance Results:
{ai_output}

### Content & IP Obligations Results:
{content_output}

### International Compliance Results:
{international_output}

---

Follow your consensus process:
1. Detect project type from the codebase
2. Parse all findings into normalized structure
3. Group related findings by location
4. Vote on confidence (CONFIRMED if 2+ agree, LIKELY if 1 with evidence)
5. Filter by project type relevance
6. Generate the final Legal Risk Report
7. Save report to docs/08-project/legal-audits/legal-audit-{YYYYMMDD}.md
</parameter>
<parameter name="subagent_type">legal-consensus</parameter>
</invoke>
```

### STEP 5: Present Results

After consensus completes, show the report summary and offer next steps:

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "Legal audit complete: [N] findings ([critical] Critical, [high] High). [files_count] files analyzed. Project type: [type].",
  "header": "Next steps",
  "multiSelect": false,
  "options": [
    {"label": "Fix [critical] Critical issues now (Recommended)", "description": "[top_issue_summary] - [legal_basis]"},
    {"label": "Create stories for all findings", "description": "Track [critical] critical + [high] high priority items in backlog"},
    {"label": "Re-run with DEPTH=deep on [target]", "description": "Current was quick (5 analyzers) - deep adds Security, AI, Content, International"},
    {"label": "Save report and done", "description": "Report saved to docs/08-project/legal-audits/"}
  ]
}]</parameter>
</invoke>
```

---

## Example Output

```
⚖️  Legal Audit: app/
══════════════════════════════════════════════════════════════

Deploying 5 legal analyzers (quick mode)...
✓ Privacy Analyzer
✓ Terms Analyzer
✓ Accessibility Analyzer
✓ Licensing Analyzer
✓ Consumer Protection Analyzer

Running consensus...
✓ Consensus complete
✓ Project type detected: SaaS Application

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 RISK SUMMARY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

| Risk Level | Count |
|------------|-------|
| Critical   | 2     |
| High       | 3     |
| Medium     | 4     |
| Low        | 1     |

Total: 10 findings (3 false positives excluded)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🚨 FIX BEFORE LAUNCH
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. No privacy policy but collecting email [CONFIRMED by Privacy, Terms]
   Location: app/page.tsx:42
   Legal Basis: GDPR Article 13, CCPA
   Fix: Add /privacy page and link from footer

2. Images without alt text (12 instances) [CONFIRMED by A11y]
   Location: components/*.tsx
   Legal Basis: ADA Title III, WCAG 2.1 AA 1.1.1
   Fix: Add descriptive alt attributes to all images

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️  FIX THIS SPRINT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

3. Missing Terms of Service [LIKELY - Terms]
4. Cookie consent banner absent [LIKELY - Privacy]
5. GPL dependency in MIT project [LIKELY - Licensing]

[Full report saved to docs/08-project/legal-audits/legal-audit-20260214.md]
```

---

<!-- COMPACT_SUMMARY_START -->
## Compact Summary

**Command**: `/agileflow:code:legal` - Multi-agent legal risk analysis with consensus

**Quick Usage**:
```
/agileflow:code:legal app/                        # Quick scan (core 5 analyzers)
/agileflow:code:legal . DEPTH=deep                # All 9 analyzers
/agileflow:code:legal src/ FOCUS=privacy,a11y     # Specific areas
```

**What It Does**: Deploy legal analyzers in parallel → Each finds different compliance gaps → Consensus coordinator validates, filters by project type, prioritizes → Actionable Legal Risk Report

**Analyzers (Core 5 - quick mode)**:
- `legal-analyzer-privacy` - GDPR, CCPA, cookies, data collection
- `legal-analyzer-terms` - ToS, disclaimers, refund policies
- `legal-analyzer-a11y` - ADA, WCAG, Section 508
- `legal-analyzer-licensing` - Open source licenses, IP, attribution
- `legal-analyzer-consumer` - Dark patterns, FTC, COPPA

**Analyzers (Deep mode adds 4 more)**:
- `legal-analyzer-security` - Breach notification, PCI-DSS, encryption obligations
- `legal-analyzer-ai` - EU AI Act, algorithmic bias, AI disclosure
- `legal-analyzer-content` - DMCA, Digital Services Act, UGC moderation
- `legal-analyzer-international` - LGPD, PIPL, data localization, cross-border

**Risk Levels**:
- CRITICAL: Active lawsuit risk → Fix before launch
- HIGH: Regulatory fine risk → Fix this sprint
- MEDIUM: Best practice gap → Backlog
- LOW: Advisory improvement

**Confidence Levels**:
- CONFIRMED: 2+ analyzers agree → High priority
- LIKELY: 1 analyzer with evidence → Medium priority
- INVESTIGATE: 1 analyzer, weak evidence → Low priority

**Output**: `docs/08-project/legal-audits/legal-audit-{YYYYMMDD}.md`
<!-- COMPACT_SUMMARY_END -->

---

## Integration with Babysit

When `/agileflow:babysit` completes implementation, it can run a quick legal audit:

```
📍 Implementation complete. Running quick legal audit...

⚖️  Legal Audit Results:
━━━━━━━━━━━━━━━━━━━━━━
✅ No critical legal risks found
⚠️  1 HIGH issue detected:
   - app/page.tsx:42 - Collecting email without privacy policy link
     Confidence: CONFIRMED (Privacy + Terms analyzers)

Fix before launch? [Y/n]
```

---

## Related Commands

- `/agileflow:code:logic` - Logic bug analysis (similar architecture)
- `/agileflow:review` - Code review (includes some compliance checks)
- `/agileflow:multi-expert` - General multi-expert analysis
- `/agileflow:verify` - Run tests
