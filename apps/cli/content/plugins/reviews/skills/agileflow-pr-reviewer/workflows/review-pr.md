# Workflow: Review PR

**Triggers:** "review this PR", "review my changes", "check my code", user shares a diff or file changes

**Goal:** Produce a structured, prioritised review with findings across all dimensions and a clear merge recommendation.

---

## Inputs needed

| Input                     | Required  | How to get it                                         |
| ------------------------- | --------- | ----------------------------------------------------- |
| The diff or changed files | Yes       | Paste, file paths, or `git diff` output               |
| PR description / context  | Preferred | Paste; or ask "What does this change do?"             |
| Target branch             | No        | Usually `main` — ask if branching strategy is unusual |
| Change type               | Preferred | Feature, bugfix, refactor, chore                      |

---

## Steps

### Step 1: Read the change

Read every changed file fully. Don't skim. Build a complete picture of:

- What the change is doing
- What it's removing
- What assumptions the author is making

### Step 2: Read the surrounding context

For each changed file:

- Read 20–30 lines above and below each change for context
- Check if there is an existing test file for this module
- Check if there are related files that should also have changed but didn't

### Step 3: Check the PR description

If no PR description was provided, ask:

- "What does this change do and why?"
- "Is there a ticket or issue this corresponds to?"

A PR without a description is harder to review — flag this as a P3 finding.

### Step 4: Run dimension checks

Work through each dimension from `references/review-checklist.md` that applies to this change:

| Change type                | Dimensions to run                    |
| -------------------------- | ------------------------------------ |
| New feature with endpoints | Security, Logic, Tests, API Contract |
| Bug fix                    | Logic, Tests                         |
| Refactor                   | Logic, Tests, Breaking Changes       |
| Auth-related change        | Security (full), Logic, Tests        |
| Database migration         | API Contract, Breaking Changes       |
| Dependency update          | Security (A06), Tests                |
| UI / frontend only         | Logic, Tests, style                  |

### Step 5: Collect all findings

List every finding as you go. Don't filter yet — capture everything.

### Step 6: Assign severities

Review the collected findings and assign P0–P3 using the severity table in the SKILL.md.

When in doubt between severities:

- If it can cause data loss, a security breach, or a crash in production → P0
- If it will cause incorrect behaviour → P1
- If it should be tested but isn't → P2
- If it's a style or readability concern → P3

### Step 7: Sort and present findings

Present findings in P0 → P3 order. For each:

```
[P{level}] {DIMENSION} — {One-line summary}
  File: {filename}, line {N}
  Issue: {What is wrong and why it matters}
  Fix: {Concrete suggestion}
```

### Step 8: Write the summary block

Always end with a structured summary:

```
─────────────────────────────────────
REVIEW SUMMARY
─────────────────────────────────────
Files reviewed: {N}
Lines changed: +{added} / -{removed}
Findings: {P0 count} P0, {P1 count} P1, {P2 count} P2, {P3 count} P3

VERDICT: {APPROVE | REQUEST CHANGES | NEEDS DISCUSSION}

{If REQUEST CHANGES: list the must-fix items}
{If APPROVE: one sentence on what looks good}
{If NEEDS DISCUSSION: what the design question is}
─────────────────────────────────────
```

### Step 9: Offer next step

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "Review complete — {verdict}. {N} findings.",
  "header": "What next",
  "multiSelect": false,
  "options": [
    {"label": "Fix the P0 and P1 issues now (Recommended)", "description": "I'll work through each finding and write the corrected code"},
    {"label": "Explain a specific finding in more detail", "description": "Tell me which finding number you want me to expand on"},
    {"label": "Write the missing tests", "description": "I'll add tests for the uncovered paths flagged in P2 findings"},
    {"label": "Re-review after fixes", "description": "Once you've addressed the findings, share the updated diff for a re-review"}
  ]
}]</parameter>
</invoke>
```

---

## Special handling for large PRs (> 400 LOC)

If the diff is very large:

1. Flag this as a P3 finding: "PRs over ~400 LOC are harder to review thoroughly and increase merge risk — consider splitting."
2. Ask if there are sections to prioritise: "This is a large change. Shall I focus on the security-sensitive parts first?"
3. Review in passes: security first, then logic, then tests, then style

---

## Fallbacks

**If AskUserQuestion is unavailable:**

Present the next step as a numbered list:

```
Review complete — REQUEST CHANGES. 3 findings.

To continue:
1. Fix the 3 findings now — I'll write the corrected code for each
2. Explain finding #1 (SQL injection) in more detail
3. Write the missing tests flagged in finding #3
4. Mark as done and re-review the updated diff

Reply with a number or describe what you want to do next.
```
