---
description: View workspace dashboard with sessions, stories, and quality gates
argument-hint: "[--gates]"
compact_context:
  priority: medium
  preserve_rules:
    - "ACTIVE COMMAND: /agileflow:workspace:dashboard - Unified workspace view"
    - "Shows sessions grouped by project with story counts"
    - "Optional --gates flag runs cross-project quality gates"
    - "Read-only display command"
  state_fields:
    - workspace_root
    - total_projects
    - total_sessions
    - gate_results
---

# /agileflow:workspace:dashboard

Unified workspace dashboard showing sessions, stories, and quality gates.

---

## Purpose

Provides a bird's-eye view of all workspace projects including:
- Session status per project (active/inactive)
- Story progress per project (WIP/ready/done)
- Recent cross-project events
- Optional quality gate validation (dependency alignment, test status, git status)

---

## IMMEDIATE ACTIONS

### Step 1: Find Workspace

```bash
node -e "
  const ws = require('.agileflow/scripts/lib/workspace-discovery');
  const root = ws.findWorkspaceRoot(process.cwd());
  if (!root) {
    console.log(JSON.stringify({ ok: false, error: 'Not in a workspace.' }));
  } else {
    console.log(JSON.stringify({ ok: true, root }));
  }
"
```

### Step 2: Display Dashboard

```bash
node -e "
  const { WorkspaceDashboard } = require('.agileflow/scripts/lib/workspace-dashboard');
  const ws = require('.agileflow/scripts/lib/workspace-discovery');
  const root = ws.findWorkspaceRoot(process.cwd());
  const dash = new WorkspaceDashboard(root);
  console.log(dash.formatForCLI());
"
```

### Step 3: Quality Gates (if `--gates` flag)

If ARGUMENTS contains `--gates`:

```bash
node -e "
  const { WorkspaceQualityGates } = require('.agileflow/scripts/lib/workspace-quality-gates');
  const ws = require('.agileflow/scripts/lib/workspace-discovery');
  const root = ws.findWorkspaceRoot(process.cwd());
  const gates = new WorkspaceQualityGates(root);
  const results = gates.runAll();
  console.log(WorkspaceQualityGates.formatForCLI(results));
  console.log(JSON.stringify({ ok: results.ok, summary: results.summary }));
"
```

---

## Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `--gates` | No | Run cross-project quality gates |

---

## Example Output

```
  Workspace: /home/user/myworkspace
  Projects: 3 | Sessions: 4 | Stories: 12

  frontend/
    Stories: 2 WIP, 3 ready, 5 done
    Sessions (2):
      frontend-1  feature/auth
      frontend-2  feature/nav

  backend/
    Stories: 1 WIP, 0 ready, 8 done
    Sessions (1):
      backend-1  main

  shared-lib/
    Stories: 0 WIP, 1 ready, 2 done
    No active sessions

  Recent Events:
    [14:32:10] frontend: task_completed
    [14:31:45] backend: task_started
```

With `--gates`:
```
  Workspace Quality Gates
  --------------------------------------------------
  [PASS] frontend exists
  [PASS] backend exists
  [PASS] shared-lib exists
  [PASS] All shared dependencies are version-aligned
  [PASS] frontend: tests passing
  [FAIL] backend: tests failing
  [PASS] frontend: clean
  [FAIL] backend: 3 uncommitted change(s)
  --------------------------------------------------
  Passed: 5 | Failed: 2 | Skipped: 0
```

---

## Related Commands

- `/agileflow:workspace:init` — Initialize the workspace
- `/agileflow:workspace:status` — View sessions only
- `/agileflow:workspace:spawn` — Spawn sessions across projects
