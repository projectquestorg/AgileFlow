---
name: agileflow-status-updater
version: 1.0.0
category: agileflow/core
description: |
  Use when a user reports progress on a story or epic — finishing
  work, blocking, picking up — and wants the agile state updated.
  Mutates docs/09-agents/status.json + the relevant story / epic
  files in place, with a diff shown for explicit approval.
triggers:
  keywords:
    - mark this story
    - mark this epic
    - update the status
    - i finished
    - i'm blocked on
    - move to in progress
    - status to ready
    - status to complete
    - story status
    - epic status
  priority: 50
  exclude:
    - status quo
    - status report (use `agileflow-story-writer` for new artifacts)
provides:
  agents: []
learns:
  enabled: false
depends:
  skills: []
  plugins: [core]
---

<!-- {{PERSONALIZATION_BLOCK}} -->

# AgileFlow Status Updater

Single source of truth for the project's agile state lives at
`docs/09-agents/status.json` (epics, stories, owner, status,
timestamps). This skill applies status mutations from natural-language
progress updates without the user editing JSON by hand.

## When this skill activates

- User says they've started, blocked, finished, or paused a story
- User wants to flip an epic between PLANNING / ACTIVE / COMPLETED
- User asks for a story or epic to be reassigned
- User wants to roll back a status change
- Should NOT activate for unrelated mentions of "status" (`status quo`,
  Slack "status emoji") — `exclude` damps those.

## What this skill does

1. Identify the target: which story (US-####) or epic (EP-####), and
   which fields are changing (status, owner, blocked_reason, completed,
   notes).
2. Validate the transition against the workflow:
   - Stories: `ready` → `in_progress` → `review` → `complete` (or
     `blocked` from any forward state, returning to where it left off)
   - Epics: `PLANNING` → `ACTIVE` → `COMPLETED` (with `ON_HOLD` as a
     pause state)
3. Show a JSON diff (before / after) of the proposed change.
4. Wait for explicit `YES` / `NO` confirmation.
5. After approval:
   - Update `docs/09-agents/status.json` in place
   - Update the frontmatter of the story/epic file (status,
     `updated:` timestamp)
   - If completing: set `completed:` timestamp, percentage on the parent
     epic, append to a recent-completions section if one exists
   - If blocking: write a `blocked_reason` and an `unblock_action`

## Allowed transitions

### Story states

| From | To | Notes |
|---|---|---|
| `ready` | `in_progress` | when someone picks it up |
| `in_progress` | `review` | tests pass, ready for review |
| `review` | `complete` | reviewer signs off |
| `*` | `blocked` | with required `blocked_reason` |
| `blocked` | (previous) | resume on unblock |
| `*` | `ready` | reset / rollback (asks for confirmation) |

### Epic states

| From | To | Notes |
|---|---|---|
| `PLANNING` | `ACTIVE` | first story moves to `in_progress` |
| `ACTIVE` | `ON_HOLD` | pause; record reason |
| `ON_HOLD` | `ACTIVE` | resume |
| `ACTIVE` | `COMPLETED` | all stories `complete`; auto-prompt confirm |

## Diff format (shown before write)

```diff
docs/09-agents/status.json
- "US-0042": { "status": "ready", "owner": "AG-UI", "updated": "2026-04-25" }
+ "US-0042": { "status": "in_progress", "owner": "AG-UI", "updated": "2026-04-26" }

docs/06-stories/US-0042-login-form.md (frontmatter)
- status: ready
- updated: 2026-04-25
+ status: in_progress
+ updated: 2026-04-26
```

## Quality checklist

- [ ] Target id (US-#### / EP-####) is unambiguous
- [ ] Transition is in the allowed table above
- [ ] If `blocked`, `blocked_reason` captured
- [ ] Diff shown before any write
- [ ] User confirmed YES
- [ ] Parent epic progress recalculated when a story completes

## Integration

- **agileflow-story-writer** — creates new stories (status = ready)
- **agileflow-epic-planner** — creates new epics (status = PLANNING)
- **agileflow-babysit-mentor** — drives status changes during the
  end-to-end workflow

## Notes

- Always show the diff first. Status changes are persisted to a
  shared file; silent edits are how trust dies.
- When a transition is unusual (e.g., `complete` → `ready`), ask for
  confirmation explicitly rather than just showing the diff.
- Roll back any disallowed transition with a one-line explanation
  ("`complete` → `in_progress` isn't allowed; reset to `ready` first").
