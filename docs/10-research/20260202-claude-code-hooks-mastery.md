# Claude Code Hooks Mastery

**Import Date**: 2026-02-02
**Topic**: Claude Code Hooks System - Complete Reference
**Source**: https://github.com/disler/claude-code-hooks-mastery
**Content Type**: GitHub Repository / Technical Reference

---

## Summary

This repository by @disler demonstrates comprehensive mastery of Claude Code's hook system, implementing all 13 lifecycle events with working Python examples. The project uses UV single-file scripts to keep hook logic isolated in `.claude/hooks/` with embedded dependency declarations, eliminating virtual environment management overhead.

The key innovation is using hooks for **deterministic control** over Claude's behavior rather than relying on LLM decisions. This enables security enforcement (blocking dangerous commands), automated logging, context injection, and multi-agent orchestration patterns including Builder/Validator teams.

The implementation showcases practical patterns for production use: PreToolUse guards that block `rm -rf` and `.env` file access, PermissionRequest auto-allowing read-only operations, session context loading, and TTS announcements for task completion.

---

## Key Findings

- **13 Hook Lifecycle Events**: Session (Setup, SessionStart, SessionEnd), Conversation (UserPromptSubmit, Stop, Notification), Tool Execution (PreToolUse, PermissionRequest, PostToolUse, PostToolUseFailure), Subagent (SubagentStart, SubagentStop), Maintenance (PreCompact)

- **Flow Control via Exit Codes**: Exit 0 = success, Exit 2 = blocking error (stderr fed to Claude automatically, blocks prompts/tools), Other codes = non-blocking errors

- **UV Single-File Scripts**: Hook scripts use `#!/usr/bin/env -S uv run --script` with embedded `# /// script` dependency blocks, enabling fast execution without virtual env management

- **Security Patterns**: PreToolUse blocks dangerous `rm -rf` commands and `.env` file access; PermissionRequest auto-allows read-only tools (Read, Glob, Grep, safe Bash)

- **Team-Based Validation**: Builder agents implement features, Validator agents perform read-only verification, creating computational trust through multi-agent patterns

- **Session Data Management**: Hooks track prompts per session, generate agent names via LLM calls (Ollama → Anthropic fallback), and maintain JSON audit logs

- **Context Injection**: SessionStart can load development context from `.claude/CONTEXT.md`, `TODO.md`, and GitHub issues to inject into Claude's prompt

---

## Implementation Approach

1. **Configure hooks in `.claude/settings.json`** with event type, command path, and optional flags
2. **Create Python scripts in `.claude/hooks/`** using UV single-file format with embedded dependencies
3. **Use exit codes for flow control**: Exit 0 to allow, Exit 2 to block with stderr message
4. **Log all events** to `logs/` directory for audit trail
5. **Implement security guards** in PreToolUse to block dangerous operations
6. **Auto-allow read-only** operations in PermissionRequest to reduce interruptions
7. **Load context** at SessionStart to inject project-specific information

---

## Code Snippets

### PreToolUse Security Guard (pre_tool_use.py)

```python
#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.8"
# ///

import json
import sys
import re
from pathlib import Path

def is_dangerous_rm_command(command):
    """
    Comprehensive detection of dangerous rm commands.
    Matches various forms of rm -rf and similar destructive patterns.
    """
    # Normalize command by removing extra spaces and converting to lowercase
    normalized = ' '.join(command.lower().split())

    # Pattern 1: Standard rm -rf variations
    patterns = [
        r'\brm\s+.*-[a-z]*r[a-z]*f',  # rm -rf, rm -fr, rm -Rf, etc.
        r'\brm\s+.*-[a-z]*f[a-z]*r',  # rm -fr variations
        r'\brm\s+--recursive\s+--force',  # rm --recursive --force
        r'\brm\s+--force\s+--recursive',  # rm --force --recursive
        r'\brm\s+-r\s+.*-f',  # rm -r ... -f
        r'\brm\s+-f\s+.*-r',  # rm -f ... -r
    ]

    # Check for dangerous patterns
    for pattern in patterns:
        if re.search(pattern, normalized):
            return True

    # Pattern 2: Check for rm with recursive flag targeting dangerous paths
    dangerous_paths = [
        r'/',           # Root directory
        r'/\*',         # Root with wildcard
        r'~',           # Home directory
        r'~/',          # Home directory path
        r'\$HOME',      # Home environment variable
        r'\.\.',        # Parent directory references
        r'\*',          # Wildcards in general rm -rf context
        r'\.',          # Current directory
        r'\.\s*$',      # Current directory at end of command
    ]

    if re.search(r'\brm\s+.*-[a-z]*r', normalized):  # If rm has recursive flag
        for path in dangerous_paths:
            if re.search(path, normalized):
                return True

    return False

def is_env_file_access(tool_name, tool_input):
    """
    Check if any tool is trying to access .env files containing sensitive data.
    """
    if tool_name in ['Read', 'Edit', 'MultiEdit', 'Write', 'Bash']:
        # Check file paths for file-based tools
        if tool_name in ['Read', 'Edit', 'MultiEdit', 'Write']:
            file_path = tool_input.get('file_path', '')
            if '.env' in file_path and not file_path.endswith('.env.sample'):
                return True

        # Check bash commands for .env file access
        elif tool_name == 'Bash':
            command = tool_input.get('command', '')
            # Pattern to detect .env file access (but allow .env.sample)
            env_patterns = [
                r'\b\.env\b(?!\.sample)',  # .env but not .env.sample
                r'cat\s+.*\.env\b(?!\.sample)',  # cat .env
                r'echo\s+.*>\s*\.env\b(?!\.sample)',  # echo > .env
                r'touch\s+.*\.env\b(?!\.sample)',  # touch .env
                r'cp\s+.*\.env\b(?!\.sample)',  # cp .env
                r'mv\s+.*\.env\b(?!\.sample)',  # mv .env
            ]

            for pattern in env_patterns:
                if re.search(pattern, command):
                    return True

    return False

def main():
    try:
        # Read JSON input from stdin
        input_data = json.load(sys.stdin)

        tool_name = input_data.get('tool_name', '')
        tool_input = input_data.get('tool_input', {})

        # Check for .env file access (blocks access to sensitive environment files)
        if is_env_file_access(tool_name, tool_input):
            print("BLOCKED: Access to .env files containing sensitive data is prohibited", file=sys.stderr)
            print("Use .env.sample for template files instead", file=sys.stderr)
            sys.exit(2)  # Exit code 2 blocks tool call and shows error to Claude

        # Check for dangerous rm -rf commands
        if tool_name == 'Bash':
            command = tool_input.get('command', '')

            # Block rm -rf commands with comprehensive pattern matching
            if is_dangerous_rm_command(command):
                print("BLOCKED: Dangerous rm command detected and prevented", file=sys.stderr)
                sys.exit(2)  # Exit code 2 blocks tool call and shows error to Claude

        # Ensure log directory exists
        log_dir = Path.cwd() / 'logs'
        log_dir.mkdir(parents=True, exist_ok=True)
        log_path = log_dir / 'pre_tool_use.json'

        # Read existing log data or initialize empty list
        if log_path.exists():
            with open(log_path, 'r') as f:
                try:
                    log_data = json.load(f)
                except (json.JSONDecodeError, ValueError):
                    log_data = []
        else:
            log_data = []

        # Append new data
        log_data.append(input_data)

        # Write back to file with formatting
        with open(log_path, 'w') as f:
            json.dump(log_data, f, indent=2)

        sys.exit(0)

    except json.JSONDecodeError:
        # Gracefully handle JSON decode errors
        sys.exit(0)
    except Exception:
        # Handle any other errors gracefully
        sys.exit(0)

if __name__ == '__main__':
    main()
```

### UserPromptSubmit with Session Management (user_prompt_submit.py)

```python
#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = [
#     "python-dotenv",
# ]
# ///

import argparse
import json
import os
import sys
from pathlib import Path
from datetime import datetime

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass  # dotenv is optional


def log_user_prompt(session_id, input_data):
    """Log user prompt to logs directory."""
    log_dir = Path("logs")
    log_dir.mkdir(parents=True, exist_ok=True)
    log_file = log_dir / 'user_prompt_submit.json'

    if log_file.exists():
        with open(log_file, 'r') as f:
            try:
                log_data = json.load(f)
            except (json.JSONDecodeError, ValueError):
                log_data = []
    else:
        log_data = []

    log_data.append(input_data)

    with open(log_file, 'w') as f:
        json.dump(log_data, f, indent=2)


def manage_session_data(session_id, prompt, name_agent=False):
    """Manage session data in the new JSON structure."""
    import subprocess

    sessions_dir = Path(".claude/data/sessions")
    sessions_dir.mkdir(parents=True, exist_ok=True)

    session_file = sessions_dir / f"{session_id}.json"

    if session_file.exists():
        try:
            with open(session_file, 'r') as f:
                session_data = json.load(f)
        except (json.JSONDecodeError, ValueError):
            session_data = {"session_id": session_id, "prompts": []}
    else:
        session_data = {"session_id": session_id, "prompts": []}

    session_data["prompts"].append(prompt)

    # Generate agent name if requested and not already present
    if name_agent and "agent_name" not in session_data:
        try:
            result = subprocess.run(
                ["uv", "run", ".claude/hooks/utils/llm/ollama.py", "--agent-name"],
                capture_output=True,
                text=True,
                timeout=5
            )

            if result.returncode == 0 and result.stdout.strip():
                agent_name = result.stdout.strip()
                if len(agent_name.split()) == 1 and agent_name.isalnum():
                    session_data["agent_name"] = agent_name
                else:
                    raise Exception("Invalid name from Ollama")
        except Exception:
            try:
                result = subprocess.run(
                    ["uv", "run", ".claude/hooks/utils/llm/anth.py", "--agent-name"],
                    capture_output=True,
                    text=True,
                    timeout=10
                )

                if result.returncode == 0 and result.stdout.strip():
                    agent_name = result.stdout.strip()
                    if len(agent_name.split()) == 1 and agent_name.isalnum():
                        session_data["agent_name"] = agent_name
            except Exception:
                pass

    try:
        with open(session_file, 'w') as f:
            json.dump(session_data, f, indent=2)
    except Exception:
        pass


def validate_prompt(prompt):
    """Validate the user prompt for security or policy violations."""
    blocked_patterns = []  # Add patterns to block

    prompt_lower = prompt.lower()

    for pattern, reason in blocked_patterns:
        if pattern.lower() in prompt_lower:
            return False, reason

    return True, None


def main():
    try:
        parser = argparse.ArgumentParser()
        parser.add_argument('--validate', action='store_true')
        parser.add_argument('--log-only', action='store_true')
        parser.add_argument('--store-last-prompt', action='store_true')
        parser.add_argument('--name-agent', action='store_true')
        args = parser.parse_args()

        input_data = json.loads(sys.stdin.read())

        session_id = input_data.get('session_id', 'unknown')
        prompt = input_data.get('prompt', '')

        log_user_prompt(session_id, input_data)

        if args.store_last_prompt or args.name_agent:
            manage_session_data(session_id, prompt, name_agent=args.name_agent)

        if args.validate and not args.log_only:
            is_valid, reason = validate_prompt(prompt)
            if not is_valid:
                print(f"Prompt blocked: {reason}", file=sys.stderr)
                sys.exit(2)

        sys.exit(0)

    except json.JSONDecodeError:
        sys.exit(0)
    except Exception:
        sys.exit(0)


if __name__ == '__main__':
    main()
```

### Settings.json Hook Configuration Example

```json
{
  "permissions": {
    "allow": ["mkdir", "mv", "cp", "ls", "find", "chmod", "touch", "uv", "npm", "grep", "Write", "Edit"]
  },
  "statusLine": "uv run .claude/hooks/status_line_v6.py",
  "hooks": {
    "PreToolUse": {
      "command": "uv run .claude/hooks/pre_tool_use.py"
    },
    "PostToolUse": {
      "command": "uv run .claude/hooks/post_tool_use.py --log-only"
    },
    "PostToolUseFailure": {
      "command": "uv run .claude/hooks/post_tool_use_failure.py --log-only"
    },
    "SessionStart": {
      "command": "uv run .claude/hooks/session_start.py --load-context"
    },
    "SessionEnd": {
      "command": "uv run .claude/hooks/session_end.py --log-only"
    },
    "Setup": {
      "command": "uv run .claude/hooks/setup.py"
    },
    "UserPromptSubmit": {
      "command": "uv run .claude/hooks/user_prompt_submit.py --log-only --store-last-prompt --name-agent"
    },
    "PermissionRequest": {
      "command": "uv run .claude/hooks/permission_request.py --auto-allow"
    },
    "SubagentStart": {
      "command": "uv run .claude/hooks/subagent_start.py --log-only"
    },
    "SubagentStop": {
      "command": "uv run .claude/hooks/subagent_stop.py --log-only"
    },
    "Stop": {
      "command": "uv run .claude/hooks/stop.py --notify --chat"
    },
    "Notification": {
      "command": "uv run .claude/hooks/notification.py --log-only"
    },
    "PreCompact": {
      "command": "uv run .claude/hooks/pre_compact.py --log-only"
    }
  }
}
```

---

## Action Items

- [ ] Review existing AgileFlow hooks in `.agileflow/hooks/` for comparison
- [ ] Consider adopting UV single-file script format for hooks
- [ ] Implement PreToolUse security guard for dangerous commands
- [ ] Add PermissionRequest auto-allow for read-only operations
- [ ] Evaluate TTS integration for task completion notifications
- [ ] Consider Builder/Validator agent pattern for code quality

---

## Risks & Gotchas

- **Exit Code 2 Semantics**: Different hooks have different blocking behaviors - PreToolUse blocks execution, PostToolUse cannot prevent (already executed)
- **Performance**: TTS and LLM calls in hooks add latency; use `--log-only` for performance-critical paths
- **Graceful Degradation**: All hooks should exit 0 on errors to avoid breaking Claude's workflow
- **UV Dependency**: Requires UV installed; may not be available in all environments

---

## Directory Structure Reference

```
.claude/
├── hooks/              # Python scripts using UV
│   ├── validators/     # Ruff (linting), Ty (type checking)
│   └── utils/          # TTS queue, LLM integrations
├── agents/             # Sub-agent configurations
├── commands/           # Custom slash commands
├── output-styles/      # Response formatting templates
├── status_lines/       # Terminal status displays (v1-v9)
└── settings.json       # Hook configuration

logs/                   # JSON audit trail for all hooks
```

---

## References

- Source: https://github.com/disler/claude-code-hooks-mastery
- Author: @disler
- Import date: 2026-02-02
- Related: Claude Code official documentation, AgileFlow hooks system
