# RPI Workflow — Research → Plan → Implement

**Triggers:** "use the RPI workflow", "let's do Research Plan Implement", "I need to think this through carefully", "complex task I don't fully understand yet", "brownfield feature in unfamiliar code", "RPI for [feature]"

**Goal:** Guide a complex task through three sequential phases — Research, Plan, Implement — each producing a compressed artifact that seeds the next phase, preserving context quality across conversation boundaries.

## Inputs needed

| Input            | Required | How to get it                            |
| ---------------- | -------- | ---------------------------------------- |
| task description | Yes      | Ask if not provided                      |
| starting phase   | No       | Default: auto-detect based on complexity |

## Complexity assessment

Before starting, assess the task complexity:

| Level       | Signs                         | Approach                         |
| ----------- | ----------------------------- | -------------------------------- |
| Trivial     | Typo, config tweak            | Skip RPI — just do it            |
| Simple      | Single file, clear path       | Plan → Implement (skip Research) |
| Moderate    | Multi-file, known patterns    | Plan → Implement                 |
| Complex     | Brownfield, unfamiliar code   | Full Research → Plan → Implement |
| Exploratory | Unknown territory, multi-repo | Full RPI with iteration          |

## Steps

### Phase 0: Triage

1. Read the task. Assess complexity using the table above. If the task is trivial or simple, say so and suggest a more direct approach. For complex or exploratory tasks, proceed with full RPI.

2. Ask: [A] Full RPI (Research → Plan → Implement), [B] Skip to Plan (I understand the codebase area), [C] Skip to Implement (I have a plan already).

---

### Phase 1: RESEARCH

3. Explore the relevant codebase areas without making changes. Read the files that will be affected. Understand existing patterns, data structures, dependencies, and constraints.

4. Identify unknowns: things that need external research (unfamiliar APIs, library patterns, architectural questions). Use the research import workflow if external lookups are needed.

5. Produce the Research Artifact — a compressed markdown summary:

   ```
   ## Research Summary: [Task]
   Codebase findings: [key patterns, files, constraints]
   Unknowns resolved: [what was looked up]
   Approach options: [2–3 options considered]
   Recommended approach: [chosen option + rationale]
   ```

   Save to `docs/10-research/<task-slug>-research.md`.

6. Ask: [A] Start a new conversation for the Plan phase (recommended — fresh context), [B] Continue in this conversation.

---

### Phase 2: PLAN

7. Read the Research Artifact. Design the implementation in detail:
   - Files to create or modify (specific paths)
   - Order of changes
   - How to handle edge cases
   - Test strategy

8. Produce the Plan Artifact:

   ```
   ## Implementation Plan: [Task]
   Files to change: [list with purpose]
   Step-by-step: [numbered implementation steps]
   Tests: [what to write and when]
   Risk: [breaking changes, migration needs]
   ```

   Save to `docs/<task-slug>-plan.md`.

9. Ask: [A] Start a new conversation for the Implement phase (recommended), [B] Continue in this conversation.

---

### Phase 3: IMPLEMENT

10. Read the Plan Artifact. Execute the plan step by step. After each step, run the relevant tests. Do not skip steps or add scope.

11. When all steps are complete, run the full test suite. Fix any failures before declaring done.

12. Ask: [A] Run the story audit to verify AC coverage, [B] Create the PR.

## Output

Research artifact, Plan artifact, and implemented code — each in a separate, high-quality context. Context health is monitored throughout; the user is warned if utilization exceeds 40%.

## Fallbacks

**If interactive prompts (AskUserQuestion) are unavailable:**
Present options as a numbered list in your response. Ask the user to reply with a number. Example:

```
How would you like to proceed?
1. Save and continue
2. Review before saving
3. Discard
```
