---
name: agileflow-ideation
version: 1.0.0
category: agileflow/ideation
description: |
  Use when the user wants to generate feature ideas, discover
  opportunities, explore what to build next, or create a product brief.
  Runs multi-expert brainstorm analyzers across market, UX, growth,
  integration, and feature gap dimensions.
triggers:
  keywords:
    - what should we build
    - feature ideas
    - brainstorm
    - ideate
    - what's missing
    - product ideas
    - discovery
    - new features
    - growth ideas
    - competitive gaps
    - what to build next
  priority: 50
provides:
  agents: []
learns:
  enabled: true
  file: _learnings/ideation.yaml
  maxEntries: 30
depends:
  skills: []
  plugins: [ideation]
---

# AgileFlow Ideation

Multi-expert feature discovery. Scans the codebase, infers app
category, and generates prioritized ideas across market positioning,
UX gaps, growth mechanics, integration opportunities, and missing
core features.

## When this skill activates

- User asks "what should we build next" or "what's missing"
- User wants a product brief or feature roadmap input
- User is doing discovery work before writing stories
- User wants to find competitive gaps or growth opportunities

## Capabilities

| Command                      | What it analyzes                                        |
| ---------------------------- | ------------------------------------------------------- |
| `/agileflow:ideate`          | Full brainstorm — all analyzers                         |
| `/agileflow:ideate:features` | Missing CRUD, incomplete workflows, half-built features |
| `/agileflow:ideate:growth`   | Retention hooks, sharing, notifications, activation     |
| `/agileflow:ideate:discover` | Market-driven gaps, competitive features                |
| `/agileflow:ideate:new`      | Blank-slate idea generation                             |
| `/agileflow:ideate:brief`    | Turn ideas into a product brief                         |
| `/agileflow:ideate:history`  | Review past ideation sessions                           |

## How to guide the user

1. Ask what scope: whole product, a specific feature area, or growth only
2. Run the appropriate ideation command(s)
3. After results: filter to 3–5 high-confidence ideas
4. Offer to turn top ideas into epics via `/agileflow:epic`

## Brainstorm analyzers

The full `/agileflow:ideate` runs 5 analyzers in parallel:

- **Features** — missing core functionality
- **Growth** — engagement and retention mechanics
- **Market** — competitive and category-standard features
- **Integration** — missing third-party connections
- **UX** — friction points and missing feedback states

Then a consensus agent deduplicates and ranks by confidence × impact.

## References

Load these files when you need deeper context for the relevant task:

| File                                          | When to load                                                                              |
| --------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `references/feature-prioritization-guide.md`  | Ranking ideas from a brainstorm — RICE, ICE, value/effort matrix, Kano model              |
| `references/brainstorm-techniques.md`         | Running a brainstorm — HMW, SCAMPER, Crazy 8s, pre-mortem, dot voting                     |
| `references/user-story-patterns.md`           | Turning ideas into stories — JTBD format, persona templates, acceptance criteria patterns |
| `references/competitive-analysis-template.md` | Analyzing competitors — comparison dimensions, scoring, gap identification                |

## Workflows

Follow these step-by-step when the user initiates the matching action:

| File                    | When to follow                                                                                     |
| ----------------------- | -------------------------------------------------------------------------------------------------- |
| `workflows/ideate.md`   | User wants to generate feature ideas — runs multi-expert brainstorm and surfaces top opportunities |
| `workflows/features.md` | User wants a focused feature brainstorm for a specific area of the product                         |
