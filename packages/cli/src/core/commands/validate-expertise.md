---
description: Validate expertise files for drift and staleness
argument-hint: "[DOMAIN]"
model: haiku
compact_context:
  priority: medium
  preserve_rules:
    - "DOMAIN is OPTIONAL - if not provided, validate ALL expertise files"
    - "Run 4 validation checks: file path drift, stale learnings, file size, required sections"
    - "File Path Drift CRITICAL - detect referenced files that no longer exist"
    - "Stale Learnings - flag expertise not updated in 30+ days"
    - "File Size Check - warn if expertise.yaml exceeds 200 lines"
    - "Required Sections - verify domain, mental_models, learnings, key_files, patterns"
    - "Non-destructive (read-only) - report issues but don't auto-fix"
    - "Prioritize drift detection (most critical issue)"
  state_fields:
    - domain_filter
    - total_checks
    - pass_count
    - fail_count
---

# validate-expertise

Validate agent expertise files to ensure they haven't drifted from the codebase.

---

## STEP 0: Gather Context

```bash
node .agileflow/scripts/obtain-context.js validate-expertise
```

---

<!-- COMPACT_SUMMARY_START -->
## Compact Summary

**Purpose**: Expertise Validator - Validate agent expertise files to detect drift, staleness, and structural issues

**Role**: Validate expertise.yaml files against codebase and best practices (read-only validation)

**Critical Rules**:
- MUST run validation checks on all expertise files (or specific domain if provided)
- MUST detect file path drift (referenced files that no longer exist)
- MUST flag stale learnings (not updated in 30+ days)
- MUST warn on oversized files (>200 lines)
- MUST verify required sections present
- Non-destructive (read-only validation)
- Report issues but don't auto-fix
- Prioritize drift detection (most critical)

**Inputs** (optional):
- `DOMAIN`: <domain-name> (validate specific domain, e.g., "database")
- If no domain specified, validate all experts

**Validation Checks**:
1. **File Path Drift** - Check that all file paths referenced in expertise files still exist
   - Grep for file paths: `grep -oE '(src|packages|lib)/[a-zA-Z0-9/_.-]+' expertise.yaml`
   - Verify each path exists: `[ -f <path> ]`
2. **Stale Learnings** - Flag expertise files not updated in 30+ days
   - Extract `last_updated:` field from expertise.yaml
   - Compare to current date
3. **File Size Check** - Warn if expertise file exceeds 200 lines
   - Count lines: `wc -l < expertise.yaml`
4. **Required Sections** - Verify expertise.yaml has required YAML structure:
   - domain, mental_models, learnings, key_files, patterns

**Expertise File Location**: .agileflow/experts/<domain>/expertise.yaml

**Workflow**:
1. Parse DOMAIN input (or default to all)
2. For each domain: Read expertise.yaml → Run all 4 validation checks
3. Collect results (PASS/FAIL/WARN)
4. Generate summary report → Suggest remediation actions

**Example Usage**:
```bash
/agileflow:validate-expertise
/agileflow:validate-expertise DOMAIN=database
```

**Output Format**:
```
EXPERTISE VALIDATION REPORT
============================
Validating: database
  [PASS] File exists: expertise.yaml
  [PASS] Required sections present
  [WARN] 2 stale learnings (>30 days)
  [FAIL] DRIFT: src/old/database.ts not found

SUMMARY: Total: 25 | Passed: 23 | Warnings: 1 | Failures: 1
```

**Success Criteria**:
- All expertise files validated
- Drift issues identified
- Stale learnings flagged
- Actionable recommendations provided
- Report generated and displayed

**Integration**: Session start hook, before major releases, after large refactors

<!-- COMPACT_SUMMARY_END -->

## Prompt

ROLE: Expertise Validator

OBJECTIVE
Run validation checks on expertise files to detect:
- Referenced files that no longer exist (drift)
- Stale learnings (not updated in 30+ days)
- Oversized expertise files (>200 lines)
- Missing required sections

INPUTS (optional)
- DOMAIN=<domain-name> (validate specific domain, e.g., "database")
- If no domain specified, validate all experts

VALIDATION CHECKS

### 1. File Path Drift
Check that all file paths referenced in expertise files still exist:
```bash
# Extract paths like "src/core/..." and verify they exist
grep -oE '(src|packages|lib)/[a-zA-Z0-9/_.-]+' expertise.yaml | while read path; do
  [ -f "$path" ] || echo "DRIFT: $path not found"
done
```

### 2. Stale Learnings
Flag expertise files not updated in 30+ days:
```bash
# Check last_updated field in expertise.yaml
last_updated=$(grep 'last_updated:' expertise.yaml | cut -d: -f2 | tr -d ' ')
# Compare to current date
```

### 3. File Size Check
Warn if expertise file exceeds 200 lines:
```bash
lines=$(wc -l < expertise.yaml)
[ "$lines" -gt 200 ] && echo "WARN: $lines lines (recommend <200)"
```

### 4. Required Sections
Verify expertise.yaml has required structure:
- `domain:` - Domain identifier
- `mental_models:` - At least one mental model
- `learnings:` - Learning history (can be empty initially)
- `key_files:` - Important files for this domain
- `patterns:` - Common patterns and anti-patterns

EXECUTION

Run the validation script:
```bash
# All domains
bash .agileflow/scripts/validate-expertise.sh

# Specific domain
bash .agileflow/scripts/validate-expertise.sh database
```

Or manually check using Read tool on expertise files in:
- `.agileflow/experts/<domain>/expertise.yaml`

OUTPUT FORMAT

```
======================================
EXPERTISE VALIDATION REPORT
======================================

Validating: database
  [PASS] File exists: expertise.yaml
  [PASS] Required sections present
  [WARN] 2 stale learnings (>30 days)
  [FAIL] DRIFT: src/old/database.ts not found

Validating: api
  [PASS] All checks passed

--------------------------------------
SUMMARY
--------------------------------------
Total domains: 25
Passed: 23
Warnings: 1
Failures: 1

RECOMMENDED ACTIONS:
1. Update database expertise - remove reference to src/old/database.ts
2. Review stale learnings in database domain
```

WORKFLOW

1. Parse DOMAIN input (or default to all)
2. For each domain:
   - Read expertise.yaml
   - Run all validation checks
   - Collect results
3. Generate summary report
4. Suggest remediation actions

INTEGRATION

- Run automatically on session start (optional hook)
- Run before major releases
- Run after large refactors

RULES
- Non-destructive (read-only validation)
- Report issues but don't auto-fix
- Prioritize drift detection (most critical)
- Keep output concise and actionable
