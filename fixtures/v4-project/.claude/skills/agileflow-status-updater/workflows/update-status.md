# Update Status Workflow

**Triggers:** "mark this done", "I finished", "I'm blocked on", "move to in progress", "update status", "story is complete", "mark epic active"

**Goal:** Apply a status mutation to a story or epic, show a diff, and write after confirmation.

## Inputs needed

| Input          | Required       | How to get it                                                    |
| -------------- | -------------- | ---------------------------------------------------------------- |
| Target ID      | Yes            | US-#### or EP-#### — infer from context or ask                   |
| New status     | Yes            | Usually clear from the user's words                              |
| Blocked reason | If blocking    | Ask: "What's blocking you, and what needs to happen to unblock?" |
| Owner change   | If reassigning | Ask who the new owner is                                         |

## Steps

1. **Identify the target** — extract US-#### or EP-#### from the user's message. If ambiguous (e.g., "the auth story"), read `docs/09-agents/status.json` to find the most likely match based on what's `in_progress` or recently mentioned.

2. **Validate the transition** — use `references/status-transitions.md`. If the transition is disallowed, explain why and suggest the closest valid path.

3. **Gather missing required fields** — if transitioning to `blocked`, ask for `blocked_reason` and `unblock_action`. If completing a story, prepare the `completed` timestamp.

4. **Build the diff** — show exactly what will change in both `status.json` and the story/epic file's frontmatter. Never skip this step.

5. **Present to user for confirmation:**
   - Apply this change
   - Edit the diff before applying (describe what to change)
   - Cancel

6. **After confirmation:**
   - Write `docs/09-agents/status.json`
   - Write the story/epic file frontmatter
   - If story completing: recalculate parent epic progress, update epic file
   - If epic now at 100%: suggest marking epic `COMPLETED`

7. **Confirm completion** — "US-0042 marked complete. EP-0018 is now 87% done (7/8 stories)."

## Edge cases

- **"I finished" with no ID**: read status.json, find stories in `in_progress`, ask which one
- **Blocking with no reason**: do not proceed — `blocked_reason` is required
- **Complete with incomplete children**: warn before writing
- **Unknown ID**: say so clearly, offer to list what's in progress

## Fallbacks

**If interactive prompts (AskUserQuestion) are unavailable:**
Present options as a numbered list in your response. Ask the user to reply with a number.

```
Apply this status change?
1. Yes — apply the diff above
2. No — cancel
3. Change the blocked_reason first
```
