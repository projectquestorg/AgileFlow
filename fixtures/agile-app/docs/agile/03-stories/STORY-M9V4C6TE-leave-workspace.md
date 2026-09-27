---
schema: 1
type: story
id: STORY-M9V4C6TE
title: Let members leave a workspace
status: in-review
priority: p2
epic: EPIC-W5K8R2QT
depends_on: []
---

# Let members leave a workspace

## Why

People who change teams keep access to workspaces they no longer need.

## Outcome

Anyone can leave a workspace they belong to, without leaving it ownerless.

## Acceptance Criteria

- [ ] A member can leave a workspace with `leaveWorkspace(store, workspaceId, userId)`.
- [ ] Leaving removes their access immediately.
- [ ] The last owner cannot leave; they get an error explaining that they must transfer ownership first.
- [ ] Leaving is covered by automated tests.

## Constraints

- A workspace always keeps at least one owner (product principle).
