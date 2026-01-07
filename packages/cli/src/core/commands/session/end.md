---
description: Cleanly end session and record summary
argument-hint: (no arguments)
compact_context:
  priority: high
  preserve_rules:
    - "ACTIVE COMMAND: /agileflow:session:end - Terminate current session"
    - "Gets current session, prompts for end/delete/cancel options"
    - "Only deletes worktree if not main session (is_main: false)"
    - "Updates registry to mark session inactive, removes lock file"
    - "Main session can only be marked inactive, not deleted"
    - "Use AskUserQuestion to let user choose option"
  state_fields:
    - current_session
    - is_main_session
    - user_choice
---

# /agileflow:session:end

End the current session and optionally clean up the worktree.

---

## Purpose

When you're done with a session, this command:
- Removes the session's lock file (marks it inactive)
- Optionally removes the git worktree directory
- Updates the registry with last active timestamp

## IMMEDIATE ACTIONS

### Step 1: Get Current Session

```bash
node .agileflow/scripts/session-manager.js status
```

If no current session is registered, display message and exit.

### Step 2: Present Options with AskUserQuestion

```
AskUserQuestion:
  question: "End Session {id}?"
  header: "End session"
  multiSelect: false
  options:
    - label: "Yes, end session"
      description: "Mark session inactive (keep worktree for later)"
    - label: "End and delete worktree"
      description: "Remove session and its directory completely"
    - label: "Cancel"
      description: "Keep session active"
```

Note: Don't show "delete worktree" option for main session (is_main: true).

### Step 3a: If "End session" Selected

```bash
node .agileflow/scripts/session-manager.js unregister {session_id}
```

Display:
```
✓ Session {id} ended

  Branch: {branch}
  Story:  {story_id} (status unchanged)
  Worktree kept at: {path}

To resume later: cd {path} && claude
```

### Step 3b: If "End and delete worktree" Selected

```bash
node .agileflow/scripts/session-manager.js delete {session_id} --remove-worktree
```

Display:
```
✓ Session {id} ended and removed

  Branch: {branch}
  Worktree removed: {path}

💡 The branch still exists. To delete it:
   git branch -d {branch}
```

### Step 3c: If "Cancel" Selected

```
Session remains active.
```

## Main Session Warning

If current session is the main project (is_main: true):

```
⚠️ This is the main project session.

You can only end this session (mark inactive), not delete the directory.
The main project is not a worktree and cannot be removed.
```

## Related Commands

- `/agileflow:session:new` - Create new session
- `/agileflow:session:resume` - Switch sessions
- `/agileflow:session:status` - View all sessions

---

<!-- COMPACT_SUMMARY_START -->

## ⚠️ COMPACT SUMMARY - /agileflow:session:end IS ACTIVE

**CRITICAL**: This command terminates the current session. It MUST handle three cases: main session / non-main session / cancel.

---

### 🚨 RULE #1: CHECK IF MAIN SESSION FIRST

Before doing anything, determine if current session is main:
```bash
node .agileflow/scripts/session-manager.js status
# If is_main: true → can only mark inactive
# If is_main: false → can delete worktree
```

---

### 🚨 RULE #2: USE AskUserQuestion FOR OPTIONS

**For MAIN session** (only 2 options):
```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "End Session 1 (main)?",
  "header": "End session",
  "multiSelect": false,
  "options": [
    {"label": "Yes, end session",
     "description": "Mark session inactive (keep project for later)"},
    {"label": "Cancel",
     "description": "Keep session active"}
  ]
}]</parameter>
</invoke>
```

**For NON-MAIN session** (3 options):
```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "End Session 2 \"auth\"?",
  "header": "End session",
  "multiSelect": false,
  "options": [
    {"label": "Yes, end session",
     "description": "Mark session inactive (keep worktree for later)"},
    {"label": "End and delete worktree",
     "description": "Remove session and its directory completely"},
    {"label": "Cancel",
     "description": "Keep session active"}
  ]
}]</parameter>
</invoke>
```

---

### 🚨 RULE #3: HANDLE EACH USER CHOICE

**If "Yes, end session" selected:**
```bash
node .agileflow/scripts/session-manager.js unregister {session_id}
```
Display:
```
✓ Session {id} ended

  Branch: {branch}
  Story:  {story_id} (status unchanged)
  Worktree kept at: {path}

To resume later: cd {path} && claude
```

**If "End and delete worktree" selected** (non-main only):
```bash
node .agileflow/scripts/session-manager.js delete {session_id} --remove-worktree
```
Display:
```
✓ Session {id} ended and removed

  Branch: {branch}
  Worktree removed: {path}

💡 The branch still exists. To delete it:
   git branch -d {branch}
```

**If "Cancel" selected:**
```
Session remains active.
```

---

### 🚨 RULE #4: MAIN SESSION WARNING

If session is main (is_main: true):
```
⚠️ This is the main project session.

You can only end this session (mark inactive), not delete the directory.
The main project is not a worktree and cannot be removed.
```

Then show the 2-option prompt (end or cancel).

---

### 🚨 RULE #5: BRANCH MANAGEMENT NOTE

When deleting worktree, remind user the branch persists:
```
💡 The branch still exists. To delete it:
   git branch -d {branch}
```

This is important because users might want to keep branch history.

---

### KEY FILES TO REMEMBER

| File | Purpose |
|------|---------|
| `.agileflow/sessions/registry.json` | Session registry |
| `.agileflow/sessions/{id}.lock` | Removed when session ends |
| `.agileflow/scripts/session-manager.js` | Unregister and delete |

---

### WORKFLOW

1. **Get current session** → `session-manager.js status`
2. **Check is_main** → Determine option set
3. **If main** → Show warning + 2 options
4. **If not main** → Show no warning + 3 options
5. **User selects** → Handle choice
6. **Execute** → Call manager script
7. **Display result** → Show success/failure

---

### SESSION DATA STRUCTURE

From `session-manager.js status`:
```json
{
  "id": 1,
  "path": "/home/user/project",
  "branch": "main",
  "status": "active",
  "is_main": true,
  "is_current": true,
  "created": "2025-12-20T10:00:00Z",
  "last_active": "2025-12-20T10:30:00Z"
}
```

---

### ANTI-PATTERNS (DON'T DO THESE)

❌ Show delete option for main session
❌ Unregister without checking is_main
❌ Don't warn about main session status
❌ Don't mention branch deletion after worktree removal
❌ Use different prompts for main vs non-main

### DO THESE INSTEAD

✅ Always check is_main first
✅ Show appropriate options (2 for main, 3 for non-main)
✅ Warn if main session
✅ Remind about branch deletion
✅ Use consistent prompt format

---

### REMEMBER AFTER COMPACTION

- `/agileflow:session:end` IS ACTIVE
- ALWAYS check is_main before prompting
- Main: 2 options (end / cancel)
- Non-main: 3 options (end / delete / cancel)
- Warn if main session
- Remind about branch deletion after worktree removal
- Use AskUserQuestion for all options

<!-- COMPACT_SUMMARY_END -->
