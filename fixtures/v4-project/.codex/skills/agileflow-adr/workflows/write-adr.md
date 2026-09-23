# Write ADR Workflow

**Triggers:** "record this decision", "write an ADR", "which should we use", "trade-off between X and Y", user compares two technical options

**Goal:** Capture a technical or architectural decision as a formal ADR in `docs/03-decisions/`.

## Inputs needed

| Input              | Required | How to get it                                                             |
| ------------------ | -------- | ------------------------------------------------------------------------- |
| Decision topic     | Yes      | Usually clear from context; ask if ambiguous                              |
| Options considered | Yes      | At least 2 — ask if only 1 given ("what did you consider instead?")       |
| Decision drivers   | Yes      | Ask: "What matters most — performance, cost, simplicity, team expertise?" |
| Chosen option      | Yes      | May already be decided, or may still be open                              |
| Status             | Yes      | `Proposed` if still debating, `Accepted` if decided                       |

## Steps

1. **Detect scope** — is this a real architecture decision or a casual question?
   - Real: compares libraries, frameworks, infra, patterns with real tradeoffs
   - Casual: "which is better, tabs or spaces?" → skip the ADR, just answer

2. **Gather missing pieces** — ask 1-3 targeted questions if inputs are incomplete.
   Present as: "To write this ADR I need a couple things: [questions]"
   Don't ask for everything at once — prioritize the most critical gaps.

3. **Find the next ADR number** — read `docs/03-decisions/` to find the highest existing number.
   If the directory doesn't exist, create it and start at 0001.

4. **Draft the ADR** — write it inline using the MADR format from `references/madr-format-guide.md`.
   Show the full draft to the user before writing any file.

5. **Present options to the user:**
   - Write this ADR to `docs/03-decisions/ADR-####-<slug>.md`
   - Revise the draft (describe what to change)
   - Change status to Proposed (if they want to discuss first)

6. **Write the file** only after explicit confirmation.

7. **Link** — if this supersedes an existing ADR, update the old file's Status line.

## Output

File written to: `docs/03-decisions/ADR-####-<slug>.md`

Confirm to user: "ADR-#### written. Future decisions that change this approach should supersede it with a new ADR."

## Fallbacks

**If interactive prompts (AskUserQuestion) are unavailable:**
Present options as a numbered list in your response. Ask the user to reply with a number.

```
1. Write ADR-0007 to docs/03-decisions/ADR-0007-use-redis-for-queuing.md
2. Revise the draft first
3. Save as Proposed (not Accepted) for further discussion
```
