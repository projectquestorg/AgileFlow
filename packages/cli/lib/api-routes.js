/**
 * api-routes.js - Route Handlers for AgileFlow REST API
 *
 * Provides route handlers for exposing AgileFlow state:
 * - Sessions (from .agileflow/sessions/registry.json)
 * - Status (from docs/09-agents/status.json)
 * - Tasks (from .agileflow/state/task-dependencies.json)
 * - Bus messages (from docs/09-agents/bus/log.jsonl)
 * - Metrics (aggregated from all sources)
 *
 * All routes are READ-ONLY. Writes go through CLI commands.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const {
  getStatusPath,
  getSessionStatePath,
  getBusLogPath,
  getEpicsDir,
  getStoriesDir,
  getAgentsDir,
} = require('./paths');
const { SessionRegistry } = require('./session-registry');
const { getTaskRegistry } = require('../scripts/lib/task-registry');

/**
 * Get API route handlers
 *
 * @param {string} rootDir - Project root directory
 * @param {ApiCache} cache - Cache instance
 * @returns {{ static: Object, dynamic: Object }}
 */
function getApiRoutes(rootDir, cache) {
  // Initialize session registry
  const sessionRegistry = new SessionRegistry(rootDir);

  return {
    // Static routes (exact match)
    static: {
      '/api': () => getApiInfo(),
      '/api/health': () => getHealth(rootDir),
      '/api/sessions': () => getSessions(sessionRegistry, cache),
      '/api/status': () => getStatus(rootDir, cache),
      '/api/tasks': queryParams => getTasks(rootDir, queryParams, cache),
      '/api/bus/messages': queryParams => getBusMessages(rootDir, queryParams, cache),
      '/api/metrics': () => getMetrics(rootDir, cache),
      '/api/epics': () => getEpics(rootDir, cache),
      '/api/stories': queryParams => getStories(rootDir, queryParams, cache),
    },

    // Dynamic routes (with parameters)
    dynamic: {
      '/api/sessions/:id': (queryParams, params) =>
        getSessionById(sessionRegistry, params.id, cache),
      '/api/tasks/:id': (queryParams, params) => getTaskById(rootDir, params.id, cache),
      '/api/epics/:id': (queryParams, params) => getEpicById(rootDir, params.id, cache),
      '/api/stories/:id': (queryParams, params) => getStoryById(rootDir, params.id, cache),
    },
  };
}

// ============================================================================
// Route Handlers
// ============================================================================

/**
 * GET /api - API information
 */
function getApiInfo() {
  return {
    name: 'AgileFlow API',
    version: '1.0.0',
    description: 'REST API for AgileFlow state exposure',
    endpoints: {
      '/api': 'API information (this endpoint)',
      '/api/health': 'Health check',
      '/api/sessions': 'List active sessions',
      '/api/sessions/:id': 'Get session by ID',
      '/api/status': 'Get status.json (epics/stories state)',
      '/api/tasks': 'List tasks (filterable)',
      '/api/tasks/:id': 'Get task by ID',
      '/api/bus/messages': 'Get bus messages (paginated)',
      '/api/metrics': 'Aggregated metrics',
      '/api/epics': 'List epics',
      '/api/epics/:id': 'Get epic by ID',
      '/api/stories': 'List stories (filterable)',
      '/api/stories/:id': 'Get story by ID',
    },
    note: 'All endpoints are read-only. Mutations go through CLI commands.',
  };
}

/**
 * GET /api/health - Health check
 */
function getHealth(rootDir) {
  const statusPath = getStatusPath(rootDir);
  const statusExists = fs.existsSync(statusPath);

  return {
    status: 'ok',
    timestamp: new Date().toISOString(),
    project: path.basename(rootDir),
    checks: {
      status_file: statusExists ? 'present' : 'missing',
    },
  };
}

/**
 * GET /api/sessions - List active sessions
 */
async function getSessions(sessionRegistry, cache) {
  const cacheKey = 'sessions';
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const sessions = await sessionRegistry.getAllSessions();
  const counts = await sessionRegistry.countSessions();

  const result = {
    sessions: Object.entries(sessions).map(([id, session]) => ({
      id,
      ...session,
    })),
    counts,
    timestamp: new Date().toISOString(),
  };

  cache.set(cacheKey, result);
  return result;
}

/**
 * GET /api/sessions/:id - Get session by ID
 */
async function getSessionById(sessionRegistry, id, cache) {
  const cacheKey = `session-${id}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const session = await sessionRegistry.getSession(id);

  if (!session) {
    return { error: 'Session not found', id };
  }

  const result = { id, ...session };
  cache.set(cacheKey, result);
  return result;
}

/**
 * GET /api/status - Get status.json
 */
function getStatus(rootDir, cache) {
  const cacheKey = 'status';
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const statusPath = getStatusPath(rootDir);

  if (!fs.existsSync(statusPath)) {
    return { error: 'Status file not found', path: statusPath };
  }

  try {
    const content = fs.readFileSync(statusPath, 'utf8');
    const status = JSON.parse(content);

    const result = {
      ...status,
      _meta: {
        path: statusPath,
        loaded_at: new Date().toISOString(),
      },
    };

    cache.set(cacheKey, result);
    return result;
  } catch (error) {
    return { error: 'Failed to parse status file', message: error.message };
  }
}

/**
 * GET /api/tasks - List tasks
 *
 * Query params:
 * - state: Filter by state (queued, running, completed, failed, blocked)
 * - story_id: Filter by story ID
 * - subagent_type: Filter by agent type
 */
function getTasks(rootDir, queryParams, cache) {
  const cacheKey = `tasks-${queryParams.toString()}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  try {
    const registry = getTaskRegistry({ rootDir });
    const filter = {};

    if (queryParams.get('state')) {
      filter.state = queryParams.get('state');
    }
    if (queryParams.get('story_id')) {
      filter.story_id = queryParams.get('story_id');
    }
    if (queryParams.get('subagent_type')) {
      filter.subagent_type = queryParams.get('subagent_type');
    }

    const tasks = registry.getAll(filter);
    const stats = registry.getStats();

    const result = {
      tasks,
      stats,
      timestamp: new Date().toISOString(),
    };

    cache.set(cacheKey, result);
    return result;
  } catch (error) {
    return { error: 'Failed to load tasks', message: error.message };
  }
}

/**
 * GET /api/tasks/:id - Get task by ID
 */
function getTaskById(rootDir, id, cache) {
  const cacheKey = `task-${id}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  try {
    const registry = getTaskRegistry({ rootDir });
    const task = registry.get(id);

    if (!task) {
      return { error: 'Task not found', id };
    }

    cache.set(cacheKey, task);
    return task;
  } catch (error) {
    return { error: 'Failed to load task', message: error.message };
  }
}

/**
 * GET /api/bus/messages - Get bus messages
 *
 * Query params:
 * - limit: Max messages to return (default: 100)
 * - offset: Skip first N messages (default: 0)
 * - story_id: Filter by story ID
 * - from: Filter by sender agent
 * - since: Filter by timestamp (ISO string)
 */
async function getBusMessages(rootDir, queryParams, cache) {
  const limit = parseInt(queryParams.get('limit') || '100', 10);
  const offset = parseInt(queryParams.get('offset') || '0', 10);
  const storyId = queryParams.get('story_id');
  const from = queryParams.get('from');
  const since = queryParams.get('since');

  const cacheKey = `bus-${limit}-${offset}-${storyId || ''}-${from || ''}-${since || ''}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const busLogPath = getBusLogPath(rootDir);

  if (!fs.existsSync(busLogPath)) {
    return { messages: [], total: 0, timestamp: new Date().toISOString() };
  }

  try {
    const messages = await readBusLog(busLogPath, {
      limit,
      offset,
      storyId,
      from,
      since,
    });

    const result = {
      messages,
      count: messages.length,
      limit,
      offset,
      timestamp: new Date().toISOString(),
    };

    cache.set(cacheKey, result);
    return result;
  } catch (error) {
    return { error: 'Failed to read bus log', message: error.message };
  }
}

/**
 * Read JSONL bus log with filtering
 */
async function readBusLog(filePath, options = {}) {
  const { limit = 100, offset = 0, storyId, from, since } = options;

  return new Promise((resolve, reject) => {
    const messages = [];
    let lineCount = 0;
    let skipped = 0;

    const rl = readline.createInterface({
      input: fs.createReadStream(filePath),
      crlfDelay: Infinity,
    });

    rl.on('line', line => {
      if (!line.trim()) return;

      try {
        const msg = JSON.parse(line);

        // Apply filters
        if (storyId && msg.story !== storyId) return;
        if (from && msg.from !== from) return;
        if (since && new Date(msg.ts) < new Date(since)) return;

        lineCount++;

        // Skip offset
        if (skipped < offset) {
          skipped++;
          return;
        }

        // Collect up to limit
        if (messages.length < limit) {
          messages.push(msg);
        }
      } catch {
        // Skip invalid lines
      }
    });

    rl.on('close', () => resolve(messages));
    rl.on('error', reject);
  });
}

/**
 * GET /api/metrics - Aggregated metrics
 */
function getMetrics(rootDir, cache) {
  const cacheKey = 'metrics';
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const metrics = {
    timestamp: new Date().toISOString(),
  };

  // Status metrics
  try {
    const statusPath = getStatusPath(rootDir);
    if (fs.existsSync(statusPath)) {
      const status = JSON.parse(fs.readFileSync(statusPath, 'utf8'));
      const stories = Object.values(status.stories || {});

      metrics.stories = {
        total: stories.length,
        by_status: {
          ready: stories.filter(s => s.status === 'ready').length,
          'in-progress': stories.filter(s => s.status === 'in-progress').length,
          blocked: stories.filter(s => s.status === 'blocked').length,
          'in-review': stories.filter(s => s.status === 'in-review').length,
          done: stories.filter(s => s.status === 'done').length,
        },
        completion_percent:
          stories.length > 0
            ? Math.round((stories.filter(s => s.status === 'done').length / stories.length) * 100)
            : 0,
      };
    }
  } catch {
    metrics.stories = { error: 'Failed to load status' };
  }

  // Task metrics
  try {
    const registry = getTaskRegistry({ rootDir });
    metrics.tasks = registry.getStats();
  } catch {
    metrics.tasks = { error: 'Failed to load tasks' };
  }

  // Epic metrics
  try {
    const epicsDir = getEpicsDir(rootDir);
    if (fs.existsSync(epicsDir)) {
      const epicFiles = fs.readdirSync(epicsDir).filter(f => f.endsWith('.md'));
      metrics.epics = { total: epicFiles.length };
    }
  } catch {
    metrics.epics = { error: 'Failed to count epics' };
  }

  cache.set(cacheKey, metrics);
  return metrics;
}

/**
 * GET /api/epics - List epics
 */
function getEpics(rootDir, cache) {
  const cacheKey = 'epics';
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const epicsDir = getEpicsDir(rootDir);

  if (!fs.existsSync(epicsDir)) {
    return { epics: [], timestamp: new Date().toISOString() };
  }

  try {
    const epicFiles = fs.readdirSync(epicsDir).filter(f => f.endsWith('.md'));
    const epics = epicFiles.map(file => {
      const id = file.replace('.md', '');
      const content = fs.readFileSync(path.join(epicsDir, file), 'utf8');
      const title = extractTitle(content) || id;
      const status = extractStatus(content) || 'active';

      return { id, title, status, file };
    });

    const result = {
      epics,
      count: epics.length,
      timestamp: new Date().toISOString(),
    };

    cache.set(cacheKey, result);
    return result;
  } catch (error) {
    return { error: 'Failed to list epics', message: error.message };
  }
}

/**
 * GET /api/epics/:id - Get epic by ID
 */
function getEpicById(rootDir, id, cache) {
  const cacheKey = `epic-${id}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const epicsDir = getEpicsDir(rootDir);
  const epicPath = path.join(epicsDir, `${id}.md`);

  if (!fs.existsSync(epicPath)) {
    return { error: 'Epic not found', id };
  }

  try {
    const content = fs.readFileSync(epicPath, 'utf8');
    const result = {
      id,
      title: extractTitle(content) || id,
      status: extractStatus(content) || 'active',
      content,
    };

    cache.set(cacheKey, result);
    return result;
  } catch (error) {
    return { error: 'Failed to read epic', message: error.message };
  }
}

/**
 * GET /api/stories - List stories
 *
 * Query params:
 * - status: Filter by status
 * - epic_id: Filter by epic ID
 * - owner: Filter by owner
 */
function getStories(rootDir, queryParams, cache) {
  const status = queryParams.get('status');
  const epicId = queryParams.get('epic_id');
  const owner = queryParams.get('owner');

  const cacheKey = `stories-${status || ''}-${epicId || ''}-${owner || ''}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  try {
    // First try to get from status.json
    const statusPath = getStatusPath(rootDir);
    if (fs.existsSync(statusPath)) {
      const statusData = JSON.parse(fs.readFileSync(statusPath, 'utf8'));
      let stories = Object.entries(statusData.stories || {}).map(([id, story]) => ({
        id,
        ...story,
      }));

      // Apply filters
      if (status) {
        stories = stories.filter(s => s.status === status);
      }
      if (epicId) {
        stories = stories.filter(s => s.epic_id === epicId);
      }
      if (owner) {
        stories = stories.filter(s => s.owner === owner);
      }

      const result = {
        stories,
        count: stories.length,
        timestamp: new Date().toISOString(),
      };

      cache.set(cacheKey, result);
      return result;
    }

    return { stories: [], count: 0, timestamp: new Date().toISOString() };
  } catch (error) {
    return { error: 'Failed to list stories', message: error.message };
  }
}

/**
 * GET /api/stories/:id - Get story by ID
 */
function getStoryById(rootDir, id, cache) {
  const cacheKey = `story-${id}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  try {
    // Get from status.json
    const statusPath = getStatusPath(rootDir);
    if (fs.existsSync(statusPath)) {
      const statusData = JSON.parse(fs.readFileSync(statusPath, 'utf8'));
      const story = statusData.stories?.[id];

      if (story) {
        const result = { id, ...story };

        // Try to get story file content
        const storiesDir = getStoriesDir(rootDir);
        const storyPath = path.join(storiesDir, `${id}.md`);
        if (fs.existsSync(storyPath)) {
          result.content = fs.readFileSync(storyPath, 'utf8');
        }

        cache.set(cacheKey, result);
        return result;
      }
    }

    return { error: 'Story not found', id };
  } catch (error) {
    return { error: 'Failed to read story', message: error.message };
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Extract title from markdown content (first H1)
 */
function extractTitle(content) {
  const match = content.match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : null;
}

/**
 * Extract status from markdown frontmatter or content
 */
function extractStatus(content) {
  // Try frontmatter
  const fmMatch = content.match(/^---[\s\S]*?status:\s*(\w+)[\s\S]*?---/m);
  if (fmMatch) return fmMatch[1];

  // Try inline status
  const inlineMatch = content.match(/\*\*Status\*\*:\s*(\w+)/i);
  if (inlineMatch) return inlineMatch[1].toLowerCase();

  return null;
}

module.exports = {
  getApiRoutes,
};
