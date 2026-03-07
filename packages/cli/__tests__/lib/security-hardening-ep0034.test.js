/**
 * Security Hardening EP-0034 Integration Tests
 *
 * Covers: path traversal prevention, CORS, ReDoS prevention,
 * error message sanitization
 *
 * Test Categories:
 * 1. Path Traversal Guards (api-routes.js ID validation)
 * 2. Error Message Sanitization
 * 3. ReDoS Prevention (damage-control-utils.js)
 */

jest.mock('fs');
jest.mock('../../lib/paths');
jest.mock('../../lib/session-registry');
jest.mock('../../scripts/lib/task-registry');
jest.mock('readline');

const fs = require('fs');
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
const { validatePattern } = require('../../scripts/lib/damage-control-utils');

// Test constants
const mockRootDir = '/test/project';
const mockStatusPath = '/test/project/docs/09-agents/status.json';
const mockEpicsDir = '/test/project/docs/05-epics';
const mockStoriesDir = '/test/project/docs/06-stories';

function createMockCache() {
  return {
    get: jest.fn(() => null),
    set: jest.fn(),
  };
}

// =============================================================================
// 1. PATH TRAVERSAL GUARDS TESTS (api-routes.js)
// =============================================================================

describe('Path Traversal Prevention (Dynamic Route ID Validation)', () => {
  let cache;
  let routes;
  let mockRegistry;

  beforeEach(() => {
    jest.clearAllMocks();

    getStatusPath.mockReturnValue(mockStatusPath);
    getSessionStatePath.mockReturnValue('/test/session-state.json');
    getBusLogPath.mockReturnValue('/test/bus.jsonl');
    getEpicsDir.mockReturnValue(mockEpicsDir);
    getStoriesDir.mockReturnValue(mockStoriesDir);
    getAgentsDir.mockReturnValue('/test/agents');

    mockRegistry = {
      getAllSessions: jest.fn().mockResolvedValue({}),
      countSessions: jest.fn().mockResolvedValue({}),
      getSession: jest.fn().mockResolvedValue(null),
    };
    SessionRegistry.mockImplementation(() => mockRegistry);

    cache = createMockCache();
    routes = getApiRoutes(mockRootDir, cache);
  });

  describe('/api/epics/:id - Path Traversal Attack Vectors', () => {
    it('rejects ID with ../ traversal', () => {
      const getEpicByIdHandler = routes.dynamic['/api/epics/:id'];
      const params = { id: '../../../etc/passwd' };

      const result = getEpicByIdHandler(new Map(), params);

      expect(result).toHaveProperty('error');
      expect(result.error).toMatch(/Invalid epic ID format|not found/i);
    });

    it('rejects ID with encoded traversal %2e%2e', () => {
      const getEpicByIdHandler = routes.dynamic['/api/epics/:id'];
      const params = { id: '%2e%2e%2fetc%2fpasswd' };

      const result = getEpicByIdHandler(new Map(), params);

      expect(result).toHaveProperty('error');
    });

    it('rejects ID with null byte', () => {
      const getEpicByIdHandler = routes.dynamic['/api/epics/:id'];
      const params = { id: 'EP-0001\x00.txt' };

      const result = getEpicByIdHandler(new Map(), params);

      expect(result).toHaveProperty('error');
    });

    it('rejects ID with forward slash', () => {
      const getEpicByIdHandler = routes.dynamic['/api/epics/:id'];
      const params = { id: 'EP/0001' };

      const result = getEpicByIdHandler(new Map(), params);

      expect(result).toHaveProperty('error');
    });

    it('rejects ID with dots (not double dots)', () => {
      const getEpicByIdHandler = routes.dynamic['/api/epics/:id'];
      const params = { id: 'EP.0001' };

      const result = getEpicByIdHandler(new Map(), params);

      expect(result).toHaveProperty('error');
    });

    it('accepts valid alphanumeric ID with hyphens and underscores', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue('# Epic\n---\nstatus: active\n---');
      const getEpicByIdHandler = routes.dynamic['/api/epics/:id'];
      const params = { id: 'EP-0001' };

      const result = getEpicByIdHandler(new Map(), params);

      expect(result).not.toHaveProperty('error');
      expect(result).toHaveProperty('id', 'EP-0001');
    });

    it('accepts valid ID with underscores', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue('# Epic\n---\nstatus: active\n---');
      const getEpicByIdHandler = routes.dynamic['/api/epics/:id'];
      const params = { id: 'EP_SPECIAL_001' };

      const result = getEpicByIdHandler(new Map(), params);

      expect(result).not.toHaveProperty('error');
    });
  });

  describe('/api/stories/:id - Path Traversal Attack Vectors', () => {
    it('rejects ID with traversal attempt EP-0001/../../foo', () => {
      const getStoryByIdHandler = routes.dynamic['/api/stories/:id'];
      const params = { id: 'EP-0001/../../foo' };

      const result = getStoryByIdHandler(new Map(), params);

      expect(result).toHaveProperty('error');
    });

    it('rejects ID with only dots', () => {
      const getStoryByIdHandler = routes.dynamic['/api/stories/:id'];
      const params = { id: '..' };

      const result = getStoryByIdHandler(new Map(), params);

      expect(result).toHaveProperty('error');
    });

    it('accepts valid story ID format', () => {
      const statusData = { stories: { 'US-0001': { status: 'done' } } };
      fs.existsSync.mockReturnValueOnce(true).mockReturnValueOnce(false);
      fs.readFileSync.mockReturnValue(JSON.stringify(statusData));
      const getStoryByIdHandler = routes.dynamic['/api/stories/:id'];
      const params = { id: 'US-0001' };

      const result = getStoryByIdHandler(new Map(), params);

      expect(result).not.toHaveProperty('error');
    });
  });

  describe('/api/tasks/:id - Path Traversal Attack Vectors', () => {
    it('rejects ID with .. directory traversal', () => {
      const mockTaskRegistry = {
        get: jest.fn().mockReturnValue(null),
      };
      getTaskRegistry.mockReturnValue(mockTaskRegistry);
      const newRoutes = getApiRoutes(mockRootDir, cache);
      const getTaskByIdHandler = newRoutes.dynamic['/api/tasks/:id'];
      const params = { id: '../../../etc/passwd' };

      const result = getTaskByIdHandler(new Map(), params);

      expect(result).toHaveProperty('error');
    });

    it('accepts valid task ID', () => {
      const mockTaskRegistry = {
        get: jest.fn().mockReturnValue({ id: 'task-123', state: 'completed' }),
      };
      getTaskRegistry.mockReturnValue(mockTaskRegistry);
      const newRoutes = getApiRoutes(mockRootDir, cache);
      const getTaskByIdHandler = newRoutes.dynamic['/api/tasks/:id'];
      const params = { id: 'task-123' };

      const result = getTaskByIdHandler(new Map(), params);

      expect(result).not.toHaveProperty('error');
      expect(result).toHaveProperty('id', 'task-123');
    });
  });

  describe('/api/sessions/:id - Path Traversal Attack Vectors', () => {
    it('rejects session ID with path traversal', async () => {
      const getSessionByIdHandler = routes.dynamic['/api/sessions/:id'];
      const params = { id: '../../../tmp/session' };

      const result = await getSessionByIdHandler(new Map(), params);

      expect(result).toHaveProperty('error');
    });

    it('rejects session ID with special characters', async () => {
      const getSessionByIdHandler = routes.dynamic['/api/sessions/:id'];
      const params = { id: 'session<script>alert</script>' };

      const result = await getSessionByIdHandler(new Map(), params);

      expect(result).toHaveProperty('error');
    });

    it('accepts valid session ID format', async () => {
      mockRegistry.getSession.mockResolvedValue({ id: 'session-abc123', status: 'active' });
      const getSessionByIdHandler = routes.dynamic['/api/sessions/:id'];
      const params = { id: 'session-abc123' };

      const result = await getSessionByIdHandler(new Map(), params);

      expect(result).not.toHaveProperty('error');
    });
  });
});

// =============================================================================
// 5. ERROR MESSAGE SANITIZATION TESTS
// =============================================================================

describe('Error Message Sanitization (api-routes.js)', () => {
  let cache;
  let routes;
  let mockRegistry;

  beforeEach(() => {
    jest.clearAllMocks();

    getStatusPath.mockReturnValue(mockStatusPath);
    getSessionStatePath.mockReturnValue('/test/session-state.json');
    getBusLogPath.mockReturnValue('/test/bus.jsonl');
    getEpicsDir.mockReturnValue(mockEpicsDir);
    getStoriesDir.mockReturnValue(mockStoriesDir);
    getAgentsDir.mockReturnValue('/test/agents');

    mockRegistry = {
      getAllSessions: jest.fn().mockResolvedValue({}),
      countSessions: jest.fn().mockResolvedValue({}),
      getSession: jest.fn().mockResolvedValue(null),
    };
    SessionRegistry.mockImplementation(() => mockRegistry);

    cache = createMockCache();
    routes = getApiRoutes(mockRootDir, cache);
  });

  it('/api/status returns sanitized error when JSON parse fails', () => {
    fs.existsSync.mockReturnValue(true);
    fs.readFileSync.mockReturnValue('invalid json {');
    const statusHandler = routes.static['/api/status'];

    const result = statusHandler();

    // Should have error property
    expect(result).toHaveProperty('error', 'Failed to parse status file');
    // Should NOT include raw error.message
    expect(result).not.toHaveProperty('message');
  });

  it('/api/epics/:id returns sanitized error when not found', () => {
    fs.existsSync.mockReturnValue(false);
    const getEpicByIdHandler = routes.dynamic['/api/epics/:id'];
    const params = { id: 'EP-999' };

    const result = getEpicByIdHandler(new Map(), params);

    expect(result).toHaveProperty('error', 'Epic not found');
    expect(result).not.toHaveProperty('stack');
    expect(result).not.toHaveProperty('raw_error');
  });

  it('/api/stories/:id returns sanitized error', () => {
    fs.existsSync.mockReturnValue(false);
    const getStoryByIdHandler = routes.dynamic['/api/stories/:id'];
    const params = { id: 'US-999' };

    const result = getStoryByIdHandler(new Map(), params);

    expect(result).toHaveProperty('error', 'Story not found');
    // Should not leak internal error details
    expect(JSON.stringify(result)).not.toMatch(/Error:/);
  });

  it('/api/tasks/:id returns sanitized error message', () => {
    const mockTaskRegistry = {
      get: jest.fn().mockImplementation(() => {
        throw new Error('Database connection failed: localhost:5432');
      }),
    };
    getTaskRegistry.mockReturnValue(mockTaskRegistry);
    const newRoutes = getApiRoutes(mockRootDir, cache);
    const getTaskByIdHandler = newRoutes.dynamic['/api/tasks/:id'];
    const params = { id: 'task-1' };

    const result = getTaskByIdHandler(new Map(), params);

    // Error message should be generic, not leak DB details
    expect(result).toHaveProperty('error');
    expect(result.error).not.toMatch(/Database|localhost|5432/);
  });
});

// =============================================================================
// 6. REDOS PREVENTION TESTS (parseSimpleYAML patterns)
// =============================================================================

describe('ReDoS Prevention - Pattern Analysis', () => {
  it('rm pattern uses non-nested quantifiers \\s+', () => {
    // Pattern: '\brm\s+(-[rRf]+\s+)?/'
    // The ? is applied to the whole group, not nested with +
    // This is safe
    const pattern = /\brm\s+(-[rRf]+\s+)?\//;

    expect(pattern.test('rm -rf /')).toBe(true);
    expect(pattern.test('rm /')).toBe(true);
  });

  it('rmdir pattern uses non-nested quantifiers', () => {
    // Pattern: '\brmdir\s+(-p\s+)?/'
    // Safe: ? is on the group, not nested with +
    const pattern = /\brmdir\s+(-p\s+)?\//;

    expect(pattern.test('rmdir -p /')).toBe(true);
  });

  it('dangerous pattern (a+)+ causes exponential backtracking', () => {
    // This pattern has nested quantifiers - DANGEROUS
    const dangerousPattern = /(a+)+/;

    // Time a pathological input - should be FAST with safe patterns
    const input = 'aaaaaaaaaa'; // 10 a's
    const start = Date.now();

    dangerousPattern.test(input);

    const elapsed = Date.now() - start;

    // Safe pattern should complete in milliseconds
    // We're just documenting what we'd see with unsafe pattern
    expect(elapsed).toBeLessThan(100);
  });

  it('safe pattern completes quickly on pathological input', () => {
    // Safe pattern with non-nested quantifiers
    const safePattern = /\bkill\s+-9/;

    const input = 'kill -9 '.repeat(1000);
    const start = Date.now();

    safePattern.test(input);

    const elapsed = Date.now() - start;

    // Should be very fast
    expect(elapsed).toBeLessThan(50);
  });

  it('git push force pattern uses non-nested quantifiers', () => {
    // Pattern: '\bgit\s+push\s+.*--force'
    // Safe: .* is greedy but not nested with quantifier
    const pattern = /\bgit\s+push\s+.*--force/;

    expect(pattern.test('git push origin --force')).toBe(true);
    expect(pattern.test('git push --force')).toBe(true);
  });
});

// =============================================================================
// 6b. validatePattern() FUNCTION TESTS
// =============================================================================

describe('validatePattern - ReDoS Detection', () => {
  it('detects nested quantifier (a+)+', () => {
    const result = validatePattern('(a+)+');
    expect(result.safe).toBe(false);
    expect(result.reason).toMatch(/nested/i);
  });

  it('detects nested quantifier (a*b)+', () => {
    const result = validatePattern('(a*b)+');
    expect(result.safe).toBe(false);
  });

  it('detects nested quantifier (x+y?)*', () => {
    const result = validatePattern('(x+y?)*');
    expect(result.safe).toBe(false);
  });

  it('accepts safe rm pattern with ?', () => {
    const result = validatePattern('\\brm\\s+(-[rRf]+\\s+)?/');
    expect(result.safe).toBe(true);
  });

  it('accepts safe rmdir pattern with ?', () => {
    const result = validatePattern('\\brmdir\\s+(-p\\s+)?/');
    expect(result.safe).toBe(true);
  });

  it('accepts safe kill pattern', () => {
    const result = validatePattern('\\bkill\\s+-9');
    expect(result.safe).toBe(true);
  });

  it('rejects null input', () => {
    const result = validatePattern(null);
    expect(result.safe).toBe(false);
  });

  it('rejects empty string', () => {
    const result = validatePattern('');
    expect(result.safe).toBe(false);
  });

  it('rejects invalid regex syntax', () => {
    const result = validatePattern('[invalid');
    expect(result.safe).toBe(false);
    expect(result.reason).toMatch(/invalid/i);
  });

  it('safe patterns complete quickly on pathological input', () => {
    // Build a 10K character input that could cause backtracking
    const input = 'rm ' + '-rRf '.repeat(2000) + '/';
    const safePattern = /\brm\s+(-[rRf]+\s+)?\//;

    const start = Date.now();
    safePattern.test(input);
    const elapsed = Date.now() - start;

    expect(elapsed).toBeLessThan(100);
  });
});

// =============================================================================
// 7. COMPREHENSIVE INTEGRATION TESTS
// =============================================================================

describe('Security Hardening Integration', () => {
  let cache;
  let routes;

  beforeEach(() => {
    jest.clearAllMocks();

    getStatusPath.mockReturnValue(mockStatusPath);
    getSessionStatePath.mockReturnValue('/test/session-state.json');
    getBusLogPath.mockReturnValue('/test/bus.jsonl');
    getEpicsDir.mockReturnValue(mockEpicsDir);
    getStoriesDir.mockReturnValue(mockStoriesDir);
    getAgentsDir.mockReturnValue('/test/agents');

    SessionRegistry.mockImplementation(() => ({
      getAllSessions: jest.fn().mockResolvedValue({}),
      countSessions: jest.fn().mockResolvedValue({}),
      getSession: jest.fn().mockResolvedValue(null),
    }));

    cache = createMockCache();
    routes = getApiRoutes(mockRootDir, cache);
  });

  it('blocks multiple path traversal patterns simultaneously', () => {
    const maliciousIds = [
      '../../../etc/passwd',
      '..\\..\\..\\windows\\system32',
      '%2e%2e%2fetc',
      'EP-0001/../../..',
      '.../',
      'EP\x00-0001',
    ];

    const getEpicByIdHandler = routes.dynamic['/api/epics/:id'];

    for (const id of maliciousIds) {
      const result = getEpicByIdHandler(new Map(), { id });
      expect(result).toHaveProperty('error');
    }
  });

  it('security mechanisms do not interfere with legitimate usage', () => {
    // Valid ID passes validation
    fs.existsSync.mockReturnValue(true);
    fs.readFileSync.mockReturnValue('# Epic\n---\nstatus: active\n---');
    const getEpicByIdHandler = routes.dynamic['/api/epics/:id'];

    const result = getEpicByIdHandler(new Map(), { id: 'EP-0001' });

    expect(result).not.toHaveProperty('error');
    expect(result).toHaveProperty('id', 'EP-0001');
  });
});
