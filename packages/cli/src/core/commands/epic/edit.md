---
description: Edit an existing epic's fields (title, owner, goal, status)
argument-hint: "EPIC=<EP-ID> [TITLE=<text>] [OWNER=<id>] [GOAL=<text>] [STATUS=<status>]"
compact_context:
  priority: high
  preserve_rules:
    - "ACTIVE COMMAND: /agileflow:epic:edit - Edit epic fields with diff-preview-confirm"
    - "{{RULES:json_operations}}"
    - "{{RULES:user_confirmation}}"
    - "{{RULES:file_preview}}"
    - "MUST read current epic from status.json BEFORE proposing changes"
    - "MUST show diff of old vs new values"
    - "MUST confirm with AskUserQuestion before writing"
    - "MUST log edit event to bus/log.jsonl"
    - "MUST update epic file in docs/05-epics/ if it exists"
  state_fields:
    - epic_id
    - fields_changed
---

# /agileflow:epic:edit

Edit an existing epic's metadata fields with diff preview and confirmation.

---

## STEP 0: Gather Context

```bash
node .agileflow/scripts/obtain-context.js epic:edit
```

---

<!-- COMPACT_SUMMARY_START -->
## Compact Summary

**Command**: `/agileflow:epic:edit EPIC=<EP-ID> [TITLE=...] [OWNER=...] [GOAL=...] [STATUS=...]`
**Purpose**: Edit epic fields in status.json with diff-preview-confirm workflow

### Flow
1. Parse EPIC parameter (required) and optional field overrides
2. Read current epic from status.json
3. Show diff of proposed changes
4. Confirm via AskUserQuestion
5. Apply changes to status.json
6. Update epic file in docs/05-epics/ if it exists
7. Log edit event to bus/log.jsonl

### Critical Rules
- **Diff preview**: Always show old vs new before writing
- **Confirmation**: Never write without user approval
- **Bus logging**: Always append epic-edited event
- **Epic file sync**: Update markdown file if it exists
- **Validation**: Verify JSON integrity after write
<!-- COMPACT_SUMMARY_END -->

---

## Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| EPIC | Yes | Epic ID (e.g., EP-0041) |
| TITLE | No | New epic title |
| OWNER | No | New owner (e.g., AG-DEVOPS, AG-API) |
| GOAL | No | New epic goal description |
| STATUS | No | New status (ready, active, complete, on-hold) |

At least one optional field must be provided (otherwise suggest `/agileflow:epic:view`).

---

## IMMEDIATE ACTIONS

### Step 1: Validate Input

If EPIC not provided:

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "Which epic would you like to edit?",
  "header": "Select",
  "multiSelect": false,
  "options": [
    {"label": "Enter epic ID", "description": "Provide an EP-XXXX identifier"}
  ]
}]</parameter>
</invoke>
```

### Step 2: Read Current Epic

Read the epic entry from `docs/09-agents/status.json`:

```javascript
const data = JSON.parse(fs.readFileSync('docs/09-agents/status.json', 'utf8'));
const epic = data.epics[epicId];
```

If epic not found, show error: "Epic {EPIC} not found in status.json"

### Step 3: Build Change Set

Compare provided fields against current values. Skip fields that match current values (no-op).

If no fields would change, inform user: "No changes detected. Current values match provided values."

### Step 4: Show Diff Preview

Display a clear diff of what will change:

```markdown
## Editing EP-0041: Current Title

| Field | Current | New |
|-------|---------|-----|
| title | "DX Quick Wins" | "DX Quick Wins - March 2026" |
| owner | AG-DEVOPS | AG-API |
| status | ready | active |

Files modified:
1. docs/09-agents/status.json (epic entry update)
2. docs/05-epics/EP-0041-*.md (if exists, update frontmatter)
3. docs/09-agents/bus/log.jsonl (edit event append)
```

### Step 5: Confirm Changes

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "Apply these changes to EP-0041?",
  "header": "Confirm edit",
  "multiSelect": false,
  "options": [
    {"label": "Yes, apply changes (Recommended)", "description": "Update status.json and log edit event"},
    {"label": "No, cancel", "description": "Discard changes"}
  ]
}]</parameter>
</invoke>
```

### Step 6: Apply Changes

On confirmation:

1. **Update status.json** using Edit tool or jq:
   - Update only the changed fields in the epic entry
   - Set `updated` timestamp to current ISO date

2. **Update epic file** (if exists in `docs/05-epics/`):
   - Find matching file: `docs/05-epics/EP-XXXX-*.md`
   - Update title in heading and frontmatter
   - Update owner, status, goal fields

3. **Validate JSON**:
```bash
node -e "JSON.parse(require('fs').readFileSync('docs/09-agents/status.json','utf8')); console.log('valid')"
```

4. **Append to bus/log.jsonl**:
```json
{"ts":"<ISO>","type":"epic-edited","from":"USER","epic":"<EPIC>","changes":{"field":"old_value->new_value"},"text":"Epic edited: <changed fields>"}
```

### Step 7: Confirm Success

```
Epic EP-0041 updated:
  title: "DX Quick Wins" -> "DX Quick Wins - March 2026"
  status: ready -> active
```

---

## Example Usage

```bash
# Edit title
/agileflow:epic:edit EPIC=EP-0041 TITLE="Updated Title"

# Change owner and status
/agileflow:epic:edit EPIC=EP-0041 OWNER=AG-API STATUS=active

# Update goal
/agileflow:epic:edit EPIC=EP-0041 GOAL="New goal description for this epic"

# Multiple fields at once
/agileflow:epic:edit EPIC=EP-0041 TITLE="New Title" OWNER=AG-UI STATUS=active
```

---

## Rules

- **Always preview**: Show diff before applying
- **Always confirm**: Use AskUserQuestion before writes
- **Always log**: Append edit event to bus/log.jsonl
- **Always validate**: Check JSON integrity after write
- **Sync epic file**: Update docs/05-epics/ markdown if it exists
- **No silent changes**: Every change must be visible to the user

---

## Related Commands

- `/agileflow:epic:view` - View epic details
- `/agileflow:epic:list` - List all epics
- `/agileflow:epic` - Create new epic
- `/agileflow:story:edit` - Edit story fields
- `/agileflow:status` - Quick status update
