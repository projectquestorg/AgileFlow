# Parallel Sessions

How to run multiple Claude Code agents simultaneously using AgileFlow's session system.

> **Research**: [20260113-vibe-kanban-parallel-ai-agents.md](../10-research/20260113-vibe-kanban-parallel-ai-agents.md)
> **Architecture**: [multi-session-coordination.md](../04-architecture/multi-session-coordination.md)

---

## Overview

Parallel sessions let you run multiple Claude Code instances working on different tasks simultaneously. Each session operates in its own **Git worktree** with an isolated branch, preventing merge conflicts during active work.

**Key insight** from Vibe Kanban research: Even with just 3 parallel agents on a small app, merge conflicts are inevitable when agents touch shared files (registries, configs, package.json). The solution is isolated branches + human-controlled merging.

---

## When to Use Parallel Sessions

| Scenario | Use Parallel Sessions? |
|----------|----------------------|
| Multiple independent features | **Yes** - Each in its own session |
| One feature spanning API + UI | **Maybe** - Consider orchestrator instead |
| Bug fix + feature work | **Yes** - Isolate bug fix |
| Sequential dependent work | **No** - Use single session |
| Spike/research + implementation | **Yes** - Don't pollute main |

---

## Quick Reference

### Core Commands

| Command | Purpose |
|---------|---------|
| `/agileflow:session:init` | Initialize session infrastructure |
| `/agileflow:session:new` | Create a parallel session (worktree) |
| `/agileflow:session:status` | View all sessions in table format |
| `/agileflow:session:resume` | Switch to another session |
| `/agileflow:session:end` | End session with optional merge |
| `/agileflow:session:history` | View historical session data |

### Typical Workflow

```bash
# Terminal 1: Main session
/agileflow:babysit US-0042  # Working on auth

# Terminal 2: Create parallel session
/agileflow:session:new
# → Creates ../project-2 worktree
# → Prompts for story/branch

/agileflow:babysit US-0045  # Working on payments

# Later: Check all sessions
/agileflow:session:status

# Merge when ready
/agileflow:session:end --merge
```

---

## Session Phases (Mental Model)

Inspired by Vibe Kanban's visual board, think of sessions in phases:

```
┌─ TO DO ─┐  ┌─ CODING ─┐  ┌─ REVIEW ─┐  ┌─ MERGED ─┐
│         │  │ Session 2│  │ Session 3│  │ Session 1│
│         │  │ US-0038  │  │ US-0042  │  │ (main)   │
│         │  │ 3 commits│  │ ready    │  │          │
└─────────┘  └──────────┘  └──────────┘  └──────────┘
```

**Phase Detection**:
- **TO DO**: Session created but no commits yet
- **CODING**: Has commits, still in progress
- **REVIEW**: Ready for merge (no uncommitted changes)
- **MERGED**: Merged to main branch

Use `/agileflow:session:status --kanban` for this visual view.

---

## Session Boundary Protection

AgileFlow prevents cross-session edits automatically. If you try to edit a file outside your active session:

```
[SESSION BOUNDARY] Edit blocked
File: /home/user/project-2/src/api.ts
Active session: Session 1 (/home/user/project)

The file is outside the active session directory.
Use /agileflow:session:resume to switch sessions first.
```

This prevents accidental merge conflicts.

---

## Merge Conflict Resolution

When sessions touch the same files (inevitable with shared configs), AgileFlow's smart merge auto-resolves by file type:

| File Type | Resolution Strategy | Example |
|-----------|-------------------|---------|
| **docs/** | Accept both | Keep both README changes |
| **tests/** | Accept both | Combine test additions |
| **schema** | Take session version | Use new schema |
| **config** | Merge conservatively | Keep main, add session |
| **source** | Take session version | Use session's code |

**Manual resolution** is required when strategies can't auto-resolve (e.g., both sessions modify same function).

---

## Thread Types

Sessions are classified by thread type (see [Thread-Based Engineering](./thread-based-engineering.md)):

| Thread | Description | Session Use |
|--------|-------------|-------------|
| **Base** | Single prompt → work → review | Default |
| **P** | Parallel work | `/session:new` |
| **C** | Chained phases | Plan → Implement sessions |
| **B** | Orchestrated | Orchestrator spawns sessions |
| **L** | Long-running | Overnight loop in session |

Set thread type with:
```bash
node .agileflow/scripts/session-manager.js set-thread-type 2 parallel
```

---

## Best Practices

### DO

1. **One story per session** - Clear scope, clean merge
2. **Name sessions meaningfully** - Use `--nickname` for clarity
3. **Check status regularly** - `/session:status` to track work
4. **Merge promptly** - Long-lived branches accumulate conflicts
5. **End sessions cleanly** - `/session:end` cleans up properly

### DON'T

1. **Edit files across sessions** - Boundary protection will block
2. **Run too many sessions** - 3-5 is manageable, 10+ is chaos
3. **Forget to merge** - Stale sessions waste context
4. **Skip conflict review** - Auto-resolve isn't always right
5. **Mix unrelated work** - Each session = one logical change

---

## Troubleshooting

### Session stuck as "active"

Lock file may be stale. AgileFlow auto-cleans on next startup, or manually:
```bash
rm .agileflow/sessions/{id}.lock
```

### Worktree removal fails

Force remove:
```bash
git worktree remove --force ../project-{id}
```

### Can't find my session

Check registry:
```bash
cat .agileflow/sessions/registry.json | jq
```

---

## External Tools

If you need a **visual Kanban UI** for parallel agents, consider these open-source alternatives:

- **Vibe Kanban** - Web-based Kanban board for Claude Code sessions
- **AutoClaude** - Multi-agent orchestration with visual dashboard

AgileFlow focuses on CLI-first workflows. Visual tools complement rather than replace it.

---

## Related Documentation

- [Thread-Based Engineering](./thread-based-engineering.md) - Mental model for parallel work
- [Async Agent Spawning](./async-agent-spawning.md) - Parallel sub-agents within session
- [Multi-Session Coordination](../04-architecture/multi-session-coordination.md) - Technical architecture
- [Session Harness](../04-architecture/session-harness.md) - Implementation details

---

## References

- Research: [20260113-vibe-kanban-parallel-ai-agents.md](../10-research/20260113-vibe-kanban-parallel-ai-agents.md)
- Research: [20260106-autoclaude-framework.md](../10-research/20260106-autoclaude-framework.md)
