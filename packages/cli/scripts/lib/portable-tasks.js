/**
 * portable-tasks.js - File-based task tracking for all IDEs
 *
 * Provides a portable, markdown-based task tracking system that works across
 * all IDEs (Claude Code, Cursor, Windsurf, Codex). Unlike Claude Code's native
 * TaskCreate/TaskUpdate tools, this system stores tasks in .agileflow/tasks.md
 * where ANY IDE's AI can read/write.
 *
 * File Format (.agileflow/tasks.md):
 * ```markdown
 * # AgileFlow Tasks
 *
 * > Auto-managed task list. Edit carefully - format matters.
 * > Last updated: 2026-02-20T15:30:00Z
 *
 * ## Active Tasks
 *
 * ### T-001: Task title [in_progress]
 * - **Owner**: AG-API
 * - **Created**: 2026-02-20
 * - **Story**: US-0042
 * - **Description**: Task details here
 *
 * ## Completed Tasks
 *
 * ### T-002: Completed task [completed]
 * - **Owner**: AG-CI
 * - **Created**: 2026-02-20
 * - **Completed**: 2026-02-21
 * ```
 *
 * Status values: pending, in_progress, completed, blocked
 */

const fs = require('fs');
const path = require('path');

const AGILEFLOW_DIR = '.agileflow';
const TASKS_FILE = 'tasks.md';
const TASKS_PATH = path.join(AGILEFLOW_DIR, TASKS_FILE);

const STATUS_ACTIVE = ['pending', 'in_progress', 'blocked'];
const STATUS_COMPLETED = ['completed'];
const VALID_STATUSES = ['pending', 'in_progress', 'completed', 'blocked'];

/**
 * Parse the tasks markdown file into structured data
 * @param {string} content - Raw markdown file content
 * @returns {Object} { activeTasks: [], completedTasks: [] } where each task is { id, title, status, owner, created, completed, story, blockedBy, description }
 */
function parseTasksFile(content) {
  const activeTasks = [];
  const completedTasks = [];

  if (!content || content.trim() === '') {
    return { activeTasks, completedTasks };
  }

  const lines = content.split('\n');
  let currentSection = null; // 'active' or 'completed'
  let currentTask = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Detect section headers (must be before generic # check)
    if (line.startsWith('## Active Tasks')) {
      currentSection = 'active';
      continue;
    }
    if (line.startsWith('## Completed Tasks')) {
      currentSection = 'completed';
      continue;
    }

    // Parse task headers: ### T-001: Title [status] (must be before generic # check)
    const taskHeaderMatch = line.match(/^### (T-\d+):\s+(.+?)\s+\[(\w+)\]$/);
    if (taskHeaderMatch) {
      // Save previous task to appropriate list based on its status
      if (currentTask) {
        if (currentTask.status === 'completed') {
          completedTasks.push(currentTask);
        } else {
          // All non-completed statuses go to active (pending, in_progress, blocked)
          activeTasks.push(currentTask);
        }
      }

      // Start new task
      currentTask = {
        id: taskHeaderMatch[1],
        title: taskHeaderMatch[2].trim(),
        status: taskHeaderMatch[3],
        owner: null,
        created: null,
        completed: null,
        story: null,
        blockedBy: null,
        description: null,
      };
      continue;
    }

    // Skip non-task lines (after checking for task headers and section headers)
    if (!line.trim() || line.startsWith('>') || line.startsWith('#')) {
      continue;
    }

    // Parse task fields: - **Field**: Value or - **Field name**: Value
    if (currentTask && line.startsWith('- ')) {
      const fieldMatch = line.match(/^- \*\*([^*]+)\*\*:\s+(.+)$/);
      if (fieldMatch) {
        const fieldName = fieldMatch[1].toLowerCase().trim();
        const fieldValue = fieldMatch[2].trim();

        switch (fieldName) {
          case 'owner':
            currentTask.owner = fieldValue;
            break;
          case 'created':
            currentTask.created = fieldValue;
            break;
          case 'completed':
            currentTask.completed = fieldValue;
            break;
          case 'story':
            currentTask.story = fieldValue;
            break;
          case 'blockedby':
          case 'blocked by':
            currentTask.blockedBy = fieldValue;
            break;
          case 'description':
            currentTask.description = fieldValue;
            break;
        }
      }
    }
  }

  // Save last task based on its status
  if (currentTask) {
    if (currentTask.status === 'completed') {
      completedTasks.push(currentTask);
    } else {
      activeTasks.push(currentTask);
    }
  }

  return { activeTasks, completedTasks };
}

/**
 * Convert structured tasks back to markdown format
 * @param {Array} activeTasks - Active task objects
 * @param {Array} completedTasks - Completed task objects
 * @returns {string} Formatted markdown content
 */
function formatTasksFile(activeTasks, completedTasks) {
  const now = new Date().toISOString();
  let content = `# AgileFlow Tasks

> Auto-managed task list. Edit carefully - format matters.
> Last updated: ${now}

`;

  // Active tasks section
  if (activeTasks.length > 0) {
    content += '## Active Tasks\n\n';
    for (const task of activeTasks) {
      content += `### ${task.id}: ${task.title} [${task.status}]\n`;
      if (task.owner) content += `- **Owner**: ${task.owner}\n`;
      if (task.created) content += `- **Created**: ${task.created}\n`;
      if (task.story) content += `- **Story**: ${task.story}\n`;
      if (task.blockedBy) content += `- **Blocked by**: ${task.blockedBy}\n`;
      if (task.description) content += `- **Description**: ${task.description}\n`;
      content += '\n';
    }
  }

  // Completed tasks section
  if (completedTasks.length > 0) {
    content += '## Completed Tasks\n\n';
    for (const task of completedTasks) {
      content += `### ${task.id}: ${task.title} [${task.status}]\n`;
      if (task.owner) content += `- **Owner**: ${task.owner}\n`;
      if (task.created) content += `- **Created**: ${task.created}\n`;
      if (task.completed) content += `- **Completed**: ${task.completed}\n`;
      if (task.story) content += `- **Story**: ${task.story}\n`;
      if (task.description) content += `- **Description**: ${task.description}\n`;
      content += '\n';
    }
  }

  return content;
}

/**
 * Load and parse tasks from .agileflow/tasks.md
 * @param {string} projectDir - Project directory (where .agileflow/ is located)
 * @returns {Object} { activeTasks: [], completedTasks: [] }
 */
function loadTasks(projectDir) {
  const tasksPath = path.join(projectDir, TASKS_PATH);

  try {
    if (!fs.existsSync(tasksPath)) {
      return { activeTasks: [], completedTasks: [] };
    }

    const content = fs.readFileSync(tasksPath, 'utf8');
    return parseTasksFile(content);
  } catch (e) {
    // Return empty if read fails
    return { activeTasks: [], completedTasks: [] };
  }
}

/**
 * Save tasks back to .agileflow/tasks.md
 * @param {string} projectDir - Project directory
 * @param {Object} tasksData - { activeTasks: [], completedTasks: [] }
 * @returns {boolean} True if successful
 */
function saveTasks(projectDir, tasksData) {
  try {
    const agileflowDir = path.join(projectDir, AGILEFLOW_DIR);
    const tasksPath = path.join(projectDir, TASKS_PATH);

    // Ensure .agileflow directory exists
    if (!fs.existsSync(agileflowDir)) {
      fs.mkdirSync(agileflowDir, { recursive: true });
    }

    const content = formatTasksFile(tasksData.activeTasks, tasksData.completedTasks);
    fs.writeFileSync(tasksPath, content, 'utf8');
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Get the next sequential task ID
 * @param {Array} allTasks - Array of all tasks (active + completed)
 * @returns {string} Next ID like T-001, T-002, etc.
 */
function getNextId(allTasks) {
  if (!allTasks || allTasks.length === 0) {
    return 'T-001';
  }

  // Extract numeric parts from task IDs
  const numbers = allTasks.map(t => parseInt(t.id.replace('T-', ''), 10)).filter(n => !isNaN(n));

  if (numbers.length === 0) {
    return 'T-001';
  }

  const maxNum = Math.max(...numbers);
  return `T-${String(maxNum + 1).padStart(3, '0')}`;
}

/**
 * Add a new task
 * @param {string} projectDir - Project directory
 * @param {Object} task - { subject, description, status, owner, story, blockedBy }
 * @returns {Object} { ok: boolean, taskId?: string, error?: string }
 */
function addTask(projectDir, task) {
  try {
    const { activeTasks, completedTasks } = loadTasks(projectDir);
    const allTasks = [...activeTasks, ...completedTasks];

    const taskId = getNextId(allTasks);
    const today = new Date().toISOString().split('T')[0];

    const newTask = {
      id: taskId,
      title: task.subject || 'Untitled',
      status: task.status || 'pending',
      owner: task.owner || null,
      created: task.created || today,
      completed: null,
      story: task.story || null,
      blockedBy: task.blockedBy || null,
      description: task.description || null,
    };

    // Validate status
    if (!VALID_STATUSES.includes(newTask.status)) {
      return { ok: false, error: `Invalid status: ${newTask.status}` };
    }

    // Add to appropriate section
    const newActiveTasks = newTask.status === 'completed' ? activeTasks : [...activeTasks, newTask];
    const newCompletedTasks =
      newTask.status === 'completed' ? [...completedTasks, newTask] : completedTasks;

    if (
      !saveTasks(projectDir, { activeTasks: newActiveTasks, completedTasks: newCompletedTasks })
    ) {
      return { ok: false, error: 'Failed to save tasks file' };
    }

    return { ok: true, taskId };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Update a task
 * @param {string} projectDir - Project directory
 * @param {string} taskId - Task ID like T-001
 * @param {Object} updates - Fields to update { status, owner, description, etc. }
 * @returns {Object} { ok: boolean, error?: string }
 */
function updateTask(projectDir, taskId, updates) {
  try {
    let { activeTasks, completedTasks } = loadTasks(projectDir);

    // Find task in either list
    let task = activeTasks.find(t => t.id === taskId);
    let isInActive = !!task;

    if (!task) {
      task = completedTasks.find(t => t.id === taskId);
      if (!task) {
        return { ok: false, error: `Task ${taskId} not found` };
      }
    }

    // Update fields
    if (updates.status) {
      if (!VALID_STATUSES.includes(updates.status)) {
        return { ok: false, error: `Invalid status: ${updates.status}` };
      }
      task.status = updates.status;
    }
    if (updates.owner !== undefined) task.owner = updates.owner;
    if (updates.description !== undefined) task.description = updates.description;
    if (updates.title !== undefined) task.title = updates.title;
    if (updates.story !== undefined) task.story = updates.story;
    if (updates.blockedBy !== undefined) task.blockedBy = updates.blockedBy;
    if (updates.completed !== undefined) task.completed = updates.completed;

    // Move between sections if status changed
    if (updates.status) {
      const wasCompleted = !isInActive;
      const isNowCompleted = updates.status === 'completed';

      if (wasCompleted && !isNowCompleted) {
        // Move from completed to active
        completedTasks = completedTasks.filter(t => t.id !== taskId);
        activeTasks.push(task);
      } else if (!wasCompleted && isNowCompleted) {
        // Move from active to completed
        activeTasks = activeTasks.filter(t => t.id !== taskId);
        // Set completion date if not already set
        if (!task.completed) {
          task.completed = new Date().toISOString().split('T')[0];
        }
        completedTasks.push(task);
      }
    }

    if (!saveTasks(projectDir, { activeTasks, completedTasks })) {
      return { ok: false, error: 'Failed to save tasks file' };
    }

    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Delete a task
 * @param {string} projectDir - Project directory
 * @param {string} taskId - Task ID like T-001
 * @returns {Object} { ok: boolean, error?: string }
 */
function deleteTask(projectDir, taskId) {
  try {
    let { activeTasks, completedTasks } = loadTasks(projectDir);

    const foundInActive = activeTasks.some(t => t.id === taskId);
    const foundInCompleted = completedTasks.some(t => t.id === taskId);

    if (!foundInActive && !foundInCompleted) {
      return { ok: false, error: `Task ${taskId} not found` };
    }

    activeTasks = activeTasks.filter(t => t.id !== taskId);
    completedTasks = completedTasks.filter(t => t.id !== taskId);

    if (!saveTasks(projectDir, { activeTasks, completedTasks })) {
      return { ok: false, error: 'Failed to save tasks file' };
    }

    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Get a single task by ID
 * @param {string} projectDir - Project directory
 * @param {string} taskId - Task ID like T-001
 * @returns {Object|null} Task object or null if not found
 */
function getTask(projectDir, taskId) {
  const { activeTasks, completedTasks } = loadTasks(projectDir);

  const task = activeTasks.find(t => t.id === taskId) || completedTasks.find(t => t.id === taskId);
  return task || null;
}

/**
 * List tasks with optional filtering
 * @param {string} projectDir - Project directory
 * @param {Object} filters - { status, owner, includeCompleted } - defaults to active only
 * @returns {Array} Array of task objects
 */
function listTasks(projectDir, filters = {}) {
  const { activeTasks, completedTasks } = loadTasks(projectDir);

  let tasks = activeTasks;
  if (filters.includeCompleted !== false) {
    tasks = [...activeTasks, ...completedTasks];
  }

  // Filter by status
  if (filters.status) {
    const statuses = Array.isArray(filters.status) ? filters.status : [filters.status];
    tasks = tasks.filter(t => statuses.includes(t.status));
  } else if (!filters.includeCompleted) {
    // Default: show only active statuses
    tasks = tasks.filter(t => STATUS_ACTIVE.includes(t.status));
  }

  // Filter by owner
  if (filters.owner) {
    tasks = tasks.filter(t => t.owner === filters.owner);
  }

  return tasks;
}

module.exports = {
  loadTasks,
  saveTasks,
  addTask,
  updateTask,
  deleteTask,
  getTask,
  listTasks,
  getNextId,
  parseTasksFile,
  formatTasksFile,
};
