---
description: Spawn multiple parallel Claude Code sessions in git worktrees
argument-hint: [--count N | --branches a,b,c | --from-epic EP-XXX]
compact_context:
  priority: high
  preserve_rules:
    - "ACTIVE COMMAND: /agileflow:session:spawn - Spawn multiple parallel sessions"
    - "Creates multiple git worktrees with session-manager.js"
    - "Auto-copies .env files to each worktree"
    - "Optionally spawns Claude in tmux windows"
    - "Options: --count N, --branches 'a,b,c', --from-epic EP-XXX"
    - "Flags: --init (run claude init), --dangerous (skip permissions), --no-tmux"
  state_fields:
    - session_count
    - branches_list
    - epic_id
    - tmux_session_name
---

# /agileflow:session:spawn

Spawn multiple parallel Claude Code sessions in git worktrees with optional tmux integration.

---

## Purpose

When you need to run multiple Claude Code instances in parallel on isolated tasks, this command:
- Creates N git worktrees (each with its own branch)
- Auto-copies `.env` files to each worktree
- Optionally spawns Claude in tmux windows for easy navigation
- Tracks all sessions in the session registry

Based on the [git worktrees parallel sessions research](../../../10-research/20260121-claude-code-git-worktrees-parallel.md).

---

## STEP 0: Gather Context

```bash
node .agileflow/scripts/obtain-context.js session:spawn
```

---

## IMMEDIATE ACTIONS

Upon invocation, execute these steps:

### Step 1: Parse Arguments

Extract from ARGUMENTS:
- `--count N` - Number of sessions to create (e.g., `--count 4`)
- `--branches "a,b,c"` - Specific branch names (comma-separated)
- `--from-epic EP-XXX` - Create sessions for ready stories in epic
- `--init` - Run `claude init` in each worktree
- `--dangerous` - Use `--dangerouslySkipPermissions`
- `--no-tmux` - Just create worktrees, output commands manually

At least one of `--count`, `--branches`, or `--from-epic` is required.

### Step 2: Create Todo List

```xml
<invoke name="TaskCreate/TaskUpdate">
<parameter name="todos">[
  {"content": "Validate arguments", "status": "in_progress", "activeForm": "Validating arguments"},
  {"content": "Create parallel sessions", "status": "pending", "activeForm": "Creating sessions"},
  {"content": "Spawn in tmux (if applicable)", "status": "pending", "activeForm": "Spawning in tmux"},
  {"content": "Display navigation help", "status": "pending", "activeForm": "Displaying help"}
]</parameter>
</invoke>
```

### Step 3: Run Spawn Script

Build the command based on arguments:

```bash
# Example: Create 4 sessions
node .agileflow/scripts/spawn-parallel.js spawn --count 4

# Example: Create from branches
node .agileflow/scripts/spawn-parallel.js spawn --branches "auth,dashboard,api"

# Example: Create from epic
node .agileflow/scripts/spawn-parallel.js spawn --from-epic EP-0025

# Example: With init and no tmux
node .agileflow/scripts/spawn-parallel.js spawn --count 3 --init --no-tmux
```

### Step 4: Display Results

The script will output:
- Created session IDs and paths
- Copied env files
- Tmux session name and navigation keys (if tmux available)
- Manual commands (if --no-tmux or no tmux available)

---

## Examples

### Create 4 Generic Parallel Sessions

```
/agileflow:session:spawn --count 4
```

Creates:
- `../Project-1/` (branch: parallel-1)
- `../Project-2/` (branch: parallel-2)
- `../Project-3/` (branch: parallel-3)
- `../Project-4/` (branch: parallel-4)

### Create Sessions for Specific Features

```
/agileflow:session:spawn --branches "auth,dashboard,api,admin"
```

Creates:
- `../Project-auth/` (branch: feature/auth)
- `../Project-dashboard/` (branch: feature/dashboard)
- `../Project-api/` (branch: feature/api)
- `../Project-admin/` (branch: feature/admin)

### Create Sessions from Epic Stories

```
/agileflow:session:spawn --from-epic EP-0025
```

Creates one session per "ready" story in the epic.

### With Claude Init (Primes Context)

```
/agileflow:session:spawn --count 2 --init
```

Runs `claude init` in each worktree to generate CLAUDE.md with project context.

### Without Tmux (Manual Mode)

```
/agileflow:session:spawn --count 4 --no-tmux
```

Just creates worktrees and outputs commands to run manually.

---

## Tmux Navigation

If tmux is available, the script creates a tmux session with one window per Claude instance:

| Key | Action |
|-----|--------|
| `Ctrl+b n` | Next window |
| `Ctrl+b p` | Previous window |
| `Ctrl+b 0-9` | Go to window N |
| `Ctrl+b d` | Detach (sessions keep running) |
| `tmux attach -t <name>` | Reattach to session |

---

## Managing Spawned Sessions

```bash
# List all parallel sessions
/agileflow:session:status

# Check on a specific session
/agileflow:session:resume 2

# End and merge a session
/agileflow:session:end 3 --merge

# Kill all tmux parallel sessions
node .agileflow/scripts/spawn-parallel.js kill-all
```

---

## Environment Files

The following files are automatically copied to each worktree:
- `.env`
- `.env.local`
- `.env.development`
- `.env.test`
- `.env.production`

This ensures each Claude instance has access to necessary environment variables.

---

## Related Commands

- `/agileflow:session:new` - Create a single parallel session interactively
- `/agileflow:session:status` - View all sessions
- `/agileflow:session:end` - End a session with optional merge
- `/agileflow:session:resume` - Switch to another session
