---
description: Track and resolve blockers with actionable suggestions
argument-hint: "[AGENT=<id>] [SHOW_RESOLVED=true] [DETAILED=true]"
model: haiku
compact_context:
  priority: high
  preserve_rules:
    - "ACTIVE COMMAND: /agileflow:blockers - Blocker analyst and resolver (read-only analysis)"
    - "MUST read docs/09-agents/status.json (extract blockers and blocked_by)"
    - "MUST read docs/09-agents/bus/log.jsonl (extract blocking events)"
    - "MUST categorize blockers (Technical, Coordination, Clarification, External, Capacity, Research)"
    - "MUST show estimated unblock times based on dependencies"
    - "MUST link to ADRs and research docs for resolution hints"
    - "MUST provide actionable resolution suggestions for each blocker"
    - "MUST highlight v2.7.0 cross-agent coordination (AG-API unblocking AG-UI)"
  state_fields:
    - blocker_count
    - critical_count
    - agent_filter
    - show_resolved
---

# blockers

## STEP 0: Gather Context

```bash
node .agileflow/scripts/obtain-context.js blockers
```

This gathers git status, stories/epics, session state, and registers for PreCompact.

---

<!-- COMPACT_SUMMARY_START -->

## ⚠️ COMPACT SUMMARY - /agileflow:blockers IS ACTIVE

**CRITICAL**: You are the Blocker Analyst. This command analyzes blocking patterns (read-only).

---

### 🚨 RULE #1: ALWAYS Read status.json (Extract Blocker Data)

Extract blockers by:
1. Find stories with status="blocked"
2. Find stories with dependencies not status="done"
3. Count in-progress + in-review per agent (>2 = capacity blocker)
4. Calculate blocking duration (last_update timestamp)

### 🚨 RULE #2: ALWAYS Categorize Blockers

Classify each blocker as ONE of:
1. **Technical** - Missing APIs, infrastructure, dependencies not done
2. **Coordination** - Waiting on other agents, handoff needed
3. **Clarification** - Requirements unclear, AC incomplete
4. **External** - Third-party service, approval, access needed
5. **Capacity** - Agent at WIP limit, no bandwidth
6. **Research** - Need investigation before proceeding

### 🚨 RULE #3: ALWAYS Link to Resolution

For each blocker provide:
- Category and reason
- Estimated unblock time (based on dependency progress)
- ADR links (keyword search in adr-*.md)
- Research links (keyword search in 10-research/*.md)
- Actionable next step

### 🚨 RULE #4: ALWAYS Highlight Cross-Agent Coordination

Show v2.7.0 AG-API ↔ AG-UI coordination:
- Which AG-UI stories blocked waiting for AG-API endpoints
- Which AG-API stories in-progress that will unblock them
- Estimated unblock timeline
- Recent progress messages from bus log

---

## Key Files & Data

**Input Parameters** (all optional):
```
AGENT=<id>           # Filter by specific agent (e.g., AG-UI)
SHOW_RESOLVED=true   # Include recently resolved (last 7 days)
DETAILED=true        # Show extended details (dependencies, ADRs, research)
```

**Data Sources** (read-only):
1. docs/09-agents/status.json - Blocker data + blocked_by field
2. docs/09-agents/bus/log.jsonl - Blocking events + timestamps
3. docs/06-stories/**/US-*.md - Story dependencies
4. docs/03-decisions/adr-*.md - Architecture decisions (keyword match)
5. docs/10-research/*.md - Research notes (keyword match)

**Blocker Detection**:
- Direct: status="blocked"
- Dependency: deps not all status="done"
- Capacity: in-progress + in-review count >2
- Stale: blocked >14 days old

---

## Output Structure

**Summary Section**:
- Total active blockers
- Breakdown by category (Technical, Coordination, etc.)
- Critical count (>14 days)
- Cross-agent coordination needs

**Critical Blockers** (>14 days):
- Listed first (highest priority)
- Include story ID, owner, type, reason, duration

**Active Blockers** (grouped by category):
- Category heading
- List of stories with:
  - ID, owner, blocker type
  - Blocker reason
  - Estimated unblock time
  - Related ADR/research links
  - Actionable resolution

**AG-API Coordination Status**:
- Which AG-UI stories blocked waiting for AG-API
- Which AG-API stories in-progress that will unblock them
- Recent AG-API progress messages
- Estimated unblock timeline

**Recently Resolved** (if SHOW_RESOLVED=true):
- Last 7 days of unblock events
- Who unblocked, when, what blocker

**Prioritized Actions**:
- Ranked next steps (HIGH/MEDIUM/LOW)
- Specific commands to resolve

---

## Anti-Patterns & Correct Usage

❌ **DON'T**:
- Modify status.json (read-only analysis)
- Skip categorization (helps identify patterns)
- Ignore cross-agent coordination
- Hide stale blockers (>14 days)

✅ **DO**:
- Read status.json (no updates)
- Categorize all blockers
- Show AG-API unblocking progress
- Highlight stale blockers for escalation

---

## Confirmation & Integration

After displaying blockers:
```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "What would you like to do?",
  "header": "Blocker Actions",
  "multiSelect": false,
  "options": [
    {"label": "Update blocker status", "description": "Mark blocker as resolved"},
    {"label": "Create unblocking story", "description": "Create story to unblock"},
    {"label": "View ADR details", "description": "See related architecture decisions"},
    {"label": "Escalate blocker", "description": "Escalate for decision"}
  ]
}]</parameter>
</invoke>
```

Integration with other commands:
- `/status` - Update blocker statuses
- `/story-new` - Create unblocking stories
- `/adr-new` - Document blocker decisions
- `/board` - Visualize blocked stories

---

## REMEMBER AFTER COMPACTION

- Command is read-only (analyzes status.json, no updates)
- Extracts 4 blocker types (direct, dependency, capacity, stale)
- Categorizes by 6 types (Technical, Coordination, Clarification, External, Capacity, Research)
- Links to ADRs and research for resolution hints
- Highlights v2.7.0 AG-API ↔ AG-UI cross-agent coordination
- Shows estimated unblock times and actionable next steps
- Highlights stale blockers (>14 days) for escalation

<!-- COMPACT_SUMMARY_END -->

Comprehensive blocker tracking, resolution suggestions, and cross-agent coordination (leverages v2.7.0 AG-API unblocking capabilities).

## Prompt

ROLE: Blocker Analyst & Resolution Coordinator

OBJECTIVE
Extract, categorize, and prioritize all blockers across the AgileFlow system. Leverage v2.7.0's cross-agent coordination where AG-API actively searches for blocked AG-UI stories. Provide actionable resolution suggestions with links to relevant ADRs and research.

INPUTS (all optional)
- AGENT=<agent-id> — Filter by specific agent (e.g., AG-UI, AG-API)
- SHOW_RESOLVED=true — Include recently resolved blockers (last 7 days)
- DETAILED=true — Show extended details (dependencies, research links, ADRs)

KNOWLEDGE LOADING (run first, silently)
Read in order:
1. docs/09-agents/status.json — Current story statuses and blockers
2. docs/09-agents/bus/log.jsonl — Recent unblock/blocked messages (last 50 lines)
3. docs/06-stories/**/US-*.md — Story details for blocked stories
4. docs/03-decisions/adr-*.md — Index all ADRs for resolution suggestions
5. docs/10-research/*.md — Index research notes for blocker context
6. docs/05-epics/*.md — Epic context for blocked stories

BLOCKER EXTRACTION

## 1. Direct Blockers (status="blocked")
```bash
# Extract all blocked stories
jq -r '.stories | to_entries[] | select(.value.status=="blocked") |
  "\(.key)|\(.value.owner)|\(.value.blocked_by // "Not specified")|\(.value.last_update)|\(.value.epic // "none")"' \
  docs/09-agents/status.json
```

## 2. Dependency Blockers (stories waiting on dependencies)
```bash
# Find stories blocked by dependencies
jq -r '.stories | to_entries[] | select(.value.deps) |
  "\(.key)|\(.value.owner)|\(.value.deps | join(","))|\(.value.status)"' \
  docs/09-agents/status.json | while IFS='|' read story owner deps status; do

  # Check each dependency
  IFS=',' read -ra DEP_ARRAY <<< "$deps"
  for dep in "${DEP_ARRAY[@]}"; do
    dep_status=$(jq -r ".stories[\"$dep\"].status" docs/09-agents/status.json 2>/dev/null)

    # If dependency is not done, this is a blocker
    if [ "$dep_status" != "done" ]; then
      dep_owner=$(jq -r ".stories[\"$dep\"].owner" docs/09-agents/status.json 2>/dev/null)
      echo "$story is waiting on $dep (owned by $dep_owner, status: $dep_status)"
    fi
  done
done
```

## 3. WIP Capacity Blockers (agents at WIP limit)
```bash
# Find agents at WIP limit (2 in-progress stories)
jq -r '.stories | to_entries[] | select(.value.status=="in-progress") |
  "\(.value.owner)|\(.key)"' docs/09-agents/status.json | \
  awk -F'|' '{count[$1]++; stories[$1]=stories[$1] $2 " "}
  END {for (agent in count) if (count[agent] >= 2)
    print agent " at WIP limit (" count[agent] "/2): " stories[agent]}'

# Cross-reference with ready stories waiting for these agents
```

## 4. Stale Blockers (blocked >14 days)
```bash
fourteen_days_ago=$(date -u -d '14 days ago' +%Y-%m-%dT%H:%M:%S 2>/dev/null || date -u -v-14d +%Y-%m-%dT%H:%M:%S 2>/dev/null)

jq -r --arg cutoff "$fourteen_days_ago" '.stories | to_entries[] |
  select(.value.status=="blocked") |
  select(.value.last_update < $cutoff) |
  "\(.key)|\(.value.owner)|\(.value.last_update)|\(.value.blocked_by // \"Unknown\")"' \
  docs/09-agents/status.json
```

BLOCKER CATEGORIZATION

Group blockers by type:
1. **Technical** — Missing APIs, infrastructure, dependencies not done
2. **Coordination** — Waiting on other agents, handoff needed
3. **Clarification** — Requirements unclear, acceptance criteria incomplete
4. **External** — Third-party service, approval, access needed
5. **Capacity** — Agent at WIP limit, no bandwidth
6. **Research** — Need investigation before proceeding

Assign category based on:
- `blocked_by` text content (keywords: "API", "waiting", "unclear", "need", "WIP")
- Bus messages (type: "blocked", text analysis)
- Story dependency chain

RESOLUTION SUGGESTIONS

For each blocker, provide:

### Technical Blockers
- Check if dependent story is in-progress
- Estimate completion time (based on story estimate and elapsed time)
- Suggest interim workarounds (mock data, feature flags)
- Link to relevant ADRs (search for technology/component keywords)

### Coordination Blockers (v2.7.0 Focus)
- **AG-API Unblocking Status**: Check bus/log.jsonl for AG-API messages about unblocking AG-UI stories
  ```bash
  # Find AG-API unblock messages for AG-UI stories
  grep '"from":"AG-API"' docs/09-agents/bus/log.jsonl | grep '"type":"unblock"' | tail -n 10
  ```
- Show AG-API progress on implementing endpoints that AG-UI is waiting for
- Suggest handoff if different agent better suited
- Identify if blocker is due to missing communication (no bus messages)

### Clarification Blockers
- Check story file for incomplete AC
- Suggest questions to ask (based on epic goals)
- Link to related research or ADRs
- Recommend creating spike story for investigation

### External Blockers
- Identify who/what is blocking (from blocked_by text)
- Suggest escalation path
- Recommend documenting assumptions to proceed in parallel

### Capacity Blockers
- Show agent's current in-progress stories
- Suggest redistributing to other agents
- Estimate when bandwidth will free up

### Research Blockers
- Search docs/10-research/ for related topics
- Check for stale research (>90 days) that might need updating
- Suggest running /agileflow:research:ask for specific topic
- Link to ADRs that might have context

CROSS-AGENT COORDINATION ANALYSIS (v2.7.0)

Specifically analyze AG-API ↔ AG-UI coordination:

```bash
# Find AG-UI stories blocked waiting for AG-API endpoints
jq -r '.stories | to_entries[] |
  select(.value.owner=="AG-UI") |
  select(.value.status=="blocked") |
  select(.value.blocked_by | contains("API") or contains("endpoint") or contains("backend")) |
  "\(.key)|\(.value.blocked_by)"' docs/09-agents/status.json

# For each, check if AG-API has started work
# Look for AG-API stories that might unblock these
jq -r '.stories | to_entries[] |
  select(.value.owner=="AG-API") |
  select(.value.status=="in-progress" or .value.status=="in-review") |
  "\(.key)|\(.value.summary)"' docs/09-agents/status.json
```

Show:
- Which AG-UI stories are blocked waiting for AG-API
- Which AG-API stories are in progress that will unblock AG-UI
- Estimated unblock timeline (based on AG-API story estimates)
- Recent AG-API unblock messages from bus

ADR & RESEARCH LINKING

For each blocker:
1. **Extract keywords** from blocked_by text and story title
2. **Search ADRs**: `grep -i <keywords> docs/03-decisions/adr-*.md`
3. **Search research**: `grep -i <keywords> docs/10-research/*.md`
4. **Link relevant documents** in output (path + brief context)

Example:
```
US-0042 blocked by "Need authentication middleware decision"
  → Related ADR: docs/03-decisions/adr-005-auth-strategy.md
  → Related Research: docs/10-research/20251015-auth-comparison.md
```

RECENTLY RESOLVED BLOCKERS (if SHOW_RESOLVED=true)

```bash
# Find unblock messages in last 7 days
seven_days_ago=$(date -u -d '7 days ago' +%Y-%m-%dT%H:%M:%S 2>/dev/null || date -u -v-7d +%Y-%m-%dT%H:%M:%S 2>/dev/null)

grep '"type":"unblock"' docs/09-agents/bus/log.jsonl | while read -r line; do
  ts=$(echo "$line" | jq -r '.ts')

  # Compare timestamp
  if [[ "$ts" > "$seven_days_ago" ]]; then
    story=$(echo "$line" | jq -r '.story')
    from=$(echo "$line" | jq -r '.from')
    text=$(echo "$line" | jq -r '.text')
    echo "✅ $ts - $from unblocked $story: $text"
  fi
done
```

OUTPUT FORMAT

```
🚧 Blocker Dashboard
====================
Generated: <timestamp>
Filter: <agent filter if applied, else "All agents">

📊 SUMMARY
----------
Total Active Blockers: X
  - Technical: X
  - Coordination: X
  - Clarification: X
  - External: X
  - Capacity: X
  - Research: X

Critical (>14 days): X
Cross-Agent Blockers: X (AG-UI ↔ AG-API coordination)

🔴 CRITICAL BLOCKERS (>14 days)
-------------------------------
[Story ID] [Owner] [Type] [Blocked Since]
<description>
Resolution: <suggested action>
Related: <ADR/research links>

---

⚠️  ACTIVE BLOCKERS
-------------------
### Technical Blockers (X)

US-0042 | AG-UI | Blocked: Missing login API endpoint
  Status: Blocked for 5 days
  Epic: EP-0010 (Authentication System)
  Dependencies: US-0038 (AG-API, in-progress, est. 1d remaining)

  💡 Resolution:
    - US-0038 is 70% complete (based on elapsed time vs estimate)
    - Estimated unblock: Tomorrow
    - Workaround: Use mock auth data for UI development
    - AG-API is actively working on this (last update: 2h ago)

  📚 Related:
    - ADR: docs/03-decisions/adr-005-auth-strategy.md
    - Research: docs/10-research/20251015-jwt-vs-session.md

---

### Coordination Blockers (X)

[v2.7.0 AG-API Unblocking Status]
AG-API is actively unblocking 2 AG-UI stories:
  ✅ US-0038 (POST /auth/login) - 70% complete, unblocks US-0042
  🔄 US-0041 (GET /user/profile) - 30% complete, unblocks US-0045

Recent AG-API unblock activity:
  - 2h ago: "POST /auth/login endpoint complete, ready for integration"
  - 5h ago: "Started work on user profile endpoint"

---

### Clarification Blockers (X)

US-0051 | AG-DEVOPS | Blocked: Unclear deployment target
  Status: Blocked for 3 days
  Epic: EP-0012 (CI/CD Pipeline)

  💡 Resolution:
    - Story AC incomplete (missing "Then" clause)
    - Suggest questions:
      1. Which platform? (Vercel, AWS, Docker)
      2. What's the target environment? (staging, production, both)
      3. Who approves production deploys?
    - Related: Epic EP-0012 mentions "cloud-native" but no specifics

  📚 Related:
    - Research: docs/10-research/20251010-deployment-comparison.md (90 days old, may be stale)
    - Suggest: /agileflow:research:ask TOPIC="Modern deployment platforms 2025"

---

💪 CAPACITY BLOCKERS
--------------------
AG-API at WIP limit (2/2):
  - US-0038 (in-progress, 70% complete)
  - US-0041 (in-progress, 30% complete)

  Ready stories waiting for AG-API: 3
    - US-0055 (Epic: EP-0011, est: 1d)
    - US-0060 (Epic: EP-0013, est: 2d)
    - US-0062 (Epic: EP-0010, est: 0.5d)

  💡 Suggestion: Wait for US-0038 to complete (est. tomorrow), then pick up US-0062 (smallest)

---

✅ RECENTLY RESOLVED (last 7 days)
----------------------------------
[if SHOW_RESOLVED=true]

2025-10-21 14:30 - AG-API unblocked US-0042: "POST /auth/login endpoint complete"
2025-10-20 09:15 - AG-UI unblocked US-0033: "Design system tokens extracted"
2025-10-19 16:45 - AG-CI unblocked US-0028: "Test environment configured"

---

🎯 PRIORITIZED ACTIONS
----------------------
1. [High] Resolve US-0051 clarification blocker (3 days old, blocking epic)
2. [High] Complete US-0038 (70% done, unblocks AG-UI's US-0042)
3. [Medium] Review stale research for US-0051 (deployment comparison is 90 days old)
4. [Low] Redistribute AG-API backlog when capacity opens

Next Commands:
- /agileflow:status STORY=US-0051 STATUS=ready NOTE="Clarified deployment target: Vercel"
- /agileflow:research:ask TOPIC="Modern deployment platforms 2025"
- /agileflow:validate-system (check for other inconsistencies)
- /agileflow:board (visualize current state)
```

RULES
- Always show both blocker stats and resolution suggestions
- Prioritize critical (>14 days) blockers first
- Highlight v2.7.0 cross-agent coordination (AG-API unblocking AG-UI)
- Link ADRs and research when relevant keywords match
- Suggest specific next commands to resolve blockers
- Read-only operation (no modifications to status.json)
- Group by blocker type for clarity
- Show estimated unblock times based on in-progress dependencies

FOLLOW-UP INTEGRATION
After displaying blockers, ask:
"Would you like me to update any blocker statuses or create resolution stories?"

If yes, suggest:
- `/agileflow:status STORY=<id> STATUS=ready` for resolved blockers
- `/story-new` for creating unblocking stories
- `/handoff` for reassigning capacity-blocked stories
- `/adr-new` for architectural blockers needing decisions
