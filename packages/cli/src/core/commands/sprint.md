---
description: Data-driven sprint planning with velocity forecasting
argument-hint: "[SPRINT=<id>] [DURATION=<number>] [AGENTS=<list>] [MODE=suggest|commit] [FOCUS_EPIC=<EP-ID>]"
model: haiku
compact_context:
  priority: critical
  preserve_rules:
    - "ACTIVE COMMAND: /agileflow:sprint-plan - Sprint planner with capacity analysis"
    - "{{RULES:task_tracking}}"
    - "MUST calculate historical velocity from last 30 days (bus/log.jsonl)"
    - "MUST respect WIP limits (max 2 in-progress per agent)"
    - "MUST validate dependencies resolved (only select stories with all deps status=done)"
    - "{{RULES:file_preview}}"
    - "MUST assess risks (dependency chains, cross-agent coordination, epic staleness)"
    - "MODE=suggest shows preview; MODE=commit updates status.json + milestones.md"
  state_fields:
    - sprint_id
    - velocity_calculated
    - story_count
    - capacity_days
---

<!-- COMPACT_SUMMARY_START
This section is extracted by the PreCompact hook to preserve essential context across conversation compacts.
-->

## Compact Summary

Sprint Planner that creates data-driven sprint commitments based on historical velocity, agent capacity, and dependency validation.

### Critical Behavioral Rules
- **ALWAYS create a TaskCreate/TaskUpdate list** with 8 steps before starting sprint planning
- **Load knowledge sources silently first** (status.json, bus/log.jsonl, backlog.md, roadmap.md, milestones.md, epics, stories)
- **Calculate historical velocity** from last 30 days of completed stories in bus/log.jsonl before selecting stories
- **Respect WIP limits**: Max 2 stories in-progress per agent
- **Validate dependencies resolved**: Only select stories where all deps have status="done"
- **Never commit without preview**: MODE=suggest shows preview, MODE=commit requires diff preview and updates
- **Show diff before committing**: Always display git diff for status.json and milestones.md changes
- **Sequence dependent stories**: Recommend execution order for stories with dependency chains
- **Warn about cross-agent coordination**: Alert when AG-API work must complete before AG-UI

### Core Workflow
1. Analyze current agent capacity (WIP slots available per agent)
2. Calculate historical velocity from bus/log.jsonl (completed stories in last 30 days)
3. Extract ready stories from status.json (status="ready")
4. Filter by resolved dependencies (all deps must be status="done")
5. Prioritize by backlog.md order, epic focus, milestone deadlines
6. Select stories until capacity reached (based on historical velocity)
7. Assess risks (dependency chains, cross-agent coordination, epic staleness)
8. Generate sprint plan report with recommendations
9. If MODE=commit: Update status.json with sprint metadata and append to milestones.md

### Key Files
- **docs/09-agents/status.json** - Current story status, WIP, agent assignments (updated in MODE=commit)
- **docs/09-agents/bus/log.jsonl** - Historical velocity data (completed stories with timestamps)
- **docs/08-project/backlog.md** - Priority order for story selection
- **docs/08-project/roadmap.md** - Strategic priorities and focus areas
- **docs/08-project/milestones.md** - Sprint milestones and deadlines (appended in MODE=commit)
- **docs/05-epics/*.md** - Epic goals and priorities
- **docs/06-stories/**/US-*.md** - Story details, acceptance criteria, estimates

### Selection Criteria Priority Order
1. Must be status="ready" (Definition of Ready met)
2. Dependencies resolved (all deps status="done")
3. Backlog priority (from backlog.md)
4. Epic alignment (FOCUS_EPIC parameter)
5. Milestone deadlines (from milestones.md)
6. Team capacity (don't exceed calculated velocity)
7. Agent balance (distribute work evenly)

### Output Format Must Include
- Capacity analysis (historical velocity, agent slots)
- Backlog status (ready/blocked counts)
- Recommended commitment (selected stories with estimates, priorities, dependencies)
- Deferred stories (capacity reached)
- Sprint goals (based on epic distribution)
- Risks and dependencies (cross-agent coordination, dependency chains)
- Recommendations (sequencing, monitoring, next commands)
- Next steps (different for MODE=suggest vs MODE=commit)

**Tool Usage Examples**:

TaskCreate/TaskUpdate:
```xml
<invoke name="TaskCreate/TaskUpdate">
<parameter name="content">1. Load knowledge sources (status.json, bus log, backlog)
2. Analyze agent capacity and WIP
3. Calculate historical velocity (last 30 days)
4. Select stories based on priority and capacity
5. Assess risks (dependencies, cross-agent coordination)
6. Generate sprint plan report
7. If MODE=commit: Update status.json and milestones.md
8. Create sprint milestone and bus message</parameter>
<parameter name="status">in-progress</parameter>
</invoke>
```

AskUserQuestion (use actual counts and data from analysis):
```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "Sprint [ID]: [N] stories, [X]d estimated ([Y]% of [Z]d capacity). [Risk level]. Commit?",
  "header": "Sprint",
  "multiSelect": false,
  "options": [
    {"label": "Commit sprint plan (Recommended)", "description": "[N] stories across [agents] - [epic summary]. Starts today, ends [date]"},
    {"label": "Adjust story selection", "description": "Currently at [Y]% capacity - add/remove stories before committing"},
    {"label": "View dependency risks first", "description": "[risk_count] risks detected: [top risk summary]"},
    {"label": "Cancel", "description": "Exit without changes to status.json"}
  ]
}]</parameter>
</invoke>
```

<!-- COMPACT_SUMMARY_END -->

# sprint-plan

Intelligent sprint planning with capacity-based story selection, dependency validation, and velocity forecasting.

## STEP 0: Gather Context

```bash
node .agileflow/scripts/obtain-context.js sprint
```

This gathers git status, stories/epics, session state, and registers for PreCompact.

## Prompt

ROLE: Sprint Planner

TODO LIST TRACKING
**CRITICAL**: Immediately create a todo list using TaskCreate/TaskUpdate tool to track sprint planning:
```
1. Load knowledge sources (status.json, bus/log.jsonl, backlog, roadmap, epics, stories)
2. Analyze current state (agent capacity, backlog health)
3. Calculate historical velocity (last 3 sprints/30 days)
4. Select stories based on criteria (ready, dependencies, priority, capacity)
5. Assess risks (dependency chains, cross-agent coordination)
6. Generate sprint plan report
7. If MODE=commit: Update status.json and milestones.md
8. Create sprint milestone and bus message
```

Mark each step complete as you finish it. This ensures comprehensive sprint planning.

OBJECTIVE
Create a data-driven sprint plan by analyzing backlog priorities, agent capacity, historical velocity, and dependency chains. Ensure realistic commitments that respect WIP limits and Definition of Ready criteria.

INPUTS
- SPRINT=<sprint-id> — Sprint identifier (e.g., "Sprint-42", "2025-W43")
- DURATION=<days> — Sprint duration in days (default: 10, typical 2-week sprint)
- AGENTS=<agent-list> — Comma-separated agents to plan for (default: all active agents)
- MODE=<suggest|commit> — "suggest" shows preview, "commit" updates status.json (default: suggest)
- FOCUS_EPIC=<epic-id> — Optionally focus on specific epic

KNOWLEDGE LOADING (run first, silently)
Read in order:
1. docs/09-agents/status.json — Current state, WIP, agent assignments
2. docs/09-agents/bus/log.jsonl — Historical velocity data (completed stories with timestamps)
3. docs/08-project/backlog.md — Priority order for stories
4. docs/08-project/roadmap.md — Strategic priorities
5. docs/08-project/milestones.md — Deadline constraints
6. docs/05-epics/*.md — Epic priorities and goals
7. docs/06-stories/**/US-*.md — Story details, AC, estimates
8. docs/03-decisions/adr-*.md — Recent ADRs that might spawn stories

SPRINT PLANNING PHASES

## Phase 1: Current State Analysis

### Agent Capacity Assessment
```bash
# Calculate available capacity per agent

echo "=== Current Agent Status ==="

for agent in AG-UI AG-API AG-CI AG-DEVOPS MENTOR; do
  in_progress=$(jq -r ".stories | to_entries[] | select(.value.owner==\"$agent\") | select(.value.status==\"in-progress\") | .key" docs/09-agents/status.json | wc -l)
  in_review=$(jq -r ".stories | to_entries[] | select(.value.owner==\"$agent\") | select(.value.status==\"in-review\") | .key" docs/09-agents/status.json | wc -l)

  # WIP limit is 2
  available=$((2 - in_progress))

  echo "$agent: $in_progress in-progress, $in_review in-review → $available slots available"

  # If agent has in-review stories, they might free up soon
  if [ "$in_review" -gt 0 ]; then
    echo "  ⚠️  $in_review stories in review may complete soon (add conditional capacity)"
  fi
done
```

### Backlog Health Check
```bash
# Count ready stories (meet Definition of Ready)
ready_count=$(jq -r '.stories | to_entries[] | select(.value.status=="ready") | .key' docs/09-agents/status.json | wc -l)

echo "Ready stories in backlog: $ready_count"

# Check for blocked stories that might unblock during sprint
blocked_count=$(jq -r '.stories | to_entries[] | select(.value.status=="blocked") | .key' docs/09-agents/status.json | wc -l)

echo "Blocked stories (may unblock): $blocked_count"
```

## Phase 2: Historical Velocity Calculation

### Calculate Team Velocity (last 3 sprints or 30 days)
```bash
# Parse bus/log.jsonl for completed stories with timestamps
thirty_days_ago=$(date -u -d '30 days ago' +%Y-%m-%dT%H:%M:%S 2>/dev/null || date -u -v-30d +%Y-%m-%dT%H:%M:%S 2>/dev/null)

# Extract story completion events
grep '"type":"status"' docs/09-agents/bus/log.jsonl | grep '"done"' | while read -r line; do
  ts=$(echo "$line" | jq -r '.ts')
  story=$(echo "$line" | jq -r '.story')

  # Check if within last 30 days
  if [[ "$ts" > "$thirty_days_ago" ]]; then
    # Get story estimate
    estimate=$(jq -r ".stories[\"$story\"].estimate" docs/09-agents/status.json 2>/dev/null)
    echo "$story|$estimate|$ts"
  fi
done > /tmp/completed_stories.txt

# Sum estimates (convert "0.5d", "1d", "2d" to numeric)
total_days=0
count=0

while IFS='|' read -r story estimate ts; do
  # Extract numeric value
  days=$(echo "$estimate" | grep -oE '[0-9.]+')
  total_days=$(echo "$total_days + $days" | bc)
  count=$((count + 1))
done < /tmp/completed_stories.txt

if [ "$count" -gt 0 ]; then
  velocity=$(echo "scale=1; $total_days / 30 * ${DURATION:-10}" | bc)
  echo "Historical velocity: $total_days days completed in last 30 days"
  echo "Projected capacity for ${DURATION:-10}-day sprint: ${velocity} days"
else
  echo "⚠️  No historical data. Using default capacity: 1 story per agent per sprint"
  velocity="N/A"
fi
```

### Agent-Specific Velocity
```bash
# Calculate velocity per agent (for more accurate planning)

for agent in AG-UI AG-API AG-CI AG-DEVOPS; do
  agent_total=0

  while IFS='|' read -r story estimate ts; do
    owner=$(jq -r ".stories[\"$story\"].owner" docs/09-agents/status.json 2>/dev/null)

    if [ "$owner" == "$agent" ]; then
      days=$(echo "$estimate" | grep -oE '[0-9.]+')
      agent_total=$(echo "$agent_total + $days" | bc)
    fi
  done < /tmp/completed_stories.txt

  if [ $(echo "$agent_total > 0" | bc) -eq 1 ]; then
    agent_velocity=$(echo "scale=1; $agent_total / 30 * ${DURATION:-10}" | bc)
    echo "$agent velocity: ${agent_velocity} days per ${DURATION:-10}-day sprint"
  fi
done
```

## Phase 3: Story Selection & Prioritization

### Selection Criteria (in priority order)
1. **Must be "ready" status** (Definition of Ready met)
2. **Dependencies resolved** (all deps have status="done")
3. **Backlog priority** (from backlog.md or roadmap.md)
4. **Epic alignment** (if FOCUS_EPIC specified, prioritize that epic)
5. **Milestone deadlines** (check milestones.md for urgent items)
6. **Team capacity** (don't exceed calculated velocity)
7. **Agent balance** (distribute work evenly across agents)

### Story Selection Algorithm
```bash
# Extract all ready stories
jq -r '.stories | to_entries[] | select(.value.status=="ready") |
  "\(.key)|\(.value.owner)|\(.value.estimate)|\(.value.epic // \"none\")|\(.value.deps // [] | join(\",\"))"' \
  docs/09-agents/status.json > /tmp/ready_stories.txt

# Filter by dependencies (must be resolved)
while IFS='|' read -r story owner estimate epic deps; do
  blocked=false

  if [ -n "$deps" ]; then
    IFS=',' read -ra DEP_ARRAY <<< "$deps"
    for dep in "${DEP_ARRAY[@]}"; do
      dep_status=$(jq -r ".stories[\"$dep\"].status" docs/09-agents/status.json 2>/dev/null)
      if [ "$dep_status" != "done" ]; then
        blocked=true
        break
      fi
    done
  fi

  # If not blocked, eligible for sprint
  if [ "$blocked" == "false" ]; then
    # Check if agent has capacity
    in_progress=$(jq -r ".stories | to_entries[] | select(.value.owner==\"$owner\") | select(.value.status==\"in-progress\") | .key" docs/09-agents/status.json | wc -l)

    if [ "$in_progress" -lt 2 ]; then
      echo "$story|$owner|$estimate|$epic|eligible"
    else
      echo "$story|$owner|$estimate|$epic|waiting-for-capacity"
    fi
  else
    echo "$story|$owner|$estimate|$epic|blocked"
  fi
done < /tmp/ready_stories.txt > /tmp/eligible_stories.txt
```

### Backlog Priority Matching
```bash
# Read backlog.md to get priority order
if [ -f docs/08-project/backlog.md ]; then
  # Extract story IDs in order of appearance
  grep -oE 'US-[0-9]{4}' docs/08-project/backlog.md > /tmp/backlog_order.txt

  # Match with eligible stories
  while read -r story_id; do
    grep "^${story_id}|" /tmp/eligible_stories.txt
  done < /tmp/backlog_order.txt > /tmp/prioritized_stories.txt
else
  # No backlog.md, use status.json order
  cat /tmp/eligible_stories.txt > /tmp/prioritized_stories.txt
fi
```

### Capacity-Based Selection
```bash
# Select stories until capacity is reached
capacity_days=${velocity:-10}  # Default to sprint duration if no historical data
committed_days=0

echo "=== Sprint Story Selection ==="
echo "Target capacity: ${capacity_days} days"
echo ""

while IFS='|' read -r story owner estimate epic status; do
  # Extract numeric estimate
  days=$(echo "$estimate" | grep -oE '[0-9.]+' || echo "1")

  # Check if adding this story exceeds capacity
  new_total=$(echo "$committed_days + $days" | bc)

  if [ $(echo "$new_total <= $capacity_days" | bc) -eq 1 ]; then
    echo "✅ $story ($estimate) - $owner - Epic: $epic"
    committed_days=$new_total
  else
    echo "⚠️  Capacity reached. Remaining stories in backlog:"
    echo "   $story ($estimate) - $owner - Epic: $epic [deferred]"
  fi
done < /tmp/prioritized_stories.txt
```

## Phase 4: Risk Assessment

### Dependency Chain Analysis
```bash
# For each selected story, check dependency depth
echo ""
echo "=== Dependency Risk Assessment ==="

# Warn if selected stories have complex dependency chains
grep "^✅" /tmp/sprint_selection.txt | while read -r line; do
  story=$(echo "$line" | grep -oE 'US-[0-9]{4}')

  # Check if other stories depend on this one
  dependents=$(jq -r ".stories | to_entries[] | select(.value.deps) | select(.value.deps | index(\"$story\")) | .key" docs/09-agents/status.json)

  if [ -n "$dependents" ]; then
    dep_count=$(echo "$dependents" | wc -l)
    echo "⚠️  $story is blocking $dep_count other stories: $dependents"
    echo "   → Prioritize completion to unblock others"
  fi
done
```

### Cross-Agent Coordination Check
```bash
# Identify stories requiring AG-API + AG-UI coordination
echo ""
echo "=== Cross-Agent Coordination ==="

ag_ui_stories=$(grep "^✅" /tmp/sprint_selection.txt | grep "AG-UI" | grep -oE 'US-[0-9]{4}')
ag_api_stories=$(grep "^✅" /tmp/sprint_selection.txt | grep "AG-API" | grep -oE 'US-[0-9]{4}')

if [ -n "$ag_ui_stories" ] && [ -n "$ag_api_stories" ]; then
  echo "Sprint includes both AG-UI and AG-API work:"
  echo "AG-UI stories: $ag_ui_stories"
  echo "AG-API stories: $ag_api_stories"
  echo ""
  echo "💡 Tip: Sequence AG-API stories first to avoid blocking AG-UI"
fi
```

### Stale Epic Check
```bash
# Warn if sprint is mixing old and new epics
echo ""
echo "=== Epic Freshness Check ==="

grep "^✅" /tmp/sprint_selection.txt | grep -oE 'Epic: EP-[0-9]{4}' | sort -u | while read -r epic_line; do
  epic=$(echo "$epic_line" | grep -oE 'EP-[0-9]{4}')

  if [ -f "docs/05-epics/${epic}.md" ]; then
    created=$(grep "^created:" "docs/05-epics/${epic}.md" | head -n1 | awk '{print $2}')
    echo "$epic created on $created"
  fi
done
```

## Phase 5: Sprint Commitment (if MODE=commit)

If MODE=commit, update status.json with sprint metadata:

```bash
# Add sprint field to selected stories
jq '.stories |= with_entries(
  if (.key | IN("US-0042", "US-0043", "US-0045")) then
    .value.sprint = "Sprint-42" |
    .value.sprint_committed = "2025-10-22T00:00:00Z"
  else
    .
  end
)' docs/09-agents/status.json > /tmp/status_updated.json

# Diff preview
diff -u docs/09-agents/status.json /tmp/status_updated.json

# Ask for confirmation
echo ""
echo "Update status.json with sprint commitments? (YES/NO)"
# Wait for user input
```

### Create Sprint Milestone
```bash
# Update milestones.md with sprint
sprint_end=$(date -u -d '+10 days' +%Y-%m-%d 2>/dev/null || date -u -v+10d +%Y-%m-%d 2>/dev/null)

cat >> docs/08-project/milestones.md <<EOF

## ${SPRINT:-Sprint} (${sprint_end})

**Stories**: ${committed_count} stories, ${committed_days} estimated days
**Team Capacity**: ${velocity} days (based on historical velocity)

**Committed Stories**:
$(grep "^✅" /tmp/sprint_selection.txt)

**Sprint Goals**:
- [Fill in sprint goals based on epic alignment]

**Risks**:
- [Identify from dependency and coordination analysis]

**Definition of Done**:
- All stories merged to main
- CI passing
- Documentation updated
- Demo prepared

EOF
```

### Bus Message
```bash
# Append sprint planning bus message
cat >> docs/09-agents/bus/log.jsonl <<EOF
{"ts":"$(date -u +%Y-%m-%dT%H:%M:%S)Z","from":"EPIC-PLANNER","type":"sprint-planned","text":"${SPRINT:-Sprint} planned: ${committed_count} stories, ${committed_days} days estimated, ends ${sprint_end}"}
EOF
```

OUTPUT FORMAT

```
📅 Sprint Planning Report
=========================
Sprint: ${SPRINT}
Duration: ${DURATION} days
Mode: ${MODE}
Generated: <timestamp>

📊 CAPACITY ANALYSIS
--------------------
Historical Velocity (last 30 days):
  - Team: ${velocity} days per ${DURATION}-day sprint
  - AG-UI: X days
  - AG-API: X days
  - AG-CI: X days
  - AG-DEVOPS: X days

Current Agent Status:
  AG-UI: 1/2 slots filled (1 available)
  AG-API: 2/2 slots filled (at capacity, but 1 in review)
  AG-CI: 0/2 slots filled (2 available)
  AG-DEVOPS: 1/2 slots filled (1 available)

Total Available Capacity: ~X days

📋 BACKLOG STATUS
-----------------
Ready stories: X
Blocked stories: X (may unblock during sprint)
Eligible for sprint: X

✅ RECOMMENDED SPRINT COMMITMENT
--------------------------------
Committed: X stories, Y.Z estimated days (Y% of capacity)

1. US-0042 (1d) - AG-UI - Epic: EP-0010 [Priority: High]
   "User login form with validation"
   Dependencies: None ✅
   Risk: None

2. US-0043 (0.5d) - AG-API - Epic: EP-0010 [Priority: High]
   "POST /auth/login endpoint"
   Dependencies: None ✅
   Risk: Blocks US-0042 → Schedule first ⚠️

3. US-0045 (2d) - AG-UI - Epic: EP-0011 [Priority: Medium]
   "User profile page"
   Dependencies: US-0044 (done) ✅
   Risk: None

4. US-0050 (1d) - AG-CI - Epic: EP-0012 [Priority: Medium]
   "Add E2E tests for auth flow"
   Dependencies: US-0042, US-0043 (both in this sprint) ⚠️
   Risk: Should be done AFTER US-0042 and US-0043 complete

⚠️  DEFERRED (capacity reached)
-------------------------------
5. US-0055 (1d) - AG-API - Epic: EP-0013
   "GET /user/settings endpoint"
   → Move to next sprint or pick up if capacity frees up

🎯 SPRINT GOALS
---------------
(Based on epic distribution)
1. Complete core authentication (EP-0010): 3 stories
2. User profile foundation (EP-0011): 1 story
3. Test coverage for auth (EP-0012): 1 story

⚠️  RISKS & DEPENDENCIES
------------------------
1. Cross-agent coordination required:
   - AG-API must complete US-0043 before AG-UI can finish US-0042
   - Suggest: AG-API prioritizes US-0043 in first 2 days

2. Test story (US-0050) depends on 2 sprint stories:
   - Schedule for end of sprint after US-0042 and US-0043 are done

3. AG-API at capacity:
   - Has 1 story in review (US-0038) likely to complete soon
   - If US-0038 completes early, can pick up deferred US-0055

🔀 PARALLELIZATION ANALYSIS
---------------------------
Stories grouped by execution phase for multi-session workflows:

Phase 1 (Sequential - Foundation):
  These must complete first - no dependencies, prerequisite for others.
  - US-0043: POST /auth/login endpoint (AG-API)

Phase 2 (Parallel-eligible):
  Can run in separate Claude Code sessions simultaneously.
  All depend only on Phase 1 completion.
  - US-0042: User login form (Session A)
  - US-0045: User profile page (Session B)
  └─ Run `/agileflow:session:new` for each parallel task

Phase 3 (Integration - Sequential):
  Must wait for Phase 2 completion.
  - US-0050: E2E tests for auth flow (depends on Phase 2)

💡 For multi-session work, create plan.md with:
   `/agileflow:templates/plan-template.md` or copy from templates/

💡 RECOMMENDATIONS
------------------
1. Sequence stories: US-0043 (AG-API) → US-0042 (AG-UI) → US-0050 (AG-CI)
2. Daily standup focus: AG-API unblocking AG-UI (check /blockers)
3. Mid-sprint checkpoint: Day 5 - assess if US-0055 can be added
4. End-of-sprint: Run /agileflow:velocity to update historical data

📅 SPRINT TIMELINE
------------------
Start: <today>
End: <sprint_end>
Demo: <sprint_end - 1 day>

Definition of Done:
✅ All stories merged to main
✅ CI passing on main
✅ Documentation updated
✅ Demo prepared for stakeholders

Next Steps:
${MODE == "suggest" && "1. Review commitment and run /agileflow:sprint-plan MODE=commit to finalize"}
${MODE == "commit" && "1. ✅ Sprint committed! Stories updated in status.json"}
2. Assign first stories: /agileflow:assign STORY=US-0043 (highest priority)
3. Monitor progress: /agileflow:board
4. Track blockers: /agileflow:blockers
```

RULES
- Always calculate historical velocity before planning
- Respect WIP limits (max 2 per agent)
- Validate dependencies are resolved
- Prioritize by backlog order, milestones, epic goals
- Show diff before committing changes (MODE=commit)
- Provide sequencing recommendations for dependent stories
- Warn about cross-agent coordination needs
- Suggest concrete next commands

FOLLOW-UP QUESTIONS
After displaying plan, ask:
- "Does this sprint commitment look reasonable?"
- "Should I commit this plan (update status.json and milestones.md)?"
- "Any stories you'd like to add/remove?"

---

## Expected Output

### Success - Sprint Planning

```
📅 Sprint Planning: Sprint 13
══════════════════════════════════════════════════════════════

📊 Capacity Analysis
┌────────────────────────────────────────────────────────────┐
│ Team Velocity (avg last 3 sprints): 38 points              │
│ Available capacity: 36 points (1 dev on PTO)               │
│ Recommended commitment: 32-36 points                       │
└────────────────────────────────────────────────────────────┘

📋 Suggested Sprint Backlog
┌────────────────────────────────────────────────────────────┐
│ MUST HAVE (P0-P1) - 24 points                              │
├────────────────────────────────────────────────────────────┤
│ US-0060: OAuth completion (8 pts) - AG-API                 │
│ US-0061: Rate limiting (5 pts) - AG-CI                     │
│ US-0062: Session security fix (3 pts) - AG-SECURITY        │
│ US-0063: Dashboard updates (8 pts) - AG-UI                 │
├────────────────────────────────────────────────────────────┤
│ SHOULD HAVE (P2) - 12 points                               │
├────────────────────────────────────────────────────────────┤
│ US-0064: Email notifications (5 pts) - AG-API              │
│ US-0065: Metrics dashboard (4 pts) - AG-UI                 │
│ US-0066: Documentation update (3 pts) - AG-DOCS            │
└────────────────────────────────────────────────────────────┘

⚠️ Dependency Alert:
US-0060 must complete before US-0064 can start

Total: 36 points | Risk: Low

Commit this sprint plan? [Y/n]
```

### Success - Sprint Started

```
📅 Sprint 13 Started
══════════════════════════════════════════════════════════════

Duration: 2026-01-29 to 2026-02-12 (14 days)
Commitment: 7 stories (36 points)
Goal: Complete OAuth and security hardening

✓ Status.json updated
✓ Sprint created in milestones.md
✓ Stories moved to 'in_progress' column

Next: /agileflow:board to see sprint view
```

### Error - Active Sprint Exists

```
❌ Error: Sprint 12 is still active

Stories remaining: 2 (4 points)
Days remaining: 1

Options:
1. Complete current sprint: /agileflow:sprint ACTION=end
2. Carry over stories: /agileflow:sprint ACTION=carryover
3. Force new sprint: /agileflow:sprint ACTION=start FORCE=true
```

---

## Related Commands

- `/agileflow:board` - Visual kanban board
- `/agileflow:velocity` - Track velocity and forecast capacity
- `/agileflow:metrics` - Analytics dashboard with cycle time
- `/agileflow:assign` - Assign stories to owners
- `/agileflow:blockers` - Track and resolve blockers
- `/agileflow:retro` - Sprint retrospective
