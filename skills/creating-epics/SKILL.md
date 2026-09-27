---
name: creating-epics
description: Create or refine an AgileFlow Work epic, one outcome-level body of work with its problem, outcome, scope, non-goals, and success signals. Use when the user asks to create, draft, or refine an epic, or to frame a multi-story initiative or roadmap item as an epic. Not for splitting an epic into stories, writing a single story, implementing work, or explaining what an epic is.
---

# Creating epics

An epic is a larger product outcome, not an implementation inventory. It answers: why this matters, what changes for the user, what is in and out of scope, and how we will know it worked.

## Workflow

1. **Find the workspace.** `agileflow.yaml` has `work.root` (default `docs/agile`). If Work is not set up, say so and suggest `agileflow work init` instead of inventing folders.
2. **Read product context:** `00-product/product.md`.
3. **Read the roadmap** (`01-roadmap/roadmap.md`) if it exists, and existing epics in `02-epics/`, so you refine an existing epic instead of duplicating it.
4. **Inspect repository facts** only where implementation constraints matter to the outcome (existing auth, data model, platforms). Never ask what the repository answers.
5. **Clarify only decisions that materially change the epic** (who it is for, what is in scope). Otherwise make a reasonable call and state it.
6. **Define the problem, the intended outcome, scope and non-goals, and useful success signals.** Name the epic after the outcome ("Support team collaboration"), not the work ("Change DB schema and update components").
7. **Create the epic.** With the CLI: `agileflow work new epic --title "<outcome>" [--horizon now|next|later] [--priority p0-p3]`, then fill in the body of the file it prints. Without the CLI, write the file yourself (format below).

## Epic file

`<root>/02-epics/EPIC-XXXXXXXX-<slug>.md`, where `XXXXXXXX` is 8 random characters from `0123456789ABCDEFGHJKMNPQRSTVWXYZ` (never a sequence number; check that no existing epic, story, or decision uses it):

```markdown
---
schema: 1
type: epic
id: EPIC-XXXXXXXX
title: Social authentication
status: proposed        # proposed | active | done | cancelled
horizon: now            # optional: now | next | later
priority: p1            # optional: p0 | p1 | p2 | p3
---

# Social authentication

## Problem
## Outcome
## Scope
## Non-goals
## Success
## Constraints
```

## Constraints

- Do not create stories unless the user asks; breaking an epic down is a separate step.
- Do not list stories in the epic. Stories point at their epic (`epic: EPIC-...`); the list is derived.
- No implementation plans, task lists, file inventories, estimates, or owners in the epic.
- Keep it short: a reader should grasp the outcome in a minute.

## Done when

One epic file exists (or an existing one was refined) with a clear problem, outcome, scope, non-goals, and success signals, and you have told the user its ID and path.
