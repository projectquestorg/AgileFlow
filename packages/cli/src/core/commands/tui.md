---
description: Launch Terminal User Interface for real-time session monitoring
argument-hint:
---

# /agileflow:tui

Launch the AgileFlow Terminal User Interface for real-time session visualization.

---

## Purpose

The TUI provides a unified dashboard for:
- **Session monitoring** - See all active sessions and their current stories
- **Agent visualization** - Watch multi-agent orchestration in real-time
- **Loop control** - Pause, resume, and manage autonomous loops
- **Event streaming** - Live feed of agent activity and test results

---

## IMMEDIATE ACTIONS

Upon invocation, execute these steps:

### Step 1: Launch TUI

```bash
node packages/cli/scripts/tui/index.js
```

### Step 2: Display Key Bindings

The TUI shows key bindings in the footer:
- **Q** - Quit TUI
- **S** - Start loop on current story
- **P** - Pause active loop
- **R** - Resume paused loop
- **T** - Toggle trace panel
- **1-9** - Switch session focus

---

## Key Features

### Session Overview Panel
- Lists all active sessions with ID, branch, and current story
- Color coding by thread type (base=green, parallel=cyan)
- Shows loop progress and iteration count

### Agent Output Panel
- Real-time stream of agent messages
- Timestamps and agent identification
- Auto-scroll with history buffer

### Trace Panel (Toggle with T)
- Detailed view of agent loops and quality gates
- Progress bars for each gate (tests, coverage, lint, types)
- Pass/fail status indicators

---

## Example Session

```
┌─────────────────────────────────────────────────────────────────────┐
│                        AgileFlow TUI                                │
├─────────────────────────────┬───────────────────────────────────────┤
│  SESSIONS                   │  AGENT OUTPUT                         │
│  ─────────                  │  ────────────                         │
│  ▶ Session 1 [main]         │  [agileflow-api] Reading status.json  │
│    Story: US-0115           │  [agileflow-api] Running tests...     │
│    Loop: 3/20 iterations    │  ✓ 47 tests passed                    │
├─────────────────────────────┴───────────────────────────────────────┤
│ [S]tart  [P]ause  [R]esume  [T]race  [Q]uit                        │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Related Commands

- `/agileflow:babysit MODE=loop` - Autonomous story processing
- `/agileflow:session:status` - Session information (non-TUI)
- `/agileflow:session:new` - Create parallel sessions

---

## Research

Based on Ralph TUI research: `docs/10-research/20260114-ralph-loop-ralph-tui.md`
