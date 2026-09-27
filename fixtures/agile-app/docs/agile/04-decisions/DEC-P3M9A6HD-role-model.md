---
schema: 1
type: decision
id: DEC-P3M9A6HD
title: Owner and member are the only workspace roles
status: accepted
related:
  - EPIC-D8P2A6MW
  - EPIC-W5K8R2QT
---

# Owner and member are the only workspace roles

## Context

Invitations and membership management need a role model.

## Decision

Workspaces have two roles: owner and member. Owners manage settings and membership.

## Why

Small teams do not need fine-grained roles yet, and two roles keep every permission check simple.

## Consequences

- Features check `owner` or `member` only.
- Custom roles need a new decision.
