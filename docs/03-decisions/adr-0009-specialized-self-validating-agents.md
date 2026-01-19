# ADR-0009: Specialized Self-Validating Agents

**Status**: Accepted
**Date**: 2026-01-19
**Decision Makers**: Development Team
**Research**: [Specialized Self-Validating Agents](../10-research/20260119-specialized-self-validating-agents.md)
**Related**: [ADR-0005: Agentic Layer Enhancements](./adr-0005-agentic-layer-enhancements.md)

---

## Context

Claude Code supports hooks at the prompt/skill/subagent level through YAML frontmatter (not just global hooks in `settings.json`). This enables **specialized self-validation** where each agent validates its own output using deterministic code, creating "closed-loop prompts."

### Current State

AgileFlow currently uses:
- **Global hooks** in `.claude/settings.json` for damage control (PreToolUse)
- **Global hooks** for session management (SessionStart, PreCompact, Stop)
- **Prompt instructions** for validation ("validate your work") - not guaranteed

### Problem

Global hooks apply to ALL operations regardless of context. A testing agent and documentation agent both trigger the same validation. This leads to:

1. Validation that's too generic (lowest common denominator)
2. No agent-specific quality gates
3. Reliance on non-deterministic prompt instructions

### Research Insights

From IndyDevDan's agentic-finance-review pattern:

> "A focused agent with one purpose outperforms an unfocused agent with many purposes."

> "Agents plus code beats agents alone."

Key findings:
- **PostToolUse hooks**: Run after each tool call, receive file path in stdin
- **Stop hooks**: Run when agent finishes, for final validation
- **Exit code 2**: Triggers self-correction (Claude receives error and fixes it)
- **Specialized validation**: Each agent validates its specific output type

---

## Decision

**Adopt per-agent/per-command hooks for specialized self-validation.**

### Hook Types by Use Case

| Hook | When to Use | Example |
|------|-------------|---------|
| `PostToolUse` | Validate individual file operations | Validate JSON after Write |
| `Stop` | Final validation when agent completes | Check coverage report exists |
| `PreToolUse` | Block dangerous operations (already global) | Damage control |

### Validator Exit Codes

| Code | Meaning | Behavior |
|------|---------|----------|
| 0 | Success | Proceed normally |
| 2 | Error (blocking) | Stderr sent to Claude for self-correction |
| Other | Warning | Log but continue |

### Implementation Pattern

Add `hooks` section to agent/command frontmatter:

```yaml
---
name: agileflow-testing
description: Testing specialist
tools: Read, Write, Edit, Bash, Glob, Grep
hooks:
  PostToolUse:
    - matcher: "Bash"
      hooks:
        - type: command
          command: "node .agileflow/hooks/validators/test-result-validator.js"
  Stop:
    - hooks:
        - type: command
          command: "node .agileflow/hooks/validators/coverage-validator.js"
---
```

---

## Consequences

### Positive

1. **Guaranteed validation**: Hooks always run (vs. optional prompt instructions)
2. **Self-correction**: Exit code 2 triggers automatic fix attempts
3. **Agent specialization**: Each agent validates its specific output type
4. **Trust scaling**: More validation = more autonomous operation
5. **Parallelization**: Multiple agents validate independently

### Negative

1. **Performance overhead**: Validators run on every matching tool call
2. **Complexity**: More moving parts to maintain
3. **Hook conflicts**: Need precedence rules if multiple hooks apply

### Mitigation

- Keep validators fast (< 100ms)
- Use specific matchers to limit when hooks run
- Global hooks for safety, agent hooks for quality

---

## Alternatives Considered

### 1. Prompt-Based Validation Only

**Rejected**: Not guaranteed. Models can skip validation steps.

### 2. Global Validators Only

**Rejected**: Too generic. Can't specialize by agent type.

### 3. Post-Processing Scripts

**Rejected**: Run after agent completes, no self-correction opportunity.

---

## Implementation

### Phase 1: Infrastructure

Create validators directory:
```
.agileflow/hooks/validators/
├── README.md                    # Authoring guide
├── json-schema-validator.js     # Validate JSON structure
├── markdown-validator.js        # Validate markdown format
└── story-format-validator.js    # Validate story structure
```

### Phase 2: Agent Integration

Update key agents with hooks:
- `epic-planner.md`: Validate story format after generation
- `testing.md`: Validate test coverage exists
- `documentation.md`: Validate markdown structure

### Phase 3: Documentation

- Practice doc: `docs/02-practices/specialized-hooks.md`
- Validator authoring guide in validators/README.md

---

## Validation Protocol

### Validator Script Template

```javascript
#!/usr/bin/env node
const fs = require('fs');

// Read stdin (JSON with tool context)
let input = '';
process.stdin.on('data', chunk => input += chunk);
process.stdin.on('end', () => {
  try {
    const context = JSON.parse(input);
    const filePath = context.file_path || context.tool_input?.file_path;

    // Validation logic here
    const issues = validate(filePath);

    if (issues.length > 0) {
      console.error(`Resolve these issues in ${filePath}:`);
      issues.forEach(i => console.error(`  - ${i}`));
      process.exit(2); // Triggers self-correction
    }

    console.log(`Validation passed: ${filePath}`);
    process.exit(0);
  } catch (e) {
    console.error(`Validator error: ${e.message}`);
    process.exit(1); // Warning, don't block
  }
});
```

---

## References

- [Specialized Self-Validating Agents Research](../10-research/20260119-specialized-self-validating-agents.md)
- [agentic-finance-review Repository](https://github.com/disler/agentic-finance-review)
- [Claude Code Hooks Documentation](https://docs.anthropic.com/claude-code/hooks)
