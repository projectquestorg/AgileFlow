# Sprint Planning Guide

**Load this when:** Running sprint planning, setting sprint goals, calculating capacity, or ordering the backlog.

## Sprint Planning Structure

```
Total time: 1 hour per sprint week (2-week sprint = 2 hours max)

Part 1 — What (30-50% of time)
  - Product owner presents sprint goal
  - Review top backlog items
  - Clarify acceptance criteria
  - Confirm stories are ready

Part 2 — How (50-70% of time)
  - Team pulls stories into sprint to capacity
  - Break stories into tasks if needed
  - Flag dependencies and blockers
  - Confirm sprint goal commitment
```

---

## Capacity Calculation

```
Raw capacity = team members × hours/day × sprint days

Adjusted capacity = raw capacity
  - planned time off (PTO, holidays)
  - ceremonies (standups, planning, retro, review)
  - planned non-feature work (on-call, support, tech debt)
  - ramp-up factor for new team members

Rule of thumb: 60–70% of raw capacity = realistic capacity
```

### Example (2-week sprint)

```
Team: 4 developers
Raw: 4 × 8h × 10 days = 320 hours

Deductions:
  Ceremonies: 4 × 2h × 10 days = 80h (standups + misc)
  Support rotation: 1 person × 0.25 FTE = 20h
  PTO: 1 person × 1 day = 8h

Adjusted: 320 - 108 = 212 dev-hours ≈ 65% utilization
Points: 212h / 7h per point ≈ 30 points
```

---

## Sprint Goal Framework

A good sprint goal answers: **What business or user outcome will we deliver this sprint?**

### Template

```
By end of sprint [N], we will [capability delivered]
so that [user/business outcome].

Key stories: [list 2–4 anchor stories]
Success metric: [how we'll know we achieved it]
```

### Examples

Good:

> "By end of Sprint 14, users can invite team members and set their roles, so teams can onboard collaborators without involving support."

Bad:

> "Complete stories PROJ-45, PROJ-47, and PROJ-51."

---

## Backlog Ordering Criteria

Score each story, order by composite score:

| Criterion           | Weight | How to score                                   |
| ------------------- | ------ | ---------------------------------------------- |
| User/business value | 30%    | 1–5 (5 = highest impact)                       |
| Urgency / deadline  | 25%    | 1–5 (5 = this sprint or miss commitment)       |
| Risk reduction      | 20%    | 1–5 (5 = critical risk if not done)            |
| Effort (inverse)    | 15%    | 5 = 1pt, 4 = 2pt, 3 = 3-5pt, 2 = 8pt, 1 = 13pt |
| Dependencies        | 10%    | 5 = unblocks others, 1 = blocked by others     |

**Weighted priority score = Σ(score × weight)**

---

## Story Readiness Checklist (INVEST)

Before pulling a story into sprint planning, verify:

| Letter | Criterion   | Check                                   |
| ------ | ----------- | --------------------------------------- |
| I      | Independent | Not blocked by another incomplete story |
| N      | Negotiable  | Scope can flex; not a fixed spec        |
| V      | Valuable    | Clear user or business value stated     |
| E      | Estimable   | Team can estimate it (enough detail)    |
| S      | Small       | Completable within one sprint           |
| T      | Testable    | Clear acceptance criteria exist         |

If any are missing — do not pull into sprint. Refine first.

---

## Sprint Commitment Rules

- Commit to the **sprint goal**, not a list of stories
- If sprint is at risk, protect the goal — negotiate scope of supporting stories
- Never add scope mid-sprint without removing equivalent scope
- Unfinished stories return to the top of the backlog for next sprint (re-estimate if needed)

---

## Common Sprint Planning Failures

| Failure                     | Symptom                                   | Fix                                                     |
| --------------------------- | ----------------------------------------- | ------------------------------------------------------- |
| Overcommitment              | Stories spill every sprint                | Use 80% of velocity, not 100%                           |
| No sprint goal              | Team has no compass when trade-offs arise | Write goal before pulling stories                       |
| Unrefined stories in sprint | Estimation errors, mid-sprint discovery   | Enforce INVEST checklist                                |
| No task breakdown           | Stories "in progress" for days            | Break into tasks <1 day each during planning            |
| Planning == assigning       | Engineers don't know context              | Stories are chosen by team, not assigned by manager     |
| Skipping retrospective data | Repeat same mistakes                      | Review previous retro action items at start of planning |

---

## Sprint Metrics to Review at Planning Start

| Metric                    | What it tells you                 |
| ------------------------- | --------------------------------- |
| Velocity (last 3 sprints) | Baseline for capacity planning    |
| Story completion rate     | Are we finishing what we start?   |
| Carryover %               | How much spills sprint to sprint? |
| Defect rate               | Are we shipping quality?          |
| Retro action item status  | Are we improving?                 |
