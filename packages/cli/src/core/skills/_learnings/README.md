# Skill Learnings

This directory contains learnings files for self-improving skills. Each skill can have a corresponding `.yaml` file that stores user preferences and corrections learned over time.

## Purpose

Just like agents have `expertise.yaml` files that accumulate codebase knowledge, skills have learnings files that accumulate **user preferences**.

| Component | Agents | Skills |
|-----------|--------|--------|
| **What they learn** | Codebase knowledge | User preferences |
| **Learning file** | `expertise.yaml` | `learnings.yaml` |
| **Example learning** | "sessions table uses UUID primary keys" | "User prefers conventional commits" |

## How It Works

1. **On skill invocation**: Skill reads its learnings file (if exists)
2. **Apply preferences**: Skill output follows learned preferences
3. **On correction**: Skill extracts signal and updates learnings file
4. **Persist**: Changes saved for next session

```
┌─────────────────────────────────────────────────────────────┐
│ Skill Execution Flow                                         │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  1. Read _learnings/{skill}.yaml                            │
│  2. Execute skill with learned preferences                  │
│  3. User provides output                                    │
│  4. If correction detected:                                 │
│     - Extract signal (what was wrong)                       │
│     - Determine confidence (high/medium/low)                │
│     - Update learnings file                                 │
│  5. Continue with corrected output                          │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## File Naming

Learnings files are named after their skill:

| Skill | Learnings File |
|-------|----------------|
| `commit-message-formatter` | `commit.yaml` |
| `agileflow-story-writer` | `story-writer.yaml` |
| `code-review` | `code-review.yaml` |

## Schema

See `_template.yaml` for the full schema. Key sections:

```yaml
skill: commit-message-formatter
version: 1
last_updated: 2026-01-06

preferences:
  - signal: "User said 'no AI attribution'"
    learning: "Never add AI footers"
    confidence: high
    captured: 2026-01-06

conventions:
  - "Use imperative mood"
  - "Keep subject under 50 chars"

anti_patterns:
  - "Don't add emojis"
```

## Confidence Levels

| Level | Trigger | Example |
|-------|---------|---------|
| **high** | Explicit correction ("never do X", "always do Y") | "Never include AI footers" |
| **medium** | Approval or pattern that worked | "User approved conventional commit format" |
| **low** | Observation to review | "User seemed to prefer shorter messages" |

## Version Control

Learnings files are version-controlled in git. This allows:
- **History**: See how preferences evolved over time
- **Rollback**: Revert if learning was incorrect
- **Sharing**: Team can share learned preferences

## Related

- [Agent Expert System](../../agents/experts/README.md) - Same pattern for agents
- [20260106-self-improving-skills-claude-code.md](../../../../../../../docs/10-research/20260106-self-improving-skills-claude-code.md) - Research
- [20251216-agent-experts-self-improving-agents.md](../../../../../../../docs/10-research/20251216-agent-experts-self-improving-agents.md) - Original pattern
