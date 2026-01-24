---
description: Create a new parallel session with git worktree
argument-hint: (no arguments)
compact_context:
  priority: high
  preserve_rules:
    - "ACTIVE COMMAND: /agileflow:session:new - Create parallel session with worktree"
    - "Validates git repo and prerequisites before proceeding"
    - "Prompts user with 3 creation options: auto-create / named / existing branch"
    - "Each option leads to different AskUserQuestion prompt"
    - "Returns success message with `cd` command to activate new session"
    - "Worktrees created in ../project-{id} or ../project-{name} directories"
  state_fields:
    - session_count
    - user_choice
    - new_session_id
    - new_session_path
---

# /agileflow:session:new

Create a new isolated session for parallel Claude Code work.

---

## Purpose

When you need to work on multiple things simultaneously in the same repo, this command creates a new session with:
- A separate git worktree (isolated directory)
- Its own branch
- Independent session tracking

---

## STEP 0: Gather Context

```bash
node .agileflow/scripts/obtain-context.js session:new
```

---

## IMMEDIATE ACTIONS

Upon invocation, execute these steps:

### Step 1: Check Prerequisites

```bash
# Verify git is available and we're in a git repo
git rev-parse --is-inside-work-tree
```

If not in a git repo, display error and exit.

### Step 1.5: Check if Inside Tmux Session

```bash
# Check if $TMUX environment variable is set
echo $TMUX
```

**If INSIDE tmux** (TMUX is not empty):
- Use the simplified tmux add-window flow (see Step 2B below)
- This adds a new window to the CURRENT tmux session instead of creating external worktree

**If NOT inside tmux**:
- Continue with the standard flow (Step 2A below)

### Step 2A: Standard Flow (NOT in tmux)

Run Session Manager to Get Current State:

```bash
node .agileflow/scripts/session-manager.js status
```

Parse the JSON output to understand current sessions.

### Step 2B: Tmux Flow (INSIDE tmux)

When inside tmux, use the simplified add-window flow:

```
AskUserQuestion:
  question: "Name for the new session window?"
  header: "New window"
  multiSelect: false
  options:
    - label: "Auto-generate name"
      description: "Creates parallel-{timestamp} automatically"
    - label: "auth"
      description: "Authentication work"
    - label: "feature"
      description: "New feature development"
    - label: "bugfix"
      description: "Bug fixing"
```

### Step 2B.2: Ask Startup Mode (OPTIONAL but recommended)

After getting the session name, check for configured default startup mode:

```bash
# Read the default startup mode from metadata (if exists)
cat docs/00-meta/agileflow-metadata.json | grep -A1 '"defaultStartupMode"' 2>/dev/null
```

The `defaultStartupMode` can be: `normal`, `skip-permissions`, `accept-edits`, or `no-claude`.

Then ask how Claude should start, putting the configured default first with "(Recommended)":

```
AskUserQuestion:
  question: "How should Claude start in this session?"
  header: "Startup mode"
  multiSelect: false
  options:
    # Put the defaultStartupMode option FIRST with "(Recommended)" suffix
    # Example if defaultStartupMode is "normal":
    - label: "Normal (Recommended)"
      description: "Standard Claude with permission prompts"
    - label: "Skip permissions"
      description: "claude --dangerously-skip-permissions (trusted mode)"
    - label: "Accept edits only"
      description: "claude --permission-mode acceptEdits"
    - label: "Don't start Claude"
      description: "Create worktree only, start Claude manually"

    # Example if defaultStartupMode is "skip-permissions":
    # - label: "Skip permissions (Recommended)"
    #   description: "claude --dangerously-skip-permissions (trusted mode)"
    # - label: "Normal"
    #   description: "Standard Claude with permission prompts"
    # - label: "Accept edits only"
    #   description: "claude --permission-mode acceptEdits"
    # - label: "Don't start Claude"
    #   description: "Create worktree only, start Claude manually"
```

**Mode to Flag Mapping:**
| defaultStartupMode | spawn-parallel.js flag |
|--------------------|------------------------|
| `normal` | (no extra flags) |
| `skip-permissions` | `--dangerous` |
| `accept-edits` | `--claude-args "--permission-mode acceptEdits"` |
| `no-claude` | `--no-claude` |

Then run based on selections:

```bash
# Normal mode (default):
node .agileflow/scripts/spawn-parallel.js add-window --name {session_name}

# Skip permissions mode:
node .agileflow/scripts/spawn-parallel.js add-window --name {session_name} --dangerous

# Accept edits only mode:
node .agileflow/scripts/spawn-parallel.js add-window --name {session_name} --claude-args "--permission-mode acceptEdits"

# Don't start Claude:
node .agileflow/scripts/spawn-parallel.js add-window --name {session_name} --no-claude
```

The script will:
1. Create a new git worktree
2. Add a new tmux window to the current session
3. Start Claude with selected options (or just cd if --no-claude)
4. Output the Alt+N shortcut to switch to it

Display success and exit - skip remaining steps.

### Step 3: Present Options with AskUserQuestion (Standard flow only)

Use AskUserQuestion to let user choose how to create the session:

```
AskUserQuestion:
  question: "How would you like to create your new session?"
  header: "New session"
  multiSelect: false
  options:
    - label: "Auto-create Session {next_id} (Recommended)"
      description: "Creates ../project-{next_id} with new branch session-{next_id}"
    - label: "Name this session"
      description: "Give it a memorable name like 'auth' or 'bugfix'"
    - label: "Use existing branch"
      description: "Create session from one of your existing branches"
```

### Step 4a: If "Auto-create" Selected

```bash
node .agileflow/scripts/session-manager.js create
```

Parse the JSON result. Display:

```
✓ Created Session {id}

  Workspace:   {path}
  Branch:      {branch}
  Thread Type: parallel

┌─────────────────────────────────────────────────────────┐
│ To start working in this session, run:                  │
│                                                         │
│   {command}                                             │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

Note: Worktree sessions default to "parallel" thread type. See docs/02-practices/thread-based-engineering.md for thread type definitions.

### Step 4b: If "Name this session" Selected

Use AskUserQuestion to get the name:

```
AskUserQuestion:
  question: "What should this session be called?"
  header: "Session name"
  multiSelect: false
  options:
    - label: "auth"
      description: "Working on authentication"
    - label: "bugfix"
      description: "Fixing bugs"
    - label: "feature"
      description: "New feature work"
    - label: "experiment"
      description: "Trying something out"
```

Then create with nickname:

```bash
node .agileflow/scripts/session-manager.js create --nickname {name}
```

### Step 4c: If "Use existing branch" Selected

List branches:

```bash
git branch --format='%(refname:short)'
```

Use AskUserQuestion to present branch options (limit to 4-5 most recent).

Then create with specified branch:

```bash
node .agileflow/scripts/session-manager.js create --branch {branch_name}
```

### Step 5: Display Success with Switch Command

After session creation succeeds:

1. First, activate boundary protection for the new session:
```bash
node .agileflow/scripts/session-manager.js switch {new_session_id}
```

2. Then show the `/add-dir` command for the user to switch:

```
✅ Created Session {id} "{nickname}"

┌────────────┬────────────────────────────────────────────┐
│ Session    │ {id} "{nickname}"                          │
│ Workspace  │ {path}                                     │
│ Branch     │ {branch}                                   │
│ Thread     │ parallel                                   │
└────────────┴────────────────────────────────────────────┘

To switch to this session, run:

  /add-dir {path}

💡 Use /agileflow:session:resume to list all sessions
```

**WHY /add-dir instead of cd && claude:**
- Stays in the same terminal and conversation
- One short command to type
- Immediately enables file access to the new session directory

## Worktree Creation Timeout

By default, worktree creation has a 2-minute (120000ms) timeout. For large repositories with many files, you can increase this:

```bash
# Increase timeout to 5 minutes (300000ms)
node .agileflow/scripts/session-manager.js create --timeout 300000
```

During worktree creation, progress feedback is displayed:
- **TTY (terminal)**: Animated spinner
- **Non-TTY (Claude Code)**: Periodic "still working" messages every 10 seconds

If worktree creation times out or fails, the script automatically cleans up:
- Removes any partial worktree directory
- Prunes git worktree registry
- Removes the branch if we just created it

## Error Handling

- **Directory exists**: Suggest different name or manual cleanup
- **Branch conflict**: Offer to use existing branch or create new one
- **Git errors**: Display error message and suggest manual resolution
- **Timeout**: Suggest increasing timeout for large repos

## Related Commands

- `/agileflow:session:resume` - Switch between sessions
- `/agileflow:session:status` - View all sessions
- `/agileflow:session:end` - End current session

---

<!-- COMPACT_SUMMARY_START -->

## ⚠️ COMPACT SUMMARY - /agileflow:session:new IS ACTIVE

**CRITICAL**: This command creates new parallel sessions with git worktrees.

**TWO MODES:**
1. **In tmux**: Adds a new window to current session (fast, Alt+N to switch)
2. **Not in tmux**: Creates worktree with /add-dir navigation

---

### 🚨 RULE #0: CHECK IF IN TMUX FIRST

```bash
echo $TMUX
```

**If TMUX is NOT empty** → Use TMUX FLOW (Rule #1B)
**If TMUX is empty** → Use STANDARD FLOW (Rule #1A onwards)

---

### 🚨 RULE #1B: TMUX FLOW (when in tmux)

**Step 1: Ask for session name:**
```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "Name for the new session window?",
  "header": "New window",
  "multiSelect": false,
  "options": [
    {"label": "Auto-generate name", "description": "Creates parallel-{timestamp} automatically"},
    {"label": "auth", "description": "Authentication work"},
    {"label": "feature", "description": "New feature development"},
    {"label": "bugfix", "description": "Bug fixing"}
  ]
}]</parameter>
</invoke>
```

**Step 2: Read default startup mode and ask:**
```bash
# Check configured default (normal if not set)
cat docs/00-meta/agileflow-metadata.json | grep '"defaultStartupMode"' 2>/dev/null
```

Then ask with configured default first + "(Recommended)":
```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "How should Claude start?",
  "header": "Startup",
  "multiSelect": false,
  "options": [
    {"label": "{default} (Recommended)", "description": "Configured default"},
    {"label": "Normal", "description": "Standard with prompts"},
    {"label": "Skip permissions", "description": "--dangerously-skip-permissions"},
    {"label": "Accept edits only", "description": "--permission-mode acceptEdits"},
    {"label": "Don't start Claude", "description": "Manual start later"}
  ]
}]</parameter>
</invoke>
```
Note: Put the defaultStartupMode FIRST with "(Recommended)", remove duplicate.

**Step 3: Run with selected options:**
```bash
# Normal:
node .agileflow/scripts/spawn-parallel.js add-window --name {name}

# Skip permissions:
node .agileflow/scripts/spawn-parallel.js add-window --name {name} --dangerous

# Accept edits:
node .agileflow/scripts/spawn-parallel.js add-window --name {name} --claude-args "--permission-mode acceptEdits"

# No Claude:
node .agileflow/scripts/spawn-parallel.js add-window --name {name} --no-claude
```

The script outputs the Alt+N shortcut. **DONE - skip remaining rules.**

---

### 🚨 RULE #1A: VALIDATE PREREQUISITES (standard flow)

Before doing anything, check:
```bash
git rev-parse --is-inside-work-tree
```

If NOT in a git repo:
```
Error: You're not in a git repository. Session creation requires git.
```

Then exit.

---

### 🚨 RULE #2: PRESENT THREE OPTIONS WITH AskUserQuestion

Get current session count first:
```bash
node .agileflow/scripts/session-manager.js status
```

Then show exactly these 3 options:
```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "How would you like to create your new session?",
  "header": "New session",
  "multiSelect": false,
  "options": [
    {"label": "Auto-create Session 2 (Recommended)",
     "description": "Creates ../project-2 with new branch session-2"},
    {"label": "Name this session",
     "description": "Give it a memorable name like 'auth' or 'bugfix'"},
    {"label": "Use existing branch",
     "description": "Create session from one of your existing branches"}
  ]
}]</parameter>
</invoke>
```

Increment session number based on current count.

---

### 🚨 RULE #3: HANDLE OPTION #1 - AUTO-CREATE

If user selects "Auto-create":
```bash
node .agileflow/scripts/session-manager.js create
```

Parse JSON result, then activate boundary protection:
```bash
node .agileflow/scripts/session-manager.js switch {new_id}
```

Then display:
```
✅ Created Session {id}

┌────────────┬────────────────────────────────────────────┐
│ Session    │ {id}                                       │
│ Workspace  │ {path}                                     │
│ Branch     │ {branch}                                   │
│ Thread     │ parallel                                   │
└────────────┴────────────────────────────────────────────┘

To switch to this session, run:

  /add-dir {path}

💡 Use /agileflow:session:resume to list all sessions
```

---

### 🚨 RULE #4: HANDLE OPTION #2 - NAME THIS SESSION

If user selects "Name this session", present suggestions:
```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "What should this session be called?",
  "header": "Session name",
  "multiSelect": false,
  "options": [
    {"label": "auth", "description": "Working on authentication"},
    {"label": "bugfix", "description": "Fixing bugs"},
    {"label": "feature", "description": "New feature work"},
    {"label": "experiment", "description": "Trying something out"},
    {"label": "Other", "description": "Custom name"}
  ]
}]</parameter>
</invoke>
```

If user selects "Other", prompt for custom input (AskUserQuestion with text input if available).

Then create:
```bash
node .agileflow/scripts/session-manager.js create --nickname {name}
```

Parse JSON result, then activate boundary protection:
```bash
node .agileflow/scripts/session-manager.js switch {new_id}
```

Then display:
```
✅ Created Session {id} "{name}"

┌────────────┬────────────────────────────────────────────┐
│ Session    │ {id} "{name}"                              │
│ Workspace  │ {path}                                     │
│ Branch     │ {branch}                                   │
│ Thread     │ parallel                                   │
└────────────┴────────────────────────────────────────────┘

To switch to this session, run:

  /add-dir {path}

💡 Use /agileflow:session:resume to list all sessions
```

---

### 🚨 RULE #5: HANDLE OPTION #3 - USE EXISTING BRANCH

If user selects "Use existing branch":

1. Get branches:
```bash
git branch --format='%(refname:short)'
```

2. Limit to 5-6 most recent and present:
```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "Which branch?",
  "header": "Select branch",
  "multiSelect": false,
  "options": [
    {"label": "feature/auth", "description": ""},
    {"label": "bugfix/login", "description": ""},
    {"label": "feature/payments", "description": ""},
    {"label": "main", "description": "Default branch"},
    {"label": "Other", "description": "See all branches"}
  ]
}]</parameter>
</invoke>
```

3. If user selects "Other", show all branches.

4. Create with selected branch:
```bash
node .agileflow/scripts/session-manager.js create --branch {branch_name}
```

5. Parse JSON result, then activate boundary protection:
```bash
node .agileflow/scripts/session-manager.js switch {new_id}
```

6. Display success as above with `/add-dir` command.

---

### 🚨 RULE #6: ERROR HANDLING

**If directory exists:**
```
Error: ../project-{name} already exists.

Suggestions:
  • Choose a different name
  • Remove the directory: rm -rf ../project-{name}
  • Use an existing directory as a session (advanced)
```

**If branch conflict:**
```
Error: Branch session-{id}-{name} already exists.

Try a different name or use /agileflow:session:new again.
```

**If git error:**
```
Error: Git operation failed

{error_message}

Try running: git status
```

---

### 🚨 RULE #7: SUCCESS MESSAGE FORMAT

All three options show same format:
```
✅ Created Session {id} ["{nickname}" OR empty]

┌────────────┬────────────────────────────────────────────┐
│ Session    │ {id} ["{nickname}" or empty]               │
│ Workspace  │ {path}                                     │
│ Branch     │ {branch}                                   │
│ Thread     │ parallel                                   │
└────────────┴────────────────────────────────────────────┘

To switch to this session, run:

  /add-dir {path}

💡 Use /agileflow:session:resume to list all sessions
```

**Use /add-dir instead of cd && claude** - stays in same terminal/conversation.
**Thread type**: Worktree sessions default to "parallel". See [Thread-Based Engineering](../../02-practices/thread-based-engineering.md).

---

### KEY FILES TO REMEMBER

| File | Purpose |
|------|---------|
| `.agileflow/sessions/registry.json` | Session registry (updated) |
| `.agileflow/scripts/session-manager.js` | Create session |
| `../project-{id/name}/` | New worktree directory |

---

### WORKFLOW

1. **Validate git** → `git rev-parse --is-inside-work-tree`
2. **Get session count** → `session-manager.js status`
3. **Present options** → AskUserQuestion with 3 choices
4. **User selects** → Option 1, 2, or 3
5. **Handle selection** → Different flow for each
6. **Create session** → Call manager script
7. **Activate boundary** → `session-manager.js switch {new_id}`
8. **Show success** → Display `/add-dir {path}` command for user to run

---

### SESSION CREATION METHODS

| Method | Path | Branch | Command |
|--------|------|--------|---------|
| Auto-create | ../project-{id} | session-{id} | create |
| Named | ../project-{name} | session-{id}-{name} | create --nickname {name} |
| Existing branch | ../project-{name} | {branch_name} | create --branch {branch} |

---

### ANTI-PATTERNS (DON'T DO THESE)

❌ Don't validate git repo in the middle of process
❌ Don't show more/fewer than 3 initial options
❌ Don't create session without explicit user choice
❌ Don't skip error handling (directory exists, branch conflict)
❌ Don't show old "cd && claude" command - use /add-dir instead
❌ Show different success formats for different methods

### DO THESE INSTEAD

✅ Validate git first, exit if not in repo
✅ Always show exactly 3 options
✅ Wait for user to select before creating
✅ Handle all error cases gracefully
✅ Show `/add-dir {path}` command for user to switch
✅ Use consistent success format

---

### REMEMBER AFTER COMPACTION

- `/agileflow:session:new` IS ACTIVE
- **CHECK $TMUX FIRST** - determines which flow to use
- **In tmux**: Use `spawn-parallel.js add-window` → fast, Alt+N to switch
- **Not in tmux**: Standard worktree flow → /add-dir to switch
- ALWAYS validate git repo first (for standard flow)
- Present 3 options: auto-create / named / existing branch (standard flow)
- Each option leads to different flow
- Use AskUserQuestion for user selections
- Handle all error cases (directory, branch, git)
- **Run `session-manager.js switch {new_id}` AFTER creating session** (enables boundary protection)
- Show `/add-dir {path}` command for user to switch (NOT cd && claude)
- Show tip to use /agileflow:session:resume
- **STARTUP OPTIONS (tmux flow)**: After name, ask startup mode:
  - Read `defaultStartupMode` from `docs/00-meta/agileflow-metadata.json`
  - Put configured default FIRST with "(Recommended)" suffix
  - Normal → (no extra flags)
  - Skip permissions → `--dangerous`
  - Accept edits → `--claude-args "--permission-mode acceptEdits"`
  - Don't start → `--no-claude`

<!-- COMPACT_SUMMARY_END -->
