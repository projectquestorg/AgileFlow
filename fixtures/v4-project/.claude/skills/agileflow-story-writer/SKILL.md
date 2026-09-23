---
name: agileflow-story-writer
version: 2.0.0
category: agileflow/core
description: |
  Use when a user describes a feature, requirement, or bug in natural
  language and needs a properly-formatted user story with acceptance
  criteria. Creates a US-#### story file in docs/06-stories/ and
  updates the status.json index.
triggers:
  keywords:
    - user story
    - story for
    - acceptance criteria
    - as a user
    - as a user, i want
    - feature request
    - implement this
  priority: 50
  exclude:
    - story time
    - bedtime story
    - tell me a story
provides:
  agents:
    - agileflow-story-writer
learns:
  enabled: true
  file: _learnings/story-writer.yaml
  maxEntries: 50
depends:
  skills: []
  plugins: [core]
---

# AgileFlow Story Writer

Converts user feature descriptions into properly-formatted user stories
with `Given/When/Then` acceptance criteria, owner assignment, priority,
and Fibonacci estimates.

## When this skill activates

- User describes how a feature should behave (`"as a user, I want..."`)
- Discussing features to build or tasks to implement
- Requesting a new user story or asking to format an idea as one

The `exclude` keywords damp casual storytelling conversations
(books, movies, "story time").

## Workflow

1. Extract `who / what / why` from the user's description.
2. Determine metadata: owner, priority, estimate, epic linkage.
   See **`estimation-reference.md`** for the canonical scales.
3. Generate 2–5 acceptance criteria in Given/When/Then format covering
   happy path, errors, and edge cases.
4. Show the proposed story to the user and wait for explicit approval
   ("diff first; YES/NO"). If the description is vague, ask 1–2
   clarifying questions before generating.
5. After approval, write `docs/06-stories/US-####-<slug>.md` using the
   template in **`story-template.md`**, then:
   - Update `docs/06-stories/README.md` index
   - Append to `docs/09-agents/status.json` with `status: ready`
   - Create test stub at `docs/07-testing/test-cases/US-####.md`

## Self-improving learnings

The skill maintains preferences in
`.agileflow/skills/_learnings/story-writer.yaml`. On each invocation:

1. Read the learnings file if it exists; apply preferences (priority
   format, estimate scale, owner conventions, AC style).
2. Follow conventions and avoid anti-patterns recorded there.
3. On user correction (e.g. "use P0–P3 not HIGH/MEDIUM"), determine
   confidence — `high` for explicit corrections, `medium` for approved
   patterns, `low` for observations — and append the signal to the
   learnings file. Continue with the corrected approach.

## Companion references

| File                      | Load when                                                           |
| ------------------------- | ------------------------------------------------------------------- |
| `story-template.md`       | Writing the story file — full frontmatter + body shape with example |
| `estimation-reference.md` | Assigning owner / estimate / priority — canonical scales            |

## Quality checklist

- [ ] Loaded learnings file (if exists) and applied preferences
- [ ] Story follows "As a... I want... So that..." format
- [ ] At least 2 acceptance criteria with Given/When/Then
- [ ] Owner reflects the primary work area
- [ ] Priority reflects urgency and impact (P0–P3)
- [ ] Estimate is in Fibonacci sequence (1, 2, 3, 5, 8, 13)
- [ ] File name matches pattern: `US-####-descriptive-name.md`
- [ ] Story added to `docs/09-agents/status.json` with `status: ready`
- [ ] Test stub created
- [ ] If user corrected output, learnings file updated

## Notes

- Use the next available story number based on existing files in
  `docs/06-stories/` (zero-pad to 4 digits: `US-0042`).
- If the estimate would exceed 13 points, suggest splitting before
  writing the file.
- Always show the proposed story diff and wait for explicit `YES` /
  `NO` before writing.

## Integration

- **agileflow-ideation** — ideation produces feature ideas; story-writer gives them the AC and structure needed to enter the backlog
- **agileflow-epic-planner** — when a story grows beyond one sprint of effort, suggest splitting via epic-planner before writing individual stories
- **agileflow-status-updater** — after writing a story, flip its status to `ready` in `status.json` via status-updater
- **agileflow-adr** — if writing a story reveals a technology or architecture decision, spawn adr to document it before implementation begins
- **agileflow-planning** — use for estimation guidance, sprint capacity checks, or INVEST criteria validation before finalising a story
- **agileflow-babysit-mentor** — babysit-mentor is the primary consumer of stories produced here; a well-written story is the input that makes mentor-guided execution reliable
- **agileflow-council** — convene before writing a story if the scope or approach is genuinely ambiguous and a multi-perspective input would sharpen the AC

## Workflows

Follow these step-by-step when the user initiates the matching action:

| File                       | When to follow                                                                             |
| -------------------------- | ------------------------------------------------------------------------------------------ |
| `workflows/write-story.md` | User wants a new story written — scope check, clarifying questions, draft, approval, write |
