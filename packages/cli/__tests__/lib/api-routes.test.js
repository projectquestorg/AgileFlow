/**
 * Tests for api-routes.js - Route Handlers for AgileFlow REST API
 *
 * This test suite covers:
 * - Static route handlers (/api, /api/health, /api/status, etc.)
 * - Dynamic route handlers (/api/tasks/:id, /api/epics/:id, etc.)
 * - Query parameter filtering
 * - Error handling and missing files
 * - Cache hit/miss behavior
 * - Internal utility functions (extractTitle, extractStatus)
 */

jest.mock('fs');
jest.mock('../../lib/paths');
jest.mock('../../lib/session-registry');
jest.mock('../../scripts/lib/task-registry');
jest.mock('readline');

const fs = require('fs');
const readline = require('readline');
const path = require('path');
const { getApiRoutes } = require('../../lib/api-routes');
const {
  getStatusPath,
  getSessionStatePath,
  getBusLogPath,
  getEpicsDir,
  getStoriesDir,
  getAgentsDir,
} = require('../../lib/paths');
const { SessionRegistry } = require('../../lib/session-registry');
const { getTaskRegistry } = require('../../scripts/lib/task-registry');

// Mock data
const mockRootDir = '/test/project';
const mockStatusPath = '/test/project/docs/09-agents/status.json';
const mockEpicsDir = '/test/project/docs/05-epics';
const mockStoriesDir = '/test/project/docs/06-stories';
const mockBusLogPath = '/test/project/docs/09-agents/bus/log.jsonl';

// Helper to create mock cache
function createMockCache() {
  return {
    get: jest.fn(() => null),
    set: jest.fn(),
  };
}

describe('getApiRoutes', () => {
  let cache;
  let mockRegistry;
  let routes;

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup path mocks
    getStatusPath.mockReturnValue(mockStatusPath);
    getSessionStatePath.mockReturnValue('/test/session-state.json');
    getBusLogPath.mockReturnValue(mockBusLogPath);
    getEpicsDir.mockReturnValue(mockEpicsDir);
    getStoriesDir.mockReturnValue(mockStoriesDir);
    getAgentsDir.mockReturnValue('/test/agents');

    // Setup session registry mock
    mockRegistry = {
      getAllSessions: jest.fn().mockResolvedValue({}),
      countSessions: jest.fn().mockResolvedValue({ total: 0 }),
      getSession: jest.fn().mockResolvedValue(null),
    };
    SessionRegistry.mockImplementation(() => mockRegistry);

    // Setup cache
    cache = createMockCache();

    // Get routes
    routes = getApiRoutes(mockRootDir, cache);
  });

  describe('structure', () => {
    it('returns object with static and dynamic properties', () => {
      expect(routes).toHaveProperty('static');
      expect(routes).toHaveProperty('dynamic');
      expect(typeof routes.static).toBe('object');
      expect(typeof routes.dynamic).toBe('object');
    });

    it('static routes contain expected endpoints', () => {
      const staticKeys = Object.keys(routes.static);
      expect(staticKeys).toContain('/api');
      expect(staticKeys).toContain('/api/health');
      expect(staticKeys).toContain('/api/sessions');
      expect(staticKeys).toContain('/api/status');
      expect(staticKeys).toContain('/api/tasks');
      expect(staticKeys).toContain('/api/bus/messages');
      expect(staticKeys).toContain('/api/metrics');
      expect(staticKeys).toContain('/api/epics');
      expect(staticKeys).toContain('/api/stories');
    });

    it('dynamic routes contain expected endpoints', () => {
      const dynamicKeys = Object.keys(routes.dynamic);
      expect(dynamicKeys).toContain('/api/sessions/:id');
      expect(dynamicKeys).toContain('/api/tasks/:id');
      expect(dynamicKeys).toContain('/api/epics/:id');
      expect(dynamicKeys).toContain('/api/stories/:id');
    });

    it('static routes are functions', () => {
      Object.values(routes.static).forEach(handler => {
        expect(typeof handler).toBe('function');
      });
    });

    it('dynamic routes are functions', () => {
      Object.values(routes.dynamic).forEach(handler => {
        expect(typeof handler).toBe('function');
      });
    });
  });
});

// ============================================================================
// Static Route Tests
// ============================================================================

describe('/api route', () => {
  let routes;
  let cache;

  beforeEach(() => {
    jest.clearAllMocks();
    getStatusPath.mockReturnValue(mockStatusPath);
    getEpicsDir.mockReturnValue(mockEpicsDir);
    getStoriesDir.mockReturnValue(mockStoriesDir);
    getBusLogPath.mockReturnValue(mockBusLogPath);

    SessionRegistry.mockImplementation(() => ({
      getAllSessions: jest.fn().mockResolvedValue({}),
      countSessions: jest.fn().mockResolvedValue({}),
    }));

    cache = createMockCache();
    routes = getApiRoutes(mockRootDir, cache);
  });

  it('returns API information', () => {
    // Arrange
    const apiHandler = routes.static['/api'];

    // Act
    const result = apiHandler();

    // Assert
    expect(result).toHaveProperty('name', 'AgileFlow API');
    expect(result).toHaveProperty('version', '1.0.0');
    expect(result).toHaveProperty('description');
    expect(result).toHaveProperty('endpoints');
    expect(result).toHaveProperty('note');
  });

  it('endpoints contain all expected routes', () => {
    // Arrange
    const apiHandler = routes.static['/api'];

    // Act
    const result = apiHandler();

    // Assert
    expect(result.endpoints['/api']).toBeDefined();
    expect(result.endpoints['/api/health']).toBeDefined();
    expect(result.endpoints['/api/sessions']).toBeDefined();
    expect(result.endpoints['/api/status']).toBeDefined();
    expect(result.endpoints['/api/tasks']).toBeDefined();
    expect(result.endpoints['/api/epics']).toBeDefined();
    expect(result.endpoints['/api/stories']).toBeDefined();
  });
});

describe('/api/health route', () => {
  let routes;
  let cache;

  beforeEach(() => {
    jest.clearAllMocks();
    getStatusPath.mockReturnValue(mockStatusPath);
    SessionRegistry.mockImplementation(() => ({
      getAllSessions: jest.fn().mockResolvedValue({}),
      countSessions: jest.fn().mockResolvedValue({}),
    }));
    cache = createMockCache();
    routes = getApiRoutes(mockRootDir, cache);
  });

  it('returns health check with status file present', () => {
    // Arrange
    fs.existsSync.mockReturnValue(true);
    const healthHandler = routes.static['/api/health'];

    // Act
    const result = healthHandler();

    // Assert
    expect(result).toHaveProperty('status', 'ok');
    expect(result).toHaveProperty('timestamp');
    expect(result).toHaveProperty('project');
    expect(result).toHaveProperty('checks');
    expect(result.checks.status_file).toBe('present');
  });

  it('returns health check with status file missing', () => {
    // Arrange
    fs.existsSync.mockReturnValue(false);
    const healthHandler = routes.static['/api/health'];

    // Act
    const result = healthHandler();

    // Assert
    expect(result.checks.status_file).toBe('missing');
  });

  it('includes project name in response', () => {
    // Arrange
    fs.existsSync.mockReturnValue(true);
    const healthHandler = routes.static['/api/health'];

    // Act
    const result = healthHandler();

    // Assert
    expect(result.project).toBe('project');
  });
});

describe('/api/status route', () => {
  let routes;
  let cache;

  beforeEach(() => {
    jest.clearAllMocks();
    getStatusPath.mockReturnValue(mockStatusPath);
    SessionRegistry.mockImplementation(() => ({
      getAllSessions: jest.fn().mockResolvedValue({}),
      countSessions: jest.fn().mockResolvedValue({}),
    }));
    cache = createMockCache();
    routes = getApiRoutes(mockRootDir, cache);
  });

  it('returns status.json content when file exists', () => {
    // Arrange
    const statusData = {
      stories: { 'US-001': { status: 'done' } },
      epics: { 'EP-001': { title: 'Epic 1' } },
    };
    fs.existsSync.mockReturnValue(true);
    fs.readFileSync.mockReturnValue(JSON.stringify(statusData));
    const statusHandler = routes.static['/api/status'];

    // Act
    const result = statusHandler();

    // Assert
    expect(result.stories).toEqual({ 'US-001': { status: 'done' } });
    expect(result.epics).toEqual({ 'EP-001': { title: 'Epic 1' } });
    expect(result._meta).toHaveProperty('path', mockStatusPath);
    expect(result._meta).toHaveProperty('loaded_at');
  });

  it('returns error when status file does not exist', () => {
    // Arrange
    fs.existsSync.mockReturnValue(false);
    const statusHandler = routes.static['/api/status'];

    // Act
    const result = statusHandler();

    // Assert
    expect(result).toHaveProperty('error', 'Status file not found');
    expect(result).toHaveProperty('path', mockStatusPath);
  });

  it('returns error when status file is invalid JSON', () => {
    // Arrange
    fs.existsSync.mockReturnValue(true);
    fs.readFileSync.mockReturnValue('invalid json {');
    const statusHandler = routes.static['/api/status'];

    // Act
    const result = statusHandler();

    // Assert
    expect(result).toHaveProperty('error', 'Failed to parse status file');
    // Error messages are intentionally sanitized (EP-0034) - no raw error.message exposed
    expect(result).not.toHaveProperty('message');
  });

  it('caches status result on subsequent calls', () => {
    // Arrange
    const statusData = { stories: {} };
    fs.existsSync.mockReturnValue(true);
    fs.readFileSync.mockReturnValue(JSON.stringify(statusData));
    cache.get.mockReturnValueOnce(null).mockReturnValueOnce(statusData);
    const statusHandler = routes.static['/api/status'];

    // Act
    const result1 = statusHandler();
    const result2 = statusHandler();

    // Assert - second call should return cached data
    expect(cache.get).toHaveBeenCalledWith('status');
    expect(cache.set).toHaveBeenCalledWith('status', expect.objectContaining(statusData));
    expect(result2).toEqual(statusData);
  });
});

describe('/api/tasks route', () => {
  let routes;
  let cache;
  let mockTaskRegistry;

  beforeEach(() => {
    jest.clearAllMocks();
    getStatusPath.mockReturnValue(mockStatusPath);
    SessionRegistry.mockImplementation(() => ({
      getAllSessions: jest.fn().mockResolvedValue({}),
      countSessions: jest.fn().mockResolvedValue({}),
    }));

    mockTaskRegistry = {
      getAll: jest.fn().mockReturnValue([
        { id: 'task-1', state: 'queued', story_id: 'US-001', subagent_type: 'AG-API' },
        { id: 'task-2', state: 'running', story_id: 'US-002', subagent_type: 'AG-UI' },
      ]),
      getStats: jest.fn().mockReturnValue({ total: 2, queued: 1, running: 1 }),
    };
    getTaskRegistry.mockReturnValue(mockTaskRegistry);

    cache = createMockCache();
    routes = getApiRoutes(mockRootDir, cache);
  });

  it('returns all tasks without filters', () => {
    // Arrange
    const queryParams = new Map();
    const tasksHandler = routes.static['/api/tasks'];

    // Act
    const result = tasksHandler(queryParams);

    // Assert
    expect(result).toHaveProperty('tasks');
    expect(result).toHaveProperty('stats');
    expect(result).toHaveProperty('timestamp');
    expect(result.tasks).toHaveLength(2);
  });

  it('filters tasks by state', () => {
    // Arrange
    const queryParams = new Map([['state', 'queued']]);
    const tasksHandler = routes.static['/api/tasks'];

    // Act
    tasksHandler(queryParams);

    // Assert
    expect(mockTaskRegistry.getAll).toHaveBeenCalledWith({ state: 'queued' });
  });

  it('filters tasks by story_id', () => {
    // Arrange
    const queryParams = new Map([['story_id', 'US-001']]);
    const tasksHandler = routes.static['/api/tasks'];

    // Act
    tasksHandler(queryParams);

    // Assert
    expect(mockTaskRegistry.getAll).toHaveBeenCalledWith({ story_id: 'US-001' });
  });

  it('filters tasks by subagent_type', () => {
    // Arrange
    const queryParams = new Map([['subagent_type', 'AG-API']]);
    const tasksHandler = routes.static['/api/tasks'];

    // Act
    tasksHandler(queryParams);

    // Assert
    expect(mockTaskRegistry.getAll).toHaveBeenCalledWith({ subagent_type: 'AG-API' });
  });

  it('combines multiple filters', () => {
    // Arrange
    const queryParams = new Map([
      ['state', 'running'],
      ['story_id', 'US-002'],
    ]);
    const tasksHandler = routes.static['/api/tasks'];

    // Act
    tasksHandler(queryParams);

    // Assert
    expect(mockTaskRegistry.getAll).toHaveBeenCalledWith({ state: 'running', story_id: 'US-002' });
  });

  it('returns error when task registry fails', () => {
    // Arrange
    getTaskRegistry.mockImplementation(() => {
      throw new Error('Registry load failed');
    });
    const queryParams = new Map();
    const newRoutes = getApiRoutes(mockRootDir, cache);
    const tasksHandler = newRoutes.static['/api/tasks'];

    // Act
    const result = tasksHandler(queryParams);

    // Assert
    expect(result).toHaveProperty('error', 'Failed to load tasks');
    // Error messages are intentionally sanitized (EP-0034) - no raw error.message exposed
    expect(result).not.toHaveProperty('message');
  });

  it('caches task results', () => {
    // Arrange
    const queryParams = new Map([['state', 'queued']]);
    cache.get.mockReturnValueOnce(null);
    const tasksHandler = routes.static['/api/tasks'];

    // Act
    tasksHandler(queryParams);

    // Assert
    expect(cache.set).toHaveBeenCalled();
  });
});

describe('/api/tasks/:id route', () => {
  let routes;
  let cache;
  let mockTaskRegistry;

  beforeEach(() => {
    jest.clearAllMocks();
    getStatusPath.mockReturnValue(mockStatusPath);
    SessionRegistry.mockImplementation(() => ({
      getAllSessions: jest.fn().mockResolvedValue({}),
      countSessions: jest.fn().mockResolvedValue({}),
    }));

    mockTaskRegistry = {
      get: jest.fn().mockReturnValue({ id: 'task-1', state: 'completed' }),
    };
    getTaskRegistry.mockReturnValue(mockTaskRegistry);

    cache = createMockCache();
    routes = getApiRoutes(mockRootDir, cache);
  });

  it('returns task by ID when found', () => {
    // Arrange
    const getTaskByIdHandler = routes.dynamic['/api/tasks/:id'];
    const params = { id: 'task-1' };

    // Act
    const result = getTaskByIdHandler(new Map(), params);

    // Assert
    expect(result).toHaveProperty('id', 'task-1');
    expect(result).toHaveProperty('state', 'completed');
  });

  it('returns error when task not found', () => {
    // Arrange
    mockTaskRegistry.get.mockReturnValue(null);
    const getTaskByIdHandler = routes.dynamic['/api/tasks/:id'];
    const params = { id: 'nonexistent' };

    // Act
    const result = getTaskByIdHandler(new Map(), params);

    // Assert
    expect(result).toHaveProperty('error', 'Task not found');
    expect(result).toHaveProperty('id', 'nonexistent');
  });

  it('caches task result', () => {
    // Arrange
    cache.get.mockReturnValueOnce(null);
    const getTaskByIdHandler = routes.dynamic['/api/tasks/:id'];
    const params = { id: 'task-1' };

    // Act
    getTaskByIdHandler(new Map(), params);

    // Assert
    expect(cache.set).toHaveBeenCalledWith(
      'task-task-1',
      expect.objectContaining({ id: 'task-1' })
    );
  });
});

describe('/api/epics route', () => {
  let routes;
  let cache;

  beforeEach(() => {
    jest.clearAllMocks();
    getStatusPath.mockReturnValue(mockStatusPath);
    getEpicsDir.mockReturnValue(mockEpicsDir);
    SessionRegistry.mockImplementation(() => ({
      getAllSessions: jest.fn().mockResolvedValue({}),
      countSessions: jest.fn().mockResolvedValue({}),
    }));
    cache = createMockCache();
  });

  it('returns list of epics with titles and statuses', () => {
    // Arrange
    fs.existsSync.mockReturnValue(true);
    fs.readdirSync.mockReturnValue(['EP-001.md', 'EP-002.md']);
    fs.readFileSync
      .mockReturnValueOnce('# Authentication System\n---\nstatus: active\n---')
      .mockReturnValueOnce('# Database Migration\n---\nstatus: completed\n---');

    routes = getApiRoutes(mockRootDir, cache);
    const epicsHandler = routes.static['/api/epics'];

    // Act
    const result = epicsHandler();

    // Assert
    expect(result).toHaveProperty('epics');
    expect(result).toHaveProperty('count', 2);
    expect(result).toHaveProperty('timestamp');
    expect(result.epics).toHaveLength(2);
    expect(result.epics[0].id).toBe('EP-001');
    expect(result.epics[0].title).toBe('Authentication System');
    expect(result.epics[0].status).toBe('active');
  });

  it('returns empty list when epics directory does not exist', () => {
    // Arrange
    fs.existsSync.mockReturnValue(false);
    routes = getApiRoutes(mockRootDir, cache);
    const epicsHandler = routes.static['/api/epics'];

    // Act
    const result = epicsHandler();

    // Assert
    expect(result.epics).toEqual([]);
    expect(result.timestamp).toBeDefined();
    // Note: no 'count' property when directory doesn't exist
  });

  it('extracts title from markdown H1', () => {
    // Arrange
    fs.existsSync.mockReturnValue(true);
    fs.readdirSync.mockReturnValue(['EP-001.md']);
    fs.readFileSync.mockReturnValue('# My Epic Title\n\nDescription here');

    routes = getApiRoutes(mockRootDir, cache);
    const epicsHandler = routes.static['/api/epics'];

    // Act
    const result = epicsHandler();

    // Assert
    expect(result.epics[0].title).toBe('My Epic Title');
  });

  it('uses ID as title when no H1 found', () => {
    // Arrange
    fs.existsSync.mockReturnValue(true);
    fs.readdirSync.mockReturnValue(['EP-001.md']);
    fs.readFileSync.mockReturnValue('No heading here');

    routes = getApiRoutes(mockRootDir, cache);
    const epicsHandler = routes.static['/api/epics'];

    // Act
    const result = epicsHandler();

    // Assert
    expect(result.epics[0].title).toBe('EP-001');
  });

  it('extracts status from frontmatter', () => {
    // Arrange
    fs.existsSync.mockReturnValue(true);
    fs.readdirSync.mockReturnValue(['EP-001.md']);
    fs.readFileSync.mockReturnValue('---\nstatus: completed\n---\n# Title');

    routes = getApiRoutes(mockRootDir, cache);
    const epicsHandler = routes.static['/api/epics'];

    // Act
    const result = epicsHandler();

    // Assert
    expect(result.epics[0].status).toBe('completed');
  });

  it('extracts status from inline format', () => {
    // Arrange
    fs.existsSync.mockReturnValue(true);
    fs.readdirSync.mockReturnValue(['EP-001.md']);
    fs.readFileSync.mockReturnValue('# Title\n\n**Status**: active');

    routes = getApiRoutes(mockRootDir, cache);
    const epicsHandler = routes.static['/api/epics'];

    // Act
    const result = epicsHandler();

    // Assert
    expect(result.epics[0].status).toBe('active');
  });

  it('uses default status when not found', () => {
    // Arrange
    fs.existsSync.mockReturnValue(true);
    fs.readdirSync.mockReturnValue(['EP-001.md']);
    fs.readFileSync.mockReturnValue('# Title\n\nNo status');

    routes = getApiRoutes(mockRootDir, cache);
    const epicsHandler = routes.static['/api/epics'];

    // Act
    const result = epicsHandler();

    // Assert
    expect(result.epics[0].status).toBe('active');
  });

  it('filters out non-markdown files', () => {
    // Arrange
    fs.existsSync.mockReturnValue(true);
    fs.readdirSync.mockReturnValue(['EP-001.md', 'EP-002.txt', 'README.md']);
    fs.readFileSync.mockReturnValue('# Epic\n---\nstatus: active\n---');

    routes = getApiRoutes(mockRootDir, cache);
    const epicsHandler = routes.static['/api/epics'];

    // Act
    const result = epicsHandler();

    // Assert
    expect(result.count).toBe(2); // Only .md files
  });

  it('caches epics result', () => {
    // Arrange
    fs.existsSync.mockReturnValue(true);
    fs.readdirSync.mockReturnValue(['EP-001.md']);
    fs.readFileSync.mockReturnValue('# Epic\n---\nstatus: active\n---');
    cache.get.mockReturnValueOnce(null);

    routes = getApiRoutes(mockRootDir, cache);
    const epicsHandler = routes.static['/api/epics'];

    // Act
    epicsHandler();

    // Assert
    expect(cache.set).toHaveBeenCalledWith('epics', expect.objectContaining({ count: 1 }));
  });
});

describe('/api/epics/:id route', () => {
  let routes;
  let cache;

  beforeEach(() => {
    jest.clearAllMocks();
    getStatusPath.mockReturnValue(mockStatusPath);
    getEpicsDir.mockReturnValue(mockEpicsDir);
    SessionRegistry.mockImplementation(() => ({
      getAllSessions: jest.fn().mockResolvedValue({}),
      countSessions: jest.fn().mockResolvedValue({}),
    }));
    cache = createMockCache();
  });

  it('returns epic by ID with content', () => {
    // Arrange
    fs.existsSync.mockReturnValue(true);
    fs.readFileSync.mockReturnValue('# Auth Epic\n---\nstatus: active\n---\nDescription');

    routes = getApiRoutes(mockRootDir, cache);
    const getEpicByIdHandler = routes.dynamic['/api/epics/:id'];
    const params = { id: 'EP-001' };

    // Act
    const result = getEpicByIdHandler(new Map(), params);

    // Assert
    expect(result).toHaveProperty('id', 'EP-001');
    expect(result).toHaveProperty('title', 'Auth Epic');
    expect(result).toHaveProperty('status', 'active');
    expect(result).toHaveProperty('content');
  });

  it('returns error when epic not found', () => {
    // Arrange
    fs.existsSync.mockReturnValue(false);
    routes = getApiRoutes(mockRootDir, cache);
    const getEpicByIdHandler = routes.dynamic['/api/epics/:id'];
    const params = { id: 'EP-999' };

    // Act
    const result = getEpicByIdHandler(new Map(), params);

    // Assert
    expect(result).toHaveProperty('error', 'Epic not found');
    expect(result).toHaveProperty('id', 'EP-999');
  });

  it('caches epic result', () => {
    // Arrange
    fs.existsSync.mockReturnValue(true);
    fs.readFileSync.mockReturnValue('# Epic\n---\nstatus: active\n---');
    cache.get.mockReturnValueOnce(null);

    routes = getApiRoutes(mockRootDir, cache);
    const getEpicByIdHandler = routes.dynamic['/api/epics/:id'];
    const params = { id: 'EP-001' };

    // Act
    getEpicByIdHandler(new Map(), params);

    // Assert
    expect(cache.set).toHaveBeenCalledWith('epic-EP-001', expect.any(Object));
  });
});

describe('/api/stories route', () => {
  let routes;
  let cache;

  beforeEach(() => {
    jest.clearAllMocks();
    getStatusPath.mockReturnValue(mockStatusPath);
    getStoriesDir.mockReturnValue(mockStoriesDir);
    SessionRegistry.mockImplementation(() => ({
      getAllSessions: jest.fn().mockResolvedValue({}),
      countSessions: jest.fn().mockResolvedValue({}),
    }));
    cache = createMockCache();
  });

  it('returns all stories from status.json', () => {
    // Arrange
    const statusData = {
      stories: {
        'US-001': { status: 'done', epic_id: 'EP-001', owner: 'AG-API' },
        'US-002': { status: 'in-progress', epic_id: 'EP-001', owner: 'AG-UI' },
      },
    };
    fs.existsSync.mockReturnValue(true);
    fs.readFileSync.mockReturnValue(JSON.stringify(statusData));

    routes = getApiRoutes(mockRootDir, cache);
    const storiesHandler = routes.static['/api/stories'];

    // Act
    const result = storiesHandler(new Map());

    // Assert
    expect(result).toHaveProperty('stories');
    expect(result).toHaveProperty('count', 2);
    expect(result.stories).toHaveLength(2);
    expect(result.stories[0].id).toBe('US-001');
  });

  it('filters stories by status', () => {
    // Arrange
    const statusData = {
      stories: {
        'US-001': { status: 'done', epic_id: 'EP-001' },
        'US-002': { status: 'in-progress', epic_id: 'EP-001' },
      },
    };
    fs.existsSync.mockReturnValue(true);
    fs.readFileSync.mockReturnValue(JSON.stringify(statusData));

    routes = getApiRoutes(mockRootDir, cache);
    const storiesHandler = routes.static['/api/stories'];
    const queryParams = new Map([['status', 'done']]);

    // Act
    const result = storiesHandler(queryParams);

    // Assert
    expect(result.count).toBe(1);
    expect(result.stories[0].id).toBe('US-001');
  });

  it('filters stories by epic_id', () => {
    // Arrange
    const statusData = {
      stories: {
        'US-001': { status: 'done', epic_id: 'EP-001' },
        'US-002': { status: 'in-progress', epic_id: 'EP-002' },
      },
    };
    fs.existsSync.mockReturnValue(true);
    fs.readFileSync.mockReturnValue(JSON.stringify(statusData));

    routes = getApiRoutes(mockRootDir, cache);
    const storiesHandler = routes.static['/api/stories'];
    const queryParams = new Map([['epic_id', 'EP-001']]);

    // Act
    const result = storiesHandler(queryParams);

    // Assert
    expect(result.count).toBe(1);
    expect(result.stories[0].epic_id).toBe('EP-001');
  });

  it('filters stories by owner', () => {
    // Arrange
    const statusData = {
      stories: {
        'US-001': { status: 'done', owner: 'AG-API' },
        'US-002': { status: 'in-progress', owner: 'AG-UI' },
      },
    };
    fs.existsSync.mockReturnValue(true);
    fs.readFileSync.mockReturnValue(JSON.stringify(statusData));

    routes = getApiRoutes(mockRootDir, cache);
    const storiesHandler = routes.static['/api/stories'];
    const queryParams = new Map([['owner', 'AG-API']]);

    // Act
    const result = storiesHandler(queryParams);

    // Assert
    expect(result.count).toBe(1);
    expect(result.stories[0].owner).toBe('AG-API');
  });

  it('returns empty list when status file does not exist', () => {
    // Arrange
    fs.existsSync.mockReturnValue(false);
    routes = getApiRoutes(mockRootDir, cache);
    const storiesHandler = routes.static['/api/stories'];

    // Act
    const result = storiesHandler(new Map());

    // Assert
    expect(result.stories).toEqual([]);
    expect(result.count).toBe(0);
  });

  it('caches stories result', () => {
    // Arrange
    const statusData = { stories: { 'US-001': { status: 'done' } } };
    fs.existsSync.mockReturnValue(true);
    fs.readFileSync.mockReturnValue(JSON.stringify(statusData));
    cache.get.mockReturnValueOnce(null);

    routes = getApiRoutes(mockRootDir, cache);
    const storiesHandler = routes.static['/api/stories'];

    // Act
    storiesHandler(new Map());

    // Assert
    expect(cache.set).toHaveBeenCalled();
  });
});

describe('/api/stories/:id route', () => {
  let routes;
  let cache;

  beforeEach(() => {
    jest.clearAllMocks();
    getStatusPath.mockReturnValue(mockStatusPath);
    getStoriesDir.mockReturnValue(mockStoriesDir);
    SessionRegistry.mockImplementation(() => ({
      getAllSessions: jest.fn().mockResolvedValue({}),
      countSessions: jest.fn().mockResolvedValue({}),
    }));
    cache = createMockCache();
  });

  it('returns story by ID from status.json', () => {
    // Arrange
    const statusData = {
      stories: {
        'US-001': { status: 'done', title: 'Test Story', owner: 'AG-API' },
      },
    };
    fs.existsSync.mockReturnValueOnce(true).mockReturnValueOnce(false);
    fs.readFileSync.mockReturnValue(JSON.stringify(statusData));

    routes = getApiRoutes(mockRootDir, cache);
    const getStoryByIdHandler = routes.dynamic['/api/stories/:id'];
    const params = { id: 'US-001' };

    // Act
    const result = getStoryByIdHandler(new Map(), params);

    // Assert
    expect(result).toHaveProperty('id', 'US-001');
    expect(result).toHaveProperty('status', 'done');
    expect(result).toHaveProperty('title', 'Test Story');
  });

  it('includes story content when .md file exists', () => {
    // Arrange
    const statusData = {
      stories: {
        'US-001': { status: 'done', title: 'Test Story' },
      },
    };
    fs.existsSync.mockReturnValueOnce(true).mockReturnValueOnce(true);
    fs.readFileSync
      .mockReturnValueOnce(JSON.stringify(statusData))
      .mockReturnValueOnce('# Story Content\n\nDescription');

    routes = getApiRoutes(mockRootDir, cache);
    const getStoryByIdHandler = routes.dynamic['/api/stories/:id'];
    const params = { id: 'US-001' };

    // Act
    const result = getStoryByIdHandler(new Map(), params);

    // Assert
    expect(result).toHaveProperty('content', '# Story Content\n\nDescription');
  });

  it('returns error when story not found', () => {
    // Arrange
    fs.existsSync.mockReturnValue(false);
    routes = getApiRoutes(mockRootDir, cache);
    const getStoryByIdHandler = routes.dynamic['/api/stories/:id'];
    const params = { id: 'US-999' };

    // Act
    const result = getStoryByIdHandler(new Map(), params);

    // Assert
    expect(result).toHaveProperty('error', 'Story not found');
    expect(result).toHaveProperty('id', 'US-999');
  });

  it('caches story result', () => {
    // Arrange
    const statusData = {
      stories: {
        'US-001': { status: 'done' },
      },
    };
    fs.existsSync.mockReturnValueOnce(true).mockReturnValueOnce(false);
    fs.readFileSync.mockReturnValue(JSON.stringify(statusData));
    cache.get.mockReturnValueOnce(null);

    routes = getApiRoutes(mockRootDir, cache);
    const getStoryByIdHandler = routes.dynamic['/api/stories/:id'];
    const params = { id: 'US-001' };

    // Act
    getStoryByIdHandler(new Map(), params);

    // Assert
    expect(cache.set).toHaveBeenCalledWith('story-US-001', expect.any(Object));
  });
});

describe('/api/metrics route', () => {
  let routes;
  let cache;
  let mockTaskRegistry;

  beforeEach(() => {
    jest.clearAllMocks();
    getStatusPath.mockReturnValue(mockStatusPath);
    getEpicsDir.mockReturnValue(mockEpicsDir);
    SessionRegistry.mockImplementation(() => ({
      getAllSessions: jest.fn().mockResolvedValue({}),
      countSessions: jest.fn().mockResolvedValue({}),
    }));

    mockTaskRegistry = {
      getStats: jest.fn().mockReturnValue({ total: 5, queued: 2, running: 1 }),
    };
    getTaskRegistry.mockReturnValue(mockTaskRegistry);

    cache = createMockCache();
  });

  it('aggregates metrics from all sources', () => {
    // Arrange
    const statusData = {
      stories: {
        'US-001': { status: 'done' },
        'US-002': { status: 'in-progress' },
        'US-003': { status: 'ready' },
      },
    };
    fs.existsSync
      .mockReturnValueOnce(true) // statusPath
      .mockReturnValueOnce(true); // epicsDir
    fs.readFileSync.mockReturnValue(JSON.stringify(statusData));
    fs.readdirSync.mockReturnValue(['EP-001.md', 'EP-002.md']);

    routes = getApiRoutes(mockRootDir, cache);
    const metricsHandler = routes.static['/api/metrics'];

    // Act
    const result = metricsHandler();

    // Assert
    expect(result).toHaveProperty('timestamp');
    expect(result).toHaveProperty('stories');
    expect(result).toHaveProperty('tasks');
    expect(result).toHaveProperty('epics');
  });

  it('calculates story metrics correctly', () => {
    // Arrange
    const statusData = {
      stories: {
        'US-001': { status: 'done' },
        'US-002': { status: 'in-progress' },
        'US-003': { status: 'in-progress' },
        'US-004': { status: 'ready' },
      },
    };
    fs.existsSync.mockReturnValue(true);
    fs.readFileSync.mockReturnValue(JSON.stringify(statusData));
    fs.readdirSync.mockReturnValue([]);

    routes = getApiRoutes(mockRootDir, cache);
    const metricsHandler = routes.static['/api/metrics'];

    // Act
    const result = metricsHandler();

    // Assert
    expect(result.stories.total).toBe(4);
    expect(result.stories.by_status.done).toBe(1);
    expect(result.stories.by_status['in-progress']).toBe(2);
    expect(result.stories.by_status.ready).toBe(1);
    expect(result.stories.completion_percent).toBe(25);
  });

  it('includes task stats', () => {
    // Arrange
    fs.existsSync.mockReturnValue(true);
    fs.readFileSync.mockReturnValue(JSON.stringify({ stories: {} }));
    fs.readdirSync.mockReturnValue([]);

    routes = getApiRoutes(mockRootDir, cache);
    const metricsHandler = routes.static['/api/metrics'];

    // Act
    const result = metricsHandler();

    // Assert
    expect(result.tasks).toHaveProperty('total', 5);
    expect(result.tasks).toHaveProperty('queued', 2);
    expect(result.tasks).toHaveProperty('running', 1);
  });

  it('includes epic count', () => {
    // Arrange
    fs.existsSync.mockReturnValue(true);
    fs.readFileSync.mockReturnValue(JSON.stringify({ stories: {} }));
    fs.readdirSync.mockReturnValue(['EP-001.md', 'EP-002.md', 'EP-003.md']);

    routes = getApiRoutes(mockRootDir, cache);
    const metricsHandler = routes.static['/api/metrics'];

    // Act
    const result = metricsHandler();

    // Assert
    expect(result.epics.total).toBe(3);
  });

  it('handles missing status gracefully', () => {
    // Arrange
    fs.existsSync.mockReturnValue(false);
    routes = getApiRoutes(mockRootDir, cache);
    const metricsHandler = routes.static['/api/metrics'];

    // Act
    const result = metricsHandler();

    // Assert
    // When status file doesn't exist, stories property is not set
    expect(result).not.toHaveProperty('stories');
    expect(result).toHaveProperty('timestamp');
  });

  it('caches metrics result', () => {
    // Arrange
    fs.existsSync.mockReturnValue(false);
    cache.get.mockReturnValueOnce(null);
    routes = getApiRoutes(mockRootDir, cache);
    const metricsHandler = routes.static['/api/metrics'];

    // Act
    metricsHandler();

    // Assert
    expect(cache.set).toHaveBeenCalledWith('metrics', expect.any(Object));
  });
});

// ============================================================================
// Cache Behavior Tests
// ============================================================================

describe('Cache behavior', () => {
  let routes;

  beforeEach(() => {
    jest.clearAllMocks();
    getStatusPath.mockReturnValue(mockStatusPath);
    getEpicsDir.mockReturnValue(mockEpicsDir);
    getStoriesDir.mockReturnValue(mockStoriesDir);
    SessionRegistry.mockImplementation(() => ({
      getAllSessions: jest.fn().mockResolvedValue({}),
      countSessions: jest.fn().mockResolvedValue({}),
    }));
  });

  it('returns cached status without reading file on second call', () => {
    // Arrange
    const cachedStatus = { stories: { 'US-001': {} } };
    const cache = createMockCache();
    cache.get.mockReturnValueOnce(null).mockReturnValueOnce(cachedStatus);
    routes = getApiRoutes(mockRootDir, cache);
    const statusHandler = routes.static['/api/status'];

    fs.existsSync.mockReturnValue(true);
    fs.readFileSync.mockReturnValue(JSON.stringify(cachedStatus));

    // Act
    const result1 = statusHandler();
    fs.readFileSync.mockClear();
    const result2 = statusHandler();

    // Assert
    expect(result2).toEqual(cachedStatus);
  });

  it('cache hit avoids redundant file operations', () => {
    // Arrange
    const epicContent = '# Epic\n---\nstatus: active\n---';
    const cache = createMockCache();
    cache.get.mockReturnValueOnce(null).mockReturnValueOnce({ id: 'EP-001', title: 'Epic' });
    routes = getApiRoutes(mockRootDir, cache);

    fs.existsSync.mockReturnValue(true);
    fs.readdirSync.mockReturnValue(['EP-001.md']);
    fs.readFileSync.mockReturnValue(epicContent);

    // Act
    const epicsHandler = routes.static['/api/epics'];
    epicsHandler();

    const readCountBefore = fs.readFileSync.mock.calls.length;
    epicsHandler();
    const readCountAfter = fs.readFileSync.mock.calls.length;

    // Assert - no additional file reads on cache hit
    expect(readCountAfter).toBe(readCountBefore);
  });
});

describe('Utility functions (indirect testing via routes)', () => {
  let routes;
  let cache;

  beforeEach(() => {
    jest.clearAllMocks();
    getStatusPath.mockReturnValue(mockStatusPath);
    getEpicsDir.mockReturnValue(mockEpicsDir);
    SessionRegistry.mockImplementation(() => ({
      getAllSessions: jest.fn().mockResolvedValue({}),
      countSessions: jest.fn().mockResolvedValue({}),
    }));
    cache = createMockCache();
  });

  describe('extractTitle (tested via /api/epics)', () => {
    it('extracts H1 title from markdown', () => {
      // Arrange
      fs.existsSync.mockReturnValue(true);
      fs.readdirSync.mockReturnValue(['EP-001.md']);
      fs.readFileSync.mockReturnValue('# My Epic Title\n\nDescription');

      routes = getApiRoutes(mockRootDir, cache);
      const epicsHandler = routes.static['/api/epics'];

      // Act
      const result = epicsHandler();

      // Assert
      expect(result.epics[0].title).toBe('My Epic Title');
    });

    it('handles whitespace in title correctly', () => {
      // Arrange
      fs.existsSync.mockReturnValue(true);
      fs.readdirSync.mockReturnValue(['EP-001.md']);
      fs.readFileSync.mockReturnValue('#   Spaced Title   \n\nDescription');

      routes = getApiRoutes(mockRootDir, cache);
      const epicsHandler = routes.static['/api/epics'];

      // Act
      const result = epicsHandler();

      // Assert
      expect(result.epics[0].title).toBe('Spaced Title');
    });

    it('returns null when no H1 found (uses fallback)', () => {
      // Arrange
      fs.existsSync.mockReturnValue(true);
      fs.readdirSync.mockReturnValue(['EP-001.md']);
      fs.readFileSync.mockReturnValue('## H2 Header\n\nNo H1 here');

      routes = getApiRoutes(mockRootDir, cache);
      const epicsHandler = routes.static['/api/epics'];

      // Act
      const result = epicsHandler();

      // Assert
      expect(result.epics[0].title).toBe('EP-001'); // Falls back to ID
    });
  });

  describe('extractStatus (tested via /api/epics)', () => {
    it('extracts status from YAML frontmatter', () => {
      // Arrange
      fs.existsSync.mockReturnValue(true);
      fs.readdirSync.mockReturnValue(['EP-001.md']);
      fs.readFileSync.mockReturnValue('---\nstatus: completed\nauthor: user\n---\n# Title');

      routes = getApiRoutes(mockRootDir, cache);
      const epicsHandler = routes.static['/api/epics'];

      // Act
      const result = epicsHandler();

      // Assert
      expect(result.epics[0].status).toBe('completed');
    });

    it('extracts status from inline **Status**: format (word chars only)', () => {
      // Arrange - Note: regex only captures word chars, so hyphens won't match
      fs.existsSync.mockReturnValue(true);
      fs.readdirSync.mockReturnValue(['EP-001.md']);
      fs.readFileSync.mockReturnValue('# Title\n\n**Status**: active\n\nDetails');

      routes = getApiRoutes(mockRootDir, cache);
      const epicsHandler = routes.static['/api/epics'];

      // Act
      const result = epicsHandler();

      // Assert
      expect(result.epics[0].status).toBe('active');
    });

    it('prefers frontmatter status over inline status', () => {
      // Arrange
      fs.existsSync.mockReturnValue(true);
      fs.readdirSync.mockReturnValue(['EP-001.md']);
      fs.readFileSync.mockReturnValue('---\nstatus: active\n---\n# Title\n\n**Status**: blocked');

      routes = getApiRoutes(mockRootDir, cache);
      const epicsHandler = routes.static['/api/epics'];

      // Act
      const result = epicsHandler();

      // Assert
      expect(result.epics[0].status).toBe('active');
    });

    it('returns null when status not found (uses fallback)', () => {
      // Arrange
      fs.existsSync.mockReturnValue(true);
      fs.readdirSync.mockReturnValue(['EP-001.md']);
      fs.readFileSync.mockReturnValue('# Title\n\nNo status anywhere');

      routes = getApiRoutes(mockRootDir, cache);
      const epicsHandler = routes.static['/api/epics'];

      // Act
      const result = epicsHandler();

      // Assert
      expect(result.epics[0].status).toBe('active'); // Falls back to 'active'
    });

    it('handles case-insensitive inline status', () => {
      // Arrange
      fs.existsSync.mockReturnValue(true);
      fs.readdirSync.mockReturnValue(['EP-001.md']);
      fs.readFileSync.mockReturnValue('# Title\n\n**STATUS**: COMPLETED');

      routes = getApiRoutes(mockRootDir, cache);
      const epicsHandler = routes.static['/api/epics'];

      // Act
      const result = epicsHandler();

      // Assert
      expect(result.epics[0].status).toBe('completed');
    });
  });
});
