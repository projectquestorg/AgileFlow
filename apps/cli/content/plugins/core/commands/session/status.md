---
description: View current session state and activity
argument-hint: "[--kanban]"
compact_context:
  priority: medium
  preserve_rules:
    - "ACTIVE COMMAND: /agileflow:session:status - Display all sessions in table"
    - "Does NOT prompt for action (read-only display)"
    - "Shows current session, then table of other sessions"
    - "Marks active sessions with ● bullet, inactive with ○"
    - "Returns session count and active count"
    - "--kanban flag shows Kanban-style board with phases (TO DO, CODING, REVIEW, MERGED)"
  state_fields:
    - current_session
    - all_sessions
    - active_count
    - total_count
---

# /agileflow:session:status

Quick view of all sessions and their status.

---

## Purpose

Display a compact overview of all registered sessions without prompting for action.

---

## STEP 0: Gather Context

```bash
node .agileflow/scripts/obtain-context.js session:status
```

---

## Arguments

| Argument   | Required | Description                                          |
| ---------- | -------- | ---------------------------------------------------- |
| `--kanban` | No       | Show Kanban-style board with phases instead of table |

## IMMEDIATE ACTIONS

### Step 1: Get Session Data

**Standard view:**

```bash
node .agileflow/scripts/session-manager.js list --json
```

**Kanban view (if --kanban flag):**

```bash
node .agileflow/scripts/session-manager.js list --kanban
```

### Step 2: Display Formatted Output

**Standard Table View:**

```
📊 Session Status

Current: Session 1 (main)
         Branch: main │ Story: US-0042 │ Active

Other Sessions:
┌─────┬──────────────────┬─────────────┬────────────┐
│  #  │ Name/Branch      │ Story       │ Status     │
├─────┼──────────────────┼─────────────┼────────────┤
│  2  │ "auth"           │ US-0038     │ ● Active   │
│  3  │ feature/payments │ -           │ ○ Inactive │
└─────┴──────────────────┴─────────────┴────────────┘

Total: 3 sessions │ 2 active
```

**Kanban Board View (--kanban):**

```
Sessions (Kanban View):

TO DO           CODING          REVIEW          MERGED
┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│              │  │[2] auth      │  │[3] payments  │  │[1] main      │
│              │  │US-0038       │  │US-0042       │  │-             │
└──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘

To Do: 0 │ Coding: 1 │ Review: 1 │ Merged: 1
```

**Phase Detection Logic:**

- **TO DO**: No commits since branch creation
- **CODING**: Has commits, still has uncommitted changes
- **REVIEW**: Has commits, no uncommitted changes (ready to merge)
- **MERGED**: Main branch or merged sessions

### Step 3: Show Quick Actions

```
💡 Quick actions:
   /agileflow:session:new    - Create parallel session
   /agileflow:session:resume - Switch to another session
   /agileflow:session:end    - End current session
```

## No Sessions Case

```
📊 Session Status

No sessions registered yet. You're in the main project directory.
Run /agileflow:session:new to create a parallel workspace.
```

## Related Commands

- `/agileflow:session:new` - Create new session
- `/agileflow:session:resume` - Switch sessions
- `/agileflow:session:end` - End current session

---

<!-- COMPACT_SUMMARY_START -->

## ⚠️ COMPACT SUMMARY - /agileflow:session:status IS ACTIVE

**CRITICAL**: This command displays read-only status. It NEVER prompts for action - just shows information.

---

### 🚨 RULE #1: READ-ONLY DISPLAY (NO USER PROMPTS)

**NEVER use AskUserQuestion or present options.** This command is informational only.

| Command                     | Has Prompts? | Use Case        |
| --------------------------- | ------------ | --------------- |
| `/agileflow:session:status` | ❌ No        | Quick info view |
| `/agileflow:session:resume` | ✅ Yes       | Switch sessions |
| `/agileflow:session:new`    | ✅ Yes       | Create session  |
| `/agileflow:session:end`    | ✅ Yes       | End session     |

---

### 🚨 RULE #2: DISPLAY FORMAT

**Structure:**

1. Header with emoji: `📊 Session Status`
2. Current session info (highlighted)
3. Table of other sessions
4. Summary line: `Total: X sessions │ Y active`
5. Quick actions (optional)

**Example:**

```
📊 Session Status

Current: Session 1 (main)
         Branch: main │ Story: US-0042 │ Active

Other Sessions:
┌─────┬──────────────────┬─────────────┬────────────┐
│  #  │ Name/Branch      │ Story       │ Status     │
├─────┼──────────────────┼─────────────┼────────────┤
│  2  │ "auth"           │ US-0038     │ ● Active   │
│  3  │ feature/payments │ -           │ ○ Inactive │
└─────┴──────────────────┴─────────────┴────────────┘

Total: 3 sessions │ 2 active
```

---

### 🚨 RULE #3: STATUS BULLETS

- **● Active** - Session has lock file (Claude process running)
- **○ Inactive** - No lock file (can be resumed)

---

### 🚨 RULE #4: SHOW QUICK ACTIONS (OPTIONAL)

After the table, show optional quick actions info:

```
💡 Quick actions:
   /agileflow:session:new    - Create parallel session
   /agileflow:session:resume - Switch to another session
   /agileflow:session:end    - End current session
```

---

### 🚨 RULE #5: HANDLE EDGE CASES

**If no sessions exist:**

```
📊 Session Status

No sessions registered yet. You're in the main project directory.
Run /agileflow:session:new to create a parallel workspace.
```

**If only current session:**

```
📊 Session Status

Current: Session 1 (main)
         Branch: main │ Active

This is your only session. Use /agileflow:session:new to create more.
```

---

### FORMATTING RULES

| Element           | Format                 | Example            |
| ----------------- | ---------------------- | ------------------ |
| Session name      | Branch or nickname     | `main` or `"auth"` |
| Story ID          | US-#### or dash        | `US-0042` or `-`   |
| Status            | ● Active or ○ Inactive | `● Active`         |
| Session reference | Session {id}           | `Session 1`        |

---

### KEY FILES TO REMEMBER

| File                                    | Purpose                        |
| --------------------------------------- | ------------------------------ |
| `.agileflow/sessions/registry.json`     | Master list of sessions        |
| `.agileflow/sessions/{id}.lock`         | Lock file marks session active |
| `.agileflow/scripts/session-manager.js` | Data source                    |

---

### WORKFLOW

1. **Get sessions** → `node .agileflow/scripts/session-manager.js list --json`
2. **Parse JSON** → Extract sessions, identify current
3. **Build display** → Format header, current session, table
4. **Show summary** → Total and active counts
5. **Optionally show** → Quick actions reference

---

### ANTI-PATTERNS (DON'T DO THESE)

❌ Use AskUserQuestion to prompt for action
❌ Show "Resume Session 2?" or similar prompts
❌ Use table without proper formatting
❌ Show path in table (too much info)
❌ Skip summary line showing counts

### DO THESE INSTEAD

✅ Display as read-only information
✅ Use ● and ○ bullets for status
✅ Format table with proper borders
✅ Show summary with counts
✅ Optionally show quick actions for reference

---

### REMEMBER AFTER COMPACTION

- `/agileflow:session:status` IS ACTIVE
- NEVER prompt for action (read-only display)
- Format: header + current session + table + summary
- Use ● for active, ○ for inactive
- Show session counts in summary
- Optionally show quick actions reference

<!-- COMPACT_SUMMARY_END -->
