# Native Task Management

How to use Claude Code's native task management system alongside AgileFlow's story system.

> **Research**: [20260124-claude-code-task-management-system.md](../10-research/20260124-claude-code-task-management-system.md)

---

## Overview

Claude Code introduced a native task management system that stores tasks in `.claude/tasks/` with dependency tracking. This complements AgileFlow's story system by providing:

- **Session-level task breakdown** - Break a story into implementation tasks
- **Sub-agent delegation** - Each task runs in isolated context (~18% vs ~56%)
- **Cross-session coordination** - Multiple Claude Code sessions share task lists
- **Persistence across /clear** - Named task lists survive session restarts

**Key insight**: AgileFlow stories are for **project-level tracking** (epics, acceptance criteria, ownership). Claude Code tasks are for **session-level execution** (implementation steps, dependencies, parallel work).

---

## When to Use Each System

| Scenario | Use AgileFlow | Use Native Tasks |
|----------|---------------|------------------|
| Planning a feature with acceptance criteria | **Yes** - `/agileflow:story` | No |
| Breaking down a story into implementation steps | Maybe | **Yes** - TaskCreate |
| Tracking progress across sessions | **Yes** - `status.json` | Maybe |
| Running parallel sub-agents on subtasks | No | **Yes** - Sub-agent isolation |
| Cross-session visibility | **Yes** - Symlinked docs | **Yes** - Task list ID |
| Long-term project history | **Yes** - Stories persist | No - Tasks are ephemeral |
| Automated QA verification | No | **Yes** - Executor + Checker |

**Best practice**: Start with `/agileflow:story` for the user-facing work, then use native TaskCreate within the session to break down implementation.

---

## Configuring Persistent Task Lists

By default, Claude Code's task list ID equals the session ID. Running `/clear` loses your tasks. To persist across sessions:

### Option 1: Project Settings (Recommended)

Add to `.claude/settings.json`:

```json
{
  "env": {
    "CLAUDE_CODE_TASK_LIST_ID": "your-project-name"
  }
}
```

### Option 2: Environment Variable

```bash
CLAUDE_CODE_TASK_LIST_ID=my-project claude
```

### Option 3: Session-Specific

When you need a shared task list for a specific workflow:

```bash
# Terminal 1: Executor session
CLAUDE_CODE_TASK_LIST_ID=feature-auth claude

# Terminal 2: Checker session
CLAUDE_CODE_TASK_LIST_ID=feature-auth claude
```

Both sessions now share the same task list with real-time synchronization.

---

## Sub-Agent Isolation Pattern

When using native tasks, explicitly request sub-agent execution:

> "Complete each task in its own sub-agent"

This provides:

| Metric | Main Session | Sub-Agent |
|--------|--------------|-----------|
| Context usage | ~56% | ~18% |
| Parallel execution | No | Yes (with dependencies) |
| Fresh context | No (cumulative) | Yes (per task) |

### Dependency Waves

Tasks with `blocks`/`blockedBy` execute in waves:

```
Wave 1: [Task 1, Task 2]     (parallel, no dependencies)
Wave 2: [Task 3]             (blocked by Task 1)
Wave 3: [Task 4, Task 5]     (blocked by Task 3)
```

The orchestrator spawns sub-agents for each wave, waiting for completion before proceeding.

---

## Dual-Session Executor + Checker Pattern

A powerful workflow for automated QA:

### Session 1: Executor

```
Convert this plan into tasks and execute each in its own sub-agent.
Update task status as you complete each one.
```

### Session 2: Checker (runs concurrently)

```
Every 30 seconds, check the task list. For each task marked completed:
1. Spawn a checker sub-agent to verify the implementation
2. If verification fails, create a new task to fix the issue
3. Mark the original task as truly complete only after verification passes
```

### Checker Variations

| Checker Type | What It Verifies |
|--------------|-----------------|
| **Test runner** | All tests pass after change |
| **Code reviewer** | Code quality, patterns, security |
| **Simplification** | Can the implementation be simplified? |
| **External CLI** | Run linting, type checking, etc. |

---

## Integration with AgileFlow

### Workflow Example

```bash
# 1. Create story with AgileFlow
/agileflow:story "Add user authentication"

# 2. During implementation, break into native tasks
"Create tasks for this story:
- Set up auth middleware
- Create login endpoint
- Add session management
- Write integration tests

Execute each in its own sub-agent."

# 3. Update AgileFlow story status
/agileflow:status US-0042 in-progress

# 4. On completion
/agileflow:status US-0042 completed
```

### When NOT to Sync

Don't try to bidirectionally sync AgileFlow stories with native tasks. They serve different purposes:

- AgileFlow: **What** needs to be done (user stories, acceptance criteria)
- Native tasks: **How** to implement it (technical steps, dependencies)

---

## Best Practices

### DO

1. **Use task list IDs for persistent work** - Set `CLAUDE_CODE_TASK_LIST_ID` in settings
2. **Request sub-agent execution** - Explicitly ask for "each task in its own sub-agent"
3. **Set up dependencies** - Use `blocks`/`blockedBy` for proper sequencing
4. **Consider dual-session for QA** - Executor + Checker catches issues early
5. **Start from AgileFlow stories** - Use stories for tracking, tasks for execution

### DON'T

1. **Use native tasks for project tracking** - They're session-scoped, not project-scoped
2. **Skip sub-agent isolation** - Main session context grows quickly
3. **Expect automatic parallelization** - Must explicitly request sub-agents
4. **Over-engineer the sync** - Let each system do what it does best

---

## Troubleshooting

### Tasks disappeared after /clear

**Cause**: No `CLAUDE_CODE_TASK_LIST_ID` set - tasks used session ID which was cleared.

**Fix**: Set a named task list ID in project settings.

### Sub-agents not running in parallel

**Cause**: Didn't explicitly request sub-agent execution.

**Fix**: Add "execute each task in its own sub-agent" to your prompt.

### Task list not syncing between sessions

**Cause**: Different `CLAUDE_CODE_TASK_LIST_ID` values.

**Fix**: Ensure both sessions use identical task list ID.

### Orchestrator context still growing

**Expected behavior**: While sub-agents get fresh context, the orchestrator receives their outputs. This is unavoidable but still better than running all tasks in main session.

---

## Related Documentation

- [Parallel Sessions](./parallel-sessions.md) - Multi-session workflows
- [Async Agent Spawning](./async-agent-spawning.md) - Background sub-agents
- [Context Engineering](./context-engineering.md) - Managing context windows
- [Thread-Based Engineering](./thread-based-engineering.md) - Parallel work patterns

---

## References

- Research: [20260124-claude-code-task-management-system.md](../10-research/20260124-claude-code-task-management-system.md)
- Research: [20260121-claude-code-parallel-sessions.md](../10-research/20260121-claude-code-parallel-sessions.md)
- Research: [20260109-ralph-wiggum-autonomous-ai-loops.md](../10-research/20260109-ralph-wiggum-autonomous-ai-loops.md)
