---
description: Undo the last status change for a story (rollback)
argument-hint: "STORY=<US-ID>"
compact_context:
  priority: high
  preserve_rules:
    - "ACTIVE COMMAND: /agileflow:status:undo - Rollback story status to previous value"
    - "{{RULES:json_operations}}"
    - "{{RULES:user_confirmation}}"
    - "{{RULES:file_preview}}"
    - "MUST read bus/log.jsonl to find the last status change"
    - "MUST show current vs previous status as diff"
    - "MUST confirm with AskUserQuestion before applying"
    - "MUST log revert event to bus/log.jsonl with type=status-reverted"
  state_fields:
    - story_id
    - current_status
    - previous_status
---

# /agileflow:status:undo

Undo the last status change for a story by reading the bus event log to find the previous status.

---

## STEP 0: Gather Context

```bash
node .agileflow/scripts/obtain-context.js status:undo
```

---

<!-- COMPACT_SUMMARY_START -->
## Compact Summary

**Command**: `/agileflow:status:undo STORY=<US-ID>`
**Purpose**: Rollback a story's status to its previous value using bus log history

### Flow
1. Parse STORY parameter (required)
2. Read bus/log.jsonl to find status change history for the story
3. Read current status from status.json
4. Show diff: current status vs previous status
5. Confirm via AskUserQuestion
6. Apply rollback to status.json
7. Log status-reverted event to bus/log.jsonl

### Critical Rules
- **Bus log sourced**: Previous status comes from bus/log.jsonl history
- **Diff preview**: Show current vs previous before applying
- **Confirmation**: Never write without user approval
- **Bus logging**: Append status-reverted event after rollback
- **No history = no undo**: If no previous status event found, inform user
<!-- COMPACT_SUMMARY_END -->

---

## Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| STORY | Yes | Story ID to revert (e.g., US-0042) |

---

## IMMEDIATE ACTIONS

### Step 1: Validate Input

If STORY not provided, list recently changed stories from bus log.

### Step 2: Find Previous Status

Read `docs/09-agents/bus/log.jsonl` and find status change events for the given story. Look for events with:
- `type: "status"` and matching `story` field
- `type: "assign"` (initial creation = "ready")
- `type: "status-reverted"` (previous undos)

Parse the log in reverse chronological order to find:
1. **Current status event** (most recent)
2. **Previous status event** (the one before that)

If only one status event exists (the initial creation), inform the user:
```
No previous status found for US-0042.
Current status "ready" is the original status from story creation.
Nothing to undo.
```

### Step 3: Read Current State

Read story from `docs/09-agents/status.json` to confirm the current status matches what the bus log says.

### Step 4: Show Diff Preview

```markdown
## Status Undo: US-0042

| | Status |
|---|--------|
| Current | in_progress |
| Revert to | ready |

Based on bus event from 2026-03-01T14:30:00Z:
  "Story US-0042 status changed to in_progress"
```

### Step 5: Confirm Rollback

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "Revert US-0042 from 'in_progress' back to 'ready'?",
  "header": "Confirm undo",
  "multiSelect": false,
  "options": [
    {"label": "Yes, revert status (Recommended)", "description": "Change status from in_progress back to ready"},
    {"label": "No, cancel", "description": "Keep current status"}
  ]
}]</parameter>
</invoke>
```

### Step 6: Apply Rollback

On confirmation:

1. **Update status.json** using Edit tool:
   - Set story status to the previous value
   - Update the `updated` timestamp

2. **Validate JSON**:
```bash
node -e "JSON.parse(require('fs').readFileSync('docs/09-agents/status.json','utf8')); console.log('valid')"
```

3. **Append to bus/log.jsonl**:
```json
{"ts":"<ISO>","type":"status-reverted","from":"USER","story":"<STORY>","from_status":"<current>","to_status":"<previous>","text":"Status reverted from <current> to <previous>"}
```

### Step 7: Confirm Success

```
US-0042 status reverted: in_progress -> ready
```

---

## Edge Cases

| Scenario | Behavior |
|----------|----------|
| No status events in bus log | Check status.json only, inform "no history available" |
| Story not found | Error: "Story {ID} not found in status.json" |
| Current status doesn't match bus log | Warn user, show both, ask which to revert to |
| Multiple rapid changes | Revert to the immediately previous status only |

---

## Example Usage

```bash
# Undo last status change
/agileflow:status:undo STORY=US-0042

# Typical flow: accidentally marked done, want to go back
# Before: done -> After: in_progress
```

---

## Rules

- **Always preview**: Show current vs previous status before applying
- **Always confirm**: Use AskUserQuestion before writes
- **Always log**: Append status-reverted event to bus/log.jsonl
- **Always validate**: Check JSON integrity after write
- **One level**: Only undo one status change at a time (run again for more)
- **Bus log is source of truth**: Previous status comes from event history

---

## Related Commands

- `/agileflow:status` - Update story status
- `/agileflow:story:view` - View story details
- `/agileflow:story:edit` - Edit story fields
- `/agileflow:board` - View kanban board
