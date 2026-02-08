---
description: Cleanly end session with optional merge to main
argument-hint: (no arguments)
compact_context:
  priority: high
  preserve_rules:
    - "ACTIVE COMMAND: /agileflow:session:end - Terminate current session"
    - "For NON-MAIN sessions: 4 options (merge/end/delete/cancel)"
    - "For MAIN sessions: 2 options (end/cancel)"
    - "Uncommitted changes: INLINE options (commit/commit-custom/stash/discard/cancel) - NOT blocking!"
    - "Merge flow: check uncommitted → handle inline → preview → conflicts → strategy → confirm → execute → unstash if stashed"
    - "Main session can only be marked inactive, not deleted or merged"
    - "Use AskUserQuestion for all user choices"
  state_fields:
    - current_session
    - is_main_session
    - user_choice
    - merge_strategy
    - stash_used
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

---

## STEP 0: Gather Context

```bash
node .agileflow/scripts/obtain-context.js session:end
```

---

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

Then proceed to **Step 4: Offer to Close Tab**.

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

Then proceed to **Step 4: Offer to Close Tab**.

### Step 3d: If "Cancel" Selected

```
Session remains active.
```

---

## Step 4: Offer to Close Tab (if in tmux)

After ending a session (via end, delete, or merge), check if we're in tmux and offer to close the tab.

**Check if in tmux:**
```bash
echo $TMUX
```

If `$TMUX` is set (non-empty), we're in tmux. Ask:

```
AskUserQuestion:
  question: "Close this tmux tab?"
  header: "Close tab"
  multiSelect: false
  options:
    - label: "Yes, close tab"
      description: "Close this terminal tab (Alt+x also works)"
    - label: "No, keep open"
      description: "Stay in this tab"
```

**If "Yes, close tab" selected:**
```bash
tmux kill-window
```

**If "No, keep open" selected:**
Display any final messages and end.

---

## MERGE FLOW (for "Complete & merge to main")

### Merge Step 1: Check for Uncommitted Changes

```bash
node .agileflow/scripts/session-manager.js check-merge {session_id}
```

If response contains `reason: "uncommitted_changes"`:

**Display change summary:**
```
⚠️ You have uncommitted changes in this session.

{details_from_response}

```

**Present inline options with AskUserQuestion:**

```
AskUserQuestion:
  question: "How would you like to handle these uncommitted changes?"
  header: "Uncommitted changes"
  multiSelect: false
  options:
    - label: "Commit all changes (Recommended)"
      description: "Create a commit with auto-generated message"
    - label: "Commit with custom message"
      description: "Enter your own commit message"
    - label: "Stash changes temporarily"
      description: "Stash, merge, then restore after merge"
    - label: "Discard all changes"
      description: "Discard local changes and continue with merge"
    - label: "Cancel"
      description: "Keep session active with uncommitted changes"
```

#### If "Commit all changes" selected:

```bash
node .agileflow/scripts/session-manager.js commit-changes {session_id}
```

Display:
```
✓ Changes committed: {commitHash}
  Message: {message}
```

Continue to **Merge Step 2**.

#### If "Commit with custom message" selected:

First, analyze changes to suggest a meaningful commit message:

```bash
# Get changed files summary for commit message suggestion
git diff --stat HEAD
```

Based on the files changed, generate 2-3 contextual commit message suggestions:
- Examine which directories/files changed to determine the type (feat/fix/chore/docs)
- Read the diff summary to understand what was modified
- Suggest messages that describe the "why" not just the "what"

```
AskUserQuestion:
  question: "Choose or customize your commit message:"
  header: "Commit message"
  multiSelect: false
  options:
    # 2-3 suggestions based on git diff analysis. Examples:
    # - label: "feat: add OAuth support for session auth"
    #   description: "Based on changes to auth/ files"
    # - label: "fix: resolve merge conflict in config"
    #   description: "Based on config file changes"
    # Always include at least one option. User can select "Other" for custom.
```

The user will select a suggestion or "Other" to enter a custom message. Then:

```bash
node .agileflow/scripts/session-manager.js commit-changes {session_id} --message="{user_message}"
```

Display:
```
✓ Changes committed: {commitHash}
  Message: {message}
```

Continue to **Merge Step 2**.

#### If "Stash changes temporarily" selected:

```bash
node .agileflow/scripts/session-manager.js stash {session_id}
```

Display:
```
✓ Changes stashed: {message}

Note: After merge completes, stash will be restored on main branch.
```

Continue to **Merge Step 2**.

**IMPORTANT**: After the merge completes successfully (at the end of Merge Step 7), run:
```bash
node .agileflow/scripts/session-manager.js unstash {session_id}
```

Display:
```
✓ Stashed changes restored to main branch.
```

#### If "Discard all changes" selected:

```bash
node .agileflow/scripts/session-manager.js discard-changes {session_id}
```

Display:
```
✓ All uncommitted changes discarded.

⚠️ Note: Untracked files were NOT deleted.
```

Continue to **Merge Step 2**.

#### If "Cancel" selected:

```
Session remains active with uncommitted changes.
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

First, get detailed conflict info:
```bash
# Get list of files that conflict (without actually merging)
git merge --no-commit --no-ff {branchName} 2>&1 || true
git diff --name-only --diff-filter=U
git merge --abort
```

Display specific files with context:
```
⚠️ Merge conflicts detected in {N} file(s):

  {file1} - Both branches modified
  {file2} - Conflicting changes
  {file3} - Both added content (likely auto-resolvable)
```

Analyze the conflicting files to make a smart recommendation:
- If ALL conflicts are in docs/config files → recommend "Auto-resolve"
- If conflicts include source code → recommend "Review first, then auto-resolve"
- Count files by category (docs, tests, config, source) for the description

Then present AI-recommended options:

```
AskUserQuestion:
  question: "How to handle {N} conflicting file(s)?"
  header: "Conflicts"
  multiSelect: false
  options:
    - label: "{AI recommended option} (Recommended)"
      description: "{reason based on conflict analysis - e.g., 'All conflicts are in docs/config - safe to auto-resolve'}"
    - label: "Auto-resolve all"
      description: "Smart merge resolves by file type (docs=accept_both, source=theirs, config=ours)"
    - label: "Keep session, resolve manually"
      description: "Stay in session and fix conflicts yourself"
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

### Post-Merge: Notify Other Sessions

After successful merge, check if in tmux and send notification:

```bash
# Check if in tmux
echo $TMUX
```

If in tmux:
```bash
# Send visible notification to all windows
tmux display-message -d 5000 "Session {id} merged to {mainBranch} - changes are live"
```

Display to user:
```
The main branch working directory ({mainPath}) now has your merged changes.
If you have a Claude session on main, its files are already updated.

To push to remote: git push
```

Then proceed to **Step 4: Offer to Close Tab**.

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
If `reason: "uncommitted_changes"` → Show inline options (5 choices):
```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "How would you like to handle these uncommitted changes?",
  "header": "Uncommitted changes",
  "multiSelect": false,
  "options": [
    {"label": "Commit all changes (Recommended)", "description": "Create a commit with auto-generated message"},
    {"label": "Commit with custom message", "description": "Enter your own commit message"},
    {"label": "Stash changes temporarily", "description": "Stash, merge, then restore after merge"},
    {"label": "Discard all changes", "description": "Discard local changes and continue"},
    {"label": "Cancel", "description": "Keep session active with uncommitted changes"}
  ]
}]</parameter>
</invoke>
```

**Step 1a: Handle uncommitted choice**
- "Commit all": `node .agileflow/scripts/session-manager.js commit-changes {id}` → continue
- "Commit custom": Analyze `git diff --stat`, suggest 2-3 contextual messages → `commit-changes {id} --message="..."` → continue
- "Stash": `node .agileflow/scripts/session-manager.js stash {id}` → continue (unstash after merge)
- "Discard": `node .agileflow/scripts/session-manager.js discard-changes {id}` → continue
- "Cancel": EXIT

**Step 2: Get preview**
```bash
node .agileflow/scripts/session-manager.js merge-preview {session_id}
```
Display commits and files to be merged.

**Step 3: Check conflicts**
If `hasConflicts: true`:
- Get detailed file list: `git merge --no-commit --no-ff {branch}`, `git diff --name-only --diff-filter=U`, `git merge --abort`
- Display per-file conflict details
- Analyze file types to recommend best option (docs/config → auto-resolve, source → review)
- Show conflict options with AI recommendation first (auto-resolve/manual/cancel)

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

**Step 7a: Notify other sessions (if in tmux)**
```bash
tmux display-message -d 5000 "Session {id} merged to {mainBranch} - changes are live"
```
Display: "Main branch working directory now has your merged changes."

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

### 🚨 RULE #5: OFFER TO CLOSE TMUX TAB

After session ends (via end, delete, or merge), check if in tmux and offer to close:

```bash
# Check if in tmux
echo $TMUX
```

If in tmux, ask:
```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "Close this tmux tab?",
  "header": "Close tab",
  "multiSelect": false,
  "options": [
    {"label": "Yes, close tab",
     "description": "Close this terminal tab (Alt+x also works)"},
    {"label": "No, keep open",
     "description": "Stay in this tab"}
  ]
}]</parameter>
</invoke>
```

If "Yes":
```bash
tmux kill-window
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
   a. Check uncommitted → show inline options (commit/stash/discard/cancel)
   b. Handle uncommitted (commit-changes, stash, or discard-changes)
   c. Preview commits/files
   d. Check conflicts → offer alternatives if conflicts
   e. Choose strategy (squash/merge)
   f. Confirm cleanup
   g. Execute integrate
   h. If stash was used → unstash on main
   i. Show success with cd command
   j. If in tmux → notify other sessions via tmux display-message
5. If end/delete → Execute and show result
6. If in tmux → Offer to close tab
```

---

### ANTI-PATTERNS

❌ Show merge option for main session
❌ Skip uncommitted check before merge
❌ Block and exit on uncommitted changes (use inline options instead!)
❌ Merge without showing preview
❌ Merge when conflicts exist without warning
❌ Delete worktree before merge completes
❌ Forget to unstash after merge if stash was used

### DO THESE

✅ Always check is_main first
✅ Check uncommitted changes and offer inline options
✅ Handle uncommitted with commit-changes, stash, or discard-changes
✅ Show preview before merge
✅ Handle conflicts gracefully
✅ Squash as default strategy
✅ Show cd command after successful merge
✅ If stash was used, unstash after merge completes

---

### REMEMBER AFTER COMPACTION

- `/agileflow:session:end` IS ACTIVE
- Non-main: 4 options (merge first!)
- Main: 2 options only
- Uncommitted changes: inline options (commit/stash/discard/cancel) - NOT blocking!
- Merge flow: uncommitted → handle → preview → conflicts → strategy → confirm → execute → unstash if needed
- Default strategy: squash
- Always show cd command to return to main
- **After session ends: Offer to close tmux tab (if in tmux)**

<!-- COMPACT_SUMMARY_END -->
