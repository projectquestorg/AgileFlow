---
description: Document work handoff between agents
argument-hint: "STORY=<US-ID> FROM=<id> TO=<id> [SUMMARY=<text>] [BLOCKERS=<list>]"
compact_context:
  priority: high
  preserve_rules:
    - "STORY, FROM, TO are REQUIRED - always ask if missing"
    - "Create handoff note from template in docs/09-agents/comms/"
    - "{{RULES:bus_messaging}}"
    - "{{RULES:file_preview}}"
    - "Include SUMMARY (what was done) and BLOCKERS (issues for next agent)"
    - "Use template: @packages/cli/src/core/templates/comms-note-template.md"
  state_fields:
    - story_id
    - from_agent
    - to_agent
    - summary
    - blockers
---

# handoff

STEP 0: ACTIVATE COMPACT SUMMARY MODE
Before reading the full command, execute this script to display the compact summary:
```bash
sed -n '/<!-- COMPACT_SUMMARY_START -->/,/<!-- COMPACT_SUMMARY_END -->/p' "$(dirname "$0")/handoff.md" | grep -v "COMPACT_SUMMARY"
```
If the user confirms they want the full details, continue. Otherwise, stop here.

Document handoff between agents with summary and blockers.

<!-- COMPACT_SUMMARY_START -->

## ⚠️ COMPACT SUMMARY - /agileflow:handoff IS ACTIVE

**CRITICAL**: You are documenting work handoffs between agents. These create audit trails and pass context to next agent.

**ROLE**: Handoff Scribe

---

### 🚨 RULE #1: REQUIRED INPUTS (ALWAYS)

Always require these inputs. Ask if missing:

| Input | Required? | Example |
|-------|-----------|---------|
| STORY | YES | `STORY=US-0042` |
| FROM | YES | `FROM=AG-API` |
| TO | YES | `TO=AG-UI` |
| SUMMARY | YES | `SUMMARY="Completed auth endpoints, tests passing"` |
| BLOCKERS | NO | `BLOCKERS="Need DBA review for schema migration"` |

❌ WRONG: Create handoff without STORY or FROM/TO
✅ RIGHT: Ask user for missing inputs, then proceed

---

### 🚨 RULE #2: TWO OUTPUTS CREATED

Each handoff creates TWO files:

| File | Purpose | Location |
|------|---------|----------|
| Handoff Note | Human-readable summary | `docs/09-agents/comms/<STORY>-<YYYYMMDD>-handoff.md` |
| Bus Log Entry | Machine-readable event | `docs/09-agents/bus/log.jsonl` (append line) |

Both are required - never skip one.

---

### 🚨 RULE #3: DIFF-FIRST, YES/NO PATTERN

**ALWAYS follow this pattern:**

1. Generate both files in memory (don't write yet)
2. Show preview/diff to user
3. Ask: "Create this handoff? (YES/NO)"
4. Only write files if user says YES

❌ WRONG: Write files immediately without showing preview
✅ RIGHT: Show diff, wait for approval, then write

---

### 🚨 RULE #4: HANDOFF NOTE STRUCTURE

Use template from `@packages/cli/src/core/templates/comms-note-template.md`

Typical structure:
```markdown
# Handoff: <STORY>

From: <FROM_AGENT>
To: <TO_AGENT>
Date: <YYYYMMDD>

## Summary
[What was accomplished, current state]

## Work Completed
- [Item 1]
- [Item 2]

## Blockers
- [Blocker 1]
- [Blocker 2]

## Notes for Next Agent
[Key context, decisions, gotchas]

## Files Modified
- [file path]
- [file path]
```

---

### 🚨 RULE #5: BUS LOG ENTRY FORMAT

Append JSON line to `docs/09-agents/bus/log.jsonl`:

```json
{"ts":"2025-12-22T10:30:00Z","type":"handoff","story":"US-0042","from":"AG-API","to":"AG-UI","summary":"Completed API endpoints"}
```

Fields:
- `ts` - ISO 8601 timestamp (current time)
- `type` - Always "handoff"
- `story` - Story ID
- `from` - Source agent
- `to` - Target agent
- `summary` - Brief summary of what was handed off

---

### ANTI-PATTERNS (DON'T DO THESE)

❌ Create handoff without STORY/FROM/TO
❌ Write files without showing preview first
❌ Skip bus log entry (only create note)
❌ Write vague summary ("work done" instead of details)
❌ Forget to document blockers for next agent
❌ Create handoff to wrong agent (typo)

### DO THESE INSTEAD

✅ Always validate STORY/FROM/TO inputs
✅ Show diff/preview before writing
✅ Create both handoff note AND bus log entry
✅ Write specific summary of what was done
✅ Always document blockers
✅ Confirm agent IDs are correct

---

### WORKFLOW

1. **Input Validation**: Ensure STORY, FROM, TO provided (ask if missing)
2. **Generate Note**: Create handoff note from template
3. **Generate Bus Log**: Create JSON line entry
4. **Show Preview**: Display both files (diff format)
5. **Confirm**: Ask "Create this handoff? (YES/NO)"
6. **Write Files**: Only if user approves
7. **Confirm Done**: Show success message

---

### KEY FILES TO REMEMBER

| File | Purpose |
|------|---------|
| `docs/09-agents/comms/<STORY>-<DATE>-handoff.md` | Handoff note (human-readable) |
| `docs/09-agents/bus/log.jsonl` | Agent bus log (machine-readable) |
| `@packages/cli/src/core/templates/comms-note-template.md` | Handoff template |

---

### TOOL USAGE EXAMPLES

**TaskCreate/TaskUpdate** (to track handoff creation):
```xml
<invoke name="TaskCreate/TaskUpdate">
<parameter name="content">1. Parse inputs (STORY, FROM, TO, SUMMARY, BLOCKERS)
2. Generate handoff note from template
3. Generate bus log JSON line
4. Show preview and wait for YES/NO
5. Write files if approved</parameter>
<parameter name="status">in-progress</parameter>
</invoke>
```

**AskUserQuestion** (for confirmation):
```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "Create handoff from AG-API to AG-UI for US-0042?",
  "header": "Confirm Handoff",
  "multiSelect": false,
  "options": [
    {"label": "Yes, create handoff", "description": "Write note and bus log"},
    {"label": "No, cancel", "description": "Don't create"}
  ]
}]</parameter>
</invoke>
```

---

### REMEMBER AFTER COMPACTION

- `/agileflow:handoff` IS ACTIVE - documenting work transitions
- STORY, FROM, TO required - ask if missing
- Create TWO files: handoff note + bus log entry
- Always show diff FIRST, wait for YES/NO
- Use handoff template from templates/
- Document blockers for next agent

<!-- COMPACT_SUMMARY_END -->

## Prompt

ROLE: Handoff Scribe

TODO LIST TRACKING
**CRITICAL**: Immediately create a todo list using TaskCreate/TaskUpdate tool to track handoff documentation:
```
1. Parse inputs (STORY, FROM, TO, SUMMARY, BLOCKERS)
2. Create docs/09-agents/comms/<STORY>-<YYYYMMDD>-handoff.md
3. Append bus line with type="handoff"
4. Show preview and wait for YES/NO confirmation
```

Mark each step complete as you finish it. This ensures nothing is forgotten.

INPUTS
STORY=<US-ID>  FROM=<id>  TO=<id>
SUMMARY=<what changed>  BLOCKERS=<optional list>

TEMPLATE
Use the following comms note template:
@packages/cli/src/core/templates/comms-note-template.md

ACTIONS
1) Create docs/09-agents/comms/<STORY>-<YYYYMMDD>-handoff.md from comms-note-template.md.
2) Append bus line type="handoff".

Diff-first; YES/NO.

---

## Expected Output

### Successful Handoff

```
📋 Creating Handoff: US-0042

From: AG-API
To: AG-UI
Summary: Completed auth endpoints, tests passing

Files to create:
───────────────────────────────────────────────
1. docs/09-agents/comms/US-0042-20260121-handoff.md

Preview:
─────────────────────────────────────────────
# Handoff: US-0042

**From**: AG-API
**To**: AG-UI
**Date**: 2026-01-21

## Summary
Completed all authentication API endpoints including login, logout, and token refresh.
Unit and integration tests passing (14 tests).

## Work Completed
- POST /api/auth/login endpoint
- POST /api/auth/logout endpoint
- POST /api/auth/refresh endpoint
- JWT token generation with 1h expiry
- Integration tests with mocked database

## Blockers
- None - API is ready for UI integration

## Notes for Next Agent
- Use the `useAuth` hook for token management
- Login endpoint returns { token, user } on success
- Error responses use standard { error, code } format
- See docs/04-architecture/auth-api.md for full spec

## Files Modified
- src/api/auth/login.ts
- src/api/auth/logout.ts
- src/api/auth/refresh.ts
- tests/api/auth/*.test.ts
─────────────────────────────────────────────

2. docs/09-agents/bus/log.jsonl (append)
   + {"ts":"2026-01-21T14:30:00Z","type":"handoff","story":"US-0042","from":"AG-API","to":"AG-UI","summary":"Completed auth endpoints"}

[AskUserQuestion: "Create this handoff?"]

✅ Handoff created successfully!
   Note: docs/09-agents/comms/US-0042-20260121-handoff.md
   Bus log updated: handoff event appended
```

### Missing Required Inputs

```
❌ Missing required inputs

Please provide:
  • STORY - Story ID (e.g., US-0042)
  • FROM - Source agent (e.g., AG-API)
  • TO - Target agent (e.g., AG-UI)
  • SUMMARY - What was done

Usage:
/agileflow:handoff STORY=US-0042 FROM=AG-API TO=AG-UI SUMMARY="Completed auth endpoints"

Optional:
  • BLOCKERS - Issues for next agent (e.g., "Need DBA review")
```

### Handoff with Blockers

```
📋 Creating Handoff: US-0042

From: AG-API
To: AG-UI
Summary: Completed auth endpoints
Blockers: 2 identified

Files to create:
───────────────────────────────────────────────
1. docs/09-agents/comms/US-0042-20260121-handoff.md

## Blockers

⚠️ The following blockers need attention:

1. **Database migration pending**
   Schema changes need DBA review before deployment.
   Related: ADR-0015 (database upgrade strategy)

2. **Rate limiting not configured**
   Need to decide on rate limits for login endpoint.
   Suggest: /agileflow:adr for rate limiting decision

[AskUserQuestion: "Create handoff with blockers?"]
```

### Invalid Agent ID

```
❌ Invalid agent ID: AG-UNKNOWN

Valid agent IDs:
  • AG-UI - UI/frontend specialist
  • AG-API - API/backend specialist
  • AG-DATABASE - Database specialist
  • AG-CI - CI/CD specialist
  • AG-TESTING - Testing specialist
  • AG-DEVOPS - DevOps specialist

Check the FROM and TO parameters.

Usage:
/agileflow:handoff STORY=US-0042 FROM=AG-API TO=AG-UI SUMMARY="..."
```

---

## Related Commands

- `/agileflow:assign` - Assign stories to owners
- `/agileflow:status` - Update story status
- `/agileflow:blockers` - Track blockers
- `/agileflow:board` - Kanban board view
- `/agileflow:sprint` - Sprint planning
