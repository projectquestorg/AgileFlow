# Plan Epic Workflow

**Triggers:** "create an epic", "break this down", "this is too big for one story", user describes a multi-sprint feature or initiative

**Goal:** Produce a scoped epic with milestones, story groupings, dependencies, and rough estimates, written to `docs/05-epics/`.

## Inputs needed

| Input                | Required | How to get it                                                |
| -------------------- | -------- | ------------------------------------------------------------ |
| Feature description  | Yes      | Usually in the user's message                                |
| Problem being solved | Yes      | Ask: "What user problem or business goal does this address?" |
| Success metrics      | Yes      | Ask: "How will you know it worked?"                          |
| Timeline or deadline | No       | Ask if not mentioned                                         |
| Out-of-scope         | No       | Ask: "Anything explicitly NOT in this?"                      |

## Steps

1. **Assess if it's epic-scale** — use `references/epic-sizing-guide.md`. If it's ≤13 SP and fits one sprint, suggest a story instead.

2. **Ask 3–5 clarifying questions** if key inputs are missing. Don't ask for everything — prioritize: problem statement > success metrics > out-of-scope > timeline.
   Present as: "Before I plan this out, a few questions: [list]"

3. **Find the next epic number** — read `docs/05-epics/` for the highest existing EP-#### number. Start at EP-0001 if the directory is empty or missing.

4. **Design the milestones** — usually 2–3 phases using the MVP → Feature Complete → Polish pattern. Each milestone must deliver standalone user value.

5. **Group stories per milestone** — write story skeletons (title + rough points), don't author full story files yet. Dependency order within milestones.

6. **Draft the full epic** — write inline using the epic format from the SKILL.md. Show the complete draft to the user before writing any file.

7. **Present options to the user:**
   - Write epic to `docs/05-epics/EP-####-<slug>.md`
   - Revise the draft
   - Also create the story skeletons now

8. **Write the file** only after explicit confirmation.

9. **Offer next step:** "Would you like me to create the story files for Milestone 1 now, or start working on the first story directly?"

## Output

- Epic file: `docs/05-epics/EP-####-<slug>.md`
- (Optional) Story skeleton files under `docs/06-stories/`

## Fallbacks

**If interactive prompts (AskUserQuestion) are unavailable:**
Present options as a numbered list in your response. Ask the user to reply with a number.

```
1. Write EP-0007 to docs/05-epics/EP-0007-user-notifications.md (Recommended)
2. Revise the draft — describe what to change
3. Write epic + create Milestone 1 story files
```
