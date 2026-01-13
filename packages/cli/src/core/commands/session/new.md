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

## IMMEDIATE ACTIONS

Upon invocation, execute these steps:

### Step 1: Check Prerequisites

```bash
# Verify git is available and we're in a git repo
git rev-parse --is-inside-work-tree
```

If not in a git repo, display error and exit.

### Step 2: Run Session Manager to Get Current State

```bash
node .agileflow/scripts/session-manager.js status
```

Parse the JSON output to understand current sessions.

### Step 3: Present Options with AskUserQuestion

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

## Error Handling

- **Directory exists**: Suggest different name or manual cleanup
- **Branch conflict**: Offer to use existing branch or create new one
- **Git errors**: Display error message and suggest manual resolution

## Related Commands

- `/agileflow:session:resume` - Switch between sessions
- `/agileflow:session:status` - View all sessions
- `/agileflow:session:end` - End current session

---

<!-- COMPACT_SUMMARY_START -->

## ⚠️ COMPACT SUMMARY - /agileflow:session:new IS ACTIVE

**CRITICAL**: This command creates new parallel sessions with git worktrees. Three-step process: validate → present options → create.

---

### 🚨 RULE #1: VALIDATE PREREQUISITES

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
- ALWAYS validate git repo first
- Present 3 options: auto-create / named / existing branch
- Each option leads to different flow
- Use AskUserQuestion for user selections
- Handle all error cases (directory, branch, git)
- **Run `session-manager.js switch {new_id}` AFTER creating session** (enables boundary protection)
- Show `/add-dir {path}` command for user to switch (NOT cd && claude)
- Show tip to use /agileflow:session:resume

<!-- COMPACT_SUMMARY_END -->
