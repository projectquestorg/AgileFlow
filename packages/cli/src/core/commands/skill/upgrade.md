---
description: Upgrade existing skills with self-improving learning capability
argument-hint: [SKILL_NAME] (optional)
compact_context:
  priority: medium
  preserve_rules:
    - "ACTIVE COMMAND: /agileflow:skill:upgrade - Adds learning capability to skills"
    - "MUST list available skills if SKILL_NAME not provided"
    - "MUST check if skill already has learning capability"
    - "MUST create .agileflow/skills/_learnings/<skill>.yaml learnings file"
    - "MUST add Self-Improving Learnings section to SKILL.md"
    - "MUST preserve all existing skill content (only add new sections)"
    - "MUST offer preview mode before writing changes"
    - "MUST support batch upgrade with --all flag"
  state_fields:
    - selected_skill
    - already_upgraded
    - learnings_file_created
---

# /agileflow:skill:upgrade

Add self-improving capability to existing skills created before the learning system was introduced.

---

<!-- COMPACT_SUMMARY_START -->

## 🚨 COMPACT SUMMARY - /agileflow:skill:upgrade IS ACTIVE

**CRITICAL**: This command adds learning capability to existing skills, preserving all original content.

### 🚨 RULE #1: Select Skill or Use Batch Mode
If SKILL_NAME not provided:
```bash
ls -d .claude/skills/*/ | xargs -I {} basename {}
```
Show options. Or use `--all` flag for batch upgrade.

### 🚨 RULE #2: Check Upgrade Status
Read SKILL.md and check for:
- Existing `## Self-Improving Learnings` section
- Existing `.agileflow/skills/_learnings/<skill>.yaml` file

If already upgraded:
```
✅ Skill "<skill>" already has self-improving capability!
```

### 🚨 RULE #3: Show What Will Be Added
Display changes that will be made:
```
📦 Upgrade: skill-name
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Changes to be made:

1. SKILL.md - Add sections:
   - ## Self-Improving Learnings
   - Update ## Instructions to include learning workflow

2. Create new file:
   - .agileflow/skills/_learnings/<skill>.yaml
```

### 🚨 RULE #4: Offer Preview or Direct Upgrade
Ask:
```
Proceed with upgrade?
- Yes, upgrade skill
- Preview changes first (Recommended)
- Cancel
```

### 🚨 RULE #5: Create Learnings File
Create `.agileflow/skills/_learnings/<skill>.yaml`:
```yaml
skill: <skill>
version: 1
last_updated: <timestamp>

preferences:
  # Will be added as skill is used

conventions:
  # Will be extracted from corrections

anti_patterns:
  # Things to avoid

context:
  # Project-specific learnings

examples:
  good: []
  bad: []

metadata:
  corrections_count: 0
  approvals_count: 0
  created: <timestamp>
  sessions: []
```

### 🚨 RULE #6: Update SKILL.md
Add new section AFTER "When to Use":
```markdown
## Self-Improving Learnings

This skill learns from your corrections and preferences.

**On invocation**:
1. Check if `.agileflow/skills/_learnings/<skill>.yaml` exists
2. If exists, read and apply learned preferences
3. Follow conventions and avoid anti-patterns from learnings

**On correction**:
1. When user corrects output, extract the signal
2. Determine confidence level...
3. Update the learnings file with new preference
```

Also prepend learning workflow to Instructions:
```markdown
## Instructions

1. **Load learnings** (if exists):
   - Read `.agileflow/skills/_learnings/<skill>.yaml`
   - Apply preferences, conventions, and anti-patterns

2. **Execute skill**:
   [... existing instructions ...]

3. **If user corrects**:
   - Extract signal from correction
   - Update learnings file
```

### 🚨 RULE #7: Show Success
```
✅ Skill upgraded successfully!

Modified: .claude/skills/<skill>/SKILL.md
Created:  .agileflow/skills/_learnings/<skill>.yaml

The skill will now:
• Load learned preferences on each invocation
• Extract signals from your corrections
• Build up conventions over time
• Avoid learned anti-patterns
```

### Critical Files Created/Modified
| File | Purpose | Action |
|------|---------|--------|
| SKILL.md | Main skill file | Add 2 sections + update instructions |
| .agileflow/skills/_learnings/<skill>.yaml | Learnings file | Create new |

### Learnings File Structure
```yaml
skill: <name>
version: 1
preferences: {}
conventions: []
anti_patterns: []
context: {}
examples: {good: [], bad: []}
metadata: {corrections_count: 0, approvals_count: 0, created: <ts>, sessions: []}
```

### Anti-Patterns
- ❌ DON'T upgrade already-upgraded skills (check first)
- ❌ DON'T delete existing SKILL.md content (only add sections)
- ❌ DON'T create learnings file in wrong location
- ❌ DON'T skip preview mode option (let user see changes)
- ❌ DON'T forget to document the learning workflow in Instructions

### Batch Upgrade Mode
When using `--all` flag:
1. List all skills in `.claude/skills/`
2. Filter out already-upgraded skills
3. Ask for confirmation: "Upgrade N skills?"
4. Apply upgrade to each
5. Show summary: "Upgraded N skills"

### REMEMBER AFTER COMPACTION
- Upgrade is: Select → Check status → Show changes → [Preview if requested] → Create learnings file → Update SKILL.md → Confirm success
- Learnings file goes in .agileflow/skills/_learnings/ with skill name
- NEVER delete existing content, only add new sections
- Always ask for preview confirmation before writing
- Batch mode with --all upgrades all non-upgraded skills at once

<!-- COMPACT_SUMMARY_END -->

---

## What This Does

Skills created before EP-0007 (Self-Improving Skills) don't have the learning capability. This command:

1. **Adds Self-Improving Learnings section** to SKILL.md
2. **Creates learnings file** at `.agileflow/skills/_learnings/{skill-name}.yaml`
3. **Updates Instructions section** to include learning workflow steps
4. **Preserves all existing content** - only adds new sections

---

## Workflow

### STEP 1: Select skill to upgrade

If SKILL_NAME not provided, list available skills:

```bash
ls -d .claude/skills/*/ 2>/dev/null | xargs -I {} basename {}
```

Then ask user:

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "Which skill would you like to upgrade with self-improving capability?",
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

### STEP 2: Check upgrade status

Read the skill's SKILL.md and check for existing self-improving capability:

```bash
cat .claude/skills/<skill>/SKILL.md
```

**Check for existing sections:**
- Look for `## Self-Improving Learnings` section
- Check if `.agileflow/skills/_learnings/<skill>.yaml` exists

**If already upgraded:**
```
✅ Skill "<skill>" already has self-improving capability!

Learnings file: .agileflow/skills/_learnings/<skill>.yaml
```

Offer to view the learnings file or exit.

**If not upgraded:**
Continue to next step.

### STEP 3: Show what will be added

Display the changes that will be made:

```
📦 Upgrade: <skill>
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Changes to be made:

1. SKILL.md - Add sections:
   - ## Self-Improving Learnings
   - Update ## Instructions to include learning workflow

2. Create new file:
   - .agileflow/skills/_learnings/<skill>.yaml

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### STEP 4: Confirm upgrade

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "Proceed with upgrade?",
  "header": "Confirm",
  "multiSelect": false,
  "options": [
    {"label": "Yes, upgrade skill", "description": "Add self-improving capability"},
    {"label": "Preview changes first", "description": "Show exact changes before applying"},
    {"label": "Cancel", "description": "Exit without changes"}
  ]
}]</parameter>
</invoke>
```

### STEP 5: Apply upgrade

**5.1: Create learnings file**

Create `.agileflow/skills/_learnings/<skill>.yaml`:

```yaml
# Learnings for <skill> skill
# This file accumulates user preferences for this skill.

skill: <skill>
version: 1
last_updated: <current-timestamp>

# =============================================================================
# PREFERENCES
# =============================================================================
preferences:
  # Preferences will be added as you use this skill and Claude learns from corrections

# =============================================================================
# CONVENTIONS
# =============================================================================
conventions:
  # - "Convention from skill usage will be added here"

# =============================================================================
# ANTI-PATTERNS
# =============================================================================
anti_patterns:
  # - "Things to avoid will be added here"

# =============================================================================
# CONTEXT
# =============================================================================
context:
  # Project-specific context will be learned here

# =============================================================================
# EXAMPLES
# =============================================================================
examples:
  # good:
  #   - "Good examples will be collected here"
  # bad:
  #   - "Bad examples will be collected here"

# =============================================================================
# METADATA
# =============================================================================
metadata:
  corrections_count: 0
  approvals_count: 0
  created: <current-timestamp>
  sessions: []
```

**5.2: Update SKILL.md**

Add the Self-Improving Learnings section AFTER the "What This Does" or "When to Use" section:

```markdown
## Self-Improving Learnings

This skill learns from your corrections and preferences.

**On invocation**:
1. Check if `.agileflow/skills/_learnings/<skill>.yaml` exists
2. If exists, read and apply learned preferences
3. Follow conventions and avoid anti-patterns from learnings

**On correction**:
1. When user corrects output, extract the signal
2. Determine confidence level:
   - **high**: Explicit correction ("never do X", "always do Y")
   - **medium**: User approved or pattern worked well
   - **low**: Observation to review later
3. Update the learnings file with new preference

**Learnings file location**: `.agileflow/skills/_learnings/<skill>.yaml`
```

**5.3: Update Instructions section**

If the skill has an `## Instructions` section, prepend learning workflow steps:

```markdown
## Instructions

Step-by-step guidance for Claude:

1. **Load learnings** (if exists):
   - Read `.agileflow/skills/_learnings/<skill>.yaml`
   - Apply preferences, conventions, and anti-patterns
   - Skip if file doesn't exist (first run)

2. **Execute skill**:
   - Follow the instructions below with learned preferences applied
   [... existing instructions ...]

3. **If user corrects**:
   - Extract signal from correction
   - Update learnings file
   - Continue with corrected approach
```

### STEP 6: Show success

```
✅ Skill upgraded successfully!
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Modified: .claude/skills/<skill>/SKILL.md
Created:  .agileflow/skills/_learnings/<skill>.yaml

The skill will now:
• Load learned preferences on each invocation
• Extract signals from your corrections
• Build up conventions over time
• Avoid learned anti-patterns

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## Preview Mode

If user selects "Preview changes first", show:

**SKILL.md diff:**
```diff
  ## When to Use
  ...existing content...

+ ## Self-Improving Learnings
+
+ This skill learns from your corrections and preferences.
+
+ **On invocation**:
+ 1. Check if `.agileflow/skills/_learnings/<skill>.yaml` exists
+ ...
```

**New file preview:**
```yaml
# .agileflow/skills/_learnings/<skill>.yaml

skill: <skill>
version: 1
...
```

Then ask for confirmation again.

---

## Batch Upgrade

If user wants to upgrade ALL skills:

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "Upgrade all skills at once?",
  "header": "Batch Mode",
  "multiSelect": false,
  "options": [
    {"label": "Yes, upgrade all", "description": "Apply to all skills without learnings"},
    {"label": "No, one at a time", "description": "Select and upgrade individually"}
  ]
}]</parameter>
</invoke>
```

If batch mode:
1. List all skills in `.claude/skills/`
2. Filter out already-upgraded skills
3. Apply upgrade to each
4. Show summary at end

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

### Write Permission Error
```
❌ Cannot create learnings file.

Please check permissions for:
  .agileflow/skills/_learnings/

You may need to create the directory:
  mkdir -p .agileflow/skills/_learnings
```

### SKILL.md Parse Error
```
⚠️ Could not parse SKILL.md frontmatter.

The skill file may have formatting issues.
Would you like me to try anyway, or edit manually?
```

---

## Quality Checklist

Before completing, verify:
- [ ] Learnings file created in correct location
- [ ] SKILL.md has Self-Improving Learnings section
- [ ] Instructions section updated (if exists)
- [ ] No existing content was removed
- [ ] Skill name matches in all locations

---

## Usage

```bash
# Interactive mode (recommended)
/agileflow:skill:upgrade

# Upgrade specific skill
/agileflow:skill:upgrade my-api-skill

# Batch upgrade (upgrade all at once)
/agileflow:skill:upgrade --all
```
