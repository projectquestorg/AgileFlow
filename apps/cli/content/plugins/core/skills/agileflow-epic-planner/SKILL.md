---
name: agileflow-epic-planner
version: 2.0.0
category: agileflow/core
description: |
  Use when a user describes a large feature, multi-sprint initiative,
  or theme that won't fit in a single user story. Breaks the work into
  scoped epics with milestones, story groupings, dependencies, and
  rough estimates; writes the epic file under docs/05-epics/.
triggers:
  keywords:
    - epic
    - initiative
    - theme
    - multi-month project
    - big feature
    - break this down
    - too big for one story
    - phased rollout
  priority: 50
  exclude:
    - epic fail
    - epic story (the genre)
    - mythological epic
provides:
  agents:
    - agileflow-epic-planner
learns:
  enabled: true
  file: _learnings/epic-planner.yaml
  maxEntries: 50
depends:
  skills: []
  plugins: [core]
---

<!-- {{PERSONALIZATION_BLOCK}} -->

# AgileFlow Epic Planner

Turns a large feature or initiative into a properly-scoped epic — with
milestones, story groupings, success metrics, and dependencies — and
writes the artifact to `docs/05-epics/`.

## When this skill activates

- User describes a feature spanning multiple sprints (>13 story points)
- A theme or initiative comes up ("we need a v2 of billing")
- An existing user-story request is clearly too large
- The user explicitly asks for an epic
- Should NOT activate for casual mentions of "epic" as an adjective
  ("epic fail", "epic novel") — `exclude` keywords damp those.

## What this skill does

1. Detect that the work is epic-scale (multiple sprints / >13 SP).
2. Ask 3–5 clarifying questions: problem, users, timeline, success
   metrics, out-of-scope.
3. Break the work into 2–4 milestones (typically MVP / Feature
   Complete / Polish), each with a logical story grouping that
   delivers user-visible value.
4. Estimate rough story-point totals per milestone.
5. Identify dependencies, risks (with mitigations), and explicit
   out-of-scope items.
6. Show the proposed epic to the user for explicit approval.
7. After approval, write `docs/05-epics/EP-####-<slug>.md`, append to
   the epics index, and link from `docs/09-agents/status.json`.

## Self-improving learnings

`.agileflow/skills/_learnings/epic-planner.yaml` records preferences:
milestone naming convention, default phase count, owner labelling,
preferred risk format. Apply on invocation; update on correction with
confidence (`high` / `medium` / `low`) per the standard pattern.

## Epic format

```markdown
# [EP-0001] Title

**Status**: PLANNING | ACTIVE | ON_HOLD | COMPLETED
**Owner**: Product Owner / Team Lead
**Start Date**: YYYY-MM-DD
**Target Completion**: YYYY-MM-DD
**Priority**: P0 | P1 | P2 | P3
**Business Value**: High | Medium | Low

## Problem Statement
[What problem does this epic solve? Why now?]

## Goals
- [Specific, measurable outcome]
- [Business or user metric to improve]

## Success Metrics
- [e.g., 20% increase in retention]
- [e.g., Reduce support tickets by 30%]

## User Stories

### Milestone 1: MVP (Target: YYYY-MM-DD)
- [ ] [US-####: Title](../06-stories/US-####.md) — 5 pts
- [ ] [US-####: Title](../06-stories/US-####.md) — 8 pts
**Total: 13 story points**

### Milestone 2: Feature Complete (Target: YYYY-MM-DD)
- [ ] [US-####: Title](../06-stories/US-####.md) — 5 pts
**Total: 5 story points**

## Dependencies
- [What blocks the start of this epic]
- [External team dependencies]

## Risks
- **Risk**: [What could go wrong] · **Impact**: [High/Med/Low] · **Mitigation**: [Plan]

## Out of Scope
- [Explicitly NOT in this epic]
- [Deferred to a future epic]

## Progress
**Overall**: X / Y stories completed (Z%)
**Last Updated**: YYYY-MM-DD
```

## Epic vs. story heuristic

**Epic** when ALL of:
- > 13 story points total
- Spans 2+ sprints
- Touches multiple owners (UI + API + DevOps)
- Has distinct phases that each deliver value

**Story** when any of:
- ≤ 13 story points
- One owner can complete it
- Single sprint
- One or two related tasks

## Milestone playbook

- **MVP** — minimal path to user-visible value; one happy path, no
  edge cases beyond the obvious.
- **Feature Complete** — all planned functionality, edge cases handled,
  documented.
- **Polish** — performance, UX refinement, accessibility, telemetry.

## Sizing guidelines

- **Small epic**: 15–30 SP (1–2 sprints)
- **Medium epic**: 30–60 SP (2–4 sprints)
- **Large epic**: 60–100 SP (4–6 sprints)
- **Initiative**: > 100 SP — split into multiple epics

## Quality checklist

- [ ] Problem statement is concrete (not "improve UX")
- [ ] At least 2 milestones, each delivering value independently
- [ ] Success metrics are measurable
- [ ] Stories are grouped, not just listed
- [ ] Dependencies identified
- [ ] Risks have mitigations
- [ ] Out-of-scope is explicit
- [ ] User approved diff before file write

## Integration

- **agileflow-story-writer** — creates the individual stories under each milestone
- **agileflow-status-updater** — flips the epic between PLANNING / ACTIVE / COMPLETED
- **agileflow-adr** — links major technical decisions made during the epic

## Notes

- Epics are living documents — update milestone targets as the team
  learns, don't over-plan up front.
- Don't author every story in detail at epic creation — write skeletons
  and let `agileflow-story-writer` fill them in as work begins.
- Celebrate milestone completions — the epic file is the canonical
  place to record what shipped.
