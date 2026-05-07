---
description: View past session history and metrics
argument-hint: "[DAYS=7|30|90|all]"
compact_context:
  priority: medium
  preserve_rules:
    - "ACTIVE COMMAND: /agileflow:session:history - Show sessions filtered by age"
    - "Accepts DAYS argument: 7, 30, 90, or all (default: 30)"
    - "Filters sessions by created timestamp"
    - "Shows table with creation date, branch, story, status"
    - "Read-only display (no prompts)"
    - "Shows summary: total sessions, active count, inactive count"
  state_fields:
    - timeframe_days
    - filtered_sessions
    - active_count
    - inactive_count
---

# /agileflow:session:history

View historical session data and metrics.

---

## Purpose

Show all sessions (active and inactive) with creation dates, last activity, and work done.

---

## STEP 0: Gather Context

```bash
node .agileflow/scripts/obtain-context.js session:history
```

---

## Arguments

| Argument | Default | Description                                  |
| -------- | ------- | -------------------------------------------- |
| DAYS     | 30      | Filter sessions by age (7, 30, 90, or "all") |

## IMMEDIATE ACTIONS

### Step 1: Get All Sessions

```bash
node .agileflow/scripts/session-manager.js list --json
```

### Step 2: Filter by Timeframe

Parse the DAYS argument and filter sessions by their `created` timestamp.

### Step 3: Display History

```
📜 Session History (Last 30 days)

┌─────┬────────────┬──────────────────┬─────────────┬────────────┐
│  #  │ Created    │ Name/Branch      │ Story       │ Status     │
├─────┼────────────┼──────────────────┼─────────────┼────────────┤
│  1  │ Dec 20     │ main             │ -           │ ● Active   │
│  2  │ Dec 22     │ "auth"           │ US-0042     │ ● Active   │
│  3  │ Dec 23     │ feature/payments │ US-0051     │ ○ Inactive │
│  4  │ Dec 25     │ "bugfix"         │ US-0038     │ ○ Inactive │
└─────┴────────────┴──────────────────┴─────────────┴────────────┘

Summary: 4 sessions │ 2 active │ 2 inactive
```

### Step 4: Show Tips

```
💡 Tips:
   • /agileflow:session:new to create a new session
   • /agileflow:session:delete {id} to remove old sessions
   • Inactive sessions can be resumed with /agileflow:session:resume
```

## No History Case

```
📜 Session History

No sessions found in the last {DAYS} days.

Try /agileflow:session:history DAYS=all to see all sessions.
```

## Related Commands

- `/agileflow:session:status` - Current status
- `/agileflow:session:resume` - Switch sessions

---

<!-- COMPACT_SUMMARY_START -->

## ⚠️ COMPACT SUMMARY - /agileflow:session:history IS ACTIVE

**CRITICAL**: This command shows historical session data. It NEVER prompts for action - read-only display only.

---

### 🚨 RULE #1: PARSE DAYS ARGUMENT

Valid values: `7`, `30`, `90`, `all`

```
/agileflow:session:history DAYS=7    → Last 7 days
/agileflow:session:history DAYS=30   → Last 30 days (default)
/agileflow:session:history DAYS=90   → Last 90 days
/agileflow:session:history DAYS=all  → All sessions
/agileflow:session:history           → Default to 30 days
```

---

### 🚨 RULE #2: FILTER BY CREATED TIMESTAMP

After getting all sessions, filter by their `created` timestamp:

```javascript
const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
filtered = sessions.filter((s) => new Date(s.created) >= cutoffDate);
```

For `DAYS=all`, include all sessions.

---

### 🚨 RULE #3: DISPLAY FORMAT

**Structure:**

1. Header with emoji: `📜 Session History (Last {DAYS} days)`
2. Table with columns: #, Created, Name/Branch, Story, Status
3. Summary: `Summary: X sessions │ Y active │ Z inactive`
4. Tips (optional)

**Example:**

```
📜 Session History (Last 30 days)

┌─────┬────────────┬──────────────────┬─────────────┬────────────┐
│  #  │ Created    │ Name/Branch      │ Story       │ Status     │
├─────┼────────────┼──────────────────┼─────────────┼────────────┤
│  1  │ Dec 20     │ main             │ -           │ ● Active   │
│  2  │ Dec 22     │ "auth"           │ US-0042     │ ● Active   │
│  3  │ Dec 23     │ feature/payments │ US-0051     │ ○ Inactive │
│  4  │ Dec 25     │ "bugfix"         │ US-0038     │ ○ Inactive │
└─────┴────────────┴──────────────────┴─────────────┴────────────┘

Summary: 4 sessions │ 2 active │ 2 inactive
```

---

### 🚨 RULE #4: DATE FORMATTING

Show dates in compact form:

- Format: `Dec 20` (month + day)
- No year needed (assumed current year or implied by context)
- Makes table compact

---

### 🚨 RULE #5: READ-ONLY DISPLAY (NO PROMPTS)

**NEVER use AskUserQuestion.** This command is informational only.

For user actions, show tips:

```
💡 Tips:
   • /agileflow:session:new to create a new session
   • /agileflow:session:delete {id} to remove old sessions
   • Inactive sessions can be resumed with /agileflow:session:resume
```

---

### 🚨 RULE #6: HANDLE EMPTY RESULTS

If no sessions in timeframe:

```
📜 Session History

No sessions found in the last {DAYS} days.

Try /agileflow:session:history DAYS=all to see all sessions.
```

---

### FORMATTING RULES

| Element      | Format                 | Example                              |
| ------------ | ---------------------- | ------------------------------------ |
| Date         | Month + day            | `Dec 20`                             |
| Session name | Nickname or branch     | `"auth"` or `feature/payments`       |
| Story        | US-#### or dash        | `US-0042` or `-`                     |
| Status       | ● Active or ○ Inactive | `● Active`                           |
| Summary      | Count format           | `4 sessions │ 2 active │ 2 inactive` |

---

### KEY FILES TO REMEMBER

| File                                    | Purpose                              |
| --------------------------------------- | ------------------------------------ |
| `.agileflow/sessions/registry.json`     | All sessions with created timestamps |
| `.agileflow/scripts/session-manager.js` | Data source via list --json          |

---

### WORKFLOW

1. **Parse DAYS argument** → Default to 30 if not provided
2. **Get all sessions** → `session-manager.js list --json`
3. **Filter by date** → Compare created timestamp to cutoff
4. **Count active/inactive** → Check status field
5. **Build table** → Format with proper columns
6. **Show summary** → Total and active counts
7. **Optionally show** → Tips for actions

---

### SESSION DATA STRUCTURE

From `session-manager.js list --json`:

```json
{
  "id": 1,
  "branch": "main",
  "nickname": null,
  "status": "active",
  "created": "2025-12-20T10:00:00Z",
  "last_active": "2025-12-20T10:30:00Z"
}
```

Use `created` for filtering.

---

### ARGUMENT VALIDATION

```
DAYS=7    ✅ Valid
DAYS=30   ✅ Valid
DAYS=90   ✅ Valid
DAYS=all  ✅ Valid
DAYS=14   ❌ Invalid (suggest 7, 30, 90, or all)
DAYS=xyz  ❌ Invalid (suggest 7, 30, 90, or all)
(no arg)  ✅ Valid (default to 30)
```

---

### ANTI-PATTERNS (DON'T DO THESE)

❌ Use AskUserQuestion to prompt for action
❌ Show "Delete old sessions?" or similar prompts
❌ Accept arbitrary DAYS values (only 7, 30, 90, all)
❌ Show full ISO timestamp (use compact date)
❌ Show absolute paths (too much info)
❌ Forget summary line with counts

### DO THESE INSTEAD

✅ Display as read-only information
✅ Use ● and ○ bullets for status
✅ Accept only: 7, 30, 90, all
✅ Format dates compactly: Dec 20
✅ Show summary with active/inactive counts
✅ Optionally show tips for related commands

---

### REMEMBER AFTER COMPACTION

- `/agileflow:session:history` IS ACTIVE
- Accepts DAYS: 7, 30, 90, all (default: 30)
- Filter by created timestamp
- Format: header + table + summary
- Use ● for active, ○ for inactive
- NEVER prompt for action (read-only)
- Show date as "Dec 20" (compact format)
- Optionally show tips

<!-- COMPACT_SUMMARY_END -->
