---
description: Interactive session cleanup with AI assessment
argument-hint: (no arguments)
compact_context:
  priority: high
  preserve_rules:
    - "ACTIVE COMMAND: /agileflow:session:cleanup - Review and clean up sessions"
    - "Walk through EACH session with issues one-by-one"
    - "Show file changes with AI assessment (SAFE/IMPORTANT)"
    - "Use AskUserQuestion for EACH session with recommended action"
    - "Recommended action based on allTrivial flag from health --detailed"
    - "Track: deleted count, kept count, skipped count"
  state_fields:
    - health_report
    - current_session_index
    - total_sessions
    - deleted_count
    - kept_count
---

# /agileflow:session:cleanup

Interactive session cleanup - review each session with health issues and decide what to do.

---

## Purpose

When you have forgotten sessions with uncommitted changes, stale entries, or orphaned worktrees, this command:
- Shows you what changed in each session
- Analyzes whether changes are important or trivial
- Provides AI recommendation for each session
- Lets you decide one-by-one what to clean up

---

## IMMEDIATE ACTIONS

### Step 1: Get Detailed Health Report

```bash
node .agileflow/scripts/session-manager.js health --detailed
```

Parse the JSON output and count total issues:
- `uncommitted.length` - Sessions with uncommitted changes
- `stale.length` - Sessions inactive for 7+ days
- `orphanedRegistry.length` - Registry entries with missing paths
- `orphanedWorktrees.length` - Worktrees not in registry

If total is 0, display:
```
✅ All sessions healthy! Nothing to clean up.
```
And exit.

### Step 2: Display Overview

```
📋 Session Health Check
=======================

Found {total_issues} issue(s) across {total_sessions} session(s).
Let's go through each one.
```

### Step 3: Process Each Session with Uncommitted Changes

For each session in `uncommitted` array:

#### Step 3a: Display Session Header

```
─────────────────────────────────────────────────────────────
Session {id} "{nickname}" ({current}/{total})
─────────────────────────────────────────────────────────────
```

#### Step 3b: Display Files Changed

```
📝 {changeCount} uncommitted file(s):
```

For each file in `fileDetails`:
- `M` status: `   M {file}` and if `trivial: true` add `(~{diffLines} lines - trivial)`
- `??` status: `   ?? {file}` and if `existsInMain: true` add `(exists in main)`
- Other: `   {status} {file}`

#### Step 3c: Display AI Assessment

If `allTrivial` is true:
```
🤖 Assessment: SAFE TO DELETE
   No unique work - all changes are trivial or already in main.
```

If `allTrivial` is false:
```
🤖 Assessment: IMPORTANT - KEEP
   This session has unique changes that may be valuable.
```

#### Step 3d: Ask User with AskUserQuestion

**If SAFE (allTrivial: true):**
```
AskUserQuestion:
  question: "Session {id} - What would you like to do?"
  header: "Cleanup"
  multiSelect: false
  options:
    - label: "Delete session (Recommended)"
      description: "Remove session and worktree - no unique work"
    - label: "Keep this session"
      description: "Leave it as-is"
    - label: "Stop cleanup"
      description: "Exit and show summary"
```

**If IMPORTANT (allTrivial: false):**
```
AskUserQuestion:
  question: "Session {id} - What would you like to do?"
  header: "Cleanup"
  multiSelect: false
  options:
    - label: "Keep this session (Recommended)"
      description: "Preserve unique work"
    - label: "Delete anyway"
      description: "Remove session and lose changes"
    - label: "Stop cleanup"
      description: "Exit and show summary"
```

#### Step 3e: Execute User Choice

**If "Delete" chosen:**
```bash
node .agileflow/scripts/session-manager.js delete {session_id} --remove-worktree
```

Display: `✓ Session {id} deleted`
Increment deleted_count.

**If "Keep" chosen:**
Display: `→ Session {id} kept`
Increment kept_count.

**If "Stop cleanup" chosen:**
Go to Step 6 (Final Summary).

### Step 4: Process Orphaned Registry Entries

For each entry in `orphanedRegistry`:

```
─────────────────────────────────────────────────────────────
Orphaned Registry: Session {id} ({current}/{total})
─────────────────────────────────────────────────────────────

🗑️ Registry entry exists but path is missing:
   Path: {path}
   Branch: {branch}

AskUserQuestion:
  question: "Remove orphaned registry entry {id}?"
  header: "Cleanup"
  multiSelect: false
  options:
    - label: "Remove from registry (Recommended)"
      description: "Clean up stale entry"
    - label: "Skip"
      description: "Leave in registry"
    - label: "Stop cleanup"
      description: "Exit and show summary"
```

**If "Remove" chosen:**
Remove the entry from `.agileflow/sessions/registry.json`:
```bash
node .agileflow/scripts/session-manager.js delete {session_id}
```

### Step 5: Process Orphaned Worktrees

For each entry in `orphanedWorktrees`:

```
─────────────────────────────────────────────────────────────
Orphaned Worktree ({current}/{total})
─────────────────────────────────────────────────────────────

🗑️ Git worktree exists but not in registry:
   Path: {path}

AskUserQuestion:
  question: "Remove orphaned worktree?"
  header: "Cleanup"
  multiSelect: false
  options:
    - label: "Remove worktree (Recommended)"
      description: "Delete directory and prune git"
    - label: "Skip"
      description: "Leave worktree"
    - label: "Stop cleanup"
      description: "Exit and show summary"
```

**If "Remove" chosen:**
```bash
git worktree remove --force "{path}"
```

### Step 6: Final Summary

```
═══════════════════════════════════════════════════════════════
Session Cleanup Complete
═══════════════════════════════════════════════════════════════

   ✓ Deleted: {deleted_count} session(s)
   → Kept:    {kept_count} session(s)
   ○ Skipped: {skipped_count} item(s)

Run /agileflow:session:status to see remaining sessions.
```

---

## Edge Cases

### No Issues Found
```
✅ All sessions healthy! Nothing to clean up.
```

### User Stops Early
Show partial summary with what was processed.

### Main Session Protection
The health check already excludes main session, so it won't appear in cleanup list.

---

## Related Commands

- `/agileflow:session:status` - View all sessions
- `/agileflow:session:end` - End current session with merge option
- `/agileflow:session:new` - Create new parallel session
