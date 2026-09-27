---
schema: 1
type: story
id: STORY-R3N7M2QA
title: Let owners rename a workspace
status: ready
priority: p1
epic: EPIC-W5K8R2QT
depends_on: []
---

# Let owners rename a workspace

## Why

Teams rename projects and clients; today the workspace name is fixed at creation.

## Outcome

An owner can change the workspace's name.

## Acceptance Criteria

- [ ] An owner can rename a workspace with `renameWorkspace(store, workspaceId, { actorId, name })`.
- [ ] A member who is not an owner gets a `PermissionError`.
- [ ] Names are trimmed and must be 1 to 60 characters after trimming; other names are rejected.
- [ ] Existing behavior and tests keep passing.

## Constraints

- Keep the store in memory; no persistence changes.
