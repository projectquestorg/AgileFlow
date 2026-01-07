---
description: List all installed skills with their descriptions and status
argument-hint: (no arguments)
compact_context:
  priority: medium
  preserve_rules:
    - "ACTIVE COMMAND: /agileflow:skill:list - Shows installed skills inventory"
    - "MUST scan .claude/skills/ directory for all skill subdirectories"
    - "MUST extract name/description from each SKILL.md frontmatter"
    - "MUST count supporting files (cookbook/*, references.md, .mcp.json)"
    - "MUST show MCP status indicator if .mcp.json exists"
    - "MUST offer skill management actions after listing"
  state_fields:
    - skills_found_count
    - has_mcp_skills
---

# /agileflow:skill:list

Display all skills installed in `.claude/skills/` with their metadata.

---

<!-- COMPACT_SUMMARY_START -->

## 🚨 COMPACT SUMMARY - /agileflow:skill:list IS ACTIVE

**CRITICAL**: This command inventories all installed skills and their metadata.

### 🚨 RULE #1: Check Directory Exists
```bash
ls -la .claude/skills/ 2>/dev/null
```
If directory missing or empty, show helpful message to create a skill.

### 🚨 RULE #2: Scan Each Skill
For EACH subdirectory in `.claude/skills/`:
1. Read SKILL.md frontmatter for `name:` and `description:`
2. Count supporting files:
   - cookbook/*.md (all files)
   - references.md (if exists)
   - .mcp.json (if exists)
3. Check for MCP: If `.mcp.json` exists, mark "MCP: ✓"

### 🚨 RULE #3: Format Output
Display in clean table format:
```
📦 Installed Skills (N total)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
skill-name              Description here     MCP: ✓
  └─ X files: file1, file2, file3
```

### 🚨 RULE #4: Show File Count
- Total files per skill (SKILL.md + references.md + cookbook/*.md + .mcp.json)
- List cookbook files by name (only cookbook/, not full path)
- Note MCP configuration status

### 🚨 RULE #5: Offer Actions After Listing
After showing all skills, ask:
```
What would you like to do?
- Create new skill
- Edit a skill
- Delete a skill
- Test a skill
- Done
```

### Critical Output Elements
| Element | Shows |
|---------|-------|
| Total count | "N total" in header |
| Skill names | From SKILL.md `name:` field |
| Description | From SKILL.md `description:` field |
| File count | Total files in skill directory |
| MCP status | "✓" if .mcp.json exists, nothing otherwise |

### Anti-Patterns
- ❌ DON'T fail if directory doesn't exist (create helpful message)
- ❌ DON'T list hidden files or system files
- ❌ DON'T show full file paths (just filenames)
- ❌ DON'T try to parse corrupt SKILL.md (skip with warning)
- ❌ DON'T forget to offer next actions

### REMEMBER AFTER COMPACTION
- List is inventory-only, no modifications
- Always scan .claude/skills/ directory
- Extract metadata from SKILL.md frontmatter
- Show file counts and MCP status indicators
- Offer management actions after listing

<!-- COMPACT_SUMMARY_END -->

---

## Output Format

```
📦 Installed Skills (X total)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

SKILL NAME              DESCRIPTION                           FILES
─────────────────────────────────────────────────────────────────────
supabase-swift          Supabase database operations          4 files
  └─ cookbook/crud-operations.md, cookbook/auth.md

ui-components           React component patterns              3 files
  └─ cookbook/create-component.md

api-integration         REST API client patterns              2 files

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## Workflow

### STEP 1: Check for skills directory

```bash
ls -la .claude/skills/ 2>/dev/null
```

If directory doesn't exist or is empty:
```
No skills installed yet.

To create a skill, run: /agileflow:skill:create
```

### STEP 2: Scan each skill directory

For each subdirectory in `.claude/skills/`:

1. **Read SKILL.md frontmatter** to extract:
   - `name` - skill identifier
   - `description` - skill purpose

2. **Count supporting files**:
   - cookbook/*.md
   - tools/*
   - .mcp.json (if present)
   - references.md (if present)

3. **Check for MCP integration**:
   - If `.mcp.json` exists, note "MCP: ✓"

### STEP 3: Format output

```
📦 Installed Skills (3 total)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

supabase-swift                                        MCP: ✓
  Supabase database operations for Swift apps
  └─ 4 files: cookbook/crud.md, cookbook/auth.md, references.md, .mcp.json

ui-components
  React component patterns with accessibility
  └─ 3 files: cookbook/create.md, cookbook/styling.md, references.md

api-integration
  REST API client patterns with error handling
  └─ 2 files: SKILL.md, references.md

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### STEP 4: Offer next actions

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "What would you like to do?",
  "header": "Skill Actions",
  "multiSelect": false,
  "options": [
    {"label": "Create new skill", "description": "Generate a new skill with research"},
    {"label": "Edit a skill", "description": "Modify an existing skill"},
    {"label": "Delete a skill", "description": "Remove a skill"},
    {"label": "Test a skill", "description": "Verify a skill works correctly"},
    {"label": "Done", "description": "Exit skill management"}
  ]
}]</parameter>
</invoke>
```

---

## Skill Metadata Parsing

**SKILL.md Frontmatter Example:**
```yaml
---
name: supabase-swift
description: Use when building Swift apps with Supabase database operations
---
```

**Parse with:**
```bash
head -10 .claude/skills/<skill>/SKILL.md | grep -E "^(name|description):"
```

---

## Error Handling

### No Skills Directory
```
📦 No skills installed yet.

Skills are stored in .claude/skills/ and can be created with:
  /agileflow:skill:create

This will research best practices and generate a contextual skill.
```

### Invalid Skill (Missing SKILL.md)
Skip directories without SKILL.md and note:
```
⚠️ Skipped: <dirname>/ (missing SKILL.md)
```

### Corrupted Frontmatter
If frontmatter can't be parsed:
```
⚠️ <skill>: Could not parse frontmatter
```

---

## Usage

```bash
# List all installed skills
/agileflow:skill:list
```

---

## POST-LISTING ACTIONS

After displaying the skill inventory, offer actions:

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "What would you like to do?",
  "header": "Actions",
  "multiSelect": false,
  "options": [
    {"label": "Create new skill", "description": "Build a research-backed custom skill"},
    {"label": "Test a skill", "description": "Verify a skill works correctly"},
    {"label": "Edit a skill", "description": "Modify an existing skill"},
    {"label": "Done", "description": "Exit"}
  ]
}]</parameter>
</invoke>
```

**If "Create new skill"**:
- Run `/agileflow:skill:create`

**If "Test a skill"**:
- Ask which skill to test
- Run `/agileflow:skill:test SKILL=<selected>`

**If "Edit a skill"**:
- Ask which skill to edit
- Run `/agileflow:skill:edit SKILL=<selected>`

---

## Related Commands

- `/agileflow:skill:create` - Build new research-backed skill
- `/agileflow:skill:test` - Test a skill with sample inputs
- `/agileflow:skill:edit` - Modify an existing skill
- `/agileflow:skill:delete` - Remove a skill
- `/agileflow:skill:upgrade` - Update skill with new patterns
