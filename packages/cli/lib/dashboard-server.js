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
  parseInboundMessage,
  serializeMessage,
} = require('./dashboard-protocol');
const { getProjectRoot, isAgileflowProject } = require('./paths');
const { execSync } = require('child_process');

// Default configuration
const DEFAULT_PORT = 8765;
const DEFAULT_HOST = '0.0.0.0'; // Allow external connections (for tunnels)

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
    this.metadata = {};
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
    this.send(createSessionState(this.id, state, {
      messageCount: this.messages.length,
      lastActivity: this.lastActivity.toISOString(),
    }));
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
    this.apiKey = options.apiKey || null;
    this.requireAuth = options.requireAuth || false;

    // Session management
    this.sessions = new Map();

    // HTTP server for WebSocket upgrade
    this.httpServer = null;

    // Validate project
    if (!isAgileflowProject(this.projectRoot)) {
      throw new Error(`Not an AgileFlow project: ${this.projectRoot}`);
    }
  }

  /**
   * Start the WebSocket server
   * @returns {Promise<{ url: string, wsUrl: string }>}
   */
  start() {
    return new Promise((resolve, reject) => {
      this.httpServer = http.createServer((req, res) => {
        // Simple health check endpoint
        if (req.url === '/health') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            status: 'ok',
            sessions: this.sessions.size,
            project: require('path').basename(this.projectRoot),
          }));
          return;
        }

        // Info endpoint
        if (req.url === '/') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            name: 'AgileFlow Dashboard Server',
            version: '1.0.0',
            ws: `ws://${this.host === '0.0.0.0' ? 'localhost' : this.host}:${this.port}`,
            sessions: this.sessions.size,
          }));
          return;
        }

        res.writeHead(404);
        res.end();
      });

      // Handle WebSocket upgrade
      this.httpServer.on('upgrade', (req, socket, head) => {
        this.handleUpgrade(req, socket, head);
      });

      this.httpServer.on('error', (err) => {
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
        console.log(`  Auth:      ${this.requireAuth ? 'Required' : 'Not required'}\n`);

        resolve({ url, wsUrl });
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
      const providedKey = authHeader?.replace('Bearer ', '');

      if (providedKey !== this.apiKey) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
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
    session.send(createSessionState(sessionId, 'connected', {
      resumed: isResume,
      messageCount: session.messages.length,
      project: require('path').basename(this.projectRoot),
    }));

    // Send initial git status
    this.sendGitStatus(session);

    // Handle incoming messages
    let buffer = Buffer.alloc(0);

    socket.on('data', (data) => {
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
          socket.write(encodeWebSocketFrame('', 0x0A));
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

    socket.on('error', (err) => {
      console.error(`[Session ${sessionId}] Socket error:`, err.message);
    });

    this.emit('session:connected', sessionId, session);
  }

  /**
   * Handle incoming message from dashboard
   */
  handleMessage(session, data) {
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
      default:
        this.sendGitStatus(session);
        this.emit('refresh:all', session);
    }
  }

  /**
   * Handle git actions
   */
  handleGitAction(session, message) {
    const { type, files, message: commitMessage } = message;

    // Properly quote file paths for shell execution
    const quotedFiles = files && files.length > 0
      ? files.map(f => `"${f.replace(/"/g, '\\"')}"`).join(' ')
      : null;

    try {
      switch (type) {
        case InboundMessageType.GIT_STAGE:
          if (quotedFiles) {
            execSync(`git add ${quotedFiles}`, { cwd: this.projectRoot });
          } else {
            execSync('git add -A', { cwd: this.projectRoot });
          }
          break;
        case InboundMessageType.GIT_UNSTAGE:
          if (quotedFiles) {
            execSync(`git restore --staged ${quotedFiles}`, { cwd: this.projectRoot });
          } else {
            execSync('git restore --staged .', { cwd: this.projectRoot });
          }
          break;
        case InboundMessageType.GIT_REVERT:
          if (quotedFiles) {
            execSync(`git checkout -- ${quotedFiles}`, { cwd: this.projectRoot });
          }
          break;
        case InboundMessageType.GIT_COMMIT:
          if (commitMessage) {
            // Use heredoc-style for commit message to handle special characters
            const escapedMsg = commitMessage.replace(/'/g, "'\\''");
            execSync(`git commit -m '${escapedMsg}'`, { cwd: this.projectRoot });
          }
          break;
      }

      // Send updated git status
      this.sendGitStatus(session);
      session.send(createNotification('success', 'Git', `${type.replace('git_', '')} completed`));
    } catch (error) {
      session.send(createError('GIT_ERROR', error.message));
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
      const branch = execSync('git branch --show-current', {
        cwd: this.projectRoot,
        encoding: 'utf8',
      }).trim();

      const statusOutput = execSync('git status --porcelain', {
        cwd: this.projectRoot,
        encoding: 'utf8',
      });

      const staged = [];
      const unstaged = [];

      for (const line of statusOutput.split('\n').filter(Boolean)) {
        const indexStatus = line[0];
        const workTreeStatus = line[1];
        const file = line.slice(3);

        // Parse the status character to a descriptive status
        const parseStatus = (char) => {
          switch (char) {
            case 'A': return 'added';
            case 'M': return 'modified';
            case 'D': return 'deleted';
            case 'R': return 'renamed';
            case 'C': return 'copied';
            case '?': return 'untracked';
            default: return 'modified';
          }
        };

        if (indexStatus !== ' ' && indexStatus !== '?') {
          staged.push({ path: file, file, status: parseStatus(indexStatus) });
        }
        if (workTreeStatus !== ' ') {
          unstaged.push({
            path: file,
            file,
            status: workTreeStatus === '?' ? 'untracked' : parseStatus(workTreeStatus)
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

      session.send(createGitDiff(filePath, diff, {
        additions: stats.additions,
        deletions: stats.deletions,
        staged: !!staged,
      }));
    } catch (error) {
      session.send(createError('DIFF_ERROR', error.message));
    }
  }

  /**
   * Get diff for a specific file
   * @param {string} filePath - Path to the file
   * @param {boolean} staged - Whether to get staged diff
   * @returns {string} - The diff content
   */
  getFileDiff(filePath, staged = false) {
    try {
      const cmd = staged
        ? `git diff --cached -- "${filePath}"`
        : `git diff -- "${filePath}"`;

      const diff = execSync(cmd, {
        cwd: this.projectRoot,
        encoding: 'utf8',
      });

      // If no diff, file might be untracked - show entire file content as addition
      if (!diff && !staged) {
        const statusOutput = execSync(`git status --porcelain -- "${filePath}"`, {
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
              ...lines.map(line => `+${line}`)
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
   * Close a session
   */
  closeSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (session) {
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
    return new Promise((resolve) => {
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

  const opcode = firstByte & 0x0F;
  const masked = (secondByte & 0x80) !== 0;
  let payloadLength = secondByte & 0x7F;

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
  createDashboardServer,
  startDashboardServer,
  stopDashboardServer,
  DEFAULT_PORT,
  DEFAULT_HOST,
  encodeWebSocketFrame,
  decodeWebSocketFrame,
};
