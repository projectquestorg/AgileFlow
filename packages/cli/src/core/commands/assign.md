---
description: Assign or reassign a story to an owner
argument-hint: STORY=<US-ID> NEW_OWNER=<id> [NEW_STATUS=<status>] [NOTE=<text>]
compact_context:
  priority: high
  preserve_rules:
    - "ACTIVE COMMAND: /agileflow:assign - Story assigner and owner changer"
    - "MUST update story frontmatter (owner, status, updated timestamp)"
    - "MUST update docs/09-agents/status.json using jq or Edit tool"
    - "MUST validate JSON after modification"
    - "MUST append assign event to docs/09-agents/bus/log.jsonl"
    - "MUST use AskUserQuestion for user confirmation (YES/NO format)"
    - "MUST show diff preview before confirming (diff-first pattern)"
    - "Status values: ready|in-progress|blocked|in-review|done"
  state_fields:
    - story_id
    - current_owner
    - new_owner
    - new_status
---

# assign

Assign or reassign a story to an owner with status update.

## STEP 0: Gather Context

```bash
node .agileflow/scripts/obtain-context.js assign
```

<!-- COMPACT_SUMMARY_START -->

## ⚠️ COMPACT SUMMARY - /agileflow:assign IS ACTIVE

**CRITICAL**: You assign/reassign stories to owners. This modifies two files + bus log.

---

### 🚨 RULE #1: ALWAYS Update Both Story File AND status.json

**Two-part update required**:
1. Update story frontmatter (owner, status, updated timestamp)
2. Update docs/09-agents/status.json (using jq or Edit tool)

### 🚨 RULE #2: ALWAYS Use jq or Edit Tool (NEVER echo/cat >)

**REQUIRED**:
- ALWAYS use jq for status.json updates (prevents corruption)
- ALWAYS validate after modification:
```bash
if ! jq empty docs/09-agents/status.json 2>/dev/null; then
  echo "❌ ERROR: status.json is now invalid JSON!"
  exit 1
fi
```

### 🚨 RULE #3: ALWAYS Show Diff Preview Before Confirming

**Workflow**:
1. Parse inputs (STORY, NEW_OWNER, NEW_STATUS, NOTE)
2. Prepare story frontmatter update
3. Prepare status.json update
4. Show unified DIFF preview (story + status.json)
5. Ask YES/NO confirmation
6. Only on YES: Execute all updates + append bus message

### 🚨 RULE #4: VALID STATUS TRANSITIONS

Status can transition:
- `ready` → `in-progress` (starting work)
- `in-progress` → `blocked` (hit blocker)
- `in-progress` → `in-review` (finished, ready for review)
- `blocked` → `in-progress` (blocker resolved)
- `in-review` → `done` (review complete)
- Any → `ready` (reset story)

---

## Key Files & Actions

**Input Parameters**:
```
STORY=<US-ID>             # e.g., US-0042 (required)
NEW_OWNER=<id>            # New owner (required)
NEW_STATUS=<status>       # ready|in-progress|blocked|in-review|done (optional)
NOTE=<text>               # Brief note for bus message (optional)
```

**Files Updated**:
1. docs/06-stories/<EPIC>/<STORY>-<slug>.md (frontmatter)
2. docs/09-agents/status.json (story entry)
3. docs/09-agents/bus/log.jsonl (appended event)

**Story Frontmatter Update**:
```yaml
owner: AG-UI
status: in-progress
updated: 2025-10-22T14:30:00Z
```

**status.json Update**:
```json
{
  "stories": {
    "US-0042": {
      "owner": "AG-UI",
      "status": "in-progress",
      "last_update": "ISO-timestamp"
    }
  }
}
```

**Append to bus/log.jsonl**:
```json
{"ts":"ISO-timestamp","from":"SYSTEM","type":"assign","from":"<user>","to":"<NEW_OWNER>","story":"<STORY>","status":"<NEW_STATUS>","text":"<NOTE>"}
```

---

## Anti-Patterns & Correct Usage

❌ **DON'T**:
- Update story file without updating status.json
- Use echo or cat for JSON changes
- Skip validation after JSON updates
- Forget to show diff before confirming
- Use invalid status values

✅ **DO**:
- Update story frontmatter AND status.json together
- Use jq for JSON operations
- Validate with `jq empty` after every write
- Show diff preview before confirmation
- Use only valid status values

---

## Confirmation Flow

1. **Show diff preview**:
```
Story: docs/06-stories/EP-0010/US-0042-login-form.md
-owner: unassigned
+owner: AG-UI
-status: ready
+status: in-progress

Status: docs/09-agents/status.json
"US-0042": {
  -"owner": "unassigned",
  +"owner": "AG-UI",
  -"status": "ready",
  +"status": "in-progress",
  +"last_update": "ISO-timestamp"
}
```

2. **Ask confirmation**:
```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "Assign US-0042 to AG-UI as in-progress?",
  "header": "Confirm Assignment",
  "multiSelect": false,
  "options": [
    {"label": "Yes, assign", "description": "Update files"},
    {"label": "No, cancel", "description": "Don't assign"}
  ]
}]</parameter>
</invoke>
```

3. **On YES**: Execute updates + validate JSON + append bus message
4. **On NO**: Abort without changes

---

## REMEMBER AFTER COMPACTION

- Updates story frontmatter + status.json + bus log
- ALWAYS validate JSON after modification
- ALWAYS show diff before confirming
- Status values: ready, in-progress, blocked, in-review, done
- Two-part update: story file + status.json (don't forget either)

<!-- COMPACT_SUMMARY_END -->

## Prompt

ROLE: Assigner

INPUTS
STORY=<US-ID>  NEW_OWNER=<id>  NEW_STATUS=ready|in-progress|blocked|in-review|done  NOTE=<short text>

ACTIONS
1) Update story frontmatter (owner,status,updated) in docs/06-stories/**/<STORY>*.
2) Merge docs/09-agents/status.json (owner,status,last_update).
   **CRITICAL**: Always use jq or Edit tool for JSON operations.
3) **Validate JSON after update**:
   ```bash
   # Validate status.json after modification
   if ! jq empty docs/09-agents/status.json 2>/dev/null; then
     echo "❌ ERROR: status.json is now invalid JSON!"
     echo "Fix: Use jq to validate and repair the JSON structure"
     exit 1
   fi
   ```
4) Append bus/log.jsonl "assign" line.

**JSON Safety**: Always use jq or Edit tool (never echo/cat > status.json). Validate after modifications.

Preview changes; YES/NO.
