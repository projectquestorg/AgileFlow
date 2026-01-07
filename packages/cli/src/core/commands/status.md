---
description: Update story status and progress
argument-hint: STORY=<US-ID> STATUS=<status> [SUMMARY=<text>] [PR=<url>] [TO=<agent-id>]
compact_context:
  priority: high
  preserve_rules:
    - "ACTIVE COMMAND: /agileflow:status - Status updater broadcasting to message bus"
    - "MUST update docs/09-agents/status.json (use jq or Edit tool, never echo/cat >)"
    - "MUST validate JSON after modification (jq empty check)"
    - "MUST append bus message to docs/09-agents/bus/log.jsonl"
    - "MUST use AskUserQuestion for user confirmation (YES/NO format)"
    - "MUST show diff preview before confirming (diff-first pattern)"
    - "Status values: ready|in-progress|blocked|in-review|done"
    - "MUST escape user text automatically (jq handles escaping)"
  state_fields:
    - story_id
    - current_status
    - new_status
    - pr_url
---

# status

Update story status and broadcast to agents via message bus.

---

## STEP 0: Gather Context

```bash
node .agileflow/scripts/obtain-context.js status
```

This gathers git status, stories/epics, session state, and registers for PreCompact.

---

## Context Loading (Documentation)

**PURPOSE**: Immediately load full context before executing any logic.

**ACTIONS**:
1. Read this command file (`.agileflow/commands/status.md`) in its entirety
2. Absorb all instructions, rules, and examples
3. Proceed to execution phase with complete context

**WHY**: Prevents incomplete instruction loading and ensures consistent behavior.

---

<!-- COMPACT_SUMMARY_START -->

## ⚠️ COMPACT SUMMARY - /agileflow:status IS ACTIVE

**CRITICAL**: You update story status and broadcast to agents. This command updates core project state.

---

### 🚨 RULE #1: ALWAYS Use jq or Edit Tool (NEVER echo/cat >)

**REQUIRED**:
- ALWAYS use jq for status.json updates (prevents corruption)
- ALWAYS validate after modification:
```bash
if ! jq empty docs/09-agents/status.json 2>/dev/null; then
  echo "❌ ERROR: status.json is now invalid JSON!"
  exit 1
fi
```

### 🚨 RULE #2: ALWAYS Show Diff Preview Before Confirming

**Workflow**:
1. Parse inputs (STORY, STATUS, SUMMARY, PR, TO)
2. Prepare status.json update
3. Show diff of changes
4. Ask YES/NO confirmation
5. Only on YES: Execute update + append bus message

### 🚨 RULE #3: VALID STATUS VALUES ONLY

Status must be one of:
- `ready` - Story ready to start
- `in-progress` - Currently being worked on
- `blocked` - Waiting on dependency
- `in-review` - Code review/PR in progress
- `done` - Completed and verified

---

## Key Files & Actions

**Input Parameters**:
```
STORY=<US-ID>           # e.g., US-0042 (required)
STATUS=<status>         # ready|in-progress|blocked|in-review|done (required)
SUMMARY=<text>          # 1-2 lines explaining status (optional)
PR=<url>                # Pull request URL for in-review (optional)
TO=<agent-id>           # Recipient agent for bus message (optional)
```

**Update status.json**:
```json
{
  "stories": {
    "US-0042": {
      "status": "in-progress",
      "summary": "Started work on login form",
      "pr": "https://github.com/.../pull/42",
      "last_update": "ISO-timestamp"
    }
  }
}
```

**Append to bus/log.jsonl**:
```json
{"ts":"ISO-timestamp","from":"SYSTEM","to":"<TO or ALL>","type":"status","story":"<STORY>","status":"<STATUS>","text":"<SUMMARY>"}
```

---

## Anti-Patterns & Correct Usage

❌ **DON'T**:
- Use echo or cat to write to status.json
- Skip validation after JSON changes
- Use invalid status values (e.g., "in_progress")
- Forget to show diff before confirming
- Let user text corrupt JSON (use jq escaping)

✅ **DO**:
- Use jq for all JSON operations
- Validate with `jq empty` after every write
- Use only valid status values
- Show diff preview before confirmation
- Let jq handle text escaping automatically

---

## Confirmation Flow

1. **Show diff preview**:
```
docs/09-agents/status.json

- "status": "ready",
+ "status": "in-progress",
+ "summary": "Started work on login form",
+ "pr": "https://github.com/.../pull/42",
```

2. **Ask confirmation**:
```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "Update US-0042 to in-progress?",
  "header": "Confirm Status Update",
  "multiSelect": false,
  "options": [
    {"label": "Yes, update", "description": "Update status.json and bus log"},
    {"label": "No, cancel", "description": "Don't update"}
  ]
}]</parameter>
</invoke>
```

3. **On YES**: Execute update + validate JSON + append bus message
4. **On NO**: Abort without changes

---

## REMEMBER AFTER COMPACTION

- Updates status.json (uses jq for safety)
- Broadcasts to agents via bus/log.jsonl
- ALWAYS validate JSON after modification
- ALWAYS show diff before confirming
- Status values: ready, in-progress, blocked, in-review, done
- Text escaping handled automatically by jq

<!-- COMPACT_SUMMARY_END -->

---

## Prompt

ROLE: Status Updater

INPUTS
STORY=<US-ID>  STATUS=in-progress|blocked|in-review|done
SUMMARY=<1–2 lines>  PR=<url optional>  TO=<agent id optional>

ACTIONS
1) Update docs/09-agents/status.json (status,summary,last_update,pr).
   **CRITICAL**: Always use jq for JSON operations to prevent corruption.
2) **Validate JSON after update**:
   ```bash
   # Validate status.json after modification
   if ! jq empty docs/09-agents/status.json 2>/dev/null; then
     echo "❌ ERROR: status.json is now invalid JSON after update!"
     echo "Fix: Use jq to validate and repair the JSON structure"
     exit 1
   fi
   ```
3) Append a bus line: {"ts":now,"from":"<self>","to":"<TO or ALL>","type":"status","story":"<STORY>","text":"<SUMMARY>"}.

**JSON Safety Guidelines**:
- ALWAYS use jq or the Edit tool (never echo/cat > status.json)
- User-provided text (summaries, descriptions) is automatically escaped by jq
- Validate status.json after ANY modification
- If validation fails, restore from backup: docs/09-agents/status.json.backup

Diff-first; YES/NO.
