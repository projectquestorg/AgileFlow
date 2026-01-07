---
description: Generate a custom skill with web research, cookbook pattern, and MCP integration
argument-hint: [SKILL_NAME] (optional)
compact_context:
  priority: high
  preserve_rules:
    - "ACTIVE COMMAND: /agileflow:skill:create - Generates custom research-backed skills"
    - "MUST enter Plan Mode FIRST to research THREE sources: web docs, local docs, codebase patterns"
    - "MUST output to .claude/skills/<skill-name>/ (directly usable by Claude Code)"
    - "MUST include references.md linking web docs, local docs, and codebase patterns"
    - "MUST use cookbook pattern for complex skills (2+ use cases)"
    - "NEVER copy entire docs - reference URLs instead"
    - "CRITICAL: Ask for approval of plan before generating skill files"
  state_fields:
    - skill_name
    - research_sources
    - use_cases_count
    - mcp_server_found
---

# /agileflow:skill:create

Generate dynamic, research-backed skills that combine web documentation, user's local docs, and codebase patterns.

---

<!-- COMPACT_SUMMARY_START -->

## 🚨 COMPACT SUMMARY - /agileflow:skill:create IS ACTIVE

**CRITICAL**: This command creates custom skills by researching THREE sources and building research-backed workflows.

### 🚨 RULE #1: Enter Plan Mode First
ALWAYS start with Plan Mode to explore before generating ANY skill files.
```
EnterPlanMode
```
This prevents wasted generations and gets user approval on research findings.

### 🚨 RULE #2: Research Three Sources
In Plan Mode, research and collect (DON'T generate):
1. **Web docs**: Official documentation URLs, API reference URLs, best practices links
2. **Local docs**: Files in `docs/02-practices/`, `docs/04-architecture/`, `docs/03-decisions/`
3. **Codebase patterns**: Existing code using Glob/Grep to find patterns

### 🚨 RULE #3: Link, Never Copy
- Link to external docs with URLs (don't copy entire docs)
- Point to local files that exist (don't reference user's docs/02-practices/ directly)
- Show codebase patterns with file locations and code snippets

### 🚨 RULE #4: Output Structure
Output ALWAYS goes to `.claude/skills/<skill-name>/` with:
- `SKILL.md` (main file with activation triggers and cookbook references)
- `references.md` (all documentation links)
- `cookbook/` directory (one .md per use case)
- `.mcp.json` (if MCP server found)

### 🚨 RULE #5: Cookbook Pattern
- **Simple skill** (1 use case): SKILL.md only
- **Complex skill** (2+ use cases): SKILL.md + cookbook/ directory with per-use-case files

### 🚨 RULE #6: Get Approval Before Writing
After research and plan creation:
1. Show plan findings to user
2. Ask for approval
3. Exit Plan Mode with approval
4. THEN write the skill files

### Critical Files Generated
| File | Purpose | Required? |
|------|---------|-----------|
| SKILL.md | Main skill file with activation triggers | Yes |
| references.md | Links to all web/local/codebase docs | Yes |
| cookbook/<use-case>.md | Per-use-case workflow | If 2+ cases |
| .mcp.json | MCP server configuration | If found |

### Anti-Patterns
- ❌ DON'T write skill files without Plan Mode approval
- ❌ DON'T copy entire external documentation
- ❌ DON'T reference docs/02-practices/ that user hasn't created
- ❌ DON'T skip cookbook pattern for complex skills
- ❌ DON'T forget references.md (critical for user context)

### REMEMBER AFTER COMPACTION
- Skill creation is 5 phases: Requirements → Plan Mode Research → Get Approval → Generate → Write Files
- Plan Mode research finds URLs and local patterns (don't generate from plan)
- User must approve plan before ANY files are written
- Complex skills need cookbook/ for each use case
- references.md is the pivot file linking all sources

<!-- COMPACT_SUMMARY_END -->

---

## Workflow

### Phase 1: Requirements Gathering

**STEP 1**: Ask what skill the user wants

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "What skill would you like to create?",
  "header": "Skill Purpose",
  "multiSelect": false,
  "options": [
    {"label": "Describe what I need", "description": "I'll explain the skill I want to build"},
    {"label": "Database integration", "description": "Supabase, PostgreSQL, MongoDB, etc."},
    {"label": "API integration", "description": "REST APIs, GraphQL, webhooks"},
    {"label": "UI/Frontend", "description": "Components, styling, design system"},
    {"label": "Development workflow", "description": "Testing, deployment, CI/CD"}
  ]
}]</parameter>
</invoke>
```

**STEP 2**: Gather details based on response

Extract from user's description:
- Technology/framework
- Primary use cases
- Target workflow

---

### Phase 2: Plan Mode Research (CRITICAL)

**STEP 3**: Enter Plan Mode

```
EnterPlanMode
```

**In plan mode, you will explore THREE sources:**

#### Source 1: Web Documentation

Search for official documentation and best practices:

```
WebSearch: "<technology> official documentation"
WebSearch: "<technology> best practices 2025"
WebSearch: "<technology> <use-case> guide"
```

**Collect URLs** - don't copy content, just gather links:
- Official docs URL (e.g., `https://supabase.com/docs`)
- API reference URL
- GitHub repository URL
- Tutorial/guide URLs

#### Source 2: User's Local Documentation

Check the user's `docs/` directory for relevant practices:

```
Glob: "docs/**/*.md"
Grep: "<technology>" in docs/
Grep: "design system" in docs/ (for UI skills)
Grep: "style guide" in docs/ (for UI skills)
```

**Look for:**
- `docs/02-practices/` - Development practices (testing, styling, security)
- `docs/04-architecture/` - Architecture decisions
- `docs/03-decisions/` - ADRs that affect this skill's domain
- Any existing documentation about the technology

**Example for UI skill:**
```
Read: docs/02-practices/styling.md (if exists)
Read: docs/02-practices/components.md (if exists)
Read: docs/04-architecture/design-system.md (if exists)
```

#### Source 3: User's Codebase

Explore the actual code for existing patterns:

```
Glob: "src/**/*.<extension>"
Grep: "<pattern>" in src/
```

**For UI skills, look for:**
- Existing component patterns: `Glob: "src/components/**/*.tsx"`
- Design tokens/theme: `Grep: "theme" or "colors" or "spacing"`
- Styling approach: Check for Tailwind, CSS modules, styled-components
- Existing design system: `Glob: "**/design-system/**/*"`

**For Database skills, look for:**
- Existing models: `Glob: "src/models/**/*"`
- Database client setup: `Grep: "createClient" or "prisma"`
- Migration patterns: `Glob: "**/migrations/**/*"`

**For API skills, look for:**
- Existing routes: `Glob: "src/api/**/*" or "src/routes/**/*"`
- Middleware patterns: `Grep: "middleware"`
- Error handling: `Grep: "catch" or "error"`

**STEP 4**: Research MCP servers

```
WebSearch: "<technology> MCP server official"
WebSearch: "Model Context Protocol <technology>"
```

If found, note the package name and documentation URL.

**STEP 5**: Write plan with findings

Write to plan file:

```markdown
# Skill: <skill-name>

## Research Findings

### Web Documentation
- Official docs: <URL>
- API reference: <URL>
- Best practices: <URL>

### Local Documentation Found
- `docs/02-practices/styling.md` - Design system guidelines
- `docs/04-architecture/components.md` - Component patterns
- (or "No relevant local docs found")

### Codebase Patterns Found
- Design system: `src/styles/theme.ts` - Color tokens, spacing
- Component pattern: `src/components/Button/` - Standard component structure
- (or "No existing patterns found for this domain")

### MCP Server
- Found: @supabase/mcp-server
- Docs: <URL>

## Proposed Skill Structure
- SKILL.md with references to all sources
- cookbook/ for <use-case-1>, <use-case-2>
- references.md linking everything

## Questions for User
- Should I include the MCP server?
- Any other local patterns I should incorporate?
```

**STEP 6**: Exit plan mode for approval

```
ExitPlanMode
```

User reviews the plan and approves or requests changes.

---

### Phase 3: Skill Generation

**STEP 7**: Determine skill complexity

- **Simple skill** (1 use case): SKILL.md only, no cookbook
- **Complex skill** (2+ use cases): SKILL.md + cookbook/ directory

**STEP 8**: Generate SKILL.md

```markdown
---
name: <skill-name-with-hyphens>
description: Use when <triggering conditions and symptoms>
---

# <Skill Title>

<One sentence description.>

## When to Use

This skill activates when:
- <Symptom 1>
- <Symptom 2>
- Keywords: "<keyword1>", "<keyword2>", "<keyword3>"

## Project Context

**IMPORTANT**: This skill is tailored to THIS project. Before implementing:

1. **Check local practices first**: Read `references.md` for project-specific patterns
2. **Follow existing code patterns**: The codebase patterns section shows how this project does things
3. **Use external docs for details**: Official documentation URLs are in references.md

## Cookbook

Based on context, select the appropriate workflow:

### <Use Case 1>
If <condition>:
Then read cookbook/<use-case-1>.md

Examples:
- "<example request>"

### <Use Case 2>
If <condition>:
Then read cookbook/<use-case-2>.md

Examples:
- "<example request>"

## Quick Reference

| Action | Command/Pattern |
|--------|-----------------|
| <action1> | <pattern1> |

## When You're Stuck

1. **Read `references.md`** - Links to all documentation sources
2. **Check local docs** - Project practices in docs/02-practices/
3. **Look at existing code** - See codebase patterns in references.md
4. **Fetch external docs** - Use WebFetch on URLs in references.md

## MCP Integration

This skill uses the **<server-name>** MCP server.

**Setup**: The `.mcp.json` in this skill folder contains the configuration.
To activate, copy to your project's `.mcp.json` or merge with existing.

## Common Mistakes

- <Mistake 1>: <How to avoid>
```

**STEP 9**: Generate references.md

This file links ALL documentation sources - web, local, and codebase:

```markdown
# References for <Skill Name>

## External Documentation

| Resource | URL | Use For |
|----------|-----|---------|
| Official Docs | <URL> | Core concepts, getting started |
| API Reference | <URL> | Method signatures, parameters |
| GitHub Repo | <URL> | Examples, issues, updates |
| Best Practices | <URL> | Patterns, anti-patterns |

## Local Project Documentation

| File | Contains |
|------|----------|
| `docs/02-practices/<file>.md` | <description> |
| `docs/04-architecture/<file>.md` | <description> |
| (or "No local docs found for this domain") |

## Codebase Patterns

Existing patterns in this project that you MUST follow:

### <Pattern Name>
- **Location**: `src/path/to/file.ts`
- **Pattern**: <description of what it does>
- **Example**:
  ```typescript
  // Code snippet showing the pattern
  ```

### <Another Pattern>
- **Location**: `src/path/to/other.ts`
- **Pattern**: <description>

(or "No existing patterns found - follow external docs")

## MCP Server

| Package | Docs | Tools Provided |
|---------|------|----------------|
| <package-name> | <URL> | <list of tools> |

## How to Use These References

1. **First**: Check "Codebase Patterns" - follow existing project conventions
2. **Second**: Read "Local Project Documentation" for team practices
3. **Third**: Use "External Documentation" URLs for syntax and details
4. **To fetch docs**: `WebFetch: <URL>` with prompt "Extract <specific info>"
```

**STEP 10**: Generate cookbook entries (if complex skill)

For each use case, create `cookbook/<use-case>.md`:

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

**STEP 11**: Generate .mcp.json (if user approved MCP)

```json
{
  "mcpServers": {
    "<server-name>": {
      "command": "npx",
      "args": ["-y", "<package-name>"],
      "env": {
        "<ENV_VAR>": "${<ENV_VAR>}"
      }
    }
  }
}
```

---

### Phase 4: Preview & Confirmation

**STEP 12**: Show skill structure

Display the generated structure:

```
.claude/skills/<skill-name>/
├── SKILL.md (XX lines)
├── references.md          # Links to web docs, local docs, codebase patterns
├── cookbook/
│   ├── <use-case-1>.md
│   └── <use-case-2>.md
└── .mcp.json
```

**STEP 13**: Preview SKILL.md content

Show the first 50 lines of SKILL.md for review.

**STEP 14**: Confirm creation

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "Create this skill?",
  "header": "Confirm",
  "multiSelect": false,
  "options": [
    {"label": "Yes, create skill", "description": "Write all files to .claude/skills/"},
    {"label": "No, start over", "description": "Cancel and restart"},
    {"label": "Edit requirements", "description": "Modify before creating"}
  ]
}]</parameter>
</invoke>
```

---

### Phase 5: Write Files

**STEP 15**: Create skill directory and files

```bash
mkdir -p .claude/skills/<skill-name>/cookbook
```

Write files:
1. `.claude/skills/<skill-name>/SKILL.md` - Main skill file
2. `.claude/skills/<skill-name>/references.md` - Links to web docs, local docs, codebase patterns
3. `.claude/skills/<skill-name>/cookbook/<use-case>.md` (for each use case)
4. `.claude/skills/<skill-name>/.mcp.json` (if MCP enabled)

**STEP 16**: Verify creation

```bash
ls -la .claude/skills/<skill-name>/
```

**STEP 17**: Present next steps

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "Skill created! What next?",
  "header": "Next Steps",
  "multiSelect": false,
  "options": [
    {"label": "Test the skill now", "description": "Try using the skill in this session"},
    {"label": "Create another skill", "description": "Generate a new skill"},
    {"label": "Done", "description": "Finish skill creation"}
  ]
}]</parameter>
</invoke>
```

---

## Error Handling

### Web Search Fails

If WebSearch returns no results:
1. Ask user for documentation URL
2. Use generic patterns
3. Note "manual review recommended" in SKILL.md

### MCP Not Found

If no MCP server found for technology:
1. Create skill without .mcp.json
2. Add note in SKILL.md: "No MCP server found for <technology>. MCP integration can be added later."
3. Provide instructions for manual MCP setup

### Validation Errors

Before writing, validate:
- `name` uses only letters, numbers, hyphens
- `description` is under 1024 characters
- SKILL.md body is under 500 lines
- All cookbook files referenced in SKILL.md exist

If validation fails:
1. Show specific errors
2. Offer to fix automatically
3. Don't write until valid

---

## Examples

### Example 1: Supabase Swift Skill

**User**: "I want a skill for database management in Supabase for Swift"

**Plan mode research finds:**
- Web docs: supabase.com/docs/guides/getting-started/quickstarts/swift
- Local docs: None found
- Codebase: `src/lib/supabase.ts` - existing client setup
- MCP: @supabase/mcp-server available

**Generated**:
```
.claude/skills/supabase-swift/
├── SKILL.md
├── references.md              # Links to Supabase docs + local client pattern
├── cookbook/
│   ├── crud-operations.md
│   ├── authentication.md
│   ├── migrations.md
│   └── realtime-subscriptions.md
└── .mcp.json
```

**references.md includes:**
- External: Supabase Swift SDK docs URL, API reference URL
- Codebase: Points to `src/lib/supabase.ts` for client pattern
- MCP: @supabase/mcp-server docs and tools

### Example 2: UI Component Skill

**User**: "I need a skill for building UI components"

**Plan mode research finds:**
- Web docs: React docs, Tailwind docs
- Local docs: `docs/02-practices/styling.md` - design system guidelines
- Codebase: `src/components/Button/` - existing component pattern, `src/styles/theme.ts` - color tokens

**Generated**:
```
.claude/skills/ui-components/
├── SKILL.md
├── references.md              # Links to React/Tailwind + local design system
└── cookbook/
    ├── create-component.md
    ├── styling-patterns.md
    └── accessibility.md
```

**references.md includes:**
- External: React docs URL, Tailwind docs URL
- Local docs: `docs/02-practices/styling.md`
- Codebase patterns: Button component structure, theme tokens location

---

## Usage

```bash
# Interactive mode (recommended)
/agileflow:skill:create

# With skill name hint
/agileflow:skill:create supabase-swift
```

---

## POST-CREATION ACTIONS

After successfully creating a skill, offer next steps:

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "Skill '<skill-name>' created! What would you like to do next?",
  "header": "Next Steps",
  "multiSelect": false,
  "options": [
    {"label": "Test the skill (Recommended)", "description": "Verify the skill works correctly"},
    {"label": "View all skills", "description": "See full skill inventory with /agileflow:skill:list"},
    {"label": "Create another skill", "description": "Build another custom skill"},
    {"label": "Done", "description": "Exit"}
  ]
}]</parameter>
</invoke>
```

**If "Test the skill"**:
- Run `/agileflow:skill:test SKILL=<skill-name>`
- Provide sample input scenarios
- Verify output matches expectations

**If "View all skills"**:
- Run `/agileflow:skill:list`

**If "Create another skill"**:
- Re-run `/agileflow:skill:create`

---

## Related Commands

- `/agileflow:skill:list` - View all installed skills
- `/agileflow:skill:test` - Test a skill with sample inputs
- `/agileflow:skill:edit` - Modify an existing skill
- `/agileflow:skill:delete` - Remove a skill
- `/agileflow:skill:upgrade` - Update skill with new patterns
