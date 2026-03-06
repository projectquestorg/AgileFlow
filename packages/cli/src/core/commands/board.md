---
description: Display visual kanban board with WIP limits
phase: pre-story
argument-hint: "[EPIC=<EP-ID>] [OWNER=<id>] [FORMAT=ascii|markdown|html] [GROUP_BY=status|owner|epic]"
model: haiku
type: output-only  # Board display - read-only visualization, not an ongoing task
compact_context:
  priority: medium
  preserve_rules:
    - "ACTIVE COMMAND: /agileflow:board - Kanban board visualizer (read-only)"
    - "MUST read docs/09-agents/status.json (do NOT modify)"
    - "MUST organize stories by status (ready, in-progress, in-review, done, blocked)"
    - "MUST show WIP limits (2 stories per agent)"
    - "MUST highlight blockers and WIP violations"
    - "MUST provide ASCII art board visualization"
    - "MUST show statistics (throughput, velocity, completion %)"
    - "MUST suggest next actions based on board state"
  state_fields:
    - epic_filter
    - owner_filter
    - format
    - group_by
---

# board

Generate a visual kanban board from current story statuses.

## STEP 0: Gather Context

```bash
node .agileflow/scripts/obtain-context.js board
```

This gathers git status, stories/epics, session state, and registers for PreCompact.

<!-- COMPACT_SUMMARY_START -->

## ⚠️ COMPACT SUMMARY - /agileflow:board IS ACTIVE

**CRITICAL**: You are the Board Visualizer. This command displays project state (read-only).

---

### 🚨 RULE #1: ALWAYS Read status.json (NEVER Modify)

- Read-only operation (visualization only)
- NEVER update status.json from this command
- Extract story data and calculate WIP metrics
- No file writes, no state changes

### 🚨 RULE #2: ALWAYS Show Four Columns

**Column Layout** (by default):
1. **READY** (status="ready")
2. **IN PROGRESS** (status="in-progress")
3. **IN REVIEW** (status="in-review")
4. **DONE** (status="done")

Special handling:
- Separate BLOCKED stories (show with 🔴 red)
- Show WIP limits per agent (max 2 in-progress + in-review)

### 🚨 RULE #3: ALWAYS Calculate & Show WIP Violations

- Count in-progress + in-review per agent
- Highlight if >2 stories (WIP limit exceeded)
- Show with ⚠️ warning icon
- Suggest unblocking action

### 🚨 RULE #4: ALWAYS Include Statistics

Show these stats:
- Total stories in each status
- WIP status per agent
- Blockers count and reasons
- Throughput (stories completed this week)
- Velocity trend (↗ ↘ →)

---

## Key Parameters & Output

**Input Parameters**:
```
EPIC=<EP_ID>           # Filter by specific epic (optional)
OWNER=<agent_id>       # Filter by owner (optional)
FORMAT=ascii|markdown|html  # Output format (default: ascii)
GROUP_BY=status|owner|epic  # Grouping method (default: status)
```

**Output Formats**:
| Format | Use Case | Visual |
|--------|----------|--------|
| ascii | Terminal viewing | Box drawing chars (╔╗╚╝) |
| markdown | Documentation/wiki | Markdown tables |
| html | Web export | Full HTML page |

**Data Source**:
- Read: docs/09-agents/status.json
- Extract: story status, owner, epic, estimate

---

## Board Visualization Rules

**ASCII Format** (default):
- Box drawing characters (╔═╗║╚╝├┤┬┴┼)
- Columns for each status
- Story cards with ID, title, owner, estimate, epic
- Color coded via emoji (🟢🟡🔵⚪🔴)
- Max 80 char width for terminal viewing

**Card Contents**:
```
🟢 US-0042
Login form
AG-UI · 1d
EP-0010
```

**WIP Indicator**:
```
🔄 IN PROGRESS (4)
WIP: 4/6 ⚠️ (at limit)
```

**Blocked Indicator**:
```
🔴 BLOCKED (1)
US-0041: Waiting on API keys
```

---

## Action Suggestions

After displaying board, suggest actions:
- "AG-UI at WIP limit. Complete US-0038 before starting new work."
- "US-0041 blocked >3 days. Escalate for API access?"
- "3 stories ready. Which should we prioritize?"
- "AG-DEVOPS has no work. Assign unblocking tasks?"

---

## Anti-Patterns & Correct Usage

❌ **DON'T**:
- Modify status.json (read-only command)
- Hide blockers or WIP violations
- Skip statistics and trend data
- Make board too wide (>80 chars)

✅ **DO**:
- Read status.json (no updates)
- Highlight WIP violations clearly
- Include statistics and trends
- Suggest next actions based on board state

---

## Confirmation & Follow-up

After displaying board:
```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "What would you like to do?",
  "header": "Board Actions",
  "multiSelect": false,
  "options": [
    {"label": "Update story status", "description": "Change status on board"},
    {"label": "View blockers", "description": "See blocker details"},
    {"label": "Filter board", "description": "Filter by epic/owner"},
    {"label": "Export snapshot", "description": "Save board to file"}
  ]
}]</parameter>
</invoke>
```

---

## REMEMBER AFTER COMPACTION

- Command is read-only (displays status.json, doesn't modify)
- Shows kanban board with 4 columns (ready, in-progress, in-review, done)
- Highlights blockers and WIP violations
- Includes statistics (throughput, velocity, trends)
- Suggests actionable next steps
- No file writes, no state changes

<!-- COMPACT_SUMMARY_END -->

## Prompt

ROLE: Board Visualizer

OBJECTIVE
Create a visual kanban board showing stories organized by status with color coding, WIP limits, and quick stats.

CONTEXT

Live repository state:
- Current branch: !`git branch --show-current`
- Last commit: !`git log -1 --oneline`
- Recent activity: !`git log --since="7 days ago" --oneline | head -5`
- Status file modified: !`stat -c %y docs/09-agents/status.json 2>/dev/null || echo "Not found"`

INPUTS (optional)
- EPIC=<EP_ID> (filter by specific epic)
- OWNER=<agent_id> (filter by owner)
- FORMAT=ascii|markdown|html (default: ascii)
- GROUP_BY=status|owner|epic (default: status)

DATA SOURCE
Read docs/09-agents/status.json to get all current story statuses.

BOARD LAYOUT (ASCII Format)

```
╔══════════════════════════════════════════════════════════════════════════════╗
║                           AGILEFLOW KANBAN BOARD                              ║
║                          Updated: 2025-10-17 14:30                            ║
╠══════════════════════════════════════════════════════════════════════════════╣
║ 📊 Summary: 15 stories | 3 ready | 4 in-progress | 2 in-review | 6 done     ║
║ ⚠️  WIP Limit: 2/agent (AG-UI: 2/2 ⚠️, AG-API: 1/2 ✓, AG-CI: 0/2 ✓)         ║
╚══════════════════════════════════════════════════════════════════════════════╝

┌─────────────────┬─────────────────┬─────────────────┬─────────────────┐
│ 📋 READY (3)    │ 🔄 IN PROGRESS  │ 👀 IN REVIEW    │ ✅ DONE (6)     │
│ WIP: -          │ (4) WIP: 4/6    │ (2) WIP: -      │ WIP: -          │
├─────────────────┼─────────────────┼─────────────────┼─────────────────┤
│                 │                 │                 │                 │
│ 🟢 US-0042      │ 🟡 US-0038      │ 🔵 US-0035      │ ⚪ US-0030      │
│ Login form UI   │ OAuth flow      │ Password reset  │ User registration│
│ AG-UI · 1d      │ AG-API · 1.5d   │ AG-API · 1d     │ AG-API · 1d     │
│ EP-0010         │ EP-0010         │ EP-0010         │ EP-0010         │
│                 │                 │                 │                 │
│ 🟢 US-0043      │ 🟡 US-0039      │ 🔵 US-0036      │ ⚪ US-0031      │
│ Profile page    │ Session mgmt    │ Email verify    │ Login endpoint  │
│ AG-UI · 1.5d    │ AG-API · 1d     │ AG-CI · 0.5d    │ AG-API · 1d     │
│ EP-0011         │ EP-0010         │ EP-0010         │ EP-0010         │
│                 │                 │                 │                 │
│ 🟢 US-0044      │ 🟡 US-0040      │                 │ ⚪ US-0032      │
│ Dashboard       │ Rate limiting   │                 │ JWT generation  │
│ AG-UI · 2d      │ AG-CI · 0.5d    │                 │ AG-API · 0.5d   │
│ EP-0011         │ EP-0010         │                 │ EP-0010         │
│                 │                 │                 │                 │
│                 │ 🟡 US-0041 ⚠️   │                 │ ⚪ US-0033      │
│                 │ BLOCKED         │                 │ DB schema       │
│                 │ Payment API     │                 │ AG-API · 0.5d   │
│                 │ AG-API · 2d     │                 │ EP-0010         │
│                 │ Dep: US-0035    │                 │                 │
│                 │                 │                 │ ⚪ US-0034      │
│                 │                 │                 │ Token refresh   │
│                 │                 │                 │ AG-API · 1d     │
│                 │                 │                 │ EP-0010         │
│                 │                 │                 │                 │
│                 │                 │                 │ ⚪ US-0037      │
│                 │                 │                 │ CI setup        │
│                 │                 │                 │ AG-CI · 1d      │
│                 │                 │                 │ EP-0010         │
└─────────────────┴─────────────────┴─────────────────┴─────────────────┘

Legend:
  🟢 Priority: High    🟡 Priority: Medium    🔵 Priority: Low    ⚪ Completed
  ⚠️  Blocked/WIP limit exceeded
```

COLOR CODING

Use emoji/symbols for visual distinction:
- 🟢 Green: High priority or ready to start
- 🟡 Yellow: In progress or medium priority
- 🔵 Blue: In review or low priority
- ⚪ White: Done
- 🔴 Red: Blocked
- ⚠️  Warning: WIP limit exceeded or blockers

MARKDOWN TABLE FORMAT

```markdown
## AgileFlow Board (2025-10-17 14:30)

**Summary**: 15 stories | 3 ready | 4 in-progress | 2 in-review | 6 done

| Ready | In Progress | In Review | Done |
|-------|-------------|-----------|------|
| **US-0042** 🟢<br>Login form UI<br>AG-UI · 1d<br>EP-0010 | **US-0038** 🟡<br>OAuth flow<br>AG-API · 1.5d<br>EP-0010 | **US-0035** 🔵<br>Password reset<br>AG-API · 1d<br>EP-0010 | **US-0030** ✅<br>User registration<br>AG-API · 1d<br>EP-0010 |
| **US-0043** 🟢<br>Profile page<br>AG-UI · 1.5d<br>EP-0011 | **US-0039** 🟡<br>Session mgmt<br>AG-API · 1d<br>EP-0010 | **US-0036** 🔵<br>Email verify<br>AG-CI · 0.5d<br>EP-0010 | **US-0031** ✅<br>Login endpoint<br>AG-API · 1d<br>EP-0010 |
| ... | ... | | ... |

### WIP Limits
- AG-UI: 2/2 ⚠️ (at limit)
- AG-API: 1/2 ✓
- AG-CI: 0/2 ✓

### Blockers
- US-0041 blocked by US-0035 (in review)
```

HTML FORMAT (for export)

```html
<!DOCTYPE html>
<html>
<head>
  <style>
    .board { display: flex; gap: 20px; padding: 20px; }
    .column { flex: 1; background: #f5f5f5; border-radius: 8px; padding: 15px; }
    .card { background: white; padding: 12px; margin: 10px 0; border-radius: 4px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
    .ready { border-left: 4px solid #4caf50; }
    .in-progress { border-left: 4px solid #ff9800; }
    .in-review { border-left: 4px solid #2196f3; }
    .done { border-left: 4px solid #9e9e9e; }
    .blocked { border: 2px solid #f44336; }
  </style>
</head>
<body>
  <h1>AgileFlow Kanban Board</h1>
  <div class="board">
    <div class="column">
      <h2>📋 Ready (3)</h2>
      <div class="card ready">
        <strong>US-0042</strong><br>
        Login form UI<br>
        <small>AG-UI · 1d · EP-0010</small>
      </div>
      <!-- More cards -->
    </div>
    <!-- More columns -->
  </div>
</body>
</html>
```

GROUP BY OWNER

```
╔══════════════════════════════════════════════════════════════════════════════╗
║                      AGILEFLOW BOARD (Grouped by Owner)                       ║
╚══════════════════════════════════════════════════════════════════════════════╝

┌─────────────────┬─────────────────┬─────────────────┐
│ 🎨 AG-UI (5)    │ 🔧 AG-API (8)   │ ⚙️  AG-CI (2)    │
│ WIP: 2/2 ⚠️     │ WIP: 1/2 ✓      │ WIP: 0/2 ✓      │
├─────────────────┼─────────────────┼─────────────────┤
│                 │                 │                 │
│ 🟡 US-0038      │ 🟡 US-0039      │ ✅ US-0037      │
│ IN PROGRESS     │ IN PROGRESS     │ DONE            │
│ Login form      │ Session mgmt    │ CI setup        │
│                 │                 │                 │
│ 🟡 US-0040      │ 🔵 US-0035      │ 🔵 US-0036      │
│ IN PROGRESS     │ IN REVIEW       │ IN REVIEW       │
│ Profile page    │ Password reset  │ Email verify    │
│                 │                 │                 │
│ 🟢 US-0042      │ 🟢 US-0043      │                 │
│ READY           │ READY           │                 │
│ Dashboard       │ Payment API     │                 │
└─────────────────┴─────────────────┴─────────────────┘
```

STATISTICS

Include helpful stats:
```
📊 Board Statistics

Throughput:
  - Stories completed this week: 6
  - Avg completion time: 2.3 days
  - Velocity: 8.5 points/week

Status Distribution:
  - Ready: 3 (20%)
  - In Progress: 4 (27%)
  - In Review: 2 (13%)
  - Done: 6 (40%)

By Owner:
  - AG-UI: 5 stories (2 in progress)
  - AG-API: 8 stories (1 in progress)
  - AG-CI: 2 stories (0 in progress)

Blockers:
  - 1 story blocked (US-0041 waiting on US-0035)

Warnings:
  - AG-UI at WIP limit (2/2)
  - US-0050 stale (no updates in 7 days)
```

ACTIONS (after showing board)

1. Ask: "Would you like to:"
   - Export to file? (board-YYYYMMDD.md or .html)
   - Update a story status?
   - View details for a specific story?
   - Filter by epic/owner?

2. Suggest actions based on board state:
   - "AG-UI is at WIP limit. Consider completing US-0038 before starting new work."
   - "US-0041 is blocked. Can we unblock it by reviewing US-0035?"
   - "3 stories ready. Which should we prioritize?"

INTEGRATION

- Save board snapshot to docs/08-project/boards/board-<YYYYMMDD>.md
- Track board states over time for velocity analysis
- Optionally update /agileflow:velocity with latest data

WORKFLOW

1. Read docs/09-agents/status.json
2. Parse stories by status
3. Apply filters (epic, owner) if specified
4. Calculate WIP limits and warnings
5. Render board in requested format
6. Show statistics
7. Suggest actions

RULES
- Never modify status.json (read-only visualization)
- Highlight blockers and WIP violations prominently
- Keep ASCII board width ≤80 chars for terminal viewing
- Update timestamp on every render
- Sort stories by priority within columns

OUTPUT
- Rendered kanban board (ASCII/markdown/HTML)
- Statistics summary
- Action suggestions
- Optional: saved snapshot file

---

## Expected Output

### Success - Kanban Board

```
📋 AgileFlow Kanban Board
Updated: 2026-01-29 09:45:00
Epic: EP-0026 (Q1 2026 Improvements)
══════════════════════════════════════════════════════════════════════════════

│ READY (3)        │ IN PROGRESS (2)  │ IN REVIEW (1)    │ DONE (15)       │
├──────────────────┼──────────────────┼──────────────────┼─────────────────┤
│ US-0200 [P2]     │ US-0198 [P2]     │ US-0195 [P1]     │ US-0186 ✓       │
│ DI for Gen..     │ Color consol..   │ Path valid..     │ US-0187 ✓       │
│ AG-API           │ AG-DEVOPS ●      │ AG-API           │ US-0188 ✓       │
│                  │                  │                  │ US-0189 ✓       │
│ US-0203 [P2]     │ US-0199 [P2]     │                  │ US-0190 ✓       │
│ Command docs     │ Path resolve..   │                  │ ...             │
│ AG-DEVOPS        │ AG-API ●         │                  │ +10 more        │
│                  │                  │                  │                 │
│ US-0205 [P3]     │                  │                  │                 │
│ Agent matrix     │                  │                  │                 │
│ AG-DOCS          │                  │                  │                 │
══════════════════════════════════════════════════════════════════════════════

WIP Limit: 3/3 ⚠️ (at capacity)
● = Currently active

📊 Statistics:
- Total: 21 stories
- Velocity: 4.2 stories/week
- Blocked: 0

Suggested: Complete in-progress work before pulling new stories.
```

### Success - Filtered View

```
📋 AgileFlow Kanban Board (Filtered: AG-API)
══════════════════════════════════════════════════════════════

Stories owned by AG-API: 8 total
- Ready: 2
- In Progress: 1
- In Review: 1
- Done: 4

[Board shows only AG-API stories...]
```

### Error - Epic Not Found

```
❌ Error: Epic not found: EP-9999

Available epics:
- EP-0026: Q1 2026 Improvements (21 stories)
- EP-0025: Session System (8 stories)
- EP-0024: Visual E2E Testing (6 stories)

Usage: /agileflow:board [EPIC=EP-XXXX]
```

---

## Related Commands

- `/agileflow:sprint` - Sprint planning
- `/agileflow:status` - Update story status
- `/agileflow:blockers` - Track blockers
- `/agileflow:story:list` - List all stories
- `/agileflow:epic:view` - View epic details
