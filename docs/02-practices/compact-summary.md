# Compact Summary Practice

## Purpose

Compact Summaries ensure command/agent behavioral rules survive conversation compaction. When Claude's context gets too long and summarizes, these summaries are preserved so Claude continues following the rules.

## When to Add a Compact Summary

Add a Compact Summary to any command or agent that has:
- Behavioral rules (e.g., "ALWAYS use AskUserQuestion")
- Critical workflows that must be followed
- State that needs to persist across compaction
- Important constraints or boundaries

## Structure

### Location in File

Place the Compact Summary near the top of the file, after the frontmatter:

```markdown
---
description: My command description
argument-hint: [ARG] (optional)
---

<!-- COMPACT_SUMMARY_START -->
## Compact Summary

[50-80 lines of critical context]

<!-- COMPACT_SUMMARY_END -->

# Full Command Documentation
...
```

### Content Guidelines

A good Compact Summary includes:

1. **Role/Purpose** (1-2 lines)
   - What this command/agent does
   - Its primary responsibility

2. **Critical Behavioral Rules** (5-15 lines)
   - MUST DO items (use checkmarks or bullet points)
   - MUST NOT DO items
   - Format as actionable rules

3. **Key Workflow Steps** (5-10 lines)
   - Numbered steps for the main workflow
   - Only include essential steps

4. **Important Files/Locations** (3-5 lines)
   - Files to read/write
   - Key paths to remember

### Example: Babysit Command

```markdown
<!-- COMPACT_SUMMARY_START -->
## Compact Summary

**ROLE**: Babysitter (Mentor + Orchestrator) - Guide plain-English feature requests end-to-end.

### Critical Behavioral Rules

**AskUserQuestion is MANDATORY for:**
1. INITIAL TASK SELECTION - Present task options after loading context
2. CHOOSING BETWEEN APPROACHES - When 2+ valid paths exist
3. END OF EVERY RESPONSE - Always end with next step options
4. ARCHITECTURAL DECISIONS - Schema choices, API patterns, etc.

**DON'T use AskUserQuestion for:**
- Routine file writes, running commands, spawning agents
- Obvious next steps with only one sensible path

### TaskCreate/TaskUpdate Tracking

**CRITICAL**: Track progress with TaskCreate/TaskUpdate tool. Typical workflow:
1. Run context loading (CLAUDE.md, README, status.json)
2. Present suggestions using AskUserQuestion
3. Plan implementation steps with file paths
4. Apply code changes incrementally
5. Update status.json
6. Verify tests passing

### Key Files to Check

- CLAUDE.md - Project conventions
- README.md - Project overview
- docs/09-agents/status.json - Story statuses
<!-- COMPACT_SUMMARY_END -->
```

## STEP 0 Activation Script

Every command with a Compact Summary needs a STEP 0 activation script. This registers the command as "active" so the PreCompact hook knows to extract its summary.

### Template

Add this immediately after the Compact Summary:

```markdown
## STEP 0: Activate Command (Run First)

**CRITICAL**: Run this script IMMEDIATELY when this command starts:

\`\`\`bash
node -e "
const fs = require('fs');
const path = 'docs/09-agents/session-state.json';
if (fs.existsSync(path)) {
  const state = JSON.parse(fs.readFileSync(path, 'utf8'));
  const cmd = { name: 'YOUR_COMMAND_NAME', activated_at: new Date().toISOString(), state: {} };
  state.active_commands = state.active_commands || [];
  if (!state.active_commands.some(c => c.name === cmd.name)) state.active_commands.push(cmd);
  fs.writeFileSync(path, JSON.stringify(state, null, 2) + '\n');
  console.log('YOUR_COMMAND_NAME command activated');
}
"
\`\`\`
```

Replace `YOUR_COMMAND_NAME` with the actual command name (e.g., `babysit`, `epic`, `sprint`).

### Key Features

- **Array-based**: Multiple commands can be active simultaneously
- **Duplicate prevention**: Same command won't be added twice
- **Backward compatible**: Initializes array if it doesn't exist

## Testing Your Compact Summary

### 1. Verify Markers

```bash
grep "COMPACT_SUMMARY" packages/cli/src/core/commands/your-command.md
```

Should output:
```
<!-- COMPACT_SUMMARY_START -->
<!-- COMPACT_SUMMARY_END -->
```

### 2. Test Extraction

```bash
# Register your command
node -e "
const fs = require('fs');
const state = JSON.parse(fs.readFileSync('docs/09-agents/session-state.json', 'utf8'));
state.active_commands = [{ name: 'your-command', activated_at: new Date().toISOString(), state: {} }];
fs.writeFileSync('docs/09-agents/session-state.json', JSON.stringify(state, null, 2) + '\n');
"

# Run PreCompact and check output
bash scripts/precompact-context.sh | grep -A 20 "ACTIVE COMMAND"
```

### 3. Clean Up

```bash
node -e "
const fs = require('fs');
const state = JSON.parse(fs.readFileSync('docs/09-agents/session-state.json', 'utf8'));
state.active_commands = [];
fs.writeFileSync('docs/09-agents/session-state.json', JSON.stringify(state, null, 2) + '\n');
"
```

## Best Practices

### DO

- Keep summaries to 50-80 lines (enough context, not overwhelming)
- Use bullet points and numbered lists (easy to scan)
- Include the most critical behavioral rules first
- Use bold/emphasis for MUST/NEVER items
- Test that extraction works before committing

### DON'T

- Include full documentation (that's what the rest of the file is for)
- Add examples or lengthy explanations
- Include information that changes frequently
- Forget the STEP 0 activation script
- Use complex formatting that might break extraction

## Checklist for New Commands

- [ ] Added `<!-- COMPACT_SUMMARY_START -->` marker
- [ ] Added `<!-- COMPACT_SUMMARY_END -->` marker
- [ ] Summary includes role/purpose
- [ ] Summary includes critical behavioral rules
- [ ] Summary includes key workflow steps
- [ ] Added STEP 0 activation script with correct command name
- [ ] Tested extraction with `precompact-context.sh`
- [ ] Summary is 50-80 lines (concise but complete)

## Related Documentation

- [PreCompact Architecture](../04-architecture/precompact-context.md) - How the system works
- [Hooks System](../../CLAUDE.md#hooks-system) - Hook configuration
