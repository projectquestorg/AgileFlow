# Claude Code Parallel Sessions with Git Worktrees

**Import Date**: 2026-01-21
**Topic**: Claude Code Parallel Sessions with Git Worktrees
**Source**: YouTube video transcript (direct import)
**Content Type**: transcript

---

## Summary

This video provides a practical, hands-on tutorial for running multiple Claude Code sessions in parallel using git worktrees. Unlike theoretical discussions about parallel AI development, this demonstrates the actual step-by-step process of setting up isolated development environments where each Claude Code instance works on a separate task without file conflicts.

The key insight is that parallel AI coding requires task isolation - you cannot edit the same files simultaneously across sessions without merge conflicts. Git worktrees provide this isolation by creating separate working directories, each on its own branch, while sharing the same git repository. The presenter walks through creating worktrees, spinning up Claude Code in each, initializing context with `claude init`, and managing the PR/merge workflow.

The presenter acknowledges this is the "lazy" manual approach and suggests the process could be automated with shell scripts to spawn worktrees and Claude instances automatically.

---

## Key Findings

### Core Concept: Task Isolation
- Parallel coding requires completely isolated file changes
- Same files edited simultaneously = merge conflicts and delays
- Plan features to be independent from each other during parallel phases

### Git Worktree Mechanics
- `git worktree add` creates a new working directory with its own branch
- Each worktree is a full copy of the project (but shares git history)
- `.env` files don't copy automatically - must manually copy to each worktree
- All worktrees point to same remote repository

### The Manual Workflow (Step-by-Step)
1. Ensure you're on main branch, up to date
2. Create worktrees directory: `mkdir worktrees`
3. Create worktree for each parallel task: `git worktree add worktrees/task-name -b branch-name`
4. Copy `.env` files to each worktree manually
5. Open separate terminal for each worktree
6. Run `claude --dangerouslySkipPermissions` in each terminal (be careful!)
7. Run `claude init` in each to prime context
8. Supply task prompt to each Claude instance
9. Let all instances work in parallel
10. Review, build, commit, and push each branch
11. Create PRs and merge

### Dangerous Mode Warning
- `--dangerouslySkipPermissions` skips approval prompts
- Useful for autonomous operation but risky
- Only use when you trust the task and have good planning

### Context Priming with `claude init`
- Scans entire codebase and creates CLAUDE.md
- Primes Claude with project knowledge before coding
- Like having a senior developer who already knows the codebase
- Worth doing for each worktree instance on large tasks

### PR and Merge Flow
1. Run `pnpm run build` (or equivalent) in each worktree
2. Run pre-commit checks
3. `git add . && git commit -m "message" && git push`
4. Create PR in GitHub
5. Review code changes
6. Merge to main

### Future Automation Potential
- Manual process is "lazy" but educational
- Could automate with shell scripts:
  - Auto-create worktrees
  - Auto-copy .env files
  - Auto-spawn Claude instances
  - Auto-feed task prompts

---

## Implementation Approach

### Phase 1: Sequential Foundation (if needed)
1. Complete any tasks that other tasks depend on
2. Ensure foundation is solid before parallelizing

### Phase 2: Parallel Execution
1. Create worktrees for each independent task:
   ```bash
   git worktree add worktrees/memory-service -b feature/memory-service
   git worktree add worktrees/memory-retrieval -b feature/memory-retrieval
   git worktree add worktrees/signup-sync -b feature/signup-sync
   git worktree add worktrees/verification-tool -b feature/verification-tool
   ```

2. Copy environment files:
   ```bash
   cp .env worktrees/memory-service/
   cp .env worktrees/memory-retrieval/
   # etc.
   ```

3. Initialize Claude in each:
   ```bash
   cd worktrees/memory-service && claude --dangerouslySkipPermissions
   # Run: /init
   ```

4. Feed task prompts to each instance

### Phase 3: Review & Merge
1. Build each worktree: `pnpm run build`
2. Commit and push each branch
3. Review PRs in GitHub
4. Merge when ready

---

## Code Snippets

### Create Worktree Directory
```bash
mkdir -p worktrees
```

### List Existing Worktrees
```bash
git worktree list
```

### Create New Worktree with Branch
```bash
git worktree add worktrees/<folder-name> -b <branch-name>
```

### Example: Create Four Parallel Worktrees
```bash
git worktree add worktrees/memory-service -b feature/memory-service
git worktree add worktrees/memory-retrieval -b feature/memory-retrieval
git worktree add worktrees/signup-sync -b feature/signup-sync
git worktree add worktrees/verification-tool -b feature/verification-tool
```

### Copy Environment Files
```bash
cp .env worktrees/memory-service/
cp .env worktrees/memory-retrieval/
cp .env worktrees/signup-sync/
cp .env worktrees/verification-tool/
```

### Start Claude in Dangerous Mode (Use Carefully!)
```bash
claude --dangerouslySkipPermissions
```

### Initialize Claude Context
```
/init
```

### Build and Push Flow
```bash
pnpm run build
git add .
git commit -m "feat: implement memory service"
git push -u origin feature/memory-service
```

### Clean Up Worktree (After Merge)
```bash
git worktree remove worktrees/memory-service
```

---

## Action Items

- [ ] Practice git worktree basics on a test repository
- [ ] Create shell script to automate worktree creation
- [ ] Create shell script to copy .env files to all worktrees
- [ ] Consider tmux/screen setup for managing multiple terminals
- [ ] Document task isolation patterns for epic planning
- [ ] Build automation wrapper for parallel Claude sessions

---

## Risks & Gotchas

- **ENV files don't copy**: Must manually copy .env to each worktree
- **Dangerous mode risks**: Skipping permissions can lead to unintended actions
- **Merge conflicts**: If task isolation isn't clean, merging becomes painful
- **Manual process is slow**: Opening 4+ terminals, copying files, running commands
- **Context per worktree**: Each Claude instance needs its own init/context
- **Code review bottleneck**: 4 parallel PRs still need sequential review

---

## Story Suggestions

### Potential Epic: Automated Parallel Claude Sessions

**US-XXXX**: Git Worktree Manager Script
- AC: Script creates N worktrees from a config file
- AC: Auto-copies .env and other required files
- AC: Outputs worktree paths for next step

**US-XXXX**: Parallel Claude Spawner
- AC: Spawns Claude Code in each worktree (tmux/screen)
- AC: Runs `claude init` automatically
- AC: Ready to receive task prompts

**US-XXXX**: Task Prompt Distribution
- AC: Given epic/plan, generates prompts for each worktree
- AC: Feeds prompts to respective Claude instances
- AC: Monitors progress across sessions

**US-XXXX**: Parallel PR Manager
- AC: Builds all worktrees in parallel
- AC: Commits and pushes each branch
- AC: Creates draft PRs for review

---

## Raw Content Reference

<details>
<summary>Original content (click to expand)</summary>

[00:00:00] We can run cloud code in parallel. If you go to Anthropics documentation page, there's a section says run parallel cloud code sessions with git work trees. What does this mean? This means that we can have multiple git work trees and for each git work tree, we can have an instance of cloud code inside of it. So you can delegate these tasks in parallel to complete these tasks faster. But here's the problem. When you're trying to code in parallel, whatever that you're building and coding, everything needs to be isolated, meaning that you can't edit the same files at the same time. Otherwise, we're going to have merge conflicts...

[Content truncated at 1000 chars for reference]

</details>

---

## References

- Source: YouTube video transcript (direct import)
- Import date: 2026-01-21
- Related: [Claude Code Parallel Sessions](./20260121-claude-code-parallel-sessions.md) (mental models), [GSD Workflow](./20260119-gsd-claude-code-workflow-system.md), [Ralph Loop](./20260114-ralph-loop-ralph-tui.md)
