---
description: Gracefully shut down a team
argument-hint: (no arguments)
compact_context:
  priority: high
  preserve_rules:
    - "ACTIVE COMMAND: /agileflow:team:stop - Gracefully shut down team session"
    - "Must sync final states to status.json before cleanup"
    - "AskUserQuestion for confirmation before stopping"
  state_fields:
    - team_active
    - final_task_states
---

# /agileflow:team:stop

Gracefully shut down an active team session.

---

## Step 1: Check for Active Team

Verify there is an active team session in `session-state.json`.

If no active team, inform user: "No active team session to stop."

## Step 2: Confirm with User

Use AskUserQuestion:
- "Stop the active team? This will end all teammate sessions."
- Options: "Yes, stop team" / "No, keep running"

## Step 3: Sync Final States

Before stopping:

1. **Collect final task states** from all teammates
2. **Write results to status.json** — sync any completed stories, task progress
3. **Save team metrics** to session-state.json for observability
4. **Log coordination summary** to bus/log.jsonl

## Step 4: Stop Teammates

### Native Mode

Teammates will be stopped when the team lead session ends.
The native Agent Teams runtime handles cleanup.

### Subagent Mode

No explicit cleanup needed — subagents end when their Task completes.

## Step 5: Clear Team State

Remove `active_team` from session-state.json:

```bash
node -e "
const fs = require('fs');
const p = require('./.agileflow/lib/paths');
const statePath = p.getSessionStatePath();
const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
delete state.active_team;
fs.writeFileSync(statePath, JSON.stringify(state, null, 2) + '\n');
console.log('Team session ended.');
"
```

## Step 6: Report

Show summary:
- Duration of team session
- Tasks completed
- Quality gate results
- Stories updated
