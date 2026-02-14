---
description: Start a team from a template
argument-hint: "<template-name>"
compact_context:
  priority: high
  preserve_rules:
    - "ACTIVE COMMAND: /agileflow:team:start - Start a native Agent Teams session"
    - "Requires CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS env var or metadata flag"
    - "Falls back to orchestrator subagent when Agent Teams not enabled"
    - "Templates loaded from .agileflow/teams/ directory"
  state_fields:
    - template_name
    - team_mode
    - teammates_spawned
---

# /agileflow:team:start

Start a team of specialized agents from a predefined template.

---

## Prerequisites

Check if Agent Teams is enabled:

```bash
node -e "const ff = require('./.agileflow/lib/feature-flags'); console.log(JSON.stringify(ff.getFeatureFlags()))"
```

If not available, try:
```bash
node -e "console.log(JSON.stringify({ agentTeams: !!process.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS }))"
```

## Step 1: Detect Mode

1. Check if native Agent Teams is enabled using the feature-flags module
2. If enabled → proceed with native team creation
3. If NOT enabled → fall back to orchestrator subagent with warning

## Step 2: Load Template

The argument specifies which team template to use. Available templates are in `.agileflow/teams/`:

| Template | Description |
|----------|-------------|
| `fullstack` | API + UI + Testing specialists |
| `code-review` | Code reviewer + Security + Performance |
| `builder-validator` | Paired builders with validators |
| `logic-audit` | Multi-perspective logic analysis |

If no argument given, use AskUserQuestion to let user choose.

## Step 3: Start Team

### Native Mode (Agent Teams enabled)

When Agent Teams is enabled, use native tools to create and coordinate the team:

1. **Run the team-manager script** to load the template and build the native payload:
   ```bash
   node .agileflow/scripts/team-manager.js start <template-name>
   ```
   Parse the JSON output. The `native_payload` field contains the team configuration.

2. **Announce the team composition** to the user — list each teammate's name, role, and domain.

3. **Spawn teammates using the Task tool with native parameters**:
   For each teammate in `native_payload.teammates`:
   ```
   Task tool call:
     subagent_type: <teammate.name>     (e.g. "agileflow-api")
     description: "<role> - <domain>"
     prompt: <built from teammate instructions + project context>
   ```
   The prompt for each teammate should include:
   - Their role and domain from the template
   - The specific task or story they should work on
   - A pointer to read CLAUDE.md and check `docs/09-agents/status.json` for context
   - Quality gate requirements from the template

4. **If native tools fail** (e.g., TeamCreate not available, tool not found errors):
   - Log a warning: "Native Agent Teams tools not available. Falling back to subagent mode."
   - Proceed with the **Fallback Mode** instructions below instead
   - Update `session-state.json` to reflect `mode: "subagent"`

5. **Create shared tasks** using TaskCreate for the work to be done:
   - One task per teammate with clear acceptance criteria
   - Set up dependencies (e.g., UI tasks blocked by API tasks)

6. **Report** which mode was actually used (native vs fallback) and the spawned teammates.

> **Tip**: For teams with 3+ teammates, consider using tmux sessions (`/agileflow:session:spawn`) to run teammates in parallel windows for better visibility.

### Fallback Mode (Agent Teams disabled)

When Agent Teams is NOT enabled:

1. Show warning: "Agent Teams is not enabled. Using orchestrator subagent mode."
2. Show how to enable: "Set CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1 to use native teams"
3. Use the `Task` tool with `subagent_type` matching each teammate's agent name
4. Coordinate results manually

## Step 4: Report

Show team status:
- Which teammates were spawned
- What tasks were assigned
- Current quality gate configuration

---

## Examples

```
/agileflow:team:start fullstack
/agileflow:team:start code-review
/agileflow:team:start builder-validator
```

## Quality Gates

Teams respect quality gates from the template's `quality_gates` configuration:
- **teammate_idle**: Gates checked before a teammate goes idle (tests, lint, types)
- **task_completed**: Gates checked when a task is marked done (validator approval)
