---
description: Verify a skill works correctly by testing its activation and functionality
argument-hint: [SKILL_NAME] (optional)
compact_context:
  priority: medium
  preserve_rules:
    - "ACTIVE COMMAND: /agileflow:skill:test - Validates skill structure and functionality"
    - "MUST list available skills if SKILL_NAME not provided"
    - "MUST run structure validation checks (file existence, frontmatter, sizes)"
    - "MUST run content validation checks (section presence, file references)"
    - "MUST offer optional activation test with sample prompts"
    - "MUST generate test report with pass/fail/warning indicators"
    - "MUST suggest fixes for validation failures"
  state_fields:
    - selected_skill
    - validation_results
    - test_report_generated
---

# /agileflow:skill:test

Test a skill to verify it activates correctly and produces expected results.

---

<!-- COMPACT_SUMMARY_START -->

## 🚨 COMPACT SUMMARY - /agileflow:skill:test IS ACTIVE

**CRITICAL**: This command validates skills through structure, content, and optional activation testing.

### 🚨 RULE #1: Select Skill
If SKILL_NAME not provided:
```bash
ls -d .claude/skills/*/ | xargs -I {} basename {}
```
Show options and ask user which to test.

### 🚨 RULE #2: Run Structure Validation
Check these in order:
```
✅ SKILL.md exists (file present)
✅ Frontmatter has name and description
✅ references.md exists
⚠️  cookbook/ directory (ok if missing for simple skills)
⚠️  .mcp.json (ok if MCP not configured)
```

### 🚨 RULE #3: Run Content Validation
Check these in order:
```
✅ "When to Use" section present
✅ Description under 1024 characters
✅ SKILL.md under 500 lines
✅ All cookbook files referenced in SKILL.md actually exist
```

### 🚨 RULE #4: Show Validation Results
Display in report format:
```
🧪 Testing: skill-name
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Structure:     ✅ PASS (5/5 checks)
Content:       ✅ PASS (4/4 checks)
MCP Config:    ⚠️  NOT CONFIGURED

Overall: ✅ SKILL IS FUNCTIONAL
```

### 🚨 RULE #5: Offer Activation Test (Optional)
Ask after structure/content validation:
```
Would you like to test skill activation with sample prompts?
- Yes, test activation (Recommended)
- Skip activation test
- View SKILL.md content
```

### 🚨 RULE #6: Run Activation Test (if requested)
1. Extract sample triggers from "When to Use" section
2. Present 2-3 test prompts to user
3. Ask user to pick one or provide custom
4. Execute skill by reading SKILL.md and following instructions
5. Report activation results

### 🚨 RULE #7: Generate Final Report
Report MUST include:
- Structure validation pass/fail
- Content validation pass/fail
- Activation test pass/fail (if run)
- Issues found (if any)
- Recommendations (if any)
- Overall status: PASS/WARNINGS/FAIL

### Validation Checks Table
| Category | Check | Pass Condition |
|----------|-------|----------------|
| Structure | SKILL.md exists | File present |
| Structure | Frontmatter valid | Has name + description |
| Structure | references.md | File exists (optional) |
| Structure | cookbook/ | Directory exists (optional) |
| Content | When to Use | Section present with triggers |
| Content | Description | Under 1024 characters |
| Content | SKILL.md size | Under 500 lines |
| Content | Cookbook refs | All files exist |
| MCP | JSON valid | Parses without errors |
| MCP | mcpServers | Object present |

### Test Report Format
```
🧪 Skill Test Report: <skill-name>
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

STRUCTURE VALIDATION
  ✅ SKILL.md exists
  ✅ Frontmatter valid
  ⚠️  references.md exists
  ✅ cookbook/ directory

CONTENT VALIDATION
  ✅ "When to Use" section
  ✅ Description < 1024 chars (456)
  ✅ SKILL.md < 500 lines (287)
  ✅ Cookbook refs valid

OVERALL: ✅ PASS
```

### Anti-Patterns
- ❌ DON'T skip structure validation (foundation of quality)
- ❌ DON'T fail on missing optional files (warn instead)
- ❌ DON'T run activation test without user consent
- ❌ DON'T generate complex test prompts (keep simple)
- ❌ DON'T forget to suggest fixes for failures

### REMEMBER AFTER COMPACTION
- Test has 2-3 phases: Structure → Content → [Activation if requested]
- Always generate full report with pass/fail indicators
- Activation test is optional (ask first)
- Warn on optional files missing, fail on required files
- Suggest fixes for any validation failures

<!-- COMPACT_SUMMARY_END -->

---

## Workflow

### STEP 1: Select skill to test

If SKILL_NAME not provided, list available skills:

```bash
ls -d .claude/skills/*/ 2>/dev/null | xargs -I {} basename {}
```

Then ask user:

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "Which skill would you like to test?",
  "header": "Select Skill",
  "multiSelect": false,
  "options": [
    {"label": "<skill-1>", "description": "<description from frontmatter>"},
    {"label": "<skill-2>", "description": "<description from frontmatter>"},
    {"label": "<skill-3>", "description": "<description from frontmatter>"}
  ]
}]</parameter>
</invoke>
```

### STEP 2: Read skill metadata

Read SKILL.md and extract:
- Name and description
- "When to Use" section (activation triggers)
- Cookbook entries (if any)
- Quick reference section

### STEP 3: Run validation checks

```
🧪 Testing: supabase-swift
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Structure Validation:
  ✅ SKILL.md exists
  ✅ Frontmatter has name and description
  ✅ references.md exists
  ✅ cookbook/ directory found (2 entries)
  ⚠️ No .mcp.json (MCP not configured)

Content Validation:
  ✅ "When to Use" section present
  ✅ Description under 1024 characters
  ✅ SKILL.md under 500 lines (current: 287)
  ✅ All cookbook files referenced in SKILL.md

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### STEP 4: Test activation (optional)

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "Would you like to test skill activation with a sample prompt?",
  "header": "Activation Test",
  "multiSelect": false,
  "options": [
    {"label": "Yes, test activation (Recommended)", "description": "I'll simulate using the skill"},
    {"label": "Skip activation test", "description": "Structure validation is enough"},
    {"label": "View SKILL.md content", "description": "Read the full skill instructions"}
  ]
}]</parameter>
</invoke>
```

If user wants activation test:

1. **Extract sample triggers** from "When to Use" section
2. **Present test prompts** based on triggers:
   ```
   Sample prompts that should activate this skill:

   1. "Help me set up Supabase authentication in Swift"
   2. "Create CRUD operations for my database"
   3. "How do I query Supabase from iOS?"
   ```
3. **Ask user to pick one** or provide custom prompt
4. **Execute the skill** by reading SKILL.md and following instructions
5. **Report results**

### STEP 5: Show test results

```
🧪 Test Results: supabase-swift
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Structure:     ✅ PASS (5/5 checks)
Content:       ✅ PASS (4/4 checks)
Activation:    ✅ PASS (skill triggered correctly)
MCP Config:    ⚠️ NOT CONFIGURED

Overall: ✅ SKILL IS FUNCTIONAL

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### STEP 6: Offer next actions

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "What would you like to do?",
  "header": "Next Action",
  "multiSelect": false,
  "options": [
    {"label": "Test another skill", "description": "Validate a different skill"},
    {"label": "Edit this skill", "description": "Fix issues or improve"},
    {"label": "Use this skill now", "description": "Start working with it"},
    {"label": "Done", "description": "Exit skill testing"}
  ]
}]</parameter>
</invoke>
```

---

## Validation Checks

### Structure Checks

| Check | Pass Condition |
|-------|----------------|
| SKILL.md exists | File present in skill directory |
| Frontmatter valid | Has `name:` and `description:` |
| references.md | File exists (optional but recommended) |
| cookbook/ | Directory exists if referenced in SKILL.md |
| .mcp.json | Valid JSON if present |

### Content Checks

| Check | Pass Condition |
|-------|----------------|
| When to Use | Section present with activation triggers |
| Description length | Under 1024 characters |
| SKILL.md size | Under 500 lines |
| Cookbook references | All referenced files exist |
| No broken links | All local file references valid |

### MCP Checks (if .mcp.json exists)

| Check | Pass Condition |
|-------|----------------|
| Valid JSON | Parses without errors |
| Has mcpServers | Contains mcpServers object |
| Command exists | Command is npx or valid executable |
| Env vars documented | Any ${VAR} has comments |

---

## Test Report Format

```
🧪 Skill Test Report: <skill-name>
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

STRUCTURE VALIDATION
  [✅|❌] SKILL.md exists
  [✅|❌] Frontmatter valid (name, description)
  [✅|⚠️] references.md exists
  [✅|⚠️] cookbook/ directory
  [✅|⚠️] .mcp.json present

CONTENT VALIDATION
  [✅|❌] "When to Use" section
  [✅|❌] Description < 1024 chars (<current> chars)
  [✅|❌] SKILL.md < 500 lines (<current> lines)
  [✅|❌] All cookbook files exist

ACTIVATION TEST
  [✅|❌] Skill triggered on test prompt
  [✅|❌] Produced expected output format

ISSUES FOUND
  - <issue 1>
  - <issue 2>

RECOMMENDATIONS
  - <suggestion 1>
  - <suggestion 2>

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Overall: [✅ PASS | ⚠️ WARNINGS | ❌ FAIL]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## Error Handling

### Skill Not Found
```
❌ Skill "<name>" not found.

Available skills:
  - ui-components
  - api-integration

Use /agileflow:skill:list to see all skills.
```

### No Skills Installed
```
❌ No skills to test.

Create a skill first: /agileflow:skill:create
```

### Validation Failed
```
❌ Skill "<name>" has issues:

  ❌ Missing SKILL.md frontmatter
  ❌ Description exceeds 1024 characters (1523)
  ⚠️ No "When to Use" section

Fix with: /agileflow:skill:edit <name>
```

---

## Usage

```bash
# Interactive mode
/agileflow:skill:test

# Test specific skill
/agileflow:skill:test supabase-swift
```
