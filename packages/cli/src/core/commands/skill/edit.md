---
description: Edit an existing skill's SKILL.md, cookbook entries, or references
argument-hint: [SKILL_NAME] (optional)
compact_context:
  priority: medium
  preserve_rules:
    - "ACTIVE COMMAND: /agileflow:skill:edit - Modifies existing skills"
    - "MUST list available skills if SKILL_NAME not provided"
    - "MUST show skill structure before asking what to edit"
    - "MUST offer special edits: rename, add cookbook, full rewrite (Plan Mode)"
    - "MUST preview changes with diff before writing"
    - "MUST ask for confirmation before any file writes"
    - "For full rewrite: MUST enter Plan Mode and research before regenerating"
  state_fields:
    - selected_skill
    - edit_target_file
    - has_changes_pending
---

# /agileflow:skill:edit

Modify an existing skill in `.claude/skills/`.

---

<!-- COMPACT_SUMMARY_START -->

## 🚨 COMPACT SUMMARY - /agileflow:skill:edit IS ACTIVE

**CRITICAL**: This command modifies existing skills with preview and confirmation.

### 🚨 RULE #1: Select Skill
If SKILL_NAME not provided:
```bash
ls -d .claude/skills/*/ | xargs -I {} basename {}
```
Show options and ask user which to edit.

### 🚨 RULE #2: Show Skill Structure
Display current skill contents before asking what to edit:
```
📝 Editing: skill-name
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Files:
  1. SKILL.md (main skill file)
  2. references.md (documentation links)
  3. cookbook/use-case-1.md
  4. cookbook/use-case-2.md
  5. .mcp.json (MCP configuration)
```

### 🚨 RULE #3: Ask What to Edit
Offer these options:
1. **SKILL.md** - Main skill instructions
2. **references.md** - Update documentation links
3. **Cookbook entry** - Edit specific use-case workflow
4. **Add new cookbook** - Create new use-case workflow
5. **MCP configuration** - Modify MCP server settings
6. **Rename skill** - Change skill name and folder

### 🚨 RULE #4: Read Current Content
Before editing, always read the file:
```bash
cat .claude/skills/<skill>/<file>
```

### 🚨 RULE #5: Preview Before Writing
For any change:
1. Show diff preview (- old, + new)
2. Ask for confirmation
3. Only write if confirmed

### 🚨 RULE #6: Special Edits
| Edit Type | Process |
|-----------|---------|
| Full rewrite | Enter Plan Mode, research, generate with approval |
| Rename | Validate name, create new dir, copy files, update frontmatter, delete old |
| Add cookbook | Create from template, update SKILL.md references |
| Regular edits | Read → Edit → Preview → Confirm → Write |

### 🚨 RULE #7: For Full Rewrite
If user selects "Full rewrite (Recommended)":
1. Enter Plan Mode
2. Research web/local/codebase again
3. Show updated plan to user
4. Get approval
5. Exit Plan Mode
6. Regenerate the file with new research

### Critical Edit Operations
| Operation | Check | Action |
|-----------|-------|--------|
| Rename | Name is valid | Copy dir + update frontmatter + delete old |
| Add cookbook | Template ready | Create file + update SKILL.md |
| Change SKILL.md | Diff ready | Show preview + confirm + write |
| Modify references.md | Links valid | Show preview + confirm + write |

### Anti-Patterns
- ❌ DON'T modify files without preview
- ❌ DON'T skip diff confirmation
- ❌ DON'T rename without validating new name
- ❌ DON'T offer "full rewrite" without Plan Mode
- ❌ DON'T leave skill in broken state (always backup before changes)

### REMEMBER AFTER COMPACTION
- Edit is always: Select → Show structure → Ask what → Read → Edit → Preview → Confirm → Write
- Full rewrite means Plan Mode + research + approval
- Always show diffs before writing
- Rename requires copying and updating frontmatter
- New cookbook entries need SKILL.md updated too

<!-- COMPACT_SUMMARY_END -->

---

## Workflow

### STEP 1: Select skill to edit

If SKILL_NAME not provided, list available skills:

```bash
ls -d .claude/skills/*/ 2>/dev/null | xargs -I {} basename {}
```

Then ask user:

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "Which skill would you like to edit?",
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

### STEP 2: Show skill structure

Display current skill contents:

```
📝 Editing: supabase-swift
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Files:
  1. SKILL.md (main skill file)
  2. references.md (documentation links)
  3. cookbook/crud-operations.md
  4. cookbook/authentication.md
  5. .mcp.json (MCP configuration)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### STEP 3: Ask what to edit

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "What would you like to modify?",
  "header": "Edit Target",
  "multiSelect": false,
  "options": [
    {"label": "SKILL.md", "description": "Edit main skill instructions"},
    {"label": "references.md", "description": "Update documentation links"},
    {"label": "Cookbook entry", "description": "Edit a specific workflow"},
    {"label": "Add new cookbook", "description": "Create a new workflow"},
    {"label": "MCP configuration", "description": "Modify MCP server settings"},
    {"label": "Rename skill", "description": "Change skill name and folder"}
  ]
}]</parameter>
</invoke>
```

### STEP 4: Read current content

Read the selected file:

```bash
cat .claude/skills/<skill>/<file>
```

### STEP 5: Ask for changes

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "How would you like to modify this file?",
  "header": "Edit Mode",
  "multiSelect": false,
  "options": [
    {"label": "Describe changes", "description": "Tell me what to change and I'll update it"},
    {"label": "Add content", "description": "Append new sections or examples"},
    {"label": "Replace section", "description": "Rewrite a specific section"},
    {"label": "Full rewrite", "description": "Regenerate with research (Recommended)"},
    {"label": "Cancel", "description": "Return without changes"}
  ]
}]</parameter>
</invoke>
```

### STEP 6: Apply changes

Based on user's choice:

**For "Describe changes":**
- Read current file
- Apply user's described modifications
- Show diff preview
- Confirm with YES/NO

**For "Full rewrite":**
- Enter plan mode to research
- Gather updated web docs, local docs, codebase patterns
- Regenerate file with new research
- Show diff preview
- Confirm with YES/NO

### STEP 7: Show diff and confirm

```
📝 Changes to SKILL.md:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

- old line
+ new line

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "Apply these changes?",
  "header": "Confirm",
  "multiSelect": false,
  "options": [
    {"label": "Yes, save changes", "description": "Write the updated file"},
    {"label": "No, discard", "description": "Cancel without saving"},
    {"label": "Edit more", "description": "Make additional changes first"}
  ]
}]</parameter>
</invoke>
```

### STEP 8: Write changes

If confirmed:
1. Write updated file
2. Show success message
3. Offer next actions

---

## Special Edits

### Rename Skill

1. Get new name from user
2. Validate: letters, numbers, hyphens only
3. Create new directory: `.claude/skills/<new-name>/`
4. Copy all files
5. Update `name:` in SKILL.md frontmatter
6. Delete old directory
7. Confirm completion

### Add Cookbook Entry

1. Ask for use case name
2. Create `cookbook/<use-case>.md` from template
3. Update SKILL.md to reference new cookbook
4. Show diff and confirm

---

## Cookbook Template

```markdown
# <Use Case Title>

<Brief description of this workflow.>

## Prerequisites

- <Prerequisite 1>
- <Prerequisite 2>

## Instructions

1. **<Step 1>**:
   <Details>

2. **<Step 2>**:
   ```<language>
   <code example>
   ```

3. **<Step 3>**:
   <Details>

## Example

**Input**: <sample>
**Output**: <result>

## Troubleshooting

- **<Problem>**: <Solution>
```

---

## Error Handling

### Skill Not Found
```
❌ Skill "<name>" not found.

Available skills:
  - supabase-swift
  - ui-components

Use /agileflow:skill:list to see all skills.
```

### No Skills Installed
```
❌ No skills installed yet.

Create a skill first: /agileflow:skill:create
```

---

## Usage

```bash
# Interactive mode
/agileflow:skill:edit

# Edit specific skill
/agileflow:skill:edit supabase-swift
```
