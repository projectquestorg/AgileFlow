#!/usr/bin/env node
/**
 * api-server-runner.js - CLI runner for AgileFlow REST API
 *
 * This script can be run directly to start the API server,
 * or imported by other scripts for programmatic control.
 *
 * Usage:
 *   node api-server-runner.js [--port 3456]
 *   PORT=3456 node api-server-runner.js
 */

'use strict';

const path = require('path');
const fs = require('fs');

// Resolve paths - works from both npm package and local development
function resolveLibPath() {
  // Try relative to this script (npm package structure)
  const packageLibPath = path.join(__dirname, '..', 'lib', 'api-server.js');
  if (fs.existsSync(packageLibPath)) {
    return packageLibPath;
  }

  // Try from project root's .agileflow
  const agileflowLibPath = path.join(process.cwd(), '.agileflow', 'lib', 'api-server.js');
  if (fs.existsSync(agileflowLibPath)) {
    return agileflowLibPath;
  }

  // Fallback to require resolution
  return require.resolve('../lib/api-server');
}

const { createApiServer, startApiServer, stopApiServer, DEFAULT_PORT } = require(resolveLibPath());

/**
 * Parse command line arguments
 */
function parseArgs(args) {
  const options = {
    port: parseInt(process.env.PORT || DEFAULT_PORT, 10),
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--port' || arg === '-p') {
      options.port = parseInt(args[++i], 10);
    } else if (arg === '--help' || arg === '-h') {
      options.help = true;
    }
  }

  return options;
}

/**
 * Show help message
 */
function showHelp() {
  console.log(`
AgileFlow API Server

Usage:
  node api-server-runner.js [options]

Options:
  --port, -p <number>  Port to listen on (default: ${DEFAULT_PORT})
  --help, -h           Show this help message

Environment Variables:
  PORT                 Port to listen on (overridden by --port)

Examples:
  node api-server-runner.js
  node api-server-runner.js --port 8080
  PORT=3000 node api-server-runner.js

Endpoints:
  GET /api             API information
  GET /api/health      Health check
  GET /api/sessions    List active sessions
  GET /api/status      Get status.json
  GET /api/tasks       List tasks
  GET /api/bus/messages Get bus messages
  GET /api/metrics     Aggregated metrics
  GET /api/epics       List epics
  GET /api/stories     List stories
`);
}

/**
 * Main entry point
 */
async function main() {
  const args = process.argv.slice(2);
  const options = parseArgs(args);

  if (options.help) {
    showHelp();
    process.exit(0);
  }

  // Validate port
  if (isNaN(options.port) || options.port < 1 || options.port > 65535) {
    console.error(`Invalid port: ${options.port}`);
    process.exit(1);
  }

  let serverInstance;

  try {
    // Create and start server
    serverInstance = createApiServer({ port: options.port });
    const { url } = await startApiServer(serverInstance);

    console.log(`
╭────────────────────────────────────────────╮
│  AgileFlow API Server                      │
├────────────────────────────────────────────┤
│  URL:     ${url.padEnd(31)}│
│  Status:  Running                          │
│  Press Ctrl+C to stop                      │
╰────────────────────────────────────────────╯

Endpoints:
  ${url}/api           - API info
  ${url}/api/health    - Health check
  ${url}/api/status    - Story/epic state
  ${url}/api/sessions  - Active sessions
  ${url}/api/tasks     - Task registry
  ${url}/api/metrics   - Aggregated metrics
`);
  } catch (error) {
    console.error(`Failed to start API server: ${error.message}`);
    process.exit(1);
  }

  // Handle graceful shutdown
  const shutdown = async signal => {
    console.log(`\nReceived ${signal}, shutting down...`);
    try {
      await stopApiServer(serverInstance);
      console.log('API server stopped gracefully');
      process.exit(0);
    } catch (error) {
      console.error(`Error during shutdown: ${error.message}`);
      process.exit(1);
    }
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  // Keep process running
  process.stdin.resume();
}

// Export for programmatic use
module.exports = {
  createApiServer,
  startApiServer,
  stopApiServer,
  parseArgs,
  DEFAULT_PORT,
};

// Run if executed directly
if (require.main === module) {
  main().catch(error => {
    console.error('Unexpected error:', error);
    process.exit(1);
  });
}
