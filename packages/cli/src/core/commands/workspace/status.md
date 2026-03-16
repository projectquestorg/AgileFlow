---
description: View cross-repo session status across workspace projects
argument-hint: "[--project name]"
compact_context:
  priority: medium
  preserve_rules:
    - "ACTIVE COMMAND: /agileflow:workspace:status - Cross-project session view"
    - "Federates per-project registries into unified view"
    - "Shows sessions grouped by project"
    - "Read-only display command"
  state_fields:
    - workspace_root
    - total_projects
    - total_sessions
---

# /agileflow:workspace:status

View cross-project session status across all workspace projects.

---

## Purpose

Provides a unified view of sessions across all projects in a workspace. Federates each project's session registry into one display, grouped by project.

---

## IMMEDIATE ACTIONS

### Step 1: Find Workspace Root

```bash
node -e "
  const ws = require('.agileflow/scripts/lib/workspace-discovery');
  const root = ws.findWorkspaceRoot(process.cwd());
  if (!root) {
    console.log(JSON.stringify({ ok: false, error: 'Not in a workspace. Run /agileflow:workspace:init first.' }));
  } else {
    console.log(JSON.stringify({ ok: true, root }));
  }
"
```

If not in a workspace, tell the user to run `/agileflow:workspace:init`.

### Step 2: Get Federated Sessions

```bash
node -e "
  const { WorkspaceRegistry } = require('.agileflow/scripts/lib/workspace-registry');
  const ws = require('.agileflow/scripts/lib/workspace-discovery');
  const root = ws.findWorkspaceRoot(process.cwd());
  const reg = new WorkspaceRegistry(root);
  const all = reg.getAllSessions();
  const summary = reg.getSummary();
  console.log(JSON.stringify({ all, summary }, null, 2));
"
```

### Step 3: Display

Format output as a table grouped by project:

```
Workspace: /path/to/parent (3 projects)

frontend/ (2 sessions)
  ID        Branch            Status    Story
  front-1   feature/auth      active    US-0042
  front-2   feature/nav       inactive  US-0045

backend/ (1 session)
  ID        Branch            Status    Story
  back-1    main              active    -

shared-lib/ (0 sessions)
  No active sessions

Total: 3 sessions across 3 projects
```

### Step 4: Filter (Optional)

If ARGUMENTS contains `--project <name>`, show only that project's sessions.

---

## Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `--project` | No | Filter to a specific project |

---

## Related Commands

- `/agileflow:workspace:init` — Initialize the workspace
- `/agileflow:workspace:spawn` — Spawn sessions across projects
- `/agileflow:session:status` — View single-project sessions
