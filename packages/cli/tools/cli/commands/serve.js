/**
 * AgileFlow CLI - Serve Command
 *
 * Starts a WebSocket server for the AgileFlow Dashboard to connect to.
 * Enables real-time communication between the dashboard and Claude Code.
 */

const chalk = require('chalk');
const path = require('node:path');
const { displayLogo, displaySection, success, warning, info } = require('../lib/ui');

module.exports = {
  name: 'serve',
  description: 'Start WebSocket server for AgileFlow Dashboard',
  options: [
    ['-p, --port <number>', 'Port to listen on (default: 8765)'],
    ['-H, --host <host>', 'Host to bind to (default: 0.0.0.0)'],
    ['-k, --api-key <key>', 'API key for authentication'],
    ['--require-auth', 'Require API key for connections'],
    ['-t, --tunnel', 'Start ngrok tunnel (if installed)'],
  ],
  action: async options => {
    try {
      // Import server modules
      const {
        createDashboardServer,
        startDashboardServer,
        stopDashboardServer,
      } = require('../../../lib/dashboard-server');
      const {
        createNotification,
        createTextDelta,
        createToolStart,
        createToolResult,
      } = require('../../../lib/dashboard-protocol');

      const serverOptions = {
        port: parseInt(options.port, 10) || 8765,
        host: options.host || '0.0.0.0',
        apiKey: options.apiKey || null,
        requireAuth: options.requireAuth || !!options.apiKey,
      };

      // Display banner
      printBanner();
      console.log('Starting server...\n');

      // Create server
      const server = createDashboardServer(serverOptions);

      // Set up event handlers
      setupEventHandlers(server, { createTextDelta, createToolStart, createToolResult });

      // Start server
      const { wsUrl } = await startDashboardServer(server);

      // Start tunnel if requested
      if (options.tunnel) {
        await startTunnel(serverOptions.port);
      }

      console.log('─────────────────────────────────────────────────────────────');
      console.log('');
      console.log(chalk.green('  Ready!') + ' Connect your dashboard to:');
      console.log(chalk.cyan(`  ${wsUrl}`));
      console.log('');
      if (serverOptions.apiKey) {
        console.log(chalk.dim(`  API Key: ${serverOptions.apiKey.slice(0, 8)}...`));
        console.log('');
      }
      console.log(chalk.dim('  Press Ctrl+C to stop.'));
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
    } catch (err) {
      console.error(chalk.red('Error:'), err.message);
      if (process.env.DEBUG) {
        console.error(err.stack);
      }
      process.exit(1);
    }
  },
};

function printBanner() {
  console.log(`
${chalk.hex('#e8683a')('╔═══════════════════════════════════════════════════════════╗')}
${chalk.hex('#e8683a')('║')}                                                           ${chalk.hex('#e8683a')('║')}
${chalk.hex('#e8683a')('║')}   ${chalk.bold.hex('#e8683a')('█████╗  ██████╗ ██╗██╗     ███████╗███████╗██╗      ')}${chalk.hex('#e8683a')('║')}
${chalk.hex('#e8683a')('║')}   ${chalk.bold.hex('#e8683a')('██╔══██╗██╔════╝ ██║██║     ██╔════╝██╔════╝██║      ')}${chalk.hex('#e8683a')('║')}
${chalk.hex('#e8683a')('║')}   ${chalk.bold.hex('#e8683a')('███████║██║  ███╗██║██║     █████╗  █████╗  ██║      ')}${chalk.hex('#e8683a')('║')}
${chalk.hex('#e8683a')('║')}   ${chalk.bold.hex('#e8683a')('██╔══██║██║   ██║██║██║     ██╔══╝  ██╔══╝  ██║      ')}${chalk.hex('#e8683a')('║')}
${chalk.hex('#e8683a')('║')}   ${chalk.bold.hex('#e8683a')('██║  ██║╚██████╔╝██║███████╗███████╗██║     ███████╗ ')}${chalk.hex('#e8683a')('║')}
${chalk.hex('#e8683a')('║')}   ${chalk.bold.hex('#e8683a')('╚═╝  ╚═╝ ╚═════╝ ╚═╝╚══════╝╚══════╝╚═╝     ╚══════╝ ')}${chalk.hex('#e8683a')('║')}
${chalk.hex('#e8683a')('║')}                                                           ${chalk.hex('#e8683a')('║')}
${chalk.hex('#e8683a')('║')}              ${chalk.white('Dashboard WebSocket Server')}                   ${chalk.hex('#e8683a')('║')}
${chalk.hex('#e8683a')('║')}                                                           ${chalk.hex('#e8683a')('║')}
${chalk.hex('#e8683a')('╚═══════════════════════════════════════════════════════════╝')}
`);
}

function setupEventHandlers(server, protocol) {
  const { createTextDelta, createToolStart, createToolResult } = protocol;

  // Session events
  server.on('session:connected', (sessionId, session) => {
    console.log(chalk.dim(`[${new Date().toISOString()}]`) + ` Session connected: ${chalk.cyan(sessionId)}`);
  });

  server.on('session:disconnected', sessionId => {
    console.log(chalk.dim(`[${new Date().toISOString()}]`) + ` Session disconnected: ${chalk.yellow(sessionId)}`);
  });

  // User message handler
  server.on('user:message', async (session, content) => {
    console.log(
      chalk.dim(`[${new Date().toISOString()}]`) +
        ` Message from ${chalk.cyan(session.id)}: ${chalk.white(content.slice(0, 50))}...`
    );

    // Demo response - in production, integrate with Claude API
    await handleDemoMessage(session, content, { createTextDelta, createToolStart, createToolResult });
  });

  // Cancel handler
  server.on('user:cancel', session => {
    console.log(chalk.dim(`[${new Date().toISOString()}]`) + ` Cancel from ${chalk.yellow(session.id)}`);
  });

  // Refresh handlers
  server.on('refresh:tasks', session => {
    console.log(chalk.dim(`[${new Date().toISOString()}]`) + ` Task refresh for ${chalk.cyan(session.id)}`);
  });

  server.on('refresh:status', session => {
    console.log(chalk.dim(`[${new Date().toISOString()}]`) + ` Status refresh for ${chalk.cyan(session.id)}`);
  });
}

async function handleDemoMessage(session, content, protocol) {
  const { createTextDelta, createToolStart, createToolResult } = protocol;

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

async function startTunnel(port) {
  try {
    const { exec } = require('child_process');

    return new Promise((resolve, reject) => {
      // Check if ngrok is installed
      exec('which ngrok', error => {
        if (error) {
          console.log(chalk.yellow('  Tunnel: ngrok not found. Install with: npm install -g ngrok'));
          resolve(null);
          return;
        }

        // Start ngrok tunnel
        const ngrok = exec(`ngrok http ${port} --log stdout`, { encoding: 'utf8' });

        ngrok.stdout.on('data', data => {
          // Parse ngrok output for public URL
          const urlMatch = data.match(/url=(https?:\/\/[^\s]+)/);
          if (urlMatch) {
            const tunnelUrl = urlMatch[1].replace('https://', 'wss://').replace('http://', 'ws://');
            console.log(chalk.green(`  Tunnel: ${tunnelUrl}`));
            resolve(tunnelUrl);
          }
        });

        ngrok.stderr.on('data', data => {
          console.error(chalk.red('  Tunnel error:'), data);
        });

        // Give ngrok a moment to start
        setTimeout(() => {
          if (!ngrok.killed) {
            console.log(chalk.dim('  Tunnel: Starting... check ngrok dashboard'));
            resolve(null);
          }
        }, 5000);
      });
    });
  } catch (error) {
    console.log(chalk.yellow('  Tunnel: Failed to start -'), error.message);
    return null;
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
