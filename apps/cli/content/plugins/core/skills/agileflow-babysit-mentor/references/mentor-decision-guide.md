# Mentor Decision Guide

**Load this when:** deciding how deeply to guide the user, choosing between
doing work directly vs delegating, or calibrating the level of interaction.

## When to use mentor mode vs just answering

| Request type                   | Approach                                               |
| ------------------------------ | ------------------------------------------------------ |
| "Help me ship US-0042"         | Full mentor mode — plan, delegate, track, verify       |
| "Walk me through this feature" | Full mentor mode                                       |
| "What should I work on?"       | Story selection + mentor mode for chosen story         |
| "Fix this bug in auth.js"      | Do it directly, no mentor overhead                     |
| "Rename this function"         | Do it directly                                         |
| "Is this approach correct?"    | Answer the question, offer to proceed with mentor mode |

## Calibrating interaction depth by scale

| Project scale             | Planning depth                    | Delegation    | Audits                  |
| ------------------------- | --------------------------------- | ------------- | ----------------------- |
| Micro (solo, < 5 stories) | Skip plan mode for most tasks     | 2 experts max | Logic only              |
| Small (1 sprint)          | Light planning, skip for familiar | 3 experts max | Logic + flow            |
| Medium (2–4 sprints)      | Plan mode for non-trivial         | 4 experts     | Logic + flow + security |
| Large (4+ sprints)        | Always plan mode                  | 5 experts     | All relevant audits     |
| Enterprise (team)         | Plan + council for arch decisions | Full panel    | Strict gates            |

User preferences override this — if configured as `light` or `minimal`, respect that.

## Choosing the right expert to delegate to

| Work involves...                     | Delegate to                      |
| ------------------------------------ | -------------------------------- |
| Database schema, migrations, queries | `agileflow-database`             |
| API endpoints, business logic        | `agileflow-api`                  |
| UI components, styling               | `agileflow-ui`                   |
| Test strategy, coverage              | `agileflow-testing`              |
| Security, auth                       | `agileflow-security`             |
| 2+ domains                           | `agileflow-orchestrator`         |
| Architecture decision                | Council first, then implementors |

## When to suggest audits

After any implementation, present audits in this order:

1. **Logic audit** — always, after tests pass (`Recommended`)
2. **Flow audit** — when user-facing flows changed (forms, navigation, auth, CRUD)
3. **Security audit** — when auth, APIs, user input, or sensitive data touched
4. **Performance audit** — when DB queries, rendering, or large data touched
5. **Accessibility audit** — when UI components changed
6. **Legal audit** — when data collection, consent, or compliance code changed

`auditAll` mode: suggest all of the above after every implementation regardless of context.

## Decision points that require user input (always ask)

- Which story to work on (never pick silently)
- Plan approval before implementation
- Commit message and timing
- Whether to fix P0/P1 audit findings now or defer

## Decision points to handle autonomously (don't ask)

- Reading files to understand context
- Spawning experts after plan approval
- Checking git status
- Running tests after implementation

## Next-step option quality bar

**Bad options:**

- "Continue" / "Keep going"
- "What would you like to do?"
- "Proceed with implementation?"

**Good options:**

- "Run npm test on the 3 changed files (Recommended)"
- "Commit: 'feat: add OAuth login flow'"
- "Run logic audit on auth.js, session.js (Recommended)"
- "Continue to US-0044 (EP-0018 is 85% complete)"
