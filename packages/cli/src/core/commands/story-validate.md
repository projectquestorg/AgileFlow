---
description: Validate story completeness before development
argument-hint: STORY=<US-ID>
compact_context:
  priority: high
  preserve_rules:
    - "STORY ID is REQUIRED - always ask if missing"
    - "Read story file FIRST from docs/06-stories/"
    - "Run 7 validation checks: sections, AC, architecture context, completeness, dev record, insights, cross-story"
    - "Architecture Context CRITICAL - must have real citations [Source: architecture/file.md#section]"
    - "AC format CRITICAL - strict Given/When/Then required (not bullet points)"
    - "Dev Agent Record: structure only (content placeholders OK at draft/ready stage)"
    - "Generate report with passed/failed/warnings sections"
    - "Determine if story 'ready for development' (YES/NO)"
  state_fields:
    - story_id
    - validation_passed
    - validation_warnings
    - validation_failures
---

# story-validate

Validate a specific story for completeness, architecture context, and readiness for development.

---

## STEP 0: Gather Context

```bash
node .agileflow/scripts/obtain-context.js story-validate
```

---

## Context Loading (Documentation)

**PURPOSE**: Immediately load full context before executing any logic.

**ACTIONS**:
1. Read this command file (`.agileflow/commands/story-validate.md`) in its entirety
2. Absorb all instructions, rules, and examples
3. Proceed to execution phase with complete context

**WHY**: Prevents incomplete instruction loading and ensures consistent behavior.

---

<!-- COMPACT_SUMMARY_START -->
## Compact Summary
- **Command**: /agileflow:story-validate
- **Purpose**: Validate story completeness and readiness for development
- **Arguments**: STORY=<US-ID>
- **TodoList**: Required for tracking 7-step validation workflow
- **Validation Checks**:
  1. Required sections presence (metadata, description, AC, Architecture Context, etc.)
  2. Architecture Context validation (populated with real source citations)
  3. Acceptance Criteria validation (Given/When/Then format, 2-5 criteria)
  4. Story completeness (estimation, dependencies, owner, status)
  5. Dev Agent Record structure (placeholders OK at ready/draft stage)
  6. Previous Story Insights (if not first story in epic)
  7. Cross-story consistency (epic alignment, capacity, dependencies)
- **Output Format**: Validation report with ✅ PASSED, ❌ FAILED, ⚠️ WARNINGS sections
- **Report Sections**: Summary, Next Steps, Ready for Development YES/NO
- **Architecture Context**: CRITICAL - must have real citations [Source: architecture/{file}.md#{section}]
- **AC Format**: Strict Given/When/Then required (not bullet points)
- **Read-Only**: Never modifies story, only validates
- **Exit Code**: 0 if ready, 1 if issues found
- **Related**: Story template, Architecture docs, status.json

**Tool Usage Examples**:

TodoWrite:
```xml
<invoke name="TodoWrite">
<parameter name="content">1. Parse story ID from input
2. Load story file from docs/06-stories/
3. Parse YAML frontmatter and extract sections
4. Run validation checks (7 categories)
5. Count passed/failed/warnings
6. Generate comprehensive report
7. Provide next steps recommendation</parameter>
<parameter name="status">in-progress</parameter>
</invoke>
```

AskUserQuestion:
```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "Story has 3 warnings. Continue with validation?",
  "header": "Story Validation",
  "multiSelect": false,
  "options": [
    {"label": "Show full report", "description": "Display all validation results"},
    {"label": "Cancel", "description": "Exit validation"}
  ]
}]</parameter>
</invoke>
```

<!-- COMPACT_SUMMARY_END -->

---

## Prompt

ROLE: Story Validator

TODO LIST TRACKING
**CRITICAL**: Immediately create a todo list using TodoWrite tool to track story validation:
```
1. Parse story ID from input or ask user
2. Load story file from docs/06-stories/
3. Parse YAML frontmatter and extract sections
4. Run validation checks (sections, Architecture Context, AC, completeness, Dev Agent Record, Previous Story Insights, cross-story consistency)
5. Count passed/failed/warnings
6. Generate comprehensive validation report
7. Provide next steps recommendation
```

Mark each step complete as you finish it. This ensures thorough validation.

OBJECTIVE
Comprehensively analyze and validate that a story is complete, well-structured, and ready for implementation. Evaluate each aspect critically and assess readiness:
1. All required sections present (per story template)
2. Architecture Context populated with source citations
3. Clear, testable Acceptance Criteria
4. Dev Agent Record structure
5. Dependencies documented
6. Realistic estimation

SCOPE
- Validating individual user stories in docs/06-stories/
- Checking story completeness before assignment to dev agents
- Verifying Architecture Context extraction
- Ensuring compliance with story template structure
- NOT modifying stories (read-only validation)

VALIDATION CHECKLIST

## 1. Required Sections Presence

Check that story file has all required sections:
- ✓ Story metadata (YAML frontmatter with: story_id, epic, title, owner, status, estimate, created, updated, dependencies)
- ✓ Story header (# {{STORY_ID}}: {{TITLE}})
- ✓ Description
- ✓ Acceptance Criteria (with Given/When/Then format)
- ✓ Architecture Context section with subsections:
  - Data Models & Schemas
  - API Specifications
  - Component Specifications
  - File Locations & Naming
  - Testing Requirements
  - Technical Constraints
- ✓ Technical Notes
- ✓ Testing Strategy
- ✓ Dependencies
- ✓ Dev Agent Record section (structure/placeholders acceptable at ready/draft stage)
- ✓ Previous Story Insights section (if applicable to epic)

## 2. Architecture Context Validation (CRITICAL)

**Verify Architecture Context is populated**:
- Architecture Context section exists
- Each subsection (Data Models, API Specs, Components, etc.) has content
- Content includes source citations: `[Source: architecture/{filename}.md#{section}]`
- All sources reference docs/04-architecture/ files
- Technical details are extracted (NOT invented) from actual docs
- If subsection is empty, explicitly states: "No specific guidance found in architecture docs"

**Sources must be real**:
- Format: `[Source: architecture/{filename}.md#{section}]` or `[Source: docs/04-architecture/{filename}.md#{section}]`
- Check that files referenced actually exist in docs/04-architecture/
- Verify section anchors make sense for the file

## 3. Acceptance Criteria Validation

**Check AC clarity and testability**:
- Minimum 2, maximum 5 acceptance criteria
- Uses Given/When/Then format (not bullet points alone)
- Each criterion is specific and measurable
- Criteria reference implementation details (not just descriptions)
- Example GOOD: "Given a valid email, When form submitted, Then confirmation email sent within 30s"
- Example BAD: "User can reset password" (too vague)

## 4. Story Completeness Checks

**Estimation**:
- Estimate exists and is one of: 0.5d, 1d, 2d
- For estimates >2d: suggest breaking story into smaller pieces

**Dependencies**:
- If dependencies exist, check format: "Depends on US-#### (description)"
- Verify referenced stories exist in status.json
- Check for circular dependencies

**Owner Assignment**:
- Owner is assigned: AG-UI, AG-API, AG-CI, or AG-DEVOPS
- Owner is appropriate for story scope

**Status**:
- Status is one of: ready, draft, in-progress, blocked, in-review, done
- If "draft": story not yet ready for assignment (AC or AC need work)
- If "ready": story is ready for development
- If "blocked": reason documented in dependencies section

## 5. Dev Agent Record Structure

**Check structure is present** (content may be empty at ready/draft stage):
- Section exists with subsections:
  - Agent Model & Version (placeholder OK: "To be populated during implementation")
  - Completion Notes (placeholder OK)
  - Issues Encountered (placeholder OK)
  - Lessons Learned (placeholder OK)
  - Files Modified (placeholder OK)
  - Debug References (placeholder OK)
- Comments explain when section will be populated: "POPULATED BY DEVELOPMENT AGENT DURING IMPLEMENTATION"

## 6. Previous Story Insights

**If epic has multiple stories** (not first story):
- Section exists
- References previous story ID: {{PREV_STORY_ID}}
- Contains insights:
  - Key learnings from previous story
  - Architectural patterns that worked
  - Technical debt discovered
  - Challenges from previous story to avoid

**If first story in epic**:
- Section may reference non-existent previous story (acceptable)
- Or explicitly state: "First story in this epic, no previous story insights"

## 7. Cross-Story Consistency

**Check story aligns with epic**:
- Story's epic field matches actual epic
- Story's acceptance criteria align with epic requirements
- Story fits within epic's overall goal

**Check story fits team capacity**:
- Estimate (0.5d-2d) is realistic for story scope
- Owner (if assigned) has capacity
- Dependencies don't block critical path

OUTPUT FORMAT

Display validation results in clear format:

```
🔍 Story Validation Report
==========================
Story: {{STORY_ID}} - {{TITLE}}
File: {{FILE_PATH}}
Status: {{STATUS}}

✅ PASSED (X checks)
------------------
[List all passed checks]

❌ FAILED (X issues)
-------------------
Issue 1: {{DESCRIPTION}}
  Location: {{SECTION}} line {{N}}
  Suggestion: {{FIX}}

Issue 2: {{DESCRIPTION}}
  Location: {{SECTION}} line {{N}}
  Suggestion: {{FIX}}

⚠️  WARNINGS (X issues)
-----------------------
Warning 1: {{DESCRIPTION}}
  Suggestion: {{FIX}}

📊 SUMMARY
----------
Architecture Context: {{✓ populated | ⚠️  partial | ❌ missing}}
Acceptance Criteria: {{✓ clear | ⚠️  unclear | ❌ missing}}
Dependencies: {{✓ documented | ⚠️  unclear | ❌ missing}}
Dev Agent Record: {{✓ structured | ⚠️  incomplete | ❌ missing}}
Ready for Development: {{YES | ⚠️  needs fixes | NO}}

Next Steps:
1. {{ACTION}}
2. {{ACTION}}
```

WORKFLOW

1. **Story Selection**:
   - Ask user: "Which story would you like to validate? (provide story ID like US-0001)"
   - Or: Auto-detect if run with `/agileflow:story-validate US-0001`

2. **Load Story File**:
   - Find story file: `docs/06-stories/*/{{STORY_ID}}*.md`
   - Parse YAML frontmatter
   - Extract all sections

3. **Run Validation Checks**:
   - Check all sections present (Step 1)
   - Validate Architecture Context (Step 2) - CRITICAL
   - Validate Acceptance Criteria (Step 3)
   - Check completeness (Step 4)
   - Check Dev Agent Record structure (Step 5)
   - Check Previous Story Insights (Step 6)
   - Cross-story consistency (Step 7)

4. **Generate Report**:
   - Count passed/failed/warnings
   - Group by severity
   - Provide specific suggestions for fixes
   - Determine if story is "ready for development"

5. **Next Steps Recommendation**:
   - If "ready": "Story is ready for development. Assign to owner with /agileflow:assign"
   - If warnings: "Story has X warnings. Consider addressing before assigning."
   - If failed: "Story needs X critical fixes before development can start"

RULES
- Read-only operation (never modify story)
- Always check Architecture Context citations are real files/sections
- Be strict on Acceptance Criteria format (Given/When/Then required)
- Be lenient on Dev Agent Record content at draft/ready stage (structure only)
- Suggest concrete fixes for all issues
- Color code output: ✅ green, ❌ red, ⚠️  yellow
- Exit code 0 if ready for development, 1 if issues found

FIRST ACTION

When invoked:
1. Ask user: "Which story would you like to validate? (e.g., US-0001)"
2. Or parse story ID from command: `/agileflow:story-validate US-0001`
3. Load story file
4. Run all validation checks
5. Generate comprehensive report
6. Provide next steps with connected actions

---

## POST-VALIDATION ACTIONS

After validation completes, offer context-aware next steps:

### If Story PASSES (Ready for Development)

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "Story <STORY> passed validation! What would you like to do?",
  "header": "Next Steps",
  "multiSelect": false,
  "options": [
    {"label": "Start working on it (Recommended)", "description": "Mark as in_progress and begin implementation"},
    {"label": "View story details", "description": "See full story with /agileflow:story:view"},
    {"label": "Validate another story", "description": "Check another story in this epic"},
    {"label": "Done", "description": "Exit"}
  ]
}]</parameter>
</invoke>
```

**If "Start working on it"**:
1. Run `/agileflow:status <STORY> STATUS=in_progress`
2. Ask: "Enter plan mode to explore implementation?"

### If Story HAS WARNINGS

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "Story <STORY> has <N> warnings. What would you like to do?",
  "header": "Next Steps",
  "multiSelect": false,
  "options": [
    {"label": "Fix warnings now", "description": "I'll help you address each warning"},
    {"label": "Start anyway", "description": "Warnings are acceptable, begin work"},
    {"label": "View story file", "description": "See the story content to edit manually"},
    {"label": "Done", "description": "Exit and fix later"}
  ]
}]</parameter>
</invoke>
```

**If "Fix warnings now"**:
- Walk through each warning
- Suggest specific edits
- Re-validate after fixes

### If Story FAILS (Critical Issues)

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "Story <STORY> has <N> critical issues that must be fixed. What would you like to do?",
  "header": "Fix Issues",
  "multiSelect": false,
  "options": [
    {"label": "Fix issues now (Recommended)", "description": "I'll help address each critical issue"},
    {"label": "View story file", "description": "See the story content to edit manually"},
    {"label": "Delete and recreate", "description": "Start fresh with /agileflow:story"},
    {"label": "Done", "description": "Exit and fix later"}
  ]
}]</parameter>
</invoke>
```

**If "Fix issues now"**:
- Present each issue with suggested fix
- Apply fixes with user confirmation
- Re-validate after all fixes applied

---

## Related Commands

- `/agileflow:story:view` - View story details with contextual actions
- `/agileflow:story:list` - View all stories
- `/agileflow:story` - Create new story
- `/agileflow:status` - Update story status
- `/agileflow:assign` - Assign story to owner
