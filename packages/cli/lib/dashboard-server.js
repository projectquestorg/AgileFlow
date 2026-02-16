/* global URL */
/**
 * dashboard-server.js - WebSocket Server for AgileFlow Dashboard
 *
 * Coordinator module that delegates to focused domain modules:
 * - dashboard-websocket.js  - WebSocket frame encode/decode
 * - dashboard-session.js    - Session lifecycle and rate limiting
 * - dashboard-terminal.js   - Terminal management (PTY/fallback)
 * - dashboard-git.js        - Git operations (status, diff, actions)
 * - dashboard-automations.js - Automation scheduling
 * - dashboard-status.js     - Project status and team metrics
 * - dashboard-inbox.js      - Inbox management
 *
 * Usage:
 *   const { createDashboardServer, startDashboardServer } = require('./dashboard-server');
 *
 *   const server = createDashboardServer({ port: 8765 });
 *   await startDashboardServer(server);
 */

'use strict';

const { EventEmitter } = require('events');

// Import extracted modules
const { encodeWebSocketFrame, decodeWebSocketFrame } = require('./dashboard-websocket');
const {
  DashboardSession,
  SESSION_TIMEOUT_MS,
  SESSION_CLEANUP_INTERVAL_MS,
  RATE_LIMIT_TOKENS,
} = require('./dashboard-session');
const {
  TerminalInstance,
  TerminalManager,
  SENSITIVE_ENV_PATTERNS,
} = require('./dashboard-terminal');
const { getGitStatus, getFileDiff, parseDiffStats, handleGitAction } = require('./dashboard-git');
const {
  calculateNextRun,
  createInboxItem,
  enrichAutomationList,
} = require('./dashboard-automations');
const { buildStatusSummary, readTeamMetrics } = require('./dashboard-status');
const { getSortedInboxItems, handleInboxAction } = require('./dashboard-inbox');

// Lazy-loaded dependencies - deferred until first use
let _http, _crypto, _protocol, _paths, _validatePaths, _childProcess;

function getHttp() {
  if (!_http) _http = require('http');
  return _http;
}
function getCrypto() {
  if (!_crypto) _crypto = require('crypto');
  return _crypto;
}
function getProtocol() {
  if (!_protocol) _protocol = require('./dashboard-protocol');
  return _protocol;
}
function getPaths() {
  if (!_paths) _paths = require('./paths');
  return _paths;
}
function getValidatePaths() {
  if (!_validatePaths) _validatePaths = require('./validate-paths');
  return _validatePaths;
}
function getChildProcess() {
  if (!_childProcess) _childProcess = require('child_process');
  return _childProcess;
}

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

// WebSocket magic GUID for handshake
const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

/**
 * Dashboard WebSocket Server
 */
class DashboardServer extends EventEmitter {
  constructor(options = {}) {
    super();

    this.port = options.port || DEFAULT_PORT;
    this.host = options.host || DEFAULT_HOST;
    this.projectRoot = options.projectRoot || getPaths().getProjectRoot();

    // Auth is on by default - auto-generate key if not provided
    // Set requireAuth: false explicitly to disable
    this.requireAuth = options.requireAuth !== false;
    this.apiKey =
      options.apiKey || (this.requireAuth ? getCrypto().randomBytes(32).toString('hex') : null);

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
    if (!getPaths().isAgileflowProject(this.projectRoot)) {
      throw new Error(`Not an AgileFlow project: ${this.projectRoot}`);
    }

    // Initialize automation registry lazily
    this._initAutomations();

    // Listen for team metrics saves to broadcast to clients
    this._initTeamMetricsListener();
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
        this.broadcast(getProtocol().createAutomationStatus(automationId, 'running'));
      });

      this._automationRunner.on('completed', ({ automationId, result }) => {
        this._runningAutomations.delete(automationId);
        this.broadcast(getProtocol().createAutomationStatus(automationId, 'completed', result));

        // Add result to inbox if it has output or changes
        if (result.output || result.changes) {
          this._addToInbox(automationId, result);
        }
      });

      this._automationRunner.on('failed', ({ automationId, result }) => {
        this._runningAutomations.delete(automationId);
        this.broadcast(
          getProtocol().createAutomationStatus(automationId, 'error', { error: result.error })
        );

        // Add failure to inbox
        this._addToInbox(automationId, result);
      });
    } catch (error) {
      console.error('[DashboardServer] Failed to init automations:', error.message);
    }
  }

  /**
   * Add an automation result to the inbox
   */
  _addToInbox(automationId, result) {
    const automation = this._automationRegistry?.get(automationId);
    const item = createInboxItem(automationId, result, automation?.name);
    this._inbox.set(item.id, item);
    this.broadcast(getProtocol().createInboxItem(item));
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

      this.httpServer = getHttp().createServer((req, res) => {
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
      if (
        keyBuffer.length !== providedBuffer.length ||
        !getCrypto().timingSafeEqual(keyBuffer, providedBuffer)
      ) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }
    }

    // Check WebSocket origin against localhost allowlist
    const origin = req.headers.origin;
    if (origin) {
      const LOCALHOST_ORIGINS = [
        'http://localhost',
        'https://localhost',
        'http://127.0.0.1',
        'https://127.0.0.1',
        'http://[::1]',
        'https://[::1]',
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
    const acceptKey = getCrypto()
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
    return getCrypto().randomBytes(16).toString('hex');
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
      // Clean up old socket before replacing
      if (session.ws && session.ws !== socket) {
        session.ws.removeAllListeners();
        session.ws.destroy();
      }
      session.ws = socket;
    }

    console.log(`[Session ${sessionId}] ${isResume ? 'Resumed' : 'Connected'}`);

    // Send initial state
    session.send(
      getProtocol().createSessionState(sessionId, 'connected', {
        resumed: isResume,
        messageCount: session.messages.length,
        project: require('path').basename(this.projectRoot),
      })
    );

    // Send initial git status
    this.sendGitStatus(session);

    // Send project status (stories/epics)
    this.sendStatusUpdate(session);

    // Send team metrics
    this.sendTeamMetrics(session);

    // Send session list with sync info
    this.sendSessionList(session);

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
      session.send(
        getProtocol().createError('RATE_LIMITED', 'Too many messages, please slow down')
      );
      return;
    }

    const message = getProtocol().parseInboundMessage(data);
    if (!message) {
      session.send(getProtocol().createError('INVALID_MESSAGE', 'Failed to parse message'));
      return;
    }

    console.log(`[Session ${session.id}] Received: ${message.type}`);

    switch (message.type) {
      case getProtocol().InboundMessageType.MESSAGE:
        this.handleUserMessage(session, message);
        break;

      case getProtocol().InboundMessageType.CANCEL:
        this.handleCancel(session);
        break;

      case getProtocol().InboundMessageType.REFRESH:
        this.handleRefresh(session, message);
        break;

      case getProtocol().InboundMessageType.GIT_STAGE:
      case getProtocol().InboundMessageType.GIT_UNSTAGE:
      case getProtocol().InboundMessageType.GIT_REVERT:
      case getProtocol().InboundMessageType.GIT_COMMIT:
        this.handleGitAction(session, message);
        break;

      case getProtocol().InboundMessageType.GIT_DIFF_REQUEST:
        this.handleDiffRequest(session, message);
        break;

      case getProtocol().InboundMessageType.SESSION_CLOSE:
        this.closeSession(session.id);
        break;

      case getProtocol().InboundMessageType.TERMINAL_SPAWN:
        this.handleTerminalSpawn(session, message);
        break;

      case getProtocol().InboundMessageType.TERMINAL_INPUT:
        this.handleTerminalInput(session, message);
        break;

      case getProtocol().InboundMessageType.TERMINAL_RESIZE:
        this.handleTerminalResize(session, message);
        break;

      case getProtocol().InboundMessageType.TERMINAL_CLOSE:
        this.handleTerminalClose(session, message);
        break;

      case getProtocol().InboundMessageType.AUTOMATION_LIST_REQUEST:
        this.sendAutomationList(session);
        break;

      case getProtocol().InboundMessageType.AUTOMATION_RUN:
        this.handleAutomationRun(session, message);
        break;

      case getProtocol().InboundMessageType.AUTOMATION_STOP:
        this.handleAutomationStop(session, message);
        break;

      case getProtocol().InboundMessageType.INBOX_LIST_REQUEST:
        this.sendInboxList(session);
        break;

      case getProtocol().InboundMessageType.INBOX_ACTION:
        this.handleInboxAction(session, message);
        break;

      case getProtocol().InboundMessageType.OPEN_FILE:
        this.handleOpenFile(session, message);
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
      session.send(getProtocol().createError('EMPTY_MESSAGE', 'Message content is empty'));
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
    session.send(getProtocol().createNotification('info', 'Cancelled', 'Operation cancelled'));
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
        this.sendStatusUpdate(session);
        this.emit('refresh:status', session);
        break;
      case 'sessions':
        this.sendSessionList(session);
        break;
      case 'automations':
        this.sendAutomationList(session);
        break;
      case 'inbox':
        this.sendInboxList(session);
        break;
      case 'team_metrics':
        this.sendTeamMetrics(session);
        break;
      default:
        this.sendGitStatus(session);
        this.sendStatusUpdate(session);
        this.sendTeamMetrics(session);
        this.sendSessionList(session);
        this.sendAutomationList(session);
        this.sendInboxList(session);
        this.emit('refresh:all', session);
    }
  }

  // ==========================================================================
  // Git Handlers (delegating to dashboard-git.js)
  // ==========================================================================

  /**
   * Handle git actions
   */
  handleGitAction(session, message) {
    const { type, files, message: commitMessage } = message;

    try {
      handleGitAction(type, this.projectRoot, { files, commitMessage }, getProtocol());

      // Send updated git status
      this.sendGitStatus(session);
      session.send(
        getProtocol().createNotification('success', 'Git', `${type.replace('git_', '')} completed`)
      );
    } catch (error) {
      console.error('[Git Error]', error.message);
      session.send(getProtocol().createError('GIT_ERROR', error.message || 'Git operation failed'));
    }
  }

  /**
   * Send git status to session
   */
  sendGitStatus(session) {
    try {
      const status = getGitStatus(this.projectRoot);
      session.send({
        type: getProtocol().OutboundMessageType.GIT_STATUS,
        ...status,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('[Git Status Error]', error.message);
    }
  }

  /**
   * Handle diff request for a file
   */
  handleDiffRequest(session, message) {
    const { path: filePath, staged } = message;

    if (!filePath) {
      session.send(getProtocol().createError('INVALID_REQUEST', 'File path is required'));
      return;
    }

    try {
      const diff = getFileDiff(filePath, this.projectRoot, staged);
      const stats = parseDiffStats(diff);

      session.send(
        getProtocol().createGitDiff(filePath, diff, {
          additions: stats.additions,
          deletions: stats.deletions,
          staged: !!staged,
        })
      );
    } catch (error) {
      console.error('[Diff Error]', error.message);
      session.send(getProtocol().createError('DIFF_ERROR', 'Failed to get diff'));
    }
  }

  // ==========================================================================
  // Status/Metrics Handlers (delegating to dashboard-status.js)
  // ==========================================================================

  /**
   * Send project status update (stories/epics summary) to session
   */
  sendStatusUpdate(session) {
    try {
      const summary = buildStatusSummary(this.projectRoot);
      if (summary) {
        session.send(getProtocol().createStatusUpdate(summary));
      }
    } catch (error) {
      console.error('[Status Update Error]', error.message);
    }
  }

  /**
   * Initialize listener for team metrics events
   */
  _initTeamMetricsListener() {
    try {
      const { teamMetricsEmitter } = require('../scripts/lib/team-events');
      this._teamMetricsListener = () => {
        this.broadcastTeamMetrics();
      };
      teamMetricsEmitter.on('metrics_saved', this._teamMetricsListener);
    } catch (e) {
      // team-events not available - non-critical
    }
  }

  /**
   * Send team metrics to a single session
   */
  sendTeamMetrics(session) {
    const traces = readTeamMetrics(this.projectRoot);
    for (const [traceId, metrics] of Object.entries(traces)) {
      session.send(getProtocol().createTeamMetrics(traceId, metrics));
    }
  }

  /**
   * Broadcast team metrics to all connected clients
   */
  broadcastTeamMetrics() {
    const traces = readTeamMetrics(this.projectRoot);
    for (const [traceId, metrics] of Object.entries(traces)) {
      this.broadcast(getProtocol().createTeamMetrics(traceId, metrics));
    }
  }

  /**
   * Send session list with sync status to dashboard
   */
  sendSessionList(session) {
    const sessions = [];

    for (const [id, s] of this.sessions) {
      const entry = {
        id,
        name: s.metadata.name || id,
        type: s.metadata.type || 'local',
        status: s.state === 'connected' ? 'active' : s.state === 'disconnected' ? 'idle' : s.state,
        branch: null,
        messageCount: s.messages.length,
        lastActivity: s.lastActivity.toISOString(),
        syncStatus: 'offline',
        ahead: 0,
        behind: 0,
      };

      // Get branch and sync status via git
      try {
        const cwd = s.metadata.worktreePath || this.projectRoot;
        entry.branch = getChildProcess()
          .execFileSync('git', ['branch', '--show-current'], {
            cwd,
            encoding: 'utf8',
            stdio: ['pipe', 'pipe', 'pipe'],
          })
          .trim();

        // Get ahead/behind counts relative to upstream
        try {
          const counts = getChildProcess()
            .execFileSync('git', ['rev-list', '--left-right', '--count', 'HEAD...@{u}'], {
              cwd,
              encoding: 'utf8',
              stdio: ['pipe', 'pipe', 'pipe'],
            })
            .trim();
          const [ahead, behind] = counts.split(/\s+/).map(Number);
          entry.ahead = ahead || 0;
          entry.behind = behind || 0;

          if (ahead > 0 && behind > 0) {
            entry.syncStatus = 'diverged';
          } else if (ahead > 0) {
            entry.syncStatus = 'ahead';
          } else if (behind > 0) {
            entry.syncStatus = 'behind';
          } else {
            entry.syncStatus = 'synced';
          }
        } catch {
          // No upstream configured
          entry.syncStatus = 'synced';
        }
      } catch {
        entry.syncStatus = 'offline';
      }

      sessions.push(entry);
    }

    session.send(getProtocol().createSessionList(sessions));
  }

  /**
   * Handle open file in editor request
   */
  handleOpenFile(session, message) {
    const { path: filePath, line } = message;

    if (!filePath || typeof filePath !== 'string') {
      session.send(getProtocol().createError('INVALID_REQUEST', 'File path is required'));
      return;
    }

    // Validate the path stays within project root
    const pathResult = getValidatePaths().validatePath(filePath, this.projectRoot, {
      allowSymlinks: true,
    });
    if (!pathResult.ok) {
      session.send(getProtocol().createError('OPEN_FILE_ERROR', 'File path outside project'));
      return;
    }

    const fullPath = pathResult.resolvedPath;

    // Detect editor from environment
    const editor = process.env.VISUAL || process.env.EDITOR || 'code';
    const editorBase = require('path').basename(editor).toLowerCase();

    try {
      const lineNum = Number.isFinite(line) && line > 0 ? line : null;

      switch (editorBase) {
        case 'code':
        case 'cursor':
        case 'windsurf': {
          const gotoArg = lineNum ? `${fullPath}:${lineNum}` : fullPath;
          getChildProcess()
            .spawn(editor, ['--goto', gotoArg], { detached: true, stdio: 'ignore' })
            .unref();
          break;
        }
        case 'subl':
        case 'sublime_text': {
          const sublArg = lineNum ? `${fullPath}:${lineNum}` : fullPath;
          getChildProcess().spawn(editor, [sublArg], { detached: true, stdio: 'ignore' }).unref();
          break;
        }
        default: {
          // Generic: just open the file
          getChildProcess().spawn(editor, [fullPath], { detached: true, stdio: 'ignore' }).unref();
          break;
        }
      }

      session.send(
        getProtocol().createNotification(
          'info',
          'Editor',
          `Opened ${require('path').basename(fullPath)}`
        )
      );
    } catch (error) {
      console.error('[Open File Error]', error.message);
      session.send(
        getProtocol().createError('OPEN_FILE_ERROR', `Failed to open file: ${error.message}`)
      );
    }
  }

  // ==========================================================================
  // Terminal Handlers (delegating to dashboard-terminal.js)
  // ==========================================================================

  /**
   * Handle terminal spawn request
   */
  handleTerminalSpawn(session, message) {
    const { cols, rows, cwd } = message;

    // Validate cwd stays within project root
    let safeCwd = this.projectRoot;
    if (cwd) {
      const cwdResult = getValidatePaths().validatePath(cwd, this.projectRoot, {
        allowSymlinks: true,
      });
      if (!cwdResult.ok) {
        session.send(
          getProtocol().createError(
            'TERMINAL_ERROR',
            'Working directory must be within project root'
          )
        );
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
      session.send(getProtocol().createError('TERMINAL_ERROR', 'Failed to spawn terminal'));
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
    session.send(getProtocol().createNotification('info', 'Terminal', 'Terminal closed'));
  }

  // ==========================================================================
  // Automation Handlers (delegating to dashboard-automations.js)
  // ==========================================================================

  /**
   * Send automation list to session
   */
  sendAutomationList(session) {
    if (!this._automationRegistry) {
      session.send(getProtocol().createAutomationList([]));
      return;
    }

    try {
      const automations = this._automationRegistry.list() || [];
      const enriched = enrichAutomationList(
        automations,
        this._runningAutomations,
        this._automationRegistry
      );
      session.send(getProtocol().createAutomationList(enriched));
    } catch (error) {
      console.error('[Automations] List error:', error.message);
      session.send(getProtocol().createAutomationList([]));
    }
  }

  /**
   * Handle automation run request
   */
  async handleAutomationRun(session, message) {
    const { id: automationId } = message;

    if (!automationId) {
      session.send(getProtocol().createError('INVALID_REQUEST', 'Automation ID is required'));
      return;
    }

    if (!this._automationRunner) {
      session.send(
        getProtocol().createError('AUTOMATION_ERROR', 'Automation runner not initialized')
      );
      return;
    }

    try {
      // Check if already running
      if (this._runningAutomations.has(automationId)) {
        session.send(
          getProtocol().createNotification(
            'warning',
            'Automation',
            `${automationId} is already running`
          )
        );
        return;
      }

      // Mark as running BEFORE the async call to prevent duplicate execution
      this._runningAutomations.set(automationId, { startTime: Date.now() });

      session.send(
        getProtocol().createNotification('info', 'Automation', `Starting ${automationId}...`)
      );

      // Run the automation (async)
      const result = await this._automationRunner.run(automationId);

      // Send result notification
      if (result.success) {
        session.send(
          getProtocol().createNotification(
            'success',
            'Automation',
            `${automationId} completed successfully`
          )
        );
      } else {
        session.send(
          getProtocol().createNotification(
            'error',
            'Automation',
            `${automationId} failed: ${result.error}`
          )
        );
      }

      // Send final status
      session.send(
        getProtocol().createAutomationStatus(
          automationId,
          result.success ? 'idle' : 'error',
          result
        )
      );

      // Refresh the list
      this.sendAutomationList(session);
    } catch (error) {
      console.error('[Automation Error]', error.message);
      session.send(getProtocol().createError('AUTOMATION_ERROR', 'Automation execution failed'));
      session.send(
        getProtocol().createAutomationStatus(automationId, 'error', { error: 'Execution failed' })
      );
    }
  }

  /**
   * Handle automation stop request
   */
  handleAutomationStop(session, message) {
    const { id: automationId } = message;

    if (!automationId) {
      session.send(getProtocol().createError('INVALID_REQUEST', 'Automation ID is required'));
      return;
    }

    // Cancel via runner
    if (this._automationRunner) {
      this._automationRunner.cancelAll(); // TODO: Add single automation cancel
    }

    this._runningAutomations.delete(automationId);
    session.send(getProtocol().createAutomationStatus(automationId, 'idle'));
    session.send(getProtocol().createNotification('info', 'Automation', `${automationId} stopped`));
  }

  // ==========================================================================
  // Inbox Handlers (delegating to dashboard-inbox.js)
  // ==========================================================================

  /**
   * Send inbox list to session
   */
  sendInboxList(session) {
    const items = getSortedInboxItems(this._inbox);
    session.send(getProtocol().createInboxList(items));
  }

  /**
   * Handle inbox action (accept, dismiss, mark read)
   */
  handleInboxAction(session, message) {
    const { id: itemId, action } = message;

    if (!itemId) {
      session.send(getProtocol().createError('INVALID_REQUEST', 'Item ID is required'));
      return;
    }

    const result = handleInboxAction(this._inbox, itemId, action);

    if (!result.success) {
      const errorCode = result.error.includes('not found') ? 'NOT_FOUND' : 'INVALID_ACTION';
      session.send(getProtocol().createError(errorCode, result.error));
      return;
    }

    if (result.notification) {
      session.send(
        getProtocol().createNotification(
          result.notification.level,
          'Inbox',
          result.notification.message
        )
      );
    }

    // Send updated inbox list
    this.sendInboxList(session);
  }

  // ==========================================================================
  // Session Lifecycle
  // ==========================================================================

  /**
   * Cleanup expired sessions
   */
  _cleanupExpiredSessions() {
    // Collect expired IDs first to avoid mutating Map during iteration
    const expiredIds = [];
    for (const [sessionId, session] of this.sessions) {
      if (session.isExpired()) {
        expiredIds.push(sessionId);
      }
    }
    for (const sessionId of expiredIds) {
      console.log(`[Session ${sessionId}] Expired (idle > ${SESSION_TIMEOUT_MS / 3600000}h)`);
      this.closeSession(sessionId);
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
      // Remove team metrics listener to prevent leak
      if (this._teamMetricsListener) {
        try {
          const { teamMetricsEmitter } = require('../scripts/lib/team-events');
          teamMetricsEmitter.removeListener('metrics_saved', this._teamMetricsListener);
        } catch (e) {
          // Ignore if module not available
        }
        this._teamMetricsListener = null;
      }

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
// Exports (backward-compatible - re-exports from extracted modules)
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
