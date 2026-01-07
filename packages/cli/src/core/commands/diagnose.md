---
description: System health diagnostics
compact_context:
  priority: high
  preserve_rules:
    - "No arguments required - runs full system diagnostics automatically"
    - "Run 4 validation checks: JSON files, auto-archival, hooks system, file sizes"
    - "JSON Validation CRITICAL - validate status.json, metadata, settings with jq empty"
    - "Auto-Archival System - check script executable and hook configuration"
    - "Hooks System - validate .claude/settings.json structure"
    - "File Size Analysis - warn if status.json exceeds 100KB"
    - "Report issues with indicators: ✅ (pass), ❌ (fail), ⚠️ (warn), ℹ️ (info)"
    - "Exit code 0 (healthy) or 1 (issues found)"
  state_fields:
    - total_checks
    - passed_checks
    - warning_count
    - failure_count
---

# diagnose

Run comprehensive AgileFlow system health checks to identify potential issues before they cause failures.

## Prompt

ROLE: System Diagnostician

INPUTS
(no arguments - runs full system diagnostics)

ACTIONS
1) Validate all JSON files (status.json, metadata, settings)
2) Check file structure (docs/, .agileflow/, .claude/)
3) Verify git state and hooks
4) Check for common issues (stale stories, invalid references)
5) Generate health report with recommendations

OBJECTIVE: Validate AgileFlow system health, identify issues, and provide actionable recommendations.

<!-- COMPACT_SUMMARY_START -->
## Compact Summary

The `diagnose` command runs comprehensive system health checks on your AgileFlow installation:

**What it checks:**
- JSON file validation (status.json, metadata, settings) using `jq empty`
- File structure integrity (docs/, .agileflow/, .claude/)
- Auto-archival system configuration
- Hooks system setup
- File size analysis with warnings

**JSON Validation** (using jq):
- Validates all critical JSON files: `jq empty <file>` check
- Reports file sizes and warns if status.json exceeds 100KB
- Distinguishes between critical and optional files
- Shows detailed error messages for invalid JSON

**Auto-Archival System**:
- Checks if archive script exists and is executable (`[ -x <script> ]`)
- Verifies hook configuration in settings.json (jq queries)
- Reports archival threshold from metadata
- Identifies missing or misconfigured components

**Hooks System** (parsing required):
- Validates .claude/settings.json structure (jq parsing)
- Counts SessionStart, UserPromptSubmit, and Stop hooks
- Reports configuration issues

**File Size Analysis**:
- Monitors status.json size with thresholds (50KB warning, 100KB critical)
- Uses `stat` command to get file sizes
- Uses `jq '.stories | length'` to count stories
- Recommends archival when needed

**Diagnostic Checks**:
1. **JSON File Validation** → Check status.json, metadata, settings validity
2. **Auto-Archival System** → Verify archive script + hook configuration
3. **Hooks System** → Validate .claude/settings.json structure
4. **File Size Analysis** → Check status.json size and story count

**Output Format**:
- Indicators: ✅ (pass), ❌ (fail), ⚠️ (warning), ℹ️ (info)
- Shows file sizes in KB and story counts
- Provides actionable next steps for each issue
- Exit code 0 (healthy) or 1 (issues found)

**Common Issues Detected**:
1. Invalid JSON syntax (jq validation failure)
2. Large status.json files needing archival (>100KB)
3. Missing critical files (metadata, status.json)
4. Auto-archival not configured or not executable
5. Hooks system misconfiguration

**Recommended Actions**:
- Run after AgileFlow setup to verify installation
- Run before major operations to catch issues early
- Run periodically to maintain system health
- Use exit code in CI/CD pipelines for validation

**Usage**:
```bash
/agileflow:diagnose
```

**No arguments required** - runs full diagnostic suite automatically.
<!-- COMPACT_SUMMARY_END -->

**Run these diagnostic checks**:

```bash
#!/bin/bash

echo "🔍 AgileFlow System Diagnostics"
echo "================================"
echo ""

# Check 1: Validate all JSON files
echo "📋 JSON File Validation"
echo "----------------------"

JSON_FILES=(
  "docs/00-meta/agileflow-metadata.json"
  "docs/09-agents/status.json"
  "docs/09-agents/status-archive.json"
  ".claude/settings.json"
)

JSON_ERRORS=0

for FILE in "${JSON_FILES[@]}"; do
  if [ -f "$FILE" ]; then
    if jq empty "$FILE" 2>/dev/null; then
      SIZE=$(stat -f%z "$FILE" 2>/dev/null || stat -c%s "$FILE" 2>/dev/null)
      SIZE_KB=$((SIZE / 1024))
      echo "  ✅ $FILE (${SIZE_KB}KB)"

      # Warn if status.json is getting large (>100KB)
      if [[ "$FILE" == "docs/09-agents/status.json" ]] && [ $SIZE -gt 102400 ]; then
        echo "     ⚠️  WARNING: status.json is large (${SIZE_KB}KB). Consider running archival."
        JSON_ERRORS=$((JSON_ERRORS + 1))
      fi
    else
      echo "  ❌ $FILE - INVALID JSON"
      echo "     Error details:"
      jq . "$FILE" 2>&1 | head -3 | sed 's/^/     /'
      JSON_ERRORS=$((JSON_ERRORS + 1))
    fi
  else
    # Only warn for critical files
    if [[ "$FILE" == "docs/00-meta/agileflow-metadata.json" ]] || [[ "$FILE" == "docs/09-agents/status.json" ]]; then
      echo "  ❌ $FILE - NOT FOUND (CRITICAL)"
      JSON_ERRORS=$((JSON_ERRORS + 1))
    else
      echo "  ℹ️  $FILE - not found (optional)"
    fi
  fi
done

echo ""

# Check 2: Auto-Archival System
echo "📦 Auto-Archival System"
echo "----------------------"

if [ -f scripts/archive-completed-stories.sh ]; then
  if [ -x scripts/archive-completed-stories.sh ]; then
    echo "  ✅ Archive script exists and is executable"

    # Check if hooked up
    if [ -f .claude/settings.json ] && grep -q "archive-completed-stories.sh" .claude/settings.json 2>/dev/null; then
      echo "  ✅ Auto-archival hook configured"

      # Check threshold
      if [ -f docs/00-meta/agileflow-metadata.json ]; then
        THRESHOLD=$(jq -r '.archival.threshold_days // "not set"' docs/00-meta/agileflow-metadata.json 2>/dev/null)
        echo "  ✅ Archival threshold: $THRESHOLD days"
      else
        echo "  ⚠️  Archival threshold not configured in metadata"
      fi
    else
      echo "  ❌ Auto-archival hook NOT configured in .claude/settings.json"
      JSON_ERRORS=$((JSON_ERRORS + 1))
    fi
  else
    echo "  ⚠️  Archive script exists but is NOT executable"
    echo "     Fix: chmod +x scripts/archive-completed-stories.sh"
    JSON_ERRORS=$((JSON_ERRORS + 1))
  fi
else
  echo "  ❌ Archive script NOT found (scripts/archive-completed-stories.sh)"
  JSON_ERRORS=$((JSON_ERRORS + 1))
fi

echo ""

# Check 3: Hooks System
echo "🪝 Hooks System"
echo "---------------"

if [ -d .claude ] && [ -f .claude/settings.json ]; then
  if jq empty .claude/settings.json 2>/dev/null; then
    echo "  ✅ .claude/settings.json is valid JSON"

    # Count hooks
    SESSION_START_HOOKS=$(jq '.hooks.SessionStart | length' .claude/settings.json 2>/dev/null)
    USER_PROMPT_HOOKS=$(jq '.hooks.UserPromptSubmit | length' .claude/settings.json 2>/dev/null)
    STOP_HOOKS=$(jq '.hooks.Stop | length' .claude/settings.json 2>/dev/null)

    echo "  ℹ️  SessionStart hooks: $SESSION_START_HOOKS"
    echo "  ℹ️  UserPromptSubmit hooks: $USER_PROMPT_HOOKS"
    echo "  ℹ️  Stop hooks: $STOP_HOOKS"
  else
    echo "  ❌ .claude/settings.json is INVALID JSON"
    JSON_ERRORS=$((JSON_ERRORS + 1))
  fi
else
  echo "  ⚠️  Hooks system not configured"
fi

echo ""

# Check 4: File Sizes
echo "📏 File Size Analysis"
echo "---------------------"

if [ -f docs/09-agents/status.json ]; then
  STATUS_SIZE=$(stat -f%z docs/09-agents/status.json 2>/dev/null || stat -c%s docs/09-agents/status.json 2>/dev/null)
  STATUS_KB=$((STATUS_SIZE / 1024))
  STORY_COUNT=$(jq '.stories | length' docs/09-agents/status.json 2>/dev/null)

  echo "  status.json: ${STATUS_KB}KB ($STORY_COUNT stories)"

  if [ $STATUS_SIZE -gt 102400 ]; then
    echo "  ⚠️  WARNING: status.json exceeds 100KB"
    echo "     Recommendation: Run archival to reduce file size"
    echo "     Command: bash .agileflow/scripts/archive-completed-stories.sh 7"
  elif [ $STATUS_SIZE -gt 51200 ]; then
    echo "  ℹ️  status.json is getting large (>50KB)"
    echo "     Consider running archival soon"
  else
    echo "  ✅ status.json size is healthy"
  fi
fi

if [ -f docs/09-agents/status-archive.json ]; then
  ARCHIVE_SIZE=$(stat -f%z docs/09-agents/status-archive.json 2>/dev/null || stat -c%s docs/09-agents/status-archive.json 2>/dev/null)
  ARCHIVE_KB=$((ARCHIVE_SIZE / 1024))
  ARCHIVE_COUNT=$(jq '.stories | length' docs/09-agents/status-archive.json 2>/dev/null)

  echo "  status-archive.json: ${ARCHIVE_KB}KB ($ARCHIVE_COUNT stories)"
fi

echo ""

# Final Summary
echo "📊 Diagnostic Summary"
echo "====================="

if [ $JSON_ERRORS -eq 0 ]; then
  echo "✅ All checks passed! System is healthy."
  exit 0
else
  echo "⚠️  Found $JSON_ERRORS issue(s) that need attention."
  echo ""
  echo "Next steps:"
  echo "1. Fix JSON validation errors using: jq empty <file> to check, then repair manually"
  echo "2. Add missing files to .gitignore if needed"
  echo "3. Run archival if status.json is too large: bash .agileflow/scripts/archive-completed-stories.sh"
  echo "4. Re-run diagnostics after fixes: /agileflow:diagnose"
  exit 1
fi
```

**Output Format**:
- Show all check results with ✅/❌/⚠️/ℹ️ indicators
- Display file sizes and story counts
- Provide actionable recommendations for issues
- Exit with code 0 if healthy, code 1 if issues found
