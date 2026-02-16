'use strict';

/**
 * dashboard-terminal.js - Terminal Management
 *
 * Handles PTY-based terminal instances and manages multiple
 * terminals per session. Supports node-pty with basic spawn fallback.
 * Extracted from dashboard-server.js for testability.
 */

// Lazy-loaded dependencies
let _childProcess, _crypto, _protocol;

function getChildProcess() {
  if (!_childProcess) _childProcess = require('child_process');
  return _childProcess;
}
function getCrypto() {
  if (!_crypto) _crypto = require('crypto');
  return _crypto;
}
function getProtocol() {
  if (!_protocol) _protocol = require('./dashboard-protocol');
  return _protocol;
}

// Sensitive env var patterns to strip from terminal spawn
const SENSITIVE_ENV_PATTERNS = /SECRET|TOKEN|PASSWORD|CREDENTIAL|API_KEY|PRIVATE_KEY|AUTH/i;

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

  /**
   * Start the terminal process
   */
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
          this.session.send(getProtocol().createTerminalOutput(this.id, data));
        }
      });

      this.pty.onExit(({ exitCode }) => {
        this.closed = true;
        this.session.send(getProtocol().createTerminalExit(this.id, exitCode));
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
      this.pty = getChildProcess().spawn(this.shell, ['-i'], {
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
          this.session.send(getProtocol().createTerminalOutput(this.id, data.toString()));
        }
      });

      this.pty.stderr.on('data', data => {
        if (!this.closed) {
          this.session.send(getProtocol().createTerminalOutput(this.id, data.toString()));
        }
      });

      this.pty.on('close', exitCode => {
        this.closed = true;
        this.session.send(getProtocol().createTerminalExit(this.id, exitCode));
      });

      this.pty.on('error', error => {
        console.error('[Terminal] Shell error:', error.message);
        if (!this.closed) {
          this.session.send(
            getProtocol().createTerminalOutput(this.id, `\r\nError: ${error.message}\r\n`)
          );
        }
      });

      // Send welcome message
      setTimeout(() => {
        if (!this.closed) {
          const welcomeMsg = `\x1b[32mAgileFlow Terminal\x1b[0m (basic mode - node-pty not available)\r\n`;
          const cwdMsg = `Working directory: ${this.cwd}\r\n\r\n`;
          this.session.send(getProtocol().createTerminalOutput(this.id, welcomeMsg + cwdMsg));
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
        this.session.send(getProtocol().createTerminalOutput(this.id, echoData));

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
    const terminalId = options.id || getCrypto().randomBytes(8).toString('hex');
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
    // Collect IDs first to avoid mutating Map during iteration
    const toClose = [];
    for (const [terminalId, terminal] of this.terminals) {
      if (terminal.session.id === sessionId) {
        toClose.push(terminalId);
      }
    }
    for (const terminalId of toClose) {
      const terminal = this.terminals.get(terminalId);
      if (terminal) {
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

module.exports = {
  TerminalInstance,
  TerminalManager,
  SENSITIVE_ENV_PATTERNS,
};
