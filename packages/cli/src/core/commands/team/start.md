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

When Agent Teams is enabled, operate as the **team lead** in delegate mode:

1. Read the template JSON from `.agileflow/teams/<template>.json`
2. Announce the team composition to the user
3. Create tasks for each teammate using the native task list
4. Spawn teammate sessions as defined in the template
5. Monitor progress and coordinate handoffs

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
