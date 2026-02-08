/**
 * api-server.js - REST API Server for AgileFlow State Exposure
 *
 * Provides a lightweight Express-based REST API to expose AgileFlow's
 * existing state (sessions, status, tasks, bus messages) for external
 * GUI integrations like dashboards.
 *
 * Design Principles:
 * - READ-ONLY: API exposes state but never mutates it (writes go through CLI)
 * - JSON files remain source of truth
 * - Cache layer with TTL to reduce file I/O
 * - Localhost-only by default for security
 *
 * Usage:
 *   const { createApiServer, startApiServer } = require('./api-server');
 *
 *   // Create server instance
 *   const server = createApiServer({ port: 3456 });
 *
 *   // Start server
 *   await startApiServer(server);
 */

'use strict';

const http = require('http');
const { URL } = require('url');
const { getApiRoutes } = require('./api-routes');
const { getProjectRoot, isAgileflowProject } = require('./paths');

// Default configuration
const DEFAULT_PORT = 3456;
const DEFAULT_HOST = '127.0.0.1'; // Localhost only for security

/**
 * Simple in-memory cache with TTL
 */
class ApiCache {
  constructor(ttlMs = 2000) {
    this.ttlMs = ttlMs;
    this.cache = new Map();
  }

  get(key) {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.time > this.ttlMs) {
      this.cache.delete(key);
      return null;
    }
    return entry.value;
  }

  set(key, value) {
    this.cache.set(key, { value, time: Date.now() });
  }

  clear() {
    this.cache.clear();
  }
}

/**
 * Create API server instance
 *
 * @param {Object} [options={}] - Server options
 * @param {number} [options.port=3456] - Port to listen on
 * @param {string} [options.host='127.0.0.1'] - Host to bind to
 * @param {string} [options.rootDir] - Project root (auto-detected if not provided)
 * @param {number} [options.cacheTTL=2000] - Cache TTL in milliseconds
 * @returns {{ server: http.Server, options: Object, cache: ApiCache }}
 */
function createApiServer(options = {}) {
  const port = options.port || DEFAULT_PORT;
  const host = options.host || DEFAULT_HOST;
  const rootDir = options.rootDir || getProjectRoot();
  const cacheTTL = options.cacheTTL || 2000;

  // Validate project
  if (!isAgileflowProject(rootDir)) {
    throw new Error(`Not an AgileFlow project: ${rootDir}`);
  }

  // Create cache instance
  const cache = new ApiCache(cacheTTL);

  // Get route handlers
  const routes = getApiRoutes(rootDir, cache);

  // Localhost CORS allowlist
  const ALLOWED_ORIGINS = [
    `http://localhost:${port}`,
    `http://127.0.0.1:${port}`,
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:5173',
    'http://127.0.0.1:5173',
  ];

  // Create HTTP server
  const server = http.createServer(async (req, res) => {
    // Security headers
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'application/json');

    // CORS - restrict to localhost origins
    const origin = req.headers.origin;
    if (origin && ALLOWED_ORIGINS.some(allowed => origin === allowed)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Handle preflight
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    // Only allow GET requests
    if (req.method !== 'GET') {
      res.writeHead(405);
      res.end(JSON.stringify({ error: 'Method not allowed', allowed: ['GET'] }));
      return;
    }

    try {
      // Parse URL
      const url = new URL(req.url, `http://${host}:${port}`);
      const pathname = url.pathname;

      // Route matching
      let handler = null;
      let params = {};

      // Static routes
      if (routes.static[pathname]) {
        handler = routes.static[pathname];
      } else {
        // Dynamic routes (with parameters)
        for (const [pattern, routeHandler] of Object.entries(routes.dynamic)) {
          const match = matchRoute(pattern, pathname);
          if (match) {
            handler = routeHandler;
            params = match;
            break;
          }
        }
      }

      if (!handler) {
        res.writeHead(404);
        res.end(
          JSON.stringify({
            error: 'Not found',
            path: pathname,
            available: Object.keys(routes.static),
          })
        );
        return;
      }

      // Execute handler
      const result = await handler(url.searchParams, params);
      res.writeHead(200);
      res.end(JSON.stringify(result, null, 2));
    } catch (error) {
      console.error('[API Error]', error.message);
      res.writeHead(500);
      res.end(
        JSON.stringify({
          error: 'Internal server error',
        })
      );
    }
  });

  return {
    server,
    options: { port, host, rootDir, cacheTTL },
    cache,
  };
}

/**
 * Match a route pattern against a pathname
 *
 * @param {string} pattern - Route pattern (e.g., '/api/sessions/:id')
 * @param {string} pathname - Actual pathname
 * @returns {Object|null} - Matched parameters or null
 */
function matchRoute(pattern, pathname) {
  const patternParts = pattern.split('/');
  const pathParts = pathname.split('/');

  if (patternParts.length !== pathParts.length) {
    return null;
  }

  const params = {};

  for (let i = 0; i < patternParts.length; i++) {
    const patternPart = patternParts[i];
    const pathPart = pathParts[i];

    if (patternPart.startsWith(':')) {
      // Parameter
      params[patternPart.slice(1)] = pathPart;
    } else if (patternPart !== pathPart) {
      // Mismatch
      return null;
    }
  }

  return params;
}

/**
 * Start API server
 *
 * @param {{ server: http.Server, options: Object }} serverInstance - Server instance from createApiServer
 * @returns {Promise<{ url: string, close: Function }>}
 */
function startApiServer(serverInstance) {
  const { server, options } = serverInstance;
  const { port, host } = options;

  return new Promise((resolve, reject) => {
    server.on('error', err => {
      if (err.code === 'EADDRINUSE') {
        reject(new Error(`Port ${port} is already in use`));
      } else {
        reject(err);
      }
    });

    server.listen(port, host, () => {
      const url = `http://${host}:${port}`;
      console.log(`[AgileFlow API] Server running at ${url}`);
      console.log(`[AgileFlow API] Project root: ${options.rootDir}`);
      resolve({
        url,
        close: () =>
          new Promise(res => {
            server.close(res);
          }),
      });
    });
  });
}

/**
 * Stop API server gracefully
 *
 * @param {{ server: http.Server }} serverInstance - Server instance
 * @returns {Promise<void>}
 */
function stopApiServer(serverInstance) {
  return new Promise(resolve => {
    serverInstance.server.close(() => {
      console.log('[AgileFlow API] Server stopped');
      resolve();
    });
  });
}

module.exports = {
  createApiServer,
  startApiServer,
  stopApiServer,
  ApiCache,
  DEFAULT_PORT,
  DEFAULT_HOST,
};
