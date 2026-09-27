---
name: writing-stories
description: Write AgileFlow Work stories, splitting an epic or requirement into small vertical-slice stories with observable acceptance criteria and only real dependencies, or writing or refining a single story for a bug or small change. Use when the user asks to break an epic into stories, or to write, split, or refine stories or their acceptance criteria. Not for creating epics, implementing or fixing the work itself, or judging whether a story is done.
---

# Writing stories

A story is an independently actionable slice of work with a clear outcome and observable acceptance criteria. Stories optimize product flow, not agent file boundaries.

## Workflow

1. **Find the workspace** (`work.root` in `agileflow.yaml`, default `docs/agile`) and **read the epic or requirement**, plus `00-product/product.md`, relevant decisions in `04-decisions/`, and existing stories for that epic (`agileflow work show <epic-id>`, or files in `03-stories/` whose `epic:` matches) so you do not duplicate them.
2. **Inspect repository context when needed.** Never ask what the repository answers (framework, existing flows). Ask only about real unresolved product choices, for example whether existing users with the same email link automatically or must confirm.
3. **Find meaningful vertical slices.** Prefer "User can sign in with Google" over "Create Google button component". A good story may span database, API, and UI.
4. **Avoid implementation-task decomposition.** Do not create "create table", "add route", "add button" stories that deliver nothing on their own.
5. **Keep each story understandable on its own:** why, outcome, acceptance criteria, constraints.
6. **Write acceptance criteria** as observable completion, as unchecked Markdown checkboxes: `- [ ] A new Google user can create an account.` Not implementation steps.
7. **Identify real dependencies only:** `depends_on` means "this story cannot reasonably finish before that one", not "related".
8. **Create the stories.** With the CLI: `agileflow work new story --epic <epic-id> --title "..." [--priority p1] [--depends-on <id>]`, then fill in each body. Without the CLI, write the files yourself (format below). Small standalone work needs no epic.

## Story file

`<root>/03-stories/STORY-XXXXXXXX-<slug>.md`, `XXXXXXXX` = 8 random characters from `0123456789ABCDEFGHJKMNPQRSTVWXYZ` (check that no existing epic, story, or decision uses it):

```markdown
---
schema: 1
type: story
id: STORY-XXXXXXXX
title: Add Google sign-in
status: backlog          # backlog | ready | in-progress | in-review | blocked | done | cancelled
priority: p1             # optional
epic: EPIC-XXXXXXXX      # optional
depends_on: []
---

# Add Google sign-in

## Why
## Outcome
## Acceptance Criteria

- [ ] ...

## Constraints
```

## Constraints

- Mark a story `ready` only when an agent could begin without a major product decision: outcome understood, criteria useful, main constraints known, dependencies clear. Otherwise leave it in `backlog`.
- Do not add fields such as assignee, points, sprint, or estimates, and do not list stories in the epic file.
- No implementation plans, task files, or notes files.

## Done when

Each slice exists as a story file with an outcome, observable unchecked acceptance criteria, and only real dependencies; you have listed the new story IDs and titles for the user.
