---
name: agileflow-story-writer
version: 2.0.0
category: agileflow/core
description: |
  Use when a user describes a feature, requirement, or bug in natural
  language and needs a properly-formatted user story with acceptance
  criteria. Creates a US-#### story file in docs/06-stories/ and
  updates the status.json index.
triggers:
  keywords:
    - user story
    - story for
    - acceptance criteria
    - as a user
    - as a user, i want
    - feature request
    - implement this
  priority: 50
  exclude:
    - story time
    - bedtime story
    - tell me a story
provides:
  agents:
    - agileflow-story-writer
learns:
  enabled: true
  file: _learnings/story-writer.yaml
  maxEntries: 50
depends:
  skills: []
  plugins: [core]
---

<!-- {{PERSONALIZATION_BLOCK}} -->

# AgileFlow Story Writer

Converts user feature descriptions into properly-formatted user stories
with `Given/When/Then` acceptance criteria, owner assignment, priority,
and Fibonacci estimates.

## When this skill activates

- User describes how a feature should behave (`"as a user, I want..."`)
- Discussing features to build or tasks to implement
- Requesting a new user story or asking to format an idea as one
- The skill should NOT activate for casual conversation about
  storytelling, books, or movies — the `exclude` keywords damp those.

## What this skill does

1. Extract the user story components (who / what / why) from the
   description.
2. Determine metadata: owner, priority (P0–P3), estimate (Fibonacci),
   epic linkage.
3. Generate 2–5 acceptance criteria in Given/When/Then format covering
   the happy path, errors, and edge cases.
4. Show the proposed story to the user and wait for explicit approval
   before writing the file ("diff first; YES/NO").
5. After approval, write `docs/06-stories/US-####-<slug>.md`, update the
   `docs/06-stories/README.md` index, append to
   `docs/09-agents/status.json` with `status: ready`, and create a test
   stub at `docs/07-testing/test-cases/US-####.md`.

## Self-improving learnings

The skill maintains preferences in
`.agileflow/skills/_learnings/story-writer.yaml`. On each invocation:

1. Read the learnings file if it exists; apply preferences (priority
   format, estimate scale, owner conventions, AC style).
2. Follow conventions and avoid anti-patterns recorded there.
3. On user correction (e.g. "use P0–P3 not HIGH/MEDIUM"), determine
   confidence — `high` for explicit corrections, `medium` for approved
   patterns, `low` for observations — and append the signal to the
   learnings file. Continue with the corrected approach.

## Story file format

```markdown
---
story_id: US-0042
epic: EP-0001
title: User Login Form
owner: AG-UI
status: ready
estimate: 5
priority: P1
created: 2026-04-26
updated: 2026-04-26
dependencies: [US-0040]
---

## Description

As a user,
I want to log in with my email and password,
So that I can access my account and personalized features.

## Acceptance Criteria

### AC1: Successful Login
**Given** a registered user with valid credentials
**When** user enters email and password
**Then** user is redirected to dashboard with welcome message

### AC2: Invalid Credentials
**Given** user enters incorrect password
**When** user submits login form
**Then** error message "Invalid email or password" is displayed

### AC3: Input Validation
**Given** user submits empty email field
**When** user clicks "Login" button
**Then** validation error "Email is required" is shown

## Technical Notes

- Use JWT authentication with 24h expiration
- Store tokens in httpOnly cookies
- Implement rate limiting (5 attempts per 15 minutes)
- Hash passwords with bcrypt

## Testing Strategy

- Unit tests for form validation logic
- Integration tests for authentication flow
- E2E test for full login journey
- Test stub: docs/07-testing/test-cases/US-0042.md

## Definition of Done

- [ ] Code implemented and reviewed
- [ ] Tests written and passing
- [ ] Documentation updated
- [ ] Deployed to staging
- [ ] Acceptance criteria validated
```

## Owner determination

- **AG-UI** — Frontend components, styling, user interactions, accessibility
- **AG-API** — Backend services, APIs, data models, business logic
- **AG-CI** — CI/CD pipelines, testing infrastructure, quality gates
- **AG-DEVOPS** — Infrastructure, deployment, monitoring, automation

If the work spans multiple owners, pick the **primary** owner and note
others under Technical Notes.

## Story-point estimation (Fibonacci)

- **1** — Trivial (text update, typo, config tweak)
- **2** — Simple (add form field, new button, basic validation)
- **3** — Small (basic CRUD endpoint, simple component)
- **5** — Medium (authentication flow, data model)
- **8** — Large (payment integration, complex UI workflow)
- **13** — Very large — **suggest splitting** into multiple stories or
  promoting to an epic

## Priority guidelines

- **P0 (Critical)** — Blocking users, security, data loss, prod outage
- **P1 (High)** — Major features, important fixes, user-facing improvements
- **P2 (Medium)** — Nice-to-have, minor improvements, enhancements
- **P3 (Low)** — Tech debt, cleanup, future enhancements, optimizations

## Quality checklist

- [ ] Loaded learnings file (if exists) and applied preferences
- [ ] Story follows "As a... I want... So that..." format
- [ ] At least 2 acceptance criteria with Given/When/Then
- [ ] Owner reflects the primary work area
- [ ] Priority reflects urgency and impact (P0–P3)
- [ ] Estimate is in Fibonacci sequence (1,2,3,5,8,13)
- [ ] File name matches pattern: `US-####-descriptive-name.md`
- [ ] Technical notes capture implementation details
- [ ] Definition of Done is comprehensive
- [ ] Story added to `docs/09-agents/status.json` with `status: ready`
- [ ] Test stub created
- [ ] If user corrected output, learnings file updated

## Integration

- **agileflow-epic-planner** — stories are part of epics
- **agileflow-sprint-planner** — stories are selected for sprints
- **agileflow-acceptance-criteria** — strengthen AC sections
- **agileflow-adr** — reference architectural decisions in technical notes

## Notes

- If the user description is vague, ask 1–2 clarifying questions before
  generating the story.
- Use the next available story number based on existing files in
  `docs/06-stories/` (zero-pad to 4 digits: `US-0042`).
- If the estimate would exceed 13 points, suggest splitting before
  writing the file.
- Always show the proposed story diff and wait for explicit `YES` /
  `NO` before writing.
