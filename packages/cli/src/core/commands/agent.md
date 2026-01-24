---
description: Onboard a new agent with profile and contract
argument-hint: AGENT_ID=<id> ROLE=<text> [TOOLS=<list>] [SCOPE=<list>]
compact_context:
  priority: high
  preserve_rules:
    - "ACTIVE COMMAND: /agileflow:agent - Agent onboarding with profiles and contracts"
    - "CRITICAL: Create agent profile markdown file at docs/02-practices/prompts/agents/agent-{AGENT_ID}.md"
    - "CRITICAL: Update roster.yaml at docs/09-agents/roster.yaml with agent metadata"
    - "MUST include System Prompt (contract) with scope boundaries, commit rules, test requirements"
    - "MUST use diff-first approach: show preview, get YES/NO confirmation before writing"
    - "Agent IDs must be descriptive (AG-UI, AG-API, AG-CI) not generic (AG-001)"
    - "Profile includes: role, tools, scope directories, story tags, contract rules"
  state_fields:
    - agent_id
    - role
    - tools_list
    - scope_directories
    - scope_story_tags
---

# agent-new

Onboard a new agent with profile and system prompt.

## STEP 0: Gather Context

```bash
node .agileflow/scripts/obtain-context.js agent
```

<!-- COMPACT_SUMMARY_START -->
## Compact Summary

**Command**: `agent` - Onboard new agents with profiles and system prompts (contracts)

**Quick Usage**:
```
/agileflow:agent AGENT_ID=AG-UI ROLE="Frontend Developer" TOOLS="Read,Write,Bash" SCOPE="src/components/,US-00*"
```

**What It Does**: Create agent profile → Update roster → Generate system prompt snippet

### Tool Usage Examples

**Write** (to create agent profile):
```xml
<invoke name="Write">
<parameter name="file_path">/full/path/to/docs/02-practices/prompts/agents/agent-AG-UI.md</parameter>
<parameter name="content">---
agent_id: AG-UI
role: Frontend Developer
tools: [Read, Write, Edit, Bash, Glob]
scope:
  directories: [src/components/, src/pages/]
  story_tags: [frontend, ui, ux]
---

# AG-UI: Frontend Developer Agent

## Responsibilities
Build and maintain user interface components...

## System Prompt (Contract)
**Scope**: Only modify files in src/components/ and src/pages/
**Testing**: Run `npm test` before committing
**Commits**: Prefix with "feat(ui):" or "fix(ui):"
**Status**: Update status.json after completing stories</parameter>
</invoke>
```

**Edit** (to update roster.yaml):
```xml
<invoke name="Edit">
<parameter name="file_path">/full/path/to/docs/09-agents/roster.yaml</parameter>
<parameter name="old_string">agents: []</parameter>
<parameter name="new_string">agents:
  - id: AG-UI
    role: Frontend Developer
    tools: [Read, Write, Edit, Bash, Glob]
    scope:
      directories: [src/components/, src/pages/]
      story_tags: [frontend, ui, ux]</parameter>
</invoke>
```

**AskUserQuestion** (optional, for confirmation):
```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{"question": "Create this agent profile?", "header": "Onboarding", "multiSelect": false, "options": [{"label": "Yes, create profile", "description": "Create agent-AG-UI.md and update roster"}, {"label": "No, cancel", "description": "Cancel without creating"}]}]</parameter>
</invoke>
```

**Profile Components**:
- Agent ID (e.g., AG-UI, AG-API, AG-CI)
- Role and responsibilities
- Available tools (Read, Write, Edit, Bash, etc.)
- Scope boundaries (directories, story tags)
- System prompt (contract with strict rules)

**Best Practices**:
- Use descriptive agent IDs (AG-UI, AG-API, not AG-001)
- Define clear scope boundaries to prevent conflicts
- Include test requirements in contract
- Map agents to specific story types

<!-- COMPACT_SUMMARY_END -->

## Prompt

ROLE: Agent Onboarder

INPUTS
AGENT_ID=<AG-UI|AG-API|AG-CI or custom>  ROLE=<role>
TOOLS=[list]  SCOPE=<directories & story tags>

TEMPLATE
Use the following agent profile template:
@packages/cli/src/core/templates/agent-profile-template.md

ACTIONS
1) Create docs/02-practices/prompts/agents/agent-<AGENT_ID>.md from agent-profile-template.md including a strict "System Prompt (contract)" (scope boundaries, commit/branch rules, tests, status/bus updates).
2) Update docs/09-agents/roster.yaml (create if missing) mapping id→role/tools/scope.
3) Print a persona snippet to paste as that terminal's system prompt.

Diff-first; YES/NO.

---

## Expected Output

### Successful Agent Onboarding

```
📋 Onboarding New Agent: AG-UI

AGENT_ID: AG-UI
ROLE: Frontend Developer
TOOLS: Read, Write, Edit, Bash, Glob
SCOPE:
  - Directories: src/components/, src/pages/
  - Story Tags: frontend, ui, ux

Files to create:
───────────────────────────────────────────────
1. docs/02-practices/prompts/agents/agent-AG-UI.md

Preview:
─────────────────────────────────────────────
---
agent_id: AG-UI
role: Frontend Developer
tools: [Read, Write, Edit, Bash, Glob]
scope:
  directories: [src/components/, src/pages/]
  story_tags: [frontend, ui, ux]
---

# AG-UI: Frontend Developer Agent

## Responsibilities
Build and maintain user interface components, pages, and styling.

## System Prompt (Contract)
**Scope**: Only modify files in src/components/ and src/pages/
**Testing**: Run `npm test` before committing
**Commits**: Prefix with "feat(ui):" or "fix(ui):"
**Status**: Update status.json after completing stories
─────────────────────────────────────────────

2. docs/09-agents/roster.yaml (update)

   + agents:
   +   - id: AG-UI
   +     role: Frontend Developer
   +     tools: [Read, Write, Edit, Bash, Glob]
   +     scope:
   +       directories: [src/components/, src/pages/]
   +       story_tags: [frontend, ui, ux]

[AskUserQuestion: "Create this agent profile?"]

✅ Agent onboarded successfully!
   Profile: docs/02-practices/prompts/agents/agent-AG-UI.md
   Roster: docs/09-agents/roster.yaml updated

📝 System Prompt Snippet (paste into terminal):

You are AG-UI, a Frontend Developer agent.
Your scope is limited to: src/components/, src/pages/
You work on stories tagged: frontend, ui, ux
Always run tests before committing.
Always update status.json after completing work.
```

### Missing Required Inputs

```
❌ Missing required inputs

Please provide:
  • AGENT_ID - Agent identifier (e.g., AG-UI, AG-API)
  • ROLE - Agent role description (e.g., "Frontend Developer")

Optional:
  • TOOLS - Available tools (default: Read, Write, Edit, Bash, Glob)
  • SCOPE - Directories and story tags

Usage:
/agileflow:agent AGENT_ID=AG-UI ROLE="Frontend Developer" TOOLS="Read,Write,Edit,Bash,Glob" SCOPE="src/components/,frontend"
```

### Agent Already Exists

```
⚠️ Agent already exists: AG-UI

Existing agent profile: docs/02-practices/prompts/agents/agent-AG-UI.md

Options:
  1. Update existing agent profile
  2. Create new agent with different ID
  3. Cancel

[AskUserQuestion: "How to proceed?"]
```

---

## Related Commands

- `/agileflow:configure` - Manage AgileFlow features and hooks
- `/agileflow:story` - Create user stories for agents
- `/agileflow:status` - Update story status and progress
- `/agileflow:babysit` - Interactive mentor workflow
- `/agileflow:help` - Display AgileFlow overview

### Roster File Created

```
📋 Onboarding New Agent: AG-API

Note: docs/09-agents/roster.yaml does not exist.
Creating new roster file.

Files to create:
───────────────────────────────────────────────
1. docs/02-practices/prompts/agents/agent-AG-API.md
2. docs/09-agents/roster.yaml (NEW)

[AskUserQuestion: "Create agent profile and roster?"]

✅ Agent onboarded successfully!
   Profile: docs/02-practices/prompts/agents/agent-AG-API.md
   Roster: docs/09-agents/roster.yaml created
```
