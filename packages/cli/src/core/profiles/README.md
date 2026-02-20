# IDE Capability Profiles

IDE-agnostic capability declarations for AgileFlow's multi-IDE support strategy.

## Overview

This directory contains one YAML profile per supported IDE. Each profile declares:
- Supported capabilities (plan mode, hooks, task tracking, MCP, etc.)
- Config directory structure and paths
- Tool name mappings (how each IDE names equivalent functions)
- Frontmatter formats for commands/agents
- Limitations and workarounds

## Design Philosophy

**Capability profiles separate declarations from implementation.** Instead of baking IDE differences into generators, prompts, or installers, we declaratively describe what each IDE supports. This enables:

1. **Build-time generation** - Generators read profiles and produce IDE-native output
2. **Feature detection** - Commands can check IDE capabilities at install time
3. **Graceful fallbacks** - Prompts suggest alternatives when features unavailable
4. **Extensibility** - Adding new IDEs requires only a new YAML file, not code changes

## Files

### claude-code.yaml
**Primary target.** Anthropic's CLI-based environment with full support for:
- Structured interactive input (AskUserQuestion)
- True sub-agent spawning with nesting (Task tool)
- Plan mode with programmatic control
- Persistent task tracking (TaskCreate/Update)
- Comprehensive hooks (SessionStart, PreToolUse, PostToolUse)
- Unlimited MCP tools

**Key paths:**
- Commands: `.claude/commands/agileflow/`
- Agents: `.claude/agents/agileflow/`
- Instructions: `CLAUDE.md`

### cursor.yaml
**Closest competitor to Claude Code.** v2.5 (Feb 2026) now supports:
- Async subagents with nesting (no Task tool needed)
- Plan mode with native interface
- 6 lifecycle hooks (beta)
- 40-tool MCP limit (binding constraint)
- Native browser tool

**Gaps:**
- No structured menus (conversational only)
- No persistent task tracking
- No background sub-agent execution

**Key paths:**
- Commands: `.cursor/commands/`
- Agents: `.cursor/agents/`
- Rules: `.cursor/rules/` (MDC format)
- MCP config: `.cursor/mcp.json`

### windsurf.yaml
**Most comprehensive hooks (11 events).** Wave 13+ with:
- Native worktrees (up to 20 per workspace)
- 11 lifecycle hook events
- 100-tool MCP limit
- Native browser preview (in-IDE)

**Gaps:**
- No true sub-agent spawning (use workflow chaining or cascades)
- 12,000 character limit per workflow file
- Global-only MCP config (`~/.codeium/windsurf/mcp_config.json`)
- No persistent task tracking
- Conversational input only

**Key paths:**
- Workflows: `.windsurf/workflows/`
- Skills: `.windsurf/skills/*/SKILL.md` (agentskills.io spec)
- Rules: `.windsurf/rules/`
- MCP config: `~/.codeium/windsurf/mcp_config.json` (global-only)

### codex.yaml
**Most restrictive.** OpenAI's CLI with:
- Skills (no direct file tools)
- Sandbox modes (read-only, auto, full-access)
- Text-only user input (no structured menus)

**Gaps:**
- No plan mode
- No hooks
- No sub-agent delegation
- No task tracking
- No MCP

## Usage

### For Installers
```javascript
const profile = require('./profiles/claude-code.yaml');
if (profile.capabilities.core.planMode) {
  installPlanModePrompts();
}
```

### For Generators
```javascript
// Read profile to generate IDE-native commands
const generator = new CommandGenerator(profile);
const ideSpecificMarkdown = generator.transform(canonicalCommand);
```

### For Feature Detection
```javascript
// Check if IDE supports a feature
if (!profile.capabilities.collaboration.taskTracking) {
  console.warn('Task tracking not available in this IDE');
  suggestFileBasedAlternative();
}
```

## Capability Categories

### Core Capabilities
- **fileOperations** - Read, write, edit files
- **shell** - Execute shell commands
- **fileSearch** - Glob and grep
- **interactiveInput** - Structured user menus (structured vs conversational)
- **subAgents** - Spawn sub-agents/skills
- **nestedSubAgents** - Sub-agents can spawn other sub-agents

### Planning
- **planMode** - Explicit planning phase
- **planModeEditable** - Plans can be edited during execution

### Lifecycle
- **hooks** - Pre/post execution hooks
- **hookEvents** - List of specific hook events supported

### External Integration
- **webSearch** - Internet search capability
- **webFetch** - Fetch URLs
- **mcp** - Model Context Protocol support
- **mcpToolLimit** - Max tools per MCP (0 = unlimited)
- **browser** - Screenshot/browser automation

### Collaboration
- **taskTracking** - Persistent task tracking
- **persistentTasks** - Tasks survive across sessions
- **worktrees** - Git worktree support

## MCP Tool Limits

| IDE | Tool Cap | Notes |
|---|---|---|
| Claude Code | Unlimited (0) | Can install entire ecosystem |
| Cursor | 40 | Hard limit; binding constraint for multi-IDE |
| Windsurf | 100 | Good balance |
| Codex | Unlimited (0) | Via MCP extension |

**Design decision**: Cap multi-IDE MCP installations at 40 tools (Cursor's limit) to ensure compatibility across all platforms.

## Implementation Priority

| Tier | Capabilities | IDEs | Status |
|---|---|---|---|
| 1 | File ops, shell, search, web | All | Ready |
| 2 | Hooks, plan mode | Claude Code, Cursor, Windsurf | Profiles complete |
| 3 | Sub-agents, task tracking | Claude Code, Cursor | Profiles complete |
| 4 | Worktrees, MCP | All | Profiles complete |

## Next Steps

1. **Validators** - Build validators to check profile format/completeness
2. **Loaders** - Create load functions (YAML → JS objects) with caching
3. **Generators** - Build content transformers that read profiles and output IDE-native prompts
4. **Tests** - Snapshot tests per IDE profile
5. **Documentation** - ADR-0011 documenting the capability profile strategy

## References

- Cross-IDE Compatibility Findings: `docs/10-research/20260220-ide-cross-compatibility-findings.md`
- ADR-0011 (TBD): Capability Profile Strategy
