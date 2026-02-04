---
description: Start REST API server to expose AgileFlow state
argument-hint: ACTION=start|stop|status [PORT=3456]
compact_context:
  priority: medium
  preserve_rules:
    - "ACTIVE COMMAND: /agileflow:api - REST API server for state exposure"
    - "API is READ-ONLY (no mutations through API)"
    - "Default port: 3456, localhost only"
  state_fields:
    - server_running
    - server_port
    - server_pid
---

# api

Start, stop, or check status of the AgileFlow REST API server.

---

## Overview

The API server exposes AgileFlow state (sessions, status, tasks, bus messages) via REST endpoints for external GUI integrations like dashboards.

**Key Principles**:
- **READ-ONLY**: API exposes state but never mutates it (writes go through CLI)
- **JSON source of truth**: All data comes from existing JSON files
- **Localhost-only**: Binds to 127.0.0.1 by default for security

---

## Usage

### Start the API Server

```
/agileflow:api ACTION=start [PORT=3456]
```

Starts the REST API server on the specified port (default: 3456).

### Stop the API Server

```
/agileflow:api ACTION=stop
```

Stops the running API server.

### Check Server Status

```
/agileflow:api ACTION=status
```

Shows whether the server is running and on which port.

---

## Available Endpoints

Once the server is running, these endpoints are available:

| Endpoint | Description |
|----------|-------------|
| `GET /api` | API information and available endpoints |
| `GET /api/health` | Health check |
| `GET /api/sessions` | List active sessions |
| `GET /api/sessions/:id` | Get session by ID |
| `GET /api/status` | Get status.json (epics/stories state) |
| `GET /api/tasks` | List tasks (filterable) |
| `GET /api/tasks/:id` | Get task by ID |
| `GET /api/bus/messages` | Get bus messages (paginated) |
| `GET /api/metrics` | Aggregated metrics |
| `GET /api/epics` | List epics |
| `GET /api/epics/:id` | Get epic by ID |
| `GET /api/stories` | List stories (filterable) |
| `GET /api/stories/:id` | Get story by ID |

### Query Parameters

**GET /api/tasks**:
- `state`: Filter by state (queued, running, completed, failed, blocked)
- `story_id`: Filter by story ID
- `subagent_type`: Filter by agent type

**GET /api/bus/messages**:
- `limit`: Max messages to return (default: 100)
- `offset`: Skip first N messages
- `story_id`: Filter by story ID
- `from`: Filter by sender agent
- `since`: Filter by timestamp (ISO string)

**GET /api/stories**:
- `status`: Filter by status
- `epic_id`: Filter by epic ID
- `owner`: Filter by owner

---

## Prompt

ROLE: API Server Manager

INPUTS:
- ACTION=start|stop|status (required)
- PORT=<number> (optional, default: 3456)

ACTIONS:

**For ACTION=start**:
1. Check if server is already running (check `.agileflow/api-server.pid`)
2. If running, report existing server URL
3. If not running:
   - Create the API server script
   - Start server in background
   - Save PID to `.agileflow/api-server.pid`
   - Report server URL

**For ACTION=stop**:
1. Check `.agileflow/api-server.pid` for running server
2. If running, kill the process
3. Remove PID file
4. Report success

**For ACTION=status**:
1. Check `.agileflow/api-server.pid`
2. If PID file exists, check if process is alive
3. Report running/stopped status with URL if running

---

## Implementation

### Start Server

```bash
# Check for existing server
if [ -f ".agileflow/api-server.pid" ]; then
  PID=$(cat .agileflow/api-server.pid)
  if kill -0 "$PID" 2>/dev/null; then
    echo "API server already running on PID $PID"
    echo "URL: http://127.0.0.1:${PORT:-3456}/api"
    exit 0
  fi
fi

# Start server
node -e "
const { createApiServer, startApiServer } = require('./.agileflow/scripts/lib/api-server-runner');
const server = createApiServer({ port: ${PORT:-3456} });
startApiServer(server).then(({ url }) => {
  console.log('API server started at ' + url);
}).catch(err => {
  console.error('Failed to start:', err.message);
  process.exit(1);
});
" &

# Save PID
echo $! > .agileflow/api-server.pid
```

### API Server Runner Script

Create `.agileflow/scripts/lib/api-server-runner.js`:

```javascript
const { createApiServer, startApiServer, stopApiServer } = require('../../lib/api-server');

// Re-export for CLI usage
module.exports = { createApiServer, startApiServer, stopApiServer };

// If run directly, start server
if (require.main === module) {
  const port = parseInt(process.env.PORT || '3456', 10);
  const server = createApiServer({ port });

  startApiServer(server).then(({ url }) => {
    console.log(`AgileFlow API running at ${url}`);
    console.log('Press Ctrl+C to stop');
  }).catch(err => {
    console.error('Failed to start server:', err.message);
    process.exit(1);
  });

  // Handle shutdown
  process.on('SIGINT', async () => {
    console.log('\nShutting down...');
    await stopApiServer(server);
    process.exit(0);
  });
}
```

---

## Expected Output

### Starting Server

```
/agileflow:api ACTION=start PORT=3456

Starting AgileFlow API server...

✅ API server started
   URL: http://127.0.0.1:3456/api
   PID: 12345

Available endpoints:
  GET /api           - API information
  GET /api/health    - Health check
  GET /api/sessions  - List sessions
  GET /api/status    - Story/epic state
  GET /api/tasks     - Task registry
  GET /api/metrics   - Aggregated metrics

Try: curl http://127.0.0.1:3456/api/status
```

### Stopping Server

```
/agileflow:api ACTION=stop

Stopping API server (PID: 12345)...

✅ API server stopped
```

### Server Status

```
/agileflow:api ACTION=status

AgileFlow API Server Status
────────────────────────────
Status:  Running
PID:     12345
URL:     http://127.0.0.1:3456/api
Uptime:  2h 15m

Endpoints:
  /api/status    - 42 stories
  /api/tasks     - 15 tasks
  /api/sessions  - 3 active
```

---

## Security Notes

- Server binds to **localhost only** (127.0.0.1) by default
- No authentication required (local access only)
- All endpoints are **read-only** (no mutations)
- To expose externally, use a reverse proxy with authentication

---

## Related Commands

- `/agileflow:status` - Update story status
- `/agileflow:board` - Visual kanban board
- `/agileflow:metrics` - View project metrics
- `/agileflow:session` - Manage agent sessions
