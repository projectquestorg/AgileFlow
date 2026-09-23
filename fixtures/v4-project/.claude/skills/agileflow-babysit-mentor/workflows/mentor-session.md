# Mentor Session Workflow

**Triggers:** "help me ship", "walk me through", "what should I work on", "mentor mode", "babysit", "guide me through this story"

**Goal:** Guide the user from story selection through commit, keeping them in control at every decision point.

## Inputs needed

| Input            | Required | How to get it                                      |
| ---------------- | -------- | -------------------------------------------------- |
| Project context  | Yes      | Read `docs/09-agents/status.json`                  |
| Story to work on | Yes      | Present options from ready stories; user picks     |
| User preferences | Auto     | Read from `agileflow.config.json` babysit settings |

## Steps

### Phase 1: Context

1. Read `docs/09-agents/status.json` — find all `ready` stories.
2. Check for stories claimed by other sessions if multi-session support is available.
3. **Present story options to the user** — ranked by: epic proximity (80%+ complete epics first), dependency-unblocking value, priority. Mark the recommended pick.
   Show: story ID, title, epic it belongs to, estimated points.
4. After user picks: claim the story if claiming is supported.

### Phase 2: Plan

For non-trivial stories (>1 file, any new pattern):

1. Enter plan mode.
2. Read 3–5 relevant files — existing patterns, affected modules, tests.
3. Write the plan: implementation steps, files to change, testing approach.
4. **Every plan for user-facing features must include:**
   ```
   Step N+1: Run tests
   Step N+2: Verify flow integrity — confirm user journeys work end-to-end
   Step N+3: Commit
   ```
5. Exit plan mode and present to user for approval.

For trivial stories (typo, config change, one-liner): skip plan mode, implement directly.

### Phase 3: Execute

1. After plan approval, start immediately — do not ask "ready to proceed?"
2. Implement directly OR spawn domain experts (see `references/mentor-decision-guide.md` for routing).
3. Track progress visibly for 3+ step tasks — check off each step as it completes.
4. Run tests after implementation.

### Phase 4: Verify and commit

After tests pass, present options in this order:

- `🔍 Run logic audit on [N] modified files (Recommended)` — catches edge cases tests miss
- `🔄 Run flow audit` — if user-facing flows were touched
- `Commit: '[type]: [summary]'` — skip audits

After audits: `Commit: '[type]: [summary]' (Recommended)`

After commit:

- Update story status to `complete`
- Release story claim
- Present options: next story in the same epic, different story, or stop

## Fallbacks

**If interactive prompts (AskUserQuestion) are unavailable:**
Present each decision point as a numbered list. Ask the user to reply with a number.

```
Which story would you like to work on?
1. US-0042: Add OAuth login (EP-0018 — 85% complete) — 8 pts (Recommended)
2. US-0051: Add rate limiting to API — 5 pts
3. US-0038: Fix password reset email — 3 pts
```

**If agent spawning (Task tool) is unavailable:**
Implement each domain inline and sequentially rather than in parallel.
State which domain you're working on as you go: "Working on the database layer now..."
