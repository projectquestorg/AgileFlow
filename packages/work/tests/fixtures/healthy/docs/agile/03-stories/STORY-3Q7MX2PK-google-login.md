---
schema: 1
type: story
id: STORY-3Q7MX2PK
title: Add Google sign-in
status: ready
priority: p1
epic: EPIC-7M4K2P9Q
depends_on:
  - STORY-T9K2P4VC
---

# Add Google sign-in

## Why

Creating another password adds friction before a new user can try the product.

## Outcome

A user can create or access their account using Google.

## Acceptance Criteria

- [ ] Google appears as an authentication option.
- [ ] A new Google user can create an account.
- [ ] Existing users with the same verified email are handled safely.
- [ ] Existing password login continues working.

## Constraints

- Follow DEC-4C8M2Q7K for authentication provider integration.
