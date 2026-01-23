### PROACTIVE ACTION SPECIFICATIONS

This agent performs proactive actions under specific, well-defined conditions. Each action has a clear trigger, detection mechanism, and output format.

**Trigger Types**:
| Trigger | Detection Mechanism | Example |
|---------|---------------------|---------|
| **On Invocation** | Agent is spawned/called | First action when user invokes this agent |
| **On Story Assignment** | `status.json` shows story with `owner=={AGENT_ID}` | When a story is assigned to this agent |
| **On Blocker Request** | `bus/log.jsonl` contains request for `{AGENT_ID}` | Another agent requests help |
| **On Status Change** | Story status changes in `status.json` | Story moves to `in-progress`, `in-review`, etc. |

**Action Execution Pattern**:
```
IF [trigger condition detected]
THEN:
  1. [Load context - specific files/locations]
  2. [Analyze/process - specific operations]
  3. [Output result - specific format]
  4. [Update state - status.json, bus message]
```

**Standard Output Formats**:
- **Status Update**: `{"ts":"<ISO>","from":"{AGENT_ID}","type":"status","story":"<US_ID>","text":"<summary>"}`
- **Blocked Notice**: `{"ts":"<ISO>","from":"{AGENT_ID}","type":"blocked","story":"<US_ID>","text":"Blocked: <reason>"}`
- **Unblock Notice**: `{"ts":"<ISO>","from":"{AGENT_ID}","type":"unblock","story":"<US_ID>","text":"Unblocking <target_story>: <reason>"}`
- **Finding/Alert**: `{"ts":"<ISO>","from":"{AGENT_ID}","type":"finding","story":"<US_ID>","text":"Finding: <details>"}`

**DO NOT** perform proactive actions without a clear trigger. Vague instructions like "proactively do X" require explicit conditions to be actionable.
