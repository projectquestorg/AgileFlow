# Context Engineering Guidelines

Best practices for managing AI model context windows effectively.

**Source**: [Context Engineering Principles Research](../10-research/20260109-context-engineering-principles.md)

---

## The 70% Attention Budget Rule

When context exceeds ~70% of the model's capacity:
- Higher chance of hallucinations
- Agents stop using tools effectively
- May ignore instructions entirely

**Action**: Compact proactively, don't wait for auto-compact at 90%.

### Signs You're Over Budget

- Agent pauses mid-task unexpectedly
- Tool calls getting ignored
- Responses become less coherent
- Agent "forgets" earlier instructions

### How to Stay Under Budget

1. **Start fresh for new tasks** - Don't carry old context
2. **Use /compact proactively** - Before hitting limits
3. **Delegate to sub-agents** - Research tasks, parallel work
4. **Use rewind for experiments** - Delete failed attempts

---

## File Format Selection

Choose formats based on token efficiency:

| Format | Efficiency | Use For |
|--------|------------|---------|
| **YAML** | Best | Schemas, configs, API definitions |
| **Markdown** | Good | Documentation, CLAUDE.md |
| **XML** | Claude-optimized | Distinct sections (Claude-specific) |
| **JSON** | Worst | Only small state (task states) |

### Why YAML for Configs

- Fewer tokens (no braces, quotes everywhere)
- Indentation aids model structure understanding
- Natural for hierarchical data

### When JSON is Acceptable

- Small state objects (< 100 lines)
- API responses (standard format)
- status.json, session-state.json (structured tracking)

---

## When to Use Sub-Agents

Sub-agents run in isolated context windows, protecting your main context.

| Scenario | Use Sub-Agent? | Why |
|----------|---------------|-----|
| Research tasks | Yes | Isolates tool calls and searches |
| Parallel implementation | Yes | Separate contexts per domain |
| Multi-domain work | Yes | Orchestrator coordinates |
| Sequential tasks | No | Same context is fine |
| Quick fixes | No | Overhead not worth it |
| Single-file changes | No | Direct work is faster |

### How Sub-Agents Protect Context

```
Main Agent Context:
├── Your conversation
├── Current task instructions
└── Essential project state

Sub-Agent Context (isolated):
├── Research queries
├── Tool calls (grep, glob, read)
├── Search results
└── Only OUTPUT returns to main
```

---

## Progressive Disclosure

Only load what's needed for the current task.

### Checklist

- [ ] Skills loaded on-demand (not all upfront)?
- [ ] Compact summaries for long commands?
- [ ] Context gathered only when needed?
- [ ] Large files read in chunks?
- [ ] MCP calls only for external data?

### Anti-Patterns

- Loading entire codebase upfront
- Reading all files "just in case"
- Using MCPs for internal operations
- Filling context with "might need later" info

---

## AgileFlow-Specific Implementation

### How AgileFlow Uses These Principles

| Principle | Implementation |
|-----------|---------------|
| Progressive Disclosure | Skills/agents load via metadata registries |
| Structured Note-taking | 13-folder docs/ hierarchy |
| Sub-agent Isolation | Orchestrator with forced delegation |
| Context Preservation | PreCompact hook extracts COMPACT_SUMMARY |
| Reusable Commands | 69+ slash commands |

### Key Files

- `obtain-context.js` - Positions summary at 30K display limit
- `precompact-context.sh` - Extracts compact summaries from active commands
- `orchestrator.md` - Only has Task/TaskOutput tools (forced delegation)
- `status.json` - Structured story/epic tracking

### What We Don't Have (Yet)

- Real-time 70% monitoring (fixed 30K limit instead)
- Per-agent WIP limits (documentation only)
- Bus protocol for inter-agent communication (log.jsonl unused)

---

## Quick Reference

```yaml
# Before starting a task
- Is context fresh or carrying baggage?
- Am I using right file format for this config?
- Should this be delegated to a sub-agent?

# During work
- Is agent responding coherently?
- Are tool calls being followed?
- Should I compact now?

# For complex tasks
- Use orchestrator for multi-domain work
- Spawn research as background agent
- Don't parallelize dependent work
```

---

## Related

- [Best-of-N Pattern](./best-of-n-pattern.md) - Parallel agent execution
- [Trust Metrics](./trust-metrics.md) - Agent output verification
- [Context Engineering Research](../10-research/20260109-context-engineering-principles.md)
