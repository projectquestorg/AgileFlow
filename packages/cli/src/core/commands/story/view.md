---
description: View story details with contextual actions
argument-hint: STORY=<US-ID>
---

# /agileflow:story:view

View full story details and take contextual actions based on story state.

---

## Purpose

Displays complete story information and offers **context-aware actions** based on the story's current status:
- **ready** → Start work, validate, assign
- **in_progress** → View progress, mark blocked, complete
- **blocked** → View blockers, unblock, reassign
- **done** → View summary, reopen if needed

---

<!-- COMPACT_SUMMARY_START -->
## Compact Summary

**Command**: `/agileflow:story:view STORY=<US-ID>`
**Purpose**: View story details with context-aware action suggestions

### Flow
1. Read story file and status.json entry
2. Display full story details (AC, tests, progress)
3. Offer actions based on current status
4. Execute selected action

### Critical Rules
- **Context-aware actions**: Different options based on story status
- **Show everything**: AC, test status, dependencies, blockers
- **Always offer next steps**: End with relevant AskUserQuestion
<!-- COMPACT_SUMMARY_END -->

---

## Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| STORY | Yes | Story ID (e.g., US-0042) |

---

## IMMEDIATE ACTIONS

Upon invocation, execute these steps:

### Step 1: Validate Input

If STORY not provided, list recent stories:

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "Which story would you like to view?",
  "header": "Select",
  "multiSelect": false,
  "options": [
    {"label": "US-0042: Latest story", "description": "in_progress - AG-UI"},
    {"label": "US-0041: Previous story", "description": "ready - AG-API"},
    {"label": "Show all stories", "description": "View full story list"}
  ]
}]</parameter>
</invoke>
```

### Step 2: Read Story Data

Read from multiple sources:

```bash
# Story file
cat docs/06-stories/<EPIC>/<STORY>-*.md

# Status entry
cat docs/09-agents/status.json | jq '.stories["<STORY>"]'

# Test status (if exists)
cat docs/07-testing/test-cases/<STORY>.md
```

### Step 3: Display Story Details

```markdown
## US-0042: User Login Form

**Epic**: EP-0001 (Authentication System)
**Status**: in_progress
**Owner**: AG-UI
**Estimate**: 3h
**Created**: 2024-12-28
**Updated**: 2024-12-30

---

### Acceptance Criteria

- [x] Given a user on the login page
      When they enter valid credentials
      Then they are redirected to dashboard

- [ ] Given a user on the login page
      When they enter invalid credentials
      Then they see an error message

- [ ] Given a user on the login page
      When they click "Forgot Password"
      Then they are taken to password reset flow

---

### Dependencies

- US-0040: API authentication endpoint (done)
- US-0041: Session management (ready) ⚠️ Not started yet

---

### Test Status

| Test | Status |
|------|--------|
| Unit: LoginForm.test.tsx | passing |
| Integration: auth-flow.test.ts | pending |
| E2E: login.spec.ts | not created |

---

### Progress Notes

- 2024-12-30: Started form implementation
- 2024-12-29: Design approved
```

### Step 4: Offer Context-Aware Actions

**Based on story status, show different options:**

#### If STATUS = ready

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "This story is ready to start. What would you like to do?",
  "header": "Actions",
  "multiSelect": false,
  "options": [
    {"label": "Start working on this story (Recommended)", "description": "Mark as in_progress and begin implementation"},
    {"label": "Validate story first", "description": "Check if AC and dependencies are complete"},
    {"label": "View related research", "description": "Find research notes linked to this epic"},
    {"label": "Back to story list", "description": "Return to /agileflow:story:list"}
  ]
}]</parameter>
</invoke>
```

**If "Start working"**:
- Run `/agileflow:status <STORY> STATUS=in_progress`
- Suggest: "Enter plan mode to explore implementation?"

#### If STATUS = in_progress

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "This story is in progress. What would you like to do?",
  "header": "Actions",
  "multiSelect": false,
  "options": [
    {"label": "Mark as complete", "description": "All AC done, move to done status"},
    {"label": "Mark as blocked", "description": "Hit a blocker, need help"},
    {"label": "View/run tests", "description": "Check test status for this story"},
    {"label": "Add progress note", "description": "Document current progress"}
  ]
}]</parameter>
</invoke>
```

**If "Mark as complete"**:
- First ask: "Have all acceptance criteria been met?"
- If yes: Run `/agileflow:status <STORY> STATUS=done`
- Suggest: "View next ready story?"

**If "Mark as blocked"**:
- Ask: "What is blocking this story?"
- Run `/agileflow:status <STORY> STATUS=blocked BLOCKER=<reason>`
- Suggest: "Create blocker resolution task?"

#### If STATUS = blocked

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "This story is blocked. What would you like to do?",
  "header": "Actions",
  "multiSelect": false,
  "options": [
    {"label": "View blocker details", "description": "See what's blocking this story"},
    {"label": "Unblock and resume", "description": "Blocker resolved, continue work"},
    {"label": "Reassign story", "description": "Assign to different owner"},
    {"label": "Create research task", "description": "Need to research the blocker"}
  ]
}]</parameter>
</invoke>
```

**If "Unblock and resume"**:
- Run `/agileflow:status <STORY> STATUS=in_progress`
- Clear blocker note

#### If STATUS = done

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "This story is complete. What would you like to do?",
  "header": "Actions",
  "multiSelect": false,
  "options": [
    {"label": "View completion summary", "description": "See what was delivered"},
    {"label": "Reopen story", "description": "Found issue, needs more work"},
    {"label": "View next story in epic", "description": "Continue with related work"},
    {"label": "Back to story list", "description": "Return to /agileflow:story:list"}
  ]
}]</parameter>
</invoke>
```

---

## Example Usage

```bash
# View specific story
/agileflow:story:view STORY=US-0042

# Will prompt for selection if no ID
/agileflow:story:view
```

---

## Rules

- **Context-aware**: Actions must match current story status
- **Show everything**: AC, tests, dependencies, blockers, notes
- **Always offer next steps**: End with relevant action options
- **Connect to related commands**: Link to status, validate, tests, research

---

## Related Commands

- `/agileflow:story:list` - View all stories
- `/agileflow:story` - Create new story
- `/agileflow:story-validate` - Validate story completeness
- `/agileflow:status` - Update story status
- `/agileflow:tests` - Run/view tests
- `/agileflow:research:analyze` - Analyze related research
