---
description: Initialize session harness with test verification
argument-hint: (no arguments)
compact_context:
  priority: high
  preserve_rules:
    - "ACTIVE COMMAND: /agileflow:session:init - Initialize session tracking"
    - "Creates `.agileflow/sessions/` directory and `registry.json` if missing"
    - "Registers current directory as active session with lock file"
    - "Runs automatically via SessionStart hook on session begin"
    - "Safe to run multiple times (idempotent operation)"
    - "If registry.json exists, validates schema before use"
  state_fields:
    - session_id
    - registry_status
    - active_session_count
---

# /agileflow:session:init

Initialize or verify the session management system.

---

## Purpose

Sets up session tracking infrastructure:
- Creates `.agileflow/sessions/` directory
- Initializes `registry.json` if missing
- Registers the current session
- Displays session status

This command is typically called automatically by the SessionStart hook.

## IMMEDIATE ACTIONS

### Step 1: Ensure Session Infrastructure

```bash
node .agileflow/scripts/session-manager.js register
```

This will:
- Create `.agileflow/sessions/` if missing
- Create `registry.json` with schema if missing
- Register current directory as a session
- Create lock file with current PID

### Step 2: Check for Other Active Sessions

```bash
node .agileflow/scripts/session-manager.js count
```

If `count > 0`, there are other active sessions.

### Step 3: Display Status

**If no other sessions:**
```
✓ Session initialized

  Session ID: 1
  Path: /home/user/project
  Branch: main

No other active sessions detected.
```

**If other sessions active:**
```
✓ Session initialized

  Session ID: 1 (current)
  Path: /home/user/project
  Branch: main

⚠️ {count} other session(s) active in this repo.
   Run /agileflow:session:status to see all sessions.
   Run /agileflow:session:new to create isolated workspace.
```

## Already Initialized Case

If session is already registered:
```
✓ Session already active

  Session ID: 1
  Path: /home/user/project
  Branch: main
```

## Related Commands

- `/agileflow:session:status` - View all sessions
- `/agileflow:session:new` - Create parallel session

---

<!-- COMPACT_SUMMARY_START -->

## ⚠️ COMPACT SUMMARY - /agileflow:session:init IS ACTIVE

**CRITICAL**: This command sets up session tracking infrastructure. It MUST run before any session management features work.

---

### 🚨 RULE #1: IDEMPOTENT OPERATION

This command is **safe to run multiple times**. It:
- Creates `.agileflow/sessions/` if missing
- Creates `registry.json` with schema if missing
- Registers current directory if not already registered
- Updates lock file if already registered

**No data is lost, no conflicts occur on repeated runs.**

---

### 🚨 RULE #2: AUTOMATIC INVOCATION

This command runs automatically via **SessionStart hook**. You typically don't call it manually unless:
- Debugging session tracking
- Setting up manually without hook
- Recovering from corrupted session state

---

### 🚨 RULE #3: REGISTRY SCHEMA

The generated `registry.json` has this structure:
```json
{
  "version": "1.0",
  "sessions": [
    {
      "id": 1,
      "path": "/home/user/project",
      "branch": "main",
      "created": "2025-12-20T10:00:00Z",
      "last_active": "2025-12-20T10:30:00Z",
      "is_main": true,
      "nickname": null,
      "status": "active"
    }
  ]
}
```

---

### 🚨 RULE #4: LOCK FILE MANAGEMENT

Session tracking uses lock files at `.agileflow/sessions/{id}.lock`:
- Lock file = session is **active** (has running Claude process)
- No lock file = session is **inactive** (can be resumed)
- Lock files are created on init, removed on `/agileflow:session:end`

---

### KEY FILES TO REMEMBER

| File | Purpose |
|------|---------|
| `.agileflow/sessions/` | Session directory (created by init) |
| `.agileflow/sessions/registry.json` | Master registry of all sessions |
| `.agileflow/sessions/{id}.lock` | Lock file marking session active |
| `.agileflow/scripts/session-manager.js` | Script that does the work |

---

### TYPICAL WORKFLOW

1. **First time in project**:
   - SessionStart hook runs → `/agileflow:session:init` called automatically
   - Creates infrastructure, registers main session
   - You never see this happening

2. **Debugging session state**:
   - Run `/agileflow:session:init` manually
   - Check `.agileflow/sessions/registry.json` for current state
   - Use `/agileflow:session:status` to view readable output

3. **Manual setup**:
   - If hook is disabled, run this to initialize
   - Then use other session commands

---

### REMEMBER AFTER COMPACTION

- `/agileflow:session:init` IS ACTIVE
- Creates `.agileflow/sessions/` directory and registry
- Runs automatically via SessionStart hook
- Safe to run multiple times (idempotent)
- Lock files track active vs inactive sessions
- Check `registry.json` for current session state

<!-- COMPACT_SUMMARY_END -->
