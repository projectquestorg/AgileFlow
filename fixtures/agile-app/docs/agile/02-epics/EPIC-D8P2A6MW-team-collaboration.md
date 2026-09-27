---
schema: 1
type: epic
id: EPIC-D8P2A6MW
title: Team collaboration
status: proposed
horizon: next
priority: p2
---

# Team collaboration

## Problem

Owners can only add people who already have an account, by user id. Teams cannot bring new people in themselves.

## Outcome

Owners can invite people into their workspace by email, and invitees can join with the right role.

## Scope

- inviting people by email
- accepting or declining an invitation
- choosing the invitee's role (owner or member)
- seeing and revoking pending invitations

## Non-goals

- enterprise SSO or SCIM provisioning
- public join links

## Success

An owner can bring a new teammate into the workspace without contacting support.

## Constraints

Follow DEC-P3M9A6HD: owner and member are the only roles.
