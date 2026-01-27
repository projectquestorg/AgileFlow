# MCP Launchpad - Context-Preserving Tool Gateway

**Import Date**: 2026-01-24
**Topic**: MCP Launchpad CLI for managing MCP servers without context overhead
**Source**: YouTube video transcript (direct import)
**Content Type**: transcript

---

## Summary

MCP Launchpad is a CLI tool that solves the critical problem of MCP servers consuming excessive context window space in Claude Code. When connecting multiple MCP servers directly to Claude, each server's tool definitions can consume significant tokens - the author demonstrates 7 MCP servers consuming ~100,000 tokens (50% of Claude's 200,000 token limit). This approach doesn't scale and degrades agent performance due to "context rot" - irrelevant information dilutes important context.

The solution is a unified CLI gateway (`mcpl`) that all MCP servers connect to. Claude Code only needs minimal context about the launchpad in CLAUDE.md, then discovers and uses tools on-demand through progressive disclosure. This preserves 100% of the context window while still providing access to dozens of MCP servers with thousands of tools. The tool uses BM25 semantic search to help Claude find relevant tools without manually navigating hierarchical menus.

The author has been using MCP Launchpad in production for weeks with Linear, Sentry, Supabase, Render, and other MCP servers - enabling Claude to autonomously work through issue backlogs, query databases, and debug errors.

---

## Key Findings

- **Context window problem**: 7 MCP servers consume ~100,000 tokens (50% of 200k limit)
- **Context rot**: Agent performance degrades as context fills, especially with irrelevant information (citing Chroma research paper)
- **Progressive disclosure**: Claude only needs tool context AFTER deciding to use a specific tool
- **Unified gateway**: One CLI tool (`mcpl`) routes to all MCP servers
- **BM25 semantic search**: Find tools by task description, not hierarchical navigation
- **Tool caching**: Connect once, browse tools locally without reconnecting
- **Priority system**: Project-level configs override global configs
- **Minimal system prompt**: Only ~small overview in CLAUDE.md needed

---

## Implementation Approach

1. **Install MCP Launchpad** via UV:
   ```bash
   uv tool install mcp-launchpad
   ```

2. **Configure MCP servers** in `mcp.json` (not `.mcp.json` to avoid Claude Code collision):
   - Project-level: `./mcp.json`
   - Global: `~/.cloud/mcp.json`

3. **Set environment variables** in corresponding `.env` file:
   - Use `${SECRET_NAME}` notation in configs
   - `.env` auto-loaded by launchpad

4. **Cache tools** on first use:
   ```bash
   mcpl list --refresh
   ```

5. **Add minimal context** to CLAUDE.md describing the launchpad

6. **Use commands**:
   - `mcpl list` - List servers
   - `mcpl list <server>` - List tools in server
   - `mcpl inspect <server> <tool>` - Full tool schema
   - `mcpl search <term>` - BM25 semantic search
   - `mcpl config` - View configuration
   - `mcpl enable/disable <server>` - Toggle servers

---

## Code Snippets

### Installation
```bash
uv tool install mcp-launchpad
```

### Verify Installation
```bash
mcpl
```

### List and Cache Tools
```bash
mcpl list --refresh
```

### Search for Tools
```bash
mcpl search SQL
mcpl search issues
```

### Inspect Tool Schema
```bash
mcpl inspect render get_service
```

### Example MCP Config
```json
{
  "mcpServers": {
    "render": {
      "command": "...",
      "args": ["..."],
      "env": {
        "API_KEY": "${RENDER_API_KEY}"
      }
    }
  }
}
```

---

## Action Items

- [ ] Install MCP Launchpad via `uv tool install mcp-launchpad`
- [ ] Create global `~/.cloud/mcp.json` with all MCP server configs
- [ ] Create `~/.cloud/.env` with required API keys
- [ ] Run `mcpl list --refresh` to cache tools
- [ ] Add MCP Launchpad overview to global CLAUDE.md
- [ ] Test with `mcpl search` to verify semantic search works
- [ ] Migrate existing MCP server connections to the launchpad

---

## Risks & Gotchas

- **Naming convention**: Use `mcp.json` NOT `.mcp.json` to avoid collision with Claude Code's direct MCP configuration
- **UV required**: Must have Python and UV installed first
- **Cache staleness**: Run `--refresh` after adding new servers or tools
- **Priority system**: Project configs override global - be aware of precedence
- **Environment variables**: Must use `${VAR}` notation and provide matching `.env`

---

## Story Suggestions

### Potential Epic: Integrate MCP Launchpad with AgileFlow

**US-XXXX**: Add MCP Launchpad to AgileFlow configuration wizard
- AC: `/agileflow:configure` offers MCP Launchpad setup option
- AC: Generates mcp.json template with common servers
- AC: Creates .env template with placeholder secrets

**US-XXXX**: Document MCP Launchpad usage in AgileFlow
- AC: Add practice doc explaining context preservation benefits
- AC: Include example CLAUDE.md section for the launchpad

---

## References

- Source: YouTube video transcript (direct import)
- Import date: 2026-01-24
- Related: Context engineering, MCP servers, Claude Code optimization
