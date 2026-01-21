# AgileFlow Troubleshooting Guide

This guide helps you diagnose and resolve common issues with AgileFlow. For quick diagnostics, run `/agileflow:diagnose`.

---

## Table of Contents

1. [Quick Diagnostics](#quick-diagnostics)
2. [JSON Validation Issues](#json-validation-issues)
3. [Story Management Issues](#story-management-issues)
4. [Hook System Issues](#hook-system-issues)
5. [Agent Communication Issues](#agent-communication-issues)
6. [File Size & Performance Issues](#file-size--performance-issues)
7. [Command Execution Issues](#command-execution-issues)
8. [Session & Context Issues](#session--context-issues)
9. [Git & Version Control Issues](#git--version-control-issues)

---

## Quick Diagnostics

Run the built-in diagnostic command to check system health:

```bash
/agileflow:diagnose
```

This checks:
- JSON file validity (status.json, metadata, settings)
- Auto-archival system configuration
- Hooks system setup
- File sizes and story counts

---

## JSON Validation Issues

### Issue: "status.json is INVALID JSON"

**Symptoms:**
- Commands fail with JSON parse errors
- Story updates don't persist
- `/agileflow:board` shows no stories

**Diagnosis:**
```bash
jq empty docs/09-agents/status.json 2>&1
```

**Causes:**
1. Manual editing introduced syntax error
2. Interrupted write operation
3. Merge conflict markers in file

**Solutions:**

**Option 1: Identify and fix the error**
```bash
# Show detailed error location
jq . docs/09-agents/status.json 2>&1

# Common fixes:
# - Remove trailing commas
# - Fix unclosed brackets/braces
# - Remove merge conflict markers (<<<, ===, >>>)
```

**Option 2: Restore from git**
```bash
git checkout HEAD -- docs/09-agents/status.json
```

**Option 3: Restore from archive (if available)**
```bash
# Check if backup exists
ls docs/09-agents/status.json.bak

# Restore backup
cp docs/09-agents/status.json.bak docs/09-agents/status.json
```

**Prevention:**
- Always use jq or Edit tool for JSON modifications
- Never use echo/cat redirection for JSON files
- Validate after every modification: `jq empty <file>`

---

### Issue: ".claude/settings.json is INVALID JSON"

**Symptoms:**
- Hooks don't run
- Session start shows errors
- Custom permissions not applied

**Solutions:**
```bash
# Check for errors
jq . .claude/settings.json 2>&1

# Common fix: reinstall default settings
npx agileflow setup --force-settings
```

---

### Issue: "agileflow-metadata.json NOT FOUND (CRITICAL)"

**Symptoms:**
- Version detection fails
- Archival threshold unknown
- Configuration not loaded

**Solution:**
```bash
# Reinstall AgileFlow configuration
npx agileflow setup

# Or create minimal metadata manually
mkdir -p docs/00-meta
cat > docs/00-meta/agileflow-metadata.json << 'EOF'
{
  "version": "1.0.0",
  "archival": {
    "threshold_days": 7,
    "enabled": true
  }
}
EOF
```

---

## Story Management Issues

### Issue: Story not found

**Symptoms:**
```
❌ Story not found: US-9999
```

**Diagnosis:**
```bash
# Check if story file exists
ls docs/06-stories/**/US-9999*.md

# Check if in status.json
jq '.stories["US-9999"]' docs/09-agents/status.json
```

**Causes:**
1. Story ID typo (US vs US-, wrong number)
2. Story was archived
3. Story file not created yet

**Solutions:**

**Story file missing:**
```bash
# Create the story
/agileflow:story ACTION=create TITLE="Story title" EPIC=EP-0001
```

**Story was archived:**
```bash
# Check archive
jq '.stories["US-9999"]' docs/09-agents/status-archive.json

# Unarchive if needed (manual move back to status.json)
```

---

### Issue: Invalid status transition

**Symptoms:**
```
❌ Invalid status transition
Current status: done
Requested status: in-progress
```

**Valid Transitions:**
```
ready → in-progress (starting work)
in-progress → blocked (hit blocker)
in-progress → in-review (finished, ready for review)
blocked → in-progress (blocker resolved)
in-review → done (review complete)
Any → ready (reset story)
```

**Solution:**
```bash
# To reopen a completed story, reset to ready first
/agileflow:status STORY=US-0042 STATUS=ready FORCE=yes
```

---

### Issue: WIP limit exceeded

**Symptoms:**
```
⚠️ WIP Limit Warning
AG-UI currently has 2 stories in-progress
```

**Solution:**
```bash
# Complete existing work first
/agileflow:status STORY=US-0038 STATUS=in-review

# Or reassign to different agent
/agileflow:assign STORY=US-0042 NEW_OWNER=AG-API
```

---

### Issue: Missing story frontmatter

**Symptoms:**
- Story not appearing in board
- Status updates fail

**Solution:**
Ensure story file has proper frontmatter:
```yaml
---
story_id: US-0042
title: Login form implementation
owner: AG-UI
status: ready
epic: EP-0010
estimate: 2d
---
```

---

## Hook System Issues

### Issue: Hooks not running

**Symptoms:**
- No welcome message on session start
- Auto-archival not happening
- Status line not showing

**Diagnosis:**
```bash
# Check hook configuration
jq '.hooks' .claude/settings.json

# Check if scripts exist and are executable
ls -la .agileflow/scripts/*.sh
```

**Solutions:**

**Scripts not executable:**
```bash
chmod +x .agileflow/scripts/*.sh
chmod +x scripts/*.sh
```

**Hooks not configured:**
```bash
# Reinstall hooks
npx agileflow setup --force-hooks
```

**Wrong paths in settings:**
```bash
# Check paths are relative to project root
jq '.hooks.SessionStart[].command' .claude/settings.json
```

---

### Issue: Hook timeout errors

**Symptoms:**
- Session start hangs
- Hooks take too long

**Solution:**
```bash
# Increase timeout in .claude/settings.json
jq '.hooks.SessionStart[0].timeout = 30000' .claude/settings.json > tmp.json && mv tmp.json .claude/settings.json
```

---

### Issue: Auto-archival not working

**Diagnosis:**
```bash
# Check script exists
ls -la .agileflow/scripts/archive-completed-stories.sh

# Test manually
bash .agileflow/scripts/archive-completed-stories.sh 7

# Check if hooked
grep "archive-completed-stories" .claude/settings.json
```

**Solution:**
```bash
# Add to SessionStart hooks
/agileflow:configure archival
```

---

## Agent Communication Issues

### Issue: Bus log corrupted

**Symptoms:**
- Handoffs not appearing
- Agent messages lost

**Diagnosis:**
```bash
# Check each line is valid JSON
while read line; do echo "$line" | jq empty 2>&1 || echo "Invalid: $line"; done < docs/09-agents/bus/log.jsonl
```

**Solution:**
```bash
# Remove corrupted lines
grep -v 'Invalid' < docs/09-agents/bus/log.jsonl > tmp.jsonl
mv tmp.jsonl docs/09-agents/bus/log.jsonl
```

---

### Issue: Agent not receiving handoff

**Symptoms:**
- Next agent doesn't see previous work
- Context lost between agents

**Solution:**
Ensure handoff was properly created:
```bash
# Check bus log for handoff
grep "handoff" docs/09-agents/bus/log.jsonl | tail -5

# Check comms directory
ls -la docs/09-agents/comms/
```

If missing, create handoff manually:
```bash
/agileflow:handoff STORY=US-0042 FROM=AG-API TO=AG-UI SUMMARY="Completed auth endpoints"
```

---

## File Size & Performance Issues

### Issue: status.json too large (>100KB)

**Symptoms:**
- Slow command execution
- Context window filling up
- `/agileflow:diagnose` shows warning

**Solution:**
```bash
# Run archival to move completed stories
bash .agileflow/scripts/archive-completed-stories.sh 7

# Verify size reduced
ls -la docs/09-agents/status.json
```

**Prevention:**
- Enable auto-archival hook (runs on session start)
- Set appropriate threshold in metadata (7-14 days)

---

### Issue: Context window exhaustion

**Symptoms:**
- Claude Code suggests compaction
- Commands take long to process
- Lost context mid-conversation

**Solutions:**

1. **Use PreCompact hook** - Preserves critical context during compaction
2. **Archive completed work** - Reduces status.json size
3. **Use specialized agents** - Delegate complex work via Task tool
4. **Start fresh session** - For new unrelated tasks

---

## Command Execution Issues

### Issue: Command not found

**Symptoms:**
```
Unknown command: /agileflow:xyz
```

**Solutions:**
```bash
# List available commands
/agileflow:help

# Check if AgileFlow is installed
ls .claude/commands/agileflow/

# Reinstall if missing
npx agileflow setup
```

---

### Issue: Missing required inputs

**Symptoms:**
```
❌ Missing required inputs
Please provide:
  • STORY - Story ID (e.g., US-0042)
  • FROM - Source agent (e.g., AG-API)
```

**Solution:**
Provide all required parameters:
```bash
/agileflow:handoff STORY=US-0042 FROM=AG-API TO=AG-UI SUMMARY="Work done"
```

---

### Issue: Permission denied for command

**Symptoms:**
- Tool calls rejected
- Commands blocked

**Solutions:**
```bash
# Check allowed commands in settings
jq '.permissions' .claude/settings.json

# Add to allowed commands if needed
# Edit .claude/settings.json to add command
```

---

## Session & Context Issues

### Issue: Session state lost

**Symptoms:**
- `/babysit` mode stops working after compaction
- Active command forgotten

**Diagnosis:**
```bash
cat docs/09-agents/session-state.json
```

**Solution:**
The PreCompact hook should preserve state. If not working:
```bash
# Check PreCompact hook is configured
grep "precompact" .claude/settings.json

# Manually restore babysit mode
/agileflow:babysit
```

---

### Issue: No active story after session resume

**Symptoms:**
- "No active story" message
- Lost context of what was being worked on

**Solution:**
```bash
# Check what stories are in-progress
/agileflow:board

# Resume work on specific story
/agileflow:work STORY=US-0042
```

---

## Git & Version Control Issues

### Issue: Commit blocked by hooks

**Symptoms:**
- Git commit fails
- Pre-commit hook rejects

**Solutions:**
```bash
# Check what hook failed
git commit -m "test" 2>&1

# Fix issues reported by hook
# Then retry commit
```

---

### Issue: Merge conflicts in AgileFlow files

**Priority files to resolve first:**
1. `docs/09-agents/status.json` - Story state
2. `.claude/settings.json` - Hooks and permissions
3. `docs/00-meta/agileflow-metadata.json` - Configuration

**Solution:**
```bash
# For JSON files, choose one version (usually keep ours)
git checkout --ours docs/09-agents/status.json

# Then validate
jq empty docs/09-agents/status.json
```

---

## Getting Help

### Self-Service

1. **Run diagnostics**: `/agileflow:diagnose`
2. **Check documentation**: `/agileflow:help`
3. **View agent capabilities**: `docs/04-architecture/agent-capabilities-matrix.md`

### Escalation

If issues persist:

1. **Check GitHub Issues**: https://github.com/projectquestorg/AgileFlow/issues
2. **Create bug report**: Include `/agileflow:diagnose` output
3. **Community support**: Check project discussions

---

## Prevention Checklist

- [ ] Run `/agileflow:diagnose` weekly
- [ ] Keep status.json under 100KB (enable auto-archival)
- [ ] Use jq for all JSON modifications
- [ ] Validate JSON after manual edits
- [ ] Backup before major operations
- [ ] Keep AgileFlow updated (`npm update agileflow`)

---

*Last updated: 2026-01-21*
