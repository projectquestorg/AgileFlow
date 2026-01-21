---
description: Display AgileFlow system overview and commands
argument-hint: (no arguments)
type: output-only  # Display command - generates output, not an ongoing task
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

---

## Expected Output

```markdown
# AgileFlow System Overview

## Folder Structure

```
docs/
├── 00-meta/           # Metadata and configuration
├── 01-brainstorming/  # Ideas and proposals
├── 02-practices/      # Development guidelines
├── 03-decisions/      # Architecture Decision Records (ADRs)
├── 04-architecture/   # System design documentation
├── 05-epics/          # Epic definitions (EP-XXXX.md)
├── 06-stories/        # User stories by epic (US-XXXX-<slug>.md)
├── 07-testing/        # Test plans and coverage
├── 08-project/        # Project overview, roadmaps, reviews
├── 09-agents/         # Agent communication
│   ├── status.json    # Story/epic status tracking
│   └── bus/log.jsonl  # Inter-agent message bus
└── 10-research/       # Research notes and findings
```

## Key Concepts

**Epics** (EP-XXXX): Large features broken into stories
**Stories** (US-XXXX): Work items with acceptance criteria
**ADRs**: Architecture Decision Records for technical choices
**status.json**: Central source of truth for story/epic status
**bus/log.jsonl**: Async message bus for agent coordination

## Daily Workflow

1. Pick a ready story from status.json
2. Mark as `in-progress`
3. Implement to acceptance criteria
4. Write/update tests
5. Create PR
6. Mark as `in-review`
7. After merge: Mark as `done`

## WIP Limits

- **Max 2 stories per agent** in progress or review
- Complete or unblock before starting new work

## Available Commands

### Project Management
- `/agileflow:epic` - Create a new epic
- `/agileflow:story` - Create a user story
- `/agileflow:status` - Update story status
- `/agileflow:board` - Visual kanban board
- `/agileflow:sprint` - Plan sprint stories

### Development
- `/agileflow:babysit` - Guided implementation mentor
- `/agileflow:review` - AI code review
- `/agileflow:pr` - Generate PR description
- `/agileflow:tests` - Generate test cases

### Documentation
- `/agileflow:adr` - Create architecture decision
- `/agileflow:docs` - Generate documentation
- `/agileflow:changelog` - Generate changelog entry

### Utilities
- `/agileflow:help` - This overview
- `/agileflow:diagnose` - System health check
- `/agileflow:configure` - Setup AgileFlow
```
