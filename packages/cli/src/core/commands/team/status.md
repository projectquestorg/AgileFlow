---
description: Show team member statuses and tasks
argument-hint: "(no arguments)"
compact_context:
  priority: medium
  preserve_rules:
    - "ACTIVE COMMAND: /agileflow:team:status - Display team status"
    - "Shows per-teammate progress, task assignments, and quality gate results"
  state_fields:
    - team_active
    - teammate_statuses
---

# /agileflow:team:status

Display the current status of an active team session.

---

## Step 1: Check for Active Team

```bash
node -e "
const fs = require('fs');
const p = require('./.agileflow/lib/paths');
const state = JSON.parse(fs.readFileSync(p.getSessionStatePath(), 'utf8'));
console.log(JSON.stringify(state.active_team || null, null, 2));
"
```

If no active team, inform user: "No active team session. Use `/agileflow:team:start <template>` to create one."

## Step 2: Display Team Info

Show a formatted table with:

| Field | Source |
|-------|--------|
| Team Template | session-state.json `active_team.template` |
| Mode | native / subagent |
| Lead | Team lead agent name |
| Started | Timestamp |

## Step 3: Show Teammate Statuses

For each teammate, display:
- Agent name and role (builder/validator/reviewer/analyzer)
- Current status (working/idle/blocked)
- Current task (if any)
- Quality gate results (pass/fail per gate)

### Native Mode

Read from native task list and teammate status.

### Subagent Mode

Read from `docs/09-agents/bus/log.jsonl` for latest messages from each agent.

## Step 4: Show Metrics (if available)

If `session-state.json` has `team_metrics`:
- Total elapsed time
- Tasks completed per teammate
- Quality gate pass rate
- Messages exchanged
