# User Story File Template

**Load this reference when:** writing a `docs/06-stories/US-####-<slug>.md`
file and you need the full frontmatter + body shape.

## Frontmatter fields

| Field          | Required | Notes                                     |
| -------------- | -------- | ----------------------------------------- |
| `story_id`     | yes      | `US-####`, zero-padded to 4 digits        |
| `epic`         | optional | `EP-####` if part of an epic              |
| `title`        | yes      | Short imperative title                    |
| `owner`        | yes      | One of AG-UI / AG-API / AG-CI / AG-DEVOPS |
| `status`       | yes      | `ready` for new stories                   |
| `estimate`     | yes      | Fibonacci: 1, 2, 3, 5, 8, 13              |
| `priority`     | yes      | P0 / P1 / P2 / P3                         |
| `created`      | yes      | ISO date (YYYY-MM-DD)                     |
| `updated`      | yes      | ISO date (YYYY-MM-DD)                     |
| `dependencies` | optional | Array of US-#### ids                      |

## Body sections (in order)

1. **Description** — `As a <role>, I want <capability>, so that <benefit>.`
2. **Acceptance Criteria** — 2–5 AC blocks, each Given/When/Then.
3. **Technical Notes** — implementation hints, libraries, constraints.
4. **Testing Strategy** — what gets unit / integration / e2e tested.
5. **Definition of Done** — checklist of merge-blocking items.

## Full example

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
