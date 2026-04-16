---
description: Run auto-research loop to optimize a skill prompt using binary eval criteria
argument-hint: "<skill-id>"
compact_context:
  priority: high
  preserve_rules:
    - "ACTIVE COMMAND: /agileflow:skill:research - Auto-research optimization loop"
    - "MUST use binary yes/no eval criteria (never subjective 1-10 scales)"
    - "MUST store candidates in candidates/ subdirectory - NEVER auto-modify live prompts"
    - "MUST require human approval via approveCandidate() before applying changes"
    - "MUST log all experiments to research-log.jsonl for audit trail"
    - "MUST present weakness analysis, hypothesis, and eval results"
  state_fields:
    - skill_id
    - generation
    - eval_score
    - hypothesis
    - candidate_status
---

# /agileflow:skill:research

Run the auto-research optimization loop on a skill prompt. Analyzes weaknesses using binary eval criteria, generates improvement hypotheses, creates candidate prompts, and benchmarks them — all with human approval required before any live changes.

Based on Karpathy's Auto Research pattern: file to change + instructions + measurable eval = improvement loop.

---

<!-- COMPACT_SUMMARY_START -->

## COMPACT SUMMARY - /agileflow:skill:research IS ACTIVE

**CRITICAL**: Optimize a skill prompt through iterative research with binary eval and human approval.

### RULE #1: Binary Eval Only
Use yes/no eval questions. Never use subjective 1-10 scales. Each criterion must be deterministically answerable.

### RULE #2: Candidates Only
All prompt changes go to `candidates/gen-{N}.md`. Never auto-modify the live prompt.

### RULE #3: Human Approval Required
Present results and ask user to approve or reject. Use `approveCandidate()` or `rejectCandidate()`.

### RULE #4: Log Everything
Every iteration appends to `research-log.jsonl`. This is the audit trail.

### RULE #5: Max 10 Generations
Clean up old candidates when limit is reached.

<!-- COMPACT_SUMMARY_END -->

---

## Workflow

### STEP 1: Validate skill exists and load state

Find the skill's prompt file:
- Commands: `packages/cli/src/core/commands/{skill-id}.md` or nested paths
- Agents: `packages/cli/src/core/agents/{skill-id}.md`

Load existing research state from `.agileflow/skills/{skill-id}/`.

If no prior research exists, offer to establish baseline:

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "No research data found for this skill. How would you like to start?",
  "header": "Skill Research: {skill-id}",
  "multiSelect": false,
  "options": [
    {"label": "Establish baseline", "description": "(Recommended) Run binary eval on the current prompt to create a baseline score"},
    {"label": "View eval criteria", "description": "See the binary yes/no questions that will be used to evaluate"},
    {"label": "Add custom criteria", "description": "Define skill-specific eval questions"},
    {"label": "Cancel", "description": "Exit research"}
  ]
}]</parameter>
</invoke>
```

### STEP 2: Analyze weaknesses

Load the research modules:

```javascript
const evalCriteria = require('.agileflow/scripts/lib/skill-eval-criteria');
const researchLog = require('.agileflow/scripts/lib/skill-research-log');
const autoResearch = require('.agileflow/scripts/lib/skill-auto-research');
```

Run weakness analysis:

```
Weakness Analysis: {skill-id}
==============================

  Eval History: 5 iterations
  Current Score: 72/100

  Top Weaknesses:
    1. no-hallucinated-paths  - 40% fail rate (2/5)
    2. complete-response       - 20% fail rate (1/5)
    3. follows-conventions     - 20% fail rate (1/5)

  All other criteria passing at > 80%
```

### STEP 3: Generate hypothesis

Based on the weakness analysis, generate a focused improvement hypothesis:

```
Hypothesis (Generation 4)
==========================

  Focus: "no-hallucinated-paths" criterion (40% failure rate)

  Hypothesis: Add path verification instructions and reduce
  hallucination tendency by requiring the skill to check that
  referenced files actually exist before including them.

  Expected: Reduce fail rate from 40% to ~20%
```

### STEP 4: Create candidate prompt

Read the current live prompt and generate an improved version based on the hypothesis. Present the diff:

```
Candidate: gen-4.md
====================

  Changes from current prompt:
  + Added "IMPORTANT: Verify all file paths exist before referencing"
  + Added example of path verification pattern
  + Clarified output format to reduce ambiguity

  Stored at: .agileflow/skills/{skill-id}/candidates/gen-4.md

  This candidate will NOT be applied until you approve it.
```

### STEP 5: Benchmark candidate

Run the candidate through the binary eval criteria. Grade the output of a representative task using the candidate prompt vs the current prompt:

```
Eval Results: gen-4 vs current
================================

  Current prompt score:   72/100
  Candidate gen-4 score:  85/100
  Delta:                  +13 points

  Criterion Comparison:
    addresses-task:         ✓ → ✓  (no change)
    no-hallucinated-paths:  ✗ → ✓  (IMPROVED)
    accept-without-rework:  ✓ → ✓  (no change)
    follows-conventions:    ✓ → ✓  (no change)
    complete-response:      ✗ → ✓  (IMPROVED)
    no-unnecessary-changes: ✓ → ✓  (no change)
    correct-syntax:         ✓ → ✓  (no change)
    actionable:             ✓ → ✓  (no change)

  Outcome: IMPROVED (+13 points)
```

### STEP 6: Ask for approval

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "Candidate gen-4 scored +13 points above current. What would you like to do?",
  "header": "Research Results: {skill-id}",
  "multiSelect": false,
  "options": [
    {"label": "Approve candidate", "description": "(Recommended) Apply gen-4 as the new live prompt (backup created automatically)"},
    {"label": "Run another iteration", "description": "Keep current prompt and try a different hypothesis"},
    {"label": "View candidate diff", "description": "See full diff between current and candidate"},
    {"label": "View correlation data", "description": "See how eval scores correlate with real usage metrics"},
    {"label": "Reject candidate", "description": "Discard gen-4 and keep current prompt"},
    {"label": "Done", "description": "Exit research"}
  ]
}]</parameter>
</invoke>
```

---

## Research Status Display

When the skill already has research history, show status first:

```
Research Status: {skill-id}
============================

  Generations: 4 of 10 max
  Total Experiments: 7
  Best Score: 85/100 (gen-4)
  Current Score: 72/100
  Pending Candidates: 1
  Last Research: 2026-03-15

  Generation History:
    gen-1  baseline  72/100  -
    gen-2  neutral   73/100  +1
    gen-3  regressed 68/100  -4
    gen-4  improved  85/100  +13 (pending approval)

  Correlation: moderate positive (r=0.62, 7 data points)
```

Then offer actions:

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "What would you like to do?",
  "header": "Skill Research: {skill-id}",
  "multiSelect": false,
  "options": [
    {"label": "Review pending candidate (gen-4, +13)", "description": "(Recommended) View and approve/reject the pending candidate"},
    {"label": "Run new iteration", "description": "Analyze weaknesses and generate a new candidate"},
    {"label": "View correlation analysis", "description": "See how eval scores correlate with real usage"},
    {"label": "View eval criteria", "description": "See binary eval questions and their predictive power"},
    {"label": "Clean up old candidates", "description": "Remove old generation files"},
    {"label": "Done", "description": "Exit research"}
  ]
}]</parameter>
</invoke>
```

---

## Error Handling

### Skill not found
```
Skill "{skill-id}" not found.
Looked in:
  - packages/cli/src/core/commands/{skill-id}.md
  - packages/cli/src/core/agents/{skill-id}.md

Run /skill:list to see available skills.
```

### Max generations reached
```
Maximum generations (10) reached for "{skill-id}".
Clean up old candidates with the "Clean up old candidates" option,
or approve/reject pending candidates to free up space.
```

### No eval data
```
No eval data available for "{skill-id}".
Run "Establish baseline" to create initial eval scores.
```

---

## Related Commands

- `/agileflow:skill:benchmark` - A/B benchmark a skill (used internally by research)
- `/agileflow:skill:health` - View skill health metrics and scores
- `/agileflow:skill:retire` - Start retirement workflow for a skill
- `/agileflow:skill:list` - List installed skills
