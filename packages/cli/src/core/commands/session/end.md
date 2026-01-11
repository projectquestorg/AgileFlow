---
description: Cleanly end session with optional merge to main
argument-hint: (no arguments)
compact_context:
  priority: high
  preserve_rules:
    - "ACTIVE COMMAND: /agileflow:session:end - Terminate current session"
    - "For NON-MAIN sessions: 4 options (merge/end/delete/cancel)"
    - "For MAIN sessions: 2 options (end/cancel)"
    - "Merge flow: check uncommitted → preview → check conflicts → strategy → confirm → execute"
    - "Main session can only be marked inactive, not deleted or merged"
    - "Use AskUserQuestion for all user choices"
  state_fields:
    - current_session
    - is_main_session
    - user_choice
    - merge_strategy
---

# /agileflow:session:end

End the current session and optionally merge your work back to main.

---

## Purpose

When you're done with a session, this command:
- **Merges your changes** to main (recommended for non-main sessions)
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

**For MAIN session** (2 options - cannot merge main into itself):

```
AskUserQuestion:
  question: "End Session 1 (main)?"
  header: "End session"
  multiSelect: false
  options:
    - label: "Yes, end session"
      description: "Mark session inactive (keep project for later)"
    - label: "Cancel"
      description: "Keep session active"
```

**For NON-MAIN session** (4 options):

```
AskUserQuestion:
  question: "End Session {id}?"
  header: "End session"
  multiSelect: false
  options:
    - label: "Complete & merge to main (Recommended)"
      description: "Merge your changes to main and clean up"
    - label: "Yes, end session"
      description: "Mark session inactive (keep worktree for later)"
    - label: "End and delete worktree"
      description: "Remove session and its directory completely"
    - label: "Cancel"
      description: "Keep session active"
```

### Step 3a: If "Complete & merge to main" Selected

Follow the **MERGE FLOW** below.

### Step 3b: If "End session" Selected

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

### Step 3c: If "End and delete worktree" Selected

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

### Step 3d: If "Cancel" Selected

```
Session remains active.
```

---

## MERGE FLOW (for "Complete & merge to main")

### Merge Step 1: Check for Uncommitted Changes

```bash
node .agileflow/scripts/session-manager.js check-merge {session_id}
```

If response contains `reason: "uncommitted_changes"`:

```
⚠️ You have uncommitted changes in this session.

Please commit your changes before merging:
  git add .
  git commit -m "your message"

Or discard changes:
  git checkout -- .

Then run /agileflow:session:end again.
```

**Exit the flow here.** Do not continue to merge.

### Merge Step 2: Get Merge Preview

```bash
node .agileflow/scripts/session-manager.js merge-preview {session_id}
```

Display preview:

```
📊 Merge Preview

Session {id} "{nickname}" → {mainBranch}

Commits to merge: {commitCount}
┌─────────────────────────────────────────────────────────────┐
│ {commit_1}                                                   │
│ {commit_2}                                                   │
│ ...                                                          │
└─────────────────────────────────────────────────────────────┘

Files changed: {fileCount}
  {file_1}
  {file_2}
  ...
```

If `commitCount: 0`:
```
ℹ️ No commits to merge. Your branch is already up to date with main.

Would you like to just end the session instead?
```

Then show simplified options (end/delete/cancel).

### Merge Step 3: Check Mergeability

From the `check-merge` response, check `hasConflicts`:

If `hasConflicts: true`:

```
⚠️ Merge conflicts detected!

This branch has conflicts with {mainBranch}. Smart merge can attempt automatic resolution.
```

Then show conflict options:

```
AskUserQuestion:
  question: "How would you like to proceed?"
  header: "Merge conflicts"
  multiSelect: false
  options:
    - label: "Auto-resolve conflicts (Recommended)"
      description: "Smart merge will resolve based on file types automatically"
    - label: "Resolve manually"
      description: "Keep session active and resolve conflicts yourself"
    - label: "End session without merging"
      description: "Keep worktree for later resolution"
    - label: "Cancel"
      description: "Keep session as-is"
```

If "Auto-resolve conflicts" selected:
```bash
node .agileflow/scripts/session-manager.js smart-merge {session_id} --strategy={squash|merge}
```

The smart merge will:
1. Categorize conflicting files by type (docs, tests, schema, config, source)
2. Apply appropriate resolution strategy per file type
3. Log all auto-resolutions for audit

Display result:
```
✓ Conflicts auto-resolved!

Files resolved:
  📄 docs/README.md → accept_both (Documentation kept from both)
  🧪 tests/api.test.ts → accept_both (Tests kept from both)
  ⚙️ package.json → merge_keys (Config merged)
  📝 src/api.ts → intelligent_merge (Source merged)

Merge log saved to: .agileflow/sessions/merge-log.json
```

If auto-resolution fails:
```
⚠️ Some conflicts could not be auto-resolved:

  ❌ src/complex.ts → Changes overlap in same code block

Options:
  • Resolve manually (see instructions below)
  • End session without merging
```

If "Resolve manually" selected, show instructions:
```
To resolve conflicts manually:

1. Make sure you're on main:
   cd {mainPath}
   git checkout {mainBranch}

2. Start the merge:
   git merge {branchName}

3. Resolve conflicts in your editor

4. Complete the merge:
   git add .
   git commit

5. Then delete the session worktree:
   git worktree remove {sessionPath}

Session remains active for now.
```

### Merge Step 4: Choose Merge Strategy (if clean)

If `mergeable: true`:

```
AskUserQuestion:
  question: "How should the commits be merged?"
  header: "Merge strategy"
  multiSelect: false
  options:
    - label: "Squash into single commit (Recommended)"
      description: "Combines all {commitCount} commits into one clean commit"
    - label: "Merge with commit history"
      description: "Preserves all {commitCount} individual commits"
```

### Merge Step 5: Confirm and Choose Cleanup

```
AskUserQuestion:
  question: "Merge session to {mainBranch}?"
  header: "Confirm merge"
  multiSelect: false
  options:
    - label: "Yes, merge and clean up (Recommended)"
      description: "Merge changes, delete branch and worktree"
    - label: "Merge but keep branch"
      description: "Merge changes but preserve the branch for reference"
    - label: "Cancel"
      description: "Don't merge"
```

### Merge Step 6: Execute Merge

Based on user choices:

```bash
# If "merge and clean up":
node .agileflow/scripts/session-manager.js integrate {session_id} --strategy={squash|merge} --deleteBranch=true --deleteWorktree=true

# If "merge but keep branch":
node .agileflow/scripts/session-manager.js integrate {session_id} --strategy={squash|merge} --deleteBranch=false --deleteWorktree=true
```

### Merge Step 7: Display Result

If successful:

```
✓ Session {id} "{nickname}" merged to {mainBranch}!

Summary:
  Strategy:    {Squash|Merge} ({commitCount} commits → 1)
  Message:     {commitMessage}
  Branch:      {branchName} (deleted|kept)
  Worktree:    {sessionPath} (removed)

┌─────────────────────────────────────────────────────────────┐
│ You're now back on {mainBranch}. Your changes are live!     │
│                                                             │
│   cd {mainPath}                                             │
│                                                             │
└─────────────────────────────────────────────────────────────┘

💡 To push your changes: git push
```

If failed:

```
✗ Merge failed

Error: {error_message}

Your session is still active. Try:
  • Resolve conflicts manually
  • Run /agileflow:session:end again after fixing issues
```

---

## Main Session Warning

If current session is the main project (is_main: true):

```
ℹ️ This is the main project session.

You can only end this session (mark inactive), not merge or delete.
The main project is not a worktree.
```

Then show the 2-option prompt (end or cancel).

## Related Commands

- `/agileflow:session:new` - Create new session
- `/agileflow:session:resume` - Switch sessions
- `/agileflow:session:status` - View all sessions

---

<!-- COMPACT_SUMMARY_START -->

## ⚠️ COMPACT SUMMARY - /agileflow:session:end IS ACTIVE

**CRITICAL**: This command terminates the current session. For non-main sessions, offers merge to main as the recommended option.

---

### 🚨 RULE #1: CHECK IF MAIN SESSION FIRST

```bash
node .agileflow/scripts/session-manager.js status
# If is_main: true → 2 options (end / cancel)
# If is_main: false → 4 options (merge / end / delete / cancel)
```

---

### 🚨 RULE #2: OPTIONS BY SESSION TYPE

**MAIN session** (2 options):
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

**NON-MAIN session** (4 options):
```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "End Session 2 \"auth\"?",
  "header": "End session",
  "multiSelect": false,
  "options": [
    {"label": "Complete & merge to main (Recommended)",
     "description": "Merge your changes to main and clean up"},
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

### 🚨 RULE #3: MERGE FLOW (if "Complete & merge" selected)

**Step 1: Check uncommitted changes**
```bash
node .agileflow/scripts/session-manager.js check-merge {session_id}
```
If `reason: "uncommitted_changes"` → Show commit instructions → EXIT

**Step 2: Get preview**
```bash
node .agileflow/scripts/session-manager.js merge-preview {session_id}
```
Display commits and files to be merged.

**Step 3: Check conflicts**
If `hasConflicts: true` → Show conflict options (auto-resolve/manual/end/cancel)

**Step 3a: If auto-resolve selected**
```bash
node .agileflow/scripts/session-manager.js smart-merge {session_id} --strategy={squash|merge}
```
Smart merge auto-resolves by file type: docs→accept_both, tests→accept_both, config→merge_keys, source→theirs

**Step 4: Choose strategy**
```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "How should the commits be merged?",
  "header": "Merge strategy",
  "multiSelect": false,
  "options": [
    {"label": "Squash into single commit (Recommended)",
     "description": "Combines all commits into one clean commit"},
    {"label": "Merge with commit history",
     "description": "Preserves all individual commits"}
  ]
}]</parameter>
</invoke>
```

**Step 5: Confirm cleanup**
```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "Merge session to main?",
  "header": "Confirm merge",
  "multiSelect": false,
  "options": [
    {"label": "Yes, merge and clean up (Recommended)",
     "description": "Merge changes, delete branch and worktree"},
    {"label": "Merge but keep branch",
     "description": "Merge changes but preserve the branch"},
    {"label": "Cancel",
     "description": "Don't merge"}
  ]
}]</parameter>
</invoke>
```

**Step 6: Execute**
```bash
node .agileflow/scripts/session-manager.js integrate {id} --strategy={squash|merge} --deleteBranch={true|false} --deleteWorktree=true
```

**Step 7: Display success**
```
✓ Session {id} merged to main!
  cd {mainPath}
💡 To push: git push
```

---

### 🚨 RULE #4: HANDLE OTHER OPTIONS

**"End session":**
```bash
node .agileflow/scripts/session-manager.js unregister {session_id}
```

**"End and delete worktree":**
```bash
node .agileflow/scripts/session-manager.js delete {session_id} --remove-worktree
```

**"Cancel":**
```
Session remains active.
```

---

### KEY FILES

| File | Purpose |
|------|---------|
| `.agileflow/sessions/registry.json` | Session registry |
| `.agileflow/sessions/{id}.lock` | Removed when session ends |
| `.agileflow/scripts/session-manager.js` | All session operations |

---

### WORKFLOW SUMMARY

```
1. Get session status
2. Check is_main
3. Show options (4 for non-main, 2 for main)
4. If merge selected:
   a. Check uncommitted → block if dirty
   b. Preview commits/files
   c. Check conflicts → offer alternatives if conflicts
   d. Choose strategy (squash/merge)
   e. Confirm cleanup
   f. Execute integrate
   g. Show success with cd command
5. If end/delete → Execute and show result
```

---

### ANTI-PATTERNS

❌ Show merge option for main session
❌ Skip uncommitted check before merge
❌ Merge without showing preview
❌ Merge when conflicts exist without warning
❌ Delete worktree before merge completes

### DO THESE

✅ Always check is_main first
✅ Check uncommitted changes before anything
✅ Show preview before merge
✅ Handle conflicts gracefully
✅ Squash as default strategy
✅ Show cd command after successful merge

---

### REMEMBER AFTER COMPACTION

- `/agileflow:session:end` IS ACTIVE
- Non-main: 4 options (merge first!)
- Main: 2 options only
- Merge flow: uncommitted → preview → conflicts → strategy → confirm → execute
- Default strategy: squash
- Always show cd command to return to main

<!-- COMPACT_SUMMARY_END -->
