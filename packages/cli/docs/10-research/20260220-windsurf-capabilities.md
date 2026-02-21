# Research: Windsurf IDE Capabilities (February 2026)

**Date**: 2026-02-20
**Researcher**: RESEARCH Agent
**Status**: Active

## Summary

Windsurf is an AI-native IDE with Cascade (its agentic AI assistant) that supports multi-file reasoning, autonomous task execution, MCP integration (100 tool limit), Workflows (12,000 char limit), Rules (6,000 char limit), and Hooks for automation. It has Arena Mode for model comparison and Plan Mode for structured planning, but lacks true multi-agent delegation like Claude Code's subagent system—instead using subagents for specific tasks like context retrieval (Fast Context).

## Key Findings

1. **Cascade AI Agent**: Windsurf's native AI, capable of multi-file reasoning, autonomous multi-step task execution, real-time awareness of edits/terminal commands, and integration with multiple tools (Search, Analyze, Web Search, MCP, terminal).

2. **No True Subagent Delegation**: While Windsurf uses subagents for specific tasks (e.g., Fast Context for parallel context retrieval via SWE-grep models), it does **not** have native multi-agent coordination or delegation like Claude Code. Main agent cannot spawn/delegate to custom subagents—only system subagents exist.

3. **Agent/Subagent Definition Via AGENTS.md**: Directory-scoped instruction files (AGENTS.md) provide context-aware guidance to Cascade based on file location. Plain markdown, no frontmatter. Enables hierarchical scoping but does **not** create new agents—only provides instructions to existing Cascade.

4. **Workflows (12,000 char/file)**: Stored in `.windsurf/workflows/`, invoked via `/[workflow-name]` slash commands. Markdown format with title, description, and step-by-step instructions. Can chain other workflows. Limited to 12,000 characters per file.

5. **Rules & Global Rules (6,000 char/file)**: `.windsurfrules` at project root + `global_rules.md` in `~/.codeium/windsurf/memories/`. Each rule file limited to 6,000 characters. Rules provide persistent, reusable instructions accessible via Cascade Chat and Quick Search.

6. **No AskUserQuestion Equivalent**: Windsurf does **not** have a native structured choice menu feature like Claude Code's AskUserQuestion. Interaction is text-only prompting in chat/code modes; users provide natural language input or use @ mentions to include files.

7. **MCP (Model Context Protocol)**: Full support with 100 tool limit per session. Configured via `~/.codeium/windsurf/mcp_config.json`. Supports stdio, HTTP, SSE transports with OAuth. Cascade can access tools, resources, and prompts from MCP servers.

8. **Hooks/Automation**: Cascade Hooks enable shell command execution at key workflow points. Supported events: pre_read_code, post_read_code, pre_write_code, post_write_code, pre_run_command, post_run_command, pre_mcp_tool_use, post_mcp_tool_use, pre_user_prompt. Pre-hooks can block actions (exit code 2). Shell-based (Bash, Python, Node.js).

9. **Arena Mode**: Side-by-side comparison of two Cascade agents running the same prompt with hidden model identities. Users vote on preferred output; votes feed into personal and global model leaderboards. Supports synchronous or branching conversations.

10. **Plan Mode & Megaplan**: Plan Mode focuses on task planning with clarifying questions and structured plan generation before code execution. Type "megaplan" for extra-thorough interactive planning. Compatible with Arena Mode. Auto-switches to Code Mode when implementation begins.

11. **Skills System (SKILL.md)**: Windsurf supports Agent Skills standard (open standard as of Dec 2025, adopted by Claude Code, Cursor, GitHub Copilot, Gemini CLI). Skills stored at project-level (`.windsurf/skills/SKILL.md`) or globally (`~/.codeium/windsurf/skills/SKILL.md`). Format: YAML frontmatter + markdown instructions.

12. **Cascade File Operations**: Can view, edit, create files. Access restricted via `.codeiumignore` (like .gitignore). Auto-detects required packages and installs them. Web search functionality built-in for gathering current information.

13. **Terminal & Tool Calls**: 20 tool calls per prompt limit (continue button if exceeded). Can identify tools in use, determine installation requirements, and run projects autonomously when instructed.

14. **No Native Task Tracking**: Windsurf does **not** have native task tracking. Third-party integrations (e.g., Shrimp Task Manager via MCP) exist but not part of core IDE.

15. **12,000 Character Limit**: Applies specifically to Workflow files (`.windsurf/workflows/`). Rules files have separate 6,000 character limit.

## Recommended Approach

**For AgileFlow**: Windsurf is comparable to Claude Code in IDE agent capabilities but lacks true subagent delegation. Key differences from Claude Code:

- **Use Windsurf if**: You need Plan Mode for structured planning, Arena Mode for model selection, or prefer Workflow-based automation.
- **Use Claude Code if**: You need true multi-agent coordination, subagent spawning, or AskUserQuestion for structured UI interactions.

For integration/comparison purposes, research how Windsurf's Workflows and Hooks might map to Claude Code's equivalent patterns. Windsurf's 100-tool MCP limit is higher than typical Claude Code limits.

## Implementation Steps

1. Document Windsurf's Hooks as equivalent to Claude Code's pre/post hooks (though shell-based vs. Node.js-based)
2. Map Windsurf Workflows to Claude Code's Agent Protocol for comparison
3. Note MCP tool limit (100) when evaluating cross-IDE compatibility
4. Identify gaps: No structured UI choice menus, no subagent delegation, no native task tracking in Windsurf

## Risks & Considerations

- **Subagent Gap**: Windsurf's Fast Context subagent is system-controlled, not user-defined. Cannot build custom multi-agent systems like Claude Code's subagent framework.
- **UI Limitations**: No equivalent to AskUserQuestion means complex workflows rely on natural language prompts, which may reduce precision for structured task delegation.
- **Task Tracking**: Third-party solutions required; no native support could complicate project management integration.
- **Character Limits**: 12,000 char workflow + 6,000 char rules limits mean complex multi-step automations must be split across files.

## Trade-offs

| Aspect | Windsurf | Claude Code | Notes |
|--------|----------|-------------|-------|
| **Subagents** | System-defined Fast Context only | True multi-agent with user-defined subagents | Windsurf lacks delegation framework |
| **Structured UI** | Text-only prompts | AskUserQuestion menus | Claude Code more precise for complex flows |
| **MCP Tools** | 100 tool limit | Lower (varies by model) | Windsurf more generous |
| **Hooks** | Shell-based (9 events) | Node.js-based (pre/post) | Both support pre-blocking |
| **Task Tracking** | Via third-party MCP | Via third-party or native agileflow | Neither has native support |
| **Planning** | Plan Mode + Megaplan | Plan Mode (agent-driven) | Windsurf's interactive planning stronger |
| **Automation** | Workflows (12K char) | Scripts (unlimited) | Claude Code more flexible |

## Sources

- [Cascade | Windsurf](https://windsurf.com/cascade) - Retrieved 2026-02-20
- [Windsurf Docs - Cascade Overview](https://docs.windsurf.com/windsurf/cascade/cascade) - Retrieved 2026-02-20
- [Windsurf Docs - Cascade Hooks](https://docs.windsurf.com/windsurf/cascade/hooks) - Retrieved 2026-02-20
- [Windsurf Docs - Workflows](https://docs.windsurf.com/windsurf/cascade/workflows) - Retrieved 2026-02-20
- [Windsurf Docs - Cascade Skills](https://docs.windsurf.com/windsurf/cascade/skills) - Retrieved 2026-02-20
- [Windsurf Docs - MCP Integration](https://docs.windsurf.com/windsurf/cascade/mcp) - Retrieved 2026-02-20
- [Windsurf Docs - Arena Mode](https://docs.windsurf.com/windsurf/cascade/arena) - Retrieved 2026-02-20
- [Windsurf Docs - AGENTS.md](https://docs.windsurf.com/windsurf/cascade/agents-md) - Retrieved 2026-02-20
- [InfoQ - Windsurf Introduces Arena Mode](https://www.infoq.com/news/2026/02/windsurf-arena-mode/) - Retrieved 2026-02-20
- [Windsurf Blog - Wave 14: Arena Mode](https://windsurf.com/blog/windsurf-wave-14) - Retrieved 2026-02-20
- [Windsurf Review 2026 - DataCamp](https://www.datacamp.com/tutorial/windsurf-ai-agentic-code-editor) - Retrieved 2026-02-20
- [Agent Skills | agentskills.help](https://agentskills.help/en/docs/windsurf) - Retrieved 2026-02-20

## Related

- ADRs: None yet (consider ADR for "Multi-agent orchestration: Claude Code subagents vs Windsurf Workflows")
- Stories: None yet
- Epics: None yet

## Notes

**Key Clarifications**:
- Windsurf's "subagents" (Fast Context) are **system-managed**, not user-defined. Users cannot create custom subagents or spawn independent agents.
- AGENTS.md provides **instruction scoping**, not agent creation. It guides the single Cascade agent based on directory context.
- Plan Mode is **interactive and structured**, distinct from Claude Code's Plan Mode which is agent-driven.
- The 12,000 character limit applies to **Workflow files only**; Rules files have a separate 6,000 character limit.
- Windsurf Hooks are **shell-based**, making them language-agnostic but less integrated with JavaScript/Node.js ecosystems than Claude Code hooks.

**Future Research Needed**:
- Deep dive on Fast Context architecture (SWE-grep) and how it compares to Claude Code's subagent framework
- Detailed comparison of Windsurf Workflows vs Claude Code Scripts for automation
- Evaluation of Windsurf's Arena Mode impact on model selection for AgileFlow
- Analysis of MCP tool discovery and caching mechanisms across IDEs
