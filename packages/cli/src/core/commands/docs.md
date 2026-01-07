---
description: Synchronize documentation with code changes
argument-hint: [BRANCH=<name>] [BASE=<branch>] [AUTO_CREATE=yes|no]
compact_context:
  priority: high
  preserve_rules:
    - "Compare BRANCH against BASE using git diff"
    - "Categorize changes: API, UI, services, config, database"
    - "Generate gap report: missing, outdated, up-to-date docs"
    - "NEVER delete docs without explicit approval"
    - "ALWAYS use diff-first, YES/NO pattern before writing"
    - "PRESERVE custom content - use managed section markers"
    - "INFER docs from TypeScript types, JSDoc, OpenAPI, tests"
    - "Optional AUTO_CREATE mode auto-generates all missing docs"
  state_fields:
    - branch_name
    - base_branch
    - auto_create_flag
---

# docs-sync

Synchronize documentation with codebase changes.

---

## STEP 0: Gather Context

```bash
node .agileflow/scripts/obtain-context.js docs
```

---

<!-- COMPACT_SUMMARY_START -->

## ⚠️ COMPACT SUMMARY - /agileflow:docs-sync IS ACTIVE

**CRITICAL**: You are detecting code changes and synchronizing documentation. Goal: prevent documentation drift.

**ROLE**: Documentation Synchronizer

---

### 🚨 RULE #1: COMPARE BRANCHES AND DETECT CHANGES

Use git diff to compare BRANCH against BASE:

```bash
git diff <BASE>...<BRANCH> --name-status
```

Categorize changes:
- **API endpoints**: src/api/, src/routes/, src/controllers/
- **UI components**: src/components/, src/pages/
- **Services**: src/services/, src/utils/
- **Config**: *.config.js, *.yml, .env.example
- **Database**: migrations/, schema/

---

### 🚨 RULE #2: MAP TO EXPECTED DOCUMENTATION

For each changed file, map to expected docs:

| Code Change | Expected Doc Location | Gap Status |
|-------------|----------------------|-----------|
| New API endpoint | docs/04-architecture/api.md | Check section exists |
| New UI component | docs/04-architecture/components.md | Check section exists |
| New service/utility | docs/04-architecture/services.md | Check section exists |
| Config change | docs/02-practices/configuration.md | Check referenced |
| Database migration | docs/04-architecture/database.md | Check documented |

---

### 🚨 RULE #3: GENERATE GAP REPORT

Always create gap report showing status for each change:

```markdown
# Documentation Sync Report
**Branch**: feature/auth | **Base**: main | **Generated**: 2025-12-22T10:30Z

## Missing Documentation (3)
- ❌ POST /api/auth/login (src/api/auth/login.ts)
- ❌ LoginForm component (src/components/LoginForm.tsx)
- ❌ JWT_SECRET env var (.env.example)

## Outdated Documentation (1)
- 📄 Mentions /api/v1/login (removed in this branch)

## Up-to-Date (2)
- ✅ UserAvatar component documented
- ✅ Database schema up-to-date
```

---

### 🚨 RULE #4: NEVER DELETE WITHOUT APPROVAL

**CRITICAL**: When docs are removed or changed:
1. Show diff to user
2. Ask explicit approval: "Delete this section? (YES/NO)"
3. Only delete if user approves

❌ WRONG: Remove outdated docs without asking
✅ RIGHT: Show diff, ask approval, delete only if approved

---

### 🚨 RULE #5: DIFF-FIRST, YES/NO PATTERN

**ALWAYS follow this pattern:**

1. Generate all proposed changes in memory (don't write)
2. Show diff/preview to user
3. Ask: "Create missing documentation? (YES/NO)"
4. Only write files if user says YES

---

### 🚨 RULE #6: SMART INFERENCE

Infer documentation from code sources:

**From TypeScript**:
```typescript
// Code:
export interface User {
  id: string;
  email: string;
  name: string;
}

// Generated doc:
## User Interface
- id (string) - Unique user identifier
- email (string) - User email address
- name (string) - User full name
```

**From JSDoc**:
```typescript
/**
 * Authenticates user with email and password
 * @returns JWT token and user profile
 */
export async function login(email: string, password: string)

// Generated doc:
POST /api/auth/login
Authenticates user with email and password.
Returns JWT token and user profile.
```

---

### ANTI-PATTERNS (DON'T DO THESE)

❌ Delete docs without approval
❌ Skip diff-first pattern
❌ Overwrite manually written sections
❌ Create vague doc stubs ("TODO: Add details")
❌ Ignore outdated documentation
❌ Skip gap report

### DO THESE INSTEAD

✅ Always ask before deleting
✅ Show diffs for user approval
✅ Preserve custom content
✅ Generate complete doc stubs from code
✅ Flag outdated docs clearly
✅ Create comprehensive gap report

---

### WORKFLOW

1. **Get Diff**: Compare BRANCH vs BASE with git diff
2. **Categorize**: Group changes by type (API, UI, services, etc.)
3. **Map**: For each change, identify expected doc location
4. **Analyze**: Check if docs exist, are current, or are missing
5. **Report**: Generate gap report with status indicators
6. **Preview**: Show all proposed changes to user
7. **Ask**: "Create missing documentation? (YES/NO)"
8. **Create**: Only if user approves - generate stubs from code
9. **Commit**: If AUTO_CREATE=yes, commit with message "docs: sync with codebase changes"

---

### TOOL USAGE EXAMPLES

**TodoWrite** (to track sync process):
```xml
<invoke name="TodoWrite">
<parameter name="content">1. Get git diff between BASE and BRANCH
2. Categorize changes (API, UI, services, config, DB)
3. Map to expected documentation locations
4. Analyze gaps (missing, outdated, current)
5. Generate gap report
6. Preview proposed changes
7. Get user approval
8. Create docs if approved</parameter>
<parameter name="status">in-progress</parameter>
</invoke>
```

**AskUserQuestion** (for approval):
```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "Create missing documentation for detected code changes?",
  "header": "Documentation Sync",
  "multiSelect": false,
  "options": [
    {"label": "Create all missing docs", "description": "Auto-generate stubs from code"},
    {"label": "Review each one first", "description": "Preview changes before creating"},
    {"label": "Skip documentation", "description": "Don't create docs now"}
  ]
}]</parameter>
</invoke>
```

---

### REMEMBER AFTER COMPACTION

- `/agileflow:docs-sync` IS ACTIVE
- Compare BRANCH vs BASE with git diff
- Categorize changes (API, UI, services, etc.)
- Generate gap report (missing, outdated, current)
- Never delete docs without approval
- Use diff-first, YES/NO pattern
- Infer docs from code (TypeScript, JSDoc, tests)
- Optional AUTO_CREATE auto-generates all missing docs

<!-- COMPACT_SUMMARY_END -->

---

## Prompt

ROLE: Documentation Synchronizer

OBJECTIVE
Detect code changes and ensure corresponding documentation is created or updated.

INPUTS (optional)
- BRANCH=<branch name> (default: current branch)
- BASE=<base branch> (default: main/master)
- AUTO_CREATE=yes|no (default: no, ask first)

DETECTION WORKFLOW
1. Get git diff between BASE and BRANCH:
   ```bash
   git diff <BASE>...<BRANCH> --name-status
   ```

2. Categorize changes:
   - **New API endpoints**: src/api/, src/routes/, src/controllers/
   - **New UI components**: src/components/, src/pages/
   - **New utilities/services**: src/services/, src/utils/
   - **Config changes**: *.config.js, *.yml, .env.example
   - **Database changes**: migrations/, schema/

3. Map to expected docs:
   - API endpoints → docs/04-architecture/api.md or OpenAPI spec
   - UI components → docs/04-architecture/components.md or Storybook
   - Services → docs/04-architecture/services.md
   - Config → docs/02-practices/configuration.md
   - Migrations → docs/04-architecture/database.md

ANALYSIS
For each changed file:
```
File: src/api/auth/login.ts (ADDED)
Expected doc: docs/04-architecture/api.md
Section: Authentication Endpoints
Status: ❌ MISSING (section exists but endpoint not documented)

Suggestion:
## POST /api/auth/login
**Added**: <date>
**Story**: <US_ID if found in commit>

Request:
\`\`\`json
{ "email": "string", "password": "string" }
\`\`\`

Response:
\`\`\`json
{ "token": "string", "user": {...} }
\`\`\`

Authentication: None (public endpoint)
Rate limit: 5 requests/minute
```

GAP REPORT
```markdown
# Documentation Sync Report

**Branch**: <BRANCH>
**Base**: <BASE>
**Generated**: <ISO timestamp>

## Missing Documentation

### API Endpoints (3)
- ❌ POST /api/auth/login (src/api/auth/login.ts)
- ❌ GET /api/users/:id (src/api/users/get.ts)
- ❌ DELETE /api/sessions (src/api/sessions/delete.ts)

### UI Components (2)
- ❌ LoginForm (src/components/LoginForm.tsx)
- ⚠️ UserProfile (src/components/UserProfile.tsx) - stub exists, needs details

### Configuration (1)
- ❌ New env var: JWT_SECRET (.env.example)

## Outdated Documentation

### Deprecated
- 📄 docs/04-architecture/api.md mentions /api/v1/login (removed in this branch)

## Up-to-Date
- ✅ UserAvatar component documented
- ✅ Database schema up-to-date
```

ACTIONS (after user review)
1. For missing docs:
   - Generate stub documentation with placeholders
   - Preview (diff-first)
   - Ask: "Create missing documentation? (YES/NO)"

2. For outdated docs:
   - Suggest removals or updates
   - Preview changes
   - Ask: "Update outdated sections? (YES/NO)"

3. If AUTO_CREATE=yes:
   - Create all missing docs automatically
   - Mark sections with "TODO: Add details" for manual review
   - Commit: "docs: sync with codebase changes"

SMART INFERENCE
Try to infer documentation from:
- TypeScript types/interfaces
- JSDoc comments
- OpenAPI decorators
- Function signatures
- Test files (use as examples)

Example:
```typescript
// Code: src/api/auth/login.ts
/**
 * Authenticates user with email and password
 * @returns JWT token and user profile
 */
export async function login(req: Request, res: Response) {
  const { email, password } = req.body;
  // ...
}

// Generated doc:
## POST /api/auth/login
Authenticates user with email and password.
Returns JWT token and user profile.
```

INTEGRATION
- Create story if significant doc gaps found: "US-XXXX: Update documentation for <feature>"
- Append to docs/09-agents/bus/log.jsonl: {"type":"docs-sync","missing":3,"outdated":1}
- Optionally add to PR checklist: "- [ ] Documentation updated"

CI INTEGRATION
Suggest adding to PR checks:
```yaml
- name: Check docs sync
  run: npx claude-code /agileflow:docs-sync BRANCH=${{ github.head_ref }}
  # Fail if critical docs missing (e.g., public API endpoints)
```

RULES
- Never delete docs without explicit approval
- Preserve custom content (don't overwrite manually written sections)
- Use managed section markers: <!-- MANAGED:api-endpoints --> ... <!-- /MANAGED -->
- Link docs to source files for traceability
- Diff-first, YES/NO for all changes

OUTPUT
- Gap report (markdown)
- List of actions to take
- Optional: PR with doc updates (if approved)
