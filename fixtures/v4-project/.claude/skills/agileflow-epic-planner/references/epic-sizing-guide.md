# Epic Sizing Guide

**Load this when:** deciding if work needs an epic vs a story, sizing milestones,
or estimating an epic's total effort.

## Epic vs story decision

| Signal           | Epic                                   | Story              |
| ---------------- | -------------------------------------- | ------------------ |
| Estimated effort | > 13 story points                      | ≤ 13 story points  |
| Spans sprints    | 2+ sprints                             | 1 sprint           |
| Owners           | Multiple (UI + API + DevOps)           | One owner          |
| Phases           | Distinct phases, each delivering value | Single deliverable |
| User value       | Multiple checkpoints                   | One outcome        |

**When in doubt:** if you can't describe the whole thing in one user story sentence ("As a [user] I want [X] so that [Y]"), it's an epic.

## Milestone playbook

| Phase                | What ships                                           | Acceptance bar                            |
| -------------------- | ---------------------------------------------------- | ----------------------------------------- |
| **MVP**              | One happy path, core user value, no edge cases       | A real user can complete the primary flow |
| **Feature Complete** | All planned functionality, edge cases, documented    | QA can sign off                           |
| **Polish**           | Performance, UX refinement, accessibility, telemetry | Metrics and error rates within targets    |

Not every epic needs all three phases — small epics often go MVP → Feature Complete only.

## Sizing benchmarks

| Epic size  | Story points | Sprints (2-week) | Team size                 |
| ---------- | ------------ | ---------------- | ------------------------- |
| Small      | 15–30 SP     | 1–2              | 1 engineer                |
| Medium     | 30–60 SP     | 2–4              | 1–2 engineers             |
| Large      | 60–100 SP    | 4–6              | 2–3 engineers             |
| Initiative | > 100 SP     | 6+               | Split into multiple epics |

If an epic exceeds 100 SP at planning time, split it. Epics that large never finish as planned.

## Story grouping within milestones

Group stories by the layer they touch, then by delivery order:

```
Milestone 1: MVP
  Infrastructure layer (must go first — others depend on it)
    US-0041: Create sessions table migration — 3 pts
    US-0042: Implement session token service — 5 pts
  Feature layer
    US-0043: Add login endpoint — 5 pts
  Total: 13 pts
```

## Dependencies: how to surface them

For each epic, identify:

- **Blocking epics**: what must complete before this can start
- **Blocking stories within the epic**: stories that must land before others
- **External blockers**: third-party API access, design assets, legal review

Write dependencies as explicit statements: "Blocked by EP-0010 (auth infrastructure)" not "depends on auth."

## Risk categories

| Category                   | Examples                                       | Mitigation                                     |
| -------------------------- | ---------------------------------------------- | ---------------------------------------------- |
| **Technical unknowns**     | First time using a library, unfamiliar pattern | Spike story in Milestone 1                     |
| **External dependency**    | Waiting on another team, third-party API       | Early integration test, fallback plan          |
| **Scope creep**            | "While we're here..."                          | Explicit out-of-scope section                  |
| **Estimation uncertainty** | >30% of stories are novel                      | Build in buffer; re-estimate after Milestone 1 |

## Out-of-scope: what to include

Explicitly list what this epic does NOT cover. This prevents scope creep and sets expectations.

Good out-of-scope examples:

- "Mobile app — web only for this epic"
- "Admin dashboard — tracked separately in EP-0022"
- "Multi-language support — deferred to v2"
- "Offline mode — requires separate infrastructure investment"
