# Codex App UI/UX Research for AgileFlow Dashboard

**Date**: 2026-02-03
**Sources**: OpenAI Codex App documentation, Simon Willison analysis
**Purpose**: Extract features and UI patterns for AgileFlow cloud dashboard

---

## Key Codex App Features to Implement

### 1. Multi-Project Sidebar
**What Codex Does**:
- Left sidebar shows all projects
- Each project has its own threads (sessions)
- Quick switching between projects
- Projects show sync status

**For AgileFlow**:
```
┌─────────────────┐
│ Projects        │
│ ─────────────── │
│ > AgileFlow     │  ← Currently selected
│   my-app        │
│   api-server    │
│ ─────────────── │
│ [+ Add Project] │
└─────────────────┘
```

### 2. Thread/Session Management
**What Codex Does**:
- Multiple "threads" per project (parallel tasks)
- Each thread can be Local, Worktree, or Cloud mode
- Threads show status: active, paused, completed
- Can run multiple threads simultaneously

**For AgileFlow**:
- Map to our "sessions" concept
- Show active agent, current story
- Session status indicators
- Quick resume/pause controls

### 3. Review Pane (Diff Viewer)
**What Codex Does**:
- Shows Git diff of all changes
- Can filter: Uncommitted, All branch changes, Last turn changes
- Toggle between Staged/Unstaged
- **Inline comments** - click + on any line to leave feedback
- Stage/unstage/revert at file, hunk, or entire diff level
- Click file name → opens in editor
- Click line with Cmd → opens specific line

**For AgileFlow**:
```
┌─────────────────────────────────────────────────┐
│ Review                    [Staged] [Unstaged]   │
├─────────────────────────────────────────────────┤
│ ▼ src/components/Header.tsx                     │
│   ┌─────────────────────────────────────────┐   │
│   │ - import { Logo } from './Logo'         │ + │ ← Inline comment button
│   │ + import { Logo, Button } from './ui'   │   │
│   │                                         │   │
│   │   [Stage Hunk] [Revert Hunk]           │   │
│   └─────────────────────────────────────────┘   │
│                                                 │
│ ▼ src/lib/auth.ts                              │
│   ...                                           │
├─────────────────────────────────────────────────┤
│ [Stage All] [Revert All] [Commit...]           │
└─────────────────────────────────────────────────┘
```

### 4. Automations System
**What Codex Does**:
- Schedule recurring tasks (cron-like)
- Runs in background worktrees
- Results go to "Inbox" / "Triage" section
- Can combine with Skills
- Example automations:
  - Daily exec briefing of commits
  - Auto-fix bugs from recent commits
  - Scan for issues in telemetry

**For AgileFlow** (already implemented in CLI):
- Surface automations in dashboard
- Show automation runs, inbox items
- Configure schedules via UI
- Link to skills

### 5. Integrated Terminal
**What Codex Does**:
- Built-in terminal per thread
- Scoped to project/worktree
- Toggle with Cmd+J
- Can run git commands, tests, dev servers

**For AgileFlow**:
- WebSocket-based terminal in browser
- Uses xterm.js or similar
- Connected to CLI's shell

### 6. Skills Browser
**What Codex Does**:
- Sidebar shows available skills
- Can browse skills from team across projects
- Click skill to use it
- Skills shared across App, CLI, IDE Extension

**For AgileFlow**:
- Show installed skills
- Quick-insert skill reference ($skill-name)
- Skill marketplace concept

### 7. Voice Dictation
**What Codex Does**:
- Hold Ctrl+M to dictate
- Transcribes to text
- Can edit before sending

**For AgileFlow**:
- Nice-to-have for Phase 2
- Use Web Speech API

### 8. IDE Context Sync
**What Codex Does**:
- Syncs with IDE extension
- "Auto context" tracks files being viewed
- Threads visible in both app and IDE

**For AgileFlow**:
- Future: VS Code extension sync
- For now: manual file selection

### 9. Image Input
**What Codex Does**:
- Drag/drop images into composer
- Hold Shift while dropping to add to context
- Can ask Codex to take screenshots

**For AgileFlow**:
- Support image uploads
- Forward to Claude with vision

### 10. Notifications
**What Codex Does**:
- Notify when task completes
- Notify when approval needed
- Configurable: never, background only, always

**For AgileFlow**:
- Browser notifications
- Configurable in settings

### 11. Worktree Support
**What Codex Does**:
- Create isolated Git worktrees per thread
- Changes don't affect main checkout
- Automations run in dedicated worktrees

**For AgileFlow** (already have):
- `/session:spawn` creates worktrees
- Show worktree status in dashboard

### 12. Git Integration
**What Codex Does**:
- Stage/unstage/revert directly in app
- Commit with message
- Push to remote
- Create pull requests

**For AgileFlow**:
```
┌─────────────────────────────────────┐
│ Commit Changes                       │
├─────────────────────────────────────┤
│ Message:                            │
│ ┌─────────────────────────────────┐ │
│ │ Add logout button to header     │ │
│ └─────────────────────────────────┘ │
│                                     │
│ [Commit] [Commit & Push] [Create PR]│
└─────────────────────────────────────┘
```

---

## UI Layout Comparison

### Codex App Layout
```
┌──────────────────────────────────────────────────────────────────┐
│ [Logo]                              [Settings] [Theme] [Account] │
├────────────┬─────────────────────────────────┬───────────────────┤
│ Projects   │ Thread View                     │ Review Pane       │
│            │                                 │                   │
│ > Project1 │ ┌─────────────────────────────┐ │ Uncommitted (3)   │
│   Project2 │ │ You: Add login button       │ │                   │
│            │ └─────────────────────────────┘ │ ▼ Header.tsx      │
│ ─────────  │                                 │   - line 1        │
│ Threads    │ ┌─────────────────────────────┐ │   + line 2        │
│            │ │ Claude: I'll add that...    │ │                   │
│ ● Thread 1 │ │                             │ │ ▼ auth.ts         │
│ ○ Thread 2 │ │ 📖 Read Header.tsx          │ │   ...             │
│ ○ Thread 3 │ │ ✏️ Edit Header.tsx          │ │                   │
│            │ │ 🖥️ npm test                  │ │                   │
│ ─────────  │ └─────────────────────────────┘ │                   │
│ Automations│                                 │                   │
│ Skills     │ ┌─────────────────────────────┐ │                   │
│            │ │ [Type message...]     [Send]│ │                   │
│            │ └─────────────────────────────┘ │                   │
├────────────┴─────────────────────────────────┴───────────────────┤
│ Terminal (Cmd+J)                                                  │
│ $ npm test                                                        │
│ PASS src/Header.test.tsx                                         │
└──────────────────────────────────────────────────────────────────┘
```

### Proposed AgileFlow Dashboard Layout
```
┌──────────────────────────────────────────────────────────────────┐
│ [AgileFlow Logo]  [Projects ▼]  [Search]    [Settings] [Account] │
├────────────┬─────────────────────────────┬───────────────────────┤
│ Sessions   │ Chat                        │ Panels (tabs)         │
│            │                             │ [Review][Tasks][Board]│
│ ● Session1 │ ┌───────────────────────┐   │                       │
│   US-0042  │ │ You: Add login...     │   │ ▼ Header.tsx          │
│   AG-UI    │ └───────────────────────┘   │   - old code          │
│            │                             │   + new code          │
│ ○ Session2 │ ┌───────────────────────┐   │                       │
│   US-0043  │ │ Claude: I'll add...   │   │ ───────────────────   │
│   AG-API   │ │                       │   │ Tasks:                │
│            │ │ 📖 Read Header.tsx    │   │ ☑ Read header         │
│ ─────────  │ │ ┌─────────────────┐   │   │ ◐ Add button          │
│ [+ New]    │ │ │ code preview... │   │   │ ☐ Run tests           │
│            │ │ └─────────────────┘   │   │                       │
│ ─────────  │ │                       │   │ ───────────────────   │
│ Automations│ │ ✏️ Edit Header.tsx    │   │ Story: US-0042        │
│ ▶ Daily CI │ │ ┌─────────────────┐   │   │ Status: in_progress   │
│ ▶ Weekly   │ │ │ diff preview... │   │   │ Owner: AG-UI          │
│            │ │ └─────────────────┘   │   │                       │
│ ─────────  │ └───────────────────────┘   │                       │
│ Inbox (2)  │                             │                       │
│            │ ┌───────────────────────┐   │                       │
│            │ │ [Message...]   [Send] │   │                       │
│            │ └───────────────────────┘   │                       │
├────────────┴─────────────────────────┴───────────────────────────┤
│ Terminal                                              [Cmd+J] ▼  │
│ $ _                                                              │
└──────────────────────────────────────────────────────────────────┘
```

---

## Technical Notes from Research

### SQLite Database (from Simon Willison)
Codex stores automations in SQLite:
- `~/.codex/sqlite/codex-dev.db`
- Tables: `automation_runs`, `automations`, `inbox_items`
- Can explore with Datasette

**For AgileFlow**: We use JSON files, but could migrate to SQLite for better querying.

### Electron + Node.js
- Codex is built with Electron
- Windows support "coming very soon" but sandboxing is harder
- Cross-platform target

**For AgileFlow**: We're building web-first, which is better for cloud IDE users.

### Cloud Automations Coming
- Currently automations only run when laptop is on
- OpenAI promised cloud-based automations soon

**For AgileFlow**: Our dashboard solves this - syncs to cloud, runs anywhere.

---

## Feature Priority for AgileFlow Dashboard

### Phase 1 (MVP) - Must Have
1. ✅ Project list with sync status
2. ✅ Chat interface with streaming
3. ✅ Tool call visualization (Read/Edit/Bash)
4. ✅ Task panel (real-time updates)
5. ✅ Basic diff viewer
6. ✅ Session management

### Phase 2 - Important
1. 🔲 Full Review pane with inline comments
2. 🔲 Git integration (commit, push, PR)
3. 🔲 Automations UI
4. 🔲 Integrated terminal
5. 🔲 Notifications

### Phase 3 - Nice to Have
1. 🔲 Skills browser
2. 🔲 Voice dictation
3. 🔲 Image input
4. 🔲 IDE extension sync
5. 🔲 Worktree visualization

---

## Key Differentiators from Codex

| Feature | Codex | AgileFlow Dashboard |
|---------|-------|---------------------|
| Platform | Desktop (Electron) | Web (works in Terminus!) |
| Auth | ChatGPT account | GitHub OAuth |
| Agent | OpenAI Codex | Claude (your choice) |
| Stories/Epics | None | Built-in tracking |
| Kanban Board | None | Yes! |
| Multi-session | Threads | Worktree sessions |
| Automations | Local only (for now) | Cloud-ready |
| Skills | First-class | Via AgileFlow commands |

---

## Screenshots Captured

1. `codex-simon-willison-article.png` - Blog analysis
2. `codex-app-overview.png` - Main documentation
3. `codex-app-features.png` - Features page
4. `codex-app-review.png` - Review pane docs
5. `codex-app-automations.png` - Automations docs

---

## Next Steps

1. Use this research to refine dashboard UI mockups
2. Prioritize features based on user value
3. Build Phase 1 MVP first
4. Iterate based on user feedback
