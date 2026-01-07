# Claude Code Damage Control Hooks

**Import Date**: 2026-01-06
**Topic**: Claude Code Damage Control - Protecting Production Assets from Agent Destruction
**Source**: [IndyDevDan YouTube](https://www.youtube.com/watch?v=...) + [GitHub Repository](https://github.com/disler/claude-code-damage-control)
**Content Type**: Video Transcript + Repository Analysis

---

## Summary

Claude Code Damage Control is a defense system that protects production codebases from destructive agent commands through PreToolUse hooks. The system implements a three-layer protection strategy: deterministic command blocking via regex patterns, path-based access controls, and non-deterministic "prompt hooks" that use AI to catch unknown dangerous commands.

The key insight is that as agents scale (hundreds/thousands of tool calls), even a 1-in-100,000 hallucination rate can destroy months of work. This system acts as "insurance" - preventing agents from running catastrophic, irreversible commands regardless of whether caused by hallucination or bad prompts.

The implementation uses a lightweight `patterns.yaml` configuration file that defines blocked commands, ask-first patterns, and path protection levels. This can be installed at global (user-level), project, or local scopes, with hooks merging hierarchically.

---

## Key Findings

- **Four Damage Control Layers**: Local hooks, global hooks, deterministic hooks (scripts), and prompt hooks (AI-based)
- **Prompt hooks catch unknown threats**: Run AI evaluation on every bash command to catch destructive patterns never seen before
- **Three path protection levels**: Zero access (no read/write/edit/delete), read-only (can read, no modify), no-delete (can modify, no delete)
- **Ask patterns**: For risky-but-valid operations, prompt user confirmation rather than blocking
- **Hooks run in parallel**: Whichever hook finishes first determines the outcome
- **Skills pattern for installation**: `/install` command triggers interactive AskUserQuestion workflow for guided setup
- **Global hooks provide baseline**: Even without project-level hooks, global hooks protect across all codebases

---

## Implementation Approach

### Step 1: Clone the Damage Control Repository

```bash
git clone https://github.com/disler/claude-code-damage-control.git
cd claude-code-damage-control
```

### Step 2: Run Interactive Installation

```bash
claude  # Start Claude Code
/install  # Run interactive setup
```

Choose:
- **Scope**: Global (user-level) / Project / Personal
- **Runtime**: Python (uv) / TypeScript (bun)

### Step 3: Configure patterns.yaml

Add project-specific blocked commands and protected paths.

### Step 4: Restart Claude Code

Hooks only take effect after restart.

---

## Code Snippets

### patterns.yaml - Security Rules Configuration

```yaml
# Blocked bash commands (regex patterns)
bashToolPatterns:
  - pattern: '\brm\s+-[rRf]'
    reason: rm with recursive or force flags
  - pattern: '\bDELETE\s+FROM\s+\w+\s*;'
    reason: DELETE without WHERE clause
  - pattern: 'DROP\s+(TABLE|DATABASE)'
    reason: DROP commands are destructive

# Commands that require user confirmation
askPatterns:
  - pattern: 'DELETE\s+FROM\s+\w+\s+WHERE'
    reason: Specific record deletion - confirm first
    ask: true

# Path protection levels
zeroAccessPaths:
  - ~/.ssh/
  - ~/.aws/
  - ~/.gnupg/

readOnlyPaths:
  - /etc/
  - ~/.bashrc
  - ~/.zshrc

noDeletePaths:
  - .claude/hooks/
  - .claude/commands/
```

### settings.json - Hook Configuration

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "uv run $CLAUDE_PROJECT_DIR/.claude/hooks/damage-control/bash-tool-damage-control.py",
            "timeout": 5
          },
          {
            "type": "prompt",
            "prompt": "Evaluate if this command is destructive or could cause irreversible damage. Block if dangerous."
          }
        ]
      },
      {
        "matcher": "Edit",
        "hooks": [{
          "type": "command",
          "command": "uv run $CLAUDE_PROJECT_DIR/.claude/hooks/damage-control/edit-tool-damage-control.py",
          "timeout": 5
        }]
      },
      {
        "matcher": "Write",
        "hooks": [{
          "type": "command",
          "command": "uv run $CLAUDE_PROJECT_DIR/.claude/hooks/damage-control/write-tool-damage-control.py",
          "timeout": 5
        }]
      }
    ]
  }
}
```

### Hook Exit Codes

```python
# Hook script exit codes
EXIT_ALLOW = 0      # Allow command to proceed
EXIT_BLOCK = 2      # Block command, show error
EXIT_WARN = 1       # Warning only, command proceeds

# To ask user for confirmation, exit 0 with JSON:
print(json.dumps({
    "result": "ask",
    "message": "This command will delete records. Continue?"
}))
sys.exit(0)
```

### Directory Structure

```
.claude/
├── hooks/damage-control/
│   ├── bash-tool-damage-control.py   # Bash command validation
│   ├── edit-tool-damage-control.py   # Edit tool validation
│   ├── write-tool-damage-control.py  # Write tool validation
│   └── patterns.yaml                 # Security rules
├── skills/damage-control/
│   ├── SKILL.md                      # Skill definition
│   ├── cookbook/                     # Installation workflows
│   └── test-prompts/                 # Validation tests
└── settings.json                     # Hook configuration
```

---

## Action Items

- [ ] Clone https://github.com/disler/claude-code-damage-control to evaluate
- [ ] Run `/install` to set up global-level hooks as baseline protection
- [ ] Customize `patterns.yaml` with project-specific blocked commands (psql, aws cli, etc.)
- [ ] Add production database connection strings to `zeroAccessPaths`
- [ ] Configure `askPatterns` for risky-but-valid operations (deploys, migrations)
- [ ] Test hooks with dangerous commands in sandbox environment
- [ ] Document blocked patterns in team runbook
- [ ] Consider integrating with AgileFlow's existing hooks system

---

## Risks & Gotchas

- **Prompt hooks add latency**: AI evaluation runs on every bash command - slower but safer
- **Hooks run in parallel**: First to finish wins - deterministic hooks usually faster than prompts
- **Must restart Claude Code**: Hook changes only take effect after restart
- **Global vs project scope**: Global hooks apply everywhere, project hooks only in that directory
- **Pattern specificity matters**: Overly broad patterns may block legitimate commands
- **Prompt hooks are probabilistic**: Not 100% reliable - encode known threats in deterministic hooks ASAP

---

## Relevance to AgileFlow

AgileFlow already has a hooks system configured in `.claude/settings.json`. This research suggests:

1. **Add deterministic damage control**: Our current hooks focus on session/workflow - add security layer
2. **patterns.yaml pattern**: Single config file for blocked commands is cleaner than inline regexes
3. **Path protection**: Consider protecting `.agileflow/`, `docs/09-agents/status.json` from deletion
4. **Prompt hook backup**: Add as last-ditch catch for unknown destructive commands
5. **Installation skill pattern**: The `/install` interactive workflow is reusable for AgileFlow setup

---

## Story Suggestions

### Potential Epic: AgileFlow Damage Control Integration

**US-XXXX**: Add deterministic PreToolUse hooks for destructive command blocking
- AC: Commands matching dangerous patterns (rm -rf, DROP TABLE) are blocked
- AC: patterns.yaml config file for easy customization

**US-XXXX**: Implement path protection levels in AgileFlow
- AC: Zero-access paths (secrets, SSH keys) completely blocked
- AC: Read-only paths (config files) can be read but not modified
- AC: No-delete paths (hooks, commands) protected from deletion

**US-XXXX**: Add prompt hook as probabilistic backup
- AC: Unknown destructive commands caught by AI evaluation
- AC: Blocked commands logged for pattern refinement

---

## Raw Content Reference

<details>
<summary>Original transcript excerpt (click to expand)</summary>

[00:00:00] It's 7:30 in the morning and you're a hotshot agentic engineer getting ahead on the new year. You crack open your terminal and fire up the best agent coding tool claude code running open 4.5 in yolo mode... Every catastrophic command that your agent tried to run was blocked. You think back to that Andy Devdan video you watched and you think about that clawed code damage control you learned that prevented your agents from running catastrophic irreversible double Thanos snap career destroying commands...

[Key quote: "It only takes one bad command to destroy your production assets... One out of 100,000. Okay, that's enough to really ruin your day."]

</details>

---

## References

- Source: [GitHub - disler/claude-code-damage-control](https://github.com/disler/claude-code-damage-control)
- Video: IndyDevDan YouTube - Claude Code Damage Control
- Import date: 2026-01-06
- Related: [20260101-claude-code-stop-hooks-ralph-loop.md](./20260101-claude-code-stop-hooks-ralph-loop.md) (hooks system)
- Related: [20251225-top-2pct-agentic-engineer-2026.md](./20251225-top-2pct-agentic-engineer-2026.md) (agent trust)
