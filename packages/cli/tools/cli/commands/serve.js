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
    ['--no-tunnel', 'Disable automatic tunnel (local only)'],
    ['--tunnel-provider <provider>', 'Tunnel provider: cloudflared (default) or ngrok'],
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
      const { execSync } = require('child_process');
      const readline = require('readline');

      let port = parseInt(options.port, 10) || 8765;
      const host = options.host || '0.0.0.0';

      // Check if port is in use and handle it
      port = await handlePortConflict(port, readline);

      const serverOptions = {
        port,
        host,
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

      // Start tunnel automatically (unless --no-tunnel)
      let tunnelUrl = null;
      if (options.tunnel !== false) {
        const provider = options.tunnelProvider || 'cloudflared';
        console.log(chalk.dim(`  Starting ${provider} tunnel...`));
        tunnelUrl = await startTunnel(serverOptions.port, provider);
      }

      console.log('─────────────────────────────────────────────────────────────');
      console.log('');
      if (tunnelUrl) {
        console.log(chalk.green('  Ready!') + ' Connect your dashboard to:');
        console.log('');
        console.log(chalk.cyan.bold(`  ${tunnelUrl}`));
        console.log('');
        console.log(chalk.dim(`  Dashboard: https://dashboard.agileflow.projectquestorg.com`));
        console.log(chalk.dim(`  Paste the URL above into the WebSocket URL field.`));
      } else {
        console.log(chalk.green('  Ready!') + ' Local connection:');
        console.log(chalk.cyan(`  ${wsUrl}`));
        console.log('');
        console.log(chalk.yellow('  ⚠️  For cloud dashboard, run with tunnel:'));
        console.log(chalk.dim('     npx agileflow serve'));
        console.log(chalk.dim('     (tunnels are enabled by default)'));
      }
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
    console.log(
      chalk.dim(`[${new Date().toISOString()}]`) + ` Session connected: ${chalk.cyan(sessionId)}`
    );
  });

  server.on('session:disconnected', sessionId => {
    console.log(
      chalk.dim(`[${new Date().toISOString()}]`) +
        ` Session disconnected: ${chalk.yellow(sessionId)}`
    );
  });

  // User message handler - uses real Claude CLI
  server.on('user:message', async (session, content) => {
    console.log(
      chalk.dim(`[${new Date().toISOString()}]`) +
        ` Message from ${chalk.cyan(session.id)}: ${chalk.white(content.slice(0, 50))}...`
    );

    // Use real Claude CLI
    await handleClaudeMessage(session, content, {
      createTextDelta,
      createToolStart,
      createToolResult,
    });
  });

  // Cancel handler
  server.on('user:cancel', session => {
    console.log(
      chalk.dim(`[${new Date().toISOString()}]`) + ` Cancel from ${chalk.yellow(session.id)}`
    );
    // Note: To properly cancel, we'd need to track the bridge per session
    // For now, this just logs the cancel request
    session.setState('idle');
  });

  // Refresh handlers
  server.on('refresh:tasks', session => {
    console.log(
      chalk.dim(`[${new Date().toISOString()}]`) + ` Task refresh for ${chalk.cyan(session.id)}`
    );
  });

  server.on('refresh:status', session => {
    console.log(
      chalk.dim(`[${new Date().toISOString()}]`) + ` Status refresh for ${chalk.cyan(session.id)}`
    );
  });
}

async function handleClaudeMessage(session, content, protocol) {
  const { createTextDelta, createToolStart, createToolResult } = protocol;
  const { createClaudeBridge } = require('../../../lib/claude-cli-bridge');

  // Set session state to thinking
  session.setState('thinking');

  try {
    const bridge = createClaudeBridge({
      cwd: process.cwd(),

      onText: (text, done) => {
        // Always send text deltas (even empty ones with done=true to signal completion)
        if (text) {
          console.log(
            chalk.dim(`[${new Date().toISOString()}]`) +
              ` Text: ${chalk.green(text.slice(0, 50))}${text.length > 50 ? '...' : ''}`
          );
        }
        session.send(createTextDelta(text || '', done));
        if (done) {
          console.log(
            chalk.dim(`[${new Date().toISOString()}]`) + chalk.green(' Response complete')
          );
          session.setState('idle');
        }
      },

      onToolStart: (id, name, input) => {
        console.log(chalk.dim(`[${new Date().toISOString()}]`) + ` Tool: ${chalk.yellow(name)}`);
        session.send(createToolStart(id, name, input));
      },

      onToolResult: (id, output, isError, toolName) => {
        session.send(createToolResult(id, output, isError ? output : null));
      },

      onError: error => {
        console.error(chalk.red(`[${new Date().toISOString()}]`) + ` Error: ${error}`);
        session.send(createTextDelta(`\n\nError: ${error}`, true));
        session.setState('error');
      },

      onComplete: fullResponse => {
        session.addMessage('assistant', fullResponse);
        session.setState('idle');
      },
    });

    // Send the message to Claude
    await bridge.sendMessage(content);
  } catch (err) {
    console.error(chalk.red('Claude error:'), err.message);
    session.send(createTextDelta(`Error: ${err.message}`, true));
    session.setState('error');
  }
}

async function startTunnel(port, provider = 'cloudflared') {
  const { spawn, exec } = require('child_process');

  // Try cloudflared first (free, no signup needed)
  if (provider === 'cloudflared') {
    const url = await startCloudflaredTunnel(port, spawn, exec);
    if (url) return url;
    // Fall back to ngrok if cloudflared fails
    console.log(chalk.dim('  Trying ngrok as fallback...'));
  }

  // Try ngrok
  return startNgrokTunnel(port, exec);
}

async function startCloudflaredTunnel(port, spawn, exec) {
  return new Promise(resolve => {
    // Check if cloudflared is installed
    exec('which cloudflared', error => {
      if (error) {
        console.log(chalk.yellow('  cloudflared not found.'));
        console.log(
          chalk.dim(
            '  Install: brew install cloudflared (mac) or sudo apt install cloudflared (linux)'
          )
        );
        console.log(
          chalk.dim(
            '  Or download from: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/'
          )
        );
        resolve(null);
        return;
      }

      // Start cloudflared tunnel (quick tunnel, no account needed)
      const tunnel = spawn('cloudflared', ['tunnel', '--url', `http://localhost:${port}`], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let resolved = false;

      const handleOutput = data => {
        const output = data.toString();
        // Look for the tunnel URL in output
        const urlMatch = output.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i);
        if (urlMatch && !resolved) {
          resolved = true;
          const httpsUrl = urlMatch[0];
          const wssUrl = httpsUrl.replace('https://', 'wss://');
          console.log(chalk.green('  ✓ Tunnel ready'));
          resolve(wssUrl);
        }
      };

      tunnel.stdout.on('data', handleOutput);
      tunnel.stderr.on('data', handleOutput);

      tunnel.on('error', err => {
        if (!resolved) {
          console.log(chalk.yellow(`  cloudflared error: ${err.message}`));
          resolve(null);
        }
      });

      // Timeout after 15 seconds
      setTimeout(() => {
        if (!resolved) {
          console.log(chalk.yellow('  cloudflared tunnel timeout'));
          resolve(null);
        }
      }, 15000);
    });
  });
}

async function startNgrokTunnel(port, exec) {
  const { spawn: spawnProcess } = require('child_process');
  return new Promise(resolve => {
    exec('which ngrok', error => {
      if (error) {
        console.log(chalk.yellow('  ngrok not found either.'));
        console.log('');
        console.log(chalk.yellow('  To enable cloud dashboard access, install a tunnel:'));
        console.log(chalk.dim('    brew install cloudflared   # Recommended (free, no signup)'));
        console.log(chalk.dim('    npm install -g ngrok       # Alternative (requires signup)'));
        resolve(null);
        return;
      }

      const ngrok = spawnProcess('ngrok', ['http', String(port), '--log', 'stdout']);

      let resolved = false;

      ngrok.stdout.on('data', data => {
        const urlMatch = data.match(/url=(https?:\/\/[^\s]+)/);
        if (urlMatch && !resolved) {
          resolved = true;
          const tunnelUrl = urlMatch[1].replace('https://', 'wss://').replace('http://', 'ws://');
          console.log(chalk.green('  ✓ ngrok tunnel ready'));
          resolve(tunnelUrl);
        }
      });

      ngrok.stderr.on('data', data => {
        if (!resolved && data.includes('error')) {
          console.error(chalk.red('  ngrok error:'), data);
        }
      });

      setTimeout(() => {
        if (!resolved) {
          console.log(chalk.yellow('  ngrok tunnel timeout'));
          resolve(null);
        }
      }, 10000);
    });
  });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Check if port is in use and handle conflict
 */
async function handlePortConflict(port, readline) {
  const { execFileSync } = require('child_process');
  const net = require('net');

  // Check if port is in use
  const isPortInUse = await new Promise(resolve => {
    const server = net.createServer();
    server.once('error', err => {
      if (err.code === 'EADDRINUSE') {
        resolve(true);
      } else {
        resolve(false);
      }
    });
    server.once('listening', () => {
      server.close();
      resolve(false);
    });
    server.listen(port);
  });

  if (!isPortInUse) {
    return port;
  }

  // Port is in use - find out what's using it
  let processInfo = '';
  try {
    processInfo = execFileSync('lsof', ['-i', `:${Number(port)}`, '-t'], {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  } catch (e) {
    // lsof might not be available or port check failed
  }

  console.log(chalk.yellow(`\n  Port ${port} is already in use.`));

  if (processInfo) {
    console.log(chalk.dim(`  Process ID: ${processInfo}`));
  }

  // Ask user what to do
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise(resolve => {
    console.log('');
    console.log('  Options:');
    console.log(chalk.cyan('    [k]') + ' Kill existing process and use this port');
    console.log(chalk.cyan('    [n]') + ' Use next available port');
    console.log(chalk.cyan('    [q]') + ' Quit');
    console.log('');

    rl.question('  Your choice (k/n/q): ', async answer => {
      rl.close();
      const choice = answer.toLowerCase().trim();

      if (choice === 'k' && processInfo) {
        // Kill the process - validate PID is numeric
        try {
          const pids = processInfo
            .split('\n')
            .map(p => p.trim())
            .filter(p => /^\d+$/.test(p));
          for (const pid of pids) {
            execFileSync('kill', [pid], { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
          }
          console.log(chalk.green(`  Killed process ${processInfo}`));
          await sleep(500); // Give it a moment to release the port
          resolve(port);
        } catch (e) {
          console.log(chalk.red(`  Failed to kill process: ${e.message}`));
          console.log(chalk.dim('  Trying next available port instead...'));
          resolve(await findNextAvailablePort(port));
        }
      } else if (choice === 'n') {
        const newPort = await findNextAvailablePort(port);
        console.log(chalk.green(`  Using port ${newPort}`));
        resolve(newPort);
      } else {
        console.log(chalk.dim('  Exiting.'));
        process.exit(0);
      }
    });
  });
}

/**
 * Find next available port starting from given port
 */
async function findNextAvailablePort(startPort) {
  const net = require('net');
  let port = startPort + 1;

  while (port < startPort + 100) {
    const available = await new Promise(resolve => {
      const server = net.createServer();
      server.once('error', () => resolve(false));
      server.once('listening', () => {
        server.close();
        resolve(true);
      });
      server.listen(port);
    });

    if (available) {
      return port;
    }
    port++;
  }

  throw new Error('Could not find an available port');
}
