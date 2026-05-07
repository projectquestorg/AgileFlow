# Diagnose Workflow — System Health Check

**Triggers:** "something feels off with AgileFlow", "run diagnostics", "check system health", "diagnose the setup", "AgileFlow not working right", "validate the installation"

**Goal:** Run comprehensive health checks on the AgileFlow installation — validate JSON files, check the hooks system, verify auto-archival config, and report file size warnings — with clear PASS/FAIL/WARN indicators.

## Inputs needed

None — runs full diagnostics automatically.

## Steps

1. Run JSON file validation on all critical files using `jq empty`:
   - `docs/09-agents/status.json`
   - `docs/00-meta/agileflow-metadata.json`
   - `.claude/settings.json`
     Report: file size, valid/invalid status. For invalid files, show the parse error.

2. Check file size thresholds:
   - `status.json` over 50KB → warn: recommend archiving completed stories
   - `status.json` over 100KB → critical: use `jq '.stories | length'` to count stories

3. Validate the auto-archival system:
   - Check if the archive script exists and is executable (`-x` check)
   - Verify the hook is configured in `.claude/settings.json` (check for the SessionStart hook referencing the archive script)
   - Read the archival threshold from metadata

4. Validate the hooks system:
   - Parse `.claude/settings.json` structure
   - Count SessionStart, UserPromptSubmit, and Stop hooks
   - Flag missing hooks or misconfigurations

5. Check file structure integrity — verify these directories exist:
   - `docs/09-agents/`
   - `docs/00-meta/`
   - `.agileflow/`
   - `.claude/`

6. Generate the health report with status indicators:
   - Pass: check passed
   - Fail: issue found, action needed
   - Warn: potential issue, monitor
   - Info: informational only

7. If any failures are found, list them with specific fix instructions. If all checks pass, confirm the system is healthy.

8. Ask the user: [A] Fix the listed issues now (if any failures), [B] Archive completed stories (if size warning), [C] No action needed.

## Output

Health report with check results for JSON validation, auto-archival, hooks system, and file sizes. Specific fix instructions for any failures. Exit summary: N passed, M warnings, K failures.

## Fallbacks

**If interactive prompts (AskUserQuestion) are unavailable:**
Present options as a numbered list in your response. Ask the user to reply with a number. Example:

```
How would you like to proceed?
1. Save and continue
2. Review before saving
3. Discard
```
