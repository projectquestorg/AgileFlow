---
description: Edit an existing story's fields (title, owner, estimate, status, priority)
argument-hint: "STORY=<US-ID> [TITLE=<text>] [OWNER=<id>] [ESTIMATE=<time>] [STATUS=<status>] [PRIORITY=<P0-P3|high|medium|low>]"
compact_context:
  priority: high
  preserve_rules:
    - "ACTIVE COMMAND: /agileflow:story:edit - Edit story fields with diff-preview-confirm"
    - "{{RULES:json_operations}}"
    - "{{RULES:user_confirmation}}"
    - "{{RULES:file_preview}}"
    - "MUST read current story from status.json BEFORE proposing changes"
    - "MUST show diff of old vs new values"
    - "MUST confirm with AskUserQuestion before writing"
    - "MUST log edit event to bus/log.jsonl"
  state_fields:
    - story_id
    - fields_changed
---

# /agileflow:story:edit

Edit an existing story's metadata fields with diff preview and confirmation.

---

## STEP 0: Gather Context

```bash
node .agileflow/scripts/obtain-context.js story:edit
```

---

<!-- COMPACT_SUMMARY_START -->
## Compact Summary

**Command**: `/agileflow:story:edit STORY=<US-ID> [TITLE=...] [OWNER=...] [ESTIMATE=...] [STATUS=...] [PRIORITY=...]`
**Purpose**: Edit story fields in status.json with diff-preview-confirm workflow

### Flow
1. Parse STORY parameter (required) and optional field overrides
2. Read current story from status.json
3. Show diff of proposed changes
4. Confirm via AskUserQuestion
5. Apply changes to status.json
6. Log edit event to bus/log.jsonl

### Critical Rules
- **Diff preview**: Always show old vs new before writing
- **Confirmation**: Never write without user approval
- **Bus logging**: Always append story-edited event
- **Validation**: Verify JSON integrity after write
<!-- COMPACT_SUMMARY_END -->

---

## Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| STORY | Yes | Story ID (e.g., US-0042) |
| TITLE | No | New story title |
| OWNER | No | New owner (e.g., AG-API, AG-UI) |
| ESTIMATE | No | New estimate (e.g., 2h, 1d) |
| STATUS | No | New status (ready, in_progress, blocked, done) |
| PRIORITY | No | New priority (P0, P1, P2, P3, high, medium, low) |

At least one optional field must be provided (otherwise suggest `/agileflow:story:view`).

---

## IMMEDIATE ACTIONS

### Step 1: Validate Input

If STORY not provided:

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "Which story would you like to edit?",
  "header": "Select",
  "multiSelect": false,
  "options": [
    {"label": "Enter story ID", "description": "Provide a US-XXXX identifier"}
  ]
}]</parameter>
</invoke>
```

### Step 2: Read Current Story

Read the story entry from `docs/09-agents/status.json`:

```javascript
const data = JSON.parse(fs.readFileSync('docs/09-agents/status.json', 'utf8'));
const story = data.stories[storyId];
```

If story not found, show error: "Story {STORY} not found in status.json"

### Step 3: Build Change Set

Compare provided fields against current values. Skip fields that match current values (no-op).

If no fields would change, inform user: "No changes detected. Current values match provided values."

### Step 4: Show Diff Preview

Display a clear diff of what will change:

```markdown
## Editing US-0042: Current Title

| Field | Current | New |
|-------|---------|-----|
| title | "Login Form" | "Login Form with Validation" |
| owner | AG-UI | AG-API |
| estimate | 2h | 4h |

Files modified:
1. docs/09-agents/status.json (story entry update)
2. docs/09-agents/bus/log.jsonl (edit event append)
```

### Step 5: Confirm Changes

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "Apply these changes to US-0042?",
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
   - Update only the changed fields in the story entry
   - Set `updated` timestamp to current ISO date

2. **Validate JSON**:
```bash
node -e "JSON.parse(require('fs').readFileSync('docs/09-agents/status.json','utf8')); console.log('valid')"
```

3. **Append to bus/log.jsonl**:
```json
{"ts":"<ISO>","type":"story-edited","from":"USER","story":"<STORY>","changes":{"field":"old_value->new_value"},"text":"Story edited: <changed fields>"}
```

### Step 7: Confirm Success

```
Story US-0042 updated:
  title: "Login Form" -> "Login Form with Validation"
  owner: AG-UI -> AG-API
```

---

## Example Usage

```bash
# Edit title
/agileflow:story:edit STORY=US-0042 TITLE="Updated Title"

# Change owner and estimate
/agileflow:story:edit STORY=US-0042 OWNER=AG-API ESTIMATE=4h

# Change status
/agileflow:story:edit STORY=US-0042 STATUS=blocked

# Multiple fields at once
/agileflow:story:edit STORY=US-0042 TITLE="New Title" OWNER=AG-UI PRIORITY=high
```

---

## Rules

- **Always preview**: Show diff before applying
- **Always confirm**: Use AskUserQuestion before writes
- **Always log**: Append edit event to bus/log.jsonl
- **Always validate**: Check JSON integrity after write
- **No silent changes**: Every change must be visible to the user

---

## Related Commands

- `/agileflow:story:view` - View story details
- `/agileflow:story:list` - List all stories
- `/agileflow:story` - Create new story
- `/agileflow:status` - Quick status update
- `/agileflow:epic:edit` - Edit epic fields
