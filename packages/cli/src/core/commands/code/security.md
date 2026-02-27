---
description: Multi-agent security vulnerability analysis with consensus voting for finding exploitable weaknesses
argument-hint: "[file|directory] [DEPTH=quick|deep] [FOCUS=injection|auth|authz|secrets|input|deps|infra|api|all]"
compact_context:
  priority: high
  preserve_rules:
    - "ACTIVE COMMAND: /agileflow:code:security - Multi-agent security vulnerability analysis"
    - "CRITICAL: Deploy analyzers IN PARALLEL in ONE message with multiple Task calls"
    - "CRITICAL: Wait for all results before running consensus (use TaskOutput with block=true)"
    - "CRITICAL: Confidence scoring: CONFIRMED (2+ agree), LIKELY (1 with evidence), INVESTIGATE (1 weak)"
    - "MUST parse arguments: TARGET (file/dir), DEPTH (quick/deep), FOCUS (injection|auth|authz|secrets|input|deps|infra|api|all)"
    - "Pass consensus all analyzer outputs, let it synthesize the final report"
  state_fields:
    - target_path
    - depth
    - focus_areas
    - analyzers_deployed
    - findings_collected
---

# /agileflow:code:security

Deploy multiple specialized security vulnerability analyzers in parallel to find exploitable weaknesses, then synthesize results through consensus voting into a prioritized Security Audit Report.

---

## Quick Reference

```
/agileflow:code:security app/                                # Analyze app directory (quick, core 5 analyzers)
/agileflow:code:security . DEPTH=deep                        # Deep analysis - all 8 analyzers
/agileflow:code:security src/ FOCUS=injection,auth            # Focus on specific areas
/agileflow:code:security . DEPTH=deep FOCUS=all               # Comprehensive full audit
/agileflow:code:security app/api/ FOCUS=api                   # Check API routes specifically
```

---

## How It Works

```
┌─────────────────────────────────────────────────────────────┐
│                 /agileflow:code:security                    │
│                                                              │
│  1. Parse arguments (target, depth, focus)                   │
│  2. Deploy analyzers IN PARALLEL                             │
│  3. Collect all findings                                     │
│  4. Run consensus coordinator to validate & prioritize       │
│  5. Generate actionable Security Audit Report                │
└─────────────────────────────────────────────────────────────┘

   ┌─────────┐ ┌──────┐ ┌───────┐ ┌────────┐ ┌───────┐
   │Injection│ │ Auth │ │ Authz │ │Secrets │ │ Input │
   └────┬────┘ └──┬───┘ └───┬───┘ └───┬────┘ └───┬───┘
        │         │         │         │          │
   ┌────┴──┐ ┌────┴──┐ ┌────┴──┐                      (deep only)
   │ Deps  │ │ Infra │ │  API  │
   └───┬───┘ └───┬───┘ └───┬───┘
       │         │         │
       └─────────┼─────────┘
                 ▼
      ┌──────────────────────┐
      │  Consensus Coordinator│
      │  (validates, votes,  │
      │   generates report)  │
      └──────────────────────┘
```

---

## Arguments

| Argument | Values | Default | Description |
|----------|--------|---------|-------------|
| TARGET | file/directory | `.` | What to analyze |
| DEPTH | quick, deep | quick | quick = core 5 analyzers, deep = all 8 |
| FOCUS | injection,auth,authz,secrets,input,deps,infra,api,all | all | Which analyzers to deploy |

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
| `DEPTH=quick` + `FOCUS=all` | injection, auth, authz, secrets, input (core 5) |
| `DEPTH=deep` + `FOCUS=all` | All 8 analyzers |
| `FOCUS=injection` | security-analyzer-injection only |
| `FOCUS=auth` | security-analyzer-auth only |
| `FOCUS=authz` | security-analyzer-authz only |
| `FOCUS=secrets` | security-analyzer-secrets only |
| `FOCUS=input` | security-analyzer-input only |
| `FOCUS=deps` | security-analyzer-deps only |
| `FOCUS=infra` | security-analyzer-infra only |
| `FOCUS=api` | security-analyzer-api only |
| `FOCUS=injection,auth` | Comma-separated: deploy specified analyzers |

**DEPTH behavior**:
- `quick` (default): Deploy core 5 analyzers. Focus on CRITICAL/HIGH issues only.
- `deep`: Deploy all 8 analyzers. Include MEDIUM/LOW findings.

### STEP 2: Deploy Analyzers in Parallel

**CRITICAL**: Deploy ALL selected analyzers in a SINGLE message with multiple Task calls.

**Prompt template for each analyzer**:

```
TASK: Analyze the following code for {SECURITY_DOMAIN} vulnerabilities.

TARGET: {file_path or directory}
DEPTH: {quick|deep}

{For quick depth}: Focus on CRITICAL and HIGH severity issues only. Skip hardening improvements.
{For deep depth}: Be comprehensive. Include MEDIUM and LOW severity findings.

Read the target files and apply your analysis methodology.

OUTPUT your findings in your standard format (FINDING-N with location, severity, confidence, CWE, code, explanation, remediation).

If no issues found, output: "No {SECURITY_DOMAIN} vulnerabilities found in {TARGET}"
```

**Example deployment (DEPTH=quick, FOCUS=all - deploys core 5)**:

```xml
<invoke name="Task">
<parameter name="description">Injection vulnerability analysis</parameter>
<parameter name="prompt">TASK: Analyze the following code for INJECTION vulnerabilities.
TARGET: src/
DEPTH: quick
Focus on CRITICAL and HIGH severity issues only...
...</parameter>
<parameter name="subagent_type">security-analyzer-injection</parameter>
<parameter name="run_in_background">true</parameter>
</invoke>

<invoke name="Task">
<parameter name="description">Authentication vulnerability analysis</parameter>
<parameter name="prompt">TASK: Analyze the following code for AUTHENTICATION vulnerabilities.
TARGET: src/
DEPTH: quick
...</parameter>
<parameter name="subagent_type">security-analyzer-auth</parameter>
<parameter name="run_in_background">true</parameter>
</invoke>

<invoke name="Task">
<parameter name="description">Authorization vulnerability analysis</parameter>
<parameter name="prompt">TASK: Analyze the following code for AUTHORIZATION vulnerabilities.
TARGET: src/
DEPTH: quick
...</parameter>
<parameter name="subagent_type">security-analyzer-authz</parameter>
<parameter name="run_in_background">true</parameter>
</invoke>

<invoke name="Task">
<parameter name="description">Secrets & crypto analysis</parameter>
<parameter name="prompt">TASK: Analyze the following code for SECRETS & CRYPTOGRAPHY vulnerabilities.
TARGET: src/
DEPTH: quick
...</parameter>
<parameter name="subagent_type">security-analyzer-secrets</parameter>
<parameter name="run_in_background">true</parameter>
</invoke>

<invoke name="Task">
<parameter name="description">Input validation analysis</parameter>
<parameter name="prompt">TASK: Analyze the following code for INPUT VALIDATION vulnerabilities.
TARGET: src/
DEPTH: quick
...</parameter>
<parameter name="subagent_type">security-analyzer-input</parameter>
<parameter name="run_in_background">true</parameter>
</invoke>
```

**For DEPTH=deep, also deploy**:

```xml
<invoke name="Task">
<parameter name="description">Dependency vulnerability analysis</parameter>
<parameter name="prompt">TASK: Analyze the following code for DEPENDENCY vulnerabilities...
...</parameter>
<parameter name="subagent_type">security-analyzer-deps</parameter>
<parameter name="run_in_background">true</parameter>
</invoke>

<invoke name="Task">
<parameter name="description">Infrastructure security analysis</parameter>
<parameter name="prompt">TASK: Analyze the following code for INFRASTRUCTURE SECURITY vulnerabilities...
...</parameter>
<parameter name="subagent_type">security-analyzer-infra</parameter>
<parameter name="run_in_background">true</parameter>
</invoke>

<invoke name="Task">
<parameter name="description">API security analysis</parameter>
<parameter name="prompt">TASK: Analyze the following code for API SECURITY vulnerabilities...
...</parameter>
<parameter name="subagent_type">security-analyzer-api</parameter>
<parameter name="run_in_background">true</parameter>
</invoke>
```

### STEP 3: Collect Results

Wait for all analyzers to complete:

```xml
<invoke name="TaskOutput">
<parameter name="task_id">{injection_id}</parameter>
<parameter name="block">true</parameter>
</invoke>

<invoke name="TaskOutput">
<parameter name="task_id">{auth_id}</parameter>
<parameter name="block">true</parameter>
</invoke>

<!-- ... collect all results ... -->
```

### STEP 4: Run Consensus Coordinator

Pass all analyzer outputs to the consensus coordinator:

```xml
<invoke name="Task">
<parameter name="description">Security audit consensus</parameter>
<parameter name="prompt">You are the Security Consensus Coordinator.

TARGET: {target_path}
DEPTH: {depth}

## Analyzer Outputs

### Injection Analyzer Results:
{injection_output}

### Authentication Analyzer Results:
{auth_output}

### Authorization Analyzer Results:
{authz_output}

### Secrets & Crypto Analyzer Results:
{secrets_output}

### Input Validation Analyzer Results:
{input_output}

{If deep depth, also include:}
### Dependency Analyzer Results:
{deps_output}

### Infrastructure Analyzer Results:
{infra_output}

### API Security Analyzer Results:
{api_output}

---

Follow your consensus process:
1. Detect project type from the codebase
2. Parse all findings into normalized structure
3. Group related findings by location
4. Vote on confidence (CONFIRMED if 2+ agree, LIKELY if 1 with evidence)
5. Filter by project type relevance
6. Map findings to OWASP Top 10 and CWE numbers
7. Generate the final Security Audit Report
8. Save report to docs/08-project/security-audits/security-audit-{YYYYMMDD}.md
</parameter>
<parameter name="subagent_type">security-consensus</parameter>
</invoke>
```

### STEP 5: Present Results

After consensus completes, show the report summary and offer next steps:

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "Security audit complete: [N] findings ([critical] Critical, [high] High). [files_count] files analyzed. Project type: [type].",
  "header": "Next steps",
  "multiSelect": false,
  "options": [
    {"label": "Fix [critical] Critical issues now (Recommended)", "description": "[top_issue_summary] - [CWE/OWASP]"},
    {"label": "Create stories for all findings", "description": "Track [critical] critical + [high] high priority items in backlog"},
    {"label": "Re-run with DEPTH=deep on [target]", "description": "Current was quick (5 analyzers) - deep adds Deps, Infra, API"},
    {"label": "Save report and done", "description": "Report saved to docs/08-project/security-audits/"}
  ]
}]</parameter>
</invoke>
```

---

## Example Output

```
🔒 Security Audit: app/
══════════════════════════════════════════════════════════════

Deploying 5 security analyzers (quick mode)...
✓ Injection Analyzer
✓ Authentication Analyzer
✓ Authorization Analyzer
✓ Secrets & Crypto Analyzer
✓ Input Validation Analyzer

Running consensus...
✓ Consensus complete
✓ Project type detected: Full-stack Web Application

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 VULNERABILITY SUMMARY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

| Severity | Count | OWASP Category |
|----------|-------|----------------|
| Critical | 1     | A03:2021 Injection |
| High     | 2     | A01:2021 Broken Access Control |
| Medium   | 3     | A02:2021 Cryptographic Failures |
| Low      | 1     | A05:2021 Security Misconfiguration |

Total: 7 findings (2 false positives excluded)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🚨 FIX IMMEDIATELY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. Command injection via execSync with user input [CONFIRMED by Injection, Input]
   Location: api/exec.ts:28
   CWE-78 | OWASP A03:2021
   Fix: Use execFileSync with argument array instead of string interpolation

2. IDOR - user can access any record by changing ID [CONFIRMED by Authz, Auth]
   Location: api/users/[id]/route.ts:15
   CWE-639 | OWASP A01:2021
   Fix: Add ownership check before returning resource

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️  FIX THIS SPRINT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

3. JWT secret from environment variable not validated [LIKELY - Auth]
4. Math.random() used for token generation [LIKELY - Secrets]
5. Missing rate limiting on login endpoint [LIKELY - Auth]

[Full report saved to docs/08-project/security-audits/security-audit-20260220.md]
```

---

<!-- COMPACT_SUMMARY_START -->
## Compact Summary

**Command**: `/agileflow:code:security` - Multi-agent security vulnerability analysis with consensus

**Quick Usage**:
```
/agileflow:code:security app/                        # Quick scan (core 5 analyzers)
/agileflow:code:security . DEPTH=deep                # All 8 analyzers
/agileflow:code:security src/ FOCUS=injection,auth    # Specific areas
```

**What It Does**: Deploy security analyzers in parallel -> Each finds different vulnerability classes -> Consensus coordinator validates, filters by project type, maps to OWASP/CWE -> Actionable Security Audit Report

**Analyzers (Core 5 - quick mode)**:
- `security-analyzer-injection` - SQL/command/template/NoSQL/LDAP injection
- `security-analyzer-auth` - Weak hashing, JWT flaws, broken auth flows
- `security-analyzer-authz` - IDOR, privilege escalation, CORS/CSRF, path traversal
- `security-analyzer-secrets` - Hardcoded keys, weak crypto, insecure defaults
- `security-analyzer-input` - XSS, prototype pollution, SSRF, file upload, ReDoS

**Analyzers (Deep mode adds 3 more)**:
- `security-analyzer-deps` - Known CVEs, typosquatting, postinstall scripts
- `security-analyzer-infra` - Docker, security headers, HTTPS, exposed endpoints
- `security-analyzer-api` - Mass assignment, data exposure, rate limiting, GraphQL

**Severity Levels** (exploit-oriented):
- CRITICAL: Directly exploitable, high impact (RCE, SQLi, auth bypass)
- HIGH: Likely exploitable, significant impact (Stored XSS, IDOR, weak crypto)
- MEDIUM: Exploitable under conditions (Reflected XSS, missing headers, CSRF)
- LOW: Hardening improvement (info disclosure, verbose errors)

**Confidence Levels**:
- CONFIRMED: 2+ analyzers agree -> High priority
- LIKELY: 1 analyzer with evidence -> Medium priority
- INVESTIGATE: 1 analyzer, weak evidence -> Low priority

**Output**: `docs/08-project/security-audits/security-audit-{YYYYMMDD}.md`
<!-- COMPACT_SUMMARY_END -->

---

## Boundary Rules (No Overlap)

- **vs code:logic**: No race conditions, type bugs, control flow, edge cases - those are logic domain
- **vs code:legal**: No breach notification, PCI-DSS compliance, encryption requirements, negligence liability - those are legal domain
- **vs security agent**: The `security.md` agent is a team member for story work. This is an on-demand analysis tool

---

## Integration with Babysit

When `/agileflow:babysit` completes implementation, it can run a quick security audit:

```
📍 Implementation complete. Running quick security audit...

🔒 Security Audit Results:
━━━━━━━━━━━━━━━━━━━━━━
✅ No critical vulnerabilities found
⚠️  1 HIGH issue detected:
   - api/users.ts:28 - execSync with unsanitized input
     CWE-78 | Confidence: CONFIRMED (Injection + Input analyzers)

Fix before merging? [Y/n]
```

---

## Related Commands

- `/agileflow:code:logic` - Logic bug analysis (similar architecture)
- `/agileflow:code:legal` - Legal compliance analysis (similar architecture)
- `/agileflow:review` - Code review (includes some security checks)
- `/agileflow:multi-expert` - General multi-expert analysis
- `/agileflow:verify` - Run tests
