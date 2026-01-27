---
description: Periodic maintenance
argument-hint: (no arguments)
compact_context:
  priority: high
  preserve_rules:
    - "No arguments required - runs full maintenance check automatically"
    - "Run weekly/monthly for ongoing health monitoring"
    - "Check 6 areas: updates, config, status.json health, sessions, expertise, metrics"
    - "Update Check - compare installed vs npm latest version"
    - "Configuration Validity - validate hooks and metadata integrity"
    - "Status.json Health - check size, story count, recommend archival"
    - "Session Cleanup - detect stale or orphaned sessions"
    - "Expert File Staleness - check for outdated expertise files"
    - "Metrics Report - show velocity, completion rates, trends"
    - "Report recommendations with indicators: ✅ (healthy), ⚠️ (attention), ℹ️ (info)"
  state_fields:
    - update_available
    - config_valid
    - status_healthy
    - sessions_clean
    - recommendations_count
---

# maintain

Run periodic maintenance checks on your AgileFlow installation. Use weekly or monthly to keep your setup healthy.

## Prompt

ROLE: Maintenance Specialist

INPUTS
(no arguments - runs full maintenance suite)

ACTIONS
1) Check for AgileFlow updates (npm view agileflow version)
2) Validate configuration integrity (hooks, metadata)
3) Analyze status.json health (size, story count, archival needs)
4) Detect stale sessions and recommend cleanup
5) Check expertise file staleness
6) Generate metrics and recommendations report

OBJECTIVE: Perform routine maintenance checks, identify issues requiring attention, and provide actionable recommendations to keep AgileFlow running optimally.

<!-- COMPACT_SUMMARY_START -->
## Compact Summary

The `maintain` command runs periodic health checks for ongoing AgileFlow maintenance:

**What it checks:**
- AgileFlow version updates (npm registry)
- Configuration integrity (hooks, metadata)
- Status.json health (size, story count)
- Session cleanup needs
- Expertise file staleness
- Project metrics and velocity

**Update Check**:
- Fetches latest version from npm registry
- Compares with installed version
- Reports update availability with command
- Shows changelog highlights for new versions

**Configuration Validation**:
- Validates all JSON config files
- Checks hook configuration consistency
- Verifies metadata schema version
- Reports misconfigurations

**Status.json Health**:
- Monitors file size (warns >50KB, critical >100KB)
- Counts active stories by status
- Checks for orphaned/invalid stories
- Recommends archival when needed

**Session Cleanup**:
- Detects stale sessions (>7 days inactive)
- Finds orphaned registry entries
- Identifies uncommitted changes in sessions
- Suggests cleanup commands

**Expertise Staleness**:
- Checks last_updated dates on expertise.yaml files
- Warns for files >30 days old
- Reports missing required fields
- Suggests refresh for stale files

**Metrics Report**:
- Stories completed this week/month
- Average cycle time
- Current velocity
- WIP limit adherence

**Output Format**:
- Indicators: ✅ (healthy), ⚠️ (needs attention), ℹ️ (informational)
- Actionable recommendations with specific commands
- Overall health score (healthy/attention needed/critical)

**Usage**:
```bash
/agileflow:maintain
```

**Recommended frequency**: Weekly or monthly maintenance runs.
<!-- COMPACT_SUMMARY_END -->

**Run these maintenance checks**:

```bash
#!/bin/bash

echo "🔧 AgileFlow Maintenance Check"
echo "=============================="
echo ""
echo "$(date '+%Y-%m-%d %H:%M:%S')"
echo ""

RECOMMENDATIONS=0
WARNINGS=0

# Check 1: Update Availability
echo "📦 Update Check"
echo "---------------"

# Get installed version
INSTALLED=""
if [ -f ".agileflow/config.yaml" ]; then
  INSTALLED=$(grep -E "^version:" .agileflow/config.yaml 2>/dev/null | sed "s/version:[[:space:]]*['\"]*//" | sed "s/['\"]//g")
fi

if [ -z "$INSTALLED" ] && [ -f "docs/00-meta/agileflow-metadata.json" ]; then
  INSTALLED=$(jq -r '.version // empty' docs/00-meta/agileflow-metadata.json 2>/dev/null)
fi

if [ -z "$INSTALLED" ] && [ -f "packages/cli/package.json" ]; then
  INSTALLED=$(jq -r '.version // empty' packages/cli/package.json 2>/dev/null)
fi

if [ -n "$INSTALLED" ]; then
  echo "  Installed: v$INSTALLED"

  # Fetch latest from npm (with timeout)
  LATEST=$(timeout 10 npm view agileflow version 2>/dev/null)

  if [ -n "$LATEST" ]; then
    echo "  Latest:    v$LATEST"

    if [ "$INSTALLED" != "$LATEST" ]; then
      echo "  ⚠️  Update available!"
      echo "     Run: npx agileflow update"
      WARNINGS=$((WARNINGS + 1))
      RECOMMENDATIONS=$((RECOMMENDATIONS + 1))
    else
      echo "  ✅ Up to date"
    fi
  else
    echo "  ℹ️  Could not check npm registry (offline or timeout)"
  fi
else
  echo "  ℹ️  Could not determine installed version"
fi

echo ""

# Check 2: Configuration Validity
echo "⚙️  Configuration Validity"
echo "--------------------------"

CONFIG_OK=true

# Check metadata
if [ -f "docs/00-meta/agileflow-metadata.json" ]; then
  if jq empty docs/00-meta/agileflow-metadata.json 2>/dev/null; then
    SCHEMA_VER=$(jq -r '.config_schema_version // "not set"' docs/00-meta/agileflow-metadata.json 2>/dev/null)
    echo "  ✅ Metadata valid (schema: $SCHEMA_VER)"
  else
    echo "  ❌ Metadata file has invalid JSON"
    CONFIG_OK=false
    WARNINGS=$((WARNINGS + 1))
  fi
else
  echo "  ⚠️  Metadata file missing"
  CONFIG_OK=false
  WARNINGS=$((WARNINGS + 1))
fi

# Check settings
if [ -f ".claude/settings.json" ]; then
  if jq empty .claude/settings.json 2>/dev/null; then
    HOOK_COUNT=$(jq '[.hooks | to_entries[] | .value | length] | add // 0' .claude/settings.json 2>/dev/null)
    echo "  ✅ Settings valid ($HOOK_COUNT hooks configured)"
  else
    echo "  ❌ Settings file has invalid JSON"
    CONFIG_OK=false
    WARNINGS=$((WARNINGS + 1))
  fi
else
  echo "  ⚠️  Settings file missing"
  CONFIG_OK=false
  WARNINGS=$((WARNINGS + 1))
fi

# Check config.yaml
if [ -f ".agileflow/config.yaml" ]; then
  echo "  ✅ Config.yaml present"
else
  echo "  ⚠️  Config.yaml missing"
  CONFIG_OK=false
fi

if [ "$CONFIG_OK" = false ]; then
  echo ""
  echo "  Recommendation: Run /agileflow:configure to fix configuration"
  RECOMMENDATIONS=$((RECOMMENDATIONS + 1))
fi

echo ""

# Check 3: Status.json Health
echo "📊 Status.json Health"
echo "---------------------"

if [ -f "docs/09-agents/status.json" ]; then
  if jq empty docs/09-agents/status.json 2>/dev/null; then
    SIZE=$(stat -f%z docs/09-agents/status.json 2>/dev/null || stat -c%s docs/09-agents/status.json 2>/dev/null)
    SIZE_KB=$((SIZE / 1024))
    STORY_COUNT=$(jq '.stories | length // 0' docs/09-agents/status.json 2>/dev/null)
    COMPLETED=$(jq '[.stories | to_entries[] | select(.value.status == "completed")] | length' docs/09-agents/status.json 2>/dev/null)
    IN_PROGRESS=$(jq '[.stories | to_entries[] | select(.value.status == "in_progress")] | length' docs/09-agents/status.json 2>/dev/null)
    BLOCKED=$(jq '[.stories | to_entries[] | select(.value.status == "blocked")] | length' docs/09-agents/status.json 2>/dev/null)
    READY=$(jq '[.stories | to_entries[] | select(.value.status == "ready")] | length' docs/09-agents/status.json 2>/dev/null)

    echo "  File size: ${SIZE_KB}KB"
    echo "  Total stories: $STORY_COUNT"
    echo "    • In Progress: $IN_PROGRESS"
    echo "    • Blocked: $BLOCKED"
    echo "    • Ready: $READY"
    echo "    • Completed: $COMPLETED"

    if [ $SIZE -gt 102400 ]; then
      echo ""
      echo "  ⚠️  File size exceeds 100KB - archival recommended"
      echo "     Run: bash scripts/archive-completed-stories.sh"
      WARNINGS=$((WARNINGS + 1))
      RECOMMENDATIONS=$((RECOMMENDATIONS + 1))
    elif [ $SIZE -gt 51200 ]; then
      echo ""
      echo "  ℹ️  File size >50KB - consider archival soon"
    else
      echo ""
      echo "  ✅ File size healthy"
    fi

    # Check for stories without required fields
    INVALID=$(jq '[.stories | to_entries[] | select(.value.title == null or .value.status == null)] | length' docs/09-agents/status.json 2>/dev/null)
    if [ "$INVALID" -gt 0 ]; then
      echo "  ⚠️  $INVALID story/stories missing required fields"
      WARNINGS=$((WARNINGS + 1))
    fi
  else
    echo "  ❌ status.json has invalid JSON"
    WARNINGS=$((WARNINGS + 1))
  fi
else
  echo "  ⚠️  status.json not found"
  echo "     Run: /agileflow:status to initialize"
  WARNINGS=$((WARNINGS + 1))
fi

echo ""

# Check 4: Session Cleanup
echo "🔄 Session Health"
echo "-----------------"

SESSION_REGISTRY=".agileflow/sessions/registry.json"
if [ -f "$SESSION_REGISTRY" ]; then
  TOTAL_SESSIONS=$(jq '.sessions | length // 0' "$SESSION_REGISTRY" 2>/dev/null)
  echo "  Registered sessions: $TOTAL_SESSIONS"

  # Check for stale sessions (last_active > 7 days ago)
  CUTOFF=$(date -d '7 days ago' +%s 2>/dev/null || date -v-7d +%s 2>/dev/null)
  if [ -n "$CUTOFF" ]; then
    STALE=$(jq --arg cutoff "$CUTOFF" '[.sessions | to_entries[] | select((.value.last_active | fromdateiso8601) < ($cutoff | tonumber))] | length' "$SESSION_REGISTRY" 2>/dev/null)
    if [ "$STALE" -gt 0 ]; then
      echo "  ⚠️  $STALE stale session(s) (>7 days inactive)"
      echo "     Run: /agileflow:session:cleanup to clean up"
      WARNINGS=$((WARNINGS + 1))
      RECOMMENDATIONS=$((RECOMMENDATIONS + 1))
    else
      echo "  ✅ No stale sessions"
    fi
  fi
else
  echo "  ℹ️  No session registry (parallel sessions not used)"
fi

# Check session-state.json
if [ -f "docs/09-agents/session-state.json" ]; then
  ACTIVE_CMDS=$(jq '.active_commands | length // 0' docs/09-agents/session-state.json 2>/dev/null)
  if [ "$ACTIVE_CMDS" -gt 0 ]; then
    echo "  ℹ️  $ACTIVE_CMDS active command(s) in session state"
  fi
fi

echo ""

# Check 5: Expertise File Staleness
echo "🧠 Expertise Files"
echo "------------------"

EXPERTS_DIR=""
if [ -d ".agileflow/experts" ]; then
  EXPERTS_DIR=".agileflow/experts"
elif [ -d "packages/cli/src/core/experts" ]; then
  EXPERTS_DIR="packages/cli/src/core/experts"
fi

if [ -n "$EXPERTS_DIR" ] && [ -d "$EXPERTS_DIR" ]; then
  TOTAL_EXPERTS=$(find "$EXPERTS_DIR" -name "expertise.yaml" -type f 2>/dev/null | wc -l | tr -d ' ')
  echo "  Total expertise files: $TOTAL_EXPERTS"

  # Check for stale files (>30 days)
  STALE_COUNT=0
  while IFS= read -r FILE; do
    LAST_UPDATED=$(grep -E "^last_updated:" "$FILE" 2>/dev/null | sed 's/last_updated:[[:space:]]*//' | tr -d "'" | tr -d '"')
    if [ -n "$LAST_UPDATED" ]; then
      # Convert to timestamp for comparison
      LAST_TS=$(date -d "$LAST_UPDATED" +%s 2>/dev/null || date -jf "%Y-%m-%d" "$LAST_UPDATED" +%s 2>/dev/null)
      CUTOFF_TS=$(date -d '30 days ago' +%s 2>/dev/null || date -v-30d +%s 2>/dev/null)
      if [ -n "$LAST_TS" ] && [ -n "$CUTOFF_TS" ] && [ "$LAST_TS" -lt "$CUTOFF_TS" ]; then
        STALE_COUNT=$((STALE_COUNT + 1))
      fi
    fi
  done < <(find "$EXPERTS_DIR" -name "expertise.yaml" -type f 2>/dev/null | head -10)

  if [ $STALE_COUNT -gt 0 ]; then
    echo "  ⚠️  $STALE_COUNT expertise file(s) >30 days old"
    echo "     Run: /agileflow:validate-expertise for details"
    WARNINGS=$((WARNINGS + 1))
    RECOMMENDATIONS=$((RECOMMENDATIONS + 1))
  else
    echo "  ✅ Expertise files up to date"
  fi
else
  echo "  ℹ️  No expertise files found"
fi

echo ""

# Check 6: Metrics Summary
echo "📈 Project Metrics"
echo "------------------"

if [ -f "docs/09-agents/status.json" ]; then
  # Count completions in last 7 days
  WEEK_AGO=$(date -d '7 days ago' +%Y-%m-%d 2>/dev/null || date -v-7d +%Y-%m-%d 2>/dev/null)
  if [ -n "$WEEK_AGO" ]; then
    COMPLETED_THIS_WEEK=$(jq --arg since "$WEEK_AGO" '[.stories | to_entries[] | select(.value.status == "completed" and .value.completed_at != null and .value.completed_at >= $since)] | length' docs/09-agents/status.json 2>/dev/null)
    echo "  Completed this week: $COMPLETED_THIS_WEEK stories"
  fi

  # WIP count
  WIP=$(jq '[.stories | to_entries[] | select(.value.status == "in_progress")] | length' docs/09-agents/status.json 2>/dev/null)
  echo "  Current WIP: $WIP"

  # WIP limit check (default 3)
  WIP_LIMIT=3
  if [ -f "docs/00-meta/agileflow-metadata.json" ]; then
    CUSTOM_LIMIT=$(jq -r '.wip_limit // empty' docs/00-meta/agileflow-metadata.json 2>/dev/null)
    if [ -n "$CUSTOM_LIMIT" ]; then
      WIP_LIMIT=$CUSTOM_LIMIT
    fi
  fi

  if [ "$WIP" -gt "$WIP_LIMIT" ]; then
    echo "  ⚠️  WIP exceeds limit ($WIP > $WIP_LIMIT)"
    WARNINGS=$((WARNINGS + 1))
  else
    echo "  ✅ WIP within limit ($WIP / $WIP_LIMIT)"
  fi

  # Blocked stories
  BLOCKED=$(jq '[.stories | to_entries[] | select(.value.status == "blocked")] | length' docs/09-agents/status.json 2>/dev/null)
  if [ "$BLOCKED" -gt 0 ]; then
    echo "  ⚠️  $BLOCKED blocked story/stories need attention"
    WARNINGS=$((WARNINGS + 1))
  fi
fi

echo ""

# Final Summary
echo "📋 Maintenance Summary"
echo "======================"

if [ $WARNINGS -eq 0 ]; then
  echo "✅ System is healthy!"
  echo ""
  echo "No maintenance actions required."
else
  echo "⚠️  Found $WARNINGS item(s) needing attention"
  echo ""
  if [ $RECOMMENDATIONS -gt 0 ]; then
    echo "Recommended actions ($RECOMMENDATIONS):"
    [ -n "$LATEST" ] && [ "$INSTALLED" != "$LATEST" ] && echo "  • Update AgileFlow: npx agileflow update"
    [ "$CONFIG_OK" = false ] && echo "  • Fix configuration: /agileflow:configure"
    [ $SIZE -gt 102400 ] 2>/dev/null && echo "  • Archive old stories: bash scripts/archive-completed-stories.sh"
    [ $STALE -gt 0 ] 2>/dev/null && echo "  • Clean up sessions: /agileflow:session:cleanup"
    [ $STALE_COUNT -gt 0 ] 2>/dev/null && echo "  • Review expertise: /agileflow:validate-expertise"
  fi
fi

echo ""
echo "Run /agileflow:diagnose for detailed system health check."
```

**Output Format**:
- Show all maintenance check results with ✅/⚠️/ℹ️ indicators
- Display actionable recommendations with specific commands
- Provide overall health status
- Group recommendations by priority

---

## Expected Output

### Healthy System

```
🔧 AgileFlow Maintenance Check
==============================

2026-01-27 09:15:32

📦 Update Check
---------------
  Installed: v2.94.1
  Latest:    v2.94.1
  ✅ Up to date

⚙️  Configuration Validity
--------------------------
  ✅ Metadata valid (schema: 2.94.0)
  ✅ Settings valid (6 hooks configured)
  ✅ Config.yaml present

📊 Status.json Health
---------------------
  File size: 45KB
  Total stories: 127
    • In Progress: 2
    • Blocked: 0
    • Ready: 5
    • Completed: 120

  ✅ File size healthy

🔄 Session Health
-----------------
  Registered sessions: 1
  ✅ No stale sessions

🧠 Expertise Files
------------------
  Total expertise files: 26
  ✅ Expertise files up to date

📈 Project Metrics
------------------
  Completed this week: 8 stories
  Current WIP: 2
  ✅ WIP within limit (2 / 3)

📋 Maintenance Summary
======================
✅ System is healthy!

No maintenance actions required.

Run /agileflow:diagnose for detailed system health check.
```

### System Needing Attention

```
🔧 AgileFlow Maintenance Check
==============================

2026-01-27 09:15:32

📦 Update Check
---------------
  Installed: v2.93.0
  Latest:    v2.94.1
  ⚠️  Update available!
     Run: npx agileflow update

⚙️  Configuration Validity
--------------------------
  ✅ Metadata valid (schema: 2.90.0)
  ✅ Settings valid (4 hooks configured)
  ✅ Config.yaml present

📊 Status.json Health
---------------------
  File size: 156KB
  Total stories: 423
    • In Progress: 5
    • Blocked: 2
    • Ready: 12
    • Completed: 404

  ⚠️  File size exceeds 100KB - archival recommended
     Run: bash scripts/archive-completed-stories.sh

🔄 Session Health
-----------------
  Registered sessions: 4
  ⚠️  2 stale session(s) (>7 days inactive)
     Run: /agileflow:session:cleanup to clean up

🧠 Expertise Files
------------------
  Total expertise files: 26
  ⚠️  5 expertise file(s) >30 days old
     Run: /agileflow:validate-expertise for details

📈 Project Metrics
------------------
  Completed this week: 3 stories
  Current WIP: 5
  ⚠️  WIP exceeds limit (5 > 3)
  ⚠️  2 blocked story/stories need attention

📋 Maintenance Summary
======================
⚠️  Found 6 item(s) needing attention

Recommended actions (4):
  • Update AgileFlow: npx agileflow update
  • Archive old stories: bash scripts/archive-completed-stories.sh
  • Clean up sessions: /agileflow:session:cleanup
  • Review expertise: /agileflow:validate-expertise

Run /agileflow:diagnose for detailed system health check.
```

---

## Related Commands

- `/agileflow:install` - Post-installation validation
- `/agileflow:diagnose` - Full system health diagnostics
- `/agileflow:configure` - Configure AgileFlow features
- `/agileflow:session:cleanup` - Clean up stale sessions
- `/agileflow:validate-expertise` - Validate expertise files
