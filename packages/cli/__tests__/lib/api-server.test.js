/* global URL */
/**
 * Tests for api-server.js - REST API Server for AgileFlow State Exposure
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');

const {
  createApiServer,
  startApiServer,
  stopApiServer,
  ApiCache,
  DEFAULT_PORT,
} = require('../../lib/api-server');

// Test directory setup
let testDir;

beforeEach(() => {
  testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'api-server-test-'));

  // Create minimal AgileFlow structure
  fs.mkdirSync(path.join(testDir, '.agileflow', 'sessions'), { recursive: true });
  fs.mkdirSync(path.join(testDir, '.agileflow', 'state'), { recursive: true });
  fs.mkdirSync(path.join(testDir, 'docs', '09-agents', 'bus'), { recursive: true });
  fs.mkdirSync(path.join(testDir, 'docs', '05-epics'), { recursive: true });
  fs.mkdirSync(path.join(testDir, 'docs', '06-stories'), { recursive: true });

  // Create status.json
  const status = {
    stories: {
      'US-0001': { title: 'Test Story', status: 'in-progress', owner: 'AG-API' },
      'US-0002': { title: 'Another Story', status: 'ready', epic_id: 'EP-001' },
    },
  };
  fs.writeFileSync(
    path.join(testDir, 'docs', '09-agents', 'status.json'),
    JSON.stringify(status, null, 2)
  );

  // Create session registry
  const registry = {
    schema_version: '1.0.0',
    next_id: 2,
    sessions: {
      1: { status: 'active', worktree: '/path/to/worktree' },
    },
  };
  fs.writeFileSync(
    path.join(testDir, '.agileflow', 'sessions', 'registry.json'),
    JSON.stringify(registry, null, 2)
  );
});

afterEach(() => {
  try {
    fs.rmSync(testDir, { recursive: true, force: true });
  } catch (e) {
    // Ignore cleanup errors
  }
});

describe('ApiCache', () => {
  it('stores and retrieves values', () => {
    const cache = new ApiCache(5000);
    cache.set('key1', { data: 'test' });

    expect(cache.get('key1')).toEqual({ data: 'test' });
  });

  it('returns null for missing keys', () => {
    const cache = new ApiCache(5000);

    expect(cache.get('missing')).toBeNull();
  });

  it('expires values after TTL', async () => {
    const cache = new ApiCache(50); // 50ms TTL
    cache.set('key1', 'value');

    // Wait for TTL to expire
    await new Promise(resolve => setTimeout(resolve, 100));

    expect(cache.get('key1')).toBeNull();
  });

  it('clears all values', () => {
    const cache = new ApiCache(5000);
    cache.set('key1', 'value1');
    cache.set('key2', 'value2');

    cache.clear();

    expect(cache.get('key1')).toBeNull();
    expect(cache.get('key2')).toBeNull();
  });
});

describe('createApiServer', () => {
  it('creates server with default options', () => {
    const serverInstance = createApiServer({ rootDir: testDir });

    expect(serverInstance.server).toBeInstanceOf(http.Server);
    expect(serverInstance.options.port).toBe(DEFAULT_PORT);
    expect(serverInstance.options.host).toBe('127.0.0.1');
    expect(serverInstance.cache).toBeInstanceOf(ApiCache);
  });

  it('accepts custom port', () => {
    const serverInstance = createApiServer({ rootDir: testDir, port: 8888 });

    expect(serverInstance.options.port).toBe(8888);
  });

  it('throws for non-AgileFlow project', () => {
    const nonAgileflowDir = fs.mkdtempSync(path.join(os.tmpdir(), 'non-agileflow-'));

    expect(() => createApiServer({ rootDir: nonAgileflowDir })).toThrow('Not an AgileFlow project');

    fs.rmSync(nonAgileflowDir, { recursive: true, force: true });
  });
});

describe('startApiServer and stopApiServer', () => {
  let serverInstance;

  afterEach(async () => {
    if (serverInstance) {
      await stopApiServer(serverInstance);
    }
  });

  it('starts and stops server', async () => {
    serverInstance = createApiServer({ rootDir: testDir, port: 0 }); // Port 0 = random available port

    const { url, close } = await startApiServer(serverInstance);

    expect(url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);

    await close();
  });

  it('rejects when port is in use', async () => {
    // Start first server
    serverInstance = createApiServer({ rootDir: testDir, port: 9999 });
    await startApiServer(serverInstance);

    // Try to start second server on same port
    const secondServer = createApiServer({ rootDir: testDir, port: 9999 });

    await expect(startApiServer(secondServer)).rejects.toThrow('Port 9999 is already in use');
  });
});

describe('API Endpoints', () => {
  let serverInstance;
  let baseUrl;

  beforeEach(async () => {
    serverInstance = createApiServer({ rootDir: testDir, port: 0 });
    const result = await startApiServer(serverInstance);
    baseUrl = result.url;
  });

  afterEach(async () => {
    if (serverInstance) {
      await stopApiServer(serverInstance);
    }
  });

  const fetch = path => {
    return new Promise((resolve, reject) => {
      const url = new URL(path, baseUrl);
      http
        .get(url, res => {
          let data = '';
          res.on('data', chunk => {
            data += chunk;
          });
          res.on('end', () => {
            try {
              resolve({ status: res.statusCode, data: JSON.parse(data) });
            } catch (e) {
              resolve({ status: res.statusCode, data });
            }
          });
        })
        .on('error', reject);
    });
  };

  it('GET /api returns API info', async () => {
    const { status, data } = await fetch('/api');

    expect(status).toBe(200);
    expect(data.name).toBe('AgileFlow API');
    expect(data.endpoints).toBeDefined();
  });

  it('GET /api/health returns health check', async () => {
    const { status, data } = await fetch('/api/health');

    expect(status).toBe(200);
    expect(data.status).toBe('ok');
    expect(data.checks.status_file).toBe('present');
  });

  it('GET /api/status returns status.json', async () => {
    const { status, data } = await fetch('/api/status');

    expect(status).toBe(200);
    expect(data.stories).toBeDefined();
    expect(data.stories['US-0001'].title).toBe('Test Story');
  });

  it('GET /api/sessions returns sessions', async () => {
    const { status, data } = await fetch('/api/sessions');

    expect(status).toBe(200);
    expect(data.sessions).toHaveLength(1);
    expect(data.sessions[0].id).toBe('1');
  });

  it('GET /api/metrics returns aggregated metrics', async () => {
    const { status, data } = await fetch('/api/metrics');

    expect(status).toBe(200);
    expect(data.stories).toBeDefined();
    expect(data.stories.total).toBe(2);
    expect(data.stories.by_status['in-progress']).toBe(1);
  });

  it('GET /api/stories returns stories with filtering', async () => {
    const { status, data } = await fetch('/api/stories?status=in-progress');

    expect(status).toBe(200);
    expect(data.stories).toHaveLength(1);
    expect(data.stories[0].id).toBe('US-0001');
  });

  it('GET /api/stories/:id returns single story', async () => {
    const { status, data } = await fetch('/api/stories/US-0001');

    expect(status).toBe(200);
    expect(data.id).toBe('US-0001');
    expect(data.title).toBe('Test Story');
  });

  it('GET /unknown returns 404', async () => {
    const { status, data } = await fetch('/unknown/path');

    expect(status).toBe(404);
    expect(data.error).toBe('Not found');
  });

  it('POST returns 405 Method Not Allowed', async () => {
    const result = await new Promise((resolve, reject) => {
      const url = new URL('/api', baseUrl);
      const req = http.request(url, { method: 'POST' }, res => {
        let data = '';
        res.on('data', chunk => {
          data += chunk;
        });
        res.on('end', () => {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        });
      });
      req.on('error', reject);
      req.end();
    });

    expect(result.status).toBe(405);
    expect(result.data.error).toBe('Method not allowed');
  });
});
