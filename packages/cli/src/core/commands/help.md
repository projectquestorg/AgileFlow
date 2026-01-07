---
description: Display AgileFlow system overview and commands
argument-hint: (no arguments)
compact_context:
  priority: medium
  preserve_rules:
    - "ACTIVE COMMAND: /agileflow:help - System guide (display-only, no file writes)"
    - "MUST output markdown (never writes files)"
    - "MUST show folder map, concepts, daily workflow, all commands"
    - "Include dynamic injection: <!-- {{COMMAND_LIST}} -->"
  state_fields:
    - display_mode
---

# system-help

Display a concise overview of the AgileFlow system.

---

## STEP 0: Gather Context

```bash
node .agileflow/scripts/obtain-context.js help
```

---

## Context Loading (Documentation)

**PURPOSE**: Immediately load full context before executing any logic.

**ACTIONS**:
1. Read this command file (`.agileflow/commands/help.md`) in its entirety
2. Absorb all instructions, rules, and examples
3. Proceed to execution phase with complete context

**WHY**: Prevents incomplete instruction loading and ensures consistent behavior.

---

<!-- COMPACT_SUMMARY_START -->
## Compact Summary
- **Command**: /agileflow:help
- **Purpose**: Display AgileFlow system overview
- **No Arguments**: Shows system overview automatically
- **Output**: Markdown overview (no file writes, display only)
- **Key Actions**: Print folder map → Explain concepts → Show workflow → List all commands
- **Workflow**: Pick story → Implement to AC → Tests → PR → Update status
- **WIP Limit**: Max 2 stories/agent

### Tool Usage

This command uses NO tools (display-only, no file writes).

Output includes:
- Folder map (docs/*) and what lives where
- What Epics, Stories, ADRs are
- How docs/09-agents/status.json and bus/log.jsonl work
- Daily flow: Pick story → Implement to AC → Tests → PR → Update status
- WIP limit: max 2 stories/agent
- All available commands with examples
- Dynamic injection: <!-- {{COMMAND_LIST}} -->

- **Related**: All AgileFlow commands, system documentation
<!-- COMPACT_SUMMARY_END -->

---

## Prompt

ROLE: System Guide

INPUTS
(no arguments - displays system overview)

ACTIONS
1) Print folder map (docs/*) and what lives where
2) Explain Epics, Stories, ADRs, status.json, bus/log.jsonl
3) Show daily workflow
4) List all available commands with examples

TASK
Print a concise, one-screen overview:
- Folder map (docs/*) and what lives where
- What Epics, Stories, ADRs are; how docs/09-agents/status.json + bus/log.jsonl work
- Daily flow: Pick story → Implement to AC → Tests → PR → Update status
- WIP limit: max 2 stories/agent
- List ALL available commands with one-line examples

<!-- {{COMMAND_LIST}} -->

OUTPUT: plain markdown only (no file writes)
