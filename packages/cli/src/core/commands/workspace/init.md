---
description: Initialize a multi-project workspace for cross-repo orchestration
argument-hint: "[parent-dir]"
compact_context:
  priority: medium
  preserve_rules:
    - "ACTIVE COMMAND: /agileflow:workspace:init - Initialize workspace"
    - "Creates .agileflow-workspace/ in parent directory"
    - "Auto-discovers AgileFlow projects in children"
    - "Creates workspace.json manifest"
  state_fields:
    - workspace_root
    - discovered_projects
---

# /agileflow:workspace:init

Initialize a multi-project workspace for cross-repo orchestration.

---

## Purpose

Sets up a workspace layer above individual projects, enabling coordinated multi-repo operations. A workspace is a parent directory containing 2+ AgileFlow-enabled sub-projects.

```
parent-dir/                    <-- workspace root
  .agileflow-workspace/        <-- created by this command
    workspace.json             <-- project manifest
    workspace-registry.json    <-- cross-repo session tracking
    workspace-bus/log.jsonl    <-- federated message bus
  frontend/.agileflow/         <-- existing project
  backend/.agileflow/          <-- existing project
```

---

## IMMEDIATE ACTIONS

### Step 1: Determine Workspace Root

If ARGUMENTS contains a path, use that. Otherwise:

1. Check if `process.cwd()` has 2+ child directories with `.agileflow/`
2. If not, check parent directory (`..`)
3. If neither works, ask the user to specify

### Step 2: Run Discovery

```bash
node -e "
  const ws = require('.agileflow/scripts/lib/workspace-discovery');
  const root = process.argv[1] || '..';
  const projects = ws.discoverProjects(require('path').resolve(root));
  console.log(JSON.stringify({ root: require('path').resolve(root), projects }, null, 2));
" -- "${ARGUMENTS:-..}"
```

### Step 3: Confirm with User

Show discovered projects and ask for confirmation:

```
Workspace root: /path/to/parent
Discovered 3 AgileFlow projects:
  - frontend (has git)
  - backend (has git)
  - shared-lib (has git)

Initialize workspace with these projects?
```

### Step 4: Initialize

```bash
node -e "
  const ws = require('.agileflow/scripts/lib/workspace-discovery');
  const result = ws.initWorkspace(process.argv[1]);
  console.log(JSON.stringify(result, null, 2));
" -- "/path/to/workspace-root"
```

### Step 5: Report

Show what was created:
- `.agileflow-workspace/workspace.json` — project manifest
- `.agileflow-workspace/workspace-registry.json` — session tracking
- `.agileflow-workspace/workspace-bus/log.jsonl` — message bus

---

## Examples

### Initialize from a project directory

```
/agileflow:workspace:init
```

Auto-discovers sibling projects in the parent directory.

### Initialize with explicit path

```
/agileflow:workspace:init /home/user/my-workspace
```

---

## Related Commands

- `/agileflow:workspace:status` — View cross-project session status
- `/agileflow:workspace:spawn` — Spawn sessions across projects
