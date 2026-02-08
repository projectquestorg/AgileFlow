---
description: Start Dashboard WebSocket server for real-time UI communication
argument-hint: "[OPTIONS: --port 8765 --api-key KEY --tunnel]"
compact_context:
  priority: medium
  preserve_rules:
    - "ACTIVE COMMAND: /agileflow:serve - Dashboard WebSocket server"
    - "Server provides real-time communication for Cloud Dashboard"
    - "Default port: 8765, binds to 0.0.0.0"
  state_fields:
    - server_running
    - server_port
    - tunnel_url
---

# serve

Start the AgileFlow Dashboard WebSocket server for real-time communication with the Cloud Dashboard UI.

---

## Overview

The serve command starts a WebSocket server that the AgileFlow Dashboard connects to for real-time features: chat streaming, git operations, terminal access, and automation management.

**Key Features**:
- **WebSocket protocol**: Real-time bidirectional communication with dashboard
- **Claude CLI bridge**: Streaming text deltas and tool call forwarding
- **Git integration**: Status, diff, commit, branch operations via WebSocket
- **Terminal channels**: Remote terminal sessions scoped to project directory
- **Automation runner**: Trigger and monitor automations from the dashboard
- **Auth support**: Optional API key authentication for secure connections
- **Tunnel support**: ngrok integration for remote access

---

## Usage

### Start with Default Settings

```
/agileflow:serve
```

Starts the WebSocket server on port 8765, binding to 0.0.0.0.

### Start with Custom Port and Auth

```
/agileflow:serve --port 9000 --api-key agf_secret123
```

### Start with Tunnel for Remote Access

```
/agileflow:serve --tunnel
```

Starts ngrok tunnel for remote dashboard connections (requires ngrok installed).

---

## Options

| Option | Short | Default | Description |
|--------|-------|---------|-------------|
| `--port` | `-p` | `8765` | Port to listen on |
| `--host` | `-h` | `0.0.0.0` | Host to bind to |
| `--api-key` | `-k` | none | API key for authentication |
| `--require-auth` | | `false` | Require API key for connections |
| `--tunnel` | `-t` | `false` | Start ngrok tunnel |

---

## Prompt

ROLE: Dashboard Server Manager

Run the dashboard WebSocket server using the installed script:

```bash
node .agileflow/scripts/dashboard-serve.js [OPTIONS]
```

**Pass through any user-provided options** (--port, --api-key, --tunnel, etc.) directly to the script.

WORKFLOW:

1. **Start the server**:
   ```bash
   node .agileflow/scripts/dashboard-serve.js --port 8765
   ```

2. **Report the connection URL** to the user:
   - Local: `ws://localhost:<port>`
   - If tunnel enabled: the ngrok URL

3. **Keep the server running** - it runs in the foreground. The user can stop it with Ctrl+C.

4. If the user specifies `--api-key`, pass it through:
   ```bash
   node .agileflow/scripts/dashboard-serve.js --port 8765 --api-key agf_secret123
   ```

5. If the user specifies `--tunnel`, pass it through:
   ```bash
   node .agileflow/scripts/dashboard-serve.js --tunnel
   ```

---

## Dashboard Connection

Once the server is running, the Cloud Dashboard connects via WebSocket:

1. Open the AgileFlow Dashboard
2. Enter the connection URL: `ws://localhost:8765` (or tunnel URL)
3. If auth is enabled, provide the API key
4. Dashboard receives real-time updates for chat, git, terminal, and automations

---

## Related Commands

- `/agileflow:api` - REST API server (read-only state exposure)
- `/agileflow:session:status` - View current session state
- `/agileflow:board` - Visual kanban board
