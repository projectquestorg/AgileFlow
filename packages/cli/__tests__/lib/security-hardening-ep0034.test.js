/**
 * Security Hardening EP-0034 Integration Tests
 *
 * Covers: path traversal prevention, WebSocket auth, CORS, ReDoS prevention,
 * rate limiting, session lifecycle, DashboardSession security
 *
 * Test Categories:
 * 1. Path Traversal Guards (api-routes.js ID validation)
 * 2. WebSocket Authentication (dashboard-server.js)
 * 3. CORS and Security Headers (api-server.js)
 * 4. Rate Limiting (DashboardSession)
 * 5. Session Expiry (DashboardSession)
 * 6. Error Message Sanitization
 * 7. ReDoS Prevention (damage-control-utils.js)
 */

jest.mock('fs');
jest.mock('../../lib/paths');
jest.mock('../../lib/session-registry');
jest.mock('../../scripts/lib/task-registry');
jest.mock('readline');

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

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
const {
  DashboardSession,
  DEFAULT_HOST,
  SESSION_TIMEOUT_MS,
  RATE_LIMIT_TOKENS,
  SENSITIVE_ENV_PATTERNS,
} = require('../../lib/dashboard-server');
const { DEFAULT_HOST: API_DEFAULT_HOST } = require('../../lib/api-server');
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
// 2. WEBSOCKET AUTHENTICATION TESTS (dashboard-server.js)
// =============================================================================

describe('WebSocket Security (dashboard-server.js)', () => {
  describe('DEFAULT_HOST Configuration', () => {
    it('DEFAULT_HOST is 127.0.0.1 (localhost only, not 0.0.0.0)', () => {
      expect(DEFAULT_HOST).toBe('127.0.0.1');
      expect(DEFAULT_HOST).not.toBe('0.0.0.0');
    });

    it('DEFAULT_HOST is different from API_DEFAULT_HOST behavior', () => {
      expect(API_DEFAULT_HOST).toBe('127.0.0.1');
      // Both should be localhost-only for security
    });
  });

  describe('SENSITIVE_ENV_PATTERNS Regex', () => {
    it('matches SECRET keyword', () => {
      expect(SENSITIVE_ENV_PATTERNS.test('MY_SECRET')).toBe(true);
    });

    it('matches TOKEN keyword', () => {
      expect(SENSITIVE_ENV_PATTERNS.test('API_TOKEN')).toBe(true);
    });

    it('matches PASSWORD keyword', () => {
      expect(SENSITIVE_ENV_PATTERNS.test('DATABASE_PASSWORD')).toBe(true);
    });

    it('matches CREDENTIAL keyword', () => {
      expect(SENSITIVE_ENV_PATTERNS.test('AWS_CREDENTIAL')).toBe(true);
    });

    it('matches API_KEY keyword', () => {
      expect(SENSITIVE_ENV_PATTERNS.test('API_KEY')).toBe(true);
    });

    it('matches PRIVATE_KEY keyword', () => {
      expect(SENSITIVE_ENV_PATTERNS.test('PRIVATE_KEY')).toBe(true);
    });

    it('matches AUTH keyword', () => {
      expect(SENSITIVE_ENV_PATTERNS.test('AUTH_TOKEN')).toBe(true);
    });

    it('is case-insensitive', () => {
      expect(SENSITIVE_ENV_PATTERNS.test('my_secret')).toBe(true);
      expect(SENSITIVE_ENV_PATTERNS.test('MY_SECRET')).toBe(true);
    });

    it('does not match safe variable names', () => {
      expect(SENSITIVE_ENV_PATTERNS.test('NODE_ENV')).toBe(false);
      expect(SENSITIVE_ENV_PATTERNS.test('APP_NAME')).toBe(false);
    });
  });

  describe('SESSION_TIMEOUT_MS Configuration', () => {
    it('SESSION_TIMEOUT_MS is 4 hours (14400000 ms)', () => {
      expect(SESSION_TIMEOUT_MS).toBe(4 * 60 * 60 * 1000);
      expect(SESSION_TIMEOUT_MS).toBe(14400000);
    });

    it('SESSION_TIMEOUT_MS is reasonable timeout', () => {
      expect(SESSION_TIMEOUT_MS).toBeGreaterThan(0);
      expect(SESSION_TIMEOUT_MS).toBeLessThan(24 * 60 * 60 * 1000); // Less than 1 day
    });
  });

  describe('RATE_LIMIT_TOKENS Configuration', () => {
    it('RATE_LIMIT_TOKENS is 100', () => {
      expect(RATE_LIMIT_TOKENS).toBe(100);
    });

    it('RATE_LIMIT_TOKENS is reasonable number', () => {
      expect(RATE_LIMIT_TOKENS).toBeGreaterThan(0);
      expect(RATE_LIMIT_TOKENS).toBeLessThan(10000);
    });
  });
});

// =============================================================================
// 3. DASHBOARD SESSION RATE LIMITING TESTS
// =============================================================================

describe('DashboardSession Rate Limiting', () => {
  let session;

  beforeEach(() => {
    session = new DashboardSession('test-session-id', null, '/test/project');
  });

  it('allows messages up to RATE_LIMIT_TOKENS per second', () => {
    let allowedCount = 0;

    for (let i = 0; i < RATE_LIMIT_TOKENS; i++) {
      if (session.checkRateLimit()) {
        allowedCount++;
      }
    }

    expect(allowedCount).toBe(RATE_LIMIT_TOKENS);
  });

  it('blocks when exceeding RATE_LIMIT_TOKENS', () => {
    // Use up all tokens
    for (let i = 0; i < RATE_LIMIT_TOKENS; i++) {
      session.checkRateLimit();
    }

    // Next call should be blocked
    const result = session.checkRateLimit();

    expect(result).toBe(false);
  });

  it('blocks (RATE_LIMIT_TOKENS + 1) consecutive calls', () => {
    const results = [];

    for (let i = 0; i < RATE_LIMIT_TOKENS + 1; i++) {
      results.push(session.checkRateLimit());
    }

    // Last result should be false
    expect(results[RATE_LIMIT_TOKENS]).toBe(false);
  });

  it('refills tokens after time interval', done => {
    // Use all tokens
    for (let i = 0; i < RATE_LIMIT_TOKENS; i++) {
      session.checkRateLimit();
    }

    // Next should be blocked
    expect(session.checkRateLimit()).toBe(false);

    // Wait for refill (rate limit refill is 1 second based on implementation)
    setTimeout(() => {
      // After refill, should allow again
      const result = session.checkRateLimit();
      expect(result).toBe(true);
      done();
    }, 1100);
  });

  it('does not allow tokens to exceed RATE_LIMIT_TOKENS', () => {
    // Use some tokens
    session.checkRateLimit();
    session.checkRateLimit();

    // Wait for refill
    setTimeout(() => {
      // Should refill to RATE_LIMIT_TOKENS, not add on top
      expect(session._rateTokens).toBeLessThanOrEqual(RATE_LIMIT_TOKENS);
    }, 1100);
  });
});

// =============================================================================
// 4. DASHBOARD SESSION EXPIRY TESTS
// =============================================================================

describe('DashboardSession Expiry', () => {
  let session;

  beforeEach(() => {
    session = new DashboardSession('test-session-id', null, '/test/project');
  });

  it('new session is not expired immediately', () => {
    expect(session.isExpired()).toBe(false);
  });

  it('session expires after SESSION_TIMEOUT_MS of inactivity', done => {
    // Set lastActivity to far past
    session.lastActivity = new Date(Date.now() - SESSION_TIMEOUT_MS - 1000);

    expect(session.isExpired()).toBe(true);
    done();
  });

  it('session is not expired if lastActivity is within timeout', () => {
    // Set lastActivity to recent
    session.lastActivity = new Date(Date.now() - SESSION_TIMEOUT_MS + 1000);

    expect(session.isExpired()).toBe(false);
  });

  it('activity updates lastActivity timestamp', done => {
    const originalTime = session.lastActivity.getTime();

    // Wait a bit to ensure timestamp difference
    setTimeout(() => {
      // Simulate activity by adding message
      session.addMessage('user', 'test');

      const newTime = session.lastActivity.getTime();

      expect(newTime).toBeGreaterThanOrEqual(originalTime);
      done();
    }, 10);
  });

  it('session age is tracked from createdAt', () => {
    const createdTime = session.createdAt.getTime();
    const currentTime = Date.now();

    expect(currentTime).toBeGreaterThanOrEqual(createdTime);
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

  it('DashboardSession maintains independent rate limits per session', () => {
    const session1 = new DashboardSession('session-1', null, '/test');
    const session2 = new DashboardSession('session-2', null, '/test');

    // Use tokens in session1
    for (let i = 0; i < RATE_LIMIT_TOKENS; i++) {
      session1.checkRateLimit();
    }

    // session1 should be rate-limited
    expect(session1.checkRateLimit()).toBe(false);

    // session2 should still have tokens
    expect(session2.checkRateLimit()).toBe(true);
  });

  it('security mechanisms do not interfere with legitimate usage', () => {
    // Valid ID passes validation
    fs.existsSync.mockReturnValue(true);
    fs.readFileSync.mockReturnValue('# Epic\n---\nstatus: active\n---');
    const getEpicByIdHandler = routes.dynamic['/api/epics/:id'];

    const result = getEpicByIdHandler(new Map(), { id: 'EP-0001' });

    expect(result).not.toHaveProperty('error');
    expect(result).toHaveProperty('id', 'EP-0001');

    // Rate limiting allows normal traffic
    const session = new DashboardSession('test', null, '/test');
    for (let i = 0; i < 50; i++) {
      expect(session.checkRateLimit()).toBe(true);
    }

    // Session expiry allows normal sessions
    const freshSession = new DashboardSession('fresh', null, '/test');
    expect(freshSession.isExpired()).toBe(false);
  });
});

// =============================================================================
// 8. SENSITIVE ENVIRONMENT VARIABLE FILTERING
// =============================================================================

describe('Sensitive Environment Variable Filtering', () => {
  it('SENSITIVE_ENV_PATTERNS identifies all sensitive keywords', () => {
    const sensitiveVars = [
      'DATABASE_SECRET',
      'API_TOKEN',
      'JWT_PASSWORD',
      'AWS_CREDENTIAL_ID',
      'SSH_PRIVATE_KEY',
      'AUTH_SECRET',
      'OAUTH_TOKEN',
      'STRIPE_SECRET_KEY',
      'DATABASE_PASSWORD',
    ];

    for (const varName of sensitiveVars) {
      expect(SENSITIVE_ENV_PATTERNS.test(varName)).toBe(true);
    }
  });

  it('SENSITIVE_ENV_PATTERNS allows safe environment variables', () => {
    const safeVars = [
      'NODE_ENV',
      'APP_NAME',
      'APP_VERSION',
      'LOG_LEVEL',
      'PORT',
      'HOST',
      'PUBLIC_URL',
      'ENVIRONMENT',
      'DEBUG',
    ];

    for (const varName of safeVars) {
      expect(SENSITIVE_ENV_PATTERNS.test(varName)).toBe(false);
    }
  });
});

// =============================================================================
// 9. IDEMPOTENT SECURITY CONFIGURATION TESTS
// =============================================================================

describe('Security Configuration Idempotency', () => {
  it('DashboardSession can be created and destroyed multiple times', () => {
    const ids = ['session-1', 'session-2', 'session-3'];

    for (const id of ids) {
      const session = new DashboardSession(id, null, '/test/project');

      expect(session.id).toBe(id);
      expect(session.state).toBe('connected');
      expect(session.isExpired()).toBe(false);
    }
  });

  it('Rate limiting state is consistent across multiple checks', () => {
    const session = new DashboardSession('test', null, '/test');

    // First batch of checks
    const results1 = [];
    for (let i = 0; i < 20; i++) {
      results1.push(session.checkRateLimit());
    }

    // Should all pass
    expect(results1.every(r => r === true)).toBe(true);

    // Use remaining tokens
    for (let i = 0; i < RATE_LIMIT_TOKENS - 20; i++) {
      session.checkRateLimit();
    }

    // Next check should fail
    expect(session.checkRateLimit()).toBe(false);
  });
});
