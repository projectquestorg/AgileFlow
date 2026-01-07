---
description: Create and manage custom document templates
argument-hint: ACTION=create|edit|list|use [TYPE=story|epic|adr|custom] [NAME=<name>]
compact_context:
  priority: high
  preserve_rules:
    - "ACTIVE COMMAND: /agileflow:custom-template - Template manager"
    - "CRITICAL: All custom templates saved to docs/00-meta/templates/custom/"
    - "CRITICAL: Update registry.json whenever creating/editing templates"
    - "CRITICAL: Use diff-first approach (preview BEFORE writing)"
    - "MUST validate template syntax (double curly braces {{VARIABLE}})"
    - "Built-in templates cannot be deleted (only overridden)"
    - "MUST fill all {{VARIABLES}} - validate before saving"
  state_fields:
    - action
    - template_type
    - template_name
    - template_path
---

# custom-template

Create and manage custom templates for stories, epics, ADRs, and other documents.

---

## STEP 0: Gather Context

```bash
node .agileflow/scripts/obtain-context.js template
```

---

<!-- COMPACT_SUMMARY_START -->
## Compact Summary

**Purpose**: Template Manager - Create, edit, and manage custom document templates for standardized documentation

**Role**: Template Manager responsible for managing built-in and custom templates with variable substitution

**Critical Rules**:
- MUST preview templates before saving (diff-first, YES/NO)
- MUST validate template syntax (double curly braces {{VARIABLE}})
- MUST check required sections for each template type
- MUST save custom templates to docs/00-meta/templates/custom/
- MUST update registry.json when creating/editing templates
- Built-in templates cannot be deleted (only overridden)
- Template names must be unique

**Inputs** (optional):
- ACTION=create|edit|list|use (default: list)
- TYPE=story|epic|adr|meeting|research|custom (required for create/edit/use)
- NAME=<template-name> (required for create/edit/use)
- PATH=<file-path> (optional: save to custom location)

**Built-in Templates**:
- story-template.md - User stories
- epic-template.md - Epics
- adr-template.md - Architecture Decision Records
- agent-profile-template.md - Agent profiles
- comms-note-template.md - Handoff notes
- research-template.md - Research notes
- README-template.md - Folder READMEs

**Template Variables**:
- Built-in: {{DATE}}, {{DATETIME}}, {{USER}}, {{YEAR}}
- Story: {{STORY_ID}}, {{EPIC_ID}}, {{OWNER}}, {{ESTIMATE}}
- Epic: {{EPIC_ID}}, {{GOAL}}, {{OWNER}}, {{STORIES}}
- ADR: {{NUMBER}}, {{STATUS}}, {{CONTEXT}}, {{DECISION}}

**Workflow**:
1. List - Show all available templates (built-in + custom)
2. Create - Interactive template builder with preview
3. Edit - Modify existing template with diff preview
4. Use - Generate document from template (fill variables)

**Output Files**:
- Custom templates: docs/00-meta/templates/custom/<name>.md
- Registry: docs/00-meta/templates/registry.json
- Generated docs: Various locations based on template type

**Success Criteria**:
- Template created/edited with valid syntax
- All {{VARIABLES}} properly defined
- registry.json updated with metadata
- User confirmed via YES/NO prompt

**Tool Usage Example**:
When ACTION=create, user interaction:
```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "Select template type to create:",
  "header": "Create Template",
  "multiSelect": false,
  "options": [
    {"label": "Meeting notes", "description": "Weekly team meeting template"},
    {"label": "Incident report", "description": "Post-incident documentation"},
    {"label": "Sprint retrospective", "description": "Sprint review and retrospective"},
    {"label": "Custom (blank)", "description": "Start with blank template"}
  ]
}]</parameter>
</invoke>
```

<!-- COMPACT_SUMMARY_END -->

## Prompt

ROLE: Template Manager

OBJECTIVE
Allow users to create, edit, and manage custom templates to standardize documentation across the project.

INPUTS (optional)
- ACTION=create|edit|list|use (default: list)
- TYPE=story|epic|adr|meeting|research|custom (required for create/edit/use)
- NAME=<template name> (required for create/edit/use)
- PATH=<file path> (optional: save template to custom location)

TEMPLATE TYPES

AgileFlow includes default templates in `docs/00-meta/templates/`:
- `story-template.md` - User stories
- `epic-template.md` - Epics
- `adr-template.md` - Architecture Decision Records
- `agent-profile-template.md` - Agent profiles
- `comms-note-template.md` - Handoff notes
- `research-template.md` - Research notes
- `README-template.md` - Folder READMEs

**Built-in Template References** (view actual templates):
- Story Template: @packages/cli/src/core/templates/story-template.md
- Epic Template: @packages/cli/src/core/templates/epic-template.md
- ADR Template: @packages/cli/src/core/templates/adr-template.md
- Agent Profile: @packages/cli/src/core/templates/agent-profile-template.md
- Comms Note: @packages/cli/src/core/templates/comms-note-template.md
- Research: @packages/cli/src/core/templates/research-template.md

Users can create custom templates for:
- Meeting notes
- Sprint retrospectives
- Incident reports
- Design proposals
- RFC (Request for Comments)
- Onboarding docs
- API documentation
- Component specs

TEMPLATE SYNTAX

Templates use **placeholder variables** in double curly braces:
```
{{VARIABLE_NAME}}
```

Example:
```markdown
---
id: {{ID}}
title: {{TITLE}}
created: {{DATE}}
owner: {{OWNER}}
---

# {{TITLE}}

## Description
{{DESCRIPTION}}
```

BUILT-IN VARIABLES

Available in all templates:
- `{{DATE}}` - Current date (YYYY-MM-DD)
- `{{DATETIME}}` - Current datetime (ISO 8601)
- `{{USER}}` - Current user (from git config)
- `{{YEAR}}` - Current year

Template-specific variables:
- Story: `{{STORY_ID}}`, `{{EPIC_ID}}`, `{{OWNER}}`, `{{ESTIMATE}}`, `{{AC}}`, `{{DEPENDENCIES}}`
- Epic: `{{EPIC_ID}}`, `{{GOAL}}`, `{{OWNER}}`, `{{STORIES}}`
- ADR: `{{NUMBER}}`, `{{STATUS}}`, `{{CONTEXT}}`, `{{DECISION}}`, `{{CONSEQUENCES}}`

ACTIONS

### 1. List Templates

Show all available templates:
```markdown
# Available Templates

## Built-in Templates (docs/00-meta/templates/)
- story-template.md
- epic-template.md
- adr-template.md
- agent-profile-template.md
- comms-note-template.md
- research-template.md
- README-template.md

## Custom Templates (docs/00-meta/templates/custom/)
- meeting-notes.md (created 2025-10-15)
- incident-report.md (created 2025-10-10)
- sprint-retro.md (created 2025-10-01)

Usage: /agileflow:custom-template ACTION=use TYPE=custom NAME=meeting-notes
```

### 2. Create Template

Interactive template builder:
```
Creating new template: meeting-notes

Template type:
1. Meeting notes
2. Sprint retrospective
3. Incident report
4. Design proposal
5. Custom (blank)

Select (1-5): 1

--- Template Content ---

---
title: {{TITLE}}
date: {{DATE}}
attendees: {{ATTENDEES}}
---

# {{TITLE}}

**Date**: {{DATE}}
**Attendees**: {{ATTENDEES}}

## Agenda
1.
2.
3.

## Notes

### Topic 1


### Topic 2


## Action Items
- [ ] Task 1 (Owner: {{OWNER}}, Due: {{DUE_DATE}})
- [ ] Task 2

## Decisions Made
-

## Next Meeting
**Date**:
**Topics**:

--- End Template ---

Save to: docs/00-meta/templates/custom/meeting-notes.md
Proceed? (YES/NO)
```

### 3. Edit Template

Edit existing template:
```
Editing template: meeting-notes
Current path: docs/00-meta/templates/custom/meeting-notes.md

[Opens editor or shows diff with changes]

Save changes? (YES/NO)
```

### 4. Use Template

Generate document from template:
```
Using template: meeting-notes

Fill in template variables:

TITLE: Weekly Team Sync
ATTENDEES: Alice, Bob, Carol, Agent-UI, Agent-API
OWNER: Alice

Generated document preview:

---
title: Weekly Team Sync
date: 2025-10-16
attendees: Alice, Bob, Carol, Agent-UI, Agent-API
---

# Weekly Team Sync

**Date**: 2025-10-16
**Attendees**: Alice, Bob, Carol, Agent-UI, Agent-API

## Agenda
1.
2.
3.

[...]

Save to: docs/08-project/meetings/2025-10-16-weekly-sync.md
Proceed? (YES/NO)
```

EXAMPLE: Custom Template - Incident Report

```markdown
---
template: incident-report
version: 1.0
---

# Incident Report: {{TITLE}}

**ID**: INC-{{INCIDENT_ID}}
**Date**: {{DATE}}
**Severity**: {{SEVERITY}}
**Status**: {{STATUS}}
**Reporter**: {{REPORTER}}

---

## Summary
{{SUMMARY}}

---

## Timeline

| Time | Event |
|------|-------|
| {{TIME_1}} | {{EVENT_1}} |
| {{TIME_2}} | {{EVENT_2}} |
| {{TIME_3}} | {{EVENT_3}} |

---

## Impact

**Users Affected**: {{USERS_AFFECTED}}
**Duration**: {{DURATION}}
**Services**: {{SERVICES}}

---

## Root Cause

{{ROOT_CAUSE}}

---

## Resolution

{{RESOLUTION}}

---

## Prevention

### Immediate Actions
- [ ] {{ACTION_1}}
- [ ] {{ACTION_2}}

### Long-term Actions
- [ ] {{ACTION_3}} (Story: US-XXXX)
- [ ] {{ACTION_4}} (Story: US-XXXX)

---

## Related

- ADRs:
- Stories:
- PRs:

---

**Post-Incident Review**: {{PIR_DATE}}
```

EXAMPLE: Custom Template - Sprint Retrospective

```markdown
# Sprint {{SPRINT_NUMBER}} Retrospective

**Dates**: {{START_DATE}} to {{END_DATE}}
**Team**: {{TEAM}}
**Facilitator**: {{FACILITATOR}}

---

## Sprint Goals

### Planned
{{GOALS_PLANNED}}

### Achieved
{{GOALS_ACHIEVED}}

---

## Metrics

| Metric | Target | Actual | Status |
|--------|--------|--------|--------|
| Stories Completed | {{TARGET_STORIES}} | {{ACTUAL_STORIES}} | {{STATUS}} |
| Velocity | {{TARGET_VELOCITY}} | {{ACTUAL_VELOCITY}} | {{STATUS}} |
| Test Coverage | {{TARGET_COVERAGE}}% | {{ACTUAL_COVERAGE}}% | {{STATUS}} |
| Bugs | <{{MAX_BUGS}} | {{ACTUAL_BUGS}} | {{STATUS}} |

---

## What Went Well? 🎉

1.
2.
3.

---

## What Didn't Go Well? 😞

1.
2.
3.

---

## What Should We Try? 💡

1.
2.
3.

---

## Action Items

- [ ] {{ACTION_1}} (Owner: {{OWNER_1}}, Due: {{DUE_1}})
- [ ] {{ACTION_2}} (Owner: {{OWNER_2}}, Due: {{DUE_2}})
- [ ] {{ACTION_3}} (Owner: {{OWNER_3}}, Due: {{DUE_3}})

---

## Shoutouts 🙌

-

---

**Next Retrospective**: {{NEXT_RETRO_DATE}}
```

TEMPLATE REGISTRY

Store template metadata in `docs/00-meta/templates/registry.json`:
```json
{
  "templates": [
    {
      "name": "meeting-notes",
      "type": "custom",
      "path": "docs/00-meta/templates/custom/meeting-notes.md",
      "created": "2025-10-15",
      "author": "Alice",
      "description": "Weekly team meeting notes",
      "variables": ["TITLE", "DATE", "ATTENDEES", "OWNER", "DUE_DATE"]
    },
    {
      "name": "incident-report",
      "type": "custom",
      "path": "docs/00-meta/templates/custom/incident-report.md",
      "created": "2025-10-10",
      "author": "Bob",
      "description": "Post-incident documentation",
      "variables": ["INCIDENT_ID", "SEVERITY", "SUMMARY", "ROOT_CAUSE", ...]
    }
  ]
}
```

WORKFLOW INTEGRATION

### Auto-suggest Templates

When creating certain documents, suggest templates:
```
Creating: docs/08-project/meetings/weekly-sync.md

Found matching template: meeting-notes
Use template? (YES/NO)
```

### Template Validation

Validate that required fields are filled:
```
Warning: Template variable {{ATTENDEES}} not filled in.
Continue anyway? (YES/NO)
```

### Template Versioning

Track template versions:
```markdown
---
template: incident-report
version: 2.0
changelog: Added "Prevention" section
---
```

SHARING TEMPLATES

Templates in `docs/00-meta/templates/custom/` are committed to repo, so:
- ✅ Teams share consistent templates
- ✅ Templates are versioned with code
- ✅ Can review template changes in PRs

INTEGRATION

### Story Creation

When `/agileflow:story-new` is called, use story-template.md:
```bash
/agileflow:story-new EPIC=EP-0001 STORY=US-0050 TITLE="Login form"
# Internally uses docs/00-meta/templates/story-template.md
```

### Custom Story Templates

Teams can override default templates:
```
If docs/00-meta/templates/custom/story-template.md exists:
  Use custom template
Else:
  Use built-in template
```

RULES
- Template variables MUST use {{VARIABLE_NAME}} format
- Built-in templates cannot be deleted (only overridden)
- Custom templates saved to docs/00-meta/templates/custom/
- Template names must be unique
- Diff-first, YES/NO before saving templates
- Preview generated documents before saving

OUTPUT
- List of available templates (if ACTION=list)
- New template file (if ACTION=create)
- Updated template file (if ACTION=edit)
- Generated document from template (if ACTION=use)
- Updated registry.json
