---
description: Interactive session cleanup with AI assessment
argument-hint: (no arguments)
compact_context:
  priority: high
  preserve_rules:
    - "ACTIVE COMMAND: /agileflow:session:cleanup - Review and clean up sessions"
    - "Walk through EACH session with issues one-by-one"
    - "Show file changes with AI assessment (SAFE/IMPORTANT)"
    - "Check merge eligibility with: node .agileflow/scripts/session-manager.js check-merge {id}"
    - "Merge options: canMerge (mergeable or hasConflicts), uncommittedInSession (cannot merge)"
    - "Use AskUserQuestion for EACH session with recommended action"
    - "If SAFE+mergeable: Delete(Rec) / Merge&Delete / Keep / Stop"
    - "If IMPORTANT+mergeable: Merge&Delete(Rec) / Keep / Delete anyway / Stop"
    - "If cannot merge: show warning, offer Switch to session option"
    - "Merge execution: session-manager.js integrate {id} --strategy=squash --deleteBranch=true --deleteWorktree=true"
    - "Track: deleted count, merged count, kept count, skipped count"
  state_fields:
    - health_report
    - current_session_index
    - total_sessions
    - deleted_count
    - merged_count
    - kept_count
---

# /agileflow:session:cleanup

Interactive session cleanup - review each session with health issues and decide what to do.

---

## Purpose

When you have forgotten sessions with uncommitted changes, stale entries, or orphaned worktrees, this command:
- Shows you what changed in each session
- Analyzes whether changes are important or trivial
- Checks if changes can be merged to main before deletion
- Provides AI recommendation for each session
- Lets you decide one-by-one what to clean up (including merge-and-delete option)

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

#### Step 3b2: Check Merge Eligibility

```bash
node .agileflow/scripts/session-manager.js check-merge {session_id}
```

Parse the JSON response and set flags:
- `canMerge`: true if `mergeable: true` OR `hasConflicts: true` (can attempt merge)
- `hasConflicts`: true if response contains `hasConflicts: true`
- `uncommittedInSession`: true if `reason === "uncommitted_changes"`
- `noChanges`: true if `reason === "no_changes"`
- `commitsAhead`: number of commits to merge (from response)

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

**Add merge status line based on flags from Step 3b2:**

If `canMerge` and NOT `hasConflicts`:
```
   ✓ Can be merged to main cleanly ({commitsAhead} commit(s))
```

If `hasConflicts`:
```
   ⚠️ Has merge conflicts (auto-resolve available)
```

If `uncommittedInSession`:
```
   ❌ Cannot merge - has uncommitted changes in session
```

If `noChanges`:
```
   ○ Nothing to merge - no committed changes different from main
```

#### Step 3d: Ask User with AskUserQuestion

Choose option set based on assessment (allTrivial) and merge eligibility:

---

**Option Set A: SAFE + Mergeable (allTrivial: true AND canMerge: true)**
```
AskUserQuestion:
  question: "Session {id} - What would you like to do?"
  header: "Cleanup"
  multiSelect: false
  options:
    - label: "Delete session (Recommended)"
      description: "Remove session and worktree - no unique work"
    - label: "Merge and delete"
      description: "Merge {commitsAhead} commit(s) to main, then delete session"
    - label: "Keep this session"
      description: "Leave it as-is"
    - label: "Stop cleanup"
      description: "Exit and show summary"
```

---

**Option Set B: IMPORTANT + Mergeable (allTrivial: false AND canMerge: true)**
```
AskUserQuestion:
  question: "Session {id} - What would you like to do?"
  header: "Cleanup"
  multiSelect: false
  options:
    - label: "Merge and delete (Recommended)"
      description: "Preserve {commitsAhead} commit(s) to main, then clean up session"
    - label: "Keep this session"
      description: "Leave session for continued work"
    - label: "Delete anyway"
      description: "Remove session and lose changes"
    - label: "Stop cleanup"
      description: "Exit and show summary"
```

---

**Option Set C: Cannot Merge - Uncommitted in Session (uncommittedInSession: true)**
```
⚠️ Session has uncommitted changes that prevent merging.
   Commit or discard changes first to enable merge option.

AskUserQuestion:
  question: "Session {id} cannot be merged. What would you like to do?"
  header: "Cleanup"
  multiSelect: false
  options:
    - label: "Switch to session to commit"
      description: "Open this session so you can commit changes"
    - label: "Keep this session"
      description: "Leave it as-is for later"
    - label: "Delete anyway"
      description: "Remove session and lose all changes"
    - label: "Stop cleanup"
      description: "Exit and show summary"
```

---

**Option Set D: SAFE + No Merge Needed (allTrivial: true AND noChanges: true)**
```
AskUserQuestion:
  question: "Session {id} - What would you like to do?"
  header: "Cleanup"
  multiSelect: false
  options:
    - label: "Delete session (Recommended)"
      description: "Remove session and worktree - nothing to preserve"
    - label: "Keep this session"
      description: "Leave it as-is"
    - label: "Stop cleanup"
      description: "Exit and show summary"
```

---

**Option Set E: Has Conflicts (hasConflicts: true)**
```
⚠️ Merge has conflicts with main branch.

AskUserQuestion:
  question: "Session {id} has merge conflicts. What would you like to do?"
  header: "Cleanup"
  multiSelect: false
  options:
    - label: "Auto-resolve and merge"
      description: "Attempt smart conflict resolution, then merge and delete"
    - label: "Keep for manual merge"
      description: "Leave session to resolve conflicts yourself"
    - label: "Delete anyway"
      description: "Remove session and lose changes"
    - label: "Stop cleanup"
      description: "Exit and show summary"
```

#### Step 3e: Execute User Choice

**If "Delete session" or "Delete anyway" chosen:**
```bash
node .agileflow/scripts/session-manager.js delete {session_id} --remove-worktree
```

Display: `✓ Session {id} deleted`
Increment deleted_count.

---

**If "Merge and delete" chosen:**

1. Run integrate with cleanup flags:
```bash
node .agileflow/scripts/session-manager.js integrate {session_id} --strategy=squash --deleteBranch=true --deleteWorktree=true
```

2. Parse the response to get merge result.

3. Display result:
```
✓ Session {id} merged to main and deleted
  Commits: {originalCount} → 1 (squashed)
  Branch: {branch} (deleted)
```

Increment merged_count.

---

**If "Auto-resolve and merge" chosen (for conflict cases):**

1. First run smart-merge to resolve conflicts:
```bash
node .agileflow/scripts/session-manager.js smart-merge {session_id} --strategy=squash
```

2. Check result - if conflicts remain, display error and keep session:
```
❌ Could not auto-resolve conflicts for session {id}
   Consider manual merge or delete.
```
Increment kept_count and continue to next session.

3. If smart-merge succeeds, run integrate:
```bash
node .agileflow/scripts/session-manager.js integrate {session_id} --strategy=squash --deleteBranch=true --deleteWorktree=true
```

4. Display result:
```
✓ Session {id} conflicts resolved, merged to main, and deleted
  Commits: {originalCount} → 1 (squashed)
  Branch: {branch} (deleted)
```

Increment merged_count.

---

**If "Switch to session to commit" chosen:**

1. Display instructions:
```
Switching to session {id}...

After committing your changes, run /agileflow:session:cleanup again
to continue cleanup with merge option available.
```

2. Switch to the session:
```bash
node .agileflow/scripts/session-manager.js switch {session_id}
```

3. Exit cleanup (do NOT continue to next session - user needs to work in session).

---

**If "Keep this session" or "Keep for manual merge" chosen:**
Display: `→ Session {id} kept`
Increment kept_count.

---

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

   ✓ Deleted:    {deleted_count} session(s)
   ✓ Merged:     {merged_count} session(s) → changes preserved in main
   → Kept:       {kept_count} session(s)
   ○ Skipped:    {skipped_count} item(s)

Run /agileflow:session:status to see remaining sessions.
```

Note: Only display "Merged" line if merged_count > 0.

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

### Merge Fails
If integrate command fails (e.g., unexpected error), display:
```
❌ Merge failed for session {id}: {error}
   Session preserved. Try manual merge with /agileflow:session:end
```
Keep the session and continue to next.

### check-merge Command Not Available
If the `check-merge` command is not available (older session-manager.js), fall back to original behavior without merge options. Set `canMerge: false` for all sessions.

### Switched to Session Mid-Cleanup
When user selects "Switch to session to commit", cleanup exits immediately. The summary shows partial progress. User can run `/agileflow:session:cleanup` again after committing.

---

## Related Commands

- `/agileflow:session:status` - View all sessions
- `/agileflow:session:end` - End current session with merge option
- `/agileflow:session:new` - Create new parallel session
