---
name: recording-decisions
description: Record a technical or product decision that has been made as a short, durable decision record (ADR) with its context, the decision, the reasons and rejected alternatives, and its consequences, in the AgileFlow Work decisions folder when Work is enabled or in the repository's existing ADR directory otherwise. Use when the user asks to record, document, or write up a decision or an ADR, or to supersede an earlier decision. Not for debating or comparing options before a decision exists, for epics, stories, or plans, or for general documentation.
---

# Recording decisions

A decision record tells future readers, human or agent, what was chosen and why, so they neither re-argue it nor undo it by accident. Record a decision that has been made; do not make it.

## Workflow

1. **Find where decisions live.**
   - If `agileflow.yaml` has `work.enabled: true`, use the Work decisions folder `<work.root>/04-decisions/` (`work.root` defaults to `docs/agile`).
   - Otherwise look for an existing decision directory: `docs/adr/`, `docs/adrs/`, `docs/decisions/`, `docs/architecture/decisions/`, `adr/`, or `decisions/`, a path in an `.adr-dir` file, or numbered records such as `0001-*.md` elsewhere under `docs/`.
   - If there is none, propose `docs/decisions/` and check with the user before creating a new top-level location.
2. **Read what is already there.** Look for a record on the same topic, so you supersede it instead of duplicating it. Read one or two existing records to match their format, numbering, headings, and status words.
3. **Collect the substance** from the conversation and the repository: the context that forced a choice, the decision, the reasons, the alternatives that were actually considered and why they lost, and the consequences (what gets easier, what gets harder, follow-up work). Ask only for what you cannot find and what would change the record, usually the reason. Never invent a rationale or alternatives; if the reason is unknown, say so in the record and tell the user.
4. **Write the record.**
   - Work enabled: `agileflow work new decision --title "<the decision>" --status accepted [--related <epic or story IDs>]`, then fill in the body of the file it prints. Without the CLI, write the file yourself (format below).
   - ADR directory: follow its conventions exactly (next number, filename pattern, headings, status field). With no precedent, write `NNNN-<slug>.md` starting at `0001`, with a `# N. <title>` heading and Status, Context, Decision, and Consequences sections.
5. **Set the status honestly:** `accepted` when the user says the decision is made, `proposed` when it still needs sign-off.
6. **Supersede, do not rewrite.** When the new decision replaces an earlier one, the new record names the old one, and the old record changes only its status to `superseded` (plus a one-line pointer to the new record where its format allows). Never edit the old record's reasoning.

## Work decision file

`<root>/04-decisions/DEC-XXXXXXXX-<slug>.md`, where `XXXXXXXX` is 8 random characters from `0123456789ABCDEFGHJKMNPQRSTVWXYZ` (check that no existing epic, story, or decision uses it):

```markdown
---
schema: 1
type: decision
id: DEC-XXXXXXXX
title: Use Postgres for job storage
status: accepted          # proposed | accepted | superseded | rejected
related: [EPIC-XXXXXXXX]  # optional: related epics, stories, or decisions
---

# Use Postgres for job storage

## Context
## Decision
## Why
## Consequences
```

Put rejected alternatives under Why, one line each with the reason they lost.

## Constraints

- One decision per record, titled as the decision ("Use Postgres for job storage"), not the question.
- Keep it short: a reader should understand the decision and its reason in a minute. No implementation plans, task lists, or meeting notes.
- Do not create a second decisions location next to an existing one, and do not create epics or stories.
- Do not change code or other documents as part of recording the decision.

## Done when

One decision record exists in the project's decisions location, in that location's format, with context, the decision, its reasons, consequences, and an honest status (and any record it replaces is marked `superseded`), and you have told the user its ID or path.
