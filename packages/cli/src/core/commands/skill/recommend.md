---
description: Get skill recommendations based on your project's tech stack
argument-hint: "[keyword]"
compact_context:
  priority: medium
  preserve_rules:
    - "ACTIVE COMMAND: /agileflow:skill:recommend - Tech stack skill recommendations"
    - "MUST detect tech stack from package.json, project files"
    - "MUST match against curated skill catalog (~60 vetted skills)"
    - "MUST show ranked recommendations with install commands"
    - "MUST filter out already-installed skills"
    - "MUST offer live search via npx skills search for broader results"
  state_fields:
    - detected_stack
    - recommendations_count
---

# /agileflow:skill:recommend

Get personalized skill recommendations based on your project's detected tech stack. Matches against a curated catalog of ~60 vetted skills from skills.sh, with optional live marketplace search.

---

<!-- COMPACT_SUMMARY_START -->

## COMPACT SUMMARY - /agileflow:skill:recommend IS ACTIVE

**CRITICAL**: Detect tech stack, recommend matching skills from curated catalog.

### RULE #1: Detect Tech Stack
Read package.json deps + scan for project files (Dockerfile, go.mod, etc.)
Detect: frameworks, databases, testing, styling, languages, devops

### RULE #2: Match Against Catalog
Score each curated skill by tag overlap with detected stack.
Show top matches per category with relevance percentage.

### RULE #3: Filter Installed
Scan .claude/skills/ and exclude already-installed skills.

### RULE #4: Show Install Commands
Each result: `npx skills add owner/repo`

### RULE #5: Offer Live Search
For broader results: `npx skills search <keyword>`

<!-- COMPACT_SUMMARY_END -->

---

## Workflow

### STEP 1: Detect tech stack

Read `package.json` to identify dependencies:

```bash
cat package.json 2>/dev/null | head -100
```

Also check for:
- `requirements.txt`, `pyproject.toml` (Python)
- `go.mod` (Go)
- `composer.json` (PHP)
- `Dockerfile` (Docker)
- `.github/workflows/` (GitHub Actions)
- `vercel.json` (Vercel)
- `terraform/`, `main.tf` (Terraform)
- `k8s/`, `kubernetes/` (Kubernetes)

Map dependencies to technology tags:

| Dependency | Tags |
|-----------|------|
| `next` | next, nextjs, react, app-router |
| `react` | react, jsx, hooks |
| `vue` | vue, vuejs, vue3 |
| `@angular/core` | angular, rxjs |
| `express` | express, expressjs, node |
| `tailwindcss` | tailwind, tailwindcss, css |
| `prisma` | prisma, orm, database |
| `@supabase/supabase-js` | supabase, postgres, auth |
| `jest` | jest, testing, javascript |
| `vitest` | vitest, vite, testing |
| `playwright` | playwright, e2e, testing |
| `typescript` | typescript, ts |

### STEP 2: Check installed skills

```bash
ls .claude/skills/ 2>/dev/null
```

Collect names of installed skills to filter from recommendations.

### STEP 3: Match and rank skills

The curated catalog contains ~60 skills across 6 categories:
- **Frontend** (13): React, Next.js, Vue, Svelte, Angular, Tailwind, TypeScript
- **Backend** (11): GraphQL, Express, FastAPI, Node.js, Go, microservices
- **Database** (8): Prisma, Supabase, MongoDB, PostgreSQL, Redis, Drizzle
- **Testing** (10): TDD, Jest, Playwright, Cypress, pytest, Vitest
- **DevOps** (9): GitHub Actions, Docker, Kubernetes, Terraform, Vercel
- **Security** (8): OWASP, code review, auth, input validation

Score each skill: count how many of the skill's tags match the detected stack.
Sort by score descending within each category.

### STEP 4: Display recommendations

Show detected stack first, then recommendations by category:

```
Detected Tech Stack
  Frameworks: react, next, typescript
  Databases: prisma, postgresql
  Testing: jest, playwright
  Styling: tailwind
  DevOps: github-actions, docker

Recommended Skills (12 matches)

Frontend
  next-best-practices (95% match) - Next.js App Router, RSC, and data fetching
    Install: npx skills add vercel/next-skills

  react-best-practices (90% match) - React patterns, hooks, and component architecture
    Install: npx skills add vercel/agent-skills

  tailwind-mastery (85% match) - Tailwind CSS utility patterns and custom configurations
    Install: npx skills add anthropics/skills

Database
  prisma-orm (90% match) - Prisma schema design, migrations, and query patterns
    Install: npx skills add mcpmarket/skills

  postgresql-advanced (75% match) - PostgreSQL advanced queries and performance
    Install: npx skills add anthropics/skills

Testing
  jest-testing (85% match) - Jest unit and integration testing patterns
    Install: npx skills add anthropics/skills

  playwright-automation (80% match) - Playwright e2e testing and browser automation
    Install: npx skills add anthropics/skills

DevOps
  github-actions (75% match) - GitHub Actions workflow design and optimization
    Install: npx skills add anthropics/skills

  dockerfile-best-practices (70% match) - Dockerfile optimization and security
    Install: npx skills add anthropics/skills
```

### STEP 5: Offer actions

If the user provided a keyword argument, also search the curated catalog by keyword.

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "What would you like to do?",
  "header": "Install",
  "multiSelect": false,
  "options": [
    {"label": "Install a skill", "description": "Copy the install command for a recommended skill"},
    {"label": "Search marketplace", "description": "Run npx skills search <keyword> for broader results"},
    {"label": "Browse all skills", "description": "Run npx skills find to see the full marketplace"},
    {"label": "Done", "description": "Exit recommendations"}
  ]
}]</parameter>
</invoke>
```

**If "Install a skill"**: Ask which skill, then provide the exact `npx skills add` command.

**If "Search marketplace"**: Ask for a keyword, then run `npx skills search <keyword>`.

**If "Browse all skills"**: Run `npx skills find`.

---

## Optional Keyword Argument

If called with a keyword:
```bash
/agileflow:skill:recommend react
```

Filter recommendations to skills matching that keyword in name, description, or tags.

---

## Error Handling

### No package.json
```
Could not detect tech stack (no package.json found).
You can still browse the marketplace:
  npx skills find
  npx skills search <keyword>
```

### No Matches
```
No curated skills match your tech stack.
Try searching the marketplace:
  npx skills search <your-technology>
  npx skills find
```

---

## Related Commands

- `/agileflow:skill:list` - View installed skills with marketplace preview
