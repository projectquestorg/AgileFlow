# Sync Workflow — Documentation Synchronization

**Triggers:** "sync docs", "update documentation", "my docs are out of date", "documentation drift", "docs don't match the code", "generate docs from code changes"

**Goal:** Compare code changes against expected documentation, identify gaps, and update or create documentation to reflect the current state of the codebase.

## Inputs needed

| Input       | Required | How to get it                                  |
| ----------- | -------- | ---------------------------------------------- |
| branch      | No       | Default: current branch                        |
| base        | No       | Default: `main`                                |
| auto-create | No       | Default: false — ask before creating new files |

## Steps

1. Run `git diff <base>...<branch> --name-status` to get changed files. If no base/branch provided, diff against `main`.

2. Categorize each changed file:
   - **API endpoints**: `src/api/`, `src/routes/`, `src/controllers/`
   - **UI components**: `src/components/`, `src/pages/`
   - **Services/utils**: `src/services/`, `src/utils/`
   - **Config**: `*.config.js`, `*.yml`, `.env.example`
   - **Database**: `migrations/`, `schema/`

3. For each changed file, map to the expected documentation location:
   - New API endpoint → check section in `docs/04-architecture/api.md`
   - New UI component → check `docs/04-architecture/components.md`
   - New service → check `docs/04-architecture/services.md`
   - Config change → check `docs/02-practices/configuration.md`
   - DB migration → check `docs/04-architecture/database.md`

4. Check each expected doc location. Infer content from TypeScript types, JSDoc comments, OpenAPI annotations, and test descriptions when docs are missing.

5. Generate a gap report:

   ```
   | File Changed | Expected Doc | Status |
   |--------------|-------------|--------|
   | src/api/users.ts | docs/04-architecture/api.md | Missing section |
   | src/components/Button.tsx | docs/04-architecture/components.md | Up to date |
   ```

6. Present the gap report. Ask the user: [A] Auto-create/update all missing docs (recommended), [B] Show me each gap and I'll decide, [C] Just report — I'll update docs manually.

7. For each doc that needs updating, show the proposed content change before writing. Use managed section markers to preserve any custom content the user has added.

8. After all updates, show a summary: N docs updated, M docs created, K docs already up to date. Never delete documentation without explicit user approval.

## Output

Gap report with status for each changed file. Updated documentation files. Never removes existing content — only adds or updates managed sections.

## Fallbacks

**If interactive prompts (AskUserQuestion) are unavailable:**
Present options as a numbered list in your response. Ask the user to reply with a number. Example:

```
How would you like to proceed?
1. Save and continue
2. Review before saving
3. Discard
```
