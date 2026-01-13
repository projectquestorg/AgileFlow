# Vibe Kanban Parallel AI Agents

**Import Date**: 2026-01-13
**Topic**: Vibe Kanban Parallel AI Agents
**Source**: YouTube video transcript
**Content Type**: transcript

---

## Summary

Vibe Kanban is an open-source tool for orchestrating multiple Claude Code agents working in parallel on the same codebase. The core problem it solves is that running multiple AI agents simultaneously causes massive merge conflicts (agents editing the same files) and code comprehension issues (developers not understanding what agents wrote).

The solution uses Git worktrees - each agent works in its own feature branch based on main, not directly on main. This isolates changes until a human reviews and manually merges them. The tool provides a Kanban-style board UI to visualize all agent sessions, review code diffs, leave comments, and control the merge process.

Key insight: Even with just 3 parallel agents on a small app, merge conflicts emerged immediately (e.g., two plants being added to a shared registry file). The human-in-the-loop pattern allows developers to resolve conflicts, rebase branches, and test features before merging to main.

---

## Key Findings

- **Git worktrees are essential**: Each agent gets its own branch based on main, preventing direct conflicts during parallel work
- **Merge conflicts are inevitable**: Even simple parallel tasks (adding two different game features) conflict when they touch shared files like registries or configs
- **Human loop controls merging**: Developers manually review, test, and merge each agent's work - the tool never auto-merges to main
- **Session persistence matters**: Vibe Kanban saves the entire Claude Code conversation history for each task, solving the problem of lost context when terminal sessions close
- **Spec-driven task creation**: Tasks are written with detailed descriptions (like user stories), which Claude Code uses to understand what to build
- **Code review workflow**: Built-in diff viewer with line-level commenting that can send review comments back to the AI agent for revisions
- **Rebase before merge**: When main moves forward, feature branches must be rebased to include latest changes before merging
- **AI can resolve conflicts**: Simple merge conflicts can be delegated to Claude Code to resolve

---

## Implementation Approach

1. **Create tasks on Kanban board** - Write detailed spec-like descriptions for each feature
2. **Start agent on task** - Agent creates feature branch from main and works autonomously
3. **Run multiple agents in parallel** - Each in their own worktree/branch
4. **Review when "In Review"** - Check code diff, test the branch, leave comments
5. **Request revisions** - Send review comments to AI agent for changes
6. **Rebase if needed** - Sync branch with updated main before merging
7. **Resolve conflicts** - Either manually or ask AI to resolve simple conflicts
8. **Merge to main** - Human clicks merge button only after verification
9. **Task auto-moves to Done** - Board updates automatically on merge

---

## Code Snippets

*No code snippets in this transcript - video focused on workflow demonstration*

---

## Action Items

- [ ] Investigate Vibe Kanban project (open source, locally hosted)
- [ ] Evaluate Git worktree pattern for parallel AgileFlow sessions
- [ ] Consider adding Kanban-style task visualization to AgileFlow
- [ ] Research session persistence for Claude Code conversations
- [ ] Explore code review/diff capabilities for agent outputs
- [ ] Document merge conflict resolution patterns for parallel agents

---

## Risks & Gotchas

- **Merge conflicts scale with parallelism**: More agents = more potential conflicts, especially in shared files (registries, configs, package.json)
- **Rebasing required frequently**: When main moves forward, all feature branches need rebasing before merge
- **Human bottleneck**: All merges require human review - can become a bottleneck with many parallel agents
- **Context loss without tooling**: Vanilla Claude Code terminal sessions don't persist conversation history well
- **Complexity vs benefit tradeoff**: The overhead of managing multiple agents may not be worth it for small tasks

---

## Story Suggestions

### Potential Epic: Parallel Agent Orchestration

**US-XXXX**: Git Worktree Support for Sessions
- AC: Sessions can spawn in isolated worktrees based on main branch

**US-XXXX**: Session Persistence Layer
- AC: Full conversation history saved and retrievable for each task

**US-XXXX**: Visual Kanban Board for Tasks
- AC: Web UI showing To Do/In Progress/Review/Done columns with agent sessions

**US-XXXX**: Code Diff Viewer with Comments
- AC: Review agent changes with line-level commenting capability

**US-XXXX**: Merge Control Interface
- AC: Human-controlled merge button that only works after rebase/conflict resolution

---

## Key Quotes

> "You're going to be the person pressing the button to merge all of this work into main. The great part is before you merge, you can test out the specific branch."

> "Even though I was running just three parallel agents, I already have a merge conflict. But because I'm now using something like Vibe Kanban, I'm able to just take care of this."

> "The video here was really more about the workflow, understanding how to properly analyze and understand which parts of your software can be parallelized."

---

## References

- Source: YouTube video transcript
- Import date: 2026-01-13
- Related: AutoClaude Framework (20260106-autoclaude-framework.md), Multi-Agent Orchestration Patterns (20260109-multi-agent-orchestration-language-patterns.md)
