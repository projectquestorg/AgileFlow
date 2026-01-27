# Claude Code Task Management System

**Import Date**: 2026-01-24
**Topic**: Claude Code Task Management System with Dependency Tracking
**Source**: YouTube video transcript (direct import)
**Content Type**: Video transcript

---

## Summary

Claude Code has introduced a new task management system that fundamentally changes how developers can work with the AI coding agent. Previously, Claude Code used a to-do list stored in session memory that didn't persist across sessions, leading to "agent amnesia" when starting new sessions mid-task. The new system stores tasks on the file system in the `.claude/tasks/` folder with dependency tracking, enabling multi-session workflows where sub-agents can view, create, and update tasks.

This update was inspired by the popular "Beads" repository and addresses two major pain points: context window overflow causing task loss, and bugs being dropped when the context is full. By isolating each task to its own sub-agent with a fresh context window, developers can achieve parallel execution similar to the "Ralph Wiggum" pattern while maintaining an orchestrator for coordination.

A key new capability is cross-session task sharing via `CLAUDE_CODE_TASK_LIST_ID`, allowing two separate Claude Code sessions to work from the same task list with real-time synchronization. This enables workflows like having one session execute tasks while another monitors and verifies completions.

---

## Key Findings

- **Agent amnesia solved**: Tasks now persist in `.claude/tasks/` folder as JSON files, surviving session restarts and `/clear` commands (when using a named task list ID)

- **Dependency tracking**: Tasks can specify `blocks` and `blockedBy` relationships, enabling parallel execution with proper sequencing (wave 1, wave 2, wave 3)

- **Four new tools available**: Both main sessions and sub-agents have access to `TaskCreate`, `TaskGet`, `TaskUpdate`, and `TaskList` tools

- **Sub-agent isolation**: Each task can run in its own fresh context window, using only ~18% context vs ~56% when all tasks run in main session

- **Cross-session sharing**: Two Claude Code sessions can share the same task list via `CLAUDE_CODE_TASK_LIST_ID` environment variable with real-time synchronization

- **No polling needed**: Task updates are immediately broadcast to all sessions sharing the task list (no more stale view problems)

- **Inspired by Beads**: Anthropic team integrated concepts from the popular Beads repository that writes goals/tasks to JSON files

---

## Implementation Approach

### Setting Up Persistent Task Lists

1. Add to project's `.claude/settings.json`:
```json
{
  "env": {
    "CLAUDE_CODE_TASK_LIST_ID": "your-project-name"
  }
}
```

2. Or pass at runtime:
```bash
CLAUDE_CODE_TASK_LIST_ID=localisation claude
```

### Running Tasks in Sub-Agents

When creating tasks, explicitly tell Claude Code:
> "Can you complete each task in its own sub-agent?"

This ensures:
- Fresh context window per task
- Parallel execution where dependencies allow
- ~3x less context usage (18% vs 56%)

### Dual-Session Workflow (Executor + Checker)

**Session 1 (Executor):**
```
Convert this plan file into tasks and execute each in its own sub-agent
```

**Session 2 (Checker/Monitor):**
```
Every 30 seconds, check the task list. For each completed task,
spawn a checker sub-agent to verify implementation. If incomplete,
add a new task to fix it.
```

---

## Code Snippets

### Task File Structure (`.claude/tasks/<session-id>/1.json`)
```json
{
  "id": "1",
  "description": "Task description here",
  "status": "completed",
  "blocks": ["3", "4"],
  "blockedBy": ["2"]
}
```

### settings.json Configuration
```json
{
  "env": {
    "CLAUDE_CODE_TASK_LIST_ID": "my-project"
  }
}
```

---

## Action Items

- [ ] Configure `CLAUDE_CODE_TASK_LIST_ID` in project settings.json for persistent task lists
- [ ] Experiment with dual-session workflow (executor + checker pattern)
- [ ] Always specify "complete each task in its own sub-agent" when running task lists
- [ ] Consider checker variations: code simplification, security review, or external CLI verification

---

## Risks & Gotchas

- **Default task list ID = session ID**: Without explicit `CLAUDE_CODE_TASK_LIST_ID`, running `/clear` loses your task list
- **Sub-agent spawning not automatic**: Must explicitly request tasks run in sub-agents or they execute in main context
- **Orchestrator context still grows**: While sub-agents get fresh context, the main session receives their outputs
- **No guarantee of parallel execution**: The task system "sometimes runs them in parallel with sub-agents and sometimes doesn't"

---

## Story Suggestions

### Potential Practice Doc: Dual-Session Task Monitoring

Document the executor + checker workflow pattern for quality assurance during automated task execution.

### Potential Story: Configure Task List ID for AgileFlow

**US-XXXX**: Configure persistent task list ID in AgileFlow settings
- AC: Task lists persist across `/clear` and session restarts
- AC: Multiple sessions can share the same task list

---

## Raw Content Reference

<details>
<summary>Original content (click to expand)</summary>

[00:00:00] All right, so yesterday we had a pretty interesting Claude Code update that may change the way that many of you fundamentally use Claude Code and may also unlock some new workflows for you. And this is a brand new task management system that includes new capabilities like dependency tracking, and I'll be going over that in this video and what it means for you...

</details>

---

## References

- Source: YouTube video transcript (direct import)
- Import date: 2026-01-24
- Related: [Ralph Wiggum Autonomous AI Loops](./20260109-ralph-wiggum-autonomous-ai-loops.md), [Claude Code Parallel Sessions](./20260121-claude-code-parallel-sessions.md)
