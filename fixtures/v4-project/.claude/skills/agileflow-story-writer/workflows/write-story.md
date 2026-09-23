# Workflow: Write a User Story

Follow these steps when the user describes a feature or task and wants a story written.

---

## Step 1: Assess scope

Before writing, confirm the request is story-scale (≤ 13 story points, one owner, single sprint).

**If too large:** Say so, and suggest using `agileflow-epic-planner` instead. Do not proceed.

**If scope is unclear:** Ask one clarifying question: "Is this a single focused task, or does it involve multiple moving parts?"

---

## Step 2: Load context

Load these files to orient yourself (do NOT show the user that you're loading them):

- `docs/09-agents/status.json` — find the next available US-#### number
- `docs/06-stories/` — scan recent story files to match naming and format conventions
- `references/story-template.md` — the canonical frontmatter + body shape
- `references/estimation-reference.md` — owner codes, priority scale, estimate Fibonacci
- Learnings file (if it exists) — apply any project-specific preferences

---

## Step 3: Ask clarifying questions (if needed)

Ask only what you don't know. Skip questions whose answers are obvious from context.

**Required to know:**

- Who is the target user (role)?
- What do they want to do?
- Why (what value does it deliver)?

**Nice to have (ask if unclear):**

- Any specific acceptance criteria the user has in mind?
- Which area of the codebase / service is involved (helps assign owner)?

Ask max 3 questions at once. If the user gave enough context, skip straight to drafting.

---

## Step 4: Draft the story

Structure the draft using `references/story-template.md`:

```markdown
---
id: US-####
title: <imperative-phrase title>
owner: AG-UI | AG-API | AG-DEVOPS | AG-CI | AG-REFACTOR | AG-SECURITY
status: ready
priority: P0 | P1 | P2 | P3
estimate: 1 | 2 | 3 | 5 | 8 | 13
sprint: <current or next>
created: YYYY-MM-DD
updated: YYYY-MM-DD
epic: EP-#### (if applicable)
---

## User Story

As a **<role>**,
I want to **<action>**,
so that **<outcome>**.

## Acceptance Criteria

- [ ] **Given** <context>, **When** <action>, **Then** <outcome>
- [ ] **Given** <context>, **When** <action>, **Then** <outcome>
- [ ] (add edge cases / error paths)

## Technical Notes

- <architecture note, dependency, or constraint>
- <suggested approach or existing pattern to follow>

## Out of Scope

- <what this story deliberately does NOT cover>
```

**Estimation guide:** Use `references/estimation-reference.md`. Default to the middle of the range when uncertain. If ≥ 8 points, add a note suggesting the story might be split.

---

## Step 5: Show diff and wait for approval

Present the story as a fenced code block. Say:

> "Here's the proposed story. Confirm **YES** to write the file, or suggest changes."

**Do NOT write any file until the user says YES.**

---

## Step 6: Write files (after YES)

1. Write `docs/06-stories/US-####-<slug>.md` with the approved content.
2. Add the story to `docs/09-agents/status.json`:
   ```json
   "US-####": {
     "title": "...",
     "status": "ready",
     "owner": "AG-...",
     "priority": "P1",
     "estimate": 5,
     "created": "YYYY-MM-DD",
     "updated": "YYYY-MM-DD",
     "epic": "EP-####"
   }
   ```
3. If the epic exists, add the story reference to the epic's story list.

---

## Step 7: Update learnings (if corrected)

If the user corrected the story format, owner assignment, or any preference:

Append to the learnings file:

```yaml
- observation: <what the user corrected or preferred>
  confidence: high
  source: correction
```

---

## Done

Confirm: "Story US-#### written to `docs/06-stories/US-####-<slug>.md` and added to status.json."
