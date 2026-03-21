---
description: Manage monorepo workspaces - cross-project orchestration, status, and coordination
argument-hint: "[init|status|spawn|dashboard]"
---

# workspace

Manage multi-project workspaces for cross-repo orchestration.

## Subcommands

| Command | Description |
|---------|-------------|
| `/agileflow:workspace:init` | Initialize a workspace in a parent directory |
| `/agileflow:workspace:status` | Show status across all workspace projects |
| `/agileflow:workspace:spawn` | Spawn agents across workspace projects |
| `/agileflow:workspace:dashboard` | Launch workspace dashboard |

## Quick Start

```
/agileflow:workspace:init         # Initialize workspace in parent dir
/agileflow:workspace:status       # Check status of all projects
/agileflow:workspace:spawn        # Run agents across projects
/agileflow:workspace:dashboard    # Launch multi-project dashboard
```

Run a subcommand above, or use `/agileflow:workspace:init` to get started.
