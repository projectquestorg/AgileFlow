---
description: Bootstrap CI/CD workflow with testing and quality checks
argument-hint: (no arguments)
compact_context:
  priority: high
  preserve_rules:
    - "CI setup creates .github/workflows/ci.yml with lint/typecheck/test jobs"
    - "MUST parse OWNERS input (comma-separated GitHub handles or team names)"
    - "MUST create CODEOWNERS file with owner mappings for src/ and docs/03-decisions/"
    - "{{RULES:file_preview}}"
    - "Concurrency control and minimal permissions are required for security"
  state_fields:
    - owners_input
    - workflow_created
    - codeowners_created
---

# ci-setup

STEP 0: ACTIVATE COMPACT SUMMARY MODE
Before reading the full command, execute this script to display the compact summary:
```bash
sed -n '/<!-- COMPACT_SUMMARY_START -->/,/<!-- COMPACT_SUMMARY_END -->/p' "$(dirname "$0")/ci.md" | grep -v "COMPACT_SUMMARY"
```
If the user confirms they want the full details, continue. Otherwise, stop here.

Bootstrap minimal CI workflow and CODEOWNERS.

<!-- COMPACT_SUMMARY_START -->

## ⚠️ COMPACT SUMMARY - /agileflow:ci-setup IS ACTIVE

**CRITICAL**: You are bootstrapping CI/CD workflow. All steps must complete to create production-ready CI.

**ROLE**: CI Bootstrapper - Create GitHub Actions workflow with quality gates (lint/typecheck/test) and code ownership rules

---

### 🚨 RULE #1: ALWAYS USE TodoWrite FOR TRACKING

Track all 5 steps explicitly:
```xml
<invoke name="TodoWrite">
<parameter name="content">
1. Parse OWNERS input (required, comma-separated)
2. Generate .github/workflows/ci.yml with 3 jobs
3. Generate CODEOWNERS file with mappings
4. Show diff preview (both files side-by-side)
5. Create files after YES/NO confirmation
</parameter>
<parameter name="status">in-progress</parameter>
</invoke>
```

Mark each step complete as you finish. This ensures nothing is forgotten.

---

### 🚨 RULE #2: REQUIRED PARAMETERS

`OWNERS` is required (no default):
- Format: `@username` or `@org/team-name`
- Multiple: Comma-separated, no spaces
- Example: `OWNERS=@alice,@dev-team,@bob`

If missing:
```
❌ Missing OWNERS parameter

Usage: /agileflow:ci-setup OWNERS=@username,@team

Examples:
  /agileflow:ci-setup OWNERS=@alice
  /agileflow:ci-setup OWNERS=@alice,@bob,@dev-team
```

---

### 🚨 RULE #3: DIFF-FIRST PATTERN

ALWAYS show preview of BOTH files before creating:

```
Preview of files to create:

========== .github/workflows/ci.yml ==========
name: CI
on: [push, pull_request]
... [full YAML preview]

========== CODEOWNERS ==========
/src/ @alice @dev-team
/docs/03-decisions/ @alice @dev-team
```

Then ask: "Create these files? (YES/NO)"

---

### 🚨 RULE #4: JOBS REQUIRED

Always generate these 3 jobs (generic placeholders OK):
1. **lint**: `npm run lint` (or project equivalent)
2. **typecheck**: `npm run typecheck` (or project equivalent)
3. **test**: `npm test` (or project equivalent)

Each job:
- `runs-on: ubuntu-latest`
- `permissions: { contents: read }` (minimal security)
- `concurrency: { group: ... cancel-in-progress: true }` (cost control)

---

### 🚨 RULE #5: CODEOWNERS MAPPINGS

Required mappings:
```
/src/ @owners  # All source code
/docs/03-decisions/ @owners  # ADRs require owner review
```

Both paths MUST include the parsed OWNERS.

---

### ANTI-PATTERNS (DON'T DO THESE)

❌ Skip diff preview - go directly to file creation
❌ Hardcode owners instead of parsing input
❌ Create workflow without concurrency control
❌ Forget to validate OWNERS parameter format
❌ Create CODEOWNERS without /src/ and /docs/03-decisions/ mappings
❌ Use overly permissive permissions (contents: write)

### DO THESE INSTEAD

✅ ALWAYS show diff preview first
✅ Parse OWNERS parameter, validate format
✅ Include concurrency with cancel-in-progress
✅ Use minimal permissions (contents: read)
✅ Include both required path mappings
✅ Track with TodoWrite for safety

---

### WORKFLOW PHASES

**Phase 1: Validate Input (Step 1)**
- Parse OWNERS parameter
- Validate format (looks like @username or @org/team)
- If invalid: show error and ask for correction

**Phase 2: Generate Files (Steps 2-3)**
- Create workflow YAML with 3 jobs
- Create CODEOWNERS with owner mappings

**Phase 3: Preview & Confirm (Step 4)**
- Display both files in unified diff
- Ask: "Create these files? (YES/NO)"

**Phase 4: Complete (Step 5)**
- Write .github/workflows/ci.yml
- Write CODEOWNERS
- Display next steps note

---

### NEXT STEPS TO DISPLAY

```
✅ CI setup complete!

Next steps:
1. Customize job commands for your project:
   - Update lint command (currently: npm run lint)
   - Update typecheck command
   - Update test command

2. Enable branch protection in GitHub:
   - Settings → Branches → Branch protection rules
   - Require "ci" status check
   - Require branches to be up-to-date

3. Optional: Configure merge queue
   - Settings → Branches → Branch protection
   - Enable merge queue for faster merges

4. Optional: Add required checks
   - Each job can be marked as required
```

---

### KEY FILES TO REMEMBER

| File | Purpose |
|------|---------|
| `.github/workflows/ci.yml` | GitHub Actions workflow with 3 jobs |
| `CODEOWNERS` | Code ownership rules for PR reviews |
| Parsed `OWNERS` | Critical - determines who gets PRs routed |

---

### REMEMBER AFTER COMPACTION

- `/agileflow:ci-setup` IS ACTIVE - create CI workflow
- OWNERS parameter is required (validate format)
- ALWAYS show diff-first before creating files
- Include lint, typecheck, test jobs
- Map both /src/ and /docs/03-decisions/ in CODEOWNERS
- Use TodoWrite to track 5 steps
- Display next steps for GitHub configuration

<!-- COMPACT_SUMMARY_END -->

## Prompt

ROLE: CI Bootstrapper

TODO LIST TRACKING
**CRITICAL**: Immediately create a todo list using TodoWrite tool to track CI setup:
```
1. Parse input (OWNERS)
2. Create .github/workflows/ci.yml with lint/typecheck/test jobs
3. Create CODEOWNERS file with owner mappings
4. Show preview and wait for YES/NO confirmation
5. Print notes for enabling required checks
```

Mark each step complete as you finish it. This ensures nothing is forgotten.

INPUT
OWNERS=<@handles>

ACTIONS
1) Create .github/workflows/ci.yml with jobs for lint, typecheck, tests (generic placeholders), minimal permissions, concurrency.
2) Create CODEOWNERS with:
   /src/  <OWNERS>
   /docs/03-decisions/  <OWNERS>
3) Print notes for enabling required checks.

Diff-first; YES/NO.

---

## Expected Output

### Success - CI Workflow Created

```
🔧 CI/CD Setup
══════════════════════════════════════════════════════════════

Creating workflow configuration...

✓ Created .github/workflows/ci.yml
  - lint: ESLint + Prettier check
  - typecheck: TypeScript compilation
  - test: Jest with coverage
  - Concurrency: cancel-in-progress enabled

✓ Created CODEOWNERS
  /src/  @team-lead @senior-dev
  /docs/03-decisions/  @tech-lead

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ CI/CD Setup Complete
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Next steps:
1. Push workflow: git add . && git push
2. Enable branch protection in GitHub settings
3. Set required checks: lint, typecheck, test

View workflow: .github/workflows/ci.yml
```

### Success - Workflow Updated

```
🔧 CI/CD Update
══════════════════════════════════════════════════════════════

Existing workflow detected. Updating...

Changes:
+ Added code coverage threshold (80%)
+ Added security audit job
~ Updated Node.js version to 20

✓ Updated .github/workflows/ci.yml

Review changes before committing:
  git diff .github/workflows/ci.yml
```

### Error - Missing OWNERS

```
❌ Error: OWNERS parameter required

Specify code owners for CODEOWNERS file:

/agileflow:ci OWNERS="@username1, @username2"

These users will be required reviewers for PR changes.
```

### Error - Invalid Workflow

```
❌ Error: Invalid workflow configuration

.github/workflows/ci.yml has syntax errors:
  Line 15: Invalid job name 'test!'
  Line 23: Missing 'runs-on' field

Fix errors or run with FORCE=true to overwrite.
```

---

## Related Commands

- `/agileflow:configure` - Manage AgileFlow features and hooks
- `/agileflow:deploy` - Set up deployment pipeline
- `/agileflow:tests` - Set up testing infrastructure
- `/agileflow:verify` - Run tests and verify stories
- `/agileflow:pr` - Generate pull request from story
