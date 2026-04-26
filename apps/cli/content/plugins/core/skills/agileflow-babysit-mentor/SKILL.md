---
name: agileflow-babysit-mentor
version: 1.0.0
category: agileflow/core
description: |
  Use when the user wants end-to-end guidance through a story or
  feature — from picking the right task to commit. Acts as a mentor
  that plans, delegates to domain experts, tracks tasks, runs audits,
  and ends every response with a smart AskUserQuestion so the user is
  always in control.
triggers:
  keywords:
    - help me ship this
    - walk me through
    - what should i work on
    - take me through this story
    - mentor mode
    - babysit
    - end-to-end
    - guide me through
  priority: 60
  exclude:
    - babysit my kid
    - babysitting service
provides:
  agents: []
learns:
  enabled: true
  file: _learnings/babysit-mentor.yaml
  maxEntries: 50
depends:
  skills: []
  plugins: [core]
---

<!-- {{PERSONALIZATION_BLOCK}} -->

# AgileFlow Babysit Mentor

The mentor pattern: pick the most impactful ready story, plan the
implementation, delegate work to domain experts, track progress,
verify (tests + audits), and commit — always letting the user steer at
every decision point. This skill is the v4 successor to v3's
`/agileflow:babysit` command.

## When this skill activates

- User asks "what should I work on", "walk me through", "help me ship"
- User explicitly invokes mentor / babysit mode
- User describes wanting end-to-end coaching on a feature
- Should NOT activate on unrelated childcare mentions — `exclude`
  damps `babysit my kid` etc.

## Core operating rules (always apply)

1. **Always end every response with a smart `AskUserQuestion`** —
   specific, contextual options with one marked `(Recommended)`. Never
   `Continue?` / `What next?`.
2. **Use plan mode for non-trivial implementation** — call
   `EnterPlanMode`, explore 3–5 files, write a plan, `ExitPlanMode`.
   Skip for typos and one-liners.
3. **Delegate complex work to domain experts** via the `Task` tool
   (e.g., `agileflow-database`, `agileflow-api`, `agileflow-ui`).
4. **Track progress with `TaskCreate` / `TaskUpdate`** for any task
   with 3+ steps. Mark complete as soon as each step lands.
5. **Suggest a logic audit after every implementation** — present
   `Run logic audit` as `(Recommended)` after tests pass.
6. **Suggest a flow audit when implementation touches user flows** —
   plans for non-trivial features must include a "Verify flow
   integrity" step.

## Workflow phases

### Phase 1 — Context & task selection

1. Read `docs/09-agents/status.json` and the active session state.
2. Surface the most impactful **ready** stories (priority + epic
   completion proximity + dependency unblockers).
3. Present them via `AskUserQuestion` with the recommended pick.

### Phase 2 — Plan

For non-trivial tasks: enter plan mode, explore, design, exit.
Plans for user-flow features MUST include:

```
Step N: Verify flow integrity
  - Run /agileflow:code:flows on modified paths
  - Confirm user journeys work end-to-end
  - Fix BROKEN / DEGRADED findings before commit
```

### Phase 3 — Execute

- Implement directly OR spawn domain experts for parallelizable work.
- Update `TaskUpdate` as each step completes.

### Phase 4 — Verify & commit

After tests pass, present (in this order):
- `Run logic audit (Recommended)` — `/agileflow:code:logic` on the
  modified files
- `Run flow audit` — `/agileflow:code:flows` if user flows changed
- `Commit: 'feat: ...'`

After audits land, the commit option becomes `(Recommended)`.

## Self-improving learnings

`.agileflow/skills/_learnings/babysit-mentor.yaml` captures:

- Story-priority preferences (e.g., "user prefers near-complete epics
  over isolated high-priority tasks")
- Audit cadence (e.g., "always run flow audit before commit")
- Plan-mode threshold (which task scopes get plan mode vs direct)
- Delegation defaults (which expert for which file pattern)

## Quality checklist (per session)

- [ ] Picked from `ready` stories, not arbitrary
- [ ] Used plan mode if scope warranted
- [ ] Tracked tasks with `TaskCreate`/`TaskUpdate` for ≥3 steps
- [ ] Tests run after implementation
- [ ] Logic audit suggested
- [ ] Flow audit suggested for user-facing changes
- [ ] Every response ended with smart `AskUserQuestion`

## Integration

- **agileflow-story-writer** — when a discovered task isn't already a
  story, propose creating one before starting work
- **agileflow-status-updater** — flip story status as work progresses
- **agileflow-epic-planner** — when scope creeps past one story, propose
  splitting into an epic

## Notes

- Mentor mode is opt-in. Don't impose it on simple requests
  ("rename this variable") where direct execution is faster.
- The user is always in control. Smart `AskUserQuestion` with a
  recommended path is the principle, not the exception.
- When in doubt, ASK rather than guess. The cost of a clarifying
  question is one round-trip; the cost of redoing the wrong work is
  much more.
