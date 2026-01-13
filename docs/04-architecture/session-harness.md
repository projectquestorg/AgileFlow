# Session Harness System

Ensures test verification and session continuity for long-running projects.

---

## The Problem

Without verification, agents can:
- Break existing functionality without noticing
- Claim features work when tests fail
- Lose context between sessions
- Mark incomplete work as finished

---

## The Solution

Session Harness System provides:
- **Test Tracking**: Every story has `test_status` field
- **Regression Detection**: Alerts when tests were passing, now failing
- **Session Continuity**: Structured handoff between sessions
- **Baselines**: Git tags mark known-good states

---

## Quick Start

```bash
# First time setup (interactive)
/agileflow:session:init

# Start each session
/agileflow:session:resume

# Run tests and update status
/agileflow:verify

# Create verified checkpoint
/agileflow:baseline "Sprint 12 complete"

# End session cleanly
/agileflow:session:end
```

---

## Session Commands

| Command | Description |
|---------|-------------|
| `/agileflow:session:init` | Initialize session harness with test verification |
| `/agileflow:session:resume` | Resume session with environment verification |
| `/agileflow:session:status` | View current session state and activity |
| `/agileflow:session:end` | Cleanly end session and record summary |
| `/agileflow:session:history` | View past session history and metrics |
| `/agileflow:verify` | Run tests and update story test status |
| `/agileflow:baseline` | Mark current state as verified baseline |

---

## How It Works

### 1. Test Tracking

Every story in `status.json` has a `test_status` field:

```json
{
  "stories": {
    "US-0001": {
      "title": "User Login",
      "status": "done",
      "test_status": "passing"
    }
  }
}
```

Values: `passing`, `failing`, `not_run`

### 2. Pre-Implementation Check

Before starting work, agents check test_status:
- If `failing`: Fix tests first
- If `not_run`: Run tests to establish baseline

### 3. Post-Implementation Verification

Before marking a story complete:

```
/agileflow:verify
```

This runs the test suite and updates `test_status`.

### 4. Regression Detection

When resuming a session, `/agileflow:session:resume`:
- Runs test suite
- Compares with previous `test_status`
- Alerts if tests were passing, now failing

### 5. Baselines

Create known-good checkpoints:

```
/agileflow:baseline "Sprint 12 complete"
```

This:
- Creates git tag `baseline-YYYYMMDD-HHMMSS`
- Records baseline in session state
- Provides reset point if needed

---

## Session State

Stored in `docs/09-agents/session-state.json` (schema v3):

```json
{
  "current_session": {
    "started_at": "2025-01-15T10:00:00Z",
    "last_activity": "2025-01-15T14:30:00Z",
    "stories_touched": ["US-0042", "US-0043"],
    "tests_run": 3,
    "tests_passed": 3,
    "thread_type": "base",
    "thread_complexity": "routine",
    "expected_duration_minutes": null
  },
  "active_commands": ["babysit"],
  "baselines": [
    {
      "tag": "baseline-20250115-100000",
      "message": "Sprint 12 complete",
      "test_status": "all_passing"
    }
  ]
}
```

### Thread Type Fields (v3)

| Field | Type | Values | Description |
|-------|------|--------|-------------|
| `thread_type` | enum | base, parallel, chained, fusion, big, long | Thread pattern being used |
| `thread_complexity` | enum | trivial, routine, complex, exploratory | Complexity classification |
| `expected_duration_minutes` | number/null | Any positive number | Expected session duration |

See [Thread-Based Engineering](../02-practices/thread-based-engineering.md) for thread type definitions.

---

## Agent Integration

All 26 domain agents include verification protocol:
- Check test_status before starting work
- Run `/agileflow:verify` before marking complete
- Report regressions immediately

---

## Benefits

| Benefit | Description |
|---------|-------------|
| No Broken Baselines | Can't mark stories complete with failing tests |
| Fail Fast | Catch regressions immediately, not at PR review |
| Context Continuity | Structured handoff between sessions |
| Regression Detection | Alerts when tests were passing, now failing |

---

## Related Documentation

- [Commands](./commands.md) - Session commands reference
- [Configuration System](./configuration-system.md) - Session configuration
- [Hooks System](./hooks-system.md) - Auto-run session resume
