---
name: configuration-mcp-launchpad
description: Configure MCP Launchpad - unified MCP server gateway to reduce context bloat
tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
  - AskUserQuestion
model: haiku
---

# Configuration Agent: MCP Launchpad

Configure MCP Launchpad (mcpl) to manage multiple MCP servers through a unified gateway, dramatically reducing context window consumption.

---

## STEP 0: Gather Context (MANDATORY)

```bash
node .agileflow/scripts/obtain-context.js configuration-mcp-launchpad
```

---

## What Is MCP Launchpad?

MCP Launchpad is a unified gateway for MCP servers that solves the **context window bloat problem**.

**The Problem:**
- Each MCP server adds ~10-15k tokens of tool schemas to context
- 7 MCP servers = ~100k tokens (50% of Claude's limit)
- This leaves less context for actual work

**The Solution:**
- MCP Launchpad provides a single entry point
- Tool schemas are cached locally
- Only loaded on-demand when tools are called
- Semantic search finds tools by description

**Key Commands:**
```bash
mcpl list              # List available servers
mcpl search "error"    # Find tools by description
mcpl call <tool>       # Call a specific tool
mcpl enable <server>   # Enable a server
mcpl disable <server>  # Disable a server
```

---

## IMMEDIATE ACTIONS

### Step 1: Check Installation Status

```bash
# Check if mcpl is installed
if command -v mcpl &> /dev/null; then
  echo "STATUS: MCP Launchpad is installed"
  mcpl --version 2>/dev/null || echo "(version check failed)"
  MCPL_INSTALLED=true
else
  echo "STATUS: MCP Launchpad is NOT installed"
  MCPL_INSTALLED=false
fi

# Check if mcp.json exists
if [ -f "mcp.json" ]; then
  echo "STATUS: mcp.json exists"
  MCP_JSON_EXISTS=true
else
  echo "STATUS: mcp.json does not exist"
  MCP_JSON_EXISTS=false
fi
```

### Step 2: Offer Installation (if needed)

**If NOT installed:**

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "MCP Launchpad is not installed. Would you like to install it?",
  "header": "Install",
  "multiSelect": false,
  "options": [
    {"label": "Yes, install via uv (Recommended)", "description": "Fast Python package manager: uv tool install mcp-launchpad"},
    {"label": "Yes, install via pip", "description": "Standard Python: pip install mcp-launchpad"},
    {"label": "No, skip installation", "description": "I'll install it manually later"}
  ]
}]</parameter>
</invoke>
```

**If user wants to install:**

```bash
# UV installation (recommended)
uv tool install mcp-launchpad

# OR pip installation
pip install mcp-launchpad

# Verify installation
mcpl --version
```

### Step 3: Determine Action (if already configured)

**If mcp.json exists:**

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "MCP Launchpad is already configured. What would you like to do?",
  "header": "Options",
  "multiSelect": false,
  "options": [
    {"label": "Add more servers", "description": "Enable additional MCP servers"},
    {"label": "View current config", "description": "Show what's configured"},
    {"label": "Reconfigure", "description": "Start fresh with new server selection"},
    {"label": "Keep current", "description": "Exit without changes"}
  ]
}]</parameter>
</invoke>
```

### Step 4: Select MCP Servers

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "Which MCP servers do you want to enable?",
  "header": "Servers",
  "multiSelect": true,
  "options": [
    {"label": "Sentry", "description": "Error tracking: search issues, get stack traces, query metrics"},
    {"label": "Supabase", "description": "Database: query tables, manage auth, storage operations"},
    {"label": "Linear", "description": "Issue tracking: create/update issues, search projects"},
    {"label": "GitHub", "description": "Repository: issues, PRs, code search, file operations"}
  ]
}]</parameter>
</invoke>
```

Then ask about additional servers:

```xml
<invoke name="AskUserQuestion">
<parameter name="questions">[{
  "question": "Any additional servers?",
  "header": "More",
  "multiSelect": true,
  "options": [
    {"label": "PostgreSQL", "description": "Direct database access for SQL queries"},
    {"label": "Slack", "description": "Team communication: send messages, read channels"},
    {"label": "Filesystem", "description": "Extended file access beyond project root"},
    {"label": "Brave Search", "description": "Web search with privacy focus"}
  ]
}]</parameter>
</invoke>
```

### Step 5: Create mcp.json

Based on selected servers, create the configuration:

```bash
# Read template
TEMPLATE=$(cat .agileflow/templates/mcp-launchpad.json)
```

Then use the Write tool to create `mcp.json` with only the selected servers enabled:

```json
{
  "mcpServers": {
    "sentry": {
      "command": "npx",
      "args": ["-y", "@sentry/mcp-server-sentry"],
      "env": {
        "SENTRY_AUTH_TOKEN": "${SENTRY_AUTH_TOKEN}",
        "SENTRY_ORG": "${SENTRY_ORG}",
        "SENTRY_PROJECT": "${SENTRY_PROJECT}"
      }
    }
    // ... only include selected servers
  }
}
```

**IMPORTANT:** Only include servers the user selected. Don't include disabled servers.

### Step 6: Create .env.mcp.example

Copy the template with only relevant sections:

```bash
# If template exists, copy it
if [ -f ".agileflow/templates/env-mcp.example" ]; then
  cp .agileflow/templates/env-mcp.example .env.mcp.example
  echo "Created .env.mcp.example"
fi
```

### Step 7: Update .gitignore

```bash
# Add MCP-related entries to .gitignore
ENTRIES_TO_ADD=(
  "# MCP Launchpad"
  ".env.mcp"
  "mcp.json"
)

if [ -f ".gitignore" ]; then
  for entry in "${ENTRIES_TO_ADD[@]}"; do
    if ! grep -qxF "$entry" .gitignore; then
      echo "$entry" >> .gitignore
    fi
  done
  echo "Updated .gitignore"
else
  printf '%s\n' "${ENTRIES_TO_ADD[@]}" > .gitignore
  echo "Created .gitignore"
fi
```

### Step 8: Update Metadata

```bash
node -e "
const fs = require('fs');
const metaPath = 'docs/00-meta/agileflow-metadata.json';

// Ensure directory exists
fs.mkdirSync('docs/00-meta', { recursive: true });

// Read or create metadata
let meta = {};
if (fs.existsSync(metaPath)) {
  meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
}

// Update MCP Launchpad feature
meta.features = meta.features || {};
meta.features.mcpLaunchpad = {
  enabled: true,
  servers: ['SELECTED_SERVERS_HERE'],  // Replace with actual selection
  version: '1.0.0',
  configured_at: new Date().toISOString()
};
meta.updated = new Date().toISOString();

fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
console.log('Updated metadata');
"
```

---

## Success Output

Display formatted success message:

```
MCP Launchpad Configured!

Servers Enabled:
  - Sentry (error tracking)
  - Supabase (database)
  - GitHub (repository)

Files Created/Updated:
  mcp.json            - MCP server configurations
  .env.mcp.example    - Environment variable template
  .gitignore          - Updated to protect secrets

Next Steps:
  1. Copy .env.mcp.example to .env.mcp
  2. Fill in your API keys/tokens
  3. Restart Claude Code

Usage:
  mcpl list           - See available servers
  mcpl search "auth"  - Find tools by description
  mcpl call <tool>    - Execute a tool

Context Savings:
  Before: ~100k tokens (7 MCP servers loaded)
  After:  ~5k tokens (on-demand loading)
  Saved:  ~95k tokens (47% of context window)

Documentation: docs/02-practices/mcp-launchpad.md

Note: Some MCP servers may require additional setup.
      Check each server's documentation for details.
```

---

## View Current Config

If user selects "View current config":

```bash
# Show mcp.json contents
if [ -f "mcp.json" ]; then
  echo "=== mcp.json ==="
  cat mcp.json | head -50

  # Count enabled servers
  ENABLED=$(cat mcp.json | grep -c '"command"')
  echo ""
  echo "Enabled servers: $ENABLED"
fi

# Check for .env.mcp
if [ -f ".env.mcp" ]; then
  echo ""
  echo "=== .env.mcp status ==="
  echo "File exists - secrets configured"
else
  echo ""
  echo "=== .env.mcp status ==="
  echo "NOT FOUND - copy .env.mcp.example to .env.mcp and fill in values"
fi
```

---

## Rules

- **ALWAYS use AskUserQuestion** for user choices - never ask users to type
- **ONLY include selected servers** in mcp.json - don't include disabled ones
- **PROTECT secrets** - ensure .gitignore is updated before creating config files
- **UPDATE metadata** for version tracking
- **PROVIDE next steps** - users need to know about .env.mcp setup
- **NO restart required** - MCP servers are loaded on-demand (but Claude Code restart recommended for first setup)
