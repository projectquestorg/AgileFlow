---
description: Generate pull request description from story
argument-hint: STORY=<US-ID> [TITLE=<text>] [TEST_EVIDENCE=<text>]
compact_context:
  priority: high
  preserve_rules:
    - "STORY ID is REQUIRED - always ask if missing"
    - "Read story file FIRST from docs/06-stories/<STORY>.md"
    - "Extract: epic reference, summary, dependencies, acceptance criteria"
    - "NEVER guess AC or dependencies - read from story file"
    - "Output is PASTE-READY - format as GitHub PR markdown"
    - "Include ALL dependencies found in story file"
    - "Preserve AC checkbox states from AC_CHECKED input"
    - "Suggest conventional commit format: feat/fix/chore based on story type"
  state_fields:
    - story_id
    - title
    - ac_checked
    - test_evidence
    - notes
---

# pr

## STEP 0: Gather Context

```bash
node .agileflow/scripts/obtain-context.js pr
```

This gathers git status, stories/epics, session state, and registers for PreCompact.

---

<!-- COMPACT_SUMMARY_START -->

## ⚠️ COMPACT SUMMARY - /agileflow:pr IS ACTIVE

**CRITICAL**: You are generating pull request descriptions from stories. These are paste-ready GitHub PR bodies.

**ROLE**: PR Description Generator

---

### 🚨 RULE #1: STORY ID IS REQUIRED (ALWAYS)

Always require `STORY=<US-ID>` input. If missing, ask user: "Which story is this PR for? (e.g., US-0042)"

---

### 🚨 RULE #2: READ STORY FILE FIRST (MANDATORY)

**BEFORE ANYTHING ELSE**: Read the story file from `docs/06-stories/<STORY>.md`

Extract these from the story file (NEVER guess):
- Epic reference
- Story summary and description
- Dependencies on other stories
- Acceptance criteria (exact text)
- Owner/assignee

❌ WRONG: Generate PR description without reading story file
✅ RIGHT: Read story file, extract actual AC and deps

---

### 🚨 RULE #3: PR DESCRIPTION STRUCTURE (EXACT FORMAT)

Generate GitHub PR body with these sections in order:

| Section | Source | Format |
|---------|--------|--------|
| Title | Input TITLE or story summary | `<STORY>: <TITLE>` |
| Summary | Story summary + NOTES input | 2-3 paragraph description |
| Linked Issues | Story ID + dependencies from file | Bullet list of #STORY |
| Checklist | AC_CHECKED input (preserve state) | `- [x]` / `- [ ]` format |
| Test Evidence | TEST_EVIDENCE input | Formatted bullets/paths/links |
| Screenshots | User-provided or placeholder | Links or "See attached" |
| Risk Assessment | Analyze potential risks | Bulleted risks + rollback plan |
| Code Owners | From @CODEOWNERS file | @team or specific users |

---

### 🚨 RULE #4: OUTPUT IS PASTE-READY

The PR body output MUST be copy-paste-ready for GitHub:
- Use proper markdown formatting
- No internal notes or meta-commentary
- No "Here's what I generated:" prefixes
- No instructions about what to do next

**SHOW OUTPUT**:
```markdown
[Actual PR body here - ready to paste into GitHub]
```

Then ask: "Copy the PR body above. Continue? (YES/NO)"

---

### 🚨 RULE #5: CONVENTIONAL COMMIT SUGGESTION

Suggest a commit message following conventional format:

| Story Type | Format | Example |
|-----------|--------|---------|
| New feature | `feat: <description>` | `feat: add user authentication` |
| Bug fix | `fix: <description>` | `fix: resolve login timeout issue` |
| Refactor | `refactor: <description>` | `refactor: simplify user service` |
| Chore | `chore: <description>` | `chore: update dependencies` |

---

### ANTI-PATTERNS (DON'T DO THESE)

❌ Generate PR description without reading story file
❌ Guess at acceptance criteria instead of extracting them
❌ Add meta-commentary or instructions to PR body
❌ Forget to include dependencies
❌ Lose checkbox states from AC_CHECKED input
❌ Include internal development notes in PR body

### DO THESE INSTEAD

✅ Always read story file first
✅ Extract actual AC and dependencies from story
✅ Output paste-ready PR markdown
✅ Include all dependencies as linked issues
✅ Preserve AC checkbox states
✅ Suggest meaningful conventional commit message

---

### KEY FILES TO REMEMBER

| File | Purpose |
|------|---------|
| `docs/06-stories/<STORY>.md` | Story source - read for AC and deps |
| `docs/09-agents/status.json` | Story metadata reference |
| `.github/CODEOWNERS` | Code owners for PR section |

---

### WORKFLOW

1. **Input Validation**: Ensure STORY is provided or ask user
2. **Read Story File**: Load story from `docs/06-stories/<STORY>.md`
3. **Extract Metadata**: Get epic, summary, dependencies, AC
4. **Generate PR Body**: Build complete markdown (using template above)
5. **Show Output**: Display paste-ready PR body
6. **Suggest Commit**: Provide conventional commit message
7. **Confirm**: Ask user to confirm and copy

---

### TOOL USAGE EXAMPLES

**TodoWrite** (to track PR generation):
```xml
<invoke name="TodoWrite">
<parameter name="content">1. Parse inputs (STORY, TITLE, AC_CHECKED, TEST_EVIDENCE, NOTES)
2. Read story file from docs/06-stories/
3. Extract: epic, summary, deps, AC
4. Generate PR description with all sections
5. Output paste-ready PR body
6. Suggest conventional commit message</parameter>
<parameter name="status">in-progress</parameter>
</invoke>
```

**AskUserQuestion** (for confirmation):
```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "Use this PR description?",
  "header": "Confirm",
  "multiSelect": false,
  "options": [
    {"label": "Copy to clipboard", "description": "Ready to paste into GitHub"},
    {"label": "Edit it", "description": "Let me modify sections"},
    {"label": "Cancel", "description": "Don't create PR now"}
  ]
}]</parameter>
</invoke>
```

---

### REMEMBER AFTER COMPACTION

- `/agileflow:pr` IS ACTIVE - generating PR descriptions
- STORY ID required - ask if missing
- Read story file FIRST - extract AC, deps, summary
- Output MUST be paste-ready for GitHub
- Include conventional commit suggestion
- Preserve AC checkbox states from input

<!-- COMPACT_SUMMARY_END -->

---

Generate a complete PR description from story and test evidence.

## Prompt

ROLE: PR Author

TODO LIST TRACKING
**CRITICAL**: Immediately create a todo list using TodoWrite tool to track PR description generation:
```
1. Parse inputs (STORY, TITLE, AC_CHECKED, TEST_EVIDENCE, NOTES)
2. Read story file to extract epic/summary/deps
3. Generate PR description with all sections
4. Output paste-ready PR body
5. Suggest Conventional Commit subject for squash
```

Mark each step complete as you finish it. This ensures nothing is forgotten.

INPUTS
STORY=<US-ID>  TITLE=<short>
AC_CHECKED=<checkbox list>  TEST_EVIDENCE=<bullets/paths>  NOTES=<optional>

ACTIONS
1) Read story file to pull epic/summary/deps.
2) Output a paste-ready PR body including: Title "<STORY>: <TITLE>", Summary, Linked Issues (story+deps), Checklist (AC with checked state), Test Evidence, Screens/GIFs, Risk/Rollback, Owners (@CODEOWNERS).
3) Suggest a Conventional Commit subject for squash.

No file writes.
