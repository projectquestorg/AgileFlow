# Status Transitions Reference

**Load this when:** validating a status change request, explaining allowed
transitions, or deciding if a transition needs special confirmation.

## Story state machine

```
          ┌─────────────────────────────────────┐
          │                                     ▼
 ready ──► in_progress ──► review ──► complete
   ▲           │               │
   │           ▼               ▼
   └──────── blocked ◄─────────┘
```

| From          | To            | When                          | Special handling                                |
| ------------- | ------------- | ----------------------------- | ----------------------------------------------- |
| `ready`       | `in_progress` | Someone picks it up           | Capture owner                                   |
| `in_progress` | `review`      | Tests pass, ready for review  | Optional: capture reviewer                      |
| `review`      | `complete`    | Reviewer signs off            | Set `completed` timestamp; update parent epic % |
| `*`           | `blocked`     | Any forward state hits a wall | Require `blocked_reason` + `unblock_action`     |
| `blocked`     | (previous)    | Blocker resolved              | Resume to the state it was in before blocking   |
| `*`           | `ready`       | Reset / rollback              | Ask for confirmation — this is unusual          |
| `in_progress` | `complete`    | Skip review (solo projects)   | Warn that review was skipped                    |

## Epic state machine

```
PLANNING ──► ACTIVE ──► COMPLETED
                │
                ▼
             ON_HOLD ──► ACTIVE
```

| From       | To          | Trigger                            | Special handling                               |
| ---------- | ----------- | ---------------------------------- | ---------------------------------------------- |
| `PLANNING` | `ACTIVE`    | First story moves to `in_progress` | Auto-suggest or explicit                       |
| `ACTIVE`   | `ON_HOLD`   | Team pause, competing priority     | Require reason                                 |
| `ON_HOLD`  | `ACTIVE`    | Work resumes                       | Clear the hold reason                          |
| `ACTIVE`   | `COMPLETED` | All stories `complete`             | Confirm — verify all stories are actually done |

## Transitions that need explicit confirmation

These are allowed but unusual — always show the change and ask YES/NO:

| Transition                                          | Why unusual                      |
| --------------------------------------------------- | -------------------------------- |
| Any state → `ready`                                 | Rollback — work may be lost      |
| `review` → `in_progress`                            | Review rejected — capture reason |
| `complete` → anything                               | Reopening completed work         |
| Epic `ACTIVE` → `COMPLETED` with incomplete stories | Data integrity risk              |

## Required fields per transition

| Transition            | Required field                                       |
| --------------------- | ---------------------------------------------------- |
| Any → `blocked`       | `blocked_reason` (string), `unblock_action` (string) |
| `blocked` → previous  | Clear `blocked_reason`                               |
| Any → `complete`      | `completed` (ISO timestamp)                          |
| Epic → `ON_HOLD`      | `hold_reason`                                        |
| Any assignment change | `owner` (team ID or name)                            |

## Progress calculation (epic)

When a story completes, recalculate the parent epic's progress:

```
progress = (completed_stories / total_stories) * 100
```

Update the epic file's `Progress` section and the `updated` timestamp.

Auto-trigger `COMPLETED` suggestion when `progress = 100%` and prompt user to confirm.

## Diff format to show before every write

Always show before/after for both `status.json` and the story/epic frontmatter:

```diff
docs/09-agents/status.json
- "US-0042": { "status": "ready", "updated": "2026-04-25" }
+ "US-0042": { "status": "in_progress", "updated": "2026-04-26" }

docs/06-stories/US-0042.md (frontmatter)
- status: ready
+ status: in_progress
+ updated: 2026-04-26
```
