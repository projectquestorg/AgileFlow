---
description: Export stories and epics to CSV, JSON, or Markdown for stakeholder reporting
argument-hint: "FORMAT=csv|json|md [EPIC=<EP-ID>] [STATUS=<status>] [OWNER=<id>]"
compact_context:
  priority: medium
  preserve_rules:
    - "ACTIVE COMMAND: /agileflow:export - Export stories/epics to CSV/JSON/Markdown"
    - "{{RULES:json_operations}}"
    - "MUST read status.json as data source"
    - "MUST support FORMAT=csv|json|md (default: csv)"
    - "MUST support optional filters: EPIC, STATUS, OWNER"
    - "MUST save output to docs/08-project/exports/"
  state_fields:
    - format
    - filter_epic
    - filter_status
    - filter_owner
    - output_path
---

# /agileflow:export

Export stories and epics from status.json to CSV, JSON, or Markdown for stakeholder reporting.

---

## STEP 0: Gather Context

```bash
node .agileflow/scripts/obtain-context.js export
```

---

<!-- COMPACT_SUMMARY_START -->
## Compact Summary

**Command**: `/agileflow:export FORMAT=csv|json|md [EPIC=...] [STATUS=...] [OWNER=...]`
**Purpose**: Export filtered stories to CSV, JSON, or Markdown files

### Flow
1. Parse FORMAT and optional filters
2. Read status.json
3. Apply filters (epic, status, owner)
4. Generate output in requested format
5. Save to docs/08-project/exports/export-YYYYMMDD.{csv|json|md}
6. Show summary and file path

### Critical Rules
- **Default format**: CSV if not specified
- **CSV must be Excel-compatible**: Proper quoting, comma-separated
- **JSON mirrors status.json**: Filtered subset of stories structure
- **Markdown generates table**: Paste-ready for docs/reports
- **Always show count**: "Exported N stories to <path>"
<!-- COMPACT_SUMMARY_END -->

---

## Arguments

| Argument | Required | Default | Description |
|----------|----------|---------|-------------|
| FORMAT | No | csv | Output format: `csv`, `json`, or `md` |
| EPIC | No | all | Filter by epic ID (e.g., EP-0041) |
| STATUS | No | all | Filter by status: ready, in_progress, blocked, done, completed |
| OWNER | No | all | Filter by owner (e.g., AG-API, AG-UI) |

Multiple filters can be combined. All are AND-joined (stories must match all filters).

---

## IMMEDIATE ACTIONS

### Step 1: Parse Arguments

```
FORMAT = argument or "csv" (default)
EPIC = optional epic filter
STATUS = optional status filter
OWNER = optional owner filter
```

Validate FORMAT is one of: csv, json, md. If invalid, show error and suggest valid values.

### Step 2: Read and Filter Data

Read `docs/09-agents/status.json` and filter stories:

```javascript
const data = JSON.parse(fs.readFileSync('docs/09-agents/status.json', 'utf8'));
let stories = Object.entries(data.stories).map(([id, s]) => ({ id, ...s }));

// Apply filters
if (EPIC) stories = stories.filter(s => s.epic === EPIC);
if (STATUS) stories = stories.filter(s => s.status === STATUS);
if (OWNER) stories = stories.filter(s => s.owner === OWNER);
```

If no stories match, inform user: "No stories match the given filters."

### Step 3: Generate Output

#### CSV Format

Columns: ID, Title, Epic, Status, Owner, Priority, Estimate

```csv
ID,Title,Epic,Status,Owner,Priority,Estimate
US-0380,"Add story:edit and epic:edit commands",EP-0041,done,AG-API,high,3h
US-0381,"Add status:undo command for story status rollback",EP-0041,done,AG-API,high,2h
```

Rules:
- First row is header
- Quote fields containing commas or quotes
- Escape quotes by doubling them
- Use UTF-8 encoding

#### JSON Format

```json
{
  "exported_at": "2026-03-03T12:00:00Z",
  "filters": { "epic": "EP-0041", "status": null, "owner": null },
  "count": 8,
  "stories": [
    {
      "id": "US-0380",
      "title": "Add story:edit and epic:edit commands",
      "epic": "EP-0041",
      "status": "done",
      "owner": "AG-API",
      "priority": "high",
      "estimate": "3h"
    }
  ]
}
```

#### Markdown Format

```markdown
# Story Export - 2026-03-03

**Filters**: Epic: EP-0041
**Count**: 8 stories

| ID | Title | Epic | Status | Owner | Priority | Estimate |
|----|-------|------|--------|-------|----------|----------|
| US-0380 | Add story:edit and epic:edit commands | EP-0041 | done | AG-API | high | 3h |
| US-0381 | Add status:undo command | EP-0041 | done | AG-API | high | 2h |
```

### Step 4: Save Output

Create output directory if needed:
```bash
mkdir -p docs/08-project/exports
```

Save to: `docs/08-project/exports/export-YYYYMMDD.{csv|json|md}`

If file already exists for today, append a counter: `export-YYYYMMDD-2.csv`

### Step 5: Show Summary

```
Exported 8 stories to docs/08-project/exports/export-20260303.csv

Filters applied:
  Epic: EP-0041
  Status: all
  Owner: all

Preview (first 3 rows):
  US-0380 | Add story:edit and epic:edit commands | done
  US-0381 | Add status:undo command | done
  US-0382 | Add export command | in_progress
```

Then offer next steps:

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "Export complete. What next?",
  "header": "Next steps",
  "multiSelect": false,
  "options": [
    {"label": "Open/view the exported file", "description": "Display full file contents"},
    {"label": "Export in another format", "description": "Re-export as json/md/csv"},
    {"label": "Done", "description": "Export saved successfully"}
  ]
}]</parameter>
</invoke>
```

---

## Example Usage

```bash
# Export all stories as CSV (default)
/agileflow:export

# Export specific epic as JSON
/agileflow:export FORMAT=json EPIC=EP-0041

# Export ready stories as Markdown
/agileflow:export FORMAT=md STATUS=ready

# Export specific owner's stories as CSV
/agileflow:export OWNER=AG-API STATUS=done

# Combine filters
/agileflow:export FORMAT=md EPIC=EP-0041 STATUS=ready OWNER=AG-API
```

---

## Rules

- **CSV Excel-compatible**: Proper quoting, commas, UTF-8
- **JSON well-formed**: Pretty-printed, includes metadata
- **Markdown paste-ready**: Standard table format
- **Always show preview**: Display first few rows after export
- **Always show path**: User needs to know where the file is
- **No destructive overwrites**: Counter suffix for same-day exports

---

## Related Commands

- `/agileflow:story:list` - Interactive story listing
- `/agileflow:epic:list` - Interactive epic listing
- `/agileflow:board` - Visual kanban board
- `/agileflow:sprint` - Sprint planning view
- `/agileflow:changelog` - Generate changelog
