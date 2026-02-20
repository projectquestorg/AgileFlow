#!/usr/bin/env node

/**
 * portable-tasks-cli.js - CLI wrapper for portable task tracking
 *
 * Usage:
 *   node portable-tasks-cli.js list [--status=pending] [--owner=AG-API] [--json]
 *   node portable-tasks-cli.js add --subject="..." [--description="..."] [--owner=...] [--status=pending]
 *   node portable-tasks-cli.js update T-001 --status=completed
 *   node portable-tasks-cli.js get T-001
 *   node portable-tasks-cli.js delete T-001
 *
 * Exit codes:
 *   0 = Success
 *   1 = Error
 */

const path = require('path');
const {
  loadTasks,
  addTask,
  updateTask,
  deleteTask,
  getTask,
  listTasks,
} = require('./portable-tasks');

// Get project directory (current working directory)
const projectDir = process.cwd();

/**
 * Parse command-line arguments into command and options
 * @returns {Object} { command, taskId, options }
 */
function parseArgs() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    return { command: 'help' };
  }

  const command = args[0];
  const taskId = args[1] && !args[1].startsWith('--') ? args[1] : null;

  const options = {};
  for (let i = taskId ? 2 : 1; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const [key, value] = arg.substring(2).split('=');
      options[key] = value === undefined ? true : value;
    }
  }

  return { command, taskId, options };
}

/**
 * Format task for human-readable output
 */
function formatTaskHuman(task) {
  let output = `${task.id} [${task.status}] ${task.title}`;
  if (task.owner) output += ` (${task.owner})`;
  if (task.blockedBy) output += ` [blocked by ${task.blockedBy}]`;
  return output;
}

/**
 * Run a command
 */
function run() {
  const { command, taskId, options } = parseArgs();

  switch (command) {
    case 'list':
    case 'ls': {
      const tasks = listTasks(projectDir, {
        status: options.status,
        owner: options.owner,
        includeCompleted: options['include-completed'] === true,
      });

      if (options.json) {
        console.log(JSON.stringify(tasks, null, 2));
      } else {
        if (tasks.length === 0) {
          console.log('No tasks found');
        } else {
          tasks.forEach(task => console.log(formatTaskHuman(task)));
        }
      }
      process.exit(0);
      break;
    }

    case 'add': {
      if (!options.subject) {
        console.error('[ERROR] --subject is required');
        process.exit(1);
      }

      const result = addTask(projectDir, {
        subject: options.subject,
        description: options.description,
        owner: options.owner,
        status: options.status || 'pending',
        story: options.story,
        blockedBy: options['blocked-by'],
      });

      if (result.ok) {
        console.log(`Created: ${result.taskId}`);
        process.exit(0);
      } else {
        console.error(`[ERROR] ${result.error}`);
        process.exit(1);
      }
      break;
    }

    case 'update': {
      if (!taskId) {
        console.error('[ERROR] Task ID is required (e.g., T-001)');
        process.exit(1);
      }

      const task = getTask(projectDir, taskId);
      if (!task) {
        console.error(`[ERROR] Task ${taskId} not found`);
        process.exit(1);
      }

      const updates = {};
      if (options.status) updates.status = options.status;
      if (options.description !== undefined) updates.description = options.description;
      if (options.owner !== undefined) updates.owner = options.owner;
      if (options.title !== undefined) updates.title = options.title;
      if (options.story !== undefined) updates.story = options.story;
      if (options['blocked-by'] !== undefined) updates.blockedBy = options['blocked-by'];

      if (Object.keys(updates).length === 0) {
        console.error('[ERROR] No updates specified');
        process.exit(1);
      }

      const result = updateTask(projectDir, taskId, updates);
      if (result.ok) {
        console.log(`Updated: ${taskId}`);
        process.exit(0);
      } else {
        console.error(`[ERROR] ${result.error}`);
        process.exit(1);
      }
      break;
    }

    case 'get': {
      if (!taskId) {
        console.error('[ERROR] Task ID is required (e.g., T-001)');
        process.exit(1);
      }

      const task = getTask(projectDir, taskId);
      if (!task) {
        console.error(`[ERROR] Task ${taskId} not found`);
        process.exit(1);
      }

      if (options.json) {
        console.log(JSON.stringify(task, null, 2));
      } else {
        console.log(formatTaskHuman(task));
        if (task.description) console.log(`  Description: ${task.description}`);
        if (task.story) console.log(`  Story: ${task.story}`);
        if (task.created) console.log(`  Created: ${task.created}`);
        if (task.completed) console.log(`  Completed: ${task.completed}`);
      }
      process.exit(0);
      break;
    }

    case 'delete':
    case 'rm': {
      if (!taskId) {
        console.error('[ERROR] Task ID is required (e.g., T-001)');
        process.exit(1);
      }

      const task = getTask(projectDir, taskId);
      if (!task) {
        console.error(`[ERROR] Task ${taskId} not found`);
        process.exit(1);
      }

      const result = deleteTask(projectDir, taskId);
      if (result.ok) {
        console.log(`Deleted: ${taskId}`);
        process.exit(0);
      } else {
        console.error(`[ERROR] ${result.error}`);
        process.exit(1);
      }
      break;
    }

    case 'help':
    case '-h':
    case '--help': {
      console.log(`
Portable Task Tracking - File-based task management for all IDEs

Usage:
  portable-tasks-cli.js list [OPTIONS]
  portable-tasks-cli.js add --subject="..." [OPTIONS]
  portable-tasks-cli.js update <TASK_ID> --status=... [OPTIONS]
  portable-tasks-cli.js get <TASK_ID>
  portable-tasks-cli.js delete <TASK_ID>

Commands:
  list (ls)       List tasks (default: active only)
  add             Create a new task
  update          Update an existing task
  get             Show task details
  delete (rm)     Delete a task
  help            Show this message

List Options:
  --status=<status>              Filter by status (pending, in_progress, completed, blocked)
  --owner=<owner>                Filter by owner (e.g., AG-API, AG-UI)
  --include-completed            Include completed tasks (default: false)
  --json                         Output as JSON

Add Options:
  --subject=<text>               Task title (required)
  --description=<text>           Task description
  --owner=<owner>                Task owner (e.g., AG-API)
  --status=<status>              Initial status (default: pending)
  --story=<story-id>             Link to story (e.g., US-0040)
  --blocked-by=<task-id>         Block this task (e.g., T-001)

Update Options:
  --status=<status>              New status
  --description=<text>           New description
  --owner=<owner>                New owner
  --title=<text>                 New title
  --story=<story-id>             Update story link
  --blocked-by=<task-id>         Update blocker

Examples:
  node portable-tasks-cli.js list
  node portable-tasks-cli.js list --status=pending --owner=AG-API
  node portable-tasks-cli.js add --subject="Write tests" --owner=AG-CI
  node portable-tasks-cli.js update T-001 --status=completed
  node portable-tasks-cli.js get T-001 --json
      `);
      process.exit(0);
      break;
    }

    default: {
      console.error(`[ERROR] Unknown command: ${command}`);
      console.log('Run with --help for usage');
      process.exit(1);
    }
  }
}

run();
