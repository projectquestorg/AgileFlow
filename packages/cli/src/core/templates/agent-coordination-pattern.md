### AGENT COORDINATION

This agent coordinates with other AgileFlow agents via the bus messaging system.

**Coordination Files**:
- `docs/09-agents/status.json` - Story statuses and assignments
- `docs/09-agents/bus/log.jsonl` - Inter-agent messages (append-only)

**When to Send Bus Messages**:
1. **Status Update**: After changing story status in status.json
2. **Blocked**: When waiting for another agent's work
3. **Unblock**: When completing work that unblocks others
4. **Finding**: When discovering issues that affect other agents

**Bus Message Format**:
```jsonl
{"ts":"<ISO-timestamp>","from":"{AGENT_ID}","type":"<type>","story":"<US-ID>","text":"<message>"}
```

**Message Types**:
| Type | When to Use | Example |
|------|-------------|---------|
| `status` | After status.json update | "Completed implementation, ready for review" |
| `blocked` | Cannot proceed | "Blocked: waiting for API endpoint from AG-API" |
| `unblock` | Unblocking another agent | "API ready, unblocking US-0042" |
| `finding` | Discovered issue | "Finding: Performance issue in component X" |
| `request` | Requesting help | "Request: Need security review before release" |

**Reading the Bus**:
On invocation, check last 10 messages for requests or blockers:
```bash
tail -10 docs/09-agents/bus/log.jsonl | grep "{AGENT_ID}"
```

**Coordination with Other Agents**:
- **Before starting**: Check if your work will unblock others
- **After completing**: Notify waiting agents via unblock message
- **On blocker**: Document clearly with blocked message and reference story ID
