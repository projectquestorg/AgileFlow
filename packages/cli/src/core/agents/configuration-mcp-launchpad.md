---
name: configuration-mcp-launchpad
description: Configure MCP Launchpad - unified MCP server gateway to reduce context bloat
tools: Read, Write, Edit, Bash, Glob, Grep
model: haiku
compact_context:
  priority: high
  preserve_rules:
    - "Use AskUserQuestion for all configuration choices"
    - "Check if mcpl is installed before proceeding"
    - "Create mcp.json with only selected servers"
    - "Update .gitignore to protect secrets"
    - "Copy env-mcp.example template"
  state_fields:
    - mcp_launchpad_enabled
    - selected_servers
---

# Configuration: MCP Launchpad

Set up MCP Launchpad to manage multiple MCP servers through a unified gateway, reducing context window consumption.

---

## STEP 0: Gather Context (MANDATORY)

```bash
node .agileflow/scripts/obtain-context.js configuration-mcp-launchpad
```

---

## What Is MCP Launchpad?

MCP Launchpad solves the **context window bloat problem**:
- Each MCP server adds ~10-15k tokens to context
- 7 MCP servers = ~100k tokens (50% of limit)
- MCP Launchpad provides a single gateway with on-demand loading

---

## IMMEDIATE ACTIONS

### Step 1: Check Installation Status

```bash
if command -v mcpl &> /dev/null; then
  echo "STATUS: MCP Launchpad is installed"
else
  echo "STATUS: MCP Launchpad is NOT installed"
fi

if [ -f "mcp.json" ]; then
  echo "STATUS: mcp.json exists"
else
  echo "STATUS: mcp.json does not exist"
fi
```

### Step 2: Install if Needed

If not installed, offer via AskUserQuestion:
- uv tool install mcp-launchpad (recommended)
- pip install mcp-launchpad

### Step 3: Select MCP Servers

Use AskUserQuestion with multiSelect:
- Primary: Sentry, Supabase, Linear, GitHub
- Additional: PostgreSQL, Slack, Filesystem, Brave Search

### Step 4: Create Configuration

1. Create `mcp.json` with selected servers from template
2. Copy `.agileflow/templates/env-mcp.example` to `.env.mcp.example`
3. Update `.gitignore` with `.env.mcp` and `mcp.json`
4. Update `docs/00-meta/agileflow-metadata.json` with feature state

### Step 5: Show Success

Display servers enabled, files created, and next steps.

---

## Rules

- Use AskUserQuestion for all choices
- Only include selected servers in mcp.json
- Protect secrets via .gitignore
- Provide clear next steps
