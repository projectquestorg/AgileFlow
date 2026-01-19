# Specialized Self-Validating Agents

**Import Date**: 2026-01-19
**Topic**: Specialized Self-Validating Agents
**Source**: YouTube Video Transcript + https://github.com/disler/agentic-finance-review
**Content Type**: research/transcript

---

## Summary

Specialized self-validating agents represent a paradigm shift in agentic engineering where agents validate their own work through deterministic hooks embedded directly in prompts, subagents, and skills. This moves beyond global hooks in `settings.json` to per-command/per-agent validation that is hyper-focused on the specific purpose of each agent.

The core principle is **"Focused Agent + Specialized Validation = Trusted Automation"**. Rather than building generalist "do-it-all" agents, you build specialized agents that do one thing extraordinarily well and validate that one thing deterministically. This approach increases trust in agent outputs, which saves engineering time by reducing manual validation.

The key insight is that Claude Code now supports hooks inside custom slash commands, subagents, and skills (not just global hooks). This enables building closed-loop prompts where validation is guaranteed to run after every tool use, providing deterministic verification that "agents plus code beats agents alone."

---

## Key Findings

- **Hooks can now be embedded in prompts, subagents, and skills** - Not just global `settings.json` hooks. This enables specialized validation per command.

- **Three hook types available**: `PreToolUse`, `PostToolUse`, and `Stop` - each serving different validation timing needs.

- **PostToolUse hooks are most powerful for file operations** - They receive the file path that was just read/edited/written, enabling targeted validation.

- **Exit code 2 triggers self-correction** - When a validator returns exit code 2, the error is sent back to Claude which automatically attempts to fix the issue.

- **Specialized agents outperform generalist agents** - A focused agent with one purpose outperforms an unfocused agent with many tasks, especially at scale (tens, hundreds, thousands of runs).

- **Subagents provide parallelization and context isolation** - You can spawn multiple CSV-edit agents in parallel, each validating independently.

- **The "Core Four" framework**: Context, Model, Prompt, Tools - Everything in agentic systems reduces to these four components.

- **Closed-loop prompts are now guaranteed** - Unlike prompting "validate your work" (which might be ignored), hooks ensure validation always runs.

- **Organization pattern**: Store validators in `.claude/hooks/validators/` directory for clean separation.

---

## Implementation Approach

### 1. Create a Specialized Prompt with Hooks

```yaml
---
description: CSV editing tool
argument-hint: <csv-file> <user-request>
tools:
  - Glob
  - Read
  - Write
  - Edit
model-invocable: false
hooks:
  PostToolUse:
    - matcher: "Read|Edit|Write"
      hooks:
        - type: command
          command: "uv run $CLAUDE_PROJECT_DIR/.claude/hooks/validators/csv-single-validator.py"
---

# Purpose
Make modifications or report on CSV files.

# Workflow
1. Read the CSV file ($1)
2. Make the modification or report ($2)
3. Report the results
```

### 2. Create the Validator Script

Validators receive JSON input via stdin with tool context. They should:
- Return exit code 0 for success
- Return exit code 2 for blocking errors (Claude will attempt to fix)
- Return other codes for non-blocking warnings

### 3. For Subagents (Parallelization)

```yaml
---
name: csv-edit-agent
description: CSVEdit agent
when: use only when directly requested
tools:
  - Glob
  - Read
  - Write
  - Edit
hooks:
  PostToolUse:
    - matcher: "Read|Edit|Write"
      hooks:
        - type: command
          command: "uv run $CLAUDE_PROJECT_DIR/.claude/hooks/validators/csv-single-validator.py"
---

# Purpose
Make modifications or report on CSV files.

# Workflow
1. Read the CSV file (determine from prompt)
2. Make the modification or report (determine from prompt)
3. Report the results
```

### 4. Chain Specialized Agents

Create orchestrator prompts that chain multiple specialized agents:
- Each agent validates its specific output type
- Use `Stop` hooks for final validation after all work completes
- Use `PostToolUse` for per-file validation during processing

---

## Code Snippets

### Hook Configuration in Frontmatter

```yaml
hooks:
  PostToolUse:
    - matcher: "Read|Edit|Write"
      hooks:
        - type: command
          command: "uv run $CLAUDE_PROJECT_DIR/.claude/hooks/validators/csv-single-validator.py"
```

### Validator Script Pattern (Python)

```python
import pandas as pd
import sys
import json

def validate_csv(file_path):
    issues = []
    try:
        df = pd.read_csv(file_path)
        # Add your validation logic here
    except Exception as e:
        issues.append(str(e))

    if issues:
        # Return error message for Claude to resolve
        print(f"Resolve this CSV error in {file_path}:")
        for issue in issues:
            print(f"  - {issue}")
        sys.exit(2)  # Exit code 2 = blocking error

    print(f"CSV validation passed: {file_path}")
    sys.exit(0)

if __name__ == "__main__":
    # Read file path from stdin JSON or environment
    input_data = json.loads(sys.stdin.read())
    validate_csv(input_data.get('file_path'))
```

### Multi-Agent Orchestrator Pattern

```yaml
---
description: Review finances workflow
hooks:
  Stop:
    - type: command
      command: "uv run $CLAUDE_PROJECT_DIR/.claude/hooks/validators/html-validator.py"
---

# Agent Chain
1. Normalize CSV agent (has CSV validator)
2. Categorize CSV agent (has CSV validator)
3. Merge accounts agent (has CSV validator)
4. Accumulate agent (has CSV validator)
5. Graph agent (has PNG validator)
6. Dashboard agent (has HTML validator)
```

---

## Action Items

- [ ] Add validators directory to `.claude/hooks/validators/`
- [ ] Identify commands/agents that would benefit from specialized validation
- [ ] Create validator scripts for common output types (CSV, JSON, HTML, etc.)
- [ ] Add `PostToolUse` hooks to file-editing commands
- [ ] Add `Stop` hooks to orchestrator commands for final validation
- [ ] Test exit code 2 self-correction behavior
- [ ] Consider parallelizing work with specialized subagents

---

## Risks & Gotchas

- **Exit codes matter**: Only exit code 2 triggers self-correction. Other non-zero codes are warnings.
- **Hook ordering**: PostToolUse runs after EACH matching tool call, Stop runs once when agent finishes.
- **Validator performance**: Slow validators will slow down every tool call - keep them fast.
- **Matcher patterns**: Use regex patterns like `"Read|Edit|Write"` carefully.
- **stdin JSON format**: Validators receive context via stdin, not command-line args.

---

## Key Quotes

> "A focused agent with one purpose outperforms an unfocused agent with many purposes."

> "Agents plus code beats agents alone."

> "You don't work on your application anymore. You work on the agents that run your application."

> "Every good specialized agent, great at doing one thing well, will validate that one thing."

> "If you want to scale, you want your agents self-validating, and not just any validation - you want your agents specializing their self-validation."

---

## Story Suggestions

### Potential Epic: Add Specialized Self-Validation to AgileFlow Agents

**US-XXXX**: Add validators directory structure
- AC: `.agileflow/hooks/validators/` exists with README

**US-XXXX**: Create JSON schema validator
- AC: PostToolUse hook validates JSON output from relevant commands

**US-XXXX**: Create markdown validator
- AC: Validates generated markdown files for structure/formatting

**US-XXXX**: Add self-validation to epic-planner agent
- AC: Agent validates story format after generation

---

## References

- Source: https://github.com/disler/agentic-finance-review
- Video: YouTube transcript (specialized self-validating agents)
- Import date: 2026-01-19
- Related: Claude Code hooks documentation
