---
description: Create a new parallel session with git worktree
argument-hint: "(no arguments)"
compact_context:
  priority: high
  preserve_rules:
    - "ACTIVE COMMAND: /agileflow:session:new - Create parallel session with worktree"
    - "Validates git repo and prerequisites before proceeding"
    - "Prompts user with 4 creation options: auto-create / named / existing branch / same-directory"
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

When inside tmux, first ask what type of session:

#### Step 2B.0: Ask Session Type

```
AskUserQuestion:
  question: "What type of session?"
  header: "Session type"
  multiSelect: false
  options:
    - label: "Parallel worktree (Recommended)"
      description: "Isolated branch + directory. Safe for concurrent work."
    - label: "Same directory (quick)"
      description: "No worktree. Multiple Claude instances in same dir. Best for small, non-overlapping changes."
```

**If "Same directory (quick)" selected:**

```bash
# Get the session name (or auto-generate)
```

Ask for a window name (simple, no worktree context needed):
```
AskUserQuestion:
  question: "Name for the new window?"
  header: "Window name"
  multiSelect: false
  options:
    - label: "Auto-name"
      description: "Uses 'quick-{timestamp}' automatically"
    - label: "helper"
      description: "Helper session for small tasks"
```

Then create the same-directory session:
```bash
# Create new tmux window in current directory and run Claude
tmux new-window -c "#{pane_current_path}" -n "{name}"
tmux send-keys "claude $CLAUDE_SESSION_FLAGS" Enter
```

Display:
```
Created same-directory session "{name}".
Changes apply to current branch. No git isolation.

Note: Multiple AIs editing the same files can cause conflicts.
Best for non-overlapping work (e.g., tests in one, docs in another).
```

**Done - skip remaining steps.**

**If "Parallel worktree" selected:**

Continue with the worktree flow below.

#### Step 2B.1: Ask Session Name (worktree flow)

Before presenting name options, gather context for smart suggestions:

```bash
# Get WIP/ready stories, recent commits, and existing branches in one pass
node -e "
const fs = require('fs');
const { execFileSync } = require('child_process');
const suggestions = [];
try {
  const status = JSON.parse(fs.readFileSync('docs/09-agents/status.json', 'utf8'));
  const stories = Object.entries(status.stories || {});
  const wip = stories.filter(([,s]) => s.status === 'in-progress' || s.status === 'ready');
  wip.slice(0, 3).forEach(([id, s]) => {
    const name = (s.title || id).toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 20);
    suggestions.push({ label: name, desc: id + ': ' + (s.title || '').slice(0, 40) });
  });
} catch(e) {}
try {
  const log = execFileSync('git', ['log', '--oneline', '-5'], { encoding: 'utf8' }).trim().split('\n');
  const topics = log.map(l => l.replace(/^[a-f0-9]+ /, '').replace(/^(feat|fix|chore|docs|refactor|test)[\(:].*?\)?:?\s*/, ''));
  const seen = new Set(suggestions.map(s => s.label));
  topics.slice(0, 2).forEach(t => {
    const name = t.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 20);
    if (!seen.has(name)) { suggestions.push({ label: name, desc: 'From recent commit: ' + t.slice(0, 40) }); seen.add(name); }
  });
} catch(e) {}
console.log(JSON.stringify(suggestions.slice(0, 3)));
"
```

Use the output to generate contextual name suggestions. Present with AskUserQuestion:

```
AskUserQuestion:
  question: "Name for the new session window?"
  header: "New window"
  multiSelect: false
  options:
    - label: "Auto-generate name"
      description: "Creates parallel-{timestamp} automatically"
    # Then 2-3 contextual suggestions from the script output above.
    # Example if WIP story US-0042 "OAuth Support" exists:
    # - label: "oauth-support"
    #   description: "US-0042: OAuth Support"
    # If no context available, use descriptive generics:
    # - label: "hotfix"
    #   description: "Quick bug fix"
    # - label: "experiment"
    #   description: "Try something out"
```

### Step 2B.2: Determine Startup Mode

Read the startup mode configuration:

```bash
node -e "try{const m=JSON.parse(require('fs').readFileSync('docs/00-meta/agileflow-metadata.json','utf8'));console.log(JSON.stringify({mode:m.sessions?.defaultStartupMode||'normal'}))}catch(e){console.log(JSON.stringify({mode:'normal'}))}"
```

The `defaultStartupMode` can be: `normal`, `skip-permissions`, `accept-edits`, or `no-claude`.

**If mode is NOT "normal":**
- Skip the question entirely. Use the configured mode directly.
- Display: `Using configured startup mode: {mode}`
- Map directly to flags and proceed to spawn (see Mode to Flag Mapping below)

**If mode IS "normal" (or not set):**
- Ask the startup mode question:

```
AskUserQuestion:
  question: "How should Claude start in this session?"
  header: "Startup mode"
  multiSelect: false
  options:
    - label: "Normal (Recommended)"
      description: "Standard Claude with permission prompts"
    - label: "Skip permissions"
      description: "claude --dangerously-skip-permissions (trusted mode)"
    - label: "Accept edits only"
      description: "claude --permission-mode acceptEdits"
    - label: "Don't start Claude"
      description: "Create worktree only, start Claude manually"
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
    - label: "Same directory (no worktree)"
      description: "Run another Claude here - fast for small changes, no git isolation"
```

### Step 4d: If "Same directory" Selected

Display the command for the user to run in a new terminal:

```
To start another Claude instance in this directory, run in a new terminal:

  cd {current_directory}
  claude

Or if you want skip-permissions mode:

  cd {current_directory}
  claude --dangerously-skip-permissions

Note: Multiple AIs editing the same files can cause conflicts.
Best for non-overlapping work (e.g., tests in one, docs in another).
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

Gather context for smart name suggestions (same script as tmux flow):

```bash
node -e "
const fs = require('fs');
const { execFileSync } = require('child_process');
const suggestions = [];
try {
  const status = JSON.parse(fs.readFileSync('docs/09-agents/status.json', 'utf8'));
  const stories = Object.entries(status.stories || {});
  const wip = stories.filter(([,s]) => s.status === 'in-progress' || s.status === 'ready');
  wip.slice(0, 3).forEach(([id, s]) => {
    const name = (s.title || id).toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 20);
    suggestions.push({ label: name, desc: id + ': ' + (s.title || '').slice(0, 40) });
  });
} catch(e) {}
try {
  const log = execFileSync('git', ['log', '--oneline', '-5'], { encoding: 'utf8' }).trim().split('\n');
  const topics = log.map(l => l.replace(/^[a-f0-9]+ /, '').replace(/^(feat|fix|chore|docs|refactor|test)[\(:].*?\)?:?\s*/, ''));
  const seen = new Set(suggestions.map(s => s.label));
  topics.slice(0, 2).forEach(t => {
    const name = t.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 20);
    if (!seen.has(name)) { suggestions.push({ label: name, desc: 'From recent commit: ' + t.slice(0, 40) }); seen.add(name); }
  });
} catch(e) {}
console.log(JSON.stringify(suggestions.slice(0, 3)));
"
```

Use AskUserQuestion with contextual suggestions from the script output:

```
AskUserQuestion:
  question: "What should this session be called?"
  header: "Session name"
  multiSelect: false
  options:
    # 2-3 contextual suggestions from script output above
    # Example: {"label": "oauth-support", "description": "US-0042: OAuth Support"}
    # If no context available, use descriptive generics:
    # {"label": "hotfix", "description": "Quick bug fix"}
    # {"label": "spike", "description": "Exploratory work"}
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

**Step 0: Ask session type:**
- "Parallel worktree (Recommended)" → continue to Step 1
- "Same directory (quick)" → create tmux window in current dir, run claude, display warning, DONE

**Step 1: Gather context and ask for session name:**
First run the context-gathering script to get WIP stories and recent commits for smart name suggestions.
Then present AskUserQuestion with "Auto-generate name" first, followed by 2-3 contextual suggestions.
If no context available, use descriptive generics (hotfix, experiment, spike).

**Step 2: Determine startup mode:**
```bash
node -e "try{const m=JSON.parse(require('fs').readFileSync('docs/00-meta/agileflow-metadata.json','utf8'));console.log(JSON.stringify({mode:m.sessions?.defaultStartupMode||'normal'}))}catch(e){console.log(JSON.stringify({mode:'normal'}))}"
```

**If mode is NOT "normal"** → Skip question, use configured mode directly, display `Using configured startup mode: {mode}`
**If mode IS "normal"** → Ask:
```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "How should Claude start?",
  "header": "Startup",
  "multiSelect": false,
  "options": [
    {"label": "Normal (Recommended)", "description": "Standard with prompts"},
    {"label": "Skip permissions", "description": "--dangerously-skip-permissions"},
    {"label": "Accept edits only", "description": "--permission-mode acceptEdits"},
    {"label": "Don't start Claude", "description": "Manual start later"}
  ]
}]</parameter>
</invoke>
```

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

Then show these 4 options:
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
     "description": "Create session from one of your existing branches"},
    {"label": "Same directory (no worktree)",
     "description": "Run another Claude here - fast, no git isolation"}
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

If user selects "Name this session", gather context for smart suggestions:
Run the context-gathering script to get WIP stories and recent commits.
Present AskUserQuestion with 2-3 contextual suggestions from the output.
If no context, use generics (hotfix, spike, experiment).
User can always select "Other" for a custom name.

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
| Same directory | (current dir) | (current branch) | (just run claude) |

---

### ANTI-PATTERNS (DON'T DO THESE)

❌ Don't validate git repo in the middle of process
❌ Don't show more/fewer than 4 initial options
❌ Don't create session without explicit user choice
❌ Don't skip error handling (directory exists, branch conflict)
❌ Don't show old "cd && claude" command - use /add-dir instead
❌ Show different success formats for different methods

### DO THESE INSTEAD

✅ Validate git first, exit if not in repo
✅ Always show exactly 4 options
✅ Wait for user to select before creating
✅ Handle all error cases gracefully
✅ Show `/add-dir {path}` command for user to switch
✅ Use consistent success format

---

### REMEMBER AFTER COMPACTION

- `/agileflow:session:new` IS ACTIVE
- **CHECK $TMUX FIRST** - determines which flow to use
- **In tmux**: Ask session type first (worktree vs same-dir), then `spawn-parallel.js add-window` for worktree or `tmux new-window` for same-dir
- **Not in tmux**: Standard flow with 4 options → /add-dir to switch (or same-dir instructions)
- ALWAYS validate git repo first (for standard flow)
- Present 4 options: auto-create / named / existing branch / same-directory (standard flow)
- Each option leads to different flow
- Use AskUserQuestion for user selections
- Handle all error cases (directory, branch, git)
- **Run `session-manager.js switch {new_id}` AFTER creating session** (enables boundary protection)
- Show `/add-dir {path}` command for user to switch (NOT cd && claude)
- Show tip to use /agileflow:session:resume
- **STARTUP OPTIONS (tmux flow)**: After name, check startup mode:
  - Read `defaultStartupMode` from `docs/00-meta/agileflow-metadata.json`
  - **If mode is NOT "normal"** → Skip question, use configured mode directly
  - **If mode IS "normal"** → Ask the startup mode question
  - Normal → (no extra flags)
  - Skip permissions → `--dangerous`
  - Accept edits → `--claude-args "--permission-mode acceptEdits"`
  - Don't start → `--no-claude`

<!-- COMPACT_SUMMARY_END -->
