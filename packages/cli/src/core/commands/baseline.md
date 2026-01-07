---
description: Mark current state as verified baseline
argument-hint: [message] (optional)
compact_context:
  priority: critical
  preserve_rules:
    - "ALWAYS run STEP 0 context activation first"
    - "Check 4 prerequisites: session harness initialized, tests passing, git clean, story tests passing"
    - "If ANY prerequisite fails, show error and exit (don't force baseline creation)"
    - "Create git tag with timestamp format: agileflow-baseline-YYYYMMDD-HHMMSS"
    - "Update BOTH environment.json AND session-state.json AND story metadata"
    - "Show comprehensive baseline report with tag, commit, message, test counts, stories"
    - "Display command to push baseline to remote: git push origin <tag>"
  state_fields:
    - baseline_commit (SHA)
    - baseline_established (ISO timestamp)
    - baseline_tag (agileflow-baseline-*)
---

# Establish Baseline

Create a verified checkpoint representing a known-good state of the project.

## STEP 0: Gather Context

```bash
node .agileflow/scripts/obtain-context.js baseline
```

<!-- COMPACT_SUMMARY_START -->
## Compact Summary

**Command**: `baseline`
**Purpose**: Create verified checkpoints representing known-good project states

**Quick Usage**:
```
/agileflow:baseline "Sprint 3 complete - all features tested"
/agileflow:baseline
```

**What It Does**:
1. Runs pre-flight checks (tests passing, clean git, story tests)
2. Shows baseline summary (what will be included)
3. Creates git tag with timestamp (agileflow-baseline-YYYYMMDD-HHMMSS)
4. Updates environment.json (baseline_commit)
5. Updates session-state.json (baseline history)
6. Updates story frontmatter (verified_at_baseline)
7. Displays final report

**Prerequisites**:
- Session harness initialized (`/agileflow:session:init`)
- All tests must be passing
- Git working tree must be clean
- All `in_progress` stories must have `test_status: passing`

**When to Use**:
- After completing an epic
- Before risky refactoring
- Weekly/sprint checkpoints
- Before major dependency updates
- After achieving significant milestones

**Git Tag Format**:
```
agileflow-baseline-20251222-143000
                    YYYYMMDD-HHMMSS
```

**Baseline Report Example**:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ Baseline Established
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Tag: agileflow-baseline-20251222-143000
Commit: abc123def456
Message: Sprint 3 complete - all features tested
Tests: 42/42 passing
Stories: US-0043, US-0044, US-0045

To push to team:
  git push origin agileflow-baseline-20251222-143000
```

**Use Cases**:
- **After Epic**: `baseline "EP-0005: User authentication complete"`
- **Before Refactor**: `baseline "Before auth refactor"` (safety checkpoint)
- **Sprint End**: `baseline "Sprint 12 end - 15 stories completed"`

**Restore from Baseline**:
```bash
git checkout agileflow-baseline-20251222-143000
```

**Best Practices**:
- Create baselines frequently (weekly or after epics)
- Push baseline tags to remote for team sharing
- Use descriptive messages for future reference
- Compare current state to baseline with `/agileflow:verify`

**Tools Used**:
- TodoWrite: Track 8-step baseline creation workflow

**TodoWrite Example**:
```xml
<invoke name="TodoWrite">
<parameter name="content">
1. Run pre-flight checks (session harness, tests, git status, story tests)
2. Show baseline summary (what will be included)
3. Get baseline message (from user or use default)
4. Create git tag with timestamp
5. Update docs/00-meta/environment.json (baseline_commit)
6. Update docs/09-agents/session-state.json (baseline history)
7. Update story frontmatter (verified_at_baseline)
8. Display final report
</parameter>
<parameter name="status">in-progress</parameter>
</invoke>
```

<!-- COMPACT_SUMMARY_END -->

## Prompt

ROLE: Baseline Creator

INPUTS
MESSAGE=<text>   Optional baseline message (default: "Baseline - all tests passing")

ACTIONS
1) Run pre-flight checks (session harness, tests passing, clean git)
2) Show baseline summary (what will be included)
3) Create git tag with timestamp (agileflow-baseline-YYYYMMDD-HHMMSS)
4) Update environment.json (baseline_commit)
5) Update session-state.json (baseline history)
6) Update story frontmatter (verified_at_baseline)
7) Display final report

---

## Command Purpose

Create a baseline marker (git tag + metadata) when all tests are passing and the codebase is in a verified good state. Baselines serve as reset points and regression detection anchors.

## Context

- Current branch: !`git branch --show-current`
- Git status: !`git status --short`
- Last commit: !`git log -1 --oneline`
- Uncommitted changes: !`git diff --stat`

## TODO LIST TRACKING

**CRITICAL**: Immediately create a todo list using TodoWrite tool to track baseline creation:
```
1. Run pre-flight checks (session harness, tests, git status, story tests)
2. Show baseline summary (what will be included)
3. Get baseline message (from user or use default)
4. Create git tag with timestamp
5. Update docs/00-meta/environment.json (baseline_commit)
6. Update docs/09-agents/session-state.json (baseline history)
7. Update story frontmatter (verified_at_baseline)
8. Display final report
```

Mark each step complete as you finish it. This ensures nothing is forgotten during baseline establishment.

**When to use:**
- After completing an epic
- Before starting risky refactoring
- Weekly/sprint checkpoints
- Before major dependency updates
- After achieving significant milestones

## Prerequisites

- Session harness initialized (`/agileflow:session:init`)
- All tests must be passing
- Git working tree must be clean
- All `in_progress` stories must have `test_status: passing`

## Usage

```
/agileflow:baseline
/agileflow:baseline "Sprint 3 complete - all features tested"
```

## Execution Flow

### 1. Pre-flight Checks

**Check Session Harness:**
```bash
if [ ! -f "docs/00-meta/environment.json" ]; then
  echo "❌ Session harness not initialized"
  echo "Run /agileflow:session:init first"
  exit 1
fi
```

**Check Tests:**
```bash
echo "🧪 Verifying tests..."
/agileflow:verify

# Check exit code
if [ $? -ne 0 ]; then
  echo "❌ Tests must be passing to create baseline"
  exit 1
fi
```

**Check Git Status:**
```bash
if ! git diff-index --quiet HEAD --; then
  echo "❌ Working tree must be clean"
  echo ""
  echo "Uncommitted changes:"
  git status --short
  echo ""
  echo "Commit changes first, then create baseline"
  exit 1
fi
```

**Check Story Test Status:**
```bash
# Read status.json
# Find all in_progress stories
# Verify all have test_status: passing

FAILING_STORIES=$(jq -r '.stories[] | select(.status=="in_progress" and .test_status!="passing") | .story_id' docs/09-agents/status.json)

if [ -n "$FAILING_STORIES" ]; then
  echo "❌ All in-progress stories must have passing tests"
  echo ""
  echo "Stories with non-passing tests:"
  echo "$FAILING_STORIES"
  echo ""
  echo "Run /agileflow:verify and fix failing tests first"
  exit 1
fi
```

### 2. Baseline Summary

Show what will be included in baseline:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📍 Creating Baseline
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Current State:
  ✅ Tests: 42/42 passing
  ✅ Git: Clean working tree
  ✅ Stories: 3 in-progress (all tests passing)

Baseline Will Include:
  • Git commit: abc123def456
  • Test results: 42 passed, 0 failed
  • Stories verified: US-0043, US-0044, US-0045
  • Branch: main
  • Timestamp: 2025-12-06 14:30:00

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### 3. Get Baseline Message

If not provided as argument:

```
Enter baseline message (or press Enter for default):
> _

Default: "Baseline - all tests passing"
```

### 4. Create Git Tag

Generate tag name and create annotated tag:

```bash
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
TAG_NAME="agileflow-baseline-$TIMESTAMP"
MESSAGE="${1:-Baseline - all tests passing}"

git tag -a "$TAG_NAME" -m "$MESSAGE"

if [ $? -eq 0 ]; then
  echo "✅ Git tag created: $TAG_NAME"
else
  echo "❌ Failed to create git tag"
  exit 1
fi
```

### 5. Update environment.json

Record baseline commit SHA and timestamp:

```json
{
  "baseline_commit": "abc123def456",
  "baseline_established": "2025-12-06T14:30:00Z",
  "updated_at": "2025-12-06T14:30:00Z"
}
```

### 6. Update session-state.json

Record baseline in session history:

```json
{
  "current_session": {
    "baseline_verified": true,
    "initial_test_status": "passing"
  },
  "baseline_history": [
    {
      "tag": "agileflow-baseline-20251206-143000",
      "commit": "abc123def456",
      "created_at": "2025-12-06T14:30:00Z",
      "message": "Sprint 3 complete - all features tested",
      "test_count": 42,
      "stories_verified": ["US-0043", "US-0044", "US-0045"]
    }
  ]
}
```

### 7. Update Story Metadata

Mark all verified stories with baseline reference:

```yaml
# In story frontmatter
verified_at_baseline: agileflow-baseline-20251206-143000
baseline_commit: abc123def456
```

### 8. Final Report

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ Baseline Established
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Tag: agileflow-baseline-20251206-143000
Commit: abc123def456
Message: Sprint 3 complete - all features tested
Timestamp: 2025-12-06 14:30:00

Verification Status:
  ✅ Tests: 42/42 passing
  ✅ Stories: 3 verified (US-0043, US-0044, US-0045)
  ✅ Git: Clean working tree
  ✅ Branch: main

This baseline can be used to:
  • Reset to known-good state (git checkout <tag>)
  • Compare test results over time
  • Track regression from this point
  • Verify deployment readiness

Baseline saved in:
  • Git tag: agileflow-baseline-20251206-143000
  • environment.json: baseline_commit updated
  • session-state.json: baseline history
  • Story metadata: verified_at_baseline

To push baseline to remote:
  git push origin agileflow-baseline-20251206-143000

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## Use Cases

### After Epic Completion
```
User: We just finished EP-0005. All stories tested and merged.
User: /agileflow:baseline "EP-0005: User authentication complete"

Claude: 🧪 Verifying tests...
        ✅ All tests passing (58/58)

        ✅ Git working tree clean

        ✅ Creating baseline...

        ✅ Baseline Established

        Tag: agileflow-baseline-20251206-143000
        Message: EP-0005: User authentication complete
        Tests: 58/58 passing
        Stories verified: 12

        Epic EP-0005 is now marked as verified baseline!
```

### Before Risky Refactor
```
User: About to refactor the auth system. Want a safety checkpoint.
User: /agileflow:baseline "Before auth refactor"

Claude: ✅ Baseline created: agileflow-baseline-20251206-150000

        If refactor goes wrong, reset with:
          git checkout agileflow-baseline-20251206-150000

        Or compare tests after refactor:
          /agileflow:verify
          # Compare to baseline: 42/42 tests
```

### Sprint Checkpoint
```
User: /agileflow:baseline "Sprint 12 end - 15 stories completed"

Claude: ✅ Baseline Established

        Sprint 12 Summary:
          • Stories completed: 15
          • Tests: 78/78 passing
          • Coverage: 87%

        This sprint's work is now preserved as baseline.
```

## Error Handling

### Tests Failing
```
❌ Cannot Create Baseline - Tests Failing

Command: npm test
Result: 2/42 tests failed

Failed tests:
  ❌ auth.test.ts:42 - Session timeout handling
  ❌ api.test.ts:15 - Rate limiting check

Baselines require all tests passing.

Options:
  1. Fix failing tests
  2. Skip failing tests (not recommended)
  3. Cancel baseline creation

Choice [1/2/3]: _
```

If user chooses "skip":
```
⚠️  WARNING: Creating baseline with failing tests

This baseline will be marked as "PARTIAL" and should
only be used for reference, not for regression comparison.

Proceed? [y/N]: _
```

### Dirty Working Tree
```
❌ Cannot Create Baseline - Uncommitted Changes

Working tree changes:
  M src/components/Profile.tsx
  M src/api/auth.ts
  ?? temp/debug.log

Baselines require clean git state.

Options:
  1. Commit changes first
  2. Stash changes and create baseline
  3. Cancel baseline creation

Choice [1/2/3]: _
```

### In-Progress Stories With Failing Tests
```
❌ Cannot Create Baseline - Story Tests Failing

Stories with non-passing tests:
  US-0047 (in_progress): test_status = failing
  US-0048 (in_progress): test_status = not_run

All in-progress stories must have passing tests.

Run /agileflow:verify to check and fix tests.
```

### Git Not Available
```
⚠️  Git not available - Cannot create baseline tag

Baselines require git to create reference tags.

Alternatives:
  1. Install git and retry
  2. Record baseline metadata only (no tag)
  3. Cancel baseline creation

Choice [1/2/3]: _
```

### Tag Already Exists
```
⚠️  Tag already exists: agileflow-baseline-20251206-143000

This can happen if creating multiple baselines in the same second.

Options:
  1. Wait 1 second and retry (recommended)
  2. Use custom tag name
  3. Overwrite existing tag (dangerous)

Choice [1/2/3]: _
```

## Integration Points

### Called By
- User manually via `/agileflow:baseline`
- `/agileflow:session:init` - Creates initial baseline (optional)

### Calls
- `/agileflow:verify` - Test verification

### Reads
- `docs/00-meta/environment.json` - Current baseline info
- `docs/09-agents/status.json` - Story test status
- Git status and log

### Updates
- `docs/00-meta/environment.json` - baseline_commit, baseline_established
- `docs/09-agents/session-state.json` - baseline_history
- `docs/06-stories/**/*.md` - Story frontmatter (verified_at_baseline)
- Git tags - Creates annotated tag

## Advanced Features

### List Baselines
```
User: Show me all baselines
Claude: Reading baseline history...

        Baselines (most recent first):
          1. agileflow-baseline-20251206-143000
             Date: 2025-12-06 14:30:00 (today)
             Message: Sprint 3 complete
             Tests: 42/42
             Commit: abc123

          2. agileflow-baseline-20251130-103000
             Date: 2025-11-30 10:30:00 (6 days ago)
             Message: Before refactor
             Tests: 38/38
             Commit: def456

          3. agileflow-baseline-20251125-170000
             Date: 2025-11-25 17:00:00 (11 days ago)
             Message: Sprint 2 complete
             Tests: 35/35
             Commit: ghi789
```

### Compare to Baseline
```
User: Compare current state to last baseline
Claude: 🧪 Running tests...
        Current: 42/42 passing

        Baseline: agileflow-baseline-20251206-143000
        Baseline: 42/42 passing

        Comparison:
          ✅ Same test count
          ✅ All tests still passing
          ✅ No regressions detected

        Changes since baseline:
          • 3 new files
          • 127 lines added
          • 45 lines removed
          • 5 commits
```

### Restore from Baseline
```
User: Reset to last baseline
Claude: ⚠️  This will discard all changes since baseline

        Current: abc123def (2025-12-06 16:00)
        Baseline: ghi789jkl (2025-12-06 14:30)

        This will revert 5 commits and discard all uncommitted work.

        Create backup branch first? [Y/n]: y

        Creating backup: backup/before-baseline-restore
        Checking out: agileflow-baseline-20251206-143000

        ✅ Restored to baseline

        To return to previous state:
          git checkout backup/before-baseline-restore
```

## Implementation Notes

1. **Safety First**: Multiple checks before creating baseline
2. **Atomic**: All metadata updates succeed or fail together
3. **Reversible**: Baselines can be deleted if created by mistake
4. **Auditable**: Full history maintained in session-state.json
5. **Shareable**: Git tags can be pushed to remote for team baselines
6. **Automated**: Can be triggered by CI after successful deployments

## Example Execution

```
User: /agileflow:baseline "Major milestone - v1.0 ready"

Claude: 🧪 Verifying all requirements...

        ✅ Tests: 42/42 passing (12.3s)
        ✅ Git: Clean working tree
        ✅ Stories: 3 in-progress (all verified)

        Creating baseline...
        ✅ Git tag: agileflow-baseline-20251206-143000
        ✅ environment.json updated
        ✅ session-state.json updated
        ✅ Story metadata updated (3 stories)

        ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        ✅ Baseline Established
        ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

        Tag: agileflow-baseline-20251206-143000
        Commit: abc123def456
        Message: Major milestone - v1.0 ready
        Tests: 42/42 passing
        Stories: US-0043, US-0044, US-0045

        This is now your verified baseline for v1.0!

        To push to team:
          git push origin agileflow-baseline-20251206-143000

        ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```
