---
description: Compress status.json by removing verbose fields and keeping only tracking metadata
argument-hint: (no arguments)
compact_context:
  priority: high
  preserve_rules:
    - "ACTIVE COMMAND: /agileflow:compress - Status.json compression utility"
    - "CRITICAL: Operates on docs/09-agents/status.json ONLY"
    - "CRITICAL: Creates backup (status.json.backup) BEFORE writing"
    - "MUST remove verbose fields: description, AC, architectureContext, technicalNotes, testingStrategy, devAgentRecord"
    - "MUST keep only tracking: story_id, epic, title, owner, status, estimate, timestamps, dependencies, branch, summary"
    - "MUST validate JSON before/after compression"
    - "MUST calculate and show token estimate (target: <25000 tokens)"
    - "MUST show before/after stats and savings percentage"
    - "Combine with archival for best results (archive old completed stories first, then compress)"
  state_fields:
    - file_path
    - before_size
    - after_size
    - savings_percentage
    - token_estimate
---

# compress

STEP 0: ACTIVATE COMPACT SUMMARY MODE
Before reading the full command, execute this script to display the compact summary:
```bash
sed -n '/<!-- COMPACT_SUMMARY_START -->/,/<!-- COMPACT_SUMMARY_END -->/p' "$(dirname "$0")/compress.md" | grep -v "COMPACT_SUMMARY"
```
If the user confirms they want the full details, continue. Otherwise, stop here.

Reduce status.json file size by removing verbose story fields and keeping only essential tracking metadata.

<!-- COMPACT_SUMMARY_START -->
## Compact Summary

**Purpose**: Compress status.json by removing verbose fields and keeping only tracking metadata

**Quick Usage**:
```
/agileflow:compress
```

**What It Does**:
1. Validates status.json exists and is valid JSON
2. Shows before stats (size, lines, story count)
3. Creates backup (status.json.backup)
4. Removes verbose fields (description, AC, architectureContext, etc.)
5. Keeps only tracking fields (story_id, status, owner, timestamps)
6. Writes compressed file
7. Shows after stats and savings

**Required Inputs**:
- None (operates on `docs/09-agents/status.json`)

**Optional Inputs**:
- None

**Output Files**:
- Updates `docs/09-agents/status.json` (compressed)
- Creates `docs/09-agents/status.json.backup` (original)

**Fields Removed**:
- description, acceptanceCriteria
- architectureContext, technicalNotes
- testingStrategy, devAgentRecord
- previousStoryInsights
- All other large text fields

**Fields Kept**:
- story_id, epic, title, owner, status
- estimate, created, updated, completed_at
- dependencies, branch, summary
- last_update, assigned_at

**Workflow**:
1. Validate status.json exists and is valid
2. Show before stats (stories, size, lines)
3. Create backup copy
4. Strip verbose fields from each story
5. Write compressed version
6. Show after stats and savings percentage
7. Display status summary by state

**Example Output**:
```
📊 Before: 145 stories, 384KB, 12,847 lines
📊 After: 145 stories, 42KB, 1,203 lines
💾 Saved: 89% (342KB)
✅ Estimated tokens: ~10,500 (under 25000 limit)

📋 Status Summary:
   ready: 23 | in-progress: 8 | blocked: 2 | done: 112
```

**When to Use**:
- status.json exceeds 25000 tokens
- Agents fail with "file content exceeds maximum allowed tokens"
- After major epic completion (many verbose stories)
<!-- COMPACT_SUMMARY_END -->

## Prompt

ROLE: Status Compressor

INPUTS
(no arguments - operates on docs/09-agents/status.json)

ACTIONS
1) Validate status.json exists and is valid JSON
2) Show before stats (size, lines, story count)
3) Create backup (status.json.backup)
4) Remove verbose fields (description, AC, architectureContext, etc.)
5) Keep only tracking fields (story_id, status, owner, timestamps)
6) Write compressed file
7) Show after stats and savings

---

## Purpose

**Problem**: status.json exceeds 25000 tokens, causing agents to fail with "file content exceeds maximum allowed tokens"

**Solution**: Strip verbose fields (description, architectureContext, devAgentRecord, etc.) from status.json while preserving full story details in `docs/06-stories/` markdown files.

**Result**: Lightweight tracking index that agents can read + full story content in dedicated files.

## What Gets Removed

The script removes these verbose fields from status.json:
- `description` - Story description and context
- `acceptanceCriteria` - AC bullet points
- `architectureContext` - Architecture details (6 subsections)
- `technicalNotes` - Implementation hints
- `testingStrategy` - Test approach
- `devAgentRecord` - Implementation notes (6 subsections)
- `previousStoryInsights` - Lessons from previous story
- Any other large text fields

## What Gets Kept

Only essential tracking metadata remains:
- `story_id` - Story identifier
- `epic` - Parent epic
- `title` - Story title
- `owner` - Assigned agent
- `status` - Current status (ready/in-progress/blocked/done)
- `estimate` - Time estimate
- `created` / `updated` / `completed_at` - Timestamps
- `dependencies` - Dependent story IDs
- `branch` - Git branch
- `summary` - Short summary
- `last_update` - Last modification message
- `assigned_at` - Assignment timestamp

## Workflow

When user runs `/agileflow:compress`:

1. **Validate Environment**:
   - Check if `docs/09-agents/status.json` exists
   - Validate JSON syntax with `jq empty`
   - Check if `jq` is installed

2. **Show Before Stats**:
   ```
   📊 Before Compression:
      Stories: 145
      Size: 384KB
      Lines: 12,847
   ```

3. **Create Backup**:
   - Copy status.json to status.json.backup
   - Preserve original in case rollback needed

4. **Compress Stories**:
   - For each story in status.json:
     - Extract ONLY the essential tracking fields listed above
     - Discard all verbose content fields
   - Update `updated` timestamp to now

5. **Write Compressed File**:
   - Overwrite status.json with compressed version
   - Pretty-print JSON with `jq '.'`

6. **Show After Stats**:
   ```
   ✅ Compression complete!

   📊 After Compression:
      Stories: 145 (unchanged)
      Size: 384KB → 42KB
      Lines: 12,847 → 1,203
      Saved: 89% (342KB)

   ✅ Estimated tokens: ~10,500 (safely under 25000 limit)
   ```

7. **Show Status Summary**:
   ```
   📋 Status Summary:
      ready: 23 stories
      in-progress: 8 stories
      blocked: 2 stories
      done: 112 stories
   ```

8. **Provide Guidance**:
   - Note: Full story details remain in `docs/06-stories/`
   - Agents should read story markdown files for implementation
   - status.json is now a lightweight tracking index

## When to Use

**Run compression when**:
- status.json exceeds 25000 tokens
- Agents fail with "file content exceeds maximum allowed tokens"
- status.json is slow to read/parse
- After major epic completion (many stories with verbose records)

**Combine with archival**:
1. First run archival to move old completed stories: `/agileflow:compress` → runs `bash .agileflow/scripts/archive-completed-stories.sh`
2. If still too large, run compression: `/agileflow:compress` → runs `bash .agileflow/scripts/compress-status.sh`
3. Result: status.json under 25000 tokens

## Safety

**Backups**:
- Original saved to `status.json.backup`
- Restore anytime: `cp docs/09-agents/status.json.backup docs/09-agents/status.json`

**No Data Loss**:
- Full story content remains in `docs/06-stories/EP-XXXX/US-XXXX-*.md` files
- Only status.json tracking index is compressed
- Story markdown files are NOT modified

**Reversible**:
- Can restore from backup if needed
- Can re-populate verbose fields by reading story markdown files

## Implementation

```bash
bash .agileflow/scripts/compress-status.sh
```

## Related Commands

- `/agileflow:status` - View current story statuses
- `/agileflow:validate` - Validate AgileFlow system health

## Example Output

```
🗜️  AgileFlow Status Compression
   Purpose: Strip verbose fields from status.json
   Target: Keep only essential tracking metadata

💾 Backup created: docs/09-agents/status.json.backup

📊 Before Compression:
   Stories: 145
   Size: 384KB
   Lines: 12,847

✅ Compression complete!

📊 After Compression:
   Stories: 145 (unchanged)
   Size: 384KB → 42KB
   Lines: 12,847 → 1,203
   Saved: 89% (342KB)

🗑️  Removed Fields (stored in story markdown files):
   • description
   • acceptanceCriteria
   • architectureContext
   • technicalNotes
   • testingStrategy
   • devAgentRecord
   • previousStoryInsights
   • And any other verbose fields

📝 Note: Full story details remain in docs/06-stories/ markdown files
   Agents should read story files for implementation details
   status.json is now a lightweight tracking index

✅ Estimated tokens: ~10,500 (safely under 25000 limit)

📋 Status Summary:
   ready: 23 stories
   in-progress: 8 stories
   blocked: 2 stories
   done: 112 stories

💾 To restore original: cp docs/09-agents/status.json.backup docs/09-agents/status.json
```

## Technical Notes

**Token Estimation**:
- Rough formula: tokens ≈ bytes / 4
- Target: < 100KB for status.json (≈ 25000 tokens)
- After compression: typical 80-90% reduction

**Why This Works**:
- status.json should be a lightweight **tracking index**, not a content store
- Full story content belongs in markdown files
- Agents read status.json for "what to work on" (metadata)
- Agents read story markdown files for "how to build it" (implementation details)

**Separation of Concerns**:
- **status.json** = lightweight tracking (which stories, who owns, what status)
- **docs/06-stories/** = full story content (AC, architecture, implementation)
- **docs/09-agents/status-archive.json** = historical completed stories

## Prompt

You are the Status Compression assistant for AgileFlow.

**Your job**:

**Step 1: Ensure compression script exists**
```bash
# Check if compression script exists in user's project
if [ ! -f scripts/compress-status.sh ]; then
  echo "📦 Compression script not found - deploying from plugin..."

  # Copy from AgileFlow plugin
  cp ~/.claude-code/plugins/AgileFlow/scripts/compress-status.sh scripts/compress-status.sh

  # Make executable
  chmod +x scripts/compress-status.sh

  echo "✅ Deployed compression script: scripts/compress-status.sh"
fi
```

**Step 2: Run compression**
```bash
bash .agileflow/scripts/compress-status.sh
```

**Step 3: Verify and advise**
1. Show output to user
2. Verify estimated tokens < 25000
3. If still too large, suggest archival with shorter threshold

**Safety checks**:
- Verify backup created before compression
- Validate JSON syntax after compression
- Calculate and show token estimate
- Remind user full story content preserved in markdown files

**Example execution**:
```bash
cd /path/to/user/project

# Auto-deploy script if missing (v2.20.1+)
if [ ! -f scripts/compress-status.sh ]; then
  cp ~/.claude-code/plugins/AgileFlow/scripts/compress-status.sh scripts/compress-status.sh
  chmod +x scripts/compress-status.sh
fi

# Run compression
bash .agileflow/scripts/compress-status.sh
```

**If compression isn't enough**:
```bash
# Combine with aggressive archival
bash .agileflow/scripts/archive-completed-stories.sh 3  # Archive stories >3 days old
bash .agileflow/scripts/compress-status.sh              # Then compress remaining
```

**Always**:
- Show clear before/after stats
- Calculate savings percentage
- Verify token estimate
- Confirm agents can now read status.json
