# Portable Task Tracking System

A file-based, IDE-agnostic task tracking system for AgileFlow projects. Works with Claude Code, Cursor, Windsurf, Codex, and any IDE that can read/write files.

## Overview

Unlike Claude Code's native `TaskCreate`/`TaskUpdate` tools (which only work in Claude Code), this system stores tasks in a simple markdown file (`.agileflow/tasks.md`) that ANY IDE's AI can read and modify.

**Key Features:**
- Pure markdown format - human-readable, git-friendly
- No dependencies beyond Node.js built-ins
- Works across all IDEs
- Supports filtering, custom fields, and blocking relationships
- Round-trip stable (parse → modify → format → parse)

## Files

- **`portable-tasks.js`** - Core module (functions for CRUD operations)
- **`portable-tasks-cli.js`** - Command-line interface (callable from any IDE)

## Installation

Copy both files to your project's `.agileflow/scripts/lib/` directory during setup. They are published with the agileflow npm package.

## File Format

Tasks are stored in `.agileflow/tasks.md`:

```markdown
# AgileFlow Tasks

> Auto-managed task list. Edit carefully - format matters.
> Last updated: 2026-02-20T15:30:00Z

## Active Tasks

### T-001: Implement user authentication [in_progress]
- **Owner**: AG-API
- **Created**: 2026-02-20
- **Story**: US-0042
- **Description**: Add JWT-based auth to /api/login endpoint

### T-002: Write auth tests [pending]
- **Owner**: AG-CI
- **Created**: 2026-02-20
- **Story**: US-0042
- **Blocked by**: T-001
- **Description**: Unit and integration tests for auth flow

## Completed Tasks

### T-003: Setup database schema [completed]
- **Owner**: AG-DEVOPS
- **Created**: 2026-02-19
- **Completed**: 2026-02-20
- **Story**: US-0041
- **Description**: Create users and sessions tables
```

## API Reference

### Module: `portable-tasks.js`

#### `loadTasks(projectDir)`
Load tasks from `.agileflow/tasks.md`.

```javascript
const { loadTasks } = require('./portable-tasks');
const { activeTasks, completedTasks } = loadTasks(process.cwd());
```

Returns: `{ activeTasks: [], completedTasks: [] }`

#### `saveTasks(projectDir, tasksData)`
Save tasks back to markdown file.

```javascript
saveTasks(process.cwd(), { activeTasks, completedTasks });
```

Returns: `boolean` (success/failure)

#### `addTask(projectDir, taskData)`
Create a new task.

```javascript
const result = addTask(process.cwd(), {
  subject: 'Write API tests',
  description: 'Integration tests for new endpoints',
  owner: 'AG-CI',
  status: 'pending',        // pending, in_progress, completed, blocked
  story: 'US-0040',
  blockedBy: 'T-001',       // optional
});

// result: { ok: true, taskId: 'T-001' } or { ok: false, error: 'message' }
```

#### `updateTask(projectDir, taskId, updates)`
Update an existing task.

```javascript
updateTask(process.cwd(), 'T-001', {
  status: 'in_progress',
  description: 'Updated description',
  owner: 'AG-DEVOPS',
});
```

Returns: `{ ok: boolean, error?: string }`

Moves task between active/completed sections automatically when status changes.

#### `deleteTask(projectDir, taskId)`
Remove a task.

```javascript
deleteTask(process.cwd(), 'T-001');
```

Returns: `{ ok: boolean, error?: string }`

#### `getTask(projectDir, taskId)`
Retrieve a single task by ID.

```javascript
const task = getTask(process.cwd(), 'T-001');
// Returns task object or null if not found
```

#### `listTasks(projectDir, filters?)`
List tasks with optional filtering.

```javascript
// All active tasks (default)
const tasks = listTasks(process.cwd());

// Filter by status
listTasks(process.cwd(), { status: 'pending' });
listTasks(process.cwd(), { status: ['pending', 'blocked'] });

// Filter by owner
listTasks(process.cwd(), { owner: 'AG-API' });

// Include completed tasks
listTasks(process.cwd(), { includeCompleted: true });

// Combine filters
listTasks(process.cwd(), {
  status: 'pending',
  owner: 'AG-API',
  includeCompleted: true,
});
```

Returns: `Array` of task objects

#### `getNextId(tasks)`
Generate the next sequential task ID.

```javascript
const nextId = getNextId(allTasks); // 'T-001', 'T-002', etc.
```

#### Parsing Functions
- `parseTasksFile(content)` - Parse markdown content into task objects
- `formatTasksFile(activeTasks, completedTasks)` - Generate markdown from tasks

## CLI: `portable-tasks-cli.js`

Command-line interface for task management (works in any IDE's terminal).

### Usage

```bash
node portable-tasks-cli.js [command] [options]
```

### Commands

#### List Tasks
```bash
# List active tasks
node portable-tasks-cli.js list

# Filter by status
node portable-tasks-cli.js list --status=pending
node portable-tasks-cli.js list --status=in_progress

# Filter by owner
node portable-tasks-cli.js list --owner=AG-API

# Include completed tasks
node portable-tasks-cli.js list --include-completed

# Output as JSON
node portable-tasks-cli.js list --json

# Combine filters
node portable-tasks-cli.js list --status=pending --owner=AG-CI
```

#### Add Task
```bash
# Minimal (subject required)
node portable-tasks-cli.js add --subject="Fix login bug"

# Full details
node portable-tasks-cli.js add \
  --subject="Implement auth" \
  --description="Add JWT tokens to API" \
  --owner=AG-API \
  --status=in_progress \
  --story=US-0040 \
  --blocked-by=T-001
```

#### Update Task
```bash
# Change status
node portable-tasks-cli.js update T-001 --status=completed

# Update multiple fields
node portable-tasks-cli.js update T-001 \
  --status=in_progress \
  --owner=AG-API \
  --description="Started implementation"
```

#### Get Task
```bash
# Display task
node portable-tasks-cli.js get T-001

# Output as JSON
node portable-tasks-cli.js get T-001 --json
```

#### Delete Task
```bash
node portable-tasks-cli.js delete T-001
node portable-tasks-cli.js rm T-001  # alias
```

### Output Formats

**Human-readable (default):**
```
T-001 [in_progress] Implement user auth (AG-API) [blocked by T-002]
T-002 [pending] Write tests (AG-CI)
```

**JSON output:**
```json
[
  {
    "id": "T-001",
    "title": "Implement user auth",
    "status": "in_progress",
    "owner": "AG-API",
    "created": "2026-02-20",
    "completed": null,
    "story": "US-0040",
    "blockedBy": "T-002",
    "description": "Add JWT tokens to /api/login endpoint"
  }
]
```

### Exit Codes
- **0**: Success
- **1**: Error (invalid command, missing task, etc.)

## Task Fields

Every task has these fields:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | Yes | Auto-generated ID (T-001, T-002, etc.) |
| `title` | string | Yes | Task summary |
| `status` | string | Yes | One of: `pending`, `in_progress`, `completed`, `blocked` |
| `owner` | string | No | Responsible agent/team (e.g., AG-API) |
| `created` | date | No | Creation date (YYYY-MM-DD) |
| `completed` | date | No | Completion date (auto-set when status → completed) |
| `story` | string | No | Link to parent story (e.g., US-0040) |
| `blockedBy` | string | No | Task ID blocking this task (e.g., T-001) |
| `description` | string | No | Detailed task description |

## Examples

### Python Script Using Module
```python
import subprocess
import json

# List all pending tasks
result = subprocess.run(
  ['node', '.agileflow/scripts/lib/portable-tasks-cli.js', 'list', '--status=pending', '--json'],
  capture_output=True,
  text=True
)
tasks = json.loads(result.stdout)
for task in tasks:
    print(f"{task['id']}: {task['title']} ({task['owner']})")
```

### JavaScript Using Module
```javascript
const { addTask, listTasks, updateTask } = require('./.agileflow/scripts/lib/portable-tasks');

// Create task
const result = addTask(process.cwd(), {
  subject: 'Run integration tests',
  owner: 'AG-CI',
  status: 'pending'
});

// List tasks for an owner
const tasks = listTasks(process.cwd(), { owner: 'AG-CI' });

// Update task
updateTask(process.cwd(), result.taskId, { status: 'in_progress' });
```

### Bash Script
```bash
#!/bin/bash

# Add task
node .agileflow/scripts/lib/portable-tasks-cli.js add \
  --subject="Deploy to staging" \
  --owner=AG-DEVOPS

# Get all pending tasks for AG-API
node .agileflow/scripts/lib/portable-tasks-cli.js list \
  --status=pending \
  --owner=AG-API

# Mark task complete
node .agileflow/scripts/lib/portable-tasks-cli.js update T-001 \
  --status=completed
```

## Status Values

- **`pending`** - Task not started
- **`in_progress`** - Task actively being worked on
- **`blocked`** - Task blocked by another (see `blockedBy` field)
- **`completed`** - Task finished

## Markdown Format Details

The markdown format is strict for correct parsing:

**Correct:**
```markdown
### T-001: Task title [status]
- **Owner**: Value
- **Blocked by**: T-002
- **Description**: Description text
```

**Incorrect (will not parse):**
```markdown
### T-001: Task title [status]
- Owner: Value         # Missing **bold** markers
- **Blocked By**: T-002  # Wrong case (must be "Blocked by")
- **Description**: Description text
# Extra blank lines between fields are ok
```

**Rules:**
- Task header: `### T-NNN: Title [status]`
- Field format: `- **Field name**: Value`
- Field names are case-insensitive (will be normalized)
- Extra blank lines, comments, headers are ignored
- Tasks can have any fields beyond the standard ones

## Thread Safety

The system uses atomic writes (write to temp file, then rename) to prevent corruption if multiple processes write simultaneously. However, reads are NOT locked, so concurrent reads during writes may see partial data. For production use with high concurrency, implement file locking via `fcntl` or `flock`.

## Testing

Run the comprehensive test suite:

```bash
cd packages/cli
npm test -- __tests__/scripts/lib/portable-tasks.test.js --no-coverage
```

Coverage:
- 47 tests across all functions
- Parsing, formatting, CRUD operations
- Round-trip integrity (parse → modify → format → parse)
- Error handling and edge cases
- Integration workflows

## Design Decisions

1. **Markdown format** - Human-readable, diff-friendly, git-compatible (vs JSON/YAML)
2. **Status-driven sections** - Completed/active sections based on task status, not location
3. **Auto-ID generation** - Sequential IDs (T-001) simplify references
4. **No dependencies** - Only Node.js built-ins to minimize install footprint
5. **Lazy parsing** - Parse on load, format on save (vs streaming)
6. **Fail-safe writes** - Atomic writes prevent corruption on crashes

## Limitations

- No encryption (store sensitive data elsewhere)
- No versioning/history (file is current state only)
- No concurrent write locking (implement if needed)
- No real-time sync (changes require reload)
- Task IDs are reassigned if you manually edit the file

## Future Enhancements

- [ ] Watch mode (monitor file for external changes)
- [ ] Priority levels (high/medium/low)
- [ ] Time tracking (estimated/actual hours)
- [ ] Comments/notes per task
- [ ] Subtasks (nested hierarchy)
- [ ] Recurring tasks
