# Nested Ralph Loops Architecture

> **Status**: Experimental
> **Risk Level**: High
> **Branch**: `feature/nested-ralph-loops`

## Overview

Nested Ralph Loops enable the orchestrator to spawn domain experts that run their own quality-gate loops independently. Each agent iterates until its gate passes, with state isolation to prevent race conditions.

## Problem Statement

The standard Ralph Loop (`ralph-loop.js`) uses a single `session-state.json` file. When multiple agents run in parallel, they would corrupt each other's state. Nested loops solve this with **isolated state files** per agent.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    ORCHESTRATOR                              │
│                                                              │
│  ┌──────────────────┐  ┌──────────────────┐                 │
│  │ API Agent        │  │ UI Agent         │  (parallel)     │
│  │ Loop: coverage   │  │ Loop: visual     │                 │
│  │ State: loop-001  │  │ State: loop-002  │  ← ISOLATED     │
│  │ Max: 5 iter      │  │ Max: 5 iter      │                 │
│  └──────────────────┘  └──────────────────┘                 │
│           ↓                    ↓                             │
│      TaskOutput           TaskOutput                        │
│           ↓                    ↓                             │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              SYNTHESIS + FINAL VERIFICATION           │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

## Key Components

### 1. agent-loop.js

**Location**: `packages/cli/scripts/agent-loop.js`

Standalone script for managing isolated agent loops:

```bash
# Initialize a loop
agent-loop.js --init --gate=coverage --threshold=80 --max=5 --loop-id=abc123

# Check gate and update state
agent-loop.js --check --loop-id=abc123

# View status
agent-loop.js --status --loop-id=abc123

# Abort
agent-loop.js --abort --loop-id=abc123 --reason=manual

# List all loops
agent-loop.js --list

# Clean up completed loops
agent-loop.js --cleanup
```

### 2. State Files

**Location**: `.agileflow/sessions/agent-loops/{loop-id}.json`

```json
{
  "loop_id": "abc12345",
  "agent_type": "agileflow-api",
  "parent_orchestration": "orch-001",
  "quality_gate": "coverage",
  "threshold": 80,
  "iteration": 2,
  "max_iterations": 5,
  "current_value": 72,
  "status": "running",
  "regression_count": 0,
  "started_at": "2026-01-09T10:00:00Z",
  "last_progress_at": "2026-01-09T10:05:00Z",
  "events": [
    {"iter": 1, "value": 65, "passed": false, "at": "2026-01-09T10:02:00Z"},
    {"iter": 2, "value": 72, "passed": false, "at": "2026-01-09T10:05:00Z"}
  ]
}
```

### 3. Event Bus

**Location**: `docs/09-agents/bus/log.jsonl`

All loop events are emitted for monitoring:

```json
{"type":"agent_loop","event":"init","loop_id":"abc123","agent":"agileflow-api","gate":"coverage","threshold":80,"timestamp":"..."}
{"type":"agent_loop","event":"iteration","loop_id":"abc123","iter":1,"value":65,"passed":false,"timestamp":"..."}
{"type":"agent_loop","event":"passed","loop_id":"abc123","final_value":82,"iterations":3,"timestamp":"..."}
```

## Quality Gates

| Gate | Check Method | Pass Condition |
|------|--------------|----------------|
| `tests` | Run `npm test` | Exit code 0 |
| `coverage` | Parse coverage report | % >= threshold |
| `visual` | Check screenshot prefixes | All have `verified-` |
| `lint` | Run `npm run lint` | Exit code 0 |
| `types` | Run `npx tsc --noEmit` | Exit code 0 |

## Safety Mechanisms

### Hard Limits

| Limit | Value | Purpose |
|-------|-------|---------|
| Max iterations | 5 | Prevent runaway loops |
| Max concurrent loops | 3 | Limit resource usage |
| Timeout per loop | 10 min | Hard abort |
| Stall threshold | 5 min | Abort if no progress |

### Automatic Abort Conditions

1. **Max iterations reached**: Loop exhausted without passing gate
2. **Regression detected**: Value decreased 2+ consecutive times
3. **Stalled**: No improvement for 5+ minutes
4. **Timeout**: Loop exceeded 10-minute limit

### Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Loop passed (gate satisfied) |
| 1 | Loop failed/aborted |
| 2 | Loop still running (gate not yet satisfied) |

## Data Flow

```
Orchestrator                    Agent                           agent-loop.js
    │                             │                                   │
    │ Task(with loop config)      │                                   │
    ├────────────────────────────>│                                   │
    │                             │ --init (create state file)        │
    │                             ├──────────────────────────────────>│
    │                             │                                   │
    │                             │ Implement feature                 │
    │                             │                                   │
    │                             │ --check (run gate)                │
    │                             ├──────────────────────────────────>│
    │                             │<──────────────────────────────────┤
    │                             │ exit code 2 (running)             │
    │                             │                                   │
    │                             │ Iterate, improve                  │
    │                             │                                   │
    │                             │ --check (run gate)                │
    │                             ├──────────────────────────────────>│
    │                             │<──────────────────────────────────┤
    │                             │ exit code 0 (passed)              │
    │                             │                                   │
    │ TaskOutput                  │                                   │
    │<────────────────────────────┤                                   │
    │                             │                                   │
```

## Usage Example

### Orchestrator Spawning with Loops

```javascript
// In orchestrator prompt building:

Task(
  description: "API with coverage loop",
  prompt: `Implement /api/profile endpoint.

  ## AGENT LOOP ACTIVE

  Quality gate: coverage >= 80%
  Max iterations: 5
  Loop ID: abc12345

  After each implementation:
  node .agileflow/scripts/agent-loop.js --check --loop-id=abc12345

  Exit code 2 = keep iterating
  Exit code 0 = done (gate passed)
  Exit code 1 = failed (report error)`,
  subagent_type: "agileflow-api",
  run_in_background: true
)
```

### Agent Behavior

1. Agent receives loop config in prompt
2. Agent implements feature
3. Agent runs `--check` to verify gate
4. If exit code 2: iterate and improve
5. If exit code 0: report success
6. If exit code 1: report failure

## Comparison: Standard vs Nested Loops

| Aspect | Standard Ralph Loop | Nested Agent Loops |
|--------|---------------------|-------------------|
| State file | Single `session-state.json` | Per-agent `agent-loops/{id}.json` |
| Parallelism | Sequential stories | Parallel agents |
| Gate scope | Project-wide | Per-agent |
| Trigger | Stop hook | Agent-driven |
| Use case | Story progression | Quality gate enforcement |

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| State corruption | Isolated files per loop |
| Resource explosion | Hard limits (5 iter × 3 agents) |
| Coordination failure | Dependencies managed by orchestrator |
| Debugging difficulty | Full event log in bus |
| Cost spiral | Timeout + max iteration limits |
| Silent failures | Regression + stall detection |

## Files Reference

| File | Purpose |
|------|---------|
| `packages/cli/scripts/agent-loop.js` | Core loop manager |
| `packages/cli/src/core/agents/orchestrator.md` | Orchestrator with loop mode |
| `.agileflow/sessions/agent-loops/` | Loop state files |
| `docs/09-agents/bus/log.jsonl` | Event bus for monitoring |

## Future Enhancements

- [ ] Dependency graph for sequential agent loops
- [ ] Cross-agent coverage (avoid overlap)
- [ ] Cost tracking and budget limits
- [ ] Real-time progress dashboard
- [ ] Orchestrator-level abort command
