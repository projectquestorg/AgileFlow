# Session System Architecture

This document explains how AgileFlow's multi-session coordination system works, including its limitations and best practices.

## Overview

AgileFlow supports multiple parallel Claude Code sessions working in the same repository. Each session is tracked with a numbered ID and can optionally use git worktrees for complete isolation.

## Core Components

### Session Registry

**Location**: `.agileflow/sessions/registry.json`

```json
{
  "next_id": 3,
  "sessions": {
    "1": {
      "path": "/home/user/project",
      "branch": "main",
      "is_main": true,
      "nickname": null,
      "created": "2026-01-13T10:00:00.000Z"
    },
    "2": {
      "path": "/home/user/project-worktrees/auth",
      "branch": "feature/auth",
      "is_main": false,
      "nickname": "auth",
      "created": "2026-01-13T11:00:00.000Z"
    }
  }
}
```

### Lock Files

**Location**: `.agileflow/sessions/{id}.lock`

Each active session maintains a lock file containing:
- PID of the Claude Code process
- Start timestamp

Lock files are used for **liveness detection** - if the PID is dead, the session is considered inactive.

### Session Manager

**Script**: `.agileflow/scripts/session-manager.js`

Commands:
- `status` - Get current session state (JSON)
- `full-status` - Detailed status including cleanup info
- `create` - Register a new session
- `end` - End current session
- `list` - List all sessions

## Liveness Detection (PID-Based)

Sessions are considered "alive" based on whether their PID is still running:

```javascript
function isPidAlive(pid) {
  try {
    process.kill(pid, 0);  // Signal 0 = check if process exists
    return true;
  } catch {
    return false;
  }
}
```

### How Sessions Disappear

When Claude Code starts, the welcome script (`agileflow-welcome.js`) performs cleanup:

1. Scans all sessions in registry
2. Checks if each session's PID is alive
3. Removes lock files for dead PIDs
4. Reports what was cleaned

**This is why sessions "disappear"** - when you close a terminal or Claude Code crashes, the PID dies, and the next session startup cleans it up.

### Visible Cleanup

As of v2.86.0+, cleanup is **visible** in the welcome message:

```
📋 Cleaned 1 inactive session(s):
   └─ Session 2 (process ended, PID 12345)
   Sessions are cleaned when their Claude Code process is no longer running.
```

## Story Claiming

Story claiming prevents multiple sessions from working on the same story.

### How It Works

1. **Claim on selection**: When babysit user selects a story, it's claimed
2. **Check before suggesting**: Stories claimed by OTHER sessions show 🔒
3. **Release on completion**: When story marked done, claim is released

### Claim Storage

Claims are stored in `docs/09-agents/status.json` on each story:

```json
{
  "US-0042": {
    "title": "Add login form",
    "status": "in_progress",
    "claimed_by": {
      "session_id": "2",
      "claimed_at": "2026-01-13T12:00:00.000Z",
      "pid": 12345
    }
  }
}
```

### Claim Commands

```bash
# Claim a story
node .agileflow/scripts/lib/story-claiming.js claim US-0042

# Release a story
node .agileflow/scripts/lib/story-claiming.js release US-0042

# Check if claimed
node .agileflow/scripts/lib/story-claiming.js check US-0042

# List stories claimed by others
node .agileflow/scripts/lib/story-claiming.js others

# Clean stale claims (dead PIDs)
node .agileflow/scripts/lib/story-claiming.js cleanup
```

### Stale Claim Expiration

Claims automatically expire after **4 hours** (DEFAULT_CLAIM_TTL_HOURS) or when the claiming session's PID dies.

## Status Line

The status line shows session info for **non-main sessions only**:

```
agileflow v2.86.0 │ ⎇ Session 2:auth │ main
```

Main sessions show no session indicator (it's redundant).

### Why Updates Seem Slow

The status line is called by Claude Code **per conversation turn**, not on a timer. This is a Claude Code architectural constraint - AgileFlow cannot control refresh frequency.

## Best Practices

### For Multiple Sessions

1. **Use worktrees**: Create sessions with `session:new` which uses git worktrees
2. **Name sessions**: Use nicknames like "auth", "api", "tests" for clarity
3. **Check claims**: Before selecting a story, babysit shows which are claimed
4. **One story per session**: Avoid switching stories within a session

### For Main vs Worktree Sessions

| Aspect | Main Session | Worktree Session |
|--------|--------------|------------------|
| Path | Project root | `../{project}-worktrees/{name}` |
| Branch | Any | Typically feature branch |
| Cleanup | Stays in registry | Cleaned on PID death |
| Status line | No indicator | Shows `⎇ Session N:name` |

### Avoiding Conflicts

1. **Different stories**: Each session works on different stories
2. **Different files**: Even on same story, coordinate file changes
3. **Frequent commits**: Commit often to reduce merge conflicts
4. **Use git worktrees**: Complete isolation prevents file system conflicts

## Known Limitations

### 1. No Real-Time Notifications

Sessions don't receive notifications when another session claims/releases stories. You see the state when running commands like `/agileflow:babysit`.

**Workaround**: Run babysit at the start of work to see current claims.

### 2. Status Line Refresh

Cannot control when status line updates - it's per Claude Code conversation turn.

**Workaround**: Make a trivial request to force a status line refresh.

### 3. Cross-Session Communication

Sessions cannot directly communicate. The only coordination is through:
- Story claims in `status.json`
- Git commits/branches
- Agent bus logs (read-only)

**Workaround**: Use story claiming to avoid duplicate work.

### 4. PID-Based Detection Limitations

If Claude Code is killed without cleanup (kill -9, system crash), the session remains "orphaned" until next startup cleanup.

**Workaround**: Run `/session:status` or start a new session to trigger cleanup.

## Architecture Diagram

```
┌──────────────────────────────────────────────────────────┐
│                    Claude Code Instance                   │
│                                                          │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐      │
│  │  Session 1  │  │  Session 2  │  │  Session 3  │      │
│  │  (main)     │  │  (worktree) │  │  (worktree) │      │
│  │  PID: 1234  │  │  PID: 5678  │  │  PID: 9012  │      │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘      │
│         │                │                │              │
└─────────┼────────────────┼────────────────┼──────────────┘
          │                │                │
          ▼                ▼                ▼
┌──────────────────────────────────────────────────────────┐
│              .agileflow/sessions/                         │
│                                                          │
│  registry.json     1.lock      2.lock      3.lock       │
│  ┌──────────┐   ┌────────┐  ┌────────┐  ┌────────┐     │
│  │ next: 4  │   │PID:1234│  │PID:5678│  │PID:9012│     │
│  │ sessions │   │time:...│  │time:...│  │time:...│     │
│  └──────────┘   └────────┘  └────────┘  └────────┘     │
│                                                          │
└──────────────────────────────────────────────────────────┘
          │
          ▼
┌──────────────────────────────────────────────────────────┐
│              docs/09-agents/status.json                   │
│                                                          │
│  stories:                                                │
│    US-0042:                                              │
│      claimed_by: { session_id: "2", pid: 5678 }         │
│    US-0043:                                              │
│      claimed_by: null  (available)                       │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

## Related Commands

| Command | Purpose |
|---------|---------|
| `/session:new` | Create new session (optionally with worktree) |
| `/session:status` | Show current session state |
| `/session:end` | End current session |
| `/session:list` | List all sessions |
| `/agileflow:babysit` | Main workflow (shows claims, handles claiming) |

## Version History

- **v2.86.0**: Visible cleanup messages, session context in obtain-context, status line session indicator
- **v2.85.0**: Story claiming infrastructure
- **v2.84.0**: Multi-session support with worktrees
