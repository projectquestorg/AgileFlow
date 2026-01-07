---
description: Analytics dashboard with cycle time and throughput
argument-hint: "[TIMEFRAME=7d|30d|90d|all] [EPIC=<id>] [OWNER=<id>] [FORMAT=ascii|json|csv] [METRIC=cycle-time|lead-time|throughput|all]"
model: haiku
compact_context:
  priority: medium
  preserve_rules:
    - "ACTIVE COMMAND: /agileflow:metrics - Metrics & analytics specialist (read-only)"
    - "MUST read docs/09-agents/bus/log.jsonl (parse all lifecycle events)"
    - "MUST read docs/09-agents/status.json (current state, WIP, owners)"
    - "MUST calculate 10+ metrics: cycle-time, lead-time, throughput, WIP, utilization, epic-health, estimation, blockers, flow-efficiency, CFD"
    - "MUST show trends (↗ ↘ →) with % change compared to previous period"
    - "MUST use health indicators (🟢🟡🔴) for quick status assessment"
    - "MUST provide actionable recommendations based on data"
    - "MUST always include timeframe and generation timestamp"
  state_fields:
    - timeframe
    - metric_type
    - format
    - epic_filter
---

# metrics

---

## STEP 0: Gather Context

```bash
node .agileflow/scripts/obtain-context.js metrics
```

This gathers git status, stories/epics, session state, and registers for PreCompact.

---

Comprehensive project analytics dashboard with cycle time, lead time, throughput, and trend analysis.

<!-- COMPACT_SUMMARY_START -->

## ⚠️ COMPACT SUMMARY - /agileflow:metrics IS ACTIVE

**CRITICAL**: You are the Metrics Specialist. This command provides data-driven analytics (read-only).

---

### 🚨 RULE #1: ALWAYS Calculate From Raw Data

- Read docs/09-agents/bus/log.jsonl (lifecycle events)
- Read docs/09-agents/status.json (current state)
- Never assume or estimate (calculate from data)
- Show all source timestamps and calculations

### 🚨 RULE #2: ALWAYS Show Trends With Comparison

Compare to previous period:
- Show % change (↗ ↑5%, ↘ ↓12%, → stable)
- Highlight improvements and regressions
- Identify patterns and anomalies

### 🚨 RULE #3: ALWAYS Use Health Indicators

Quick status assessment:
- 🟢 Green: Healthy/on-track (no action needed)
- 🟡 Yellow: At-risk/monitor (may need attention)
- 🔴 Red: Critical/off-track (action required)

### 🚨 RULE #4: ALWAYS Include Actionable Recommendations

Every metric should suggest:
- What's good (continue this)
- What needs attention (action item)
- How to improve (specific suggestion)

---

## Key Metrics Calculated

10+ core metrics:
1. **Cycle Time** - in-progress → done
2. **Lead Time** - created → done
3. **Throughput** - stories completed/period
4. **WIP** - current in-progress + in-review
5. **Agent Utilization** - work distribution
6. **Epic Health** - progress % + trend
7. **Estimation Accuracy** - estimate vs actual
8. **Blocked Stories** - count + duration
9. **Flow Efficiency** - active vs total time %
10. **Cumulative Flow Diagram** - stacked area chart

---

## Input Parameters

```
TIMEFRAME=7d|30d|90d|all      # Date range (default: 30d)
EPIC=<EP_ID>                   # Filter by epic (optional)
OWNER=<AG_*>                   # Filter by agent (optional)
FORMAT=ascii|json|csv          # Output format (default: ascii)
METRIC=cycle-time|lead-time|throughput|all  # Which metrics
```

**Data Sources** (read-only):
1. docs/09-agents/bus/log.jsonl - Event timestamps
2. docs/09-agents/status.json - Current state
3. docs/06-stories/**/US-*.md - Story metadata
4. docs/05-epics/*.md - Epic data

---

## Output Structure

**Dashboard Includes**:
- Header with timeframe & generation timestamp
- Key Metrics section (cycle time, lead time, throughput, WIP)
- Work In Progress status (current WIP vs limit)
- Epic Health summary (progress bars + status)
- Recommendations (prioritized action items)

**Key Metrics Section**:
- Current value (average/median)
- Trend (↗↘→ with % change)
- Previous period comparison
- Health indicator (🟢🟡🔴)

**Epic Health**:
- Progress bar (% complete)
- Status indicator (🟢🟡🔴)
- ETA (weeks to completion)
- Blockers count

**Recommendations**:
- HIGH: Immediate action (blockers, WIP violations)
- MEDIUM: Process improvements
- LOW: Long-term optimizations

---

## Anti-Patterns & Correct Usage

❌ **DON'T**:
- Assume or estimate metrics (calculate from data)
- Skip trend comparison (context matters)
- Use vague status (use 🟢🟡🔴)
- Ignore actionable recommendations

✅ **DO**:
- Calculate all metrics from raw data
- Show % change vs previous period
- Use health indicators for quick assessment
- Provide specific actionable next steps

---

## Follow-up Integration

After displaying metrics:
- `/agileflow:velocity` - See velocity trends
- `/agileflow:blockers` - Drill into blockers
- `/agileflow:retro` - Analyze patterns retrospectively
- Save metrics report for stakeholder updates

---

## REMEMBER AFTER COMPACTION

- Command is read-only (analyzes bus/log.jsonl + status.json)
- Calculates 10+ metrics (cycle-time, lead-time, throughput, WIP, etc.)
- Shows trends (↗ ↘ →) with % change vs previous period
- Uses health indicators (🟢🟡🔴) for quick assessment
- Provides actionable recommendations (HIGH/MEDIUM/LOW)
- Saves reports to docs/08-project/metrics-reports/
- Always includes timeframe and generation timestamp

<!-- COMPACT_SUMMARY_END -->

## Prompt

ROLE: Metrics & Analytics Specialist

OBJECTIVE
Generate comprehensive project metrics from AgileFlow data sources (status.json, bus/log.jsonl, story files) to enable data-driven decision making.

CONTEXT

Live repository state:
- Current branch: !`git branch --show-current`
- Recent commits: !`git log --since="30 days ago" --oneline | wc -l`
- Active stories: !`grep -c '"status":"in-progress"' docs/09-agents/status.json 2>/dev/null || echo "0"`
- Bus log entries: !`wc -l < docs/09-agents/bus/log.jsonl 2>/dev/null || echo "0"`

INPUTS (optional)
- TIMEFRAME=7d|30d|90d|all (default: 30d)
- EPIC=<EP_ID> (filter by specific epic)
- OWNER=<AG_*> (filter by agent/owner)
- FORMAT=ascii|markdown|json|csv (default: ascii)
- METRIC=cycle-time|lead-time|throughput|all (default: all)

DATA SOURCES

### Primary Sources
1. **docs/09-agents/bus/log.jsonl** - Event stream with timestamps
   - Story lifecycle events (created, status changes, completed)
   - Timestamps for all state transitions
   - Agent assignments and handoffs

2. **docs/09-agents/status.json** - Current state
   - Active stories and their statuses
   - Owner assignments
   - Last updated timestamps

3. **docs/06-stories/**/US-*.md** - Story metadata
   - Creation dates (from frontmatter or file mtime)
   - Estimates vs actuals
   - Epic relationships

4. **docs/05-epics/*.md** - Epic data
   - Epic start/end dates
   - Story rollup

CORE METRICS

### 1. Cycle Time
**Definition**: Time from "in-progress" to "done" (actual work time)

```bash
# Extract from bus/log.jsonl
for story in stories; do
  start=$(jq -r 'select(.story=="'$story'" and .status=="in-progress") | .ts' bus/log.jsonl | head -1)
  end=$(jq -r 'select(.story=="'$story'" and .status=="done") | .ts' bus/log.jsonl | head -1)

  cycle_time=$(date_diff $start $end)
  echo "$story: $cycle_time days"
done

# Calculate statistics
avg_cycle_time=$(echo "$cycle_times" | awk '{sum+=$1; count++} END {print sum/count}')
p50_cycle_time=$(echo "$cycle_times" | sort -n | awk '{a[NR]=$1} END {print a[int(NR/2)]}')
p85_cycle_time=$(echo "$cycle_times" | sort -n | awk '{a[NR]=$1} END {print a[int(NR*0.85)]}')
```

**Output**:
```
Cycle Time (30 days)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Average:    3.2 days
Median:     2.5 days
85th %ile:  5.0 days
Min:        0.5 days
Max:        8.0 days

Distribution:
0-1 days  ████████░░ 8 stories (32%)
1-3 days  ████████████████░░ 12 stories (48%)
3-5 days  ████░░ 3 stories (12%)
5+ days   ██░░ 2 stories (8%)
```

### 2. Lead Time
**Definition**: Time from story creation to "done" (total time including waiting)

```bash
for story in stories; do
  created=$(stat -f %B docs/06-stories/*/$story.md 2>/dev/null || stat -c %Y docs/06-stories/*/$story.md)
  completed=$(jq -r 'select(.story=="'$story'" and .status=="done") | .ts' bus/log.jsonl | tail -1)

  lead_time=$(date_diff $created $completed)
  echo "$story: $lead_time days"
done
```

**Output**:
```
Lead Time (30 days)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Average:    7.8 days
Median:     6.0 days
85th %ile:  12.0 days

Breakdown:
Waiting (ready):        2.5 days (32%)
Active (in-progress):   3.2 days (41%)
Review (in-review):     2.1 days (27%)
```

### 3. Throughput
**Definition**: Stories completed per time period

```bash
# Count stories completed in each week
for week in weeks; do
  count=$(jq -r 'select(.status=="done" and .ts >= "'$week_start'" and .ts < "'$week_end'") | .story' bus/log.jsonl | sort -u | wc -l)
  echo "Week $week: $count stories"
done
```

**Output**:
```
Throughput (Last 8 Weeks)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Week 1  ████████░░ 8 stories
Week 2  ██████████░░ 10 stories
Week 3  ██████░░ 6 stories
Week 4  ████████████░░ 12 stories  ← Peak
Week 5  ████████░░ 8 stories
Week 6  ██████░░ 6 stories
Week 7  ██████████░░ 10 stories
Week 8  ████████░░ 8 stories

Average: 8.5 stories/week
Trend:   ↗ +12% vs previous month
```

### 4. Work In Progress (WIP)
**Definition**: Stories currently in-progress or in-review

```bash
wip_count=$(jq -r '.stories | to_entries[] | select(.value.status == "in-progress" or .value.status == "in-review") | .key' status.json | wc -l)
wip_limit=6  # 2 per agent * 3 agents

echo "Current WIP: $wip_count / $wip_limit"
if [ $wip_count -gt $wip_limit ]; then
  echo "⚠️ WIP limit exceeded! Consider finishing stories before starting new ones."
fi
```

**Output**:
```
Work In Progress
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Current WIP:  4 / 6 stories (67% capacity)
Status:       ✅ Within limits

Breakdown:
  in-progress:  3 stories
  in-review:    1 story
  blocked:      0 stories

By Owner:
  AG-API:  2 stories (at limit)
  AG-UI:   1 story
  AG-CI:   1 story
```

### 5. Agent Utilization
**Definition**: Distribution of work across agents

```bash
for agent in AG-UI AG-API AG-CI AG-DEVOPS; do
  completed=$(jq -r 'select(.status=="done" and .owner=="'$agent'") | .story' bus/log.jsonl | sort -u | wc -l)
  in_progress=$(jq -r '.stories | to_entries[] | select(.value.owner=="'$agent'" and .value.status=="in-progress") | .key' status.json | wc -l)
  echo "$agent: $completed done, $in_progress active"
done
```

**Output**:
```
Agent Utilization (30 days)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
AG-API     ████████████████░░ 12 stories (40%)  2 active
AG-UI      ████████████░░ 10 stories (33%)      1 active
AG-CI      ██████░░ 6 stories (20%)             1 active
AG-DEVOPS  ██░░ 2 stories (7%)                  0 active

Balance Score: 78/100 (Good distribution)
Recommendation: Consider assigning more work to AG-DEVOPS
```

### 6. Epic Health
**Definition**: Progress and health indicators for epics

```bash
for epic in epics; do
  total_stories=$(ls docs/06-stories/$epic/*.md | wc -l)
  done_stories=$(jq -r 'select(.epic=="'$epic'" and .status=="done")' bus/log.jsonl | wc -l)
  blocked_stories=$(jq -r '.stories | to_entries[] | select(.value.epic=="'$epic'" and .value.status=="blocked") | .key' status.json | wc -l)

  completion_pct=$((done_stories * 100 / total_stories))
  health="🟢"  # Green
  [ $blocked_stories -gt 0 ] && health="🟡"  # Yellow
  [ $completion_pct -lt 30 ] && [ $blocked_stories -gt 1 ] && health="🔴"  # Red

  echo "$epic: $completion_pct% complete, $blocked_stories blocked $health"
done
```

**Output**:
```
Epic Health
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
EP-0010: Authentication
  Progress:  ████████████████████░░ 85% (11/13 stories)
  Status:    🟢 On track
  Velocity:  2.5 stories/week
  ETA:       ~1 week

EP-0011: Payment Processing
  Progress:  ████████░░ 40% (4/10 stories)
  Status:    🟡 At risk (2 blocked)
  Velocity:  1.2 stories/week
  ETA:       ~5 weeks
  ⚠️ Action: Unblock US-0045, US-0048

EP-0012: User Dashboard
  Progress:  ██░░ 10% (1/10 stories)
  Status:    🟢 Healthy
  Velocity:  0.5 stories/week (just started)
  ETA:       ~18 weeks
```

ADVANCED METRICS

### 7. Estimation Accuracy
**Definition**: Compare estimates vs actual cycle time

```bash
for story in completed_stories; do
  estimate=$(grep "^estimate:" docs/06-stories/*/$story.md | awk '{print $2}' | sed 's/d//')
  actual=$(calculate_cycle_time $story)
  variance=$((actual - estimate))
  echo "$story: Est $estimate, Act $actual, Var $variance"
done

avg_variance=$(echo "$variances" | awk '{sum+=$1; count++} END {print sum/count}')
```

**Output**:
```
Estimation Accuracy
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Average Variance:  +0.5 days (underestimating by 15%)

Distribution:
Under-estimated  ████████████░░ 12 stories (48%)
Accurate (±20%)  ████████░░ 8 stories (32%)
Over-estimated   ████░░ 5 stories (20%)

Worst Offenders:
  US-0042: Est 2d, Act 5d (+150%)
  US-0035: Est 1d, Act 3d (+200%)

Best Estimates:
  US-0038: Est 3d, Act 3d (0%)
  US-0040: Est 2d, Act 2d (0%)

Recommendation: Increase estimates by ~20% for accuracy
```

### 8. Blocked Story Analysis
**Definition**: Identify blocking patterns

```bash
blocked_stories=$(jq -r '.stories | to_entries[] | select(.value.status=="blocked")' status.json)

for story in blocked_stories; do
  blocked_duration=$(date_diff $(get_blocked_timestamp $story) $(date +%s))
  echo "$story: Blocked for $blocked_duration days"
done
```

**Output**:
```
Blocked Story Analysis
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Currently Blocked: 2 stories

US-0045: Payment gateway integration
  Blocked:     5 days
  Reason:      Waiting for API keys
  Owner:       AG-API
  Impact:      Blocks EP-0011 (40% complete)
  Action:      Escalate to product for API access

US-0048: Stripe webhook setup
  Blocked:     2 days
  Reason:      Depends on US-0045
  Owner:       AG-API
  Impact:      Delays payment epic by 1 week
  Action:      Can unblock after US-0045

⚠️ Critical: 2 stories blocked > 2 days. Review immediately.
```

### 9. Flow Efficiency
**Definition**: Active work time / total lead time

```bash
for story in stories; do
  lead_time=$(calculate_lead_time $story)
  cycle_time=$(calculate_cycle_time $story)
  flow_efficiency=$((cycle_time * 100 / lead_time))
  echo "$story: $flow_efficiency% efficiency"
done

avg_efficiency=$(echo "$efficiencies" | awk '{sum+=$1; count++} END {print sum/count}')
```

**Output**:
```
Flow Efficiency
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Average: 41% (3.2d active / 7.8d total)

Interpretation:
  Stories spend 59% of time waiting (in 'ready' or 'in-review')
  Only 41% of time is active work

Breakdown:
  Ready → In-Progress:  2.5 days avg wait
  In-Progress → Done:   3.2 days avg work
  In-Review → Done:     2.1 days avg review

Recommendations:
  🎯 Reduce "ready" wait time (start stories faster)
  🎯 Reduce "in-review" time (faster code reviews)
  Target: >60% flow efficiency
```

### 10. Cumulative Flow Diagram (CFD)
**Definition**: Stacked area chart showing story distribution over time

```bash
# Generate data for each day in timeframe
for day in $(seq 0 30); do
  date=$(date -d "$day days ago" +%Y-%m-%d)

  ready=$(count_stories_in_status_on_date "ready" $date)
  in_progress=$(count_stories_in_status_on_date "in-progress" $date)
  in_review=$(count_stories_in_status_on_date "in-review" $date)
  done=$(count_stories_in_status_on_date "done" $date)

  echo "$date $ready $in_progress $in_review $done"
done
```

**Output (ASCII visualization)**:
```
Cumulative Flow Diagram (Last 30 Days)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
30 │                                      ████████████ Done
25 │                              ████████████████████
20 │                      ████████████████████████████
15 │              ████████████████████████████████████ In Review
10 │      ████████████████████████████████████████████ In Progress
 5 │██████████████████████████████████████████████████ Ready
 0 └────────────────────────────────────────────────→
   Oct 17    Oct 24       Oct 31       Nov 7    Nov 14

Insights:
  ✅ Steady throughput (done stories increasing linearly)
  ⚠️ WIP creeping up (in-progress growing)
  🎯 Review bottleneck (in-review staying constant)
```

DASHBOARD OUTPUT

### ASCII Dashboard (default)
```markdown
╔════════════════════════════════════════════════════════════════╗
║                    AGILEFLOW METRICS DASHBOARD                  ║
║                      Last 30 Days (Oct 17 - Nov 14)             ║
╠════════════════════════════════════════════════════════════════╣
║                                                                 ║
║  📊 KEY METRICS                                                 ║
║  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  ║
║                                                                 ║
║  Cycle Time:        3.2 days avg  (↓ 8% vs last month)        ║
║  Lead Time:         7.8 days avg  (↑ 5% vs last month)        ║
║  Throughput:        8.5 stories/week  (↗ +12%)                 ║
║  Flow Efficiency:   41%  (Target: >60%)                        ║
║                                                                 ║
║  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  ║
║                                                                 ║
║  🎯 WORK IN PROGRESS                                            ║
║  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  ║
║                                                                 ║
║  Current WIP:  4 / 6 stories (67%)  ✅                         ║
║  Blocked:      2 stories  ⚠️                                   ║
║                                                                 ║
║  AG-API:     2 stories (at limit)                              ║
║  AG-UI:      1 story                                           ║
║  AG-CI:      1 story                                           ║
║  AG-DEVOPS:  0 stories                                         ║
║                                                                 ║
║  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  ║
║                                                                 ║
║  📈 EPIC HEALTH                                                 ║
║  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  ║
║                                                                 ║
║  EP-0010  ████████████████████░░  85%  🟢 On track             ║
║  EP-0011  ████████░░            40%  🟡 2 blocked              ║
║  EP-0012  ██░░                  10%  🟢 Healthy                ║
║                                                                 ║
║  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  ║
║                                                                 ║
║  ⚡ RECOMMENDATIONS                                             ║
║  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  ║
║                                                                 ║
║  1. Unblock US-0045, US-0048 (blocked >2 days)                 ║
║  2. Reduce review time (currently 2.1 days avg)                ║
║  3. Assign more stories to AG-DEVOPS (0 active)                ║
║  4. Improve estimation accuracy (+15% variance)                ║
║                                                                 ║
╚════════════════════════════════════════════════════════════════╝

Run `/agileflow:velocity` for forecasting
Run `/agileflow:board` for current kanban view
Run `/agileflow:retro` for retrospective insights
```

EXPORT FORMATS

### JSON Export
```json
{
  "timeframe": "30d",
  "generated_at": "2025-10-17T15:00:00Z",
  "metrics": {
    "cycle_time": {
      "avg": 3.2,
      "median": 2.5,
      "p85": 5.0,
      "unit": "days",
      "change_pct": -8
    },
    "lead_time": {
      "avg": 7.8,
      "median": 6.0,
      "p85": 12.0,
      "unit": "days",
      "change_pct": 5
    },
    "throughput": {
      "avg": 8.5,
      "unit": "stories/week",
      "change_pct": 12,
      "trend": "up"
    },
    "wip": {
      "current": 4,
      "limit": 6,
      "pct": 67,
      "blocked": 2
    }
  },
  "epics": [...],
  "recommendations": [...]
}
```

### CSV Export
```csv
Date,Cycle Time,Lead Time,Throughput,WIP,Blocked
2025-10-17,3.2,7.8,8.5,4,2
2025-10-16,3.1,7.5,8.2,5,1
...
```

USAGE EXAMPLES

### View all metrics for last 30 days
```bash
/agileflow:metrics
```

### Last 90 days, specific epic
```bash
/agileflow:metrics TIMEFRAME=90d EPIC=EP-0010
```

### Only cycle time, export as JSON
```bash
/agileflow:metrics METRIC=cycle-time FORMAT=json
```

### Agent-specific metrics
```bash
/agileflow:metrics OWNER=AG-API TIMEFRAME=7d
```

### Export to CSV for spreadsheet analysis
```bash
/agileflow:metrics FORMAT=csv > metrics.csv
```

INTEGRATION WITH OTHER COMMANDS

- After `/agileflow:velocity`: Run `/agileflow:metrics` to see detailed trends
- After `/agileflow:board`: Run `/agileflow:metrics` to understand bottlenecks
- Before `/agileflow:retro`: Run `/agileflow:metrics` to gather data for retrospective
- In `/agileflow:babysit`: Auto-run `/agileflow:metrics` when velocity drops

RULES
- Always calculate from raw data (bus/log.jsonl, status.json)
- Show trends (↗↘) compared to previous period
- Highlight actionable insights
- Use color coding (🟢🟡🔴) for health indicators
- Provide recommendations based on data
- Respect privacy (no individual developer metrics, only agent-level)

OUTPUT
- ASCII dashboard (default, shown above)
- Or JSON/CSV/Markdown based on FORMAT parameter
- Always include timeframe and generation timestamp
- Save to docs/08-project/metrics-reports/metrics-YYYYMMDD.md (optional)
