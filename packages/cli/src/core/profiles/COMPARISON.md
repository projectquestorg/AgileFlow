# IDE Capability Comparison Matrix

Complete comparison of all supported IDEs. Profiles at `/packages/cli/src/core/profiles/`.

## Core Capabilities

| Capability | Claude Code | Cursor | Windsurf | Codex |
|---|---|---|---|---|
| **File Operations** | ✅ Native tools | ✅ read_file, edit_file | ✅ Native | ⚠️ Via skills |
| **Shell Execution** | ✅ Bash tool | ✅ run_terminal_cmd | ✅ run_command | ⚠️ Via sandbox |
| **File Search** | ✅ Glob, Grep | ✅ codebase_search, grep_search | ✅ search_files, search_codebase | ⚠️ Via sandbox |
| **Interactive Input** | ✅ Structured (AskUserQuestion) | ⚠️ Conversational | ⚠️ Conversational | ⚠️ Text-only |
| **Sub-Agents** | ✅ Task tool | ✅ Async native agents | ⚠️ Cascades + chaining | ❌ Cannot nest |
| **Nested Sub-Agents** | ✅ Full nesting | ✅ Full nesting | ❌ Parallel only | ❌ None |

## Planning & Execution

| Capability | Claude Code | Cursor | Windsurf | Codex |
|---|---|---|---|---|
| **Plan Mode** | ✅ EnterPlanMode/ExitPlanMode | ✅ Native | ✅ Native + "megaplan" | ❌ None |
| **Plan Editing** | ✅ User can edit | ✅ User can edit | ✅ User can edit | N/A |
| **Persistent Plans** | ✅ Yes | ✅ Yes | ✅ ~/.windsurf/plans/ | N/A |

## Lifecycle & Hooks

| Hook Event | Claude Code | Cursor | Windsurf | Codex |
|---|---|---|---|---|
| **SessionStart** | ✅ | ❌ | ❌ | ❌ |
| **PreToolUse** | ✅ | ❌ | ❌ | ❌ |
| **PostToolUse** | ✅ | ❌ | ❌ | ❌ |
| **beforeSubmitPrompt** | ❌ | ✅ | ❌ | ❌ |
| **beforeShellExecution** | ❌ | ✅ | ❌ | ❌ |
| **beforeMCPExecution** | ❌ | ✅ | ❌ | ❌ |
| **beforeReadFile** | ❌ | ✅ | ❌ | ❌ |
| **afterFileEdit** | ❌ | ✅ | ❌ | ❌ |
| **pre_read_code** | ❌ | ❌ | ✅ | ❌ |
| **post_read_code** | ❌ | ❌ | ✅ | ❌ |
| **pre_write_code** | ❌ | ❌ | ✅ | ❌ |
| **post_write_code** | ❌ | ❌ | ✅ | ❌ |
| **pre_run_command** | ❌ | ❌ | ✅ | ❌ |
| **post_run_command** | ❌ | ❌ | ✅ | ❌ |
| **pre_mcp_tool_use** | ❌ | ❌ | ✅ | ❌ |
| **post_mcp_tool_use** | ❌ | ❌ | ✅ | ❌ |
| **pre_user_prompt** | ❌ | ❌ | ✅ | ❌ |
| **post_cascade_response** | ❌ | ❌ | ✅ | ❌ |
| **post_setup_worktree** | ❌ | ❌ | ✅ | ❌ |
| **Total Hook Events** | 5 | 6 | 11 | 0 |

**Status**: SessionStart, PreToolUse, PostToolUse (Claude Code); beforeSubmitPrompt, beforeShellExecution, beforeMCPExecution, beforeReadFile, afterFileEdit (Cursor); stop hook (all IDEs)

## External Integration

| Capability | Claude Code | Cursor | Windsurf | Codex |
|---|---|---|---|---|
| **Web Search** | ✅ WebSearch | ✅ web_search + @web | ✅ web_search | ❌ |
| **Web Fetch** | ✅ WebFetch | ✅ @web + MCP | ✅ url_read, view_chunk | ❌ |
| **MCP Support** | ✅ Full | ✅ Full | ✅ Full | ✅ Extension |
| **MCP Tool Cap** | **0 (unlimited)** | **40** | **100** | **0 (unlimited)** |
| **Browser** | ✅ Playwright MCP | ✅ Native browser (v2.0+) | ✅ Browser Preview | ⚠️ Limited |

## Collaboration & Tracking

| Capability | Claude Code | Cursor | Windsurf | Codex |
|---|---|---|---|---|
| **Task Tracking** | ✅ TaskCreate/Update/List | ❌ Plan checklists only | ❌ Conversation-embedded | ❌ None |
| **Persistent Tasks** | ✅ Yes | ❌ | ❌ | ❌ |
| **Git Worktrees** | ✅ EnterWorktree | ⚠️ Background agents use branches | ✅ Native (up to 20) | ⚠️ Manual |
| **Parallel Execution** | ⚠️ Sequential Tasks | ✅ Async subagents | ✅ @cascade worktrees | ❌ |

## Configuration Paths

| Item | Claude Code | Cursor | Windsurf | Codex |
|---|---|---|---|---|
| **Config Dir** | `.claude/` | `.cursor/` | `.windsurf/` | `.codex/` |
| **Commands** | `.claude/commands/agileflow/` | `.cursor/commands/` | `.windsurf/workflows/` | N/A |
| **Agents** | `.claude/agents/agileflow/` | `.cursor/agents/` | N/A (use workflows) | N/A |
| **Skills** | `.claude/skills/` | N/A (use agents) | `.windsurf/skills/*/` | `.codex/skills/agileflow-*/` |
| **Rules** | N/A | `.cursor/rules/` (MDC) | `.windsurf/rules/` | N/A |
| **Hooks Config** | `.claude/settings.json` | `.cursor/hooks.json` | `.windsurf/hooks.json` | N/A |
| **MCP Config** | `.claude/settings.json` | `.cursor/mcp.json` | `~/.codeium/windsurf/mcp_config.json` | N/A |
| **Instructions** | `CLAUDE.md` | `CURSOR.md` | `WINDSURF.md` | `AGENTS.md` |

## Limits & Constraints

| Constraint | Claude Code | Cursor | Windsurf | Codex |
|---|---|---|---|---|
| **Max File Size** | Unlimited | Unlimited | Unlimited | Unlimited |
| **Max Command Length** | Unlimited | Unlimited | Unlimited | Unlimited |
| **Workflow Size** | N/A | N/A | **12,000 chars** | N/A |
| **MCP Tools** | 0 (unlimited) | **40** | 100 | 0 (unlimited) |
| **Git Worktrees** | Via tool | Via branches | Up to 20 | Manual |
| **Parallel Agents** | Sequential | Unlimited | Via @cascade | No nesting |

**Key constraint**: Cursor's 40-tool MCP limit is the binding constraint for multi-IDE installations.

## AgileFlow Feature Support

| Feature | Claude Code | Cursor | Windsurf | Codex |
|---|---|---|---|---|
| **/agileflow:babysit** | ✅ Full | ⚠️ Conversational input | ⚠️ Conversational input | ❌ Limited |
| **AskUserQuestion** | ✅ Structured menus | ❌ Fallback to text | ❌ Fallback to text | ✅ Text-only |
| **Task delegation** | ✅ Task tool | ✅ Async agents | ⚠️ Workflow chaining | ❌ Skill suggestions |
| **Plan mode hooks** | ✅ Full integration | ✅ Native mode | ✅ Native mode | ❌ None |
| **Sub-agent nesting** | ✅ Full support | ✅ Full support | ⚠️ Parallel only | ❌ None |
| **Persistent task list** | ✅ Yes | ❌ | ❌ | ❌ |
| **Async execution** | ❌ Sequential | ✅ Native | ⚠️ @cascade | ❌ |

## Implementation Notes

### Claude Code
- **Recommended target** for new AgileFlow features
- All capabilities validated here first
- Full support for structured user interaction
- No tool limits for multi-IDE deployments

### Cursor
- **Fast-follower to Claude Code** (v2.5 Feb 2026)
- Async native agents eliminate need for Task tool
- 40-tool MCP cap is **binding constraint** for all IDEs
- No AskUserQuestion - replace with numbered text prompts
- Plan mode fully native (no enter/exit needed)

### Windsurf
- **Most hook events** (11 total) but most restrictive
- **No true sub-agent spawning** - use workflow chaining or @cascade
- **12,000 char limit per workflow** - must split large commands
- **Global MCP config only** - no project-level customization
- Native worktrees (up to 20)
- Browser preview built-in to IDE

### Codex
- **Most restrictive** - use as minimum baseline
- Skills cannot spawn other skills (no delegation)
- No plan mode, hooks, or task tracking
- Text-only user input
- Best for linear workflows only

## Multi-IDE Deployment Strategy

**Canonical source**: Claude Code format
**Generation**: Read IDE profile → Transform to IDE-native format
**MCP constraint**: Cap at 40 tools (Cursor's limit) for consistency

**Fallback order when feature unavailable**:
1. Use native IDE equivalent (if exists)
2. Replace with text-based alternative
3. Document limitation in profile

**Example - AskUserQuestion replacement**:
```
Claude Code:
  AskUserQuestion(options=[{label: "Yes"}, {label: "No"}])

Cursor/Windsurf:
  Would you like to continue? (Type "Yes" or "No")

Codex:
  Please choose:
  1. Yes
  2. No
```

## Version Support

- **Claude Code**: Latest (no version pinning)
- **Cursor**: v2.5+ (Feb 2026)
- **Windsurf**: Wave 13+ (native worktrees, 11 hooks)
- **Codex**: Latest (limited feature set)

Last updated: 2026-02-20 | Source: Cross-IDE Compatibility Findings
