---
description: Pick a session to switch to or resume
argument-hint: (no arguments)
compact_context:
  priority: high
  preserve_rules:
    - "ACTIVE COMMAND: /agileflow:session:resume - Switch between parallel sessions"
    - "Lists all registered sessions (active and inactive) with status"
    - "User selects which session to resume"
    - "Returns `cd` command to switch to selected session"
    - "Formats nickname/branch with activity status (Active now / inactive)"
    - "Marks current session with '(current)' label"
  state_fields:
    - current_session
    - all_sessions
    - user_selection
---

# /agileflow:session:resume

View all sessions and get the command to switch to one.

---

## Purpose

When you have multiple sessions and want to switch between them, this command:
- Lists all registered sessions (active and inactive)
- Shows which are currently active (have a running Claude process)
- Provides the `cd` command to switch to your chosen session

## IMMEDIATE ACTIONS

Upon invocation, execute these steps:

### Step 1: Get All Sessions

```bash
node .agileflow/scripts/session-manager.js list --json
```

Parse the JSON output to get session data.

### Step 2: Build AskUserQuestion Options

For each session, create an option:

```
AskUserQuestion:
  question: "Which session would you like to resume?"
  header: "Sessions"
  multiSelect: false
  options:
    - label: "Session 1: main (current)"
      description: "US-0042: User Auth API │ Active now │ /home/user/project"
    - label: "Session 2: \"auth\""
      description: "US-0038: Fix Login │ Active now │ ../project-auth"
    - label: "Create new session"
      description: "Start a fresh parallel workspace"
```

**Formatting rules:**
- Show nickname in quotes if present, otherwise show branch
- Mark active sessions with "Active now"
- Mark inactive sessions with time since last active
- Mark current session with "(current)"
- Include story ID if available
- Show relative path for non-main sessions

### Step 3: Handle User Selection

**If user selects a different session:**

First, update the active session context for boundary protection:

```bash
node .agileflow/scripts/session-manager.js switch {session_id}
```

Then display the `/add-dir` command to switch:

```
To switch to Session 2 "auth":

  /add-dir ../project-auth

Session info:
┌──────────┬──────────────────────────┐
│ Branch   │ session-2                │
│ Story    │ US-0038 (in-progress)    │
│ Path     │ ../project-auth          │
└──────────┴──────────────────────────┘
```

**If user selects current session:**

```
You're already in Session 1!
```

**If user selects "Create new session":**

```
Run /agileflow:session:new to create a new parallel workspace.
```

**WHY /add-dir instead of cd && claude:**
- Stays in the same terminal and conversation
- One short command to type
- Immediately enables file access to the session directory

## Related Commands

- `/agileflow:session:new` - Create new session
- `/agileflow:session:status` - Quick status view
- `/agileflow:session:end` - End current session

---

<!-- COMPACT_SUMMARY_START -->

## ⚠️ COMPACT SUMMARY - /agileflow:session:resume IS ACTIVE

**CRITICAL**: This command is the primary way to **switch between parallel sessions**. User selects, you display the `/add-dir` command.

---

### 🚨 RULE #1: ALWAYS USE AskUserQuestion

**NEVER just describe the sessions.** Build an AskUserQuestion with:
- One option per session
- Current session marked "(current)"
- Active sessions marked "Active now"
- Inactive sessions show "last active: {time}"
- "Create new session" option at bottom

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "Which session would you like to resume?",
  "header": "Sessions",
  "multiSelect": false,
  "options": [
    {"label": "Session 1: main (current)",
     "description": "US-0042: User Auth API │ Active now │ /home/user/project"},
    {"label": "Session 2: \"auth\"",
     "description": "US-0038: Fix Login │ Active now │ ../project-auth"},
    {"label": "Session 3: feature/payments",
     "description": "US-0051 │ Inactive (1 day ago) │ ../project-payments"},
    {"label": "Create new session",
     "description": "Start a fresh parallel workspace"}
  ]
}]</parameter>
</invoke>
```

---

### 🚨 RULE #2: HANDLE EACH SELECTION CASE

**If user selects current session:**
```
You're already in Session 1!
```

**If user selects different session:**

1. First, run switch command (enables boundary protection):
```bash
node .agileflow/scripts/session-manager.js switch {session_id}
```

2. Then show the /add-dir command:
```
To switch to Session 2 "auth":

  /add-dir ../project-auth

Session info:
┌──────────┬──────────────────────────┐
│ Branch   │ session-2                │
│ Story    │ US-0038 (in-progress)    │
│ Path     │ ../project-auth          │
└──────────┴──────────────────────────┘
```

**If user selects "Create new session":**
```
Run /agileflow:session:new to create a new parallel workspace.
```

**Use /add-dir instead of cd && claude** - stays in same terminal/conversation.

---

### 🚨 RULE #3: FORMATTING LABELS & DESCRIPTIONS

**Label format (session option):**
- Session with nickname: `Session {id}: "{nickname}"`
- Session with branch: `Session {id}: {branch}`
- Current session: append ` (current)`

**Description format:**
- Include story ID if available: `US-0042`
- Include status: `Active now` OR `Inactive (N days ago)`
- Include relative path: `../project-auth`
- Format: `{STORY_ID} │ {STATUS} │ {PATH}`

---

### 🚨 RULE #4: SESSION DATA STRUCTURE

Sessions from `session-manager.js list --json` contain:
```json
{
  "id": 1,
  "path": "/home/user/project",
  "branch": "main",
  "nickname": null,
  "status": "active",
  "is_current": true,
  "is_main": true,
  "created": "2025-12-20T10:00:00Z",
  "last_active": "2025-12-20T10:30:00Z"
}
```

Use these fields to build readable labels.

---

### KEY FILES TO REMEMBER

| File | Purpose |
|------|---------|
| `.agileflow/sessions/registry.json` | Master list of all sessions |
| `.agileflow/sessions/{id}.lock` | Lock file = session is active |
| `.agileflow/scripts/session-manager.js` | Script providing session data |

---

### WORKFLOW

1. **Get sessions** → `node .agileflow/scripts/session-manager.js list --json`
2. **Parse JSON** → Extract id, branch, nickname, status, path
3. **Build options** → Create readable labels with status
4. **Show AskUserQuestion** → Let user select
5. **Activate boundary** → `session-manager.js switch {selected_id}` (if different session)
6. **Handle selection** → Show `/add-dir` command or appropriate response

---

### ANTI-PATTERNS (DON'T DO THESE)

❌ Just list sessions without AskUserQuestion
❌ Format label as "session_1_main" (use readable format)
❌ Show path as absolute when relative is shorter
❌ Don't mark current session with "(current)"
❌ Don't show "Active now" status for active sessions

### DO THESE INSTEAD

✅ ALWAYS use AskUserQuestion with user options
✅ Format labels as "Session 1: main (current)"
✅ Show relative paths (../project-auth)
✅ Mark current session clearly
✅ Show activity status (Active now / Inactive Xd ago)

---

### REMEMBER AFTER COMPACTION

- `/agileflow:session:resume` IS ACTIVE
- ALWAYS use AskUserQuestion to let user select
- Format labels clearly: `Session {id}: {nickname/branch} {(current)}`
- Show status in description: `Active now` OR `Inactive (N days ago)`
- Handle each case: current / different / create new
- **Run `session-manager.js switch {id}` BEFORE showing /add-dir** (enables boundary protection)
- Show `/add-dir {path}` command when user selects different session (NOT cd && claude)

<!-- COMPACT_SUMMARY_END -->
