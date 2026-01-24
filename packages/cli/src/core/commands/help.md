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
    - "Include dynamic injection: Available commands (61 total):
- `/agileflow:adr NUMBER=<number> TITLE=<text> CONTEXT=<text> DECISION=<text> CONSEQUENCES=<text> \[LINKS=<text>\]` - Create an Architecture Decision Record
- `/agileflow:adr-list` - List all Architecture Decision Records
- `/agileflow:adr-update NUMBER=<number> \[STATUS=<status>\] \[REASON=<text>\]` - Update ADR status or content
- `/agileflow:adr-view NUMBER=<number>` - View ADR details with contextual actions
- `/agileflow:agent AGENT\_ID=<id> ROLE=<text> \[TOOLS=<list>\] \[SCOPE=<list>\]` - Onboard a new agent with profile and contract
- `/agileflow:assign STORY=<US\-ID> NEW\_OWNER=<id> \[NEW\_STATUS=<status>\] \[NOTE=<text>\]` - Assign or reassign a story to an owner
- `/agileflow:audit STORY=<US\-ID>` - Audit story completion \- tests \+ acceptance criteria verification \(GSD pattern\)
- `/agileflow:auto SOURCE=<path\|url> \[EPIC=<EP\-ID>\] \[OWNER=<id>\] \[AUTO\_CREATE=true\|false\]` - Auto\-generate stories from PRDs, mockups, or specs
- `/agileflow:baseline` - Mark current state as verified baseline
- `/agileflow:batch <operation> <pattern> \[<action>\]` - Process multiple items with functional patterns \(map/pmap/filter/reduce\)
- `/agileflow:changelog \(no arguments\)` - Auto\-generate changelog from commit history
- `/agileflow:choose <decision> \[<context>\]` - AI\-directed decision making with structured options
- `/agileflow:ci \(no arguments\)` - Bootstrap CI/CD workflow with testing and quality checks
- `/agileflow:council <question> \[--mode parallel\|debate\] \[--rounds N\]` - Convene AI Council for strategic decisions with three perspectives \(Optimist, Advocate, Analyst\)
- `/agileflow:compress \(no arguments\)` - Compress status\.json by removing verbose fields and keeping only tracking metadata
- `/agileflow:context-export \(no arguments\)` - Export concise context excerpt for web AI tools
- `/agileflow:context-full \(no arguments\)` - Generate/refresh full context brief for web AI tools
- `/agileflow:context-note NOTE=<text>` - Add timestamped note to context file
- `/agileflow:debt \(no arguments\)` - Track and prioritize technical debt items
- `/agileflow:deploy \(no arguments\)` - Set up automated deployment pipeline
- `/agileflow:diagnose \(no arguments\)` - System health diagnostics
- `/agileflow:epic EPIC=<EP\-ID> TITLE=<text> OWNER=<id> GOAL=<text> \[STORIES=<list>\] \[RESEARCH=<file>\]` - Create a new epic with stories
- `/agileflow:epic-list` - List all epics with status and progress
- `/agileflow:epic-view EPIC=<EP\-ID>` - View epic details with stories and contextual actions
- `/agileflow:feedback \(no arguments\)` - Collect and process agent feedback
- `/agileflow:handoff STORY=<US\-ID> FROM=<id> TO=<id> \[SUMMARY=<text>\] \[BLOCKERS=<list>\]` - Document work handoff between agents
- `/agileflow:help \(no arguments\)` - Display AgileFlow system overview and commands
- `/agileflow:multi-expert <question>` - Deploy multiple domain experts on the same problem for higher confidence
- `/agileflow:packages \(no arguments\)` - Manage dependencies with updates and security audits
- `/agileflow:pr STORY=<US\-ID> \[TITLE=<text>\] \[TEST\_EVIDENCE=<text>\]` - Generate pull request description from story
- `/agileflow:readme-sync FOLDER=<path>\|all` - Synchronize a folder's README\.md with its current contents
- `/agileflow:research-analyze` - Analyze existing research for implementation in your project
- `/agileflow:research-ask TOPIC=<text> \[DETAILS=<text>\] \[ERROR=<text>\]` - Generate detailed research prompt for web AI tools \(ChatGPT, Perplexity, etc\.\)
- `/agileflow:research-import TOPIC=<text> \[CONTENT=<text>\] \[SOURCE=<url>\]` - Import research results and save to research folder
- `/agileflow:research-list \(no arguments\)` - Show research notes index
- `/agileflow:research-view FILE=<filename>` - Read a specific research note
- `/agileflow:rlm DOCUMENT=<path> QUERY=<text> \[MAX\_ITERATIONS=<number>\] \[DEPTH=<number>\]` - Analyze complex documents using RLM \(Recursive Language Models\) pattern
- `/agileflow:session-cleanup \(no arguments\)` - Interactive session cleanup with AI assessment
- `/agileflow:session-end \(no arguments\)` - Cleanly end session with optional merge to main
- `/agileflow:session-history` - View past session history and metrics
- `/agileflow:session-init \(no arguments\)` - Initialize session harness with test verification
- `/agileflow:session-new \(no arguments\)` - Create a new parallel session with git worktree
- `/agileflow:session-resume \(no arguments\)` - Pick a session to switch to or resume
- `/agileflow:session-spawn` - Spawn multiple parallel Claude Code sessions in git worktrees
- `/agileflow:session-status` - View current session state and activity
- `/agileflow:skill-create` - Generate a custom skill with web research, cookbook pattern, and MCP integration
- `/agileflow:skill-delete` - Remove an installed skill from \.claude/skills/
- `/agileflow:skill-edit` - Edit an existing skill's SKILL\.md, cookbook entries, or references
- `/agileflow:skill-list \(no arguments\)` - List all installed skills with their descriptions and status
- `/agileflow:skill-test` - Verify a skill works correctly by testing its activation and functionality
- `/agileflow:skill-upgrade` - Upgrade existing skills with self\-improving learning capability
- `/agileflow:status STORY=<US\-ID> STATUS=<status> \[SUMMARY=<text>\] \[PR=<url>\] \[TO=<agent\-id>\]` - Update story status and progress
- `/agileflow:story EPIC=<EP\-ID> STORY=<US\-ID> TITLE=<text> OWNER=<id> \[ESTIMATE=<pts>\] \[AC=<list>\] \[TDD=true\]` - Create a user story with acceptance criteria
- `/agileflow:story-validate STORY=<US\-ID>` - Validate story completeness before development
- `/agileflow:story-view STORY=<US\-ID>` - View story details with contextual actions
- `/agileflow:template ACTION=create\|edit\|list\|use \[TYPE=story\|epic\|adr\|custom\] \[NAME=<name>\]` - Create and manage custom document templates
- `/agileflow:tests \(no arguments\)` - Set up automated testing infrastructure
- `/agileflow:validate-expertise` - Validate expertise files for drift and staleness
- `/agileflow:verify` - Run project tests and update story test status
- `/agileflow:whats-new \(no arguments\)` - Show what's new in AgileFlow
- `/agileflow:workflow <template> \[<arguments>\]` - Define and run parameterized workflow templates
"
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
- Dynamic injection: Available commands (61 total):
- `/agileflow:adr NUMBER=<number> TITLE=<text> CONTEXT=<text> DECISION=<text> CONSEQUENCES=<text> \[LINKS=<text>\]` - Create an Architecture Decision Record
- `/agileflow:adr-list` - List all Architecture Decision Records
- `/agileflow:adr-update NUMBER=<number> \[STATUS=<status>\] \[REASON=<text>\]` - Update ADR status or content
- `/agileflow:adr-view NUMBER=<number>` - View ADR details with contextual actions
- `/agileflow:agent AGENT\_ID=<id> ROLE=<text> \[TOOLS=<list>\] \[SCOPE=<list>\]` - Onboard a new agent with profile and contract
- `/agileflow:assign STORY=<US\-ID> NEW\_OWNER=<id> \[NEW\_STATUS=<status>\] \[NOTE=<text>\]` - Assign or reassign a story to an owner
- `/agileflow:audit STORY=<US\-ID>` - Audit story completion \- tests \+ acceptance criteria verification \(GSD pattern\)
- `/agileflow:auto SOURCE=<path\|url> \[EPIC=<EP\-ID>\] \[OWNER=<id>\] \[AUTO\_CREATE=true\|false\]` - Auto\-generate stories from PRDs, mockups, or specs
- `/agileflow:baseline` - Mark current state as verified baseline
- `/agileflow:batch <operation> <pattern> \[<action>\]` - Process multiple items with functional patterns \(map/pmap/filter/reduce\)
- `/agileflow:changelog \(no arguments\)` - Auto\-generate changelog from commit history
- `/agileflow:choose <decision> \[<context>\]` - AI\-directed decision making with structured options
- `/agileflow:ci \(no arguments\)` - Bootstrap CI/CD workflow with testing and quality checks
- `/agileflow:council <question> \[--mode parallel\|debate\] \[--rounds N\]` - Convene AI Council for strategic decisions with three perspectives \(Optimist, Advocate, Analyst\)
- `/agileflow:compress \(no arguments\)` - Compress status\.json by removing verbose fields and keeping only tracking metadata
- `/agileflow:context-export \(no arguments\)` - Export concise context excerpt for web AI tools
- `/agileflow:context-full \(no arguments\)` - Generate/refresh full context brief for web AI tools
- `/agileflow:context-note NOTE=<text>` - Add timestamped note to context file
- `/agileflow:debt \(no arguments\)` - Track and prioritize technical debt items
- `/agileflow:deploy \(no arguments\)` - Set up automated deployment pipeline
- `/agileflow:diagnose \(no arguments\)` - System health diagnostics
- `/agileflow:epic EPIC=<EP\-ID> TITLE=<text> OWNER=<id> GOAL=<text> \[STORIES=<list>\] \[RESEARCH=<file>\]` - Create a new epic with stories
- `/agileflow:epic-list` - List all epics with status and progress
- `/agileflow:epic-view EPIC=<EP\-ID>` - View epic details with stories and contextual actions
- `/agileflow:feedback \(no arguments\)` - Collect and process agent feedback
- `/agileflow:handoff STORY=<US\-ID> FROM=<id> TO=<id> \[SUMMARY=<text>\] \[BLOCKERS=<list>\]` - Document work handoff between agents
- `/agileflow:help \(no arguments\)` - Display AgileFlow system overview and commands
- `/agileflow:multi-expert <question>` - Deploy multiple domain experts on the same problem for higher confidence
- `/agileflow:packages \(no arguments\)` - Manage dependencies with updates and security audits
- `/agileflow:pr STORY=<US\-ID> \[TITLE=<text>\] \[TEST\_EVIDENCE=<text>\]` - Generate pull request description from story
- `/agileflow:readme-sync FOLDER=<path>\|all` - Synchronize a folder's README\.md with its current contents
- `/agileflow:research-analyze` - Analyze existing research for implementation in your project
- `/agileflow:research-ask TOPIC=<text> \[DETAILS=<text>\] \[ERROR=<text>\]` - Generate detailed research prompt for web AI tools \(ChatGPT, Perplexity, etc\.\)
- `/agileflow:research-import TOPIC=<text> \[CONTENT=<text>\] \[SOURCE=<url>\]` - Import research results and save to research folder
- `/agileflow:research-list \(no arguments\)` - Show research notes index
- `/agileflow:research-view FILE=<filename>` - Read a specific research note
- `/agileflow:rlm DOCUMENT=<path> QUERY=<text> \[MAX\_ITERATIONS=<number>\] \[DEPTH=<number>\]` - Analyze complex documents using RLM \(Recursive Language Models\) pattern
- `/agileflow:session-cleanup \(no arguments\)` - Interactive session cleanup with AI assessment
- `/agileflow:session-end \(no arguments\)` - Cleanly end session with optional merge to main
- `/agileflow:session-history` - View past session history and metrics
- `/agileflow:session-init \(no arguments\)` - Initialize session harness with test verification
- `/agileflow:session-new \(no arguments\)` - Create a new parallel session with git worktree
- `/agileflow:session-resume \(no arguments\)` - Pick a session to switch to or resume
- `/agileflow:session-spawn` - Spawn multiple parallel Claude Code sessions in git worktrees
- `/agileflow:session-status` - View current session state and activity
- `/agileflow:skill-create` - Generate a custom skill with web research, cookbook pattern, and MCP integration
- `/agileflow:skill-delete` - Remove an installed skill from \.claude/skills/
- `/agileflow:skill-edit` - Edit an existing skill's SKILL\.md, cookbook entries, or references
- `/agileflow:skill-list \(no arguments\)` - List all installed skills with their descriptions and status
- `/agileflow:skill-test` - Verify a skill works correctly by testing its activation and functionality
- `/agileflow:skill-upgrade` - Upgrade existing skills with self\-improving learning capability
- `/agileflow:status STORY=<US\-ID> STATUS=<status> \[SUMMARY=<text>\] \[PR=<url>\] \[TO=<agent\-id>\]` - Update story status and progress
- `/agileflow:story EPIC=<EP\-ID> STORY=<US\-ID> TITLE=<text> OWNER=<id> \[ESTIMATE=<pts>\] \[AC=<list>\] \[TDD=true\]` - Create a user story with acceptance criteria
- `/agileflow:story-validate STORY=<US\-ID>` - Validate story completeness before development
- `/agileflow:story-view STORY=<US\-ID>` - View story details with contextual actions
- `/agileflow:template ACTION=create\|edit\|list\|use \[TYPE=story\|epic\|adr\|custom\] \[NAME=<name>\]` - Create and manage custom document templates
- `/agileflow:tests \(no arguments\)` - Set up automated testing infrastructure
- `/agileflow:validate-expertise` - Validate expertise files for drift and staleness
- `/agileflow:verify` - Run project tests and update story test status
- `/agileflow:whats-new \(no arguments\)` - Show what's new in AgileFlow
- `/agileflow:workflow <template> \[<arguments>\]` - Define and run parameterized workflow templates


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

Available commands (61 total):
- `/agileflow:adr NUMBER=<number> TITLE=<text> CONTEXT=<text> DECISION=<text> CONSEQUENCES=<text> \[LINKS=<text>\]` - Create an Architecture Decision Record
- `/agileflow:adr-list` - List all Architecture Decision Records
- `/agileflow:adr-update NUMBER=<number> \[STATUS=<status>\] \[REASON=<text>\]` - Update ADR status or content
- `/agileflow:adr-view NUMBER=<number>` - View ADR details with contextual actions
- `/agileflow:agent AGENT\_ID=<id> ROLE=<text> \[TOOLS=<list>\] \[SCOPE=<list>\]` - Onboard a new agent with profile and contract
- `/agileflow:assign STORY=<US\-ID> NEW\_OWNER=<id> \[NEW\_STATUS=<status>\] \[NOTE=<text>\]` - Assign or reassign a story to an owner
- `/agileflow:audit STORY=<US\-ID>` - Audit story completion \- tests \+ acceptance criteria verification \(GSD pattern\)
- `/agileflow:auto SOURCE=<path\|url> \[EPIC=<EP\-ID>\] \[OWNER=<id>\] \[AUTO\_CREATE=true\|false\]` - Auto\-generate stories from PRDs, mockups, or specs
- `/agileflow:baseline` - Mark current state as verified baseline
- `/agileflow:batch <operation> <pattern> \[<action>\]` - Process multiple items with functional patterns \(map/pmap/filter/reduce\)
- `/agileflow:changelog \(no arguments\)` - Auto\-generate changelog from commit history
- `/agileflow:choose <decision> \[<context>\]` - AI\-directed decision making with structured options
- `/agileflow:ci \(no arguments\)` - Bootstrap CI/CD workflow with testing and quality checks
- `/agileflow:council <question> \[--mode parallel\|debate\] \[--rounds N\]` - Convene AI Council for strategic decisions with three perspectives \(Optimist, Advocate, Analyst\)
- `/agileflow:compress \(no arguments\)` - Compress status\.json by removing verbose fields and keeping only tracking metadata
- `/agileflow:context-export \(no arguments\)` - Export concise context excerpt for web AI tools
- `/agileflow:context-full \(no arguments\)` - Generate/refresh full context brief for web AI tools
- `/agileflow:context-note NOTE=<text>` - Add timestamped note to context file
- `/agileflow:debt \(no arguments\)` - Track and prioritize technical debt items
- `/agileflow:deploy \(no arguments\)` - Set up automated deployment pipeline
- `/agileflow:diagnose \(no arguments\)` - System health diagnostics
- `/agileflow:epic EPIC=<EP\-ID> TITLE=<text> OWNER=<id> GOAL=<text> \[STORIES=<list>\] \[RESEARCH=<file>\]` - Create a new epic with stories
- `/agileflow:epic-list` - List all epics with status and progress
- `/agileflow:epic-view EPIC=<EP\-ID>` - View epic details with stories and contextual actions
- `/agileflow:feedback \(no arguments\)` - Collect and process agent feedback
- `/agileflow:handoff STORY=<US\-ID> FROM=<id> TO=<id> \[SUMMARY=<text>\] \[BLOCKERS=<list>\]` - Document work handoff between agents
- `/agileflow:help \(no arguments\)` - Display AgileFlow system overview and commands
- `/agileflow:multi-expert <question>` - Deploy multiple domain experts on the same problem for higher confidence
- `/agileflow:packages \(no arguments\)` - Manage dependencies with updates and security audits
- `/agileflow:pr STORY=<US\-ID> \[TITLE=<text>\] \[TEST\_EVIDENCE=<text>\]` - Generate pull request description from story
- `/agileflow:readme-sync FOLDER=<path>\|all` - Synchronize a folder's README\.md with its current contents
- `/agileflow:research-analyze` - Analyze existing research for implementation in your project
- `/agileflow:research-ask TOPIC=<text> \[DETAILS=<text>\] \[ERROR=<text>\]` - Generate detailed research prompt for web AI tools \(ChatGPT, Perplexity, etc\.\)
- `/agileflow:research-import TOPIC=<text> \[CONTENT=<text>\] \[SOURCE=<url>\]` - Import research results and save to research folder
- `/agileflow:research-list \(no arguments\)` - Show research notes index
- `/agileflow:research-view FILE=<filename>` - Read a specific research note
- `/agileflow:rlm DOCUMENT=<path> QUERY=<text> \[MAX\_ITERATIONS=<number>\] \[DEPTH=<number>\]` - Analyze complex documents using RLM \(Recursive Language Models\) pattern
- `/agileflow:session-cleanup \(no arguments\)` - Interactive session cleanup with AI assessment
- `/agileflow:session-end \(no arguments\)` - Cleanly end session with optional merge to main
- `/agileflow:session-history` - View past session history and metrics
- `/agileflow:session-init \(no arguments\)` - Initialize session harness with test verification
- `/agileflow:session-new \(no arguments\)` - Create a new parallel session with git worktree
- `/agileflow:session-resume \(no arguments\)` - Pick a session to switch to or resume
- `/agileflow:session-spawn` - Spawn multiple parallel Claude Code sessions in git worktrees
- `/agileflow:session-status` - View current session state and activity
- `/agileflow:skill-create` - Generate a custom skill with web research, cookbook pattern, and MCP integration
- `/agileflow:skill-delete` - Remove an installed skill from \.claude/skills/
- `/agileflow:skill-edit` - Edit an existing skill's SKILL\.md, cookbook entries, or references
- `/agileflow:skill-list \(no arguments\)` - List all installed skills with their descriptions and status
- `/agileflow:skill-test` - Verify a skill works correctly by testing its activation and functionality
- `/agileflow:skill-upgrade` - Upgrade existing skills with self\-improving learning capability
- `/agileflow:status STORY=<US\-ID> STATUS=<status> \[SUMMARY=<text>\] \[PR=<url>\] \[TO=<agent\-id>\]` - Update story status and progress
- `/agileflow:story EPIC=<EP\-ID> STORY=<US\-ID> TITLE=<text> OWNER=<id> \[ESTIMATE=<pts>\] \[AC=<list>\] \[TDD=true\]` - Create a user story with acceptance criteria
- `/agileflow:story-validate STORY=<US\-ID>` - Validate story completeness before development
- `/agileflow:story-view STORY=<US\-ID>` - View story details with contextual actions
- `/agileflow:template ACTION=create\|edit\|list\|use \[TYPE=story\|epic\|adr\|custom\] \[NAME=<name>\]` - Create and manage custom document templates
- `/agileflow:tests \(no arguments\)` - Set up automated testing infrastructure
- `/agileflow:validate-expertise` - Validate expertise files for drift and staleness
- `/agileflow:verify` - Run project tests and update story test status
- `/agileflow:whats-new \(no arguments\)` - Show what's new in AgileFlow
- `/agileflow:workflow <template> \[<arguments>\]` - Define and run parameterized workflow templates


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

---

## Related Commands

- `/agileflow:configure` - Manage AgileFlow features and hooks
- `/agileflow:diagnose` - System health diagnostics
- `/agileflow:whats-new` - Show what's new in AgileFlow
- `/agileflow:board` - Visual kanban board
- `/agileflow:babysit` - Interactive mentor workflow
