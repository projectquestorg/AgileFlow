---
description: Create a new epic with stories
argument-hint: EPIC=<EP-ID> TITLE=<text> OWNER=<id> GOAL=<text> [STORIES=<list>]
compact_context:
  priority: high
  preserve_rules:
    - "ACTIVE COMMAND: /agileflow:epic-new - Epic creator for feature planning"
    - "MUST create TodoWrite task list immediately (6 steps: parse, create epic, create stories, merge status, append bus, confirm)"
    - "MUST show file previews before confirming writes"
    - "MUST use Edit tool or jq for JSON operations (never echo/cat > status.json)"
    - "MUST validate JSON after every modification"
    - "MUST use AskUserQuestion for user confirmation (YES/NO/CANCEL format)"
    - "STORIES format: 'US-ID|title|owner,US-ID2|title2|owner2' (comma-separated triplets)"
  state_fields:
    - epic_id
    - owner
    - story_count
    - creation_timestamp
---

# epic-new

---

## STEP 0: Gather Context

```bash
node .agileflow/scripts/obtain-context.js epic
```

This gathers git status, stories/epics, session state, and registers for PreCompact.

---

Create a new epic with optional child stories.

<!-- COMPACT_SUMMARY_START -->

## ⚠️ COMPACT SUMMARY - /agileflow:epic-new IS ACTIVE

**CRITICAL**: You are the Epic Creator. This command creates new epics with associated stories. Follow every rule.

---

### 🚨 RULE #1: ALWAYS Create TodoWrite Task List FIRST

Create a 6-step task list IMMEDIATELY:
```xml
<invoke name="TodoWrite">
<parameter name="content">1. Parse inputs (EPIC, TITLE, OWNER, GOAL, STORIES)
2. Create epic file from template
3. For each story: create docs/06-stories/<EPIC>/<US_ID>-<slug>.md
4. Merge entries into status.json
5. Append assign events to bus/log.jsonl
6. Show preview and confirm with user</parameter>
<parameter name="status">in-progress</parameter>
</invoke>
```
Mark each step complete as you finish it.

### 🚨 RULE #2: NEVER Create Files Without Preview + Confirmation

**Workflow** (ALWAYS follow this order):
1. Parse and validate all inputs
2. Create epic file from template
3. Create story files from template
4. Prepare status.json merge
5. Prepare bus/log.jsonl append
6. Show unified DIFF preview (all files + status.json + bus log)
7. Ask user YES/NO/CANCEL confirmation
8. Only on YES: Execute writes and update status

### 🚨 RULE #3: NEVER Use echo/cat > For JSON Operations

**ALWAYS use one of**:
- Edit tool for small changes
- jq for complex merges
- JSON validation after every write:
```bash
if ! jq empty docs/09-agents/status.json 2>/dev/null; then
  echo "❌ ERROR: status.json is now invalid JSON!"
  exit 1
fi
```

### 🚨 RULE #4: ALWAYS Validate JSON After Modifications

After ANY change to status.json:
```bash
jq empty docs/09-agents/status.json 2>/dev/null || {
  echo "❌ VALIDATION FAILED: status.json is corrupt"
  exit 1
}
```

---

## Key Files & Formats

**Input Parameters**:
```
EPIC=<EP-ID>           # e.g., EP-0001 (required)
TITLE=<text>           # Epic title (required)
OWNER=<id>             # Agent or person name (required)
GOAL=<outcome>         # Epic goal/metric (required)
STORIES=<list>         # Comma-separated triplets (optional)
  Format: "US-0001|Story One|owner,US-0002|Story Two|owner2"
```

**Output Files Created**:
| File | Purpose | Template |
|------|---------|----------|
| docs/05-epics/EP-<ID>.md | Epic definition | epic-template.md |
| docs/06-stories/EP-<ID>/US-<ID>-<slug>.md | Child stories | story-template.md |
| docs/09-agents/status.json | Merged entries | jq merge |
| docs/09-agents/bus/log.jsonl | Appended events | JSONL lines |

**Merge into status.json**:
- Epic entry: {id, owner, status: "active", summary, created, updated}
- Story entries: {id, owner, status: "ready", epic, estimate: "0.5d", deps: [], created, updated}

**Append to bus/log.jsonl**:
```json
{"ts":"ISO","type":"assign","from":"SYSTEM","to":"<owner>","epic":"<EPIC>","text":"Epic created"}
{"ts":"ISO","type":"assign","from":"SYSTEM","to":"<owner>","story":"<US-ID>","text":"Story created"}
```

---

## Anti-Patterns & Correct Usage

❌ **DON'T**:
- Ask user to "type" story list (use structured format)
- Create files without showing preview
- Overwrite status.json (always merge)
- Skip JSON validation after edits
- Create stories without linking to epic

✅ **DO**:
- Show file previews for all 3-5 files being created
- Use proper STORIES format with pipes and commas
- Merge entries into existing JSON (preserve data)
- Validate JSON after every modification
- Link all stories to epic in status.json

---

## Confirmation Flow

1. **Show preview box** with all files being created
   - Epic file path and frontmatter
   - Story file paths and frontmatter
   - status.json changes (diff format)
   - bus/log.jsonl lines to append

2. **Ask confirmation**:
```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "Create epic EP-0010 with 3 stories?",
  "header": "Confirm Epic Creation",
  "multiSelect": false,
  "options": [
    {"label": "Yes, create", "description": "Write all files"},
    {"label": "No, edit", "description": "Modify details"},
    {"label": "Cancel", "description": "Don't create"}
  ]
}]</parameter>
</invoke>
```

3. **On YES**: Execute all writes (files, merge, append)
4. **On NO/CANCEL**: Abort without changes

---

## REMEMBER AFTER COMPACTION

- Command creates epics + child stories in one operation
- ALWAYS parse and validate STORIES input (triplet format)
- ALWAYS preview before confirming (prevents mistakes)
- ALWAYS validate JSON after merge (prevents corruption)
- Use TodoWrite for step tracking (6 steps)
- Files: epic file, N story files, status.json, bus/log.jsonl

<!-- COMPACT_SUMMARY_END -->

## Prompt

ROLE: Epic Creator

OBJECTIVE
Analyze feature requirements and create structured epics with associated stories. Evaluate story breakdown, assess dependencies, and consider implementation sequencing to ensure comprehensive planning.

TODO LIST TRACKING
**CRITICAL**: Immediately create a todo list using TodoWrite tool to track epic creation:
```
1. Parse inputs (EPIC, TITLE, OWNER, GOAL, STORIES)
2. Create docs/05-epics/<EPIC>.md from template
3. For each story: create docs/06-stories/<EPIC>/<US_ID>-<slug>.md
4. Merge entries into docs/09-agents/status.json
5. Append assign lines to docs/09-agents/bus/log.jsonl
6. Show preview and wait for YES/NO confirmation
```

Mark each step complete as you finish it. This ensures nothing is forgotten.

INPUTS
EPIC=<ID e.g., EP-0001>
TITLE=<Epic title>
OWNER=<name or agent id>
GOAL=<outcome/metric>
STORIES=<optional> comma-separated "<US_ID>|<short title>|<owner>"

TEMPLATE
Use the following epic template structure:
@packages/cli/src/core/templates/epic-template.md

ACTIONS
1) Create docs/05-epics/<EPIC>.md from epic-template.md (status=active; created/updated=now).
2) For each story, create docs/06-stories/<EPIC>/<US_ID>-<slug>.md from story-template.md (status=ready; estimate=0.5d; deps=[]).
3) Merge entries into docs/09-agents/status.json (owner,status,branch,summary,last_update).
4) Append "assign" lines to docs/09-agents/bus/log.jsonl.

Always show previews; YES/NO before writing.

---

## POST-CREATION ACTIONS

After successfully creating the epic, offer next steps:

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "Epic <EPIC> created with <N> stories! What would you like to do next?",
  "header": "Next Steps",
  "multiSelect": false,
  "options": [
    {"label": "Add more stories (Recommended)", "description": "Epic may need additional work items"},
    {"label": "Start working on first story", "description": "Begin implementation immediately"},
    {"label": "Plan sprint for this epic", "description": "Schedule stories with /agileflow:sprint"},
    {"label": "View epic details", "description": "See full epic with /agileflow:epic:view"}
  ]
}]</parameter>
</invoke>
```

**If "Add more stories"**:
- Re-run `/agileflow:story EPIC=<EPIC>` with next story ID

**If "Start working on first story"**:
1. Show ready stories in this epic
2. Let user pick one
3. Run `/agileflow:status <STORY> STATUS=in_progress`
4. Ask: "Enter plan mode to explore implementation?"

**If "Plan sprint"**:
- Run `/agileflow:sprint` with this epic's stories

**If "View epic details"**:
- Run `/agileflow:epic:view EPIC=<EPIC>`

---

## Related Commands

- `/agileflow:epic:list` - View all epics with progress
- `/agileflow:epic:view` - View epic details with all stories
- `/agileflow:story` - Create story in epic
- `/agileflow:story:list` - View all stories
- `/agileflow:sprint` - Plan sprint with epic stories
- `/agileflow:board` - Visual kanban board
