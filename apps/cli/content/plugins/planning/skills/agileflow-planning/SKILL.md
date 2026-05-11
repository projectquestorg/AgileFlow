---
name: agileflow-planning
version: 1.0.0
category: agileflow/planning
description: |
  Use when the user wants to measure, plan, or optimize their development
  process: impact analysis, metrics dashboards, velocity tracking, RPI
  workflow, roadmap analysis, automation setup, or feedback loops.
triggers:
  keywords:
    - impact analysis
    - what will this affect
    - metrics
    - velocity
    - roadmap
    - automate
    - feedback
    - measure
    - analytics
    - planning
    - rpi
    - research plan implement
  priority: 45
provides:
  agents: []
learns:
  enabled: true
  file: _learnings/planning.yaml
  maxEntries: 30
depends:
  skills: []
  plugins: [planning]
---

# AgileFlow Planning

Development process intelligence: impact analysis before making
changes, metrics tracking after, velocity measurement, and workflow
automation setup.

## When this skill activates

- User wants to know what a change will affect before making it
- User asks about team velocity, metrics, or process health
- User wants to set up automation or recurring workflows
- User is following an RPI (Research → Plan → Implement) workflow
- User wants to analyze the roadmap or prioritize work

## Capabilities

| Command                      | What it does                                             |
| ---------------------------- | -------------------------------------------------------- |
| `/agileflow:impact`          | Analyze what files/modules a proposed change will affect |
| `/agileflow:metrics`         | Dashboard of story velocity, completion rate, WIP        |
| `/agileflow:velocity`        | Track and visualize team delivery speed                  |
| `/agileflow:rpi`             | Research → Plan → Implement workflow orchestration       |
| `/agileflow:roadmap:analyze` | Analyze roadmap priorities and dependencies              |
| `/agileflow:automate`        | Set up recurring automation and scheduled tasks          |
| `/agileflow:feedback`        | Capture and process user feedback                        |
| `/agileflow:analytics`       | Event tracking and user behavior analysis                |
| `/agileflow:diagnose`        | Diagnose process bottlenecks and blockers                |
| `/agileflow:export`          | Export project data to external formats                  |
| `/agileflow:rlm`             | Retrieval-augmented memory for large document sets       |

## Impact analysis — always run before

When a story touches 3+ existing files, run `/agileflow:impact` BEFORE
entering plan mode. It reveals:

- Which modules will be affected
- What tests cover those modules
- Risk level (low / medium / high)

## RPI workflow

For unfamiliar technical territory:

1. **Research** — `/agileflow:research:ask` with full context
2. **Plan** — EnterPlanMode with research findings
3. **Implement** — delegate to domain experts

## Integration

- **agileflow-council** — convene before planning when the strategic direction is ambiguous; council resolves "what to build", planning resolves "how to sequence it"
- **agileflow-research** — use to gather technical benchmarks, dependency risk data, or competitive context that informs the impact analysis or sprint priorities
- **agileflow-story-writer** — planning produces a prioritised backlog; story-writer gives each item the structure and AC needed to enter that backlog
- **agileflow-epic-planner** — when planning reveals a large theme, route to epic-planner to break it into sequenced milestones before estimating sprint capacity
- **agileflow-status-updater** — use to reflect sprint state changes (planning → active → completed) in `status.json` as planning decisions are made
- **agileflow-babysit-mentor** — mentor is the primary consumer of the planned work; a well-scoped sprint is the input that makes mentor-guided execution efficient
- **agileflow-delivery** — delivery closes the planning loop; use planning to define the sprint and delivery to close it
- **agileflow-adr** — planning often surfaces architectural decisions (scope trade-offs, dependency choices); document them as ADRs rather than leaving them implicit
- **agileflow-retention** — use retention metrics alongside velocity data when planning engagement-focused sprints; retention informs what to prioritise, planning determines when

## References

Load these files when you need deeper context for the relevant task:

| File                                  | When to load                                                                                                   |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `references/rpi-workflow.md`          | User is about to implement something unfamiliar — Research → Plan → Implement phases, checklists, when to skip |
| `references/estimation-guide.md`      | Estimating story effort — story points vs time, Fibonacci scale, planning poker, velocity, cone of uncertainty |
| `references/sprint-planning-guide.md` | Running sprint planning — capacity formula, sprint goal template, backlog ordering, INVEST checklist           |

## Workflows

Follow these step-by-step when the user initiates the matching action:

| File                  | When to follow                                                                             |
| --------------------- | ------------------------------------------------------------------------------------------ |
| `workflows/impact.md` | User wants to understand what a change will affect before starting work                    |
| `workflows/rpi.md`    | User is starting an unfamiliar implementation — guides through Research → Plan → Implement |
