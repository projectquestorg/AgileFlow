---
description: List installed skills and browse recommended skills from the marketplace
argument-hint: "(no arguments)"
compact_context:
  priority: medium
  preserve_rules:
    - "ACTIVE COMMAND: /agileflow:skill:list - Shows installed + recommended skills"
    - "MUST scan .claude/skills/ directory for installed skill subdirectories"
    - "MUST extract name/description from each SKILL.md frontmatter"
    - "MUST show recommended skills based on detected tech stack"
    - "MUST provide install commands for marketplace skills"
    - "MUST offer actions: recommend more, browse marketplace, done"
  state_fields:
    - skills_found_count
    - recommendations_shown
---

# /agileflow:skill:list

Display installed skills and recommended skills from the skills.sh marketplace.

---

<!-- COMPACT_SUMMARY_START -->

## COMPACT SUMMARY - /agileflow:skill:list IS ACTIVE

**CRITICAL**: This command shows installed skills AND marketplace recommendations.

### RULE #1: Show Installed Skills
Scan `.claude/skills/` for subdirectories with SKILL.md. For each:
- Extract name/description from frontmatter
- Count files (cookbook/*, references.md)
- Display in clean format

### RULE #2: Show Recommended Skills
Based on the project's tech stack (from package.json and project files):
- Detect frameworks, databases, testing, styling
- Match against curated skills catalog
- Show top matches with install commands

### RULE #3: Provide Install Commands
Each recommended skill shows: `npx skills add owner/repo`

### RULE #4: Offer Actions
After listing, offer: Get more recommendations, Browse marketplace, Done

<!-- COMPACT_SUMMARY_END -->

---

## Workflow

### STEP 1: Show installed skills

Scan `.claude/skills/` for subdirectories:

```bash
ls -la .claude/skills/ 2>/dev/null
```

For each subdirectory with SKILL.md:
1. Read frontmatter for `name:` and `description:`
2. Count supporting files (cookbook/*, references.md)

Display format:
```
Installed Skills (N total)

  skill-name - Description here
    Files: SKILL.md, references.md, cookbook/use-case.md

  another-skill - Another description
    Files: SKILL.md, cookbook/workflow.md
```

If no skills installed:
```
No skills installed yet.
Install from the marketplace with: npx skills add owner/repo
Or browse recommendations: /agileflow:skill:recommend
```

### STEP 2: Detect tech stack

Read `package.json` dependencies and scan project files to detect:
- **Frameworks**: React, Next.js, Vue, Svelte, Express, FastAPI, etc.
- **Databases**: Prisma, Supabase, MongoDB, PostgreSQL, Redis, etc.
- **Testing**: Jest, Vitest, Playwright, Cypress, pytest, etc.
- **Styling**: Tailwind, styled-components, Sass, etc.
- **Languages**: TypeScript, Python, Go, PHP, etc.

### STEP 3: Show top recommendations

Based on detected stack, show top 3-5 matching skills:

```
Recommended for Your Stack

  Detected: React, Next.js, TypeScript, Tailwind, Prisma, Jest

  Frontend:
    next-best-practices (95% match) - Next.js App Router, RSC, and data fetching
      Install: npx skills add vercel/next-skills

    react-best-practices (90% match) - React patterns, hooks, and components
      Install: npx skills add vercel/agent-skills

  Database:
    prisma-orm (85% match) - Prisma schema design and query patterns
      Install: npx skills add mcpmarket/skills

  Testing:
    jest-testing (80% match) - Jest unit and integration testing patterns
      Install: npx skills add anthropics/skills
```

### STEP 4: Offer actions

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "What would you like to do?",
  "header": "Skills",
  "multiSelect": false,
  "options": [
    {"label": "Get more recommendations", "description": "Run /agileflow:skill:recommend for full results"},
    {"label": "Browse marketplace", "description": "Run npx skills find to browse all skills"},
    {"label": "Done", "description": "Exit skill listing"}
  ]
}]</parameter>
</invoke>
```

---

## Related Commands

- `/agileflow:skill:recommend` - Full recommendation engine with detailed matching
