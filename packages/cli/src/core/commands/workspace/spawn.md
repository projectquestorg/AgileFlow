---
description: Spawn parallel sessions across multiple workspace projects
argument-hint: "--projects frontend,backend [--count 1] [--prompt TEXT]"
compact_context:
  priority: high
  preserve_rules:
    - "ACTIVE COMMAND: /agileflow:workspace:spawn - Cross-project session spawning"
    - "Spawns Claude sessions in multiple projects"
    - "Uses tmux with project-prefixed window names"
    - "Registers sessions in workspace registry"
  state_fields:
    - workspace_root
    - target_projects
    - sessions_per_project
    - tmux_session_name
---

# /agileflow:workspace:spawn

Spawn parallel Claude Code sessions across multiple workspace projects.

---

## Purpose

When you need to coordinate work across multiple repositories, this command:
- Spawns Claude sessions in 2+ workspace projects simultaneously
- Creates tmux windows named `{project}-{nickname}` for easy navigation
- Registers all sessions in the workspace registry
- Optionally sends an initial prompt to each session

---

## IMMEDIATE ACTIONS

### Step 1: Parse Arguments

Extract from ARGUMENTS:
- `--projects "frontend,backend"` — Comma-separated project names (required)
- `--count N` — Sessions per project (default: 1)
- `--prompt TEXT` — Initial prompt for each session
- `--dangerous` — Use `--dangerouslySkipPermissions`
- `--no-tmux` — Output commands without spawning
- `--no-claude` — Create worktrees but don't start Claude

### Step 2: Find Workspace

```bash
node -e "
  const ws = require('.agileflow/scripts/lib/workspace-discovery');
  const root = ws.findWorkspaceRoot(process.cwd());
  if (!root) {
    console.log(JSON.stringify({ ok: false, error: 'Not in a workspace. Run /agileflow:workspace:init first.' }));
    process.exit(1);
  }
  const config = ws.getWorkspaceConfig(root);
  console.log(JSON.stringify({ root, ...config }, null, 2));
"
```

### Step 3: Validate Projects

Check that all requested projects exist in the workspace manifest. If a project name doesn't match, show available projects and ask.

### Step 4: Spawn Sessions

```bash
node .agileflow/scripts/spawn-parallel.js workspace-spawn \
  --workspace "/path/to/workspace" \
  --projects "frontend,backend" \
  --count 1
```

This will:
1. For each project:
   - `cd` into the project directory
   - Run `spawn-parallel.js spawn --count N` with the project as ROOT
   - Create worktrees as `{project}-{nickname}`
2. If tmux available:
   - Create one tmux session: `workspace-parallel-{timestamp}`
   - Windows named `{project}-{nickname}` (e.g., `frontend-1`, `backend-1`)
3. Register sessions in workspace registry

### Step 5: Display Results

```
Workspace: /path/to/parent

Spawned 4 sessions across 2 projects:

  frontend/
    frontend-1  feature/frontend-auth     [tmux window 0]
    frontend-2  feature/frontend-nav      [tmux window 1]

  backend/
    backend-1   feature/backend-api       [tmux window 2]
    backend-2   feature/backend-models    [tmux window 3]

Tmux session: workspace-parallel-1710000000
  tmux attach -t workspace-parallel-1710000000

Controls:
  Alt+1/2/3/4  Switch windows
  q            Detach
```

---

## Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `--projects` | Yes | Comma-separated project names |
| `--count` | No | Sessions per project (default: 1) |
| `--prompt` | No | Initial prompt for each session |
| `--dangerous` | No | Use --dangerouslySkipPermissions |
| `--no-tmux` | No | Output commands without spawning |
| `--no-claude` | No | Create worktrees but don't start Claude |

---

## Examples

### Spawn one session in each project

```
/agileflow:workspace:spawn --projects "frontend,backend"
```

### Spawn two sessions per project with prompt

```
/agileflow:workspace:spawn --projects "frontend,backend" --count 2 --prompt "/agileflow:babysit"
```

### List available projects first

```
/agileflow:workspace:status
/agileflow:workspace:spawn --projects "api,web"
```

---

## Related Commands

- `/agileflow:workspace:init` — Initialize the workspace
- `/agileflow:workspace:status` — View cross-project sessions
- `/agileflow:session:spawn` — Spawn sessions in a single project
