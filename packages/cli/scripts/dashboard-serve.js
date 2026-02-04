#!/usr/bin/env node

/**
 * dashboard-serve.js - AgileFlow Dashboard WebSocket Server CLI
 *
 * Starts a WebSocket server that the AgileFlow Dashboard can connect to
 * for real-time communication with Claude Code.
 *
 * Usage:
 *   agileflow serve [options]
 *   node scripts/dashboard-serve.js [options]
 *
 * Options:
 *   --port, -p     Port to listen on (default: 8765)
 *   --host, -h     Host to bind to (default: 0.0.0.0)
 *   --api-key, -k  API key for authentication
 *   --require-auth Require API key for connections
 *   --tunnel, -t   Start ngrok tunnel (if installed)
 */

'use strict';

const path = require('path');
const { createDashboardServer, startDashboardServer, stopDashboardServer } = require('../lib/dashboard-server');
const { createNotification, createTextDelta, createToolStart, createToolResult } = require('../lib/dashboard-protocol');

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    port: 8765,
    host: '0.0.0.0',
    apiKey: null,
    requireAuth: false,
    tunnel: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const next = args[i + 1];

    switch (arg) {
      case '--port':
      case '-p':
        options.port = parseInt(next, 10);
        i++;
        break;
      case '--host':
      case '-h':
        options.host = next;
        i++;
        break;
      case '--api-key':
      case '-k':
        options.apiKey = next;
        options.requireAuth = true;
        i++;
        break;
      case '--require-auth':
        options.requireAuth = true;
        break;
      case '--tunnel':
      case '-t':
        options.tunnel = true;
        break;
      case '--help':
        printHelp();
        process.exit(0);
    }
  }

  return options;
}

function printHelp() {
  console.log(`
AgileFlow Dashboard Server

Starts a WebSocket server for the AgileFlow Dashboard to connect to.

Usage:
  agileflow serve [options]
  node scripts/dashboard-serve.js [options]

Options:
  --port, -p <port>    Port to listen on (default: 8765)
  --host, -h <host>    Host to bind to (default: 0.0.0.0)
  --api-key, -k <key>  API key for authentication
  --require-auth       Require API key for connections
  --tunnel, -t         Start ngrok tunnel (requires ngrok)
  --help               Show this help message

Examples:
  # Start with default settings
  agileflow serve

  # Start on custom port with API key
  agileflow serve --port 9000 --api-key agf_secret123

  # Start with ngrok tunnel
  agileflow serve --tunnel

Dashboard Connection:
  The dashboard should connect to ws://localhost:<port>
  Or use the tunnel URL if --tunnel is enabled.
`);
}

function printBanner() {
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║   █████╗  ██████╗ ██╗██╗     ███████╗███████╗██╗      ║
║  ██╔══██╗██╔════╝ ██║██║     ██╔════╝██╔════╝██║      ║
║  ███████║██║  ███╗██║██║     █████╗  █████╗  ██║      ║
║  ██╔══██║██║   ██║██║██║     ██╔══╝  ██╔══╝  ██║      ║
║  ██║  ██║╚██████╔╝██║███████╗███████╗██║     ███████╗ ║
║  ╚═╝  ╚═╝ ╚═════╝ ╚═╝╚══════╝╚══════╝╚═╝     ╚══════╝ ║
║                                                           ║
║              Dashboard WebSocket Server                   ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
`);
}

async function startTunnel(port) {
  try {
    const { exec } = require('child_process');

    return new Promise((resolve, reject) => {
      // Check if ngrok is installed
      exec('which ngrok', (error) => {
        if (error) {
          console.log('  Tunnel: ngrok not found. Install with: npm install -g ngrok');
          resolve(null);
          return;
        }

        // Start ngrok tunnel
        const ngrok = exec(`ngrok http ${port} --log stdout`, { encoding: 'utf8' });

        ngrok.stdout.on('data', (data) => {
          // Parse ngrok output for public URL
          const urlMatch = data.match(/url=(https?:\/\/[^\s]+)/);
          if (urlMatch) {
            const tunnelUrl = urlMatch[1].replace('https://', 'wss://').replace('http://', 'ws://');
            console.log(`  Tunnel: ${tunnelUrl}`);
            resolve(tunnelUrl);
          }
        });

        ngrok.stderr.on('data', (data) => {
          console.error('  Tunnel error:', data);
        });

        // Give ngrok a moment to start
        setTimeout(() => {
          if (!ngrok.killed) {
            console.log('  Tunnel: Starting... check ngrok dashboard');
            resolve(null);
          }
        }, 5000);
      });
    });
  } catch (error) {
    console.log('  Tunnel: Failed to start -', error.message);
    return null;
  }
}

async function main() {
  const options = parseArgs();

  printBanner();

  console.log('Starting server...\n');

  try {
    // Create server
    const server = createDashboardServer({
      port: options.port,
      host: options.host,
      apiKey: options.apiKey,
      requireAuth: options.requireAuth,
    });

    // Set up event handlers
    setupEventHandlers(server);

    // Start server
    const { wsUrl } = await startDashboardServer(server);

    // Start tunnel if requested
    if (options.tunnel) {
      await startTunnel(options.port);
    }

    console.log('─────────────────────────────────────────────────────────────');
    console.log('');
    console.log('  Ready! Connect your dashboard to:');
    console.log(`  ${wsUrl}`);
    console.log('');
    if (options.apiKey) {
      console.log(`  API Key: ${options.apiKey.slice(0, 8)}...`);
      console.log('');
    }
    console.log('  Press Ctrl+C to stop.');
    console.log('');
    console.log('─────────────────────────────────────────────────────────────');
    console.log('');

    // Handle shutdown
    const shutdown = async () => {
      console.log('\nShutting down...');
      await stopDashboardServer(server);
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

  } catch (error) {
    console.error('Failed to start server:', error.message);
    process.exit(1);
  }
}

/**
 * Set up event handlers for the dashboard server
 */
function setupEventHandlers(server) {
  // Session events
  server.on('session:connected', (sessionId, session) => {
    console.log(`[${new Date().toISOString()}] Session connected: ${sessionId}`);
  });

  server.on('session:disconnected', (sessionId) => {
    console.log(`[${new Date().toISOString()}] Session disconnected: ${sessionId}`);
  });

  // User message handler
  server.on('user:message', async (session, content) => {
    console.log(`[${new Date().toISOString()}] Message from ${session.id}: ${content.slice(0, 50)}...`);

    // For now, send a demo response
    // In production, this would integrate with Claude API
    await handleDemoMessage(session, content);
  });

  // Cancel handler
  server.on('user:cancel', (session) => {
    console.log(`[${new Date().toISOString()}] Cancel from ${session.id}`);
  });

  // Refresh handlers
  server.on('refresh:tasks', (session) => {
    // Send task list update
    console.log(`[${new Date().toISOString()}] Task refresh for ${session.id}`);
  });

  server.on('refresh:status', (session) => {
    // Send status update
    console.log(`[${new Date().toISOString()}] Status refresh for ${session.id}`);
  });
}

/**
 * Handle a demo message (placeholder for Claude integration)
 */
async function handleDemoMessage(session, content) {
  // Simulate thinking delay
  await sleep(500);

  // Simulate tool call
  const toolId = `tool_${Date.now()}`;
  session.send(createToolStart(toolId, 'Read', { file_path: 'package.json' }));

  await sleep(300);

  session.send(createToolResult(toolId, { content: '{"name": "demo", "version": "1.0.0"}' }));

  await sleep(200);

  // Stream a response
  const response = `I received your message: "${content.slice(0, 50)}..."

This is a demo response from the AgileFlow Dashboard Server. In production, this would be connected to Claude Code and stream real responses.

The server is working correctly! You can:
- Send messages (they'll be echoed back)
- See tool call visualizations
- Monitor git status updates

To integrate with Claude, the server emits events that can be connected to the Claude API.`;

  // Stream word by word
  const words = response.split(' ');
  for (let i = 0; i < words.length; i++) {
    const word = words[i] + (i < words.length - 1 ? ' ' : '');
    session.send(createTextDelta(word, i === words.length - 1));
    await sleep(30);
  }

  // Add to history
  session.addMessage('assistant', response);

  // Set idle state
  session.setState('idle');
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Run main
main().catch(console.error);
