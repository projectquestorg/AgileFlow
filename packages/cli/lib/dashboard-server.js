/* global URL */
/**
 * dashboard-server.js - WebSocket Server for AgileFlow Dashboard
 *
 * Provides real-time bidirectional communication between the CLI and
 * the AgileFlow Dashboard web application.
 *
 * Features:
 * - WebSocket server with session management
 * - Message streaming (text, tool calls, etc.)
 * - Git status updates
 * - Task tracking integration
 * - Multiple client support
 *
 * Usage:
 *   const { createDashboardServer, startDashboardServer } = require('./dashboard-server');
 *
 *   const server = createDashboardServer({ port: 8765 });
 *   await startDashboardServer(server);
 */

'use strict';

const http = require('http');
const crypto = require('crypto');
const { EventEmitter } = require('events');
const {
  OutboundMessageType,
  InboundMessageType,
  createSessionState,
  createError,
  createNotification,
  createGitDiff,
  createTerminalOutput,
  createTerminalExit,
  createAutomationList,
  createAutomationStatus,
  createAutomationResult,
  createInboxList,
  createInboxItem,
  parseInboundMessage,
  serializeMessage,
} = require('./dashboard-protocol');
const { getProjectRoot, isAgileflowProject, getAgentsDir } = require('./paths');
const { validatePath } = require('./validate-paths');
const { execFileSync, spawn } = require('child_process');
const os = require('os');

// Lazy-load automation modules to avoid circular dependencies
let AutomationRegistry = null;
let AutomationRunner = null;

function getAutomationRegistry(rootDir) {
  if (!AutomationRegistry) {
    const mod = require('../scripts/lib/automation-registry');
    AutomationRegistry = mod.getAutomationRegistry;
  }
  return AutomationRegistry({ rootDir });
}

function getAutomationRunner(rootDir) {
  if (!AutomationRunner) {
    const mod = require('../scripts/lib/automation-runner');
    AutomationRunner = mod.getAutomationRunner;
  }
  return AutomationRunner({ rootDir });
}

// Default configuration
const DEFAULT_PORT = 8765;
const DEFAULT_HOST = '127.0.0.1'; // Localhost only for security

// Session lifecycle
const SESSION_TIMEOUT_MS = 4 * 60 * 60 * 1000; // 4 hours
const SESSION_CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

// Rate limiting (token bucket)
const RATE_LIMIT_TOKENS = 100; // max messages per second
const RATE_LIMIT_REFILL_MS = 1000; // refill interval

// Sensitive env var patterns to strip from terminal spawn
const SENSITIVE_ENV_PATTERNS = /SECRET|TOKEN|PASSWORD|CREDENTIAL|API_KEY|PRIVATE_KEY|AUTH/i;

// WebSocket magic GUID for handshake
const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

/**
 * Session state for a connected dashboard
 */
class DashboardSession {
  constructor(id, ws, projectRoot) {
    this.id = id;
    this.ws = ws;
    this.projectRoot = projectRoot;
    this.messages = [];
    this.state = 'connected';
    this.lastActivity = new Date();
    this.createdAt = new Date();
    this.metadata = {};

    // Token bucket rate limiter
    this._rateTokens = RATE_LIMIT_TOKENS;
    this._rateLastRefill = Date.now();
  }

  /**
   * Check if session has expired
   * @returns {boolean}
   */
  isExpired() {
    return Date.now() - this.lastActivity.getTime() > SESSION_TIMEOUT_MS;
  }

  /**
   * Rate-limit incoming messages (token bucket)
   * @returns {boolean} true if allowed, false if rate-limited
   */
  checkRateLimit() {
    const now = Date.now();
    const elapsed = now - this._rateLastRefill;

    // Refill tokens based on elapsed time
    if (elapsed >= RATE_LIMIT_REFILL_MS) {
      this._rateTokens = RATE_LIMIT_TOKENS;
      this._rateLastRefill = now;
    }

    if (this._rateTokens <= 0) {
      return false;
    }

    this._rateTokens--;
    return true;
  }

  /**
   * Send a message to the dashboard
   * @param {Object} message - Message object
   */
  send(message) {
    if (this.ws && this.ws.writable) {
      try {
        const frame = encodeWebSocketFrame(serializeMessage(message));
        this.ws.write(frame);
        this.lastActivity = new Date();
      } catch (error) {
        console.error(`[Session ${this.id}] Send error:`, error.message);
      }
    }
  }

  /**
   * Add a message to conversation history
   * @param {string} role - 'user' or 'assistant'
   * @param {string} content - Message content
   */
  addMessage(role, content) {
    this.messages.push({
      role,
      content,
      timestamp: new Date().toISOString(),
    });
    this.lastActivity = new Date();
  }

  /**
   * Get conversation history
   * @returns {Array}
   */
  getHistory() {
    return this.messages;
  }

  /**
   * Update session state
   * @param {string} state - New state (connected, thinking, idle, error)
   */
  setState(state) {
    this.state = state;
    this.send(
      createSessionState(this.id, state, {
        messageCount: this.messages.length,
        lastActivity: this.lastActivity.toISOString(),
      })
    );
  }
}

/**
 * Terminal instance for integrated terminal
 */
class TerminalInstance {
  constructor(id, session, options = {}) {
    this.id = id;
    this.session = session;
    this.cwd = options.cwd || session.projectRoot;
    this.shell = options.shell || this.getDefaultShell();
    this.cols = options.cols || 80;
    this.rows = options.rows || 24;
    this.pty = null;
    this.closed = false;
  }

  /**
   * Get the default shell for the current OS
   */
  getDefaultShell() {
    if (process.platform === 'win32') {
      return process.env.COMSPEC || 'cmd.exe';
    }
    return process.env.SHELL || '/bin/bash';
  }

  /**
   * Start the terminal process
   */
  /**
   * Get a filtered copy of environment variables with secrets removed
   */
  _getFilteredEnv() {
    const filtered = {};
    for (const [key, value] of Object.entries(process.env)) {
      if (!SENSITIVE_ENV_PATTERNS.test(key)) {
        filtered[key] = value;
      }
    }
    return filtered;
  }

  start() {
    try {
      // Try to use node-pty for proper PTY support
      const pty = require('node-pty');
      const filteredEnv = this._getFilteredEnv();

      this.pty = pty.spawn(this.shell, [], {
        name: 'xterm-256color',
        cols: this.cols,
        rows: this.rows,
        cwd: this.cwd,
        env: {
          ...filteredEnv,
          TERM: 'xterm-256color',
          COLORTERM: 'truecolor',
        },
      });

      this.pty.onData(data => {
        if (!this.closed) {
          this.session.send(createTerminalOutput(this.id, data));
        }
      });

      this.pty.onExit(({ exitCode }) => {
        this.closed = true;
        this.session.send(createTerminalExit(this.id, exitCode));
      });

      return true;
    } catch (error) {
      // Fallback to basic spawn if node-pty is not available
      console.warn('[Terminal] node-pty not available, using basic spawn:', error.message);
      return this.startBasicShell();
    }
  }

  /**
   * Fallback shell using basic spawn (no PTY)
   * Note: This provides limited functionality without node-pty
   */
  startBasicShell() {
    try {
      const filteredEnv = this._getFilteredEnv();

      // Use bash with interactive flag for better compatibility
      this.pty = spawn(this.shell, ['-i'], {
        cwd: this.cwd,
        env: {
          ...filteredEnv,
          TERM: 'dumb',
          PS1: '\\w $ ', // Simple prompt
        },
        shell: false,
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      // Track input buffer for local echo (since no PTY)
      this.inputBuffer = '';

      this.pty.stdout.on('data', data => {
        if (!this.closed) {
          this.session.send(createTerminalOutput(this.id, data.toString()));
        }
      });

      this.pty.stderr.on('data', data => {
        if (!this.closed) {
          this.session.send(createTerminalOutput(this.id, data.toString()));
        }
      });

      this.pty.on('close', exitCode => {
        this.closed = true;
        this.session.send(createTerminalExit(this.id, exitCode));
      });

      this.pty.on('error', error => {
        console.error('[Terminal] Shell error:', error.message);
        if (!this.closed) {
          this.session.send(createTerminalOutput(this.id, `\r\nError: ${error.message}\r\n`));
        }
      });

      // Send welcome message
      setTimeout(() => {
        if (!this.closed) {
          const welcomeMsg = `\x1b[32mAgileFlow Terminal\x1b[0m (basic mode - node-pty not available)\r\n`;
          const cwdMsg = `Working directory: ${this.cwd}\r\n\r\n`;
          this.session.send(createTerminalOutput(this.id, welcomeMsg + cwdMsg));
        }
      }, 100);

      return true;
    } catch (error) {
      console.error('[Terminal] Failed to start basic shell:', error.message);
      return false;
    }
  }

  /**
   * Write data to the terminal
   * @param {string} data - Data to write (user input)
   */
  write(data) {
    if (this.pty && !this.closed) {
      if (this.pty.write) {
        // node-pty style - has built-in echo
        this.pty.write(data);
      } else if (this.pty.stdin) {
        // basic spawn style - need manual echo
        // Echo the input back to the terminal (since no PTY)
        let echoData = data;

        // Handle special characters
        if (data === '\r' || data === '\n') {
          echoData = '\r\n';
        } else if (data === '\x7f' || data === '\b') {
          // Backspace - move cursor back and clear
          echoData = '\b \b';
        } else if (data === '\x03') {
          // Ctrl+C
          echoData = '^C\r\n';
        }

        // Echo to terminal
        this.session.send(createTerminalOutput(this.id, echoData));

        // Send to shell stdin
        this.pty.stdin.write(data);
      }
    }
  }

  /**
   * Resize the terminal
   * @param {number} cols - New column count
   * @param {number} rows - New row count
   */
  resize(cols, rows) {
    this.cols = cols;
    this.rows = rows;
    if (this.pty && this.pty.resize && !this.closed) {
      this.pty.resize(cols, rows);
    }
  }

  /**
   * Close the terminal
   */
  close() {
    this.closed = true;
    if (this.pty) {
      if (this.pty.kill) {
        this.pty.kill();
      } else if (this.pty.destroy) {
        this.pty.destroy();
      }
    }
  }
}

/**
 * Terminal manager for handling multiple terminals per session
 */
class TerminalManager {
  constructor() {
    this.terminals = new Map();
  }

  /**
   * Create a new terminal for a session
   * @param {DashboardSession} session - The session
   * @param {Object} options - Terminal options
   * @returns {string} - Terminal ID
   */
  createTerminal(session, options = {}) {
    const terminalId = options.id || crypto.randomBytes(8).toString('hex');
    const terminal = new TerminalInstance(terminalId, session, {
      cwd: options.cwd || session.projectRoot,
      cols: options.cols,
      rows: options.rows,
    });

    if (terminal.start()) {
      this.terminals.set(terminalId, terminal);
      console.log(`[Terminal ${terminalId}] Created for session ${session.id}`);
      return terminalId;
    }

    return null;
  }

  /**
   * Get a terminal by ID
   * @param {string} terminalId - Terminal ID
   * @returns {TerminalInstance | undefined}
   */
  getTerminal(terminalId) {
    return this.terminals.get(terminalId);
  }

  /**
   * Write to a terminal
   * @param {string} terminalId - Terminal ID
   * @param {string} data - Data to write
   */
  writeToTerminal(terminalId, data) {
    const terminal = this.terminals.get(terminalId);
    if (terminal) {
      terminal.write(data);
    }
  }

  /**
   * Resize a terminal
   * @param {string} terminalId - Terminal ID
   * @param {number} cols - New columns
   * @param {number} rows - New rows
   */
  resizeTerminal(terminalId, cols, rows) {
    const terminal = this.terminals.get(terminalId);
    if (terminal) {
      terminal.resize(cols, rows);
    }
  }

  /**
   * Close a terminal
   * @param {string} terminalId - Terminal ID
   */
  closeTerminal(terminalId) {
    const terminal = this.terminals.get(terminalId);
    if (terminal) {
      terminal.close();
      this.terminals.delete(terminalId);
      console.log(`[Terminal ${terminalId}] Closed`);
    }
  }

  /**
   * Close all terminals for a session
   * @param {string} sessionId - Session ID
   */
  closeSessionTerminals(sessionId) {
    for (const [terminalId, terminal] of this.terminals) {
      if (terminal.session.id === sessionId) {
        terminal.close();
        this.terminals.delete(terminalId);
      }
    }
  }

  /**
   * Get all terminals for a session
   * @param {string} sessionId - Session ID
   * @returns {Array<string>} - Terminal IDs
   */
  getSessionTerminals(sessionId) {
    const terminalIds = [];
    for (const [terminalId, terminal] of this.terminals) {
      if (terminal.session.id === sessionId) {
        terminalIds.push(terminalId);
      }
    }
    return terminalIds;
  }
}

/**
 * Dashboard WebSocket Server
 */
class DashboardServer extends EventEmitter {
  constructor(options = {}) {
    super();

    this.port = options.port || DEFAULT_PORT;
    this.host = options.host || DEFAULT_HOST;
    this.projectRoot = options.projectRoot || getProjectRoot();

    // Auth is on by default - auto-generate key if not provided
    // Set requireAuth: false explicitly to disable
    this.requireAuth = options.requireAuth !== false;
    this.apiKey = options.apiKey || (this.requireAuth ? crypto.randomBytes(32).toString('hex') : null);

    // Session management
    this.sessions = new Map();

    // Terminal management
    this.terminalManager = new TerminalManager();

    // Automation management
    this._automationRegistry = null;
    this._automationRunner = null;
    this._runningAutomations = new Map(); // automationId -> { startTime, session }

    // Inbox management
    this._inbox = new Map(); // itemId -> InboxItem

    // Session cleanup interval
    this._cleanupInterval = null;

    // HTTP server for WebSocket upgrade
    this.httpServer = null;

    // Validate project
    if (!isAgileflowProject(this.projectRoot)) {
      throw new Error(`Not an AgileFlow project: ${this.projectRoot}`);
    }

    // Initialize automation registry lazily
    this._initAutomations();
  }

  /**
   * Initialize automation registry and runner
   */
  _initAutomations() {
    try {
      this._automationRegistry = getAutomationRegistry(this.projectRoot);
      this._automationRunner = getAutomationRunner(this.projectRoot);

      // Listen to runner events
      this._automationRunner.on('started', ({ automationId }) => {
        this._runningAutomations.set(automationId, { startTime: Date.now() });
        this.broadcast(createAutomationStatus(automationId, 'running'));
      });

      this._automationRunner.on('completed', ({ automationId, result }) => {
        this._runningAutomations.delete(automationId);
        this.broadcast(createAutomationStatus(automationId, 'completed', result));

        // Add result to inbox if it has output or changes
        if (result.output || result.changes) {
          this._addToInbox(automationId, result);
        }
      });

      this._automationRunner.on('failed', ({ automationId, result }) => {
        this._runningAutomations.delete(automationId);
        this.broadcast(createAutomationStatus(automationId, 'error', { error: result.error }));

        // Add failure to inbox
        this._addToInbox(automationId, result);
      });
    } catch (error) {
      console.error('[DashboardServer] Failed to init automations:', error.message);
    }
  }

  /**
   * Add an automation result to the inbox
   * @param {string} automationId - Automation ID
   * @param {Object} result - Run result
   */
  _addToInbox(automationId, result) {
    const automation = this._automationRegistry?.get(automationId);
    const itemId = `inbox_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const item = {
      id: itemId,
      automationId,
      title: automation?.name || automationId,
      summary: result.success
        ? result.output?.slice(0, 200) || 'Completed successfully'
        : result.error?.slice(0, 200) || 'Failed',
      timestamp: new Date().toISOString(),
      status: 'unread',
      result: {
        success: result.success,
        output: result.output,
        error: result.error,
        duration_ms: result.duration_ms,
      },
    };

    this._inbox.set(itemId, item);
    this.broadcast(createInboxItem(item));
  }

  /**
   * Start the WebSocket server
   * @returns {Promise<{ url: string, wsUrl: string }>}
   */
  start() {
    return new Promise((resolve, reject) => {
      const securityHeaders = {
        'Content-Type': 'application/json',
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'Cache-Control': 'no-store',
      };

      this.httpServer = http.createServer((req, res) => {
        // Simple health check endpoint
        if (req.url === '/health') {
          res.writeHead(200, securityHeaders);
          res.end(
            JSON.stringify({
              status: 'ok',
              sessions: this.sessions.size,
              project: require('path').basename(this.projectRoot),
            })
          );
          return;
        }

        // Info endpoint
        if (req.url === '/') {
          res.writeHead(200, securityHeaders);
          res.end(
            JSON.stringify({
              name: 'AgileFlow Dashboard Server',
              version: '1.0.0',
              ws: `ws://${this.host === '127.0.0.1' ? 'localhost' : this.host}:${this.port}`,
              sessions: this.sessions.size,
            })
          );
          return;
        }

        res.writeHead(404);
        res.end();
      });

      // Handle WebSocket upgrade
      this.httpServer.on('upgrade', (req, socket, head) => {
        this.handleUpgrade(req, socket, head);
      });

      this.httpServer.on('error', err => {
        if (err.code === 'EADDRINUSE') {
          reject(new Error(`Port ${this.port} is already in use`));
        } else {
          reject(err);
        }
      });

      this.httpServer.listen(this.port, this.host, () => {
        const url = `http://${this.host === '0.0.0.0' ? 'localhost' : this.host}:${this.port}`;
        const wsUrl = `ws://${this.host === '0.0.0.0' ? 'localhost' : this.host}:${this.port}`;

        console.log(`\n[AgileFlow Dashboard Server]`);
        console.log(`  WebSocket: ${wsUrl}`);
        console.log(`  Health:    ${url}/health`);
        console.log(`  Project:   ${this.projectRoot}`);
        console.log(`  Auth:      ${this.requireAuth ? 'Required' : 'Not required'}`);
        if (this.requireAuth && this.apiKey) {
          console.log(`  API Key:   ${this.apiKey.slice(0, 8)}...`);
        }
        console.log('');

        // Start session cleanup interval
        this._cleanupInterval = setInterval(() => {
          this._cleanupExpiredSessions();
        }, SESSION_CLEANUP_INTERVAL_MS);
        this._cleanupInterval.unref();

        resolve({ url, wsUrl, apiKey: this.apiKey });
      });
    });
  }

  /**
   * Handle WebSocket upgrade request
   */
  handleUpgrade(req, socket, head) {
    // Validate WebSocket upgrade headers
    if (req.headers.upgrade?.toLowerCase() !== 'websocket') {
      socket.destroy();
      return;
    }

    // Check API key if required
    if (this.requireAuth && this.apiKey) {
      const authHeader = req.headers['x-api-key'] || req.headers.authorization;
      const providedKey = authHeader?.replace('Bearer ', '') || '';

      // Use timing-safe comparison to prevent timing attacks
      const keyBuffer = Buffer.from(this.apiKey, 'utf8');
      const providedBuffer = Buffer.from(providedKey, 'utf8');
      if (keyBuffer.length !== providedBuffer.length ||
          !crypto.timingSafeEqual(keyBuffer, providedBuffer)) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }
    }

    // Check WebSocket origin against localhost allowlist
    const origin = req.headers.origin;
    if (origin) {
      const LOCALHOST_ORIGINS = [
        'http://localhost', 'https://localhost',
        'http://127.0.0.1', 'https://127.0.0.1',
        'http://[::1]', 'https://[::1]',
      ];
      const isLocalhost = LOCALHOST_ORIGINS.some(
        allowed => origin === allowed || origin.startsWith(allowed + ':')
      );
      if (!isLocalhost) {
        socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
        socket.destroy();
        return;
      }
    }

    // Complete WebSocket handshake
    const key = req.headers['sec-websocket-key'];
    const acceptKey = crypto
      .createHash('sha1')
      .update(key + WS_GUID)
      .digest('base64');

    const responseHeaders = [
      'HTTP/1.1 101 Switching Protocols',
      'Upgrade: websocket',
      'Connection: Upgrade',
      `Sec-WebSocket-Accept: ${acceptKey}`,
      '',
      '',
    ].join('\r\n');

    socket.write(responseHeaders);

    // Create session
    const sessionId = this.getSessionId(req);
    this.createSession(sessionId, socket);
  }

  /**
   * Get or generate session ID from request
   */
  getSessionId(req) {
    // Check for session ID in query string
    const url = new URL(req.url, `http://${req.headers.host}`);
    const sessionId = url.searchParams.get('session_id');

    if (sessionId && this.sessions.has(sessionId)) {
      return sessionId; // Resume existing session
    }

    // Generate new session ID
    return crypto.randomBytes(16).toString('hex');
  }

  /**
   * Create a new dashboard session
   */
  createSession(sessionId, socket) {
    // Check if resuming existing session
    let session = this.sessions.get(sessionId);
    const isResume = !!session;

    if (!session) {
      session = new DashboardSession(sessionId, socket, this.projectRoot);
      this.sessions.set(sessionId, session);
    } else {
      // Update socket for resumed session
      session.ws = socket;
    }

    console.log(`[Session ${sessionId}] ${isResume ? 'Resumed' : 'Connected'}`);

    // Send initial state
    session.send(
      createSessionState(sessionId, 'connected', {
        resumed: isResume,
        messageCount: session.messages.length,
        project: require('path').basename(this.projectRoot),
      })
    );

    // Send initial git status
    this.sendGitStatus(session);

    // Send initial automation list and inbox
    this.sendAutomationList(session);
    this.sendInboxList(session);

    // Handle incoming messages
    let buffer = Buffer.alloc(0);

    socket.on('data', data => {
      buffer = Buffer.concat([buffer, data]);

      // Process complete WebSocket frames
      while (buffer.length >= 2) {
        const frame = decodeWebSocketFrame(buffer);
        if (!frame) break;

        buffer = buffer.slice(frame.totalLength);

        if (frame.opcode === 0x8) {
          // Close frame
          socket.end();
          return;
        }

        if (frame.opcode === 0x9) {
          // Ping - send pong
          socket.write(encodeWebSocketFrame('', 0x0a));
          continue;
        }

        if (frame.opcode === 0x1 || frame.opcode === 0x2) {
          // Text or binary frame
          this.handleMessage(session, frame.payload.toString());
        }
      }
    });

    socket.on('close', () => {
      console.log(`[Session ${sessionId}] Disconnected`);
      // Keep session for potential reconnect
      session.ws = null;
      session.state = 'disconnected';
      this.emit('session:disconnected', sessionId);
    });

    socket.on('error', err => {
      console.error(`[Session ${sessionId}] Socket error:`, err.message);
    });

    this.emit('session:connected', sessionId, session);
  }

  /**
   * Handle incoming message from dashboard
   */
  handleMessage(session, data) {
    // Rate limit incoming messages
    if (!session.checkRateLimit()) {
      session.send(createError('RATE_LIMITED', 'Too many messages, please slow down'));
      return;
    }

    const message = parseInboundMessage(data);
    if (!message) {
      session.send(createError('INVALID_MESSAGE', 'Failed to parse message'));
      return;
    }

    console.log(`[Session ${session.id}] Received: ${message.type}`);

    switch (message.type) {
      case InboundMessageType.MESSAGE:
        this.handleUserMessage(session, message);
        break;

      case InboundMessageType.CANCEL:
        this.handleCancel(session);
        break;

      case InboundMessageType.REFRESH:
        this.handleRefresh(session, message);
        break;

      case InboundMessageType.GIT_STAGE:
      case InboundMessageType.GIT_UNSTAGE:
      case InboundMessageType.GIT_REVERT:
      case InboundMessageType.GIT_COMMIT:
        this.handleGitAction(session, message);
        break;

      case InboundMessageType.GIT_DIFF_REQUEST:
        this.handleDiffRequest(session, message);
        break;

      case InboundMessageType.SESSION_CLOSE:
        this.closeSession(session.id);
        break;

      case InboundMessageType.TERMINAL_SPAWN:
        this.handleTerminalSpawn(session, message);
        break;

      case InboundMessageType.TERMINAL_INPUT:
        this.handleTerminalInput(session, message);
        break;

      case InboundMessageType.TERMINAL_RESIZE:
        this.handleTerminalResize(session, message);
        break;

      case InboundMessageType.TERMINAL_CLOSE:
        this.handleTerminalClose(session, message);
        break;

      case InboundMessageType.AUTOMATION_LIST_REQUEST:
        this.sendAutomationList(session);
        break;

      case InboundMessageType.AUTOMATION_RUN:
        this.handleAutomationRun(session, message);
        break;

      case InboundMessageType.AUTOMATION_STOP:
        this.handleAutomationStop(session, message);
        break;

      case InboundMessageType.INBOX_LIST_REQUEST:
        this.sendInboxList(session);
        break;

      case InboundMessageType.INBOX_ACTION:
        this.handleInboxAction(session, message);
        break;

      default:
        console.log(`[Session ${session.id}] Unhandled message type: ${message.type}`);
        this.emit('message', session, message);
    }
  }

  /**
   * Handle user message - forward to Claude
   */
  handleUserMessage(session, message) {
    const content = message.content?.trim();
    if (!content) {
      session.send(createError('EMPTY_MESSAGE', 'Message content is empty'));
      return;
    }

    // Add to conversation history
    session.addMessage('user', content);

    // Update state
    session.setState('thinking');

    // Emit for external handling (Claude API integration)
    this.emit('user:message', session, content);
  }

  /**
   * Handle cancel request
   */
  handleCancel(session) {
    session.setState('idle');
    session.send(createNotification('info', 'Cancelled', 'Operation cancelled'));
    this.emit('user:cancel', session);
  }

  /**
   * Handle refresh request
   */
  handleRefresh(session, message) {
    const what = message.what || 'all';

    switch (what) {
      case 'git':
        this.sendGitStatus(session);
        break;
      case 'tasks':
        this.emit('refresh:tasks', session);
        break;
      case 'status':
        this.emit('refresh:status', session);
        break;
      case 'automations':
        this.sendAutomationList(session);
        break;
      case 'inbox':
        this.sendInboxList(session);
        break;
      default:
        this.sendGitStatus(session);
        this.sendAutomationList(session);
        this.sendInboxList(session);
        this.emit('refresh:all', session);
    }
  }

  /**
   * Handle git actions
   */
  handleGitAction(session, message) {
    const { type, files, message: commitMessage } = message;

    // Validate file paths - reject path traversal attempts
    if (files && files.length > 0) {
      for (const f of files) {
        if (typeof f !== 'string' || f.includes('\0')) {
          session.send(createError('GIT_ERROR', 'Invalid file path'));
          return;
        }
        const resolved = require('path').resolve(this.projectRoot, f);
        if (!resolved.startsWith(this.projectRoot)) {
          session.send(createError('GIT_ERROR', 'File path outside project'));
          return;
        }
      }
    }

    // Validate commit message
    if (commitMessage !== undefined && commitMessage !== null) {
      if (
        typeof commitMessage !== 'string' ||
        commitMessage.length > 10000 ||
        commitMessage.includes('\0')
      ) {
        session.send(createError('GIT_ERROR', 'Invalid commit message'));
        return;
      }
    }

    const fileArgs = files && files.length > 0 ? files : null;

    try {
      switch (type) {
        case InboundMessageType.GIT_STAGE:
          if (fileArgs) {
            execFileSync('git', ['add', '--', ...fileArgs], { cwd: this.projectRoot });
          } else {
            execFileSync('git', ['add', '-A'], { cwd: this.projectRoot });
          }
          break;
        case InboundMessageType.GIT_UNSTAGE:
          if (fileArgs) {
            execFileSync('git', ['restore', '--staged', '--', ...fileArgs], {
              cwd: this.projectRoot,
            });
          } else {
            execFileSync('git', ['restore', '--staged', '.'], { cwd: this.projectRoot });
          }
          break;
        case InboundMessageType.GIT_REVERT:
          if (fileArgs) {
            execFileSync('git', ['checkout', '--', ...fileArgs], { cwd: this.projectRoot });
          }
          break;
        case InboundMessageType.GIT_COMMIT:
          if (commitMessage) {
            execFileSync('git', ['commit', '-m', commitMessage], { cwd: this.projectRoot });
          }
          break;
      }

      // Send updated git status
      this.sendGitStatus(session);
      session.send(createNotification('success', 'Git', `${type.replace('git_', '')} completed`));
    } catch (error) {
      console.error('[Git Error]', error.message);
      session.send(createError('GIT_ERROR', 'Git operation failed'));
    }
  }

  /**
   * Send git status to session
   */
  sendGitStatus(session) {
    try {
      const status = this.getGitStatus();
      session.send({
        type: OutboundMessageType.GIT_STATUS,
        ...status,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('[Git Status Error]', error.message);
    }
  }

  /**
   * Get current git status
   */
  getGitStatus() {
    try {
      const branch = execFileSync('git', ['branch', '--show-current'], {
        cwd: this.projectRoot,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      }).trim();

      const statusOutput = execFileSync('git', ['status', '--porcelain'], {
        cwd: this.projectRoot,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      const staged = [];
      const unstaged = [];

      for (const line of statusOutput.split('\n').filter(Boolean)) {
        const indexStatus = line[0];
        const workTreeStatus = line[1];
        const file = line.slice(3);

        // Parse the status character to a descriptive status
        const parseStatus = char => {
          switch (char) {
            case 'A':
              return 'added';
            case 'M':
              return 'modified';
            case 'D':
              return 'deleted';
            case 'R':
              return 'renamed';
            case 'C':
              return 'copied';
            case '?':
              return 'untracked';
            default:
              return 'modified';
          }
        };

        if (indexStatus !== ' ' && indexStatus !== '?') {
          staged.push({ path: file, file, status: parseStatus(indexStatus) });
        }
        if (workTreeStatus !== ' ') {
          unstaged.push({
            path: file,
            file,
            status: workTreeStatus === '?' ? 'untracked' : parseStatus(workTreeStatus),
          });
        }
      }

      return { branch, staged, unstaged };
    } catch {
      return { branch: 'unknown', staged: [], unstaged: [] };
    }
  }

  /**
   * Handle diff request for a file
   */
  handleDiffRequest(session, message) {
    const { path: filePath, staged } = message;

    if (!filePath) {
      session.send(createError('INVALID_REQUEST', 'File path is required'));
      return;
    }

    try {
      const diff = this.getFileDiff(filePath, staged);
      const stats = this.parseDiffStats(diff);

      session.send(
        createGitDiff(filePath, diff, {
          additions: stats.additions,
          deletions: stats.deletions,
          staged: !!staged,
        })
      );
    } catch (error) {
      console.error('[Diff Error]', error.message);
      session.send(createError('DIFF_ERROR', 'Failed to get diff'));
    }
  }

  /**
   * Get diff for a specific file
   * @param {string} filePath - Path to the file
   * @param {boolean} staged - Whether to get staged diff
   * @returns {string} - The diff content
   */
  getFileDiff(filePath, staged = false) {
    // Validate filePath stays within project root
    const pathResult = validatePath(filePath, this.projectRoot, { allowSymlinks: true });
    if (!pathResult.ok) {
      return '';
    }

    try {
      const diffArgs = staged ? ['diff', '--cached', '--', filePath] : ['diff', '--', filePath];

      const diff = execFileSync('git', diffArgs, {
        cwd: this.projectRoot,
        encoding: 'utf8',
      });

      // If no diff, file might be untracked - show entire file content as addition
      if (!diff && !staged) {
        const statusOutput = execFileSync('git', ['status', '--porcelain', '--', filePath], {
          cwd: this.projectRoot,
          encoding: 'utf8',
        }).trim();

        // Check if file is untracked
        if (statusOutput.startsWith('??')) {
          try {
            const content = require('fs').readFileSync(
              require('path').join(this.projectRoot, filePath),
              'utf8'
            );
            // Format as a new file diff
            const lines = content.split('\n');
            return [
              `diff --git a/${filePath} b/${filePath}`,
              `new file mode 100644`,
              `--- /dev/null`,
              `+++ b/${filePath}`,
              `@@ -0,0 +1,${lines.length} @@`,
              ...lines.map(line => `+${line}`),
            ].join('\n');
          } catch {
            return '';
          }
        }
      }

      return diff;
    } catch (error) {
      console.error('[Diff Error]', error.message);
      return '';
    }
  }

  /**
   * Parse diff statistics from diff content
   * @param {string} diff - The diff content
   * @returns {{ additions: number, deletions: number }}
   */
  parseDiffStats(diff) {
    let additions = 0;
    let deletions = 0;

    for (const line of diff.split('\n')) {
      if (line.startsWith('+') && !line.startsWith('+++')) {
        additions++;
      } else if (line.startsWith('-') && !line.startsWith('---')) {
        deletions++;
      }
    }

    return { additions, deletions };
  }

  /**
   * Handle terminal spawn request
   */
  handleTerminalSpawn(session, message) {
    const { cols, rows, cwd } = message;

    // Validate cwd stays within project root
    let safeCwd = this.projectRoot;
    if (cwd) {
      const cwdResult = validatePath(cwd, this.projectRoot, { allowSymlinks: true });
      if (!cwdResult.ok) {
        session.send(createError('TERMINAL_ERROR', 'Working directory must be within project root'));
        return;
      }
      safeCwd = cwdResult.resolvedPath;
    }

    const terminalId = this.terminalManager.createTerminal(session, {
      cols: cols || 80,
      rows: rows || 24,
      cwd: safeCwd,
    });

    if (terminalId) {
      session.send({
        type: 'terminal_spawned',
        terminalId,
        timestamp: new Date().toISOString(),
      });
    } else {
      session.send(createError('TERMINAL_ERROR', 'Failed to spawn terminal'));
    }
  }

  /**
   * Handle terminal input
   */
  handleTerminalInput(session, message) {
    const { terminalId, data } = message;

    if (!terminalId || !data) {
      return;
    }

    this.terminalManager.writeToTerminal(terminalId, data);
  }

  /**
   * Handle terminal resize
   */
  handleTerminalResize(session, message) {
    const { terminalId, cols, rows } = message;

    if (!terminalId || !cols || !rows) {
      return;
    }

    this.terminalManager.resizeTerminal(terminalId, cols, rows);
  }

  /**
   * Handle terminal close
   */
  handleTerminalClose(session, message) {
    const { terminalId } = message;

    if (!terminalId) {
      return;
    }

    this.terminalManager.closeTerminal(terminalId);
    session.send(createNotification('info', 'Terminal', 'Terminal closed'));
  }

  // ==========================================================================
  // Automation Handlers
  // ==========================================================================

  /**
   * Send automation list to session
   */
  sendAutomationList(session) {
    if (!this._automationRegistry) {
      session.send(createAutomationList([]));
      return;
    }

    try {
      const automations = this._automationRegistry.list();

      // Enrich with running status and next run time
      const enriched = automations.map(automation => {
        const isRunning = this._runningAutomations.has(automation.id);
        const lastRun = this._automationRegistry.getRunHistory(automation.id, 1)[0];
        const nextRun = this._calculateNextRun(automation);

        return {
          ...automation,
          status: isRunning ? 'running' : automation.enabled ? 'idle' : 'disabled',
          lastRun: lastRun?.at,
          lastRunSuccess: lastRun?.success,
          nextRun,
        };
      });

      session.send(createAutomationList(enriched));
    } catch (error) {
      console.error('[Automations] List error:', error.message);
      session.send(createAutomationList([]));
    }
  }

  /**
   * Calculate next run time for an automation
   */
  _calculateNextRun(automation) {
    if (!automation.enabled || !automation.schedule) return null;

    const now = new Date();
    const schedule = automation.schedule;

    switch (schedule.type) {
      case 'on_session':
        return 'Every session';
      case 'daily': {
        // Next day at midnight (or specified hour)
        const nextDaily = new Date(now);
        nextDaily.setDate(nextDaily.getDate() + 1);
        nextDaily.setHours(schedule.hour || 0, 0, 0, 0);
        return nextDaily.toISOString();
      }
      case 'weekly': {
        // Next occurrence of the specified day
        const targetDay =
          typeof schedule.day === 'string'
            ? [
                'sunday',
                'monday',
                'tuesday',
                'wednesday',
                'thursday',
                'friday',
                'saturday',
              ].indexOf(schedule.day.toLowerCase())
            : schedule.day || 0;
        const nextWeekly = new Date(now);
        const daysUntil = (targetDay - now.getDay() + 7) % 7 || 7;
        nextWeekly.setDate(nextWeekly.getDate() + daysUntil);
        nextWeekly.setHours(schedule.hour || 0, 0, 0, 0);
        return nextWeekly.toISOString();
      }
      case 'monthly': {
        // Next occurrence of the specified date
        const nextMonthly = new Date(now);
        const targetDate = schedule.date || 1;
        if (now.getDate() >= targetDate) {
          nextMonthly.setMonth(nextMonthly.getMonth() + 1);
        }
        nextMonthly.setDate(targetDate);
        nextMonthly.setHours(schedule.hour || 0, 0, 0, 0);
        return nextMonthly.toISOString();
      }
      case 'interval': {
        const hours = schedule.hours || 24;
        return `Every ${hours} hour${hours > 1 ? 's' : ''}`;
      }
      default:
        return null;
    }
  }

  /**
   * Handle automation run request
   */
  async handleAutomationRun(session, message) {
    const { id: automationId } = message;

    if (!automationId) {
      session.send(createError('INVALID_REQUEST', 'Automation ID is required'));
      return;
    }

    if (!this._automationRunner) {
      session.send(createError('AUTOMATION_ERROR', 'Automation runner not initialized'));
      return;
    }

    try {
      // Check if already running
      if (this._runningAutomations.has(automationId)) {
        session.send(
          createNotification('warning', 'Automation', `${automationId} is already running`)
        );
        return;
      }

      session.send(createNotification('info', 'Automation', `Starting ${automationId}...`));

      // Run the automation (async)
      const result = await this._automationRunner.run(automationId);

      // Send result notification
      if (result.success) {
        session.send(
          createNotification('success', 'Automation', `${automationId} completed successfully`)
        );
      } else {
        session.send(
          createNotification('error', 'Automation', `${automationId} failed: ${result.error}`)
        );
      }

      // Send final status
      session.send(createAutomationStatus(automationId, result.success ? 'idle' : 'error', result));

      // Refresh the list
      this.sendAutomationList(session);
    } catch (error) {
      console.error('[Automation Error]', error.message);
      session.send(createError('AUTOMATION_ERROR', 'Automation execution failed'));
      session.send(createAutomationStatus(automationId, 'error', { error: 'Execution failed' }));
    }
  }

  /**
   * Handle automation stop request
   */
  handleAutomationStop(session, message) {
    const { id: automationId } = message;

    if (!automationId) {
      session.send(createError('INVALID_REQUEST', 'Automation ID is required'));
      return;
    }

    // Cancel via runner
    if (this._automationRunner) {
      this._automationRunner.cancelAll(); // TODO: Add single automation cancel
    }

    this._runningAutomations.delete(automationId);
    session.send(createAutomationStatus(automationId, 'idle'));
    session.send(createNotification('info', 'Automation', `${automationId} stopped`));
  }

  // ==========================================================================
  // Inbox Handlers
  // ==========================================================================

  /**
   * Send inbox list to session
   */
  sendInboxList(session) {
    const items = Array.from(this._inbox.values()).sort(
      (a, b) => new Date(b.timestamp) - new Date(a.timestamp)
    );

    session.send(createInboxList(items));
  }

  /**
   * Handle inbox action (accept, dismiss, mark read)
   */
  handleInboxAction(session, message) {
    const { id: itemId, action } = message;

    if (!itemId) {
      session.send(createError('INVALID_REQUEST', 'Item ID is required'));
      return;
    }

    const item = this._inbox.get(itemId);
    if (!item) {
      session.send(createError('NOT_FOUND', `Inbox item ${itemId} not found`));
      return;
    }

    switch (action) {
      case 'accept':
        // Mark as accepted and remove
        item.status = 'accepted';
        session.send(createNotification('success', 'Inbox', `Accepted: ${item.title}`));
        this._inbox.delete(itemId);
        break;

      case 'dismiss':
        // Mark as dismissed and remove
        item.status = 'dismissed';
        session.send(createNotification('info', 'Inbox', `Dismissed: ${item.title}`));
        this._inbox.delete(itemId);
        break;

      case 'read':
        // Mark as read
        item.status = 'read';
        break;

      default:
        session.send(createError('INVALID_ACTION', `Unknown action: ${action}`));
        return;
    }

    // Send updated inbox list
    this.sendInboxList(session);
  }

  /**
   * Cleanup expired sessions
   */
  _cleanupExpiredSessions() {
    for (const [sessionId, session] of this.sessions) {
      if (session.isExpired()) {
        console.log(`[Session ${sessionId}] Expired (idle > ${SESSION_TIMEOUT_MS / 3600000}h)`);
        this.closeSession(sessionId);
      }
    }
  }

  /**
   * Close a session
   */
  closeSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (session) {
      // Close all terminals for this session
      this.terminalManager.closeSessionTerminals(sessionId);

      if (session.ws) {
        session.ws.end();
      }
      this.sessions.delete(sessionId);
      console.log(`[Session ${sessionId}] Closed`);
      this.emit('session:closed', sessionId);
    }
  }

  /**
   * Get session by ID
   */
  getSession(sessionId) {
    return this.sessions.get(sessionId);
  }

  /**
   * Broadcast message to all sessions
   */
  broadcast(message) {
    for (const session of this.sessions.values()) {
      if (session.ws) {
        session.send(message);
      }
    }
  }

  /**
   * Stop the server
   */
  stop() {
    return new Promise(resolve => {
      // Clear cleanup interval
      if (this._cleanupInterval) {
        clearInterval(this._cleanupInterval);
        this._cleanupInterval = null;
      }

      // Close all sessions
      for (const session of this.sessions.values()) {
        if (session.ws) {
          session.ws.end();
        }
      }
      this.sessions.clear();

      // Close HTTP server
      if (this.httpServer) {
        this.httpServer.close(() => {
          console.log('[AgileFlow Dashboard Server] Stopped');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }
}

// ============================================================================
// WebSocket Frame Encoding/Decoding
// ============================================================================

/**
 * Encode a WebSocket frame
 * @param {string|Buffer} data - Data to encode
 * @param {number} [opcode=0x1] - Frame opcode (0x1 = text, 0x2 = binary)
 * @returns {Buffer}
 */
function encodeWebSocketFrame(data, opcode = 0x1) {
  const payload = Buffer.isBuffer(data) ? data : Buffer.from(data);
  const length = payload.length;

  let header;
  if (length < 126) {
    header = Buffer.alloc(2);
    header[0] = 0x80 | opcode; // FIN + opcode
    header[1] = length;
  } else if (length < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x80 | opcode;
    header[1] = 126;
    header.writeUInt16BE(length, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x80 | opcode;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(length), 2);
  }

  return Buffer.concat([header, payload]);
}

/**
 * Decode a WebSocket frame
 * @param {Buffer} buffer - Buffer containing frame data
 * @returns {{ opcode: number, payload: Buffer, totalLength: number } | null}
 */
function decodeWebSocketFrame(buffer) {
  if (buffer.length < 2) return null;

  const firstByte = buffer[0];
  const secondByte = buffer[1];

  const opcode = firstByte & 0x0f;
  const masked = (secondByte & 0x80) !== 0;
  let payloadLength = secondByte & 0x7f;

  let headerLength = 2;
  if (payloadLength === 126) {
    if (buffer.length < 4) return null;
    payloadLength = buffer.readUInt16BE(2);
    headerLength = 4;
  } else if (payloadLength === 127) {
    if (buffer.length < 10) return null;
    payloadLength = Number(buffer.readBigUInt64BE(2));
    headerLength = 10;
  }

  if (masked) headerLength += 4;

  const totalLength = headerLength + payloadLength;
  if (buffer.length < totalLength) return null;

  let payload = buffer.slice(headerLength, totalLength);

  // Unmask if needed
  if (masked) {
    const mask = buffer.slice(headerLength - 4, headerLength);
    payload = Buffer.alloc(payloadLength);
    for (let i = 0; i < payloadLength; i++) {
      payload[i] = buffer[headerLength + i] ^ mask[i % 4];
    }
  }

  return { opcode, payload, totalLength };
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a dashboard server instance
 * @param {Object} [options={}] - Server options
 * @param {number} [options.port=8765] - Port to listen on
 * @param {string} [options.host='0.0.0.0'] - Host to bind to
 * @param {string} [options.projectRoot] - Project root directory
 * @param {string} [options.apiKey] - API key for authentication
 * @param {boolean} [options.requireAuth=false] - Require API key
 * @returns {DashboardServer}
 */
function createDashboardServer(options = {}) {
  return new DashboardServer(options);
}

/**
 * Start a dashboard server
 * @param {DashboardServer} server - Server instance
 * @returns {Promise<{ url: string, wsUrl: string }>}
 */
async function startDashboardServer(server) {
  return server.start();
}

/**
 * Stop a dashboard server
 * @param {DashboardServer} server - Server instance
 * @returns {Promise<void>}
 */
async function stopDashboardServer(server) {
  return server.stop();
}

// ============================================================================
// Exports
// ============================================================================

module.exports = {
  DashboardServer,
  DashboardSession,
  TerminalInstance,
  TerminalManager,
  createDashboardServer,
  startDashboardServer,
  stopDashboardServer,
  DEFAULT_PORT,
  DEFAULT_HOST,
  SESSION_TIMEOUT_MS,
  SESSION_CLEANUP_INTERVAL_MS,
  RATE_LIMIT_TOKENS,
  SENSITIVE_ENV_PATTERNS,
  encodeWebSocketFrame,
  decodeWebSocketFrame,
};
