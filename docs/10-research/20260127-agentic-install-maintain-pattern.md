# Agentic Install & Maintain Pattern for Codebases

**Import Date**: 2026-01-27
**Topic**: Claude Code Setup Hook + Justfile Pattern for Installation and Maintenance
**Source**: https://github.com/disler/install-and-maintain + YouTube video transcript (IndyDevDan)
**Content Type**: Repository exploration + video transcript

---

## Summary

This research explores a powerful pattern for standardizing codebase installation and maintenance using Claude Code's new **Setup hook** combined with the **just** command runner. The core insight is that combining deterministic scripts with agentic prompts delivers the best of both worlds: predictable execution AND intelligent oversight.

The pattern addresses a fundamental engineering challenge: "You can tell how great an engineering team is by the time it takes for a new engineer to run the project locally." For most teams, onboarding takes 1-2 days of pair programming, Slack messages, and outdated docs. With this pattern, it becomes one command with intelligent help when issues arise.

The key innovation is that the **same underlying scripts** execute through three different interfaces: deterministic mode (fast CI/CD), agentic mode (AI supervision + diagnostics), and interactive mode (human-in-the-loop questions). The scripts write logs; the prompts read and analyze them.

---

## Key Findings

- **Setup Hook is new in Claude Code**: Runs before sessions start, triggered by `--init` or `--maintenance` flags. Not shown in the standard hooks lifecycle diagram but specifically designed for installation/maintenance tasks.

- **"Just" command runner as launchpad**: Simple file (`justfile`) that serves as the single entry point for all agent workflows, developer tools, and common commands. Team members and agents don't need to remember flags.

- **Script as Source of Truth**: All three execution modes (deterministic, agentic, interactive) run identical underlying scripts. The difference is in oversight level, not implementation.

- **Hook + Prompt separation**: Hooks (`.claude/hooks/*.py`) are deterministic and fast. Prompts (`.claude/commands/*.md`) provide agentic oversight and analysis. Clean separation of concerns.

- **Logging enables intelligence**: Hooks write timestamped logs to files. Prompts parse logs to identify successes, failures, and provide context-aware guidance.

- **Interactive installation for onboarding**: Human-in-the-loop mode asks clarifying questions (database handling, installation scope, environment verification) before executing, making onboarding ultra-smooth.

- **Maintenance workflows**: Same pattern applies to periodic maintenance (dependency updates, database optimization, security checks). Hook runs tasks, prompt validates and reports.

- **Pattern is gaining popularity**: Referenced Mintlify's "Standard for LLM Executables" blog post (Jan 15, 2026) proposing similar ideas.

---

## Architecture Overview

```
project/
├── .claude/
│   ├── commands/
│   │   ├── install.md          # Reports setup results
│   │   ├── install-hil.md      # Interactive setup with questions
│   │   ├── maintenance.md      # Reports maintenance results
│   │   └── prime.md            # Codebase orientation
│   ├── hooks/
│   │   ├── session_start.py    # Loads .env vars
│   │   ├── setup_init.py       # Runs dependency install
│   │   └── setup_maintenance.py # Runs DB maintenance
│   └── settings.json           # Hook configuration
├── app_docs/                   # Generated reports
├── justfile                    # Command runner
└── .env.sample                 # Environment template
```

---

## Implementation Approach

### Step 1: Configure Setup Hooks in settings.json

```json
{
  "hooks": {
    "Setup": [
      {
        "matcher": "init",
        "hooks": [{
          "type": "command",
          "command": "\"$CLAUDE_PROJECT_DIR\"/.claude/hooks/setup_init.py",
          "timeout": 120
        }]
      },
      {
        "matcher": "maintenance",
        "hooks": [{
          "type": "command",
          "command": "\"$CLAUDE_PROJECT_DIR\"/.claude/hooks/setup_maintenance.py",
          "timeout": 60
        }]
      }
    ]
  }
}
```

### Step 2: Create Deterministic Hook Scripts

**setup_init.py** - Runs installation tasks:
```python
class Logger:
    def __init__(self, project_dir):
        self.log_file = f"{project_dir}/.claude/hooks/setup.init.log"

    def log(self, message):
        print(message, file=sys.stderr)
        with open(self.log_file, 'a') as f:
            f.write(f"[{timestamp}] {message}\n")

def run(cmd, cwd=None):
    """Execute command with logging"""
    result = subprocess.run(cmd, shell=True, cwd=cwd, capture_output=True)
    logger.log(f"Running: {cmd}")
    if result.returncode != 0:
        logger.log(f"ERROR: {result.stderr.decode()}")
    return result.returncode == 0

# Installation sequence
run("uv sync", cwd="apps/backend")
run("npm install", cwd="apps/frontend")
run("python init_db.py", cwd="apps/backend")
```

### Step 3: Create Agentic Command Prompts

**install.md** - Reports on setup results:
```markdown
# /install

## Workflow
1. Run `/prime` to understand codebase
2. If MODE="true", execute `/install-hil` instead
3. Read `.claude/hooks/setup.init.log`
4. Parse for successes and failures
5. Write results to `app_docs/install_results.md`
6. Report to user with next steps
```

**install-hil.md** - Human-in-the-loop installation:
```markdown
# /install (Interactive Mode)

Ask these questions before proceeding:
1. Database handling: Fresh / Preserve / Skip?
2. Installation scope: Full / Minimal / Conditional?
3. Environment verification: Check Python 3.11+, Node 18+, uv?
4. Environment variables: Configure .env interactively?
5. Documentation caching: Fetch external docs?

Then execute based on answers and report results.
```

### Step 4: Create Justfile as Launchpad

```makefile
# Deterministic - just run scripts
cldi:
    claude --init

cldm:
    claude --maintenance

# Agentic - scripts + AI analysis
cldii:
    claude --init "/install"

cldmm:
    claude --maintenance "/maintenance"

# Interactive - scripts + questions
cldit:
    claude --init "/install true"
```

### Step 5: Embed Common Issue Resolution

In prompts, add problem/solution patterns:
```markdown
## Common Issues

If you encounter any of these issues, follow the steps to resolve:

**Problem**: Database corruption
**Solution**: Delete `starter.db` and rerun `python init_db.py`

**Problem**: npm install fails with peer deps
**Solution**: Run `npm install --legacy-peer-deps`
```

---

## Code Snippets

### Hook JSON Input/Output Contract

Hooks read JSON from stdin and write JSON to stdout:

```python
def read_hook_input():
    """Read JSON input from Claude Code"""
    input_data = sys.stdin.read()
    return json.loads(input_data) if input_data else {}

def output_result(summary, startup_instructions, log_location):
    """Output JSON for Claude Code"""
    result = {
        "summary": summary,
        "startup_instructions": startup_instructions,
        "log_location": log_location
    }
    print(json.dumps(result))
```

### Session Environment Persistence

```python
def load_env_to_session():
    """Load .env vars into Claude Code session"""
    env_file = os.environ.get("CLAUDE_ENV_FILE")
    if not env_file:
        return

    values = dotenv_values(".env")
    with open(env_file, "a") as f:
        for key, value in values.items():
            # Escape single quotes for shell
            safe_value = value.replace("'", "'\\''")
            f.write(f"export {key}='{safe_value}'\n")
```

### Logger Class Pattern

```python
class Logger:
    def __init__(self, project_dir, log_name):
        self.log_file = Path(project_dir) / ".claude" / "hooks" / log_name

    def log(self, message):
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        # Write to stderr for real-time feedback
        print(message, file=sys.stderr)
        # Write to log file for persistence
        with open(self.log_file, 'a') as f:
            f.write(f"[{timestamp}] {message}\n")
```

---

## Execution Flow Diagrams

### Deterministic Mode
```
just cldi → claude --init → Setup hook "init" → setup_init.py
  ├─ uv sync (backend)
  ├─ npm install (frontend)
  ├─ init_db.py
  └─ Writes setup.init.log
```

### Agentic Mode
```
just cldii → claude --init "/install"
  │
  ├─ Setup hook runs setup_init.py (deterministic)
  │   └─ Writes setup.init.log
  │
  └─ /install command runs (agentic)
      ├─ Reads setup.init.log
      ├─ Analyzes successes/failures
      ├─ Writes app_docs/install_results.md
      └─ Reports to user with recommendations
```

### Interactive Mode
```
just cldit → claude --init "/install true"
  │
  ├─ Setup hook runs (deterministic)
  │
  └─ /install-hil command runs (interactive)
      ├─ Asks 5 questions
      │   ├─ Database handling?
      │   ├─ Installation scope?
      │   ├─ Verify environment?
      │   ├─ Configure .env?
      │   └─ Cache documentation?
      ├─ Executes based on answers
      └─ Reports with context-aware guidance
```

---

## Action Items

- [x] Evaluate adding `/install` and `/maintain` commands to AgileFlow ✅ **IMPLEMENTED**
  - Created `/agileflow:install` - Post-install validation command
  - Created `/agileflow:maintain` - Periodic maintenance command
  - Both follow diagnose.md pattern with embedded bash scripts
- [ ] Consider integrating `justfile` as command launchpad pattern
- [ ] Review if Setup hook matches AgileFlow's SessionStart patterns
- [ ] Assess value of interactive installation for AgileFlow onboarding
- [x] Document common installation issues and resolutions ✅ **INCLUDED IN COMMANDS**
  - Install command includes fix suggestions for all detected issues
  - Maintain command includes recommendations with specific commands

---

## Risks & Gotchas

- **Setup hook not in lifecycle diagram**: The Setup hook is newer and doesn't appear in standard Claude Code hooks documentation diagrams. May evolve.

- **Timeout considerations**: Installation hooks may need longer timeouts (120s in example) compared to session hooks (30s).

- **Environment variable security**: The install-hil.md pattern explicitly avoids reading .env values, only checking for presence via `grep -q "^VAR_NAME=.\+"`. Important security consideration.

- **Log file growth**: Continuous logging can grow log files. May need rotation strategy.

- **Just command runner dependency**: Introduces new tooling. Alternative: npm scripts, Makefiles, or shell aliases.

---

## Relevance to AgileFlow

This pattern aligns closely with AgileFlow's existing architecture:

| Concept | install-and-maintain | AgileFlow Equivalent |
|---------|---------------------|---------------------|
| Command runner | justfile | `/agileflow:*` commands |
| Setup hook | `--init` flag | SessionStart hook |
| Maintenance hook | `--maintenance` flag | Could add as new hook |
| Agentic prompts | `.claude/commands/` | `.claude/commands/agileflow/` |
| Logging | `setup.init.log` | `docs/09-agents/` |
| Interactive mode | `/install true` | AskUserQuestion tool |

**Key opportunity**: AgileFlow already has complex installation (`npx agileflow setup`) but lacks:
1. Post-install validation via agentic prompt
2. Maintenance mode for periodic updates
3. Human-in-the-loop installation for new users

---

## Story Suggestions

### Potential Epic: Agentic Installation & Maintenance System

**US-XXXX**: Add `/agileflow:install` command for post-install validation
- AC: Command runs after `npx agileflow setup` and validates installation
- AC: Reports which components installed successfully
- AC: Suggests fixes for common issues

**US-XXXX**: Add `/agileflow:maintain` command for periodic maintenance
- AC: Updates AgileFlow to latest version
- AC: Validates configuration integrity
- AC: Reports status.json health metrics

**US-XXXX**: Add interactive installation mode
- AC: Asks user about optional features before installing
- AC: Configures based on answers (hooks, CI, status line, etc.)
- AC: Guides through environment setup

---

## References

- Source Repository: https://github.com/disler/install-and-maintain
- Video: IndyDevDan YouTube (Install and Maintain Codebases, ~22 min)
- Related: Mintlify "Standard for LLM Executables" (Jan 15, 2026)
- Claude Code Hooks Docs: https://docs.anthropic.com/en/docs/claude-code/hooks
- Just Command Runner: https://just.systems/

---

## Import Notes

This research was imported from:
1. Full exploration of the GitHub repository (settings.json, justfile, hooks, commands)
2. Complete video transcript covering the pattern philosophy and implementation

The pattern represents a significant evolution in how codebases can be installed and maintained using the combination of deterministic automation and intelligent AI oversight.
