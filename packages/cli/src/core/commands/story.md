---
description: Create a user story with acceptance criteria
argument-hint: EPIC=<EP-ID> STORY=<US-ID> TITLE=<text> OWNER=<id> [ESTIMATE=<pts>] [AC=<list>] [TDD=true]
compact_context:
  priority: high
  preserve_rules:
    - "ACTIVE COMMAND: /agileflow:story-new - Story creator with acceptance criteria"
    - "{{RULES:task_tracking}}"
    - "{{RULES:file_preview}}"
    - "{{RULES:json_operations}}"
    - "{{RULES:user_confirmation}}"
    - "MUST create test stub in docs/07-testing/test-cases/<STORY>.md referencing AC"
    - "AC format: Given/When/Then bullets (user story format)"
    - "TDD=true: Generate framework-specific test code BEFORE implementation"
    - "TDD=true: Parse Given/When/Then into describe/it blocks (Jest) or test functions (pytest)"
    - "TDD=true: All tests start as .skip or @pytest.mark.skip (pending)"
    - "TDD=true: Add tdd_mode:true and test_file fields to status.json entry"
  state_fields:
    - story_id
    - epic_id
    - owner
    - estimate
    - ac_count
    - tdd_mode
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

### 🚨 RULE #1: ALWAYS Create TaskCreate/TaskUpdate Task List FIRST

Create a task list IMMEDIATELY (7 steps if TDD=true, 6 steps otherwise):
```xml
<invoke name="TaskCreate/TaskUpdate">
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

### 🚨 RULE #5: TDD MODE (Smart Defaults)

**Smart TDD defaults based on OWNER:**
| Owner | Default | Rationale |
|-------|---------|-----------|
| AG-API, AG-UI, AG-DATABASE | TDD=true | Code-focused, tests critical |
| AG-TESTING, AG-SECURITY, AG-PERFORMANCE | TDD=true | Quality-focused |
| AG-DOCUMENTATION, AG-RESEARCH, AG-PRODUCT | TDD=false | Non-code work |
| AG-DEVOPS, AG-CI | TDD=false | Infrastructure, config |
| Other/Custom | TDD=false | Explicit opt-in |

**Override:** User can always specify `TDD=true` or `TDD=false` explicitly.

When TDD mode is active, generate framework-specific test code:

**Workflow:**
1. Detect test framework from `environment.json` or `package.json`
2. Parse AC into Given/When/Then structure
3. Generate test file using `tdd-test-template.js`
4. Create test in `__tests__/<STORY>.test.ts` (Jest) or `tests/test_<STORY>.py` (pytest)
5. All tests start as `.skip` (pending)
6. Add `tdd_mode: true` and `test_file` to status.json entry
7. Add TDD badge to story file

**Test File Location:**
- Jest/Vitest: `__tests__/<STORY_ID>.test.ts`
- pytest: `tests/test_<STORY_ID>.py`
- Go: `<package>/<STORY_ID>_test.go`

**Status.json Entry (TDD mode):**
```json
{
  "tdd_mode": true,
  "test_file": "__tests__/US-0042.test.ts",
  "test_status": "not_run"
}
```

### 🚨 RULE #6: NEVER Use echo/cat > For JSON Operations

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
TDD=true|false             # TDD mode (smart default: true for code owners, false for docs/research)
```

**Output Files Created**:
| File | Purpose | Template |
|------|---------|----------|
| docs/06-stories/EP-<ID>/US-<ID>-<slug>.md | Story with AC | story-template.md |
| docs/07-testing/test-cases/US-<ID>.md | Test stub | BDD format |
| __tests__/US-<ID>.test.ts | TDD test code (if TDD=true) | tdd-test-template.js |
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
- Use TaskCreate/TaskUpdate for step tracking (6 steps, or 7 if TDD=true)
- Files: story file, test file, status.json, bus/log.jsonl
- **TDD=true**: Also create framework-specific test code in `__tests__/` with pending tests

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
**CRITICAL**: Immediately create a todo list using TaskCreate/TaskUpdate tool to track story creation:
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

---

## Expected Output

### Successful Story Creation

```
📝 Creating Story: US-0042

Epic: EP-0010
Title: Login Form with Validation
Owner: AG-UI
Estimate: 2h
TDD Mode: true (smart default for AG-UI)

Files to create:
───────────────────────────
1. docs/06-stories/EP-0010/US-0042-login-form-validation.md
   - Story file with 3 acceptance criteria

2. docs/07-testing/test-cases/US-0042.md
   - Test stub referencing AC

3. __tests__/US-0042.test.ts (TDD mode)
   - 3 pending test cases from AC

4. docs/09-agents/status.json (merge)
   + "US-0042": {
   +   "id": "US-0042",
   +   "epic": "EP-0010",
   +   "owner": "AG-UI",
   +   "status": "ready",
   +   "estimate": "2h",
   +   "tdd_mode": true,
   +   "test_file": "__tests__/US-0042.test.ts"
   + }

5. docs/09-agents/bus/log.jsonl (append)
   + {"ts":"...","type":"assign","from":"SYSTEM","to":"AG-UI","story":"US-0042"}

[AskUserQuestion: "Create story US-0042: Login Form with Validation?"]

✅ Story US-0042 created successfully!
✅ Test stub created: docs/07-testing/test-cases/US-0042.md
✅ TDD tests created: __tests__/US-0042.test.ts (3 pending)
✅ Bus message sent: assign → AG-UI

[AskUserQuestion: "What would you like to do next?"]
```

### Story with Dependencies

```
📝 Creating Story: US-0043

Dependencies: US-0042 (Login Form)

⚠️ Dependency Status:
  • US-0042: ready (not yet done)

[AskUserQuestion: "Create story with pending dependency?"]
  - Yes, create anyway (dependency will block)
  - No, wait for US-0042

✅ Story US-0043 created
⚠️ Status set to 'blocked' (waiting on US-0042)
```

### Validation Error

```
❌ Invalid Input

Missing required parameters:
  • EPIC - Parent epic ID (e.g., EP-0010)
  • TITLE - Story title

Usage:
/agileflow:story EPIC=EP-0010 STORY=US-0042 TITLE="Login Form" OWNER=AG-UI
```

### TDD Mode Detection

```
📝 Story Creation

Owner: AG-DOCUMENTATION
TDD Mode: false (smart default - documentation work)

ℹ️ To enable TDD mode, add TDD=true to the command:
   /agileflow:story ... TDD=true
```
