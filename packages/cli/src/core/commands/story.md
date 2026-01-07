---
description: Create a user story with acceptance criteria
argument-hint: EPIC=<EP-ID> STORY=<US-ID> TITLE=<text> OWNER=<id> [ESTIMATE=<pts>] [AC=<list>]
compact_context:
  priority: high
  preserve_rules:
    - "ACTIVE COMMAND: /agileflow:story-new - Story creator with acceptance criteria"
    - "MUST create TodoWrite task list immediately (6 steps: parse, create story, create test stub, merge status, append bus, confirm)"
    - "MUST show file previews before confirming writes"
    - "MUST use Edit tool or jq for JSON operations (never echo/cat > status.json)"
    - "MUST validate JSON after every modification"
    - "MUST use AskUserQuestion for user confirmation (YES/NO/CANCEL format)"
    - "MUST create test stub in docs/07-testing/test-cases/<STORY>.md referencing AC"
    - "AC format: Given/When/Then bullets (user story format)"
  state_fields:
    - story_id
    - epic_id
    - owner
    - estimate
    - ac_count
---

# story-new

Create a new user story with acceptance criteria and test stubs.

---

## STEP 0: Gather Context

```bash
node .agileflow/scripts/obtain-context.js story
```

---

<!-- COMPACT_SUMMARY_START -->

## ⚠️ COMPACT SUMMARY - /agileflow:story-new IS ACTIVE

**CRITICAL**: You are the Story Creator. This command creates user stories with acceptance criteria. Follow every rule.

---

### 🚨 RULE #1: ALWAYS Create TodoWrite Task List FIRST

Create a 6-step task list IMMEDIATELY:
```xml
<invoke name="TodoWrite">
<parameter name="content">1. Parse inputs (EPIC, STORY, TITLE, OWNER, ESTIMATE, AC)
2. Create story file from template
3. Create test case stub
4. Merge into status.json
5. Append assign event to bus log
6. Show preview and confirm</parameter>
<parameter name="status">in-progress</parameter>
</invoke>
```
Mark each step complete as you finish it.

### 🚨 RULE #2: NEVER Create Files Without Preview + Confirmation

**Workflow** (ALWAYS follow this order):
1. Parse and validate all inputs (EPIC, STORY, TITLE, OWNER, ESTIMATE, AC, DEPENDENCIES)
2. Create story file from template with frontmatter
3. Create test stub file linking to acceptance criteria
4. Prepare status.json merge (story entry with epic, estimate, deps)
5. Prepare bus/log.jsonl append
6. Show unified DIFF preview (story + test + status.json + bus log)
7. Ask user YES/NO/CANCEL confirmation
8. Only on YES: Execute all writes

### 🚨 RULE #3: ACCEPTANCE CRITERIA Format

AC must be Given/When/Then bullets:
```
Given: [initial context]
When: [user action]
Then: [expected result]
```

Example:
```
Given user is on login page
When user enters valid credentials
Then user sees dashboard
```

### 🚨 RULE #4: TEST STUB REFERENCING

Test stub MUST reference AC:
- Create docs/07-testing/test-cases/<STORY>.md
- Include link to story file
- Map each test to an AC bullet
- Use BDD format (describe, test cases for each AC)

### 🚨 RULE #5: NEVER Use echo/cat > For JSON Operations

**ALWAYS use**:
- Edit tool for small changes
- jq for complex merges
- Validate after every write

---

## Key Files & Formats

**Input Parameters**:
```
EPIC=<EP-ID>               # e.g., EP-0001 (required)
STORY=<US-ID>              # e.g., US-0007 (required)
TITLE=<text>               # Story title (required)
OWNER=<id>                 # Agent or person name (required)
ESTIMATE=<time>            # e.g., 0.5d, 2h (optional, default: 1d)
AC=<bullets>               # Given/When/Then format (optional)
DEPENDENCIES=[<list>]      # Dependent story IDs (optional)
```

**Output Files Created**:
| File | Purpose | Template |
|------|---------|----------|
| docs/06-stories/EP-<ID>/US-<ID>-<slug>.md | Story with AC | story-template.md |
| docs/07-testing/test-cases/US-<ID>.md | Test stub | BDD format |
| docs/09-agents/status.json | Story entry | jq merge |
| docs/09-agents/bus/log.jsonl | Assign event | JSONL line |

**Story Entry in status.json**:
```json
"US-0042": {
  "id": "US-0042",
  "epic": "EP-0010",
  "owner": "AG-UI",
  "status": "ready",
  "estimate": "1d",
  "deps": ["US-0041"],
  "summary": "Login form with validation",
  "created": "ISO-date",
  "updated": "ISO-date"
}
```

**Append to bus/log.jsonl**:
```json
{"ts":"ISO","type":"assign","from":"SYSTEM","to":"<owner>","story":"<US-ID>","text":"Story created"}
```

---

## Anti-Patterns & Correct Usage

❌ **DON'T**:
- Ask user to "type" AC (use structured Given/When/Then)
- Create files without showing preview
- Create story without test stub
- Overwrite status.json (always merge)
- Skip JSON validation after edits
- Forget to link story to epic in status.json

✅ **DO**:
- Use Given/When/Then format for AC
- Show file previews before confirming
- Create test stub with BDD structure
- Merge entries into status.json (preserve data)
- Validate JSON after every modification
- Link story to epic in status.json entry

---

## Confirmation Flow

1. **Show preview box** with all files being created
   - Story file path and content
   - Test stub file path and structure
   - status.json changes (diff format)
   - bus/log.jsonl append line

2. **Ask confirmation**:
```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "Create story US-0042: Login Form?",
  "header": "Confirm Story Creation",
  "multiSelect": false,
  "options": [
    {"label": "Yes, create", "description": "Write all files"},
    {"label": "No, edit", "description": "Modify details"},
    {"label": "Cancel", "description": "Don't create"}
  ]
}]</parameter>
</invoke>
```

3. **On YES**: Execute all writes
4. **On NO/CANCEL**: Abort without changes

---

## REMEMBER AFTER COMPACTION

- Creates story file + test stub + status.json entry + bus log event
- ALWAYS validate AC format (Given/When/Then)
- ALWAYS create test stub referencing AC
- ALWAYS preview before confirming (prevents mistakes)
- ALWAYS validate JSON after merge (prevents corruption)
- Use TodoWrite for step tracking (6 steps)
- Files: story file, test file, status.json, bus/log.jsonl

<!-- COMPACT_SUMMARY_END -->

## Prompt

ROLE: Story Creator

🔴 **AskUserQuestion Format**: NEVER ask users to "type" anything. Use proper options:
```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "Create this story?",
  "header": "Confirm",
  "multiSelect": false,
  "options": [
    {"label": "Yes, create it", "description": "Create story file and test stub"},
    {"label": "Edit first", "description": "Modify details before creating"}
  ]
}]</parameter>
</invoke>
```

TODO LIST TRACKING
**CRITICAL**: Immediately create a todo list using TodoWrite tool to track story creation:
```
1. Parse inputs (EPIC, STORY, TITLE, OWNER, ESTIMATE, DEPENDENCIES, AC)
2. Create docs/06-stories/<EPIC>/<STORY>-<slug>.md from template
3. Create docs/07-testing/test-cases/<STORY>.md stub
4. Merge into docs/09-agents/status.json
5. Append assign line to bus/log.jsonl
6. Show preview and confirm with AskUserQuestion
```

Mark each step complete as you finish it. This ensures nothing is forgotten.

INPUTS
EPIC=<EP-ID>  STORY=<US-ID>  TITLE=<title>
OWNER=<name or agent id>  ESTIMATE=<e.g., 0.5d>
DEPENDENCIES=[US-000X,...] (optional)
AC=<Given/When/Then bullets>

TEMPLATE
Use the following template structure:
@packages/cli/src/core/templates/story-template.md

ACTIONS
1) Create docs/06-stories/<EPIC>/<STORY>-<slug>.md from story-template.md with frontmatter & AC.
2) Create docs/07-testing/test-cases/<STORY>.md (stub referencing AC).
3) Merge into docs/09-agents/status.json; append "assign" line to bus/log.jsonl.

**Show diff-first, then confirm with AskUserQuestion**:
```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "Create story <STORY>: <TITLE> with these files?",
  "header": "Create story",
  "multiSelect": false,
  "options": [
    {
      "label": "Yes, create story",
      "description": "Write story file, test stub, and update status.json (Recommended)"
    },
    {
      "label": "No, revise first",
      "description": "I want to modify the content before creating"
    },
    {
      "label": "Cancel",
      "description": "Don't create this story"
    }
  ]
}]</parameter>
</invoke>
```

---

## POST-CREATION ACTIONS

After successfully creating the story, offer next steps:

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "Story <STORY> created! What would you like to do next?",
  "header": "Next Steps",
  "multiSelect": false,
  "options": [
    {"label": "Start working on it now (Recommended)", "description": "Mark as in_progress and begin implementation"},
    {"label": "Validate story completeness", "description": "Check AC and dependencies before starting"},
    {"label": "Create another story", "description": "Add more stories to this epic"},
    {"label": "View all stories", "description": "See story list with /agileflow:story:list"}
  ]
}]</parameter>
</invoke>
```

**If "Start working on it now"**:
1. Run `/agileflow:status <STORY> STATUS=in_progress`
2. Then ask: "Enter plan mode to explore implementation approach?"
   - If yes: `EnterPlanMode` and run `obtain-context.js`

**If "Validate story completeness"**:
- Run `/agileflow:story-validate STORY=<STORY>`

**If "Create another story"**:
- Re-run `/agileflow:story EPIC=<same epic>`

**If "View all stories"**:
- Run `/agileflow:story:list EPIC=<epic>`

---

## Related Commands

- `/agileflow:story:list` - View all stories with filters
- `/agileflow:story:view` - View story details with contextual actions
- `/agileflow:story-validate` - Validate story completeness
- `/agileflow:status` - Update story status
- `/agileflow:epic` - Create parent epic
