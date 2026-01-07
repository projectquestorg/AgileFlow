---
description: Remove an installed skill from .claude/skills/
argument-hint: [SKILL_NAME] (optional)
compact_context:
  priority: medium
  preserve_rules:
    - "ACTIVE COMMAND: /agileflow:skill:delete - Removes installed skills"
    - "MUST list available skills if SKILL_NAME not provided"
    - "MUST show exactly what will be deleted (tree view of files)"
    - "MUST ask for explicit confirmation before deletion (no undo)"
    - "MUST offer backup option before deletion"
    - "MUST create backup in .claude/skills-backup/ if requested"
    - "NEVER delete without explicit user confirmation"
  state_fields:
    - selected_skill_for_deletion
    - backup_created
---

# /agileflow:skill:delete

Remove a skill from `.claude/skills/`.

---

<!-- COMPACT_SUMMARY_START -->

## 🚨 COMPACT SUMMARY - /agileflow:skill:delete IS ACTIVE

**CRITICAL**: This command deletes skills with full safety features and backup options.

### 🚨 RULE #1: Select Skill
If SKILL_NAME not provided:
```bash
ls -d .claude/skills/*/ | xargs -I {} basename {}
```
Show options and ask user which to delete.

### 🚨 RULE #2: Show Exactly What Will Be Deleted
Display complete tree view:
```
⚠️  About to delete: skill-name
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
This will permanently remove:
  .claude/skills/skill-name/
  ├── SKILL.md
  ├── references.md
  ├── cookbook/
  │   ├── use-case-1.md
  │   └── use-case-2.md
  └── .mcp.json

Total: 5 files in 2 directories
```

### 🚨 RULE #3: Ask for Confirmation
Multiple confirmation levels:
1. **First ask**: "Are you sure?" (show file tree)
2. **Options**:
   - "Yes, delete permanently" - Proceed with deletion
   - "No, keep it" - Cancel
   - "Export first" - Create backup first

### 🚨 RULE #4: Handle Backup Request
If user chooses "Export first":
```bash
mkdir -p .claude/skills-backup/
cp -r .claude/skills/<skill> .claude/skills-backup/<skill>-$(date +%Y%m%d-%H%M%S)/
```
Show backup location, then return to confirmation.

### 🚨 RULE #5: Execute Deletion
After confirmed deletion:
```bash
rm -rf .claude/skills/<skill>/
```
Show confirmation message with success emoji.

### 🚨 RULE #6: Offer Next Actions
After deletion, ask:
```
What would you like to do next?
- Delete another skill
- Create new skill
- List remaining skills
- Done
```

### Safety Features
| Feature | Purpose |
|---------|---------|
| Show file tree | User sees EXACTLY what's deleted |
| Explicit confirmation | Can't accidentally delete |
| Backup option | Can recover if needed |
| One at a time | No batch delete accidents |
| Timestamp in backup | Identify which version backed up |

### Backup Location
```
.claude/skills-backup/<skill>-<YYYYMMDD-HHMMSS>/
```

Example:
```
.claude/skills-backup/supabase-swift-20251227-143052/
├── SKILL.md
├── references.md
├── cookbook/
└── .mcp.json
```

### Anti-Patterns
- ❌ DON'T delete without showing file tree
- ❌ DON'T proceed without explicit confirmation
- ❌ DON'T skip backup option offer
- ❌ DON'T allow batch/wildcard deletes (one at a time)
- ❌ DON'T delete without confirming again if backup created

### REMEMBER AFTER COMPACTION
- Delete is always: Select → Show tree → Ask confirm → [Backup if requested] → Delete → Show next actions
- NEVER delete without explicit confirmation
- Always offer backup option before deletion
- Backup goes to .claude/skills-backup/ with timestamp
- One skill at a time (no batch delete)

<!-- COMPACT_SUMMARY_END -->

---

## Workflow

### STEP 1: Select skill to delete

If SKILL_NAME not provided, list available skills:

```bash
ls -d .claude/skills/*/ 2>/dev/null | xargs -I {} basename {}
```

Then ask user:

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "Which skill would you like to delete?",
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

### STEP 2: Show skill contents

Display what will be deleted:

```
⚠️  About to delete: supabase-swift
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

This will permanently remove:
  .claude/skills/supabase-swift/
  ├── SKILL.md
  ├── references.md
  ├── cookbook/
  │   ├── crud-operations.md
  │   └── authentication.md
  └── .mcp.json

Total: 5 files in 2 directories

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### STEP 3: Confirm deletion

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "Are you sure you want to delete this skill? This cannot be undone.",
  "header": "Confirm Delete",
  "multiSelect": false,
  "options": [
    {"label": "Yes, delete permanently", "description": "Remove the skill and all its files"},
    {"label": "No, keep it", "description": "Cancel and return"},
    {"label": "Export first", "description": "Save a backup before deleting"}
  ]
}]</parameter>
</invoke>
```

### STEP 4: Handle export (if requested)

If user chose "Export first":

1. Create backup directory: `.claude/skills-backup/`
2. Copy skill to backup with timestamp:
   ```bash
   cp -r .claude/skills/<skill> .claude/skills-backup/<skill>-$(date +%Y%m%d-%H%M%S)/
   ```
3. Show backup location
4. Return to confirmation

### STEP 5: Delete skill

```bash
rm -rf .claude/skills/<skill>/
```

### STEP 6: Confirm deletion

```
✅ Deleted: supabase-swift

The skill has been permanently removed from .claude/skills/
```

### STEP 7: Offer next actions

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "What would you like to do next?",
  "header": "Next Action",
  "multiSelect": false,
  "options": [
    {"label": "Delete another skill", "description": "Remove more skills"},
    {"label": "Create new skill", "description": "Generate a replacement skill"},
    {"label": "List remaining skills", "description": "See what's still installed"},
    {"label": "Done", "description": "Exit skill management"}
  ]
}]</parameter>
</invoke>
```

---

## Backup Location

Backups are stored in:
```
.claude/skills-backup/<skill>-<timestamp>/
```

Example:
```
.claude/skills-backup/supabase-swift-20251227-143052/
├── SKILL.md
├── references.md
├── cookbook/
└── .mcp.json
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
❌ No skills to delete.

No skills are currently installed in .claude/skills/
```

### Delete Failed
```
❌ Failed to delete skill: <error message>

The skill directory may be in use or have permission issues.
Try manually: rm -rf .claude/skills/<skill>/
```

---

## Safety Features

1. **Always confirm** - Never delete without explicit confirmation
2. **Show contents** - Display exactly what will be removed
3. **Export option** - Allow backup before deletion
4. **No batch delete** - One skill at a time for safety

---

## Usage

```bash
# Interactive mode
/agileflow:skill:delete

# Delete specific skill
/agileflow:skill:delete supabase-swift
```
